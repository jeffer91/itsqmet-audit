"use strict";
/*
Nombre completo: institution.scan.js
Ruta o ubicación: /core/institution/institution.scan.js
Función o funciones:
- Detectar las carpetas locales sincronizadas de UGPA y UTET dentro de la raíz institucional
- Validar que ambas unidades sean accesibles
- Ejecutar el escaneo estándar de ambas unidades reutilizando archive.scan.js
*/

const fsp = require("fs").promises;
const path = require("path");
const { scanFolderDirectory } = require("../archive/archive.scan");

function safeText(value) {
  return String(value == null ? "" : value).trim();
}

function stripAccents(value) {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeToken(value) {
  return stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureReadableDirectory(targetPath) {
  const safePath = safeText(targetPath);

  if (!safePath) {
    throw new Error("No se recibió la carpeta institucional.");
  }

  const stats = await fsp.stat(safePath);

  if (!stats.isDirectory()) {
    throw new Error("La ruta seleccionada no es una carpeta.");
  }

  await fsp.access(safePath);
  return safePath;
}

async function readDirectSubdirectories(rootPath) {
  const entries = await fsp.readdir(rootPath, { withFileTypes: true });

  return entries
    .filter(function keep(entry) {
      return entry && entry.isDirectory();
    })
    .map(function map(entry) {
      return {
        name: entry.name,
        path: path.join(rootPath, entry.name),
        token: normalizeToken(entry.name)
      };
    })
    .sort(function sort(left, right) {
      return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
    });
}

function isUnitCandidate(entry, unit) {
  const token = normalizeToken(entry && entry.token);
  const safeUnit = normalizeToken(unit);
  return new RegExp("(^|\\s)" + safeUnit + "(\\s|$)").test(token);
}

function scoreCandidate(entry, unit) {
  const token = normalizeToken(entry && entry.token);
  let score = 0;

  if (token === unit) score += 100;
  if (token.startsWith(unit + " ")) score += 50;
  if (token.includes("DOCUMENTOS")) score += 20;
  if (unit === "UGPA" && token.includes("GESTION DE PROCESOS ACADEMICOS")) score += 10;
  if (unit === "UTET" && token.includes("TITULACION")) score += 10;

  return score;
}

function chooseCandidate(entries, unit) {
  const candidates = entries
    .filter(function keep(entry) {
      return isUnitCandidate(entry, unit);
    })
    .map(function map(entry) {
      return {
        ...entry,
        score: scoreCandidate(entry, unit)
      };
    })
    .sort(function sort(left, right) {
      if (right.score !== left.score) return right.score - left.score;
      return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
    });

  if (!candidates.length) {
    return null;
  }

  if (
    candidates.length > 1 &&
    candidates[0].score === candidates[1].score
  ) {
    throw new Error(
      "Se encontraron varias carpetas posibles para " +
        unit +
        ". Deje una sola carpeta sincronizada de " +
        unit +
        " dentro de la raíz institucional."
    );
  }

  return candidates[0];
}

async function detectInstitutionFolders(rootPath) {
  const safeRootPath = await ensureReadableDirectory(rootPath);
  const subdirectories = await readDirectSubdirectories(safeRootPath);

  const ugpa = chooseCandidate(subdirectories, "UGPA");
  const utet = chooseCandidate(subdirectories, "UTET");

  const missing = [];
  if (!ugpa) missing.push("UGPA");
  if (!utet) missing.push("UTET");

  if (missing.length) {
    throw new Error(
      "La carpeta seleccionada no contiene las unidades requeridas: " +
        missing.join(" y ") +
        ". Seleccione la carpeta institucional que contiene UGPA y UTET."
    );
  }

  await ensureReadableDirectory(ugpa.path);
  await ensureReadableDirectory(utet.path);

  return {
    ok: true,
    rootPath: safeRootPath,
    rootName: path.basename(safeRootPath),
    ugpa: {
      name: ugpa.name,
      path: ugpa.path
    },
    utet: {
      name: utet.name,
      path: utet.path
    }
  };
}

async function scanInstitutionRoot(rootPath) {
  const detection = await detectInstitutionFolders(rootPath);

  const ugpaResult = await scanFolderDirectory({
    type: "UGPA",
    folderPath: detection.ugpa.path
  });

  const utetResult = await scanFolderDirectory({
    type: "UTET",
    folderPath: detection.utet.path
  });

  return {
    ok: true,
    rootPath: detection.rootPath,
    rootName: detection.rootName,
    detection: detection,
    ugpaResult: ugpaResult,
    utetResult: utetResult
  };
}

module.exports = {
  detectInstitutionFolders,
  scanInstitutionRoot
};
