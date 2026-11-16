"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"..");
const code=p=>fs.readFileSync(path.join(root,p),"utf8");
function boot(){
  const values=new Map();
  const window={localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
  const ctx=vm.createContext({window,Date});
  for(const p of ["screens/priority/priority.storage.js","screens/priority/priority.queue.js"])
    vm.runInContext(code(p),ctx,{filename:p});
  return window;
}
const doc=(status="pending")=>({id:"doc",workType:"document",status,title:"Informe",scope:"UTET"});
const folder=(status="pending")=>({id:"folder",workType:"quick",status,title:"Carpeta de período",scope:"UGPA"});

test("las seis secciones son únicas y los estados inactivos siguen en todos los registros",()=>{
  const w=boot(),section=w.PriorityQueue.sectionOf;
  assert.equal(section(doc()),"pending");
  assert.equal(section(doc("doing")),"doing");
  assert.equal(section(doc("signing")),"signing");
  assert.equal(section(doc("review")),"signing");
  assert.equal(section(doc("signed")),"archive");
  assert.equal(section(doc("done")),"archive");
  assert.equal(section(doc("verified")),"completed");
  assert.equal(section(doc("correction")),"corrections");
  for(const state of ["pending","doing","done","correction"])
    assert.equal(section(folder(state)),"corrections");
  assert.equal(section(folder("verified")),"completed");
  for(const state of ["blocked","snoozed","dismissed"])
    assert.equal(section(doc(state)),"other");
});

test("verificar una carpeta requiere confirmación independiente de PDF; el respaldo la conserva",()=>{
  const w=boot();
  assert.throws(()=>w.PriorityStorage.setStatus("folder","verified",""),/archivo/);
  w.PriorityStorage.setStatus("folder","doing");
  w.PriorityStorage.setStatus("folder","done");
  w.PriorityStorage.setStatus("folder","verified","",{structureConfirmed:true});
  const data=w.PriorityStorage.load(),entry=data.statuses.folder;
  assert.equal(entry.status,"verified");
  assert.equal(entry.structureVerified,true);
  assert.equal(entry.evidenceVerified,false);
  assert.equal(entry.evidencePath,"");
  const {validate}=require("../core/workspace/workspace.store.js");
  assert.equal(validate(data),data);
});

test("un documento completado continúa exigiendo evidencia",()=>{
  const w=boot();
  assert.throws(()=>w.PriorityStorage.setStatus("doc","verified",""),/archivo/);
  w.PriorityStorage.setStatus("doc","verified","",{evidencePath:"C:/definitivo.pdf"});
  assert.equal(w.PriorityStorage.load().statuses.doc.evidenceVerified,true);
});

test("la lista presenta todos los registros de una sección, con contadores y sin duplicados",()=>{
  const els=new Map(),document={
    getElementById(id){
      if(!els.has(id))els.set(id,{value:"all",innerHTML:"",textContent:"",hidden:false,
        className:"",style:{},setAttribute(n,v){this[n]=v;}});
      return els.get(id);
    },addEventListener(){}
  };
  document.getElementById("filterSearch").value="";
  const w=boot();
  vm.runInNewContext(code("screens/priority/priority.ui.js"),{window:w,document,Date});
  const rows=[{...doc(),id:"first",title:"Primer informe"},{...doc(),id:"second",title:"Segundo informe"},
    {...doc("signing"),id:"sign",title:"Informe en firma"},folder()];
  w.PriorityUI.render({processes:[]},{all:rows,items:[]});
  assert.match(els.get("priorityList").innerHTML,/Primer informe/);
  assert.match(els.get("priorityList").innerHTML,/Segundo informe/);
  assert.doesNotMatch(els.get("priorityList").innerHTML,/Informe en firma/);
  assert.equal(els.get("pendingCount").textContent,"2");
  assert.equal(els.get("signingCount").textContent,"1");
  w.PriorityUI.setTab("signing");
  assert.match(els.get("priorityList").innerHTML,/Informe en firma/);
  assert.doesNotMatch(els.get("priorityList").innerHTML,/Primer informe/);
  w.PriorityUI.setTab("corrections");
  assert.match(els.get("priorityList").innerHTML,/Carpeta de período/);
  assert.equal(els.get("correctionsCount").textContent,"1");
  rows[0].status="signing";
  w.PriorityUI.render({processes:[]},{all:rows,items:[]});
  assert.equal(els.get("pendingCount").textContent,"1");
  assert.equal(els.get("signingCount").textContent,"2");
});
