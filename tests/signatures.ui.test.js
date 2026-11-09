"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
test("Firmas inicia, consulta resultados y conecta los dos botones de paginación",async()=>{
  const elements=new Map(),created=[];
  function element(){return {value:"",hidden:false,events:{},addEventListener(n,f){this.events[n]=f;},insertAdjacentElement(){}};}
  const document={createElement(){const e=element();created.push(e);return e;},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}};
  const calls=[];
  const window={AppNav:{render(){}},api:{signatures:{list:async options=>{calls.push(options);return {ok:true,records:[],totalMatched:81};},onUpdated(){}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../screens/signatures/signatures.app.js"),"utf8"),{window,document});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);
  assert.equal(calls[0].offset,0);
  assert.equal(created[0].hidden,true);
  created[1].events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[1].offset,40);
  assert.equal(created[0].hidden,false);
  created[0].events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[2].offset,0);
  assert.equal(typeof elements.get("scan").events.click,"function");
});
