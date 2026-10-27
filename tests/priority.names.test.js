"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const period2025="PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente/UGPA-PRO-31-Abril 2025–Septiembre 2025";
const period2026="PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente/UGPA-PRO-31-Octubre 2025 – Septiembre 2026";
const example="UGPA-RGI1-02-PRO-31-2024-10-Deteccion de Necesidades.pdf";
const doc=(name,base)=>({name,relativePath:base+"/"+name,extension:path.extname(name)});
function setup(files=[]){
  const scan={ok:true,source:{kind:"folder"},folders:[],files};
  const window={AppStore:{get:()=>({ugpaResult:scan,utetResult:null})}};
  const context=vm.createContext({window,Date,Intl,Set,Map});
  [
    "screens/rules/rules.types.js",
    "screens/rules/manual/manual.catalog.js",
    "screens/priority/priority.names.js",
    "screens/priority/priority.workflow.js"
  ].forEach(file=>vm.runInContext(read(file),context,{filename:file}));
  return window;
}
function task(overrides={}){
  return {id:"test-31",scope:"UGPA",processNumber:"31",area:"strategic",
    title:"Detección de Necesidades de Formación",documentLabel:"Detección de Necesidades de Formación",
    workType:"document",periodLabel:"Abril 2025 – Septiembre 2025",sourceCategory:"required-documents",
    pathLabel:period2025,...overrides};
}
test("usa el nombre real institucional con código, serie y fecha sin cambiarlo",()=>{
  const w=setup([doc(example,period2025)]);
  const result=w.PriorityNames.rename(task(),w.PriorityNames.prepare());
  assert.equal(result.displayTitle,example.replace(".pdf",""));
  assert.equal(result.sourceFileName,example);
  assert.equal(result.sourceKind,"file-existing");
  assert.match(result.suggestedAction,/Revisar si el PDF/);
  assert.equal(w.PriorityWorkflow.decorate(result,{}).large,false);
});
test("no acredita un documento de un período anterior como vigente",()=>{
  const w=setup([doc(example,period2025)]);
  const result=w.PriorityNames.rename(task({periodLabel:"Octubre 2025 – Septiembre 2026",
    pathLabel:period2026}),w.PriorityNames.prepare());
  assert.equal(result.sourceFileName,"");
  assert.equal(result.referenceFileName,example);
  assert.equal(result.expectedTemplate,"UGPA-RGI1-0X-PRO-31-AÑO-MES");
  assert.match(result.displayTitle,/0X.*AÑO-MES/);
});
test("respeta el nombre real de archivos sin código y exige revisión",()=>{
  const actual="Informe de Detección_de_formación_2025-2026.pdf";
  const w=setup([doc(actual,period2026)]);
  const result=w.PriorityNames.rename(task({periodLabel:"Octubre 2025 – Septiembre 2026",
    pathLabel:period2026}),w.PriorityNames.prepare());
  assert.equal(result.displayTitle,actual.slice(0,-4));
  assert.equal(result.sourceKind,"file-existing");
  assert.equal(result.officialName,"Detección de Necesidades de Formación");
});
test("usa la plantilla del manual sin inventar consecutivo ni mes",()=>{
  const w=setup();
  const result=w.PriorityNames.rename(task(),w.PriorityNames.prepare());
  assert.equal(result.displayTitle,
    "UGPA-RGI1-0X-PRO-31-AÑO-MES · Detección de Necesidades de Formación");
  assert.equal(result.sourceFileName,"");
});
test("en PRO-60 conserva nombre oficial de la guía y contexto de carrera",()=>{
  const w=setup();
  const result=w.PriorityNames.rename(task({id:"pro60",processNumber:"60",documentId:"rgi3",
    careerName:"Administración",title:"Falta Guía Curricular de Aplicación Académica · Administración",
    pathLabel:"PROCESOS ESTRATEGICOS/UGPA-PRO-60-Construcción Curricular Continua/UGPA-PRO-60-Octubre 2024–Septiembre 2026/UGPA-PRO-60-Administración"}),
    w.PriorityNames.prepare());
  assert.equal(result.expectedTemplate,"RGI3-0X-PRO-60-AÑO-MES");
  assert.match(result.displayTitle,/Guía Curricular de Aplicación Académica de la Carrera/);
  assert.match(result.displayTitle,/Administración/);
});
test("muestra el nombre de la carpeta concreta y no 'Carpeta vacía'",()=>{
  const w=setup();
  const result=w.PriorityNames.rename(task({id:"empty",processNumber:"56",scope:"UTET",
    title:"Carpeta vacía",sourceCategory:"empty-folders",
    detectedName:"UTET-RGI2-PRO-56-Planificación del Articulo Academico"}),w.PriorityNames.prepare());
  assert.equal(result.displayTitle,"UTET-RGI2-PRO-56-Planificación del Articulo Academico");
});
test("usa el nombre propuesto completo para la carpeta del período",()=>{
  const w=setup();
  const name="UTET-PRO-164-Octubre 2026 – Marzo 2027";
  const result=w.PriorityNames.rename(task({scope:"UTET",processNumber:"164",
    workType:"quick",title:"Crear carpeta del período",
    proposedFolderName:name}),w.PriorityNames.prepare());
  assert.equal(result.displayTitle,name);
});
test("ignora desktop.ini como documento encontrado",()=>{
  const w=setup([doc("desktop.ini",period2025)]);
  const result=w.PriorityNames.rename(task(),w.PriorityNames.prepare());
  assert.equal(result.sourceFileName,"");
  assert.equal(result.sourceKind,"template");
});
