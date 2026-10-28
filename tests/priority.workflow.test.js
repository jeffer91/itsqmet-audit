"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function setup(options = {}) {
  const storage = new Map();
  const state = options.state || {ugpaResult:null,utetResult:null,discardedFindings:[]};
  const findings = options.findings || [];
  const window = {
    localStorage:{
      getItem:key=>storage.get(key) || null,
      setItem:(key,value)=>storage.set(key,value)
    },
    AppStore:{get:()=>state},
    RulesEngine:{analyze:()=>({findings})},
    api:{
      pdf:{export:async payload=>({ok:true,fileName:"prueba.pdf",payload})},
      shell:{createFolder:async()=>({ok:true})}
    }
  };
  const context = vm.createContext({window,Date,Intl,Set,Map});
  for (const script of [
    "screens/rules/rules.types.js",
    "screens/rules/manual/manual.catalog.js",
    "screens/priority/priority.config.js",
    "screens/priority/priority.processes.js",
    "screens/priority/priority.service.js"
  ]) vm.runInContext(read(script),context,{filename:script});
  return {svc:window.PriorityService,window};
}
function scan(kind = "folder") {
  return {
    ok:true,type:"UTET",rootPath:"C:\\UTET",rootName:"UTET",
    scannedAt:"2026-10-21T15:54:05Z",
    source:{kind,selectedFolderPath:kind==="folder"?"C:\\UTET":""},
    folders:[
      {name:"PROCESOS ESTRATEGICOS",relativePath:"PROCESOS ESTRATEGICOS",path:"C:\\UTET\\PROCESOS ESTRATEGICOS"},
      {name:"PROCESOS MISIONALES",relativePath:"PROCESOS MISIONALES",path:"C:\\UTET\\PROCESOS MISIONALES"},
      {name:"PROCESOS DE APOYO",relativePath:"PROCESOS DE APOYO",path:"C:\\UTET\\PROCESOS DE APOYO"},
      {name:"UTET-PRO-56-Planificacion Semestral del Proceso de Titulación",relativePath:"PROCESOS ESTRATEGICOS/UTET-PRO-56-Planificacion Semestral del Proceso de Titulación",path:"C:\\UTET\\PROCESOS ESTRATEGICOS\\UTET-PRO-56-Planificacion Semestral del Proceso de Titulación"}
    ],files:[]
  };
}
const find=(id,title,actual,expected,area="PROCESOS ESTRATEGICOS")=>({
  id,scope:"UTET",ruleId:"period-folder-format",category:"names",title,
  actualValue:actual,expectedValue:expected,relativePath:area+"/UTET-PRO-56-Planificacion Semestral/"+actual
});
test("con escaneos vacíos no genera registros fantasma",()=>{
  const {svc}=setup();
  const view=svc.buildViewModel({workType:"quick"});
  assert.equal(view.noScan,true);assert.equal(view.tasks.length,0);
  assert.equal(view.visibleInconsistencies,0);
});
test("los estados se validan y el filtro respeta los avances",()=>{
  const findings=[find("a","Nombre de PDF incorrecto","Plan (2).pdf","Plan.pdf")];
  const {svc}=setup({findings});
  svc.saveProgress("issue|a","doing");
  assert.equal(svc.buildViewModel({status:"doing"}).visibleInconsistencies,1);
  assert.equal(svc.buildViewModel({status:"pending"}).visibleInconsistencies,0);
  assert.throws(()=>svc.saveProgress("issue|a","invalid"));
});
test("no ofrece copiar instrucciones genéricas como nombre de carpeta",()=>{
  const findings=[find("a","Carpeta de período mal nombrada","UTET-PRO-56-Abril 2026–Septiembre 2027","Usar uno de los formatos oficiales de período")];
  const {svc}=setup({findings});
  const item=svc.buildViewModel().inconsistencies[0].items[0];
  assert.equal(item.suggestedName,"");
});
test("sugiere separador de período solo si el nombre resultante es válido",()=>{
  const findings=[find("a","Carpeta de período mal nombrada","UTET-PRO-56-Abril 2025 Septiembre 2025","Formato oficial")];
  const {svc}=setup({findings});
  const item=svc.buildViewModel().inconsistencies[0].items[0];
  assert.equal(item.suggestedName,"UTET-PRO-56-Abril 2025–Septiembre 2025");
});
test("filtro por área también se aplica a las inconsistencias",()=>{
  const findings=[find("a","Nombre de PDF incorrecto","Plan (2).pdf","Plan.pdf"),
    find("b","Nombre de PDF incorrecto","Acta (2).pdf","Acta.pdf","PROCESOS MISIONALES")];
  const {svc}=setup({findings});
  assert.equal(svc.buildViewModel({area:"strategic"}).visibleInconsistencies,1);
  assert.equal(svc.buildViewModel({area:"mission"}).visibleInconsistencies,1);
});
test("el PDF toma el total visible con los filtros y contiene detalle rápido",async()=>{
  const findings=[find("a","Nombre de PDF incorrecto","Plan (2).pdf","Plan.pdf"),
    find("b","Nombre de PDF incorrecto","Acta (2).pdf","Acta.pdf","PROCESOS MISIONALES")];
  const {svc}=setup({findings});
  const result=await svc.exportPdf({area:"strategic",workType:"quick"});
  assert.equal(result.payload.rawInconsistenciesCount,1);
  assert.equal(result.payload.workType,"quick");
  assert.equal(result.payload.inconsistencies[0].items.length,1);
});
test("los escaneos ZIP no proponen creación de carpetas por frecuencia",()=>{
  const {svc}=setup({state:{ugpaResult:null,utetResult:scan("archive"),discardedFindings:[]}});
  const vmResult=svc.buildViewModel();
  assert.ok(vmResult.tasks.every(t=>!t.parentPath && !t.proposedFolderName));
});
test("la periodicidad del proceso no crea automáticamente carpetas locales",()=>{
  const {svc}=setup({state:{ugpaResult:null,utetResult:scan("folder"),discardedFindings:[]}});
  const vmResult=svc.buildViewModel();
  assert.ok(vmResult.tasks.every(t=>!t.parentPath && !t.proposedFolderName));
});
test("la creación de carpeta exige tarea verificable",async()=>{
  await assert.rejects(()=>setup().svc.createFolder({workType:"quick"}),/verificada/);
});

test("el indicador del proceso no oculta observaciones por filtros de tipo",()=>{
  const finding=find("filtro-56","Nombre de PDF incorrecto","Plan (2).pdf","Plan.pdf");
  const {svc}=setup({state:{ugpaResult:null,utetResult:scan("folder"),discardedFindings:[]},
    findings:[finding]});
  const view=svc.buildViewModel({scope:"UTET",process:"UTET-56",workType:"document"});
  assert.equal(view.visibleInconsistencies,0);
  assert.equal(view.processes.length,1);
  assert.equal(view.processes[0].issues,1);
  assert.equal(view.processes[0].state,"Con observaciones");
});
