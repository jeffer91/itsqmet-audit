"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const file=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
function loadPeriods() {
  const window={},ctx=vm.createContext({window,Map,Set,Date,Number,Array});
  vm.runInContext(file("screens/priority/priority.periods.js"),ctx);
  return window.PriorityPeriods;
}
function loadRules(scope,processNumber,folderNames) {
  const window={},ctx=vm.createContext({window,Map,Set});
  vm.runInContext(file("screens/rules/rules.types.js"),ctx);
  vm.runInContext(file("screens/rules/manual/manual.catalog.js"),ctx);
  vm.runInContext(file("screens/rules/rulesets/rule.period-folder-format.js"),ctx);
  const base="PROCESOS MISIONALES/EJECUCION/"+scope+"-PRO-"+processNumber+"-Gestión";
  const prefix=scope+"-PRO-"+processNumber;
  window.RulesTypes.buildScanIndex=scan=>({folders:scan.folders,files:[]});
  window.RulesTypes.findProcessFolders=()=>[{name:prefix+"-Gestión",
    relativePath:base,processValidation:{valid:true,processNumber,
      processCode:"PRO-"+processNumber}}];
  window.RulesTypes.isDescendantOf=(v,parent)=>v.startsWith(parent+"/");
  const scan={ok:true,rootPath:"C:/Instituto/"+scope,rootName:scope,
    folders:folderNames.map(name=>({name,relativePath:base+"/"+name,
      path:"C:/Instituto/"+scope+"/"+base+"/"+name}))};
  return {window,findings:window.RulePeriodFolderFormat.run({scope,scanData:scan})};
}
test("Firebase: los siete períodos conocidos distinguen regulares y PVC",()=>{
  const periods=loadPeriods(),all=periods.getItems();
  assert.equal(all.length,7);
  assert.equal(all.filter(x=>x.type==="regular").length,2);
  assert.equal(all.filter(x=>x.type==="PVC").length,5);
  assert.equal(periods.classifyLabel("Febrero 2025 a Mayo 2025").type,"PVC");
  assert.equal(periods.classifyLabel("Octubre 2025–Marzo 2026").type,"regular");
  assert.equal(periods.classifyLabel("Febrero 2025 a Mayo 202").type,"sin determinar");
  assert.equal(periods.getStatus().source,"referencia");
});
test("Firebase: la sincronización solo conserva períodos activos y no eliminados",()=>{
  const p=loadPeriods();
  assert.equal(p.setPeriods([{periodoId:"2027-04__2027-09",activo:true,eliminado:false},
    {periodoId:"2027-05__2027-11",activo:false},
    {periodoId:"2027-08__2028-01",eliminado:true},
    {periodoId:"../../other"}]),true);
  assert.equal(p.getItems().length,1);
  assert.equal(p.getItems()[0].type,"regular");
  assert.equal(p.getStatus().source,"Firebase");
});
test("UTET PRO-57: meses PVC se conservan; solo corregir separador",()=>{
  const {findings}=loadRules("UTET","57",["UTET-PRO-57-Febrero 2025 a Mayo 2025"]);
  assert.equal(findings.length,1);
  assert.equal(findings[0].title,"Carpeta de período mal nombrada");
  assert.equal(findings[0].expectedValue,"UTET-PRO-57-Febrero 2025–Mayo 2025");
  assert.doesNotMatch(findings[0].description,/seis meses|6 meses|duración/i);
});
test("UTET PRO-57: un PVC correcto no se acusa de duración semestral inválida",()=>{
  const {findings}=loadRules("UTET","57",["UTET-PRO-57-Febrero 2025–Mayo 2025"]);
  assert.equal(findings.length,0);
});
test("UTET: un período de longitud variable se acepta sin inventar fechas",()=>{
  const {findings}=loadRules("UTET","96",["UTET-PRO-96-Noviembre 2025–Mayo 2026"]);
  assert.equal(findings.length,0);
});
test("UTET PRO-57: año incompleto requiere verificación y nunca se reconstruye",()=>{
  const {window,findings}=loadRules("UTET","57",["UTET-PRO-57-Febrero 2025 a Mayo 202"]);
  assert.equal(findings.length,1);
  vm.runInNewContext(file("screens/priority/priority.decisions.js"),{window,Map,Set});
  const finding=findings[0];
  const decision=window.PriorityDecisions.folderDecision({
    scope:"UTET",processNumber:"57",title:finding.title,
    actual:finding.actualValue,pathLabel:finding.relativePath,
    suggestedName:finding.expectedValue
  },{indices:{UTET:{folders:[]}},manual:window.AuditManualCatalog},[]);
  assert.equal(decision.action,"VERIFICAR");
  assert.equal(decision.newName,"");
});
test("UGPA continúa aplicando su propia duración por proceso",()=>{
  const {findings}=loadRules("UGPA","70",["UGPA-PRO-70-Abril 2026–Junio 2026"]);
  assert.ok(findings.some(x=>x.title==="Duración de período incorrecta"));
});
test("IPC Firebase consulta solo periodos y no retorna información estudiantil",async()=>{
  const module={exports:{}},calls=[];
  const fakeFetch=async(url,options)=>{
    calls.push({url:String(url),options});
    return {ok:true,json:async()=>({documents:[{
      name:"projects/x/databases/(default)/documents/periodos/2025-02__2025-05",
      fields:{periodoId:{stringValue:"2025-02__2025-05"},
        label:{stringValue:"Febrero 2025 a Mayo 2025"},
        activo:{booleanValue:true},eliminado:{booleanValue:false},
        cedula:{stringValue:"NO DEBE DEVOLVERSE"}}}]})};
  };
  vm.runInNewContext(file("core/ipc/periods.ipc.js"),{
    module,exports:module.exports,require:()=>({ipcMain:{handle(){}}}),
    URL,AbortSignal,fetch:fakeFetch
  });
  const result=await module.exports.readPeriods();
  assert.equal(result.ok,true);
  assert.equal(result.periods.length,1);
  assert.deepEqual(Object.keys(result.periods[0]).sort(),["activo","eliminado","label","periodoId"]);
  assert.match(calls[0].url,/\/documents\/periodos\?/);
  assert.equal(calls[0].options.method,"GET");
});
