"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"), path=require("node:path"), vm=require("node:vm");
function setup() {
  const store=new Map(), window={localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/priority/priority.sharepoint.js"),"utf8"),{window,URL});
  const folder="PROCESOS ESTRATEGICOS/UGPA-PRO-70-Capacitación # 100%";
  const scan={ok:true,rootPath:"C:/UGPA",source:{kind:"folder"},folders:[{path:"C:/UGPA/"+folder}],files:[]};
  return {api:window.PrioritySharePoint,scan,folder,store};
}
test("SharePoint codifica acentos, # y % y abre el padre de un PDF",()=>{
  const {api,scan,folder}=setup(), ctx=api.prepare({ugpaResult:scan});
  const url=new URL(api.folderUrl({scope:"UGPA",actionPath:"C:\\UGPA\\"+folder+"/Plan.pdf"},ctx));
  assert.equal(url.searchParams.get("id"),"/sites/UGPA-UnidaddeGestindeProcesosAcadmicos/Documentos compartidos/"+folder);
  assert.equal(url.hash,"");
  assert.equal(api.folderUrl({scope:"UGPA",actionPath:"C:/UGPA-otra/Plan.pdf"},ctx),"");
  assert.equal(api.folderUrl({scope:"UGPA",actionPath:"C:/UGPA/../privado"},ctx),"");
});
test("UTET se enlaza automáticamente y los ZIP no generan enlaces",()=>{
  const {api,scan}=setup();
  const auto=new URL(api.folderUrl({scope:"UTET",actionPath:"C:/UGPA"},api.prepare({utetResult:scan})));
  assert.equal(auto.searchParams.get("id"),"/sites/UTET-TitulacinyEficienciaTerminal/Documentos compartidos");
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

test("UTET abre el período real del PRO-96 sin pegar una URL por carpeta",()=>{
  const {api,store}=setup();
  const base="PROCESOS MISIONALES/EJECUCION/UTET-PRO-96-Ingreso al Trabajo de Titulación/UTET-PRO-96-Designación de tutores para la Gestión del trabajo de titulación";
  const oldName="UTET-PRO-96-Abril 2025 Septiembre 2025";
  const scan={ok:true,rootPath:"C:/UTET",source:{kind:"folder"},folders:[
    {path:"C:/UTET/"+base,relativePath:base},
    {path:"C:/UTET/"+base+"/"+oldName,relativePath:base+"/"+oldName}
  ]};
  // La versión anterior guardaba una biblioteca UTET vacía.
  store.set("audit_sharepoint_libraries_v1",JSON.stringify({UTET:""}));
  assert.match(api.load().UTET,/UTET-TitulacinyEficienciaTerminal/);
  const ctx=api.prepare({utetResult:scan});
  const actual=new URL(api.folderUrl({scope:"UTET",actionPath:"C:/UTET/"+base+"/"+oldName},ctx));
  assert.equal(actual.pathname,"/sites/UTET-TitulacinyEficienciaTerminal/Documentos%20compartidos/Forms/AllItems.aspx");
  assert.equal(actual.searchParams.get("id"),
    "/sites/UTET-TitulacinyEficienciaTerminal/Documentos compartidos/"+base+"/"+oldName);
  assert.equal(actual.hash,"");
  // El vínculo de la carpeta documental principal es diferente al del período.
  const parent=new URL(api.folderUrl({scope:"UTET",actionPath:"C:/UTET/"+base},ctx));
  assert.equal(parent.searchParams.get("id"),"/sites/UTET-TitulacinyEficienciaTerminal/Documentos compartidos/"+base);
  // Si se auditó un archivo, abrir la carpeta real, no una URL de archivo supuesta.
  const file=new URL(api.folderUrl({scope:"UTET",actionPath:"C:/UTET/"+base+"/"+oldName+"/faltante.pdf"},ctx));
  assert.equal(file.searchParams.get("id"),actual.searchParams.get("id"));
  // Si la acción apunta al directorio de la unidad, usar la carpeta del hallazgo inventariada.
  const finding=new URL(api.folderUrl({scope:"UTET",actionPath:"C:/UTET",pathLabel:base+"/"+oldName},ctx));
  assert.equal(finding.searchParams.get("id"),actual.searchParams.get("id"));
  assert.equal(api.folderUrl({scope:"UTET",actionPath:"C:/otro/"+base+"/"+oldName},ctx),"");
});

test("enlace UTET propio se conserva y una configuración vacía vuelve al sitio institucional",()=>{
  const {api}=setup();
  const configured=api.save({UGPA:api.load().UGPA,
    UTET:"https://itsqmet.sharepoint.com/sites/UTET-TitulacinyEficienciaTerminal/Documentos%20compartidos/Forms/AllItems.aspx?id=%2Fcarpeta%2Fsubcarpeta"});
  assert.equal(new URL(configured.UTET).search,"");
  assert.equal(api.load().UTET,configured.UTET);
  assert.match(api.save({UGPA:"",UTET:""}).UTET,/UTET-TitulacinyEficienciaTerminal/);
});
