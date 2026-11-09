"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"), path=require("node:path"), vm=require("node:vm");
function setup() {
  const store=new Map(), window={localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/priority/priority.sharepoint.js"),"utf8"),{window,URL});
  const folder="PROCESOS ESTRATEGICOS/UGPA-PRO-70-Capacitación # 100%";
  const scan={ok:true,rootPath:"C:/UGPA",source:{kind:"folder"},folders:[{path:"C:/UGPA/"+folder}],files:[]};
  return {api:window.PrioritySharePoint,scan,folder};
}
test("SharePoint codifica acentos, # y % y abre el padre de un PDF",()=>{
  const {api,scan,folder}=setup(), ctx=api.prepare({ugpaResult:scan});
  const url=new URL(api.folderUrl({scope:"UGPA",actionPath:"C:\\UGPA\\"+folder+"/Plan.pdf"},ctx));
  assert.equal(url.searchParams.get("id"),"/sites/UGPA-UnidaddeGestindeProcesosAcadmicos/Documentos compartidos/"+folder);
  assert.equal(url.hash,"");
  assert.equal(api.folderUrl({scope:"UGPA",actionPath:"C:/UGPA-otra/Plan.pdf"},ctx),"");
  assert.equal(api.folderUrl({scope:"UGPA",actionPath:"C:/UGPA/../privado"},ctx),"");
});
test("UTET necesita configuración independiente; ZIP no se vincula a la nube",()=>{
  const {api,scan}=setup();
  assert.equal(api.folderUrl({scope:"UTET",actionPath:"C:/UGPA"},api.prepare({utetResult:scan})),"");
  api.save({UGPA:api.load().UGPA,UTET:"https://itsqmet.sharepoint.com/sites/UTET/Documentos%20compartidos/Forms/AllItems.aspx?id=%2Fotra%2Fcarpeta"});
  const url=new URL(api.folderUrl({scope:"UTET",actionPath:"C:/UGPA"},api.prepare({utetResult:scan})));
  assert.equal(url.searchParams.get("id"),"/sites/UTET/Documentos compartidos");
  scan.source.kind="archive";
  assert.equal(api.folderUrl({scope:"UTET",actionPath:"C:/UGPA"},api.prepare({utetResult:scan})),"");
  assert.throws(()=>api.save({UGPA:"javascript:alert(1)"}));
  assert.throws(()=>api.save({UGPA:"https://sharepoint.com.evil.test/Forms/AllItems.aspx"}));
});
test("cada elemento agrupado conserva su propio enlace",()=>{
  const {api,scan,folder}=setup();
  const task=api.decorate({scope:"UGPA",actionPath:"C:/UGPA",groupItems:[{actionPath:"C:/UGPA/"+folder+"/a.pdf"}]},api.prepare({ugpaResult:scan}));
  assert.notEqual(task.sharePointUrl,task.groupItems[0].sharePointUrl);
});
