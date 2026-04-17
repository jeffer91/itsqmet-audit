"use strict";
/*
Nombre completo: history.schema.js
Ruta o ubicación: /core/history/history.schema.js
Función o funciones:
- Definir el esquema del historial JSON único
- Crear una estructura inicial consistente
- Normalizar el contenido cargado antes de persistirlo o devolverlo
- Mantener compatibilidad para resultados de carpeta local y archivos ZIP/RAR
*/

const HISTORY_VERSION = 2;

const REQUIRED_PROCESS_FOLDERS = [
  "PROCESOS DE APOYO",
  "PROCESOS ESTRATEGICOS",
  "PROCESOS MISIONALES"
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeScope(value) {
  const scope = safeText(value).toUpperCase();

  if (scope === "UGPA" || scope === "UTET" || scope === "BOTH") {
    return scope;
  }

  return "";
}

function normalizeDiscardedFindings(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter(function keep(entry) {
      return entry && typeof entry === "object";
    })
    .map(function mapEntry(entry) {
      return {
        id: safeText(entry.id),
        ruleId: safeText(entry.ruleId),
        scope: normalizeScope(entry.scope),
        rootName: safeText(entry.rootName),
        rootPath: safeText(entry.rootPath),
        relativePath: safeText(entry.relativePath),
        absolutePath: safeText(entry.absolutePath),
        discardedAt: entry.discardedAt || null
      };
    })
    .filter(function keep(entry) {
      return !!entry.id;
    });
}

function normalizeSummary(summary) {
  const safeSummary = summary && typeof summary === "object" ? summary : {};

  return {
    totalFolders: Number(safeSummary.totalFolders || 0),
    totalFiles: Number(safeSummary.totalFiles || 0),
    totalSizeBytes: Number(safeSummary.totalSizeBytes || 0),
    byExtension:
      safeSummary.byExtension && typeof safeSummary.byExtension === "object"
        ? clone(safeSummary.byExtension)
        : {}
  };
}

function normalizeValidation(validation) {
  const safeValidation = validation && typeof validation === "object" ? validation : {};

  const requiredProcessFolders = Array.isArray(safeValidation.requiredProcessFolders)
    ? safeValidation.requiredProcessFolders.map(safeText).filter(Boolean)
    : REQUIRED_PROCESS_FOLDERS.slice();

  const foundProcessFolders = Array.isArray(safeValidation.foundProcessFolders)
    ? safeValidation.foundProcessFolders.map(safeText).filter(Boolean)
    : [];

  const missingProcessFolders = Array.isArray(safeValidation.missingProcessFolders)
    ? safeValidation.missingProcessFolders.map(safeText).filter(Boolean)
    : requiredProcessFolders.filter(function keep(requiredName) {
        return !foundProcessFolders.includes(requiredName);
      });

  return {
    requiredProcessFolders: requiredProcessFolders,
    foundProcessFolders: foundProcessFolders,
    missingProcessFolders: missingProcessFolders,
    hasAllRequiredFolders:
      safeValidation.hasAllRequiredFolders === true ||
      missingProcessFolders.length === 0
  };
}

function normalizeSource(source, rootPath) {
  const safeSource = source && typeof source === "object" ? source : {};
  const kind = safeText(safeSource.kind).toLowerCase();

  const normalizedKind =
    kind === "archive" || !safeText(safeSource.selectedFolderPath)
      ? "archive"
      : "folder";

  return {
    kind: normalizedKind,
    selectedFolderPath: safeText(safeSource.selectedFolderPath),
    originalArchivePath: safeText(safeSource.originalArchivePath),
    storedArchivePath: safeText(safeSource.storedArchivePath),
    extractionRootPath: safeText(safeSource.extractionRootPath),
    effectiveRootPath: safeText(safeSource.effectiveRootPath || rootPath),
    archiveExtension: safeText(safeSource.archiveExtension).toLowerCase(),
    extractor: safeText(safeSource.extractor)
  };
}

function normalizeScanResult(scanResult, fallbackType) {
  if (!scanResult || typeof scanResult !== "object") {
    return null;
  }

  const type = safeText(scanResult.type || fallbackType).toUpperCase();

  if (type !== "UGPA" && type !== "UTET") {
    return null;
  }

  return {
    ok: scanResult.ok === true,
    type: type,
    rootPath: safeText(scanResult.rootPath),
    rootName: safeText(scanResult.rootName),
    scannedAt: scanResult.scannedAt || null,
    folders: Array.isArray(scanResult.folders) ? clone(scanResult.folders) : [],
    files: Array.isArray(scanResult.files) ? clone(scanResult.files) : [],
    summary: normalizeSummary(scanResult.summary),
    validation: normalizeValidation(scanResult.validation),
    source: normalizeSource(scanResult.source, scanResult.rootPath)
  };
}

function createDefaultHistory() {
  return {
    version: HISTORY_VERSION,
    updatedAt: null,
    ugpaResult: null,
    utetResult: null,
    discardedFindings: []
  };
}

function normalizeHistory(rawHistory) {
  const base = createDefaultHistory();
  const safe = rawHistory && typeof rawHistory === "object" ? rawHistory : {};

  return {
    version: Number(safe.version || base.version),
    updatedAt: safe.updatedAt || null,
    ugpaResult: normalizeScanResult(safe.ugpaResult, "UGPA"),
    utetResult: normalizeScanResult(safe.utetResult, "UTET"),
    discardedFindings: normalizeDiscardedFindings(safe.discardedFindings)
  };
}

module.exports = {
  HISTORY_VERSION,
  REQUIRED_PROCESS_FOLDERS,
  createDefaultHistory,
  normalizeHistory,
  normalizeScanResult,
  normalizeDiscardedFindings
};