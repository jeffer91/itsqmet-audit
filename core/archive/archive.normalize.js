"use strict";
/*
Nombre completo: archive.normalize.js
Ruta o ubicación: /core/archive/archive.normalize.js
Función o funciones:
- Centralizar utilidades de normalización para carpeta local y archivos comprimidos
- Resolver la raíz efectiva del contenido a escanear
- Validar la presencia de PROCESOS DE APOYO, ESTRATÉGICOS y MISIONALES
- Normalizar tipos, extensiones, nombres y rutas
*/

const fsp = require("fs").promises;
const path = require("path");

const VALID_TYPES = new Set(["UGPA", "UTET"]);
const SOURCE_KINDS = new Set(["archive", "folder"]);
const SUPPORTED_ARCHIVE_EXTENSIONS = new Set([".zip", ".rar"]);

const REQUIRED_PROCESS_FOLDERS = [
  "PROCESOS DE APOYO",
  "PROCESOS ESTRATEGICOS",
  "PROCESOS MISIONALES"
];

function safeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeType(value) {
  const safeType = safeText(value).toUpperCase();
  return VALID_TYPES.has(safeType) ? safeType : "";
}

function ensureValidType(value) {
  const safeType = normalizeType(value);

  if (!safeType) {
    throw new Error("Tipo no válido. Use UGPA o UTET.");
  }

  return safeType;
}

function ensureValidSourceKind(value) {
  const sourceKind = safeText(value).toLowerCase();

  if (!SOURCE_KINDS.has(sourceKind)) {
    throw new Error("Origen no válido. Use archive o folder.");
  }

  return sourceKind;
}

function normalizeSlashes(value) {
  return safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function stripAccents(value) {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeFolderToken(value) {
  return stripAccents(value)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function sanitizeFileName(value) {
  return safeText(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

function ensureSupportedArchiveExtension(filePath) {
  const extension = path.extname(safeText(filePath)).toLowerCase();

  if (!SUPPORTED_ARCHIVE_EXTENSIONS.has(extension)) {
    throw new Error("Solo se admiten archivos ZIP o RAR.");
  }

  return extension;
}

async function pathExists(targetPath) {
  try {
    await fsp.access(safeText(targetPath));
    return true;
  } catch (_error) {
    return false;
  }
}

async function ensureDirectory(targetPath) {
  await fsp.mkdir(safeText(targetPath), { recursive: true });
}

async function ensureEmptyDirectory(targetPath) {
  const safePath = safeText(targetPath);
  await fsp.rm(safePath, { recursive: true, force: true });
  await ensureDirectory(safePath);
}

async function ensureReadableDirectory(targetPath) {
  const safePath = safeText(targetPath);

  if (!safePath) {
    throw new Error("No se recibió una carpeta válida.");
  }

  const stats = await fsp.stat(safePath);

  if (!stats.isDirectory()) {
    throw new Error("La ruta evaluada no corresponde a una carpeta.");
  }

  return stats;
}

async function readSubdirectories(targetPath) {
  await ensureReadableDirectory(targetPath);

  const entries = await fsp.readdir(safeText(targetPath), { withFileTypes: true });

  return entries
    .filter(function keep(entry) {
      return entry.isDirectory();
    })
    .map(function map(entry) {
      return entry.name;
    })
    .sort(function sortByName(left, right) {
      return left.localeCompare(right, "es", { sensitivity: "base" });
    });
}

function detectRequiredProcessFolders(folderNames) {
  const normalizedNames = Array.isArray(folderNames)
    ? folderNames.map(normalizeFolderToken)
    : [];

  return REQUIRED_PROCESS_FOLDERS.filter(function keep(requiredName) {
    return normalizedNames.includes(requiredName);
  });
}

function validateTopLevelProcessFolders(folderNames) {
  const normalizedFolderNames = Array.isArray(folderNames) ? folderNames.slice() : [];
  const found = detectRequiredProcessFolders(normalizedFolderNames);
  const missing = REQUIRED_PROCESS_FOLDERS.filter(function keep(requiredName) {
    return !found.includes(requiredName);
  });

  return {
    requiredProcessFolders: REQUIRED_PROCESS_FOLDERS.slice(),
    foundProcessFolders: found,
    missingProcessFolders: missing,
    hasAllRequiredFolders: missing.length === 0
  };
}

async function resolveEffectiveRoot(startPath) {
  let currentPath = safeText(startPath);

  if (!currentPath) {
    throw new Error("No se recibió la carpeta base para resolver la raíz.");
  }

  for (let depth = 0; depth < 6; depth += 1) {
    await ensureReadableDirectory(currentPath);
    const subdirectories = await readSubdirectories(currentPath);
    const foundRequiredFolders = detectRequiredProcessFolders(subdirectories);

    if (foundRequiredFolders.length > 0) {
      return {
        rootPath: currentPath,
        directFolders: subdirectories,
        validation: validateTopLevelProcessFolders(subdirectories)
      };
    }

    if (subdirectories.length === 1) {
      currentPath = path.join(currentPath, subdirectories[0]);
      continue;
    }

    return {
      rootPath: currentPath,
      directFolders: subdirectories,
      validation: validateTopLevelProcessFolders(subdirectories)
    };
  }

  const finalFolders = await readSubdirectories(currentPath);

  return {
    rootPath: currentPath,
    directFolders: finalFolders,
    validation: validateTopLevelProcessFolders(finalFolders)
  };
}

module.exports = {
  VALID_TYPES,
  SOURCE_KINDS,
  SUPPORTED_ARCHIVE_EXTENSIONS,
  REQUIRED_PROCESS_FOLDERS,
  safeText,
  normalizeType,
  ensureValidType,
  ensureValidSourceKind,
  normalizeSlashes,
  stripAccents,
  normalizeFolderToken,
  sanitizeFileName,
  ensureSupportedArchiveExtension,
  pathExists,
  ensureDirectory,
  ensureEmptyDirectory,
  ensureReadableDirectory,
  readSubdirectories,
  detectRequiredProcessFolders,
  validateTopLevelProcessFolders,
  resolveEffectiveRoot
};