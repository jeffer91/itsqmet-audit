"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");

test("el listado devuelve inmediatamente resultados anteriores durante un escaneo pendiente",async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"audit-nonblocking-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const empty={ugpaResult:null,utetResult:null};
  let reads=0;
  const originalLoad=Module._load;
  Module._load=function(request,...args){
    if(request==="electron")return {app:{getPath:()=>directory}};
    if(request==="../history/history.store")return {loadHistory:()=>{
      reads++;
      return reads===1?gate:Promise.resolve(empty);
    }};
    return originalLoad.call(this,request,...args);
  };
  let signatures;
  try{
    signatures=require("../core/signatures/signature.service");
  }finally{
    Module._load=originalLoad;
  }
  const updates=[];
  const off=signatures.onChange(event=>updates.push(event.phase));
  const scan=signatures.scan();
  try{
    const listing=await signatures.list({includePreviews:false});
    assert.equal(listing.ok,true);
    assert.equal(listing.analyzing,true);
    assert.deepEqual(listing.records,[]);
    assert.deepEqual(updates,["started"]);
  }finally{
    release(empty);
    await scan;
    off();
  }
  assert.deepEqual(updates,["started","completed"]);
  assert.equal((await signatures.list()).analyzing,false);
});
