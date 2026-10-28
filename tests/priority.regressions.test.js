"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const files = [
  "screens/rules/rules.types.js",
  "screens/rules/manual/manual.catalog.js",
  "screens/rules/rulesets/rule.required-documents.js",
  "screens/priority/priority.config.js",
  "screens/priority/priority.processes.js",
  "screens/priority/priority.naming-policy.js",
  "screens/priority/priority.names.js",
  "screens/priority/priority.storage.js",
  "screens/priority/priority.workflow.js",
  "screens/priority/priority.service.js",
  "screens/priority/priority.queue.js"
];
function folder(rel) {
  return {name: rel.split("/").pop(), relativePath: rel,
    path: "C:/AUDIT/" + rel};
}
function file(rel) {
  return {name:rel.split("/").pop(), relativePath:rel,
    path:"C:/AUDIT/"+rel, extension:path.extname(rel).toLowerCase()};
}
function scan(scope, paths, filenames = []) {
  return {ok:true, type:scope, rootPath:"C:/AUDIT", rootName:scope,
    source:{kind:"folder",selectedFolderPath:"C:/AUDIT"},
    scannedAt:"2026-10-28T13:00:00Z",
    folders:paths.map(folder), files:filenames.map(file)};
}
function boot(state, findings = []) {
  const values = new Map();
  const window = {
    localStorage:{getItem:key=>values.get(key)||null,
      setItem:(key,value)=>values.set(key,value)},
    AppStore:{get:()=>state},
    RulesEngine:{analyze:()=>({findings})}
  };
  const context=vm.createContext({window,Date,Intl,Set,Map});
  for(const pathname of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..",pathname),"utf8"),
      context,{filename:pathname});
  }
  return window;
}
function view(window) {
  const vmResult=window.PriorityService.buildViewModel({});
  return {vmResult,board:window.PriorityQueue.build(vmResult,window.PriorityStorage.load())};
}
test("UTET PRO-164 no crea carpeta semestral inferida ni siete entregables globales por estudiante",()=>{
  const root="PROCESOS MISIONALES/EJECUCION/UTET-PRO-164-Ejecución del Trabajo de Titulación";
  const paths=["PROCESOS MISIONALES","PROCESOS MISIONALES/EJECUCION",root,
    root+"/UTET-PRO-164-Acta de titulación del Trabajo de titulación",
    root+"/UTET-PRO-164-Comunicado del Proceso de titulación",
    root+"/UTET-PRO-164-Porcentaje de Plagio"];
  const data=scan("UTET",paths);
  const w=boot({ugpaResult:null,utetResult:data,discardedFindings:[]});
  const {vmResult}=view(w);
  assert.equal(vmResult.tasks.some(item=>item.processNumber==="164"),false);
  assert.equal(w.RuleRequiredDocuments.run({scope:"UTET",scanData:data}).length,0);
});
test("PRO-60 respeta el periodo real y pone aprobación de fichas antes de la guía",()=>{
  const base="PROCESOS ESTRATEGICOS/UGPA-PRO-60-Construcción Curricular Continua";
  const period=base+"/UGPA-PRO-60-Octubre 2025 – Septiembre 2026";
  const career=period+"/UGPA-PRO-60-Administración";
  const act=career+"/UGPA-PRO-60-Acta";
  const fichas=career+"/UGPA-PRO-60-Fichas";
  const paths=["PROCESOS ESTRATEGICOS",base,period,career,act,fichas];
  const files=[act+"/UGPA-RGI1-01-PRO-60-2026-03-Acta de reunión de colectivos docentes.pdf"];
  for(let n=1;n<=4;n++) files.push(fichas+"/UGPA-RGI2-0"+n+
    "-PRO-60-2026-07-Administración Nivel "+n+".pdf");
  const w=boot({ugpaResult:scan("UGPA",paths,files),utetResult:null,discardedFindings:[]});
  const {vmResult,board}=view(w);
  const guide=vmResult.tasks.find(t=>t.processNumber==="60"&&t.documentId==="guia");
  assert.ok(guide);
  assert.equal(guide.periodLabel,"Octubre 2025 – Septiembre 2026");
  assert.equal(guide.dueDate,null);
  assert.equal(guide.stage,"after-approval");
  assert.equal(vmResult.tasks.some(t=>t.documentId==="ficha"&&t.processNumber==="60"),false);
  const decorated=board.all.find(t=>t.id===guide.id);
  assert.match(decorated.nextAction,/fichas/i);
  assert.doesNotMatch(decorated.displayTitle,/AÑO-MES|0X/);
});
test("un PDF de formación sin código reglado es evidencia candidata, no documento inexistente",()=>{
  const base="PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente";
  const per=base+"/UGPA-PRO-31-Octubre 2025 – Septiembre 2026";
  const data=scan("UGPA",["PROCESOS ESTRATEGICOS",base,per],
    [per+"/Informe de Cumplimiento a la formacion docente.pdf"]);
  const finding={id:"check-31",scope:"UGPA",category:"required-documents",
    ruleId:"required-documents",title:"Documento obligatorio sin PDF final",
    missingFileName:"Informe de Cumplimiento del Plan de Formación",
    expectedValue:"Informe de Cumplimiento del Plan de Formación",
    relativePath:per,periodLabel:"Octubre 2025 – Septiembre 2026"};
  const w=boot({ugpaResult:data,utetResult:null,discardedFindings:[]},[finding]);
  const {board}=view(w);
  const item=board.all.find(t=>t.id==="rule|check-31");
  assert.ok(item);
  assert.equal(item.evidenceState,"pdf-candidate");
  assert.equal(item.workType,"review");
  assert.match(item.reason,/Se localizó un PDF candidato/);
});
test("un Word de capacitación es editable localizado y no acredita PDF final",()=>{
  const base="PROCESOS ESTRATEGICOS/UGPA-PRO-70-Capacitacion Docente";
  const per=base+"/UGPA-PRO-70-Abril 2026 – Septiembre 2026";
  const data=scan("UGPA",["PROCESOS ESTRATEGICOS",base,per],
    [per+"/UGPA-RGI1-01-PRO-70-2025-10-Deteccion de Capacitacion.docx"]);
  const finding={id:"check-70",scope:"UGPA",category:"required-documents",
    ruleId:"required-documents",title:"Documento obligatorio sin PDF final",
    missingFileName:"Detección de Necesidades de Capacitación",
    expectedValue:"Detección de Necesidades de Capacitación",
    relativePath:per,periodLabel:"Abril 2026 – Septiembre 2026"};
  const w=boot({ugpaResult:data,utetResult:null,discardedFindings:[]},[finding]);
  const {board}=view(w);
  const item=board.all.find(t=>t.id==="rule|check-70");
  assert.ok(item);
  assert.equal(item.evidenceState,"editable-only");
  assert.equal(item.workType,"review");
  assert.match(item.reason,/editable/i);
});
