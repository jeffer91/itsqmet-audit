"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
test("las tarjetas y todos los pendientes muestran enlaces por caso y guardan bibliotecas",()=>{
 const elements=new Map(),events={};
 const element=()=>({value:"all",innerHTML:"",events:{},addEventListener(n,f){this.events[n]=f;}});
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(n,f){events[n]=f;}};
 document.getElementById("filterSearch").value="";
 const window={PrioritySharePoint:{load:()=>({UGPA:"https://itsqmet.sharepoint.com/",UTET:""})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/priority/priority.ui.js"),"utf8"),{window,document});
 let saved,opened;
 window.PriorityUI.bindEvents({onSaveSharePoint:v=>saved=v,onOpenPath:v=>opened=v});
 document.getElementById("sharePointUTET").value="biblioteca-ut";
 document.getElementById("btnSaveSharePoint").events.click();
 assert.equal(saved.UTET,"biblioteca-ut");
 const url="https://itsqmet.sharepoint.com/?id=%2Ftest";
 const item={id:"fix",scope:"UGPA",processNumber:"135",workType:"quick",sharePointUrl:url,groupItems:[{actual:"Ocubre",suggestedName:"Octubre",sharePointUrl:url}]};
 window.PriorityUI.render({processes:[]},{items:[item],all:[item]});
 for(const id of ["priorityList","backlogList"]){
  const html=document.getElementById(id).innerHTML;
  assert.ok(html.includes("Ocubre"));assert.ok(html.includes("Octubre"));assert.ok(html.includes(url));
 }
 events.click({target:{closest:()=>({dataset:{path:url},classList:{contains:c=>c==="js-open"}})}});
 assert.equal(opened,url);
});
