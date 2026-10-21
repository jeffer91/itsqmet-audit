"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
function setup(){
  const localStorage=new Map();
  const window={
    localStorage:{getItem:k=>localStorage.get(k)||null,setItem:(k,v)=>localStorage.set(k,v)},
    AppStore:{get:()=>({ugpaResult:null,utetResult:null,discardedFindings:[]})},
    RulesEngine:{analyze:()=>({findings:[]})},
    RulesTypes:{buildScanIndex:v=>v,findProcessFolders:()=>[]}
  };
  for(const f of ["screens/priority/priority.config.js","screens/priority/priority.service.js"])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),{window,Date,Intl,Set,Map});
  return window.PriorityService;
}
test("la priorización vacía no genera pendientes ni inconsistencias",()=>{
  const svc=setup(),view=svc.buildViewModel({workType:"quick"});
  assert.equal(view.noScan,true);assert.equal(view.tasks.length,0);
  assert.equal(view.visibleInconsistencies,0);
});
test("seguimiento valida los estados",()=>{
  const svc=setup();
  svc.saveProgress("task|1","doing");
  assert.throws(()=>svc.saveProgress("task|1","incorrecto"));
});
test("creación de carpeta requiere ruta verificada",async()=>{
  await assert.rejects(()=>setup().createFolder({workType:"quick"}),/verificada/);
});
