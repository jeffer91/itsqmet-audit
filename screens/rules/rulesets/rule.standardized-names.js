/*
Nombre completo: rule.standardized-names.js
Ruta: /screens/rules/rulesets/rule.standardized-names.js
Función:
- Detectar anomalías seguras de nomenclatura sin eliminar tildes ni palabras válidas del manual.
- Proponer el nombre corregido sin renombrar archivos ni carpetas.
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};
  const TECHNICAL_FILE_NAMES = new Set(["desktop.ini", "thumbs.db"]);
  const REMOVABLE_SUFFIXES = [
    "signed_firmado",
    "firmado_signed",
    "signed-firmado",
    "firmado-signed",
    "signed",
    "firmado",
    "escaneado",
    "scan",
    "scanner",
    "copia",
    "copy"
  ];

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeRelativePath(value) {
    return Types.normalizeRelativePath
      ? Types.normalizeRelativePath(value)
      : safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function escapeRegExp(value) {
    return safeText(value).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  function getParentAbsolutePath(absolutePath) {
    return safeText(absolutePath).replace(/[\\/][^\\/]+$/, "");
  }

  function removeDuplicateExtension(fileName) {
    let current = safeText(fileName);
    let previous = "";
    while (current !== previous) {
      previous = current;
      current = current.replace(/(\.[a-z0-9]+)(?:\1)+$/i, "$1");
    }
    return current;
  }

  function splitFileName(fileName) {
    const clean = removeDuplicateExtension(fileName);
    const lastDot = clean.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === clean.length - 1) {
      return { base: clean, extension: "" };
    }
    return {
      base: clean.slice(0, lastDot),
      extension: clean.slice(lastDot + 1)
    };
  }

  function normalizeCommon(value) {
    return safeText(value)
      .replace(/\bPRO(?=\d{2,4}\b)/gi, "PRO-")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function removeCopyMarker(value) {
    return safeText(value).replace(/\s*\((\d+)\)\s*$/i, "");
  }

  function removeUnsafeSuffixes(value) {
    let next = safeText(value);
    let changed = true;

    while (changed) {
      changed = false;
      const before = next;
      next = removeCopyMarker(next);

      REMOVABLE_SUFFIXES.forEach(function each(suffix) {
        const regex = new RegExp("(?:[\\s_-]+)" + escapeRegExp(suffix) + "$", "i");
        next = next.replace(regex, "");
      });

      next = next.replace(/[\s_-]+$/g, "").trim();
      changed = next !== before;
    }

    return next;
  }

  function sanitizeFolderName(folderName) {
    return normalizeCommon(folderName);
  }

  function sanitizeFileName(fileName) {
    const parts = splitFileName(fileName);
    let base = removeUnsafeSuffixes(parts.base);
    base = normalizeCommon(base);
    const extension = safeText(parts.extension).toLowerCase();
    return extension ? base + "." + extension : base;
  }

  function detectReason(original, suggested, isFile) {
    const reasons = [];

    if (isFile && /(\.[a-z0-9]+)(?:\1)+$/i.test(original)) {
      reasons.push("extensión duplicada");
    }

    if (isFile && /\(\d+\)(?=\.[^.]+$|$)/i.test(original)) {
      reasons.push("marcador de copia");
    }

    if (
      isFile &&
      /(?:^|[\s_-])(signed_firmado|firmado_signed|signed|firmado|escaneado|scan|scanner|copia|copy)(?=$|[\s_.-])/i.test(original)
    ) {
      reasons.push("sufijo de copia/firma");
    }

    if (/\bPRO\d{2,4}\b/i.test(original)) {
      reasons.push("código PRO sin guion");
    }

    if (/\s{2,}/.test(original)) {
      reasons.push("espacios duplicados");
    }

    return reasons.length
      ? reasons.join(", ")
      : original !== suggested
      ? "formato no estandarizado"
      : "";
  }

  function createFinding(rule, scope, scanData, item, suggestedName, isFile) {
    const reason = detectReason(item.name, suggestedName, isFile);
    const finding = {
      ruleId: rule.id,
      ruleName: rule.name,
      category: "names",
      scope: scope,
      severity: rule.severity,
      title: isFile ? "Nombre de PDF incorrecto" : "Nombre de carpeta incorrecto",
      description:
        "Se detectó " + reason + ". AUDIT solo propone el cambio; no renombra automáticamente.",
      rootName: scanData.rootName || "",
      rootPath: scanData.rootPath || "",
      relativePath: normalizeRelativePath(item.relativePath),
      absolutePath: item.path || scanData.rootPath || "",
      actualLabel: "Actual",
      actualValue: item.name,
      expectedLabel: "Debe ser",
      expectedValue: suggestedName,
      foundFileName: isFile ? item.name : "",
      primaryActionLabel: "Abrir carpeta",
      primaryActionPath: isFile
        ? getParentAbsolutePath(item.path || "") || scanData.rootPath || ""
        : item.path || scanData.rootPath || ""
    };

    finding.id = Types.buildFindingId
      ? Types.buildFindingId(finding)
      : [rule.id, scope, finding.relativePath, suggestedName].join("|");

    return finding;
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];

    const findings = [];
    const folders = Array.isArray(scanData.folders) ? scanData.folders : [];
    const files = Array.isArray(scanData.files) ? scanData.files : [];

    folders.forEach(function eachFolder(folder) {
      const current = safeText(folder && folder.name);
      if (!current) return;
      const suggested = sanitizeFolderName(current);
      if (suggested && suggested !== current) {
        findings.push(createFinding(rule, scope, scanData, folder, suggested, false));
      }
    });

    files.forEach(function eachFile(file) {
      const current = safeText(file && file.name);
      if (!current || TECHNICAL_FILE_NAMES.has(current.toLowerCase())) return;
      if (safeText(file && file.extension).toLowerCase() !== ".pdf") return;

      const suggested = sanitizeFileName(current);
      if (suggested && suggested !== current) {
        findings.push(createFinding(rule, scope, scanData, file, suggested, true));
      }
    });

    return findings;
  }

  window.RuleStandardizedNames = {
    id: "standardized-names",
    name: "Nombres a corregir",
    scope: "BOTH",
    severity: "warning",
    description:
      "Corrige únicamente anomalías seguras: copias, extensiones duplicadas, sufijos de firma, espacios duplicados y códigos PRO sin guion.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
