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
test("UTET: lista definitiva de 24 aprobados en nueve procesos y sin documentos adicionales",()=>{
  const manual=setup().AuditManualCatalog;
  const processes=manual.catalog.UTET.processes;
  const expected={
    "56":["rgi1","rgi2","rgi3"],
    "95":["inf"],
    "58":["act","rgi1","rgi2"],
    "88":["solicitud","cronograma","plan-estudios"],
    "93":["com","acta"],
    "96":["cronograma","rgi1"],
    "164":["plagio","com","acta"],
    "57":["cronograma","rgi1","com","plagio","acta"],
    "97":["rgi1","inf"]
  };
  assert.deepEqual(Object.keys(processes).sort(),Object.keys(expected).sort());
  for(const [number,ids] of Object.entries(expected)){
    assert.deepEqual(Array.from(processes[number].documents,d=>d.id),ids);
  }
  const docs=Object.entries(processes).flatMap(([number,process])=>
    process.documents.map(document=>({number,document})));
  assert.equal(docs.length,24);
  assert.equal(docs.filter(({number,document})=>manual.isCodedDocument("UTET",number,document)).length,23);
  assert.equal(docs.filter(({number,document})=>manual.isAutomaticDocument("UTET",number,document)).length,23);
  assert.equal(docs.filter(({number,document})=>!manual.isCodedDocument("UTET",number,document)).length,1);
});
test("PRO-88 conserva el Plan de Estudios como aprobado sin inventar código",()=>{
  const w=setup(),manual=w.AuditManualCatalog;
  const plan=manual.getProcess("UTET","88").documents.find(d=>d.id==="plan-estudios");
  assert.ok(plan);
  assert.equal(plan.template,"");
  assert.equal(plan.codeStatus,"no-especificado");
  assert.equal(manual.isCodedDocument("UTET","88",plan),false);
  assert.equal(manual.isAutomaticDocument("UTET","88",plan),true);
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("88")});
  assert.equal(findings.length,3);
  assert.ok(findings.some(f=>f.missingFileName==="Plan de Estudios del Núcleo Complexivo"));
});
test("PRO-96 solo exige cronograma y designación de tutores",()=>{
  const w=setup();
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("96")});
  assert.equal(findings.length,2);
  assert.ok(findings.every(f=>!(/Ficha de Posibles|Solicitud de Ingreso/i.test(f.missingFileName))));
});
test("PRO-164 exige únicamente sus tres documentos institucionales, no borradores",()=>{
  const w=setup();
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("164")});
  assert.equal(findings.length,3);
  assert.ok(findings.every(f=>!(/Borrador|Trabajo de Titulación \(Final\)|Plan de Trabajo de Titulación/.test(f.missingFileName))));
});
test("PRO-57 exige solo cinco documentos institucionales, no artículos estudiantiles",()=>{
  const w=setup();
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("57")});
  assert.equal(findings.length,5);
  assert.ok(findings.every(f=>!(/Solicitud de Ingreso|Pregunta de Investigación|Borrador|Artículo Académico \(Final\)/.test(f.missingFileName))));
});
test("PRO-58 conserva el acta condicional, sin crear pendiente sin acreditar su condición",()=>{
  const w=setup(),manual=w.AuditManualCatalog;
  const act=manual.getProcess("UTET","58").documents.find(doc=>doc.id==="act");
  assert.equal(act.condition,"low-requirements-compliance");
  assert.equal(manual.isCodedDocument("UTET","58",act),true);
  assert.equal(manual.isAutomaticDocument("UTET","58",act),false);
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan("58")});
  assert.equal(findings.length,2);
});
test("PRO-59 y PRO-94 no generan documentos ni procesos activos",()=>{
  const w=setup();
  for(const n of ["59","94"]){
    assert.equal(w.AuditManualCatalog.getProcess("UTET",n),null);
    assert.equal(w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan(n)}).length,0);
  }
});
test("UGPA conserva reglas existentes para documentos obligatorios",()=>{
  const w=setup();
  const doc=w.AuditManualCatalog.getProcess("UGPA","70").documents[0];
  assert.equal(w.AuditManualCatalog.isAutomaticDocument("UGPA","70",doc),true);
});

test("el motor de auditoría no publica novedades de UTET PRO-94 ni PRO-59",()=>{
  const scanData=scan("96");
  const window={RulesCatalog:{getAll:()=>[{
    id:"prueba",name:"Regla de prueba",scope:"UTET",severity:"warning",
    run:()=>[
      {scope:"UTET",relativePath:"PROCESOS MISIONALES/UTET-PRO-94-Normativa/carpeta",title:"Antigua"},
      {scope:"UTET",relativePath:"PROCESOS MISIONALES/UTET-PRO-59-Guias/carpeta",title:"Excluida"},
      {scope:"UTET",relativePath:"PROCESOS MISIONALES/UTET-PRO-96-Trabajo/carpeta",title:"Vigente"}
    ]
  }]}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","screens/rules/rules.engine.js"),"utf8"),{
    window,Date,Set,Map
  });
  const result=window.RulesEngine.analyze({ugpaResult:null,utetResult:scanData,discardedFindings:[]});
  assert.equal(result.findings.length,1);
  assert.match(result.findings[0].relativePath,/UTET-PRO-96/);
});

test("PDF genérico con código compatible es candidato y no documento ausente confirmado",()=>{
  const w=setup(),data=scan("96");
  const root=data.folders[1].relativePath;
  data.files.push({
    name:"MEM-ITSQMET-UTET-2026-09-01.pdf",
    relativePath:root+"/MEM-ITSQMET-UTET-2026-09-01.pdf",
    path:"C:/UTET/"+root+"/MEM-ITSQMET-UTET-2026-09-01.pdf",extension:".pdf"
  });
  const findings=w.RuleRequiredDocuments.run({scope:"UTET",scanData:data});
  const cronograma=findings.find(x=>x.missingFileName==="Cronograma de Trabajo de Titulación");
  assert.ok(cronograma);
  assert.equal(cronograma.title,"PDF candidato por verificar");
  assert.equal(cronograma.candidateFileName,"MEM-ITSQMET-UTET-2026-09-01.pdf");
  assert.match(cronograma.description,/No se acredita/);
});
