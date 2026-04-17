"use strict";
/*
Nombre completo: history.store.js
Ruta o ubicación: /core/history/history.store.js
Función o funciones:
- Administrar lectura y escritura del historial JSON único
- Guardar resultados de UGPA y UTET
- Guardar descartes y limpiar resultados individuales
- Apoyarse en el esquema central para mantener consistencia
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

function getHistoryDirPath() {
  return path.join(app.getPath("userData"), HISTORY_DIR_NAME);
}

function getHistoryFilePath() {
  return path.join(getHistoryDirPath(), HISTORY_FILE_NAME);
}

async function ensureHistoryDirectory() {
  await fsp.mkdir(getHistoryDirPath(), { recursive: true });
}

async function writeHistory(history) {
  await ensureHistoryDirectory();
  const normalized = normalizeHistory(history);

  await fsp.writeFile(
    getHistoryFilePath(),
    JSON.stringify(normalized, null, 2),
    "utf8"
  );

  return normalized;
}

async function loadHistory() {
  await ensureHistoryDirectory();

  try {
    const raw = await fsp.readFile(getHistoryFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    return normalizeHistory(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const emptyHistory = createDefaultHistory();
      await writeHistory(emptyHistory);
      return emptyHistory;
    }

    if (error && error.name === "SyntaxError") {
      const recoveredHistory = createDefaultHistory();
      await writeHistory(recoveredHistory);
      return recoveredHistory;
    }

    throw error;
  }
}

async function saveHistory(history) {
  const nextHistory = normalizeHistory(history);
  nextHistory.updatedAt = new Date().toISOString();
  return await writeHistory(nextHistory);
}

async function upsertScanResult(type, result) {
  const safeType = normalizeType(type);

  if (!VALID_TYPES.has(safeType)) {
    throw new Error("Tipo de resultado no válido. Use UGPA o UTET.");
  }

  if (!result || typeof result !== "object") {
    throw new Error("El resultado de escaneo no es válido.");
  }

  const history = await loadHistory();

  if (safeType === "UGPA") {
    history.ugpaResult = clone(result);
  } else {
    history.utetResult = clone(result);
  }

  history.updatedAt = new Date().toISOString();
  return await writeHistory(history);
}

async function clearScanResult(type) {
  const safeType = normalizeType(type);

  if (!VALID_TYPES.has(safeType)) {
    throw new Error("Tipo no válido para limpiar resultado.");
  }

  const history = await loadHistory();

  if (safeType === "UGPA") {
    history.ugpaResult = null;
  } else {
    history.utetResult = null;
  }

  history.updatedAt = new Date().toISOString();
  return await writeHistory(history);
}

async function saveDiscardedFindings(entries) {
  const history = await loadHistory();
  history.discardedFindings = normalizeDiscardedFindings(entries);
  history.updatedAt = new Date().toISOString();
  return await writeHistory(history);
}

module.exports = {
  getHistoryFilePath,
  loadHistory,
  saveHistory,
  upsertScanResult,
  clearScanResult,
  saveDiscardedFindings
};