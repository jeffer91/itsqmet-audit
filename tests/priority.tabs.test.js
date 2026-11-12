"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const file=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
test("Documentos y Carpetas son vistas independientes; se conservan los enlaces SharePoint",()=>{
  const els=new Map(),document={
    getElementById(id){
      if(!els.has(id))els.set(id,{value:"all",innerHTML:"",textContent:"",hidden:false,
        className:"",style:{},setAttribute(n,v){this[n]=v;}});
      return els.get(id);
    },addEventListener(){}
  };
  document.getElementById("filterSearch").value="";
  const window={};
  const ctx=vm.createContext({window,document,Map,Set,Date});
  vm.runInContext(file("screens/priority/priority.periods.js"),ctx);
  vm.runInContext(file("screens/priority/priority.ui.js"),ctx);
  const doc={id:"doc",scope:"UTET",processNumber:"57",workType:"document",
    title:"Elaborar informe metodológico",periodLabel:"Febrero 2025 a Mayo 2025"};
  const folder={id:"group",origin:"group",scope:"UTET",processNumber:"57",
    workType:"quick",title:"Carpeta de período mal nombrada",groupItems:[{
      actual:"UTET-PRO-57-Febrero 2025 a Mayo 2025",
      suggestedName:"UTET-PRO-57-Febrero 2025–Mayo 2025",
      sharePointUrl:"https://itsqmet.sharepoint.com/ejemplo"
    }]};
  window.PriorityUI.render({processes:[]},{items:[doc,folder],all:[doc,folder],openCount:2});
  assert.match(els.get("priorityList").innerHTML,/Elaborar informe metodológico/);
  assert.doesNotMatch(els.get("priorityList").innerHTML,/Carpeta de período mal nombrada/);
  assert.equal(els.get("tabDocuments")["aria-selected"],"true");
  assert.match(els.get("periodsStatus").textContent,/5 PVC/);
  window.PriorityUI.setTab("folders");
  assert.match(els.get("priorityList").innerHTML,/Carpeta de período mal nombrada/);
  assert.doesNotMatch(els.get("priorityList").innerHTML,/Elaborar informe metodológico/);
  assert.match(els.get("priorityList").innerHTML,/Abrir carpeta en SharePoint/);
  assert.equal(els.get("tabFolders")["aria-selected"],"true");
  assert.equal(els.get("foldersCount").textContent,"1");
  window.PriorityUI.setTab("documents");
  assert.equal(els.get("documentsCount").textContent,"1");
});
