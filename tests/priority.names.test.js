"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
function setup(files=[]) {
  const scan={ok:true,source:{kind:"folder"},rootName:"Demo",folders:[],files};
  const memory=new Map();
  const window={
    AppStore:{get:()=>({ugpaResult:scan,utetResult:scan})},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,val)}
  };
  const ctx=vm.createContext({window,Date,Intl,Set,Map});
  ["screens/rules/rules.types.js","screens/rules/manual/manual.catalog.js",
    "screens/priority/priority.names.js","screens/priority/priority.workflow.js",
    "screens/priority/priority.storage.js","screens/priority/priority.queue.js"
  ].forEach(file=>vm.runInContext(read(file),ctx,{filename:file}));
  return window;
}
const p31a="PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente/UGPA-PRO-31-Octubre 2024–Septiembre 2025";
const p31b="PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente/UGPA-PRO-31-Octubre 2025–Septiembre 2026";
const p70="PROCESOS ESTRATEGICOS/UGPA-PRO-70-Capacitacion Docente/UGPA-PRO-70-Abril 2026–Septiembre 2026";
const p60="PROCESOS ESTRATEGICOS/UGPA-PRO-60-Construccion Curricular Continua/UGPA-PRO-60-Octubre 2024–Septiembre 2026/UGPA-PRO-60-Administración";
const p56="PROCESOS ESTRATEGICOS/UTET-PRO-56-Planificacion Semestral/UTET-PRO-56-Abril 2025–Septiembre 2025/UTET-RGI2-PRO-56-Planificación del Articulo Academico";
const pdf=(name,base)=>({name,relativePath:base+"/"+name,extension:".pdf",path:"C:/test/"+base+"/"+name});
const docx=(name,base)=>({name,relativePath:base+"/"+name,extension:".docx",path:"C:/test/"+base+"/"+name});
function task(overrides={}) {
  return {id:"task31",scope:"UGPA",processNumber:"31",
    title:"Detección de Necesidades de Formación",sourceCategory:"required-documents",
    pathLabel:p31b,periodLabel:"Octubre 2025–Septiembre 2026",
    area:"strategic",workType:"document",...overrides};
}
function named(window,settings){return window.PriorityNames.rename(task(settings),window.PriorityNames.prepare());}
test("un PDF correctamente codificado mantiene su nombre completo",()=>{
  const file="UGPA-RGI1-02-PRO-31-2024-10-Deteccion de Necesidades.pdf";
  const w=setup([pdf(file,p31a)]);
  const out=named(w,{pathLabel:p31a,periodLabel:"Octubre 2024–Septiembre 2025"});
  assert.equal(out.displayTitle,file.slice(0,-4));
  assert.equal(out.sourceKind,"file-coded");
  assert.equal(out.workType,"review");
  assert.equal(w.PriorityWorkflow.decorate(out,{stages:{}}).large,false);
});
test("un PDF sin nombre normalizado conserva la identidad del manual y se muestra como evidencia",()=>{
  const file="Informe de Detección_de_formación_2025-2026.pdf";
  const w=setup([pdf(file,p31b)]);
  const out=named(w);
  assert.equal(out.displayTitle,"UGPA-RGI1-0X-PRO-31-AÑO-MES-Deteccion de Necesidades de Formacion");
  assert.equal(out.sourceFileName,file);
  assert.equal(out.sourceKind,"file-to-verify");
  assert.equal(out.displayWorkType,"review");
});
test("nunca se reutiliza automáticamente una fecha de código ajena al período",()=>{
  const file="UGPA-RGI1-01-PRO-70-2025-10-Deteccion de Capacitacion.docx";
  const w=setup([docx(file,p70)]);
  const out=named(w,{id:"p70",processNumber:"70",title:"Detección de Necesidades de Capacitación",
    pathLabel:p70,periodLabel:"Abril 2026–Septiembre 2026"});
  assert.equal(out.displayTitle,"UGPA-RGI1-0X-PRO-70-AÑO-MES-Deteccion de Necesidades de Capacitacion");
  assert.equal(out.sourceFileName,file);
  assert.match(out.namingNotice,/fecha.*no corresponde/i);
});
test("documento de otro período figura como referencia, no acredita el actual",()=>{
  const file="UGPA-RGI1-02-PRO-31-2024-10-Deteccion de Necesidades.pdf";
  const w=setup([pdf(file,p31a)]),out=named(w);
  assert.equal(out.sourceFileName,"");
  assert.equal(out.referenceFileName,file);
  assert.match(out.displayTitle,/AÑO-MES/);
});
test("identifica Guía Curricular de Administración como RGI3 del manual, no como Falta Guía",()=>{
  const w=setup();
  const out=named(w,{id:"g60",processNumber:"60",documentId:"guia",careerName:"Administración",
    pathLabel:p60,periodLabel:"Octubre 2024–Septiembre 2026",
    title:"Falta Guía Curricular de Aplicación Académica · Administración"});
  assert.equal(out.resolvedDocumentId,"rgi3");
  assert.equal(out.expectedTemplate,"RGI3-0X-PRO-60-AÑO-MES");
  assert.equal(out.displayTitle,"RGI3-0X-PRO-60-AÑO-MES-Guia Curricular de Aplicacion Academica de la Carrera Administracion");
  assert.equal(w.PriorityWorkflow.decorate(out,{stages:{}}).large,true);
});
test("una carpeta RGI2 de Artículo Académico no cambia el código RGI3 del manual",()=>{
  const w=setup();
  const out=w.PriorityNames.rename({id:"empty",scope:"UTET",processNumber:"56",
    title:"Carpeta vacía",detectedName:"Carpeta detectada sin contenido.",
    sourceCategory:"empty-folders",pathLabel:p56,workType:"review"},
    w.PriorityNames.prepare());
  assert.equal(out.expectedTemplate,"UTET-RGI3-0X-PRO-56-AÑO-MES");
  assert.equal(out.displayTitle,"UTET-RGI3-0X-PRO-56-AÑO-MES-Planificacion de Articulo Academico");
  assert.match(out.namingNotice,/RGI2.*RGI3/);
});
test("una carpeta sin documento identificable muestra su nombre real en vez de mensaje genérico",()=>{
  const w=setup();
  const out=w.PriorityNames.rename({id:"empty2",scope:"UTET",processNumber:"56",
    title:"Carpeta vacía",detectedName:"Carpeta detectada sin contenido.",
    sourceCategory:"empty-folders",pathLabel:"PROCESOS ESTRATEGICOS/UTET-PRO-56/Abril 2026–Septiembre 2026/Reportes pendientes",
    workType:"review"},w.PriorityNames.prepare());
  assert.equal(out.displayTitle,"Reportes pendientes");
  assert.equal(out.resolvedDocumentId,"");
});
test("tarea de crear carpeta PRO-164 no se presenta como documento obligatorio",()=>{
  const w=setup();
  const out=w.PriorityNames.rename({id:"folder",scope:"UTET",processNumber:"164",
    title:"Crear carpeta del período",proposedFolderName:"UTET-PRO-164-Abril 2026–Septiembre 2026",
    workType:"quick"},w.PriorityNames.prepare());
  assert.equal(out.displayTitle,"UTET-PRO-164-Abril 2026–Septiembre 2026");
  assert.equal(out.sourceKind,"folder-suggested");
  assert.match(out.namingNotice,/no es un documento/);
});
test("en una carpeta vacía el texto de error jamás se usa como nombre",()=>{
  const w=setup();
  const out=w.PriorityNames.rename({id:"empty3",scope:"UTET",processNumber:"56",
    title:"Carpeta vacía",detectedName:"Carpeta detectada sin contenido.",
    sourceCategory:"empty-folders",pathLabel:"PROCESOS ESTRATEGICOS/UTET-PRO-56/Planificación",
    workType:"review"},w.PriorityNames.prepare());
  assert.equal(out.displayTitle,"Planificación");
});
test("el manual UGPA registra RI2 en la ficha, con advertencia por la diferencia con RGI2",()=>{
  const w=setup();
  const out=named(w,{id:"f60",processNumber:"60",documentId:"ficha",
    title:"Faltan fichas de análisis curricular",careerName:"Administración",pathLabel:p60});
  assert.equal(out.expectedTemplate,"UGPA-RI2-0X-PRO-60-AÑO-MES");
  assert.match(out.namingNotice,/manual UGPA escribe RI2/);
});
test("no convierte archivos técnicos en evidencias documentales",()=>{
  const w=setup([pdf("desktop.ini",p31b)]);
  const out=named(w);
  assert.equal(out.sourceFileName,"");
  assert.equal(out.sourceKind,"template");
});
test("la cola de cinco tareas usa los nombres normalizados sin cambiar IDs del historial",()=>{
  const w=setup([pdf("Informe de Detección_de_formación_2025-2026.pdf",p31b)]);
  const tasks=[task(),...Array.from({length:5},(_,i)=>task({
    id:"folder"+i,scope:"UTET",processNumber:"164",title:"Crear carpeta del período",
    proposedFolderName:"UTET-PRO-164-Abril 2026–Septiembre 2026-"+i,workType:"quick",area:"mission"}))];
  const b=w.PriorityQueue.build({tasks,inconsistencies:[]},w.PriorityStorage.load());
  assert.equal(b.items.length,5);
  assert.ok(b.all.some(item=>item.id==="task31"&&item.workType==="review"&&item.displayTitle.startsWith("UGPA-RGI1-0X")));
  assert.equal(new Set(b.queueIds).size,5);
});
