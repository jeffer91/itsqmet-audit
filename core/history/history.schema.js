"use strict";
/*
Nombre completo: history.schema.js
Ruta: /core/history/history.schema.js
Función:
- Guardar rutas independientes de UGPA y UTET.
- Mantener compatibilidad con historiales anteriores.
- Normalizar resultados, descartes y validación estructural.
*/

const HISTORY_VERSION = 4;

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
  return scope === "UGPA" || scope === "UTET" || scope === "BOTH" ? scope : "";
}

function normalizeDiscardedFindings(entries) {
  if (!Array.isArray(entries)) return [];

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
  const safe = summary && typeof summary === "object" ? summary : {};
  return {
    totalFolders: Number(safe.totalFolders || 0),
    totalFiles: Number(safe.totalFiles || 0),
    totalSizeBytes: Number(safe.totalSizeBytes || 0),
    byExtension:
      safe.byExtension && typeof safe.byExtension === "object"
        ? clone(safe.byExtension)
        : {}
  };
}

function normalizeValidation(validation) {
  const safe = validation && typeof validation === "object" ? validation : {};
  const required = Array.isArray(safe.requiredProcessFolders)
    ? safe.requiredProcessFolders.map(safeText).filter(Boolean)
    : REQUIRED_PROCESS_FOLDERS.slice();
  const found = Array.isArray(safe.foundProcessFolders)
    ? safe.foundProcessFolders.map(safeText).filter(Boolean)
    : [];
  const missing = Array.isArray(safe.missingProcessFolders)
    ? safe.missingProcessFolders.map(safeText).filter(Boolean)
    : required.filter(function keep(name) {
        return !found.includes(name);
      });

  return {
    requiredProcessFolders: required,
    foundProcessFolders: found,
    missingProcessFolders: missing,
    hasAllRequiredFolders:
      safe.hasAllRequiredFolders === true || missing.length === 0
  };
}

function normalizeSource(source, rootPath) {
  const safe = source && typeof source === "object" ? source : {};
  const kind = safeText(safe.kind).toLowerCase();
  const normalizedKind =
    kind === "archive" || !safeText(safe.selectedFolderPath)
      ? "archive"
      : "folder";

  return {
    kind: normalizedKind,
    selectedFolderPath: safeText(safe.selectedFolderPath),
    originalArchivePath: safeText(safe.originalArchivePath),
    storedArchivePath: safeText(safe.storedArchivePath),
    extractionRootPath: safeText(safe.extractionRootPath),
    effectiveRootPath: safeText(safe.effectiveRootPath || rootPath),
    archiveExtension: safeText(safe.archiveExtension).toLowerCase(),
    extractor: safeText(safe.extractor)
  };
}

function normalizeScanResult(scanResult, fallbackType) {
  if (!scanResult || typeof scanResult !== "object") return null;

  const type = safeText(scanResult.type || fallbackType).toUpperCase();
  if (type !== "UGPA" && type !== "UTET") return null;

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

function sourcePathFromResult(result) {
  if (!result || typeof result !== "object") return "";
  return safeText(
    result.source && result.source.selectedFolderPath
      ? result.source.selectedFolderPath
      : result.rootPath
  );
}

function createDefaultHistory() {
  return {
    version: HISTORY_VERSION,
    updatedAt: null,
    ugpaSourcePath: "",
    utetSourcePath: "",
    ugpaResult: null,
    utetResult: null,
    discardedFindings: []
  };
}

function normalizeHistory(rawHistory) {
  const safe = rawHistory && typeof rawHistory === "object" ? rawHistory : {};
  const ugpaResult = normalizeScanResult(safe.ugpaResult, "UGPA");
  const utetResult = normalizeScanResult(safe.utetResult, "UTET");

  return {
    version: HISTORY_VERSION,
    updatedAt: safe.updatedAt || null,
    ugpaSourcePath:
      safeText(safe.ugpaSourcePath) || sourcePathFromResult(ugpaResult),
    utetSourcePath:
      safeText(safe.utetSourcePath) || sourcePathFromResult(utetResult),
    ugpaResult: ugpaResult,
    utetResult: utetResult,
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
