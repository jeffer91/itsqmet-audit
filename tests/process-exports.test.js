"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),zlib=require("node:zlib");
const {buildPriorityWorkbook}=require("../core/ipc/export.xlsx");
const {buildExportDocument}=require("../core/ipc/export.builder");
function readZip(buffer) {
  const parts={};let at=0;
  while(at+30<=buffer.length&&buffer.readUInt32LE(at)===0x04034b50){
    const method=buffer.readUInt16LE(at+8),compressed=buffer.readUInt32LE(at+18);
    const nameLen=buffer.readUInt16LE(at+26),extraLen=buffer.readUInt16LE(at+28);
    const name=buffer.subarray(at+30,at+30+nameLen).toString("utf8");
    const from=at+30+nameLen+extraLen,raw=buffer.subarray(from,from+compressed);
    parts[name]=(method===8?zlib.inflateRawSync(raw):raw).toString("utf8");
    at=from+compressed;
  }
  return parts;
}
test("XLSX estructuralmente válido con cuatro hojas y detalle sin agrupar",()=>{
  const p={tasks:[{scope:"UTET",processNumber:"57",title:"Corregir acta",levelLabel:"Alta",status:"pending"}],
    inconsistencies:[{title:"Grupo",items:[{scope:"UGPA",title:"Falta A"},{scope:"UGPA",title:"Falta B"}]}],
    processes:[{id:"UTET-57",scope:"UTET",processName:"Artículo Académico",
      indicator:"Estudiantes que culminan",target:"95%",indicatorValue:"Sin datos",indicatorStatus:"No evaluado"}]};
  const x=readZip(buildPriorityWorkbook(p));
  for(let i=1;i<=4;i++)assert.ok(x["xl/worksheets/sheet"+i+".xml"]);
  assert.match(x["xl/workbook.xml"],/Indicadores/);
  assert.match(x["xl/worksheets/sheet3.xml"],/Falta A/);
  assert.match(x["xl/worksheets/sheet3.xml"],/Falta B/);
  assert.match(x["xl/worksheets/sheet4.xml"],/Sin datos/);
});
test("PDF de prioridades incorpora los procesos y cada inconsistencia",()=>{
  const p={mode:"priority",tasks:[{scope:"UTET",processNumber:"57",title:"Corregir acta"}],
    inconsistencies:[{title:"Grupo",groupCount:2,items:[
      {scope:"UTET",title:"Problema A",actual:"Documento uno"},
      {scope:"UTET",title:"Problema B",actual:"Documento dos"}]}],
    processes:[{id:"UTET-57",processName:"Artículo Académico",state:"Con observaciones",
      indicator:"Titulados",target:"95%",indicatorValue:"Sin datos"}],
    counts:{max:0,high:1,medium:0,low:0},rawInconsistenciesCount:2};
  const html=buildExportDocument(p).html;
  assert.match(html,/UTET-57/);
  assert.match(html,/Problema A/);
  assert.match(html,/Problema B/);
  assert.match(html,/Sin datos/);
});
test("se ven los 19 procesos incluso sin escaneo, sin fabricar indicadores",()=>{
  const window={RulesTypes:{}},context=vm.createContext({window,Set});
  for(const file of ["screens/rules/manual/manual.catalog.js","screens/priority/priority.processes.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),context);
  const result=window.PriorityProcesses.buildRows({ugpaResult:null,utetResult:null},[],[],{scope:"all",process:"all"});
  assert.equal(result.length,19);
  assert.ok(result.some(x=>x.id==="UTET-57"));
  assert.ok(result.every(x=>x.indicatorStatus==="No evaluado"&&x.state==="Sin escaneo"));
});
