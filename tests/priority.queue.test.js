"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function env() {
  const values = new Map();
  const window = { localStorage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  }};
  const context = vm.createContext({ window, Date, Set, Map });
  for(const file of ["priority.storage.js","priority.workflow.js","priority.queue.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..","screens","priority",file),"utf8"),context);
  return {window,values};
}
const task=(id,area,workType,level="high",processNumber=id)=>({
  id,scope: id.startsWith("UTET")?"UTET":"UGPA",processNumber,area,workType,level,
  title:"Plan de resultados "+id,reason:"Pendiente vigente",status:"pending"
});
function sample(){
  return {tasks:[
    task("UGPA-31","strategic","document","max","31"),
    task("UGPA-70","strategic","document","high","70"),
    task("UTET-95","strategic","document","max","95"),
    task("UGPA-60","strategic","document","max","60"),
    task("UTET-93","mission","document","max","93"),
    task("UTET-58","mission","quick","high","58"),
    task("UGPA-251","mission","review","medium","251")
  ],inconsistencies:[]};
}
test("sin escaneo no se inventan acciones",()=>{
  const e=env();const board=e.window.PriorityQueue.build({tasks:[],inconsistencies:[]},e.window.PriorityStorage.load());
  assert.equal(board.items.length,0);
});
test("se seleccionan cinco acciones con variedad de procesos y tipos",()=>{
  const e=env(),board=e.window.PriorityQueue.build(sample(),e.window.PriorityStorage.load());
  assert.equal(board.items.length,5);
  assert.ok(board.items.some(x=>x.workType==="quick"));
  assert.ok(board.items.some(x=>x.workType==="review"));
  assert.ok(board.items.filter(x=>x.workType==="document"&&x.area==="strategic").length>=2);
  assert.equal(new Set(board.queueIds).size,5);
});
test("la cola se conserva y repone una tarea terminada sin perder avances",()=>{
  const e=env();let board=e.window.PriorityQueue.build(sample(),e.window.PriorityStorage.load());
  e.window.PriorityStorage.setQueue(board.queueIds);
  const old=board.queueIds.slice(),done=old[0];
  e.window.PriorityStorage.setStatus(done,"done");
  board=e.window.PriorityQueue.build(sample(),e.window.PriorityStorage.load());
  assert.equal(board.items.length,5);
  assert.ok(!board.queueIds.includes(done));
  assert.ok(old.slice(1).every(id=>board.queueIds.includes(id)));
});
test("un proyecto estratégico avanza por pasos y no valida la evidencia",()=>{
  const e=env(),id="UGPA-31";let taskItem=e.window.PriorityWorkflow.decorate(task(id,"strategic","document"),e.window.PriorityStorage.load());
  assert.equal(taskItem.large,true);
  assert.equal(taskItem.stepIndex,0);
  e.window.PriorityStorage.completeStep(id,0,taskItem.stepCount);
  taskItem=e.window.PriorityWorkflow.decorate(task(id,"strategic","document"),e.window.PriorityStorage.load());
  assert.equal(taskItem.stepIndex,1);
  for(let i=1;i<taskItem.stepCount;i++)e.window.PriorityStorage.completeStep(id,i,taskItem.stepCount);
  const state=e.window.PriorityStorage.load();
  assert.equal(state.statuses[id].status,"done");
  assert.equal(state.statuses[id].evidenceVerified,false);
  assert.equal(e.window.PriorityStorage.completedToday(state),taskItem.stepCount);
});
test("bloquear o posponer saca de cola; reactivar conserva registro",()=>{
  const e=env(),vm=sample();let board=e.window.PriorityQueue.build(vm,e.window.PriorityStorage.load());
  const id=board.items[0].id;
  e.window.PriorityStorage.setStatus(id,"blocked","Faltan resultados");
  board=e.window.PriorityQueue.build(vm,e.window.PriorityStorage.load());
  assert.ok(!board.queueIds.includes(id));
  e.window.PriorityStorage.resetTask(id);
  assert.equal(e.window.PriorityStorage.load().statuses[id].status,"pending");
  board=e.window.PriorityQueue.build(vm,e.window.PriorityStorage.load());
  assert.ok(board.all.some(x=>x.id===id&&x.status==="pending"));
});
test("se recupera estado anterior guardado en localStorage",()=>{
  const e=env();e.values.set("audit_priority_progress_v1",JSON.stringify({"UGPA-31":"doing"}));
  assert.equal(e.window.PriorityStorage.load().statuses["UGPA-31"].status,"doing");
  e.window.PriorityStorage.setStatus("UGPA-31","pending");
  assert.equal(e.window.PriorityStorage.load().statuses["UGPA-31"].status,"pending");
});
test("las observaciones repetidas se agrupan y no monopolizan la cola",()=>{
  const e=env(),vm=sample();
  vm.inconsistencies=[{scope:"UGPA",processNumber:"134",category:"names",title:"Nombre incorrecto",
    area:"mission",groupCount:1081,workType:"review",
    items:[{title:"Nombre incorrecto",actual:"Documento firmado.pdf"}]}];
  const board=e.window.PriorityQueue.build(vm,e.window.PriorityStorage.load());
  assert.equal(board.items.length,5);
  assert.equal(board.all.filter(x=>x.origin==="group").length,1);
});
