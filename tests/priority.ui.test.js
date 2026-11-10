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

test("Priorización distingue documento nuevo, referencia antigua y creación condicionada",()=>{
 const elements=new Map(),document={
  getElementById(id){if(!elements.has(id))elements.set(id,{value:"all",innerHTML:"",textContent:"",hidden:false});
   return elements.get(id);},
  addEventListener(){}
 };
 document.getElementById("filterSearch").value="";
 const window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/priority/priority.ui.js"),"utf8"),{window,document});
 const doc={id:"doc",scope:"UGPA",processNumber:"70",workType:"document",
  officialName:"Plan Semestral de Capacitación Docente",resolvedDocumentId:"rgi2",
  proposedDocumentName:"UGPA-RGI2-01-PRO-70-2026-10-Plan Semestral",
  referenceFileName:"UGPA-RGI2-01-PRO-70-2026-04-Plan Semestral.pdf",
  sourceFileName:"",expectedTemplate:"UGPA-RGI2-0X-PRO-70-AÑO-MES",namingComplete:true};
 window.PriorityUI.render({processes:[]},{items:[doc],all:[doc]});
 for(const id of ["priorityList","backlogList"]){
  const html=document.getElementById(id).innerHTML;
  assert.match(html,/Esto es lo nuevo/);
  assert.match(html,/Esto es lo antiguo/);
  assert.match(html,/Si no hay, crea esto/);
  assert.match(html,/2026-10-Plan Semestral/);
  assert.match(html,/2026-04-Plan Semestral/);
 }
 const now={...doc,sourceFileName:"Plan localizado.pdf",referenceFileName:""};
 window.PriorityUI.render({processes:[]},{items:[now],all:[now]});
 const html=document.getElementById("priorityList").innerHTML;
 assert.match(html,/Archivo localizado en el período objetivo/);
 assert.match(html,/Primero verifica el archivo localizado/);
 assert.match(html,/No se encontró referencia/);
 const review={id:"signature",scope:"UTET",title:"Revisar firma",workType:"review"};
 window.PriorityUI.render({processes:[]},{items:[review],all:[review]});
 assert.doesNotMatch(document.getElementById("priorityList").innerHTML,/Si no hay, crea esto/);
});

test("tarjeta visual muestra acción, nombres individuales, ruta y pasos sin duplicar el nombre",()=>{
 const elements=new Map();
 const document={getElementById(id){if(!elements.has(id))elements.set(id,{value:"all",innerHTML:"",
  textContent:"",hidden:false,style:{}});return elements.get(id);},addEventListener(){}};
 document.getElementById("filterSearch").value="";
 const window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/priority/priority.ui.js"),"utf8"),{window,document});
 const old="UGPA-PRO-31-Abril 2026–Septiembre 2027",next="UGPA-PRO-31-Octubre 2026–Septiembre 2027";
 const group={id:"group31",origin:"group",scope:"UGPA",processNumber:"31",title:"Carpeta de período mal nombrada",
   workType:"quick",groupItems:[
     {actual:old,pathLabel:"PROCESOS ESTRATEGICOS/UGPA-PRO-31/"+old,decision:{action:"CONSOLIDAR",
       oldName:old,newName:next,summary:"Revisar carpeta interior antes de renombrar."}},
     {actual:old,pathLabel:"PROCESOS ESTRATEGICOS/UGPA-PRO-31/"+old+"/"+old,
       decision:{action:"CONSOLIDAR",oldName:old,newName:"",isNestedDuplicate:true,
         summary:"No renombrar por separado."}}
   ],decision:{action:"CONSOLIDAR",certainty:"media",needsConfirmation:true,
     summary:"Resolver las rutas relacionadas sin renombrar duplicados por separado.",
     steps:["Abrir las dos carpetas.","Comprobar el contenido.","Volver a escanear."]}};
 window.PriorityUI.render({processes:[]},{items:[group],all:[group],openCount:1,completedToday:0});
 const html=document.getElementById("priorityList").innerHTML;
 assert.match(html,/CONSOLIDAR/);
 assert.match(html,/Qué debes hacer/);
 assert.match(html,/Esto es lo antiguo|ANTIGUO/);
 assert.match(html,/Esto es lo nuevo/);
 assert.ok(html.includes(next));
 assert.match(html,/Consolidar con carpeta contenedora/);
 assert.doesNotMatch(html,/Por confirmar; revisar antes de renombrar/);
});
