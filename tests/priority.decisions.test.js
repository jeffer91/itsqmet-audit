"use strict";
// Pruebas del motor contextual: sin escribir, mover ni eliminar archivos.
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"..");
const file=p=>fs.readFileSync(path.join(root,p),"utf8");
function setup(ugpa=[],utet=[]) {
  const window={
    RulesTypes:{buildScanIndex:scan=>({folders:scan.folders,files:scan.files||[]})}
  };
  const context=vm.createContext({window,Map,Set});
  vm.runInContext(file("screens/rules/manual/manual.catalog.js"),context);
  vm.runInContext(file("screens/priority/priority.decisions.js"),context);
  const mock=folders=>({ok:true,folders:folders.map(relativePath=>({
    relativePath,name:relativePath.split("/").pop(),path:"C:/AUDIT/"+relativePath
  })),files:[]});
  const prepared=window.PriorityDecisions.prepare({ugpaResult:mock(ugpa),utetResult:mock(utet)});
  return {window,prepared};
}
function issue(scope,processNumber,old,pathLabel,extra={}) {
  return {scope,processNumber,title:"Carpeta de período mal nombrada",
    actual:old,pathLabel,...extra};
}
test("PRO-31: propone ciclo anual, detecta carpeta idéntica anidada y evita doble renombrado",()=>{
  const base="PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente";
  const old="UGPA-PRO-31-Abril 2026–Septiembre 2027";
  const outer=base+"/"+old,inner=outer+"/"+old;
  const {window,prepared}=setup([outer,inner]);
  const task={id:"group31",origin:"group",scope:"UGPA",processNumber:"31",workType:"quick",
    title:"Carpeta de período mal nombrada",
    groupItems:[issue("UGPA","31",old,outer),issue("UGPA","31",old,inner)]};
  const result=window.PriorityDecisions.decorate(task,prepared);
  assert.equal(result.decision.action,"CONSOLIDAR");
  assert.equal(result.groupItems[0].decision.newName,"UGPA-PRO-31-Octubre 2026–Septiembre 2027");
  assert.equal(result.groupItems[0].decision.hasNestedDuplicate,true);
  assert.equal(result.groupItems[1].decision.isNestedDuplicate,true);
  assert.equal(result.groupItems[1].decision.newName,"");
  assert.equal(result.groupItems[1].decision.createIfMissing,false);
  assert.match(result.decision.summary,/sin renombrar duplicados/);
});
test("PRO-56: propone separador de período semestral sin inventar otra fecha",()=>{
  const {window,prepared}=setup();
  const task=issue("UTET","56","UTET-PRO-56-Abril 2026 Septiembre 2026",
    "PROCESOS ESTRATEGICOS/UTET-PRO-56/UTET-PRO-56-Abril 2026 Septiembre 2026");
  const d=window.PriorityDecisions.folderDecision(task,prepared,[]);
  assert.equal(d.action,"RENOMBRAR");
  assert.equal(d.newName,"UTET-PRO-56-Abril 2026–Septiembre 2026");
  assert.equal(d.certainty,"alta");
});
test("PRO-135: conserva propuesta validada por regla cuando hay una errata en el mes",()=>{
  const {window,prepared}=setup();
  const task=issue("UGPA","135","UGPA-PRO-135-Ocubre 2025 - Marzo 2026",
    "PROCESOS MISIONALES/UGPA-PRO-135/UGPA-PRO-135-Ocubre 2025 - Marzo 2026",
    {suggestedName:"UGPA-PRO-135-Octubre 2025–Marzo 2026"});
  const d=window.PriorityDecisions.folderDecision(task,prepared,[]);
  assert.equal(d.newName,"UGPA-PRO-135-Octubre 2025–Marzo 2026");
  assert.equal(d.action,"RENOMBRAR");
});
test("si el nombre nuevo ya existe, recomienda comparar y no crear otro destino",()=>{
  const base="PROCESOS MISIONALES/UGPA-PRO-135";
  const old="UGPA-PRO-135-Ocubre 2025 - Marzo 2026";
  const target="UGPA-PRO-135-Octubre 2025–Marzo 2026";
  const {window,prepared}=setup([base+"/"+old,base+"/"+target]);
  const d=window.PriorityDecisions.folderDecision(issue("UGPA","135",old,base+"/"+old,
    {suggestedName:target}),prepared,[]);
  assert.equal(d.action,"UNIFICAR");
  assert.equal(d.createIfMissing,false);
  assert.equal(d.conflict,true);
});
test("documento ya localizado obliga a validar y no recomienda crear duplicado",()=>{
  const {window,prepared}=setup();
  const r=window.PriorityDecisions.decorate({workType:"document",scope:"UGPA",processNumber:"31",
    resolvedDocumentId:"rgi1",officialName:"Detección de Necesidades de Formación",
    proposedDocumentName:"UGPA-RGI1-01-PRO-31-2026-10-Deteccion",
    sourceFileName:"Evidencia localizada.pdf"},prepared);
  assert.equal(r.decision.action,"VERIFICAR");
  assert.equal(r.decision.createIfMissing,false);
  assert.match(r.decision.summary,/archivo candidato/);
});
test("documento no localizado se propone condicionalmente, sin código indefinido",()=>{
  const {window,prepared}=setup();
  const r=window.PriorityDecisions.decorate({workType:"document",scope:"UGPA",processNumber:"31",
    resolvedDocumentId:"rgi1",officialName:"Detección de Necesidades de Formación",
    proposedDocumentName:"Detección de Necesidades de Formación",
    expectedTemplate:"UGPA-RGI1-0X-PRO-31-AÑO-MES",namingComplete:false},prepared);
  assert.equal(r.decision.action,"ELABORAR");
  assert.equal(r.decision.certainty,"baja");
  assert.match(r.decision.createNote,/confirma|confirmar/i);
});
test("nombre ambiguo exige verificación y no propone crear una carpeta desconocida",()=>{
  const {window,prepared}=setup();
  const d=window.PriorityDecisions.folderDecision(issue("UGPA","31","UGPA-PRO-31-Documentos",
    "PROCESOS ESTRATEGICOS/UGPA-PRO-31/UGPA-PRO-31-Documentos"),prepared,[]);
  assert.equal(d.action,"VERIFICAR");
  assert.equal(d.newName,"");
  assert.equal(d.createIfMissing,false);
});
