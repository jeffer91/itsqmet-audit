"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {spawn} = require("child_process");
const {app} = require("electron");
const {loadHistory} = require("../history/history.store");
const STORE = "signature-validation-v1.json";
const MAX_FILES = 12000;
function fileStore(){return path.join(app.getPath("userData"), STORE);}
function readStore(){try{return JSON.parse(fs.readFileSync(fileStore(),"utf8"));}catch(_){return {version:1,records:{}};}}
function saveStore(store){const target=fileStore();fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+".tmp";fs.writeFileSync(temp,JSON.stringify(store,null,2));fs.renameSync(temp,target);}
function collect(root,files,depth=0){
 if(depth>24||files.length>=MAX_FILES)return;
 for(const item of fs.readdirSync(root,{withFileTypes:true})){
  if(files.length>=MAX_FILES)break;
  const full=path.join(root,item.name);
  if(item.isSymbolicLink())continue;
  if(item.isDirectory())collect(full,files,depth+1);
  else if(item.isFile()&&/\.pdf$/i.test(item.name))files.push(full);
 }
}
function validate(file){
 return new Promise(resolve=>{
  const script=path.join(__dirname,"validate_pdf.py");
  const py=process.env.AUDIT_PYTHON || (process.platform==="win32"?"python":"python3");
  const child=spawn(py,[script,file],{windowsHide:true,timeout:45000});
  let output="",error="";
  child.stdout.on("data",d=>{output+=d.toString();if(output.length>250000)child.kill();});
  child.stderr.on("data",d=>{error+=d.toString();if(error.length>2000)error=error.slice(0,2000);});
  child.on("error",e=>resolve({status:"unverifiable",reason:e.message}));
  child.on("close",()=>{try{resolve(JSON.parse(output));}catch(_){resolve({status:"unverifiable",reason:error||"Validador no disponible"});}});
 });
}
async function scan(){
 const history=await loadHistory();
 const roots=[];
 for(const scope of ["UGPA","UTET"]){
  const result=scope==="UGPA"?history.ugpaResult:history.utetResult;
  const root=result&&result.source&&(result.source.selectedFolderPath||result.rootPath);
  if(root&&fs.existsSync(root)&&fs.statSync(root).isDirectory())roots.push({scope,root});
 }
 const store=readStore(),current=new Set(),stats={scanned:0,reused:0,errors:0};
 for(const {scope,root} of roots){
  const files=[];collect(root,files);
  for(const file of files){
   const st=fs.statSync(file),key=scope+"|"+file;current.add(key);
   const prev=store.records[key];
   if(prev&&prev.size===st.size&&prev.mtimeMs===st.mtimeMs){stats.reused++;continue;}
   const result=await validate(file);
   store.records[key]={scope,path:file,name:path.basename(file),size:st.size,mtimeMs:st.mtimeMs,checkedAt:new Date().toISOString(),...result};
   stats.scanned++;if(result.status==="unverifiable")stats.errors++;
  }
 }
 for(const key of Object.keys(store.records))if(!current.has(key))delete store.records[key];
 store.updatedAt=new Date().toISOString();saveStore(store);
 return {ok:true,stats,records:Object.values(store.records)};
}
function list(){const store=readStore();return {ok:true,updatedAt:store.updatedAt||null,records:Object.values(store.records)};}
module.exports={scan,list};
