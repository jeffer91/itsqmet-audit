/*
Nombre: rules.file-policy.js
Política de documentos: PDF final; Word/Excel editables.
Compara solo archivos equivalentes de una misma carpeta y nunca modifica documentos.
*/
(function (window) {
  "use strict";

  const EDITABLE_EXTENSIONS = new Set([
    ".doc", ".docx", ".docm", ".odt", ".rtf",
    ".xls", ".xlsx", ".xlsm", ".xlsb", ".ods", ".csv"
  ]);
  const TECHNICAL_NAMES = new Set([
    "desktop.ini", "thumbs.db", ".ds_store", "icon", "icon\r"
  ]);
  const TECHNICAL_EXTENSIONS = new Set([".tmp", ".bak", ".lnk"]);

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function extension(file) {
    const declared = safeText(file && file.extension).toLowerCase();
    if (declared && declared !== "[sin extensión]") return declared;
    const name = safeText(file && file.name);
    const match = name.match(/(\.[^.]+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  function isIgnored(file) {
    const name = safeText(file && file.name).toLowerCase();
    if (!name || name.startsWith("~$")) return true;
    return TECHNICAL_NAMES.has(name) || TECHNICAL_EXTENSIONS.has(extension(file));
  }

  function isFinalPdf(file) {
    return !!file && !isIgnored(file) && extension(file) === ".pdf";
  }

  function isEditable(file) {
    return !!file && !isIgnored(file) && EDITABLE_EXTENSIONS.has(extension(file));
  }

  function normalize(value) {
    return safeText(value).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\\/g, "/");
  }

  function normalizeDocumentKey(name) {
    let base = safeText(name).replace(/\.[^.]+$/, "")
      .replace(/\s*\(\d+\)\s*$/, "");
    base = normalize(base).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    let previous = "";
    while (base && previous !== base) {
      previous = base;
      base = base.replace(/\s+(?:signed|firmado|escaneado|scanner|scan|copia|copy|borrador|draft|final)$/, "").trim();
    }
    return base;
  }

  function directoryKey(file) {
    const directory = safeText(file && file.directoryPath);
    if (directory) return normalize(directory).replace(/^\/+|\/+$/g, "");
    const path = normalize(file && file.relativePath);
    return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  }

  function createPdfLookup(files) {
    const index = new Map();
    (Array.isArray(files) ? files : []).forEach(function each(file) {
      if (!isFinalPdf(file)) return;
      const key = normalizeDocumentKey(file.name);
      if (!key) return;
      const identity = directoryKey(file) + "|" + key;
      if (!index.has(identity)) index.set(identity, file);
    });
    return function findPdf(editable) {
      if (!isEditable(editable)) return null;
      const key = normalizeDocumentKey(editable.name);
      return key ? index.get(directoryKey(editable) + "|" + key) || null : null;
    };
  }

  function findMatchingPdf(editable, files) {
    return createPdfLookup(files)(editable);
  }

  window.RulesFilePolicy = {
    extension: extension,
    isIgnored: isIgnored,
    isFinalPdf: isFinalPdf,
    isEditable: isEditable,
    normalizeDocumentKey: normalizeDocumentKey,
    findMatchingPdf: findMatchingPdf,
    createPdfLookup: createPdfLookup
  };
})(window);
