"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const files=[
  "screens/rules/rules.types.js",
  "screens/rules/manual/manual.catalog.js",
  "screens/rules/rulesets/rule.required-documents.js"
];
function setup(){
  const window={};
  const context=vm.createContext({window,Date,Set,Map});
  for(const file of files)vm.runInContext(
    fs.readFileSync(path.join(__dirname,"..",file),"utf8"),context,{filename:file});
  return window;
}
function scan(processNumber){
  const folder="PROCESOS MISIONALES/UTET-PRO-"+processNumber+"-Prueba";
  return {ok:true,type:"UTET",rootName:"UTET",rootPath:"C:/UTET",
    source:{kind:"folder",selectedFolderPath:"C:/UTET"},
    folders:[{name:"PROCESOS MISIONALES",relativePath:"PROCESOS MISIONALES",path:"C:/UTET/PROCESOS MISIONALES"},
      {name:"UTET-PRO-"+processNumber+"-Prueba",relativePath:folder,path:"C:/UTET/"+folder}],
    files:[]};
}
test("UTET v2 conserva exactamente los 37 documentos de diez procesos sin PRO-94",()=>{
  const manual=setup().AuditManualCatalog;
  const processes=manual.catalog.UTET.processes;
  assert.deepEqual(Object.keys(processes).sort(),
    ["56","57","58","59","88","93","95","96","97","164"].sort());
  const docs=Object.entries(processes).flatMap(([number,process])=>
    process.documents.map(document=>({number,document})));
  assert.equal(docs.length,37);
  assert.equal(docs.filter(({number,document})=>manual.isCodedDocument("UTET",number,document)).length,25);
  assert.equal(docs.filter(({number,document})=>manual.isAutomaticDocument("UTET",number,document)).length,24);
  assert.equal(docs.filter(({number,document})=>!manual.isCodedDocument("UTET",number,document)).length,12);
});
test("ficha de posibles temas sigue en catálogo pero no genera pendiente",()=>{
  const w=setup(),manual=w.AuditManualCatalog;
  const ficha=manual.getProcess("UTET","96").documents.find(doc=>doc.id==="temas");
  assert.ok(ficha);
  assert.equal(manual.isAutomaticDocument("UTET","96",ficha),false);
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("96")});
  assert.equal(findings.length,3);
  assert.ok(findings.every(item=>!item.missingFileName.includes("Ficha de Posibles")));
});
test("Acta de seguimiento PRO-58 es condicional, no una tarea por defecto",()=>{
  const w=setup(),manual=w.AuditManualCatalog;
  const act=manual.getProcess("UTET","58").documents.find(doc=>doc.id==="act");
  assert.equal(act.condition,"low-requirements-compliance");
  assert.equal(manual.isCodedDocument("UTET","58",act),true);
  assert.equal(manual.isAutomaticDocument("UTET","58",act),false);
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("58")});
  assert.equal(findings.length,2);
  assert.ok(findings.every(item=>!item.missingFileName.startsWith("Acta de Seguimiento")));
});
test("la regulación PRO-94 permanece fuera de obligaciones de UTET",()=>{
  const w=setup();
  assert.equal(w.AuditManualCatalog.getProcess("UTET","94"),null);
  assert.equal(w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("94")}).length,0);
});
test("en UGPA la regla conserva el comportamiento anterior",()=>{
  const w=setup();
  const doc=w.AuditManualCatalog.getProcess("UGPA","70").documents[0];
  assert.equal(w.AuditManualCatalog.isAutomaticDocument("UGPA","70",doc),true);
});
