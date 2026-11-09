"use strict";
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {spawn}=require("child_process");
const {app}=require("electron");
const {loadHistory}=require("../history/history.store");
const {EventEmitter}=require("events");
const STORE="signature-validation-v2.json";
let rescanRequested = false;
let activeScan=null;
const events=new EventEmitter();
function onChange(listener){events.on("change",listener);return ()=>events.off("change",listener);}
function notify(change){events.emit("change",change);}
function fileStore(){return path.join(app.getPath("userData"),STORE);}
async function readStore() {
  try {
    const data = JSON.parse(await fs.promises.readFile(fileStore(), "utf8"));
    if (!data || !data.records || typeof data.records !== "object" || Array.isArray(data.records))
      throw new Error("Registro de firmas no válido");
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 2, records: {} };
    throw error;
  }
}
async function saveStore(data){
  const dest=fileStore(),tmp=dest+"."+process.pid+".tmp";
  await fs.promises.mkdir(path.dirname(dest),{recursive:true});
  try{
    await fs.promises.writeFile(tmp,JSON.stringify(data,null,2));
    await fs.promises.rename(tmp,dest);
  }finally{await fs.promises.rm(tmp,{force:true}).catch(()=>{});}
}
function hashFile(file){return new Promise((resolve,reject)=>{const hash=crypto.createHash("sha256");const stream=fs.createReadStream(file);stream.on("data",d=>hash.update(d));stream.on("error",reject);stream.on("end",()=>resolve(hash.digest("hex")));});}
function validate(file){return new Promise(resolve=>{
 // Permite utilizar un validador de prueba multiplataforma sin depender de NODE_OPTIONS.
 const script=process.env.AUDIT_VALIDATOR_SCRIPT||path.join(__dirname,"validate_pdf.py");
 const python=process.env.AUDIT_PYTHON||(process.platform==="win32"?"python":"python3");
 const child=spawn(python,[script,file],{windowsHide:true});
 let output="",stderr="",settled=false;
 function finish(value){if(settled)return;settled=true;clearTimeout(timer);resolve(value);}
 const timer=setTimeout(()=>{child.kill();finish({status:"unverifiable",reason:"Tiempo de validación agotado"});},45000);
 child.stdout.on("data",d=>{output+=d.toString();if(output.length>250000){child.kill();finish({status:"unverifiable",reason:"Salida del validador demasiado grande"});}});
 child.stderr.on("data",d=>{stderr=(stderr+d.toString()).slice(-2000);});
 child.on("error",e=>finish({status:"unverifiable",reason:e.message}));
 child.on("close",()=>{try{const data=JSON.parse(output);finish(data&&typeof data.status==="string"?data:{status:"unverifiable",reason:"Respuesta inesperada"});}catch(_){finish({status:"unverifiable",reason:stderr||"Validador no disponible"});}});
});}
async function performScan() {
  const history = await loadHistory();
  const store = await readStore();
  const stats = { scanned: 0, reused: 0, errors: 0, partial: false };
  const errors = [];
  const current = new Set();
  const allScans=[history.ugpaResult,history.utetResult];
  const total=allScans.reduce((sum,scan)=>sum+(
    scan&&scan.ok?(scan.files||[]).filter(entry=>/\.pdf$/i.test(entry.name)).length:0
  ),0);
  let processed=0;
  for (const scope of ["UGPA", "UTET"]) {
    const scan = scope === "UGPA" ? history.ugpaResult : history.utetResult;
    if (!scan || !scan.ok) continue;
    try {
      if (!(await fs.promises.stat(scan.rootPath)).isDirectory()) throw new Error("Carpeta no disponible");
    } catch (error) {
      errors.push(scope + ": " + error.message);
      continue;
    }
    for (const entry of scan.files || []) {
      if (!/\.pdf$/i.test(entry.name)) continue;
      const file = entry.path;
      const key = scope + "|" + file;
      try {
        const stat = await fs.promises.stat(file);
        const hash = await hashFile(file);
        const previous = store.records[key];
        // Certificate trust can change even when the signed bytes remain identical.
        if (previous && previous.sha256 === hash && previous.status === "no-electronic-signature" &&
            previous.cover?.version === 1 && !previous.cover.retry) {
          stats.reused++;
        } else {
          const result = await validate(file);
          store.records[key] = { scope, path: file, name: entry.name, size: stat.size,
            mtimeMs: stat.mtimeMs, sha256: hash, checkedAt: new Date().toISOString(), ...result };
          stats.scanned++;
          if (result.cover?.retry) errors.push(file + ": " + result.cover.reason);
          if (result.status === "unverifiable") errors.push(file + ": " + (result.reason || "Firma no verificable"));
        }
        current.add(key);
        delete store.records[key].stale;
      } catch (error) {
        errors.push(file + ": " + error.message);
      } finally {
        processed++;
        if (processed % 10 === 0 || processed === total) {
          notify({phase:"progress",processed,total,scope});
        }
      }
    }
  }
  for (const [key, record] of Object.entries(store.records)) {
    if (!current.has(key)) record.stale = true;
  }
  stats.errors = errors.length;
  stats.partial = errors.length > 0;
  store.updatedAt = new Date().toISOString();
  store.partial = stats.partial;
  store.errors = errors;
  await saveStore(store);
  return { ok: true, stats, errors, records: Object.values(store.records) };
}
async function drainScans() {
  let update={phase:"completed"};
  try {
    let result;
    do {
      rescanRequested = false;
      result = await performScan();
    } while (rescanRequested);
    update={phase:"completed",stats:result.stats};
    return result;
  } catch (error) {
    update={phase:"failed",error:error && error.message || "Error al analizar firmas"};
    throw error;
  } finally {
    activeScan = null;
    notify(update);
  }
}
function scan() {
  rescanRequested = true;
  if (!activeScan) {
    notify({phase:"started"});
    activeScan = drainScans();
  }
  return activeScan;
}
// Consultar el último resultado NUNCA debe esperar el escaneo en curso.
async function list(options={}) {
  const analyzing=!!activeScan;
  const includePreviews=options.includePreviews!==false;
  const data=await readStore();
  const history=await loadHistory();
  const inventory=new Set();
  for (const scan of [history.ugpaResult,history.utetResult]) {
    if (!scan || !scan.ok) continue;
    for (const entry of scan.files || []) inventory.add(scan.type+"|"+entry.path);
  }
  const scope=String(options.scope||"").toUpperCase();
  const status=String(options.status||"");
  const search=String(options.search||"").toLowerCase().slice(0,300);
  function matches(record){
    if(options.priorityOnly===true){
      const coverSlots=(record.cover&&record.cover.slots)||[];
      const actionable=record.status==="invalid" ||
        (record.status==="no-electronic-signature"&&coverSlots.some(slot=>
          slot.required&&["empty","review"].includes(slot.status)));
      if(!actionable)return false;
    }
    if(scope && record.scope!==scope)return false;
    if(status){
      if(status.startsWith("visual-")){
        if(record.status!=="no-electronic-signature")return false;
        const flag=status.slice(7);
        const slots=(record.cover&&record.cover.slots)||[];
        if(!slots.some(slot=>slot.status===flag) &&
          !(flag==="review"&&record.cover&&record.cover.status!=="inspected"))return false;
      }else if(record.status!==status)return false;
    }
    return !search || String(record.path||"").toLowerCase().includes(search);
  }
  const selected=Object.entries(data.records).filter(([,record])=>matches(record));
  const totalMatched=selected.length;
  const summaryCounts={verified:0,invalid:0,unverifiable:0};
  for(const [,record] of selected){
    if((record.status in summaryCounts)&&!record.stale&&inventory.has(record.scope+"|"+record.path))
      summaryCounts[record.status]++;
  }
  const paged=Number.isInteger(options.limit)&&options.limit>0;
  const limit=paged?Math.min(options.limit,200):totalMatched;
  const offset=paged?Math.max(0,Math.floor(Number(options.offset)||0)):0;
  const records=selected.slice(offset,offset+limit).map(([key,record])=>{
    const stale=record.stale===true || !inventory.has(key);
    const withStatus={...record,stale};
    if(includePreviews||!record.cover)return withStatus;
    const cover={...record.cover,slots:(record.cover.slots||[]).map(({preview,...slot})=>slot)};
    return {...withStatus,cover};
  });
  return {ok:true,analyzing,updatedAt:data.updatedAt||null,partial:!!data.partial,
    errors:data.errors||[],records,totalMatched,summaryCounts,offset,limit};
}
module.exports={scan,list,onChange};

