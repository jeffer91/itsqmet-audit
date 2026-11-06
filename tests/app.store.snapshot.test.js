"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

test("la instantánea estable se reutiliza y se invalida al cambiar el historial",()=>{
  const values=new Map();
  const localStorage={
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value)
  };
  const window={localStorage};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","screens/shared/app.store.js"),"utf8"),{
    window,localStorage,JSON,Set,Date
  });
  const store=window.AppStore;
  const before=store.getSnapshot();
  assert.strictEqual(before,store.getSnapshot());
  assert.notStrictEqual(before,store.get());
  const history={ugpaResult:{ok:true,scannedAt:"2026-11-06T12:00:00Z",files:[],folders:[]},
    utetResult:null,discardedFindings:[]};
  store.setHistory(history);
  const after=store.getSnapshot();
  assert.notStrictEqual(before,after);
  assert.strictEqual(after,store.getSnapshot());
  assert.equal(after.ugpaResult.ok,true);
  assert.equal(after.ugpaResult.scannedAt,history.ugpaResult.scannedAt);
});
