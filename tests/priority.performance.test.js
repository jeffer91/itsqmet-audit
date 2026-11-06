"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

function loadModule(paths) {
  const window={};
  const context=vm.createContext({window,Set,Map,Date});
  for(const name of paths) vm.runInContext(
    fs.readFileSync(path.join(__dirname,"..",name),"utf8"),context,{filename:name});
  return window;
}
function scan(n=1000){
  const folders=[],files=[];
  for(let i=0;i<n;i++){
    const parent="PROCESOS MISIONALES/UTET-PRO-96-Ejecucion/Grupo-"+i;
    folders.push({name:"Grupo-"+i,relativePath:parent,path:"C:/UTET/"+parent});
    if(i%2===0) files.push({name:"documento.docx",extension:".docx",
      relativePath:parent+"/documento.docx",path:"C:/UTET/"+parent+"/documento.docx"});
    if(i%3===0) files.push({name:"documento.pdf",extension:".pdf",
      relativePath:parent+"/documento.pdf",path:"C:/UTET/"+parent+"/documento.pdf"});
  }
  return {ok:true,type:"UTET",rootPath:"C:/UTET",rootName:"UTET",folders,files};
}
test("las reglas de carpetas mantienen sus resultados con un inventario grande",()=>{
  const w=loadModule(["screens/rules/rules.types.js","screens/rules/rules.file-policy.js",
    "screens/rules/rulesets/rule.empty-folders.js","screens/rules/rulesets/rule.folders-without-pdf.js"]);
  const data=scan(1200);
  const blank=w.RuleEmptyFolders.run({scope:"UTET",scanData:data});
  const without=w.RuleFoldersWithoutPdf.run({scope:"UTET",scanData:data});
  assert.equal(blank.length,400);
  assert.equal(without.length,400);
});
test("la detección de procesos ignora correctamente subcarpetas proceso anidadas",()=>{
  const w=loadModule(["screens/rules/rules.types.js"]);
  const folders=[
    {name:"UTET-PRO-96-Trabajo",relativePath:"PROCESOS MISIONALES/UTET-PRO-96-Trabajo"},
    {name:"UTET-PRO-57-Articulo",relativePath:"PROCESOS MISIONALES/UTET-PRO-96-Trabajo/UTET-PRO-57-Articulo"},
    {name:"UTET-PRO-97-Induccion",relativePath:"PROCESOS MISIONALES/UTET-PRO-97-Induccion"}
  ];
  const index=w.RulesTypes.buildScanIndex({folders,files:[]});
  assert.equal(w.RulesTypes.findProcessFolders(index,"UTET").length,2);
});
