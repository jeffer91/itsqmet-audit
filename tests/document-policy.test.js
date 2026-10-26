"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function environment(ruleFile, mocks = {}) {
  const window = Object.assign({ RulesTypes: {} }, mocks);
  const context = vm.createContext({ window });
  for (const file of [
    "screens/rules/rules.file-policy.js",
    ruleFile
  ].filter(Boolean)) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  return window;
}
function file(name, folder = "PERIODO") {
  return {
    name,
    extension: "." + name.split(".").pop().toLowerCase(),
    relativePath: folder + "/" + name,
    directoryPath: folder,
    path: "/auditoria/" + folder + "/" + name
  };
}
test("PDF es final; Word y Excel editables; temporales se ignoran", () => {
  const p = environment().RulesFilePolicy;
  assert.equal(p.isFinalPdf(file("Plan.pdf")), true);
  assert.equal(p.isFinalPdf(file("Plan.docx")), false);
  assert.equal(p.isEditable(file("Plan.xlsx")), true);
  assert.equal(p.isEditable(file("~$Plan.docx")), false);
});
test("PDF equivalente requiere el mismo documento y carpeta", () => {
  const p = environment().RulesFilePolicy;
  const editable = file("Plan firmado.docx");
  const final = file("Plan.pdf");
  assert.equal(p.findMatchingPdf(editable, [final]), final);
  assert.equal(p.findMatchingPdf(editable, [file("Informe.pdf")]), null);
  assert.equal(p.findMatchingPdf(editable, [file("Plan.pdf", "OTRO_PERIODO")]), null);
});
test("PDF final y Word generan advertencia por editable adicional", () => {
  const w = environment("screens/rules/rulesets/rule.non-pdf-files.js");
  const files = [file("Plan.pdf"), file("Plan.docx")];
  const findings = w.RuleNonPdfFiles.run({ scope:"UGPA", scanData:{ok:true,rootPath:"/auditoria",files} });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].editableStatus, "with-final");
  assert.equal(findings[0].severity, "warning");
  assert.match(findings[0].title, /adicional/);
});
test("Word sin PDF final sigue pendiente", () => {
  const w = environment("screens/rules/rulesets/rule.non-pdf-files.js");
  const findings = w.RuleNonPdfFiles.run({
    scope:"UTET", scanData:{ok:true,rootPath:"/auditoria",files:[file("Plan.docx")]}
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].editableStatus, "without-final");
});
test("PDF de otro documento no acredita obligación", () => {
  const base = "PROCESOS MISIONALES/UTET-PRO-56";
  const expected = {
    id:"rgi1",label:"Planificación del Examen Complexivo",
    codes:["UTET-RGI1","PRO-56"],keywords:["planificacion","examen","complexivo"]
  };
  const w = environment("screens/rules/rulesets/rule.required-documents.js",{
    RulesTypes:{
      buildScanIndex:(scan)=>({files:scan.files,folders:scan.folders}),
      findProcessFolders:()=>[{
        name:"UTET-PRO-56",relativePath:base,path:"/auditoria/"+base,
        processValidation:{valid:true,processNumber:"56"}
      }],
      normalizeRelativePath:(s)=>String(s||""),
      buildFindingId:(f)=>f.ruleId+"|"+f.relativePath+"|"+f.expectedValue
    },
    AuditManualCatalog:{
      normalizeText:(s)=>String(s||"").normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"").toLowerCase()
        .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(),
      getProcess:()=>({documents:[expected]})
    }
  });
  const scan={ok:true,rootPath:"/auditoria",folders:[],files:[
    file("UTET-RGI1-01-PRO-56-2026-10.docx",base),
    file("OTRO-INFORME.pdf",base)
  ]};
  assert.equal(w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan}).length, 1);
  scan.files.push(file("UTET-RGI1-01-PRO-56-2026-10.pdf",base));
  assert.equal(w.RuleRequiredDocuments.run({scope:"UTET",scanData:scan}).length, 0);
});

test("códigos RGI repetidos no acreditan dos entregables diferentes",()=>{
  const processPath="PROCESOS ESTRATEGICOS/UGPA-PRO-31-Formacion Docente";
  const sameCodes=["UGPA-RGI1","PRO-31"];
  const first={id:"diagnostico",label:"Detección de Necesidades de Formación",
    codes:sameCodes,keywords:["deteccion","necesidades","formacion"]};
  const second={id:"plan",label:"Plan Anual de Formación Docente",
    codes:sameCodes,keywords:["plan","anual","formacion"]};
  let required=[first,second];
  const w=environment("screens/rules/rulesets/rule.required-documents.js",{
    RulesTypes:{
      buildScanIndex:scan=>({files:scan.files,folders:[]}),
      findProcessFolders:()=>[{name:"UGPA-PRO-31-Formacion Docente",
        relativePath:processPath,path:"/auditoria/"+processPath,
        processValidation:{valid:true,processNumber:"31"}}],
      normalizeRelativePath:x=>String(x||""),
      buildFindingId:x=>x.ruleId+"|"+x.relativePath+"|"+x.expectedValue
    },
    AuditManualCatalog:{getProcess:()=>({name:"Formación Docente",documents:required}),
      normalizeText:x=>String(x||"").toLowerCase()}
  });
  const scan={ok:true,rootPath:"/auditoria",rootName:"UGPA",
    files:[file("UGPA-RGI1-01-PRO-31-2026-10.pdf",processPath)],folders:[]};
  assert.equal(w.RuleRequiredDocuments.run({scope:"UGPA",scanData:scan}).length,2);
  required=[first];
  assert.equal(w.RuleRequiredDocuments.run({scope:"UGPA",scanData:scan}).length,0);
});
