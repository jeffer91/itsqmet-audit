"use strict";
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {spawn}=require("child_process");
const {app}=require("electron");
const {loadHistory}=require("../history/history.store");
const STORE="signature-validation-v2.json";
const MAX_FILES=12000;
let activeScan=null;
function fileStore(){return path.join(app.getPath("userData"),STORE);}
function readStore(){try{const data=JSON.parse(fs.readFileSync(fileStore(),"utf8"));return data&&data.records?data:{version:2,records:{}};}catch(_){return {version:2,records:{}};}}
function saveStore(data){const dest=fileStore();fs.mkdirSync(path.dirname(dest),{recursive:true});const tmp=dest+"."+process.pid+".tmp";fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,dest);}
function hashFile(file){return new Promise((resolve,reject)=>{const hash=crypto.createHash("sha256");const stream=fs.createReadStream(file);stream.on("data",d=>hash.update(d));stream.on("error",reject);stream.on("end",()=>resolve(hash.digest("hex")));});}
function collect(root,files,errors,depth=0){
 if(depth>24){errors.push("Límite de profundidad en "+root);return;}
 let entries;try{entries=fs.readdirSync(root,{withFileTypes:true});}catch(e){errors.push(root+": "+e.message);return;}
 for(const item of entries){
  if(files.length>=MAX_FILES){errors.push("Límite de "+MAX_FILES+" PDF alcanzado");return;}
  if(item.isSymbolicLink())continue;
  const full=path.join(root,item.name);
  if(item.isDirectory())collect(full,files,errors,depth+1);
  else if(item.isFile()&&/\.pdf$/i.test(item.name))files.push(full);
 }
}
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
async function performScan(){
 const history=await loadHistory(),store=readStore(),stats={scanned:0,reused:0,errors:0,partial:false};
 const roots=[];
 for(const scope of ["UGPA","UTET"]){
  const result=scope==="UGPA"?history.ugpaResult:history.utetResult;
  const source=result&&result.source;
  const root=(source&&source.kind==="folder"&&source.selectedFolderPath)||history[scope.toLowerCase()+"SourcePath"];
  if(!root)continue;
  try{if(fs.statSync(root).isDirectory())roots.push({scope,root});else{stats.partial=true;stats.errors++;}}
  catch(_){stats.partial=true;stats.errors++;}
 }
 const seen=new Set(),errors=[];
 for(const {scope,root} of roots){
  const files=[];collect(root,files,errors);
  for(const file of files){
   const key=scope+"|"+file;seen.add(key);
   try{
    const stat=fs.statSync(file),hash=await hashFile(file),previous=store.records[key];
    if(previous&&previous.sha256===hash&&previous.status!=="unverifiable"){stats.reused++;continue;}
    const result=await validate(file);
    store.records[key]={scope,path:file,name:path.basename(file),size:stat.size,mtimeMs:stat.mtimeMs,sha256:hash,checkedAt:new Date().toISOString(),...result};
    stats.scanned++;if(result.status==="unverifiable")stats.errors++;
   }catch(e){stats.errors++;stats.partial=true;const previous=store.records[key];if(previous)store.records[key]={...previous,stale:true,reason:"No se pudo comprobar el archivo: "+e.message};}
  }
 }
 if(errors.length){stats.partial=true;stats.errors+=errors.length;}
 // Never erase historical records merely because a directory was unavailable or a scan was partial.
 for(const [key,record] of Object.entries(store.records))if(!seen.has(key))record.stale=true;
 for(const key of seen)if(store.records[key]&&store.records[key].stale&&!stats.partial)delete store.records[key].stale;
 store.updatedAt=new Date().toISOString();store.partial=stats.partial;store.errors=errors;saveStore(store);
 return {ok:true,stats,records:Object.values(store.records)};
}
function scan(){if(!activeScan)activeScan=performScan().finally(()=>{activeScan=null;});return activeScan;}
function list(){const data=readStore();return {ok:true,updatedAt:data.updatedAt||null,partial:!!data.partial,records:Object.values(data.records)};}
module.exports={scan,list};
