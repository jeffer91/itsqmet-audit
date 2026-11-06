"use strict";
/*
Nombre completo: history.store.js
Ruta: /core/history/history.store.js
Función:
- Persistir rutas independientes de UGPA/UTET, últimos resultados y descartes.
*/

const fsp = require("fs").promises;
const path = require("path");
const { app } = require("electron");
const {
  createDefaultHistory,
  normalizeHistory,
  normalizeDiscardedFindings
} = require("./history.schema");

const VALID_TYPES = new Set(["UGPA", "UTET"]);
const HISTORY_DIR_NAME = "history";
const HISTORY_FILE_NAME = "audit.history.json";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeType(value) {
  return safeText(value).toUpperCase();
}

function ensureType(value) {
  const type = normalizeType(value);
  if (!VALID_TYPES.has(type)) {
    throw new Error("Tipo no válido. Use UGPA o UTET.");
  }
  return type;
}

function getHistoryDirPath() {
  return path.join(app.getPath("userData"), HISTORY_DIR_NAME);
}

function getHistoryFilePath() {
  return path.join(getHistoryDirPath(), HISTORY_FILE_NAME);
}

async function ensureHistoryDirectory() {
  await fsp.mkdir(getHistoryDirPath(), { recursive: true });
}

let pending = Promise.resolve();
let recoveryInfo=null;
function getRecoveryInfo(){return recoveryInfo ? {...recoveryInfo}:null;}
async function recoverHistory(original){
  const backup=original+".bak";
  let restored;
  try{
    const raw=JSON.parse(await fsp.readFile(backup,"utf8"));
    if(!raw || typeof raw!=="object" || Array.isArray(raw) ||
      !Number.isInteger(raw.version) || typeof raw.ugpaSourcePath!=="string" ||
      typeof raw.utetSourcePath!=="string" || !Array.isArray(raw.discardedFindings)){
      throw new Error("Copia de seguridad incompleta.");
    }
    restored=normalizeHistory(raw);
  }catch(error){
    throw new Error("El historial está dañado y no hay una copia de seguridad válida. Se conservan los archivos originales: "+original,{cause:error});
  }
  const damaged=original+".corrupt-"+Date.now();
  await fsp.rename(original,damaged);
  try{await fsp.copyFile(backup,original);}
  catch(error){await fsp.rename(damaged,original).catch(()=>{});throw error;}
  recoveryInfo={restoredAt:new Date().toISOString(),damagedFilePath:damaged,
    message:"Se restauró la última copia del historial. El archivo dañado se conservó. Revisa los últimos cambios."};
  return restored;
}

function serialized(operation) {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}

async function writeHistory(history) {
  await ensureHistoryDirectory();
  const normalized = normalizeHistory(history);
  const target = getHistoryFilePath();
  const temporary = target + "." + process.pid + ".tmp";
  try {
    // Mantener una versión anterior recuperable antes del reemplazo atómico.
    try {
      await fsp.copyFile(target,target+".bak");
    } catch(error) {
      if(!error || error.code!=="ENOENT")throw error;
    }
    await fsp.writeFile(temporary, JSON.stringify(normalized, null, 2), "utf8");
    await fsp.rename(temporary, target);
  } finally {
    await fsp.rm(temporary, { force: true });
  }
  return normalized;
}

async function loadHistory() {
  await ensureHistoryDirectory();

  try {
    const raw = await fsp.readFile(getHistoryFilePath(), "utf8");
    return normalizeHistory(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return recoverHistory(getHistoryFilePath());
    }
    if (error && error.code === "ENOENT") {
      const empty = createDefaultHistory();
      await writeHistory(empty);
      return empty;
    }
    throw error;
  }
}

async function saveHistory(history) {
  const next = normalizeHistory(history);
  next.updatedAt = new Date().toISOString();
  return writeHistory(next);
}

async function setSourcePath(type, sourcePath) {
  const safeType = ensureType(type);
  const safePath = safeText(sourcePath);
  const history = await loadHistory();

  if (safeType === "UGPA") {
    if (
      safePath &&
      history.utetSourcePath &&
      safePath.toLowerCase() === history.utetSourcePath.toLowerCase()
    ) {
      throw new Error("La misma carpeta no puede asignarse a UGPA y UTET.");
    }
    if (
      history.ugpaSourcePath &&
      history.ugpaSourcePath.toLowerCase() !== safePath.toLowerCase()
    ) {
      history.ugpaResult = null;
    }
    history.ugpaSourcePath = safePath;
  } else {
    if (
      safePath &&
      history.ugpaSourcePath &&
      safePath.toLowerCase() === history.ugpaSourcePath.toLowerCase()
    ) {
      throw new Error("La misma carpeta no puede asignarse a UGPA y UTET.");
    }
    if (
      history.utetSourcePath &&
      history.utetSourcePath.toLowerCase() !== safePath.toLowerCase()
    ) {
      history.utetResult = null;
    }
    history.utetSourcePath = safePath;
  }

  history.updatedAt = new Date().toISOString();
  return writeHistory(history);
}

async function upsertScanResult(type, result) {
  const safeType = ensureType(type);
  if (!result || typeof result !== "object") {
    throw new Error("El resultado de escaneo no es válido.");
  }

  const history = await loadHistory();
  const selectedPath = safeText(
    result.source && result.source.selectedFolderPath
      ? result.source.selectedFolderPath
      : result.rootPath
  );

  if (safeType === "UGPA") {
    if (
      selectedPath &&
      history.utetSourcePath &&
      selectedPath.toLowerCase() === history.utetSourcePath.toLowerCase()
    ) {
      throw new Error("La misma carpeta no puede asignarse a UGPA y UTET.");
    }
    history.ugpaResult = clone(result);
    if (selectedPath) history.ugpaSourcePath = selectedPath;
  } else {
    if (
      selectedPath &&
      history.ugpaSourcePath &&
      selectedPath.toLowerCase() === history.ugpaSourcePath.toLowerCase()
    ) {
      throw new Error("La misma carpeta no puede asignarse a UGPA y UTET.");
    }
    history.utetResult = clone(result);
    if (selectedPath) history.utetSourcePath = selectedPath;
  }

  history.updatedAt = new Date().toISOString();
  return writeHistory(history);
}

async function clearScanResult(type) {
  const safeType = ensureType(type);
  const history = await loadHistory();

  if (safeType === "UGPA") history.ugpaResult = null;
  else history.utetResult = null;

  history.updatedAt = new Date().toISOString();
  return writeHistory(history);
}

async function saveDiscardedFindings(entries) {
  const history = await loadHistory();
  history.discardedFindings = normalizeDiscardedFindings(entries);
  history.updatedAt = new Date().toISOString();
  return writeHistory(history);
}

module.exports = {
  getHistoryFilePath,
  getRecoveryInfo,
  loadHistory: (...args) => serialized(() => loadHistory(...args)),
  saveHistory: (...args) => serialized(() => saveHistory(...args)),
  setSourcePath: (...args) => serialized(() => setSourcePath(...args)),
  upsertScanResult: (...args) => serialized(() => upsertScanResult(...args)),
  clearScanResult: (...args) => serialized(() => clearScanResult(...args)),
  saveDiscardedFindings: (...args) => serialized(() => saveDiscardedFindings(...args))
};
