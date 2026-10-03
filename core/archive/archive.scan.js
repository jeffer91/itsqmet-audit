"use strict";
/*
Nombre completo: archive.scan.js
Ruta o ubicación: /core/archive/archive.scan.js
Función o funciones:
- Recorrer de forma recursiva una carpeta local o una carpeta extraída
- Construir carpetas, archivos y resumen en el formato estándar de la app
- Unificar el resultado para origen folder y archive
- Incorporar validación estructural del contenido importado
*/

const fsp = require("fs").promises;
const path = require("path");
const {
  ensureValidType,
  ensureValidSourceKind,
  safeText,
  normalizeSlashes,
  ensureReadableDirectory,
  readSubdirectories,
  resolveEffectiveRoot,
  validateTopLevelProcessFolders
} = require("./archive.normalize");

const IGNORED_FOLDER_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "txt_convertidos"
]);

function toIsoSafe(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getExtension(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  return ext || "[sin extensión]";
}

function createEmptySummary() {
  return {
    totalFolders: 0,
    totalFiles: 0,
    totalSizeBytes: 0,
    byExtension: {}
  };
}

function addFolderToSummary(summary) {
  summary.totalFolders += 1;
}

function addFileToSummary(summary, fileRecord) {
  summary.totalFiles += 1;
  summary.totalSizeBytes += Number(fileRecord.sizeBytes || 0);
  summary.byExtension[fileRecord.extension] =
    (summary.byExtension[fileRecord.extension] || 0) + 1;
}

function notifyProgress(params, currentRelativePath, force) {
  if (!params || typeof params.onProgress !== "function") return;
  const summary = params.summary || createEmptySummary();
  const processed = Number(summary.totalFolders || 0) + Number(summary.totalFiles || 0);
  if (!force && processed > 1 && processed % 25 !== 0) return;
  params.onProgress({
    phase: "scanning",
    folders: Number(summary.totalFolders || 0),
    files: Number(summary.totalFiles || 0),
    processed: processed,
    currentPath: normalizeSlashes(currentRelativePath || "")
  });
}

function shouldIgnoreEntry(entryName) {
  return IGNORED_FOLDER_NAMES.has(safeText(entryName).toLowerCase());
}

function buildDepth(relativePath) {
  const clean = normalizeSlashes(relativePath);
  return clean ? clean.split("/").filter(Boolean).length : 0;
}

function buildFolderRecord(absolutePath, relativePath, stats) {
  return {
    id: normalizeSlashes(relativePath) || path.basename(absolutePath),
    name: path.basename(absolutePath),
    path: absolutePath,
    webUrl: "",
    relativePath: normalizeSlashes(relativePath),
    depth: buildDepth(relativePath),
    createdAt: toIsoSafe(stats.birthtime || stats.ctime),
    modifiedAt: toIsoSafe(stats.mtime)
  };
}

function buildFileRecord(absolutePath, relativePath, parentRelativePath, stats) {
  const name = path.basename(absolutePath);
  const extension = getExtension(name);

  return {
    id: normalizeSlashes(relativePath) || name,
    name: name,
    extension: extension,
    path: absolutePath,
    webUrl: "",
    relativePath: normalizeSlashes(relativePath),
    directoryPath: normalizeSlashes(parentRelativePath),
    depth: buildDepth(relativePath),
    sizeBytes: Number(stats.size || 0),
    createdAt: toIsoSafe(stats.birthtime || stats.ctime),
    modifiedAt: toIsoSafe(stats.mtime)
  };
}

async function readEntriesSorted(directoryPath) {
  const entries = await fsp.readdir(directoryPath, { withFileTypes: true });

  return entries.sort(function sortEntries(left, right) {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
  });
}

async function walkDirectory(params) {
  const currentAbsolutePath = params.currentAbsolutePath;
  const currentRelativePath = params.currentRelativePath;
  const folders = params.folders;
  const files = params.files;
  const summary = params.summary;

  const entries = await readEntriesSorted(currentAbsolutePath);

  for (const entry of entries) {
    if (shouldIgnoreEntry(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentAbsolutePath, entry.name);
    const relativePath = normalizeSlashes(
      currentRelativePath ? `${currentRelativePath}/${entry.name}` : entry.name
    );

    if (entry.isDirectory()) {
      const stats = await fsp.stat(absolutePath);
      const folderRecord = buildFolderRecord(absolutePath, relativePath, stats);
      folders.push(folderRecord);
      addFolderToSummary(summary);
      notifyProgress(params, relativePath, false);

      await walkDirectory({
        currentAbsolutePath: absolutePath,
        currentRelativePath: relativePath,
        folders: folders,
        files: files,
        summary: summary,
        onProgress: params.onProgress
      });

      continue;
    }

    if (entry.isFile()) {
      const stats = await fsp.stat(absolutePath);
      const fileRecord = buildFileRecord(
        absolutePath,
        relativePath,
        currentRelativePath,
        stats
      );

      files.push(fileRecord);
      addFileToSummary(summary, fileRecord);
      notifyProgress(params, relativePath, false);
    }
  }
}

function buildRootName(rootPath, fallbackType) {
  const folderName = path.basename(safeText(rootPath));
  return folderName || safeText(fallbackType) || "CARPETA";
}

function buildSourcePayload(source, effectiveRootPath) {
  const safeSource = source && typeof source === "object" ? source : {};
  const kind = ensureValidSourceKind(safeSource.kind || "folder");

  return {
    kind: kind,
    selectedFolderPath: kind === "folder" ? safeText(safeSource.selectedFolderPath) : "",
    originalArchivePath: kind === "archive" ? safeText(safeSource.originalArchivePath) : "",
    storedArchivePath: kind === "archive" ? safeText(safeSource.storedArchivePath) : "",
    extractionRootPath: kind === "archive" ? safeText(safeSource.extractionRootPath) : "",
    effectiveRootPath: safeText(effectiveRootPath),
    archiveExtension: kind === "archive"
      ? safeText(safeSource.archiveExtension).toLowerCase()
      : "",
    extractor: kind === "archive" ? safeText(safeSource.extractor) : ""
  };
}

async function buildValidation(rootPath, directFolders, validation) {
  if (validation && typeof validation === "object") {
    return validation;
  }

  const folderList = Array.isArray(directFolders)
    ? directFolders
    : await readSubdirectories(rootPath);

  return validateTopLevelProcessFolders(folderList);
}

async function scanResolvedDirectory(params) {
  const safeParams = params && typeof params === "object" ? params : {};
  const type = ensureValidType(safeParams.type);
  const rootPath = safeText(safeParams.rootPath);

  if (!rootPath) {
    throw new Error("No se recibió la ruta raíz efectiva para el escaneo.");
  }

  await ensureReadableDirectory(rootPath);

  const folders = [];
  const files = [];
  const summary = createEmptySummary();

  notifyProgress({ onProgress: safeParams.onProgress, summary: summary }, "", true);

  await walkDirectory({
    currentAbsolutePath: rootPath,
    currentRelativePath: "",
    folders: folders,
    files: files,
    summary: summary,
    onProgress: safeParams.onProgress
  });

  notifyProgress({ onProgress: safeParams.onProgress, summary: summary }, "", true);

  const validation = await buildValidation(
    rootPath,
    safeParams.directFolders,
    safeParams.validation
  );

  return {
    ok: true,
    type: type,
    rootPath: rootPath,
    rootName: safeText(safeParams.rootName) || buildRootName(rootPath, type),
    scannedAt: new Date().toISOString(),
    folders: folders,
    files: files,
    summary: summary,
    validation: validation,
    source: buildSourcePayload(
      safeParams.source || {
        kind: "folder",
        selectedFolderPath: rootPath
      },
      rootPath
    )
  };
}

async function scanFolderDirectory(params) {
  const safeParams = params && typeof params === "object" ? params : {};
  const type = ensureValidType(safeParams.type);
  const selectedFolderPath = safeText(safeParams.folderPath || safeParams.rootPath);

  if (!selectedFolderPath) {
    throw new Error("No se recibió la carpeta a escanear.");
  }

  if (safeParams.preserveRoot === true) {
    const directFolders = await readSubdirectories(selectedFolderPath);
    return scanResolvedDirectory({
      type: type,
      rootPath: selectedFolderPath,
      directFolders: directFolders,
      validation: validateTopLevelProcessFolders(directFolders),
      source: {
        kind: "folder",
        selectedFolderPath: selectedFolderPath
      },
      onProgress: safeParams.onProgress
    });
  }

  const resolvedRoot = await resolveEffectiveRoot(selectedFolderPath);

  return scanResolvedDirectory({
    type: type,
    rootPath: resolvedRoot.rootPath,
    directFolders: resolvedRoot.directFolders,
    validation: resolvedRoot.validation,
    source: {
      kind: "folder",
      selectedFolderPath: selectedFolderPath
    },
    onProgress: safeParams.onProgress
  });
}

async function scanArchiveDirectory(params) {
  const safeParams = params && typeof params === "object" ? params : {};

  return scanResolvedDirectory({
    type: safeParams.type,
    rootPath: safeParams.rootPath,
    rootName: safeParams.rootName,
    directFolders: safeParams.directFolders,
    validation: safeParams.validation,
    source: {
      kind: "archive",
      originalArchivePath: safeParams.originalArchivePath,
      storedArchivePath: safeParams.storedArchivePath,
      extractionRootPath: safeParams.extractionRootPath,
      archiveExtension: safeParams.archiveExtension,
      extractor: safeParams.extractor
    }
  });
}

module.exports = {
  IGNORED_FOLDER_NAMES,
  scanResolvedDirectory,
  scanFolderDirectory,
  scanArchiveDirectory
};