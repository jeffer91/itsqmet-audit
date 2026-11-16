"use strict";
const fs = require("node:fs");
const path = require("node:path");
const STATES = new Set(["pending","doing","review","done","blocked","snoozed","signing","correction","signed","verified","dismissed"]);
function validate(data) {
  if (!data || typeof data !== "object" || data.version !== 2 || !data.statuses ||
      typeof data.statuses !== "object" || Array.isArray(data.statuses) || !Array.isArray(data.activity) ||
      !Array.isArray(data.queue) || !data.stages || typeof data.stages !== "object")
    throw new Error("El archivo no es un respaldo de seguimiento válido.");
  for(const key of ["tasks","focus"])
    if(data[key]!==undefined && (!data[key] || typeof data[key]!=="object" || Array.isArray(data[key])))
      throw new Error("Estructura de seguimiento inválida: "+key);
  if(data.scanFiles!==undefined && data.scanFiles!==null && (!Array.isArray(data.scanFiles)||data.scanFiles.some(x=>typeof x!=="string")))
    throw new Error("Inventario del respaldo inválido.");
  if(Object.values(data.stages).some(x=>!Number.isInteger(x)||x<0))throw new Error("Etapas del respaldo inválidas.");
  for (const entry of Object.values(data.statuses)) {
    if (!entry || !STATES.has(entry.status)) throw new Error("El respaldo contiene estados no válidos.");
    if (entry.status === "verified" && !String(entry.evidencePath || "").trim() && entry.structureVerified !== true)
      throw new Error("Falta la referencia de evidencia del documento completado.");
  }
  if (Buffer.byteLength(JSON.stringify(data)) > 8 * 1024 * 1024) throw new Error("Respaldo demasiado grande (máximo 8 MB).");
  return data;
}
function createStore(file) {
  const read = target => validate(JSON.parse(fs.readFileSync(target,"utf8")));
  function load() {
    try { return {data:read(file),recovered:false}; }
    catch (error) {
      try { return {data:read(file+".bak"),recovered:true}; }
      catch (_) { if (fs.existsSync(file) || fs.existsSync(file+".bak")) throw new Error("No se pudo leer el seguimiento ni su copia. Conserva los archivos y restaura un respaldo."); }
      if (error.code !== "ENOENT") throw error;
      return {data:null,recovered:false};
    }
  }
  function save(data) {
    validate(data);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    // Nunca reemplazar una copia sana con un archivo corrupto.
    if (fs.existsSync(file)) { try { read(file); fs.copyFileSync(file,file+".bak"); } catch (e) { if (e.code) throw e; } }
    fs.writeFileSync(file+".tmp",JSON.stringify(data,null,2),"utf8");
    fs.renameSync(file+".tmp",file);
  }
  return {load,save};
}
module.exports = {createStore,validate};
