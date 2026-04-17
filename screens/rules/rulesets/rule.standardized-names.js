(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};

  const TECHNICAL_FILE_NAMES = new Set([
    "desktop.ini",
    "thumbs.db"
  ]);

  const REMOVABLE_FILE_SUFFIXES = [
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
    "copy",
    "draft",
    "borrador",
    "final"
  ];

  const COMMON_REPLACEMENTS = [
    { regex: /\bPRO(?=\d{2,4}\b)/gi, replacement: "PRO-" },
    { regex: /\bViodejuegos\b/gi, replacement: "Videojuegos" },
    { regex: /\bCompensancion\b/gi, replacement: "Compensacion" },
    { regex: /\bComuputacion\b/gi, replacement: "Computacion" },
    { regex: /\bNesesidades\b/gi, replacement: "Necesidades" },
    { regex: /\bMazo\b/gi, replacement: "Marzo" },
    { regex: /\bEduFin\b/gi, replacement: "Educacion Financiera" },
    { regex: /\bVyHB\b/gi, replacement: "Valores y Habilidades Blandas" },
    { regex: /\bFdG\b/gi, replacement: "Facilitador de Grupos" },
    { regex: /\bMhdla\b/gi, replacement: "Manejo Higienico de los Alimentos" },
    { regex: /\bMPcI\b/gi, replacement: "Marca Personal IA" },
    { regex: /\bMPIA\b/gi, replacement: "Marca Personal IA" }
  ];

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeScope(value) {
    if (Types && typeof Types.normalizeScope === "function") {
      return Types.normalizeScope(value);
    }
    const scope = safeText(value).toUpperCase();
    return scope === "UGPA" || scope === "UTET" || scope === "BOTH" ? scope : "BOTH";
  }

  function normalizeSeverity(value) {
    if (Types && typeof Types.normalizeSeverity === "function") {
      return Types.normalizeSeverity(value);
    }
    const severity = safeText(value).toLowerCase();
    return severity === "error" ? "error" : "warning";
  }

  function normalizeRelativePath(value) {
    if (Types && typeof Types.normalizeRelativePath === "function") {
      return Types.normalizeRelativePath(value);
    }
    return safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function buildFindingId(finding) {
    if (Types && typeof Types.buildFindingId === "function") {
      return Types.buildFindingId(finding);
    }
    return [
      safeText(finding.ruleId),
      safeText(finding.scope),
      normalizeRelativePath(finding.relativePath),
      safeText(finding.title),
      safeText(finding.actualValue)
    ].join("|");
  }

  function normalizeWhitespace(value) {
    return safeText(value).replace(/\s+/g, " ");
  }

  function stripAccents(value) {
    return safeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function hasAccents(value) {
    return stripAccents(value) !== safeText(value);
  }

  function escapeRegExp(value) {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getParentAbsolutePath(absolutePath) {
    const safePath = safeText(absolutePath);
    if (!safePath) return "";
    return safePath.replace(/[\\/][^\\/]+$/, "");
  }

  function isTechnicalFile(fileName) {
    return TECHNICAL_FILE_NAMES.has(safeText(fileName).toLowerCase());
  }

  function removeDuplicateExtension(fileName) {
    let previous = safeText(fileName);
    let current = previous.replace(/(\.[a-z0-9]+)(?:\1)+$/i, "$1");
    while (current !== previous) {
      previous = current;
      current = previous.replace(/(\.[a-z0-9]+)(?:\1)+$/i, "$1");
    }
    return current;
  }

  function splitFileName(fileName) {
    const clean = removeDuplicateExtension(fileName);
    const lastDot = clean.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === clean.length - 1) {
      return {
        base: clean,
        extension: ""
      };
    }
    return {
      base: clean.slice(0, lastDot),
      extension: clean.slice(lastDot + 1)
    };
  }

  function capitalizeMonth(value) {
    const clean = safeText(value).toLowerCase();
    if (!clean) return "";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function standardizePeriodSegments(value) {
    return safeText(value).replace(
      /\b(Octubre|Abril)\s+(\d{4})\s*[-–—]\s*(Marzo|Septiembre)\s+(\d{4})\b/gi,
      function (_match, startMonth, startYear, endMonth, endYear) {
        return (
          capitalizeMonth(startMonth) +
          " " +
          startYear +
          "–" +
          capitalizeMonth(endMonth) +
          " " +
          endYear
        );
      }
    );
  }

  function removeTrailingCopyMarker(value) {
    return safeText(value).replace(/\s*\((\d+)\)\s*$/i, "");
  }

  function removeRemovableSuffixes(baseName) {
    let next = safeText(baseName);
    let changed = true;

    while (changed) {
      changed = false;
      const before = next;

      next = removeTrailingCopyMarker(next);

      REMOVABLE_FILE_SUFFIXES.forEach(function eachSuffix(suffix) {
        const regex = new RegExp("(?:[\\s_-]+)" + escapeRegExp(suffix) + "$", "i");
        next = next.replace(regex, "");
      });

      next = next.replace(/[\s_-]+$/g, "").trim();

      if (next !== before) {
        changed = true;
      }
    }

    return next;
  }

  function applyCommonReplacements(value) {
    let next = safeText(value);
    COMMON_REPLACEMENTS.forEach(function eachReplacement(item) {
      next = next.replace(item.regex, item.replacement);
    });
    return next;
  }

  function normalizeStructuralSpacing(value) {
    let next = safeText(value);

    next = next.replace(/_/g, " ");
    next = next.replace(/\s*–\s*/g, "–");
    next = next.replace(/\s*-\s*/g, "-");
    next = next.replace(/-{2,}/g, "-");
    next = next.replace(/^\-+/g, "");
    next = next.replace(/\.+\s*$/g, "");
    next = normalizeWhitespace(next);

    return next;
  }

  function sanitizeFolderName(folderName) {
    let next = safeText(folderName);
    if (!next) return "";

    next = standardizePeriodSegments(next);
    next = stripAccents(next);
    next = applyCommonReplacements(next);
    next = standardizePeriodSegments(next);
    next = normalizeStructuralSpacing(next);
    next = next.replace(/^[-\s]+|[-\s]+$/g, "");

    return next;
  }

  function sanitizeFileName(fileName) {
    const parts = splitFileName(fileName);
    let base = safeText(parts.base);
    let extension = safeText(parts.extension).toLowerCase();

    base = removeRemovableSuffixes(base);
    base = sanitizeFolderName(base);
    extension = stripAccents(extension).toLowerCase();

    if (!base) {
      base = "Documento";
    }

    return extension ? base + "." + extension : base;
  }

  function buildFolderExample(suggestedName) {
    if (/\b(Octubre|Abril) \d{4}–(Marzo|Septiembre) \d{4}\b/.test(suggestedName)) {
      return "UGPA-PRO-134-Octubre 2025–Marzo 2026";
    }
    if (/^(UGPA|UTET)-PRO-\d+-/i.test(suggestedName)) {
      return "UGPA-PRO-134-Nombre del proceso";
    }
    return suggestedName;
  }

  function buildFileExample(suggestedName) {
    const extension = safeText(suggestedName).toLowerCase().endsWith(".docx")
      ? "docx"
      : "pdf";
    return "UGPA-RGI2-01-PRO-134-2026-03-Nombre Apellido." + extension;
  }

  function detectReasons(originalName, suggestedName, isFile) {
    const reasons = [];
    const original = safeText(originalName);
    const plainOriginal = stripAccents(original);

    if (hasAccents(original)) {
      reasons.push("contiene tildes");
    }

    if (isFile && /(\.[a-z0-9]+)(?:\1)+$/i.test(original)) {
      reasons.push("repite la extension");
    }

    if (isFile && /\(\d+\)(?=\.[^.]+$|$)/i.test(original)) {
      reasons.push("incluye marcador de copia");
    }

    if (
      isFile &&
      /(?:^|[\s_-])(signed_firmado|firmado_signed|signed|firmado|escaneado|scan|scanner|copia|copy|draft|borrador|final)(?:$|[\s_-])/i.test(original)
    ) {
      reasons.push("incluye sufijos de firma o copia");
    }

    if (/\b(Octubre|Abril)\s+\d{4}\s*-\s*(Marzo|Septiembre)\s+\d{4}\b/i.test(original)) {
      reasons.push("usa guion simple en el periodo");
    }

    if (/\bPRO\d{2,4}\b/i.test(original)) {
      reasons.push("omite el guion en el codigo del proceso");
    }

    if (applyCommonReplacements(plainOriginal) !== plainOriginal) {
      reasons.push("usa abreviaturas o errores frecuentes");
    }

    if (!reasons.length && safeText(original) !== safeText(suggestedName)) {
      reasons.push("no cumple el formato limpio definido para nombres");
    }

    return reasons;
  }

  function createFinding(payload) {
    const finding = {
      ruleId: safeText(payload.ruleId),
      ruleName: safeText(payload.ruleName),
      scope: normalizeScope(payload.scope),
      severity: normalizeSeverity(payload.severity),
      title: safeText(payload.title),
      description: safeText(payload.description),
      rootName: safeText(payload.rootName),
      rootPath: safeText(payload.rootPath),
      relativePath: normalizeRelativePath(payload.relativePath),
      absolutePath: safeText(payload.absolutePath),
      actualValue: safeText(payload.actualValue),
      expectedValue: safeText(payload.expectedValue),
      exampleValue: safeText(payload.exampleValue),
      foundLabel: safeText(payload.foundLabel),
      missingLabel: safeText(payload.missingLabel),
      primaryActionLabel: safeText(payload.primaryActionLabel),
      primaryActionPath: safeText(payload.primaryActionPath)
    };

    finding.id = buildFindingId(finding);
    return finding;
  }

  function buildDescription(originalName, suggestedName, isFile) {
    const reasons = detectReasons(originalName, suggestedName, isFile);
    const prefix = isFile
      ? "El archivo no cumple el estandar de nombres definido."
      : "La carpeta no cumple el estandar de nombres definido.";

    if (!reasons.length) {
      return prefix + " Se propone una version limpia y uniforme del nombre.";
    }

    return (
      prefix +
      " Se detecto que " +
      reasons.join(", ") +
      ". La propuesta ya entrega el nombre corregido."
    );
  }

  function addFolderFinding(findings, rule, scope, scanData, folder, suggestedName) {
    const title = /\b(Octubre|Abril) \d{4}–(Marzo|Septiembre) \d{4}\b/.test(suggestedName)
      ? "Carpeta de periodo no estandarizada"
      : "Carpeta no estandarizada";

    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope: scope,
        severity: rule.severity,
        title: title,
        description: buildDescription(folder.name, suggestedName, false),
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: folder.relativePath,
        absolutePath: folder.path || scanData.rootPath || "",
        actualValue: folder.name,
        expectedValue: suggestedName,
        exampleValue: buildFolderExample(suggestedName),
        foundLabel: "Carpeta detectada",
        missingLabel: "Nombre estandar",
        primaryActionLabel: "Abrir carpeta del documento encontrado",
        primaryActionPath: folder.path || scanData.rootPath || ""
      })
    );
  }

  function addFileFinding(findings, rule, scope, scanData, file, suggestedName) {
    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope: scope,
        severity: rule.severity,
        title: "Archivo no estandarizado",
        description: buildDescription(file.name, suggestedName, true),
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: file.relativePath,
        absolutePath: file.path || scanData.rootPath || "",
        actualValue: file.name,
        expectedValue: suggestedName,
        exampleValue: buildFileExample(suggestedName),
        foundLabel: "Archivo detectado",
        missingLabel: "Nombre estandar",
        primaryActionLabel: "Abrir carpeta del documento encontrado",
        primaryActionPath: getParentAbsolutePath(file.path || "")
      })
    );
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) {
      return [];
    }

    const findings = [];
    const folders = Array.isArray(scanData.folders) ? scanData.folders : [];
    const files = Array.isArray(scanData.files) ? scanData.files : [];

    folders.forEach(function eachFolder(folder) {
      const currentName = safeText(folder && folder.name);
      if (!currentName) return;

      const suggestedName = sanitizeFolderName(currentName);
      if (!suggestedName || suggestedName === currentName) return;

      addFolderFinding(findings, rule, scope, scanData, folder, suggestedName);
    });

    files.forEach(function eachFile(file) {
      const currentName = safeText(file && file.name);
      if (!currentName) return;
      if (isTechnicalFile(currentName)) return;

      const suggestedName = sanitizeFileName(currentName);
      if (!suggestedName || suggestedName === currentName) return;

      addFileFinding(findings, rule, scope, scanData, file, suggestedName);
    });

    return findings;
  }

  window.RuleStandardizedNames = {
    id: "standardized-names",
    name: "Nombres estandar",
    scope: "BOTH",
    severity: "warning",
    description:
      "Valida que archivos y carpetas usen nombres limpios: sin tildes, sin sufijos de firma, con periodos estandarizados y con propuesta exacta de correccion.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);