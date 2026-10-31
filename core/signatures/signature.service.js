"use strict";
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {spawn}=require("child_process");
const {app}=require("electron");
const {loadHistory}=require("../history/history.store");
const STORE="signature-validation-v2.json";
let rescanRequested = false;
let activeScan=null;
function fileStore(){return path.join(app.getPath("userData"),STORE);}
function readStore() {
  try {
    const data = JSON.parse(fs.readFileSync(fileStore(), "utf8"));
    if (!data || !data.records || typeof data.records !== "object" || Array.isArray(data.records))
      throw new Error("Registro de firmas no válido");
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 2, records: {} };
    throw error;
  }
}
function saveStore(data){const dest=fileStore();fs.mkdirSync(path.dirname(dest),{recursive:true});const tmp=dest+"."+process.pid+".tmp";fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,dest);}
function hashFile(file){return new Promise((resolve,reject)=>{const hash=crypto.createHash("sha256");const stream=fs.createReadStream(file);stream.on("data",d=>hash.update(d));stream.on("error",reject);stream.on("end",()=>resolve(hash.digest("hex")));});}
function validate(file){return new Promise(resolve=>{
 const script=path.join(__dirname,"validate_pdf.py");
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
  const store = readStore();
  const stats = { scanned: 0, reused: 0, errors: 0, partial: false };
  const errors = [];
  const current = new Set();
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
        if (previous && previous.sha256 === hash && previous.status === "no-electronic-signature") {
          stats.reused++;
        } else {
          const result = await validate(file);
          store.records[key] = { scope, path: file, name: entry.name, size: stat.size,
            mtimeMs: stat.mtimeMs, sha256: hash, checkedAt: new Date().toISOString(), ...result };
          stats.scanned++;
          if (result.status === "unverifiable") errors.push(file + ": " + (result.reason || "Firma no verificable"));
        }
        current.add(key);
        delete store.records[key].stale;
      } catch (error) {
        errors.push(file + ": " + error.message);
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
  saveStore(store);
  return { ok: true, stats, errors, records: Object.values(store.records) };
}
async function drainScans() {
  try {
    let result;
    do {
      rescanRequested = false;
      result = await performScan();
    } while (rescanRequested);
    return result;
  } finally {
    activeScan = null;
  }
}
function scan() {
  rescanRequested = true;
  if (!activeScan) activeScan = drainScans();
  return activeScan;
}
async function list() {
  if (activeScan) await activeScan;
  const data = readStore();
  const history = await loadHistory();
  const inventory = new Set();
  for (const scan of [history.ugpaResult, history.utetResult]) {
    if (!scan || !scan.ok) continue;
    for (const entry of scan.files || []) inventory.add(scan.type + "|" + entry.path);
  }
  for (const [key, record] of Object.entries(data.records)) {
    if (!inventory.has(key)) record.stale = true;
  }
  return { ok: true, updatedAt: data.updatedAt || null, partial: !!data.partial,
    errors: data.errors || [], records: Object.values(data.records) };
}
module.exports = { scan, list };
