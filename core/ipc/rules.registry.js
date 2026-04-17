"use strict";
/*
Nombre completo: rules.registry.js
Ruta o ubicación: /core/ipc/rules.registry.js
Función o funciones:
- Recorrer la carpeta rulesets
- Detectar reglas modulares basadas en carpetas con manifest.js
- Mantener compatibilidad con reglas legadas planas rule.*.js
- Devolver descriptores normalizados para su carga en renderer
*/

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

function getRulesetsDir() {
  return path.join(__dirname, "..", "..", "screens", "rules", "rulesets");
}

function safeText(value) {
  return String(value || "").trim();
}

function toPosixPath(value) {
  return safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function sortByText(list, fieldName) {
  list.sort((a, b) => {
    const left = safeText(a && a[fieldName]);
    const right = safeText(b && b[fieldName]);
    return left.localeCompare(right, "es", { sensitivity: "base" });
  });
}

function buildGlobalRuleNameFromLegacyFile(fileName) {
  const safe = safeText(fileName);
  const base = safe.replace(/^rule\./i, "").replace(/\.js$/i, "");
  const chunks = base.split(/[^a-zA-Z0-9]+/).filter(Boolean);

  return "Rule" + chunks.map((chunk) => {
    return chunk.charAt(0).toUpperCase() + chunk.slice(1);
  }).join("");
}

function buildRuleIdFromLegacyFile(fileName) {
  return safeText(fileName).replace(/^rule\./i, "").replace(/\.js$/i, "");
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}

function clearRequireCache(modulePath) {
  try {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
  } catch (_error) {
    // ignorar
  }
}

function loadManifest(manifestPath) {
  clearRequireCache(manifestPath);
  const manifest = require(manifestPath);

  if (!manifest || typeof manifest !== "object") {
    throw new Error(`El manifest no es válido: ${manifestPath}`);
  }

  return manifest;
}

function normalizeManifest(folderName, manifest) {
  const safeFolderName = safeText(folderName);
  const safeId = safeText(manifest.id) || safeFolderName;
  const safeGlobalName = safeText(manifest.globalName) || (
    "Rule" +
    safeId
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join("")
  );

  const scripts = Array.isArray(manifest.scripts)
    ? manifest.scripts.map((item) => toPosixPath(item)).filter(Boolean)
    : [];

  if (!scripts.length) {
    throw new Error(`La regla ${safeFolderName} no define scripts en manifest.js.`);
  }

  return {
    id: safeId,
    type: "folder",
    folderName: safeFolderName,
    globalName: safeGlobalName,
    scripts: scripts.map((scriptName) =>
      toPosixPath(path.posix.join(safeFolderName, scriptName))
    ),
    manifestFile: toPosixPath(path.posix.join(safeFolderName, "manifest.js"))
  };
}

async function listFolderRules(rulesetsDir) {
  const entries = await fsp.readdir(rulesetsDir, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory());
  const descriptors = [];

  for (const folder of folders) {
    const folderName = safeText(folder.name);
    if (!folderName) continue;

    const manifestPath = path.join(rulesetsDir, folderName, "manifest.js");
    if (!(await pathExists(manifestPath))) {
      continue;
    }

    const manifest = loadManifest(manifestPath);
    const descriptor = normalizeManifest(folderName, manifest);
    descriptors.push(descriptor);
  }

  sortByText(descriptors, "id");
  return descriptors;
}

async function listLegacyRules(rulesetsDir) {
  const entries = await fsp.readdir(rulesetsDir, { withFileTypes: true });

  const descriptors = entries
    .filter((entry) => entry.isFile())
    .map((entry) => safeText(entry.name))
    .filter((fileName) => /^rule\..+\.js$/i.test(fileName))
    .map((fileName) => {
      return {
        id: buildRuleIdFromLegacyFile(fileName),
        type: "legacy",
        folderName: "",
        globalName: buildGlobalRuleNameFromLegacyFile(fileName),
        scripts: [toPosixPath(fileName)],
        manifestFile: ""
      };
    });

  sortByText(descriptors, "id");
  return descriptors;
}

async function listRuleDescriptors() {
  const rulesetsDir = getRulesetsDir();
  const folderRules = await listFolderRules(rulesetsDir);
  const folderRuleIds = new Set(
    folderRules.map((item) => safeText(item.id).toLowerCase())
  );

  const legacyRules = await listLegacyRules(rulesetsDir);
  const filteredLegacyRules = legacyRules.filter((item) => {
    return !folderRuleIds.has(safeText(item.id).toLowerCase());
  });

  const all = folderRules.concat(filteredLegacyRules);
  sortByText(all, "id");
  return all;
}

module.exports = {
  getRulesetsDir,
  listRuleDescriptors,
  buildGlobalRuleNameFromLegacyFile
};