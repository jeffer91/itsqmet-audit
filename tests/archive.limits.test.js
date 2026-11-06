"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateArchiveLimits,readRarList}=require("../core/archive/archive.extract");
test("la importación no acepta archivos descomprimidos desproporcionados",()=>{
  assert.throws(()=>validateArchiveLimits(50000,1),/demasiadas entradas/);
  assert.throws(()=>validateArchiveLimits(1,20*1024*1024*1024),/límite de seguridad/);
});
test("la inspección RAR comprueba tamaño y cantidad de entradas",()=>{
  assert.deepEqual(readRarList("Path = a.pdf\nSize = 2048\n\nPath = b.pdf\nSize = 1024\n"),{entries:2,bytes:3072});
  assert.throws(()=>readRarList("Path = bad.pdf\nSize = 99999999999\n"),/límite de seguridad/);
  assert.throws(()=>readRarList("no entry"),/inventario interno/);
});
