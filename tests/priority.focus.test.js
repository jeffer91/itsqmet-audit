"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),os=require("node:os");
function boot(api) {
 const values=new Map();
 const window={api,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
 for(const name of ["storage","workflow","queue"])vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/priority/priority."+name+".js"),"utf8"),{window});
 return window;
}
const task=(id,extra={})=>({id,scope:"UTET",processNumber:"57",workType:"document",level:"high",title:"Documento "+id,periodLabel:"Abril 2026 – Septiembre 2026",documentId:id,pathLabel:"PRO-57",...extra});
function build(w,tasks) {const board=w.PriorityQueue.build({tasks},w.PriorityStorage.load());w.PriorityStorage.remember(board.all,board.focusIds);return board;}
test("un documento fijado permanece al refrescar y En firma avanza conservando fecha y responsable",()=>{
 const w=boot(),a=task("a"),b=task("b");
 assert.equal(build(w,[a,b]).focus.documents.id,"a");
 assert.equal(build(w,[a,b,task("urgente",{level:"max"})]).focus.documents.id,"a");
 w.PriorityStorage.setStatus("a","signing","Esperando Rector",{responsible:"Rector"});
 const board=build(w,[a,b]);assert.equal(board.focus.documents.id,"b");
 assert.equal(board.all.find(x=>x.id==="a").responsible,"Rector");
 const sent=w.PriorityStorage.load().statuses.a.signatureSentAt;
 w.PriorityStorage.addNote("a",{responsible:"Rector",note:"Recordatorio registrado"});
 assert.equal(w.PriorityStorage.load().statuses.a.signatureSentAt,sent);
 assert.equal(w.PriorityStorage.load().statuses.a.evidenceVerified,false);
});
test("la firma pendiente no desaparece si el nuevo escaneo deja de generar su hallazgo",()=>{
 const w=boot();build(w,[task("a"),task("b")]);w.PriorityStorage.setStatus("a","signing");
 let b=build(w,[task("b")]);assert.equal(b.all.find(x=>x.id==="a").trackedOnly,true);
 assert.equal(b.focus.documents.id,"b");
 w.PriorityStorage.setStatus("a","correction","Corregir el período");
 w.PriorityStorage.setStatus("b","done");b=build(w,[task("b")]);assert.equal(b.focus.documents.id,"a");
});
test("dependencias pendientes y correcciones estructurales nunca aparecen como documento actual",()=>{
 const w=boot();const b=build(w,[task("guide",{blockedBy:["Acta aprobada"]}),task("doc"),task("fix",{workType:"quick"})]);
 assert.equal(b.focus.documents,undefined);assert.equal(b.focus.folders.id,"fix");
});
test("la devolución conserva etapas y completar exige evidencia",()=>{
 const w=boot();w.PriorityStorage.completeStep("a",0,5);w.PriorityStorage.setStatus("a","signing");
 w.PriorityStorage.setStatus("a","correction","Corregir firma");w.PriorityStorage.resetTask("a");
 assert.equal(w.PriorityStorage.load().stages.a,1);
 assert.throws(()=>w.PriorityStorage.setStatus("a","verified"),/archivo/);
 w.PriorityStorage.setStatus("a","verified","",{evidencePath:"C:/documento.pdf"});
 assert.equal(build(w,[task("a")]).focus.documents,undefined);
});
test("reconciliar un ID cambiado conserva estado sin mezclar carreras o períodos",()=>{
 const w=boot();const a=task("old",{resolvedDocumentId:"rgi1",careerKey:"enfermeria"});
 w.PriorityStorage.reconcile([a]);build(w,[a]);w.PriorityStorage.setStatus(a.id,"signing");
 const b={...a,id:"new"};w.PriorityStorage.reconcile([b]);
 assert.equal(w.PriorityStorage.load().statuses.new.status,"signing");assert.equal(w.PriorityStorage.load().statuses.old,undefined);
 w.PriorityStorage.reconcile([{...b,id:"other",careerKey:"administracion"}]);assert.equal(w.PriorityStorage.load().statuses.other,undefined);
});
test("reconciliación ambigua mantiene los seguimientos separados",()=>{
 const w=boot(),a=task("old",{resolvedDocumentId:"rgi1"});w.PriorityStorage.reconcile([a]);build(w,[a]);w.PriorityStorage.setStatus(a.id,"signing");
 w.PriorityStorage.reconcile([{...a,id:"one"},{...a,id:"two"}]);assert.equal(w.PriorityStorage.load().statuses.one,undefined);
 assert.equal(w.PriorityStorage.load().statuses.old.status,"signing");
});
test("respaldo persistente recupera avance sin localStorage y reporta errores de escritura",async()=>{
 let disk=null;let fail=false;
 const api={workspace:{load:async()=>({ok:true,data:disk}),save:async data=>{if(fail)return {ok:false,error:"Disco lleno"};disk=data;return {ok:true};}}};
 const w=boot(api);await w.PriorityStorage.initialize();build(w,[task("a")]);w.PriorityStorage.setStatus("a","signing");await w.PriorityStorage.flush();
 const other=boot(api);await other.PriorityStorage.initialize();assert.equal(other.PriorityStorage.load().statuses.a.status,"signing");
 fail=true;other.PriorityStorage.setStatus("a","signed");await assert.rejects(other.PriorityStorage.flush(),/Disco lleno/);
});
test("respaldo atómico recupera copia sana y rechaza archivos ajenos",()=>{
 const {createStore,validate}=require("../core/workspace/workspace.store");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"audit-backup-")),file=path.join(dir,"state.json"),store=createStore(file);
 try {
  const w=boot();store.save(w.PriorityStorage.load());w.PriorityStorage.setStatus("a","signing");store.save(w.PriorityStorage.load());
  fs.writeFileSync(file,"corrupt");assert.equal(store.load().recovered,true);
  store.save(store.load().data);assert.equal(store.load().recovered,false);
  assert.throws(()=>validate({version:2,statuses:{x:{status:"inventado"}},activity:[],queue:[],stages:{}}),/estados/);
  assert.throws(()=>validate({foo:1}),/respaldo/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test("diferencia de escaneo distingue archivos nuevos y rutas desaparecidas",()=>{
 const w=boot();assert.equal(w.PriorityStorage.compareScan(["a","b"]),null);
 const delta=w.PriorityStorage.compareScan(["b","c"]);assert.equal(delta.added,1);assert.equal(delta.removed,1);
});
test("la nueva lista muestra todos los pendientes y advierte dependencias",()=>{
 const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{value:"all",innerHTML:"",textContent:"",style:{}});return elements.get(id);},addEventListener(){}};
 document.getElementById("filterSearch").value="";
 const w=boot();vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/priority/priority.ui.js"),"utf8"),{window:w,document});
 const selected=task("selected"),blocked=task("blocked",{level:"max",blockedBy:["Acta"]});
 w.PriorityUI.render({processes:[]},{all:[blocked,selected],items:[blocked],focus:{documents:selected}});
 const html=elements.get("priorityList").innerHTML;
 assert.match(html,/Documento selected/);assert.match(html,/Documento blocked/);
 assert.equal((html.match(/class="task-card work-item"/g)||[]).length,2);
 assert.match(html,/Necesita un paso previo/);
 assert.match(html,/Empezar/);
});
test("si ambas copias fallan, no sobrescribe y permite restaurar un respaldo válido",async()=>{
 let writes=0;const restored=boot().PriorityStorage.load();
 const w=boot({workspace:{load:async()=>({ok:false,error:"Copias corruptas"}),save:async()=>{writes++;return {ok:true};},import:async()=>({ok:true,data:restored})}});
 const result=await w.PriorityStorage.initialize();assert.match(result.error,/corruptas/);
 w.PriorityStorage.setStatus("x","signing");await assert.rejects(w.PriorityStorage.flush(),/corruptas/);assert.equal(writes,0);
 await w.PriorityStorage.importBackup();w.PriorityStorage.setStatus("x","signing");await w.PriorityStorage.flush();assert.equal(writes,1);
});
