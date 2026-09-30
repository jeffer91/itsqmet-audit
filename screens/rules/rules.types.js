/*
Nombre completo: rules.types.js
Ruta o ubicación: /screens/rules/rules.types.js
Función o funciones:
- Centralizar utilidades compartidas del módulo de reglas
- Normalizar textos, rutas, nombres y períodos
- Construir IDs estables para findings
- Indexar folders y files del escaneo para búsquedas rápidas
- Parsear nombres de carpetas de proceso, períodos y documentos
- Exponer helpers reutilizables para reglas documentales flexibles
*/
(function (window) {
  "use strict";

  const OFFICIAL_PERIOD_PATTERNS = [
    {
      kind: "semester-oct-mar",
      regex: /^Octubre (\d{4})[-–—]Marzo (\d{4})$/i,
      expected: "Octubre AAAA–Marzo AAAA",
      example: "Octubre 2025–Marzo 2026",
      validateYears: function validateYears(startYear, endYear) {
        return Number(endYear) === Number(startYear) + 1;
      },
      yearsMessage: "El período Octubre–Marzo debe terminar en el año siguiente."
    },
    {
      kind: "semester-apr-sep",
      regex: /^Abril (\d{4})[-–—]Septiembre (\d{4})$/i,
      expected: "Abril AAAA–Septiembre AAAA",
      example: "Abril 2025–Septiembre 2025",
      validateYears: function validateYears(startYear, endYear) {
        return Number(endYear) === Number(startYear);
      },
      yearsMessage: "El período Abril–Septiembre debe iniciar y terminar en el mismo año."
    },
    {
      kind: "annual-oct-sep",
      regex: /^Octubre (\d{4})[-–—]Septiembre (\d{4})$/i,
      expected: "Octubre AAAA–Septiembre AAAA",
      example: "Octubre 2024–Septiembre 2025",
      validateYears: function validateYears(startYear, endYear) {
        return Number(endYear) === Number(startYear) + 1;
      },
      yearsMessage: "El período Octubre–Septiembre debe terminar en el año siguiente."
    }
  ];

  const REMOVABLE_FILE_SUFFIXES = [
    "firmado",
    "signed",
    "signed firmado",
    "firmado signed",
    "escaneado",
    "scan",
    "scanner",
    "copia",
    "copy",
    "final",
    "borrador",
    "draft"
  ];

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeWhitespace(value) {
    return safeText(value).replace(/\s+/g, " ");
  }

  function stripAccents(value) {
    return safeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeScope(scope) {
    const value = safeText(scope).toUpperCase();
    return value === "UGPA" || value === "UTET" || value === "BOTH" ? value : "";
  }

  function normalizeSeverity(severity) {
    const value = safeText(severity).toLowerCase();
    return value === "error" || value === "warning" || value === "info" ? value : "info";
  }

  function normalizeRelativePath(value) {
    const clean = safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return clean === "." ? "" : clean;
  }

  function normalizePathForCompare(value) {
    return normalizeCompareText(normalizeRelativePath(value));
  }

  function getParentRelativePath(relativePath) {
    const clean = normalizeRelativePath(relativePath);
    if (!clean) return "";
    const parts = clean.split("/");
    parts.pop();
    return parts.join("/");
  }

  function getPathDepth(relativePath) {
    const clean = normalizeRelativePath(relativePath);
    if (!clean) return 0;
    return clean.split("/").filter(Boolean).length;
  }

  function normalizeCompareText(value) {
    return stripAccents(value)
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/[_]+/g, " ")
      .replace(/[(){}\[\],;:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegExp(value) {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function formatDateTime(value) {
    const text = safeText(value);
    if (!text) return "Sin fecha";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "Sin fecha";
    return date.toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function buildFindingId(payload) {
    const parts = [
      safeText(payload && payload.ruleId),
      normalizeScope(payload && payload.scope),
      normalizeRelativePath(payload && payload.relativePath),
      normalizeCompareText(payload && payload.rootName),
      normalizeCompareText(payload && payload.title),
      normalizeCompareText(payload && payload.actualValue),
      normalizeCompareText(payload && payload.expectedValue)
    ];
    return parts.join("|");
  }

  function buildScanIndex(scanData) {
    const folders = Array.isArray(scanData && scanData.folders) ? scanData.folders.slice() : [];
    const files = Array.isArray(scanData && scanData.files) ? scanData.files.slice() : [];

    folders.sort(function compare(left, right) {
      return normalizeRelativePath(left && left.relativePath)
        .localeCompare(normalizeRelativePath(right && right.relativePath), "es", {
          sensitivity: "base"
        });
    });

    files.sort(function compare(left, right) {
      return normalizeRelativePath(left && left.relativePath)
        .localeCompare(normalizeRelativePath(right && right.relativePath), "es", {
          sensitivity: "base"
        });
    });

    const folderMap = new Map();
    const fileMap = new Map();

    folders.forEach(function each(folder) {
      const normalized = {
        name: safeText(folder && folder.name),
        path: safeText(folder && folder.path),
        relativePath: normalizeRelativePath(folder && folder.relativePath),
        modifiedAt: safeText(folder && folder.modifiedAt),
        createdAt: safeText(folder && folder.createdAt),
        depth: Number(folder && folder.depth || getPathDepth(folder && folder.relativePath))
      };
      folderMap.set(normalized.relativePath, normalized);
    });

    files.forEach(function each(file) {
      const normalized = {
        name: safeText(file && file.name),
        path: safeText(file && file.path),
        relativePath: normalizeRelativePath(file && file.relativePath),
        extension: safeText(file && file.extension),
        directoryPath: safeText(file && file.directoryPath),
        modifiedAt: safeText(file && file.modifiedAt),
        createdAt: safeText(file && file.createdAt),
        sizeBytes: Number(file && file.sizeBytes || 0),
        depth: Number(file && file.depth || getPathDepth(file && file.relativePath))
      };
      fileMap.set(normalized.relativePath, normalized);
    });

    return {
      rootPath: safeText(scanData && scanData.rootPath),
      rootName: safeText(scanData && scanData.rootName),
      folders: Array.from(folderMap.values()),
      files: Array.from(fileMap.values()),
      folderMap: folderMap,
      fileMap: fileMap
    };
  }

  function parseProcessFolderName(folderName, expectedUnit) {
    const name = normalizeWhitespace(folderName);
    const match = name.match(/^([A-Z]{2,10})-PRO-(\d{2,4})(?:-(.+))?$/i);
    const safeExpectedUnit = normalizeScope(expectedUnit);

    if (!match) {
      return {
        valid: false,
        unitCode: "",
        processNumber: "",
        processCode: "",
        processName: "",
        raw: name,
        reason:
          "La carpeta de proceso debe iniciar con UNIDAD-PRO-### y puede incluir el nombre del proceso."
      };
    }

    const unitCode = safeText(match[1]).toUpperCase();
    const processNumber = safeText(match[2]);
    const processName = cleanupBusinessLabel(match[3] || "");

    if (
      safeExpectedUnit &&
      safeExpectedUnit !== "BOTH" &&
      unitCode !== safeExpectedUnit
    ) {
      return {
        valid: false,
        unitCode: unitCode,
        processNumber: processNumber,
        processCode: "PRO-" + processNumber,
        processName: processName,
        raw: name,
        reason:
          "La carpeta pertenece a " +
          unitCode +
          " pero se está auditando " +
          safeExpectedUnit +
          "."
      };
    }

    return {
      valid: true,
      unitCode: unitCode,
      processNumber: processNumber,
      processCode: "PRO-" + processNumber,
      processName: processName,
      raw: name,
      reason: ""
    };
  }

  function validateSubfolderName(folderName, expectedLabel) {
    const actual = normalizeCompareText(folderName);
    const expected = normalizeCompareText(expectedLabel);
    return {
      valid: actual === expected,
      actual: safeText(folderName),
      expected: safeText(expectedLabel),
      actualKey: actual,
      expectedKey: expected
    };
  }

  function normalizePeriodLabel(periodLabel) {
    const clean = normalizeWhitespace(periodLabel)
      .replace(/[–—]/g, "-")
      .replace(/\s*-\s*/g, "-");

    return normalizeCompareText(clean);
  }

  function parsePeriodFolderName(folderName, expectedProcessCode, expectedUnit) {
    const rawName = normalizeWhitespace(folderName).replace(/[–—]/g, "-");
    const processPrefix = rawName.match(
      /^([A-Z]{2,10})-PRO-(\d{2,4})-(.+)$/i
    );

    let name = rawName;
    let prefixUnit = "";
    let prefixProcessCode = "";

    if (processPrefix) {
      const candidatePeriod = normalizeWhitespace(processPrefix[3]);
      const looksLikePeriod =
        /(\d{4}).*(\d{4})/.test(candidatePeriod) ||
        /octubre|marzo|abril|septiembre/i.test(candidatePeriod);

      if (looksLikePeriod) {
        prefixUnit = safeText(processPrefix[1]).toUpperCase();
        prefixProcessCode = "PRO-" + safeText(processPrefix[2]);
        name = candidatePeriod.replace(/[–—]/g, "-");
      }
    }

    const officialMatch = OFFICIAL_PERIOD_PATTERNS.find(function keep(pattern) {
      return pattern.regex.test(name);
    });

    const safeExpectedProcess = safeText(expectedProcessCode).toUpperCase();
    const safeExpectedUnit = normalizeScope(expectedUnit);
    const prefixProcessOk =
      !prefixProcessCode ||
      !safeExpectedProcess ||
      prefixProcessCode === safeExpectedProcess;
    const prefixUnitOk =
      !prefixUnit ||
      !safeExpectedUnit ||
      safeExpectedUnit === "BOTH" ||
      prefixUnit === safeExpectedUnit;

    if (officialMatch) {
      const match = name.match(officialMatch.regex);
      const startYear = Number(match[1]);
      const endYear = Number(match[2]);
      const yearsOk = officialMatch.validateYears(startYear, endYear);
      const valid = yearsOk && prefixProcessOk && prefixUnitOk;
      let message = "";

      if (!yearsOk) {
        message = officialMatch.yearsMessage;
      } else if (!prefixProcessOk) {
        message =
          "El período usa " +
          prefixProcessCode +
          " pero pertenece a " +
          safeExpectedProcess +
          ".";
      } else if (!prefixUnitOk) {
        message =
          "El período usa la unidad " +
          prefixUnit +
          " pero pertenece a " +
          safeExpectedUnit +
          ".";
      }

      return {
        shouldEvaluate: true,
        valid: valid,
        kind: officialMatch.kind,
        normalizedPeriod: name.replace(/\s*-\s*/g, "–"),
        periodKey: normalizePeriodLabel(name),
        expected: officialMatch.expected,
        example: officialMatch.example,
        startYear: startYear,
        endYear: endYear,
        prefixUnit: prefixUnit,
        prefixProcessCode: prefixProcessCode,
        message: message
      };
    }

    const maybePeriodLike = /(\d{4}).*(\d{4})/.test(name)
      || /octubre|marzo|abril|septiembre/i.test(name);

    if (!maybePeriodLike) {
      return {
        shouldEvaluate: false,
        valid: true,
        kind: "",
        normalizedPeriod: "",
        periodKey: "",
        expected: "",
        example: "",
        startYear: 0,
        endYear: 0,
        prefixUnit: prefixUnit,
        prefixProcessCode: prefixProcessCode,
        message: ""
      };
    }

    return {
      shouldEvaluate: true,
      valid: false,
      kind: "",
      normalizedPeriod: name,
      periodKey: normalizePeriodLabel(name),
      expected: "Usar uno de los formatos oficiales de período",
      example: "Octubre 2024–Septiembre 2025",
      startYear: 0,
      endYear: 0,
      prefixUnit: prefixUnit,
      prefixProcessCode: prefixProcessCode,
      message: "El nombre del período no coincide con los formatos esperados."
    };
  }

  function parseDocumentFileName(fileName) {
    const original = safeText(fileName);
    if (!original) return null;

    const extensionMatch = original.match(/\.([^.]+)$/);
    const extension = extensionMatch
      ? safeText(extensionMatch[1]).toLowerCase()
      : "";

    const clean = removeFileExtension(original);
    const normalized = normalizeWhitespace(clean).replace(/_/g, " ");

    const strictMatch = normalized.match(
      /^([A-Z]{2,10})-([A-Z0-9-]+)-PRO-(\d{2,4})-(\d{4})-(\d{2})-(.+)$/i
    );

    if (strictMatch) {
      return {
        valid: true,
        unitCode: safeText(strictMatch[1]).toUpperCase(),
        documentType: safeText(strictMatch[2]).toUpperCase(),
        processNumber: safeText(strictMatch[3]),
        processCode: "PRO-" + safeText(strictMatch[3]),
        year: safeText(strictMatch[4]),
        month: safeText(strictMatch[5]),
        documentName: cleanupBusinessLabel(strictMatch[6]),
        extension: extension,
        raw: original
      };
    }

    const relaxedMatch = normalized.match(/PRO-(\d{2,4})/i);
    if (!relaxedMatch) return null;

    const processNumber = safeText(relaxedMatch[1]);
    const dateMatch = normalized.match(/(\d{4})-(\d{2})/);
    const unitMatch = normalized.match(/^([A-Z]{2,10})-/i);

    let tail = normalized.split(new RegExp("PRO-" + escapeRegExp(processNumber), "i"))[1] || "";
    if (dateMatch) {
      tail = tail.replace(dateMatch[0], "");
    }
    tail = tail.replace(/^[-\s]+/, "");

    return {
      valid: false,
      unitCode: unitMatch ? safeText(unitMatch[1]).toUpperCase() : "",
      documentType: "",
      processNumber: processNumber,
      processCode: "PRO-" + processNumber,
      year: dateMatch ? safeText(dateMatch[1]) : "",
      month: dateMatch ? safeText(dateMatch[2]) : "",
      documentName: cleanupBusinessLabel(tail),
      extension: extension,
      raw: original
    };
  }

  function isDescendantOf(targetPath, parentPath) {
    const target = normalizeRelativePath(targetPath);
    const parent = normalizeRelativePath(parentPath);

    if (!parent) return !!target || target === "";
    if (!target) return false;
    return target === parent || target.startsWith(parent + "/");
  }

  function findProcessFolders(index, expectedUnit) {
    const folders =
      index && Array.isArray(index.folders) ? index.folders : [];

    const candidates = folders
      .map(function mapFolder(folder) {
        return {
          folder: folder,
          validation: parseProcessFolderName(
            folder && folder.name,
            expectedUnit
          )
        };
      })
      .filter(function keep(item) {
        return item.validation && item.validation.valid;
      });

    return candidates
      .filter(function keepOutermost(item) {
        return !candidates.some(function hasProcessAncestor(other) {
          if (other === item) return false;
          const childPath = normalizeRelativePath(
            item.folder && item.folder.relativePath
          );
          const parentPath = normalizeRelativePath(
            other.folder && other.folder.relativePath
          );

          return (
            childPath !== parentPath &&
            isDescendantOf(childPath, parentPath)
          );
        });
      })
      .map(function mapResult(item) {
        return {
          ...item.folder,
          processValidation: item.validation
        };
      });
  }

  function removeFileExtension(fileName) {
    const value = safeText(fileName);
    return value.replace(/\.[^.]+$/i, "");
  }

  function cleanupBusinessLabel(label) {
    let value = normalizeWhitespace(removeFileExtension(label))
      .replace(/[–—]/g, "-")
      .replace(/[_-]+/g, " ");

    REMOVABLE_FILE_SUFFIXES.forEach(function each(token) {
      const pattern = new RegExp("(?:^|\\s)" + escapeRegExp(token) + "(?:$|\\s)", "gi");
      value = value.replace(pattern, " ");
    });

    value = value
      .replace(/\b(v|rev|revision)\s*\d+\b/gi, " ")
      .replace(/\b\d{4}-\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return value;
  }

  function extractBusinessFileName(fileNameOrLabel) {
    const raw = safeText(fileNameOrLabel);
    if (!raw) return "";
    const parsed = parseDocumentFileName(raw);
    const baseName = parsed && parsed.documentName ? parsed.documentName : removeFileExtension(raw);
    return cleanupBusinessLabel(baseName);
  }

  function normalizeTeacherName(fileNameOrLabel) {
    return normalizeCompareText(extractBusinessFileName(fileNameOrLabel));
  }

  function pathStartsWithAny(targetPath, candidates) {
    const target = normalizePathForCompare(targetPath);
    if (!target) return false;

    return (Array.isArray(candidates) ? candidates : []).some(function keep(candidate) {
      const normalizedCandidate = normalizePathForCompare(candidate);
      return normalizedCandidate && target.startsWith(normalizedCandidate);
    });
  }

  function findAncestorFolders(index, relativePath) {
    const result = [];
    let current = getParentRelativePath(relativePath);

    while (current || current === "") {
      const folder = index && index.folderMap ? index.folderMap.get(current) : null;
      if (folder) {
        result.push(folder);
      }
      if (!current) break;
      current = getParentRelativePath(current);
    }

    return result;
  }

  function findAncestorFolderByName(index, relativePath, folderName) {
    const expected = normalizeCompareText(folderName);
    return findAncestorFolders(index, relativePath).find(function keep(folder) {
      return normalizeCompareText(folder && folder.name) === expected;
    }) || null;
  }

  function findNearestPeriodFolder(index, relativePath) {
    const ancestors = findAncestorFolders(index, relativePath);

    for (let i = 0; i < ancestors.length; i += 1) {
      const folder = ancestors[i];
      const parsed = parsePeriodFolderName(folder && folder.name);
      if (parsed.shouldEvaluate === false && !parsed.normalizedPeriod) {
        continue;
      }
      if (parsed.normalizedPeriod) {
        return {
          folder: folder,
          periodRaw: parsed.normalizedPeriod,
          periodKey: normalizePeriodLabel(parsed.normalizedPeriod),
          validation: parsed
        };
      }
    }

    return null;
  }

  function parseSpanishPeriodRange(periodLabel) {
    const normalized = normalizeWhitespace(periodLabel).replace(/[–—]/g, "-");
    const match = normalized.match(
      /^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})\s*-\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})$/i
    );

    if (!match) {
      return {
        raw: safeText(periodLabel),
        key: normalizePeriodLabel(periodLabel),
        comparable: false,
        startYear: 0,
        startMonth: 0,
        endYear: 0,
        endMonth: 0
      };
    }

    const monthMap = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      setiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12
    };

    const startMonth = monthMap[normalizeCompareText(match[1])] || 0;
    const endMonth = monthMap[normalizeCompareText(match[3])] || 0;

    return {
      raw: normalized,
      key: normalizePeriodLabel(normalized),
      comparable: !!(startMonth && endMonth),
      startYear: Number(match[2]),
      startMonth: startMonth,
      endYear: Number(match[4]),
      endMonth: endMonth
    };
  }

  function periodToNumber(year, month) {
    return Number(year || 0) * 12 + Number(month || 0);
  }

  function arePeriodsRelated(leftPeriod, rightPeriod) {
    const left = parseSpanishPeriodRange(leftPeriod && leftPeriod.raw ? leftPeriod.raw : leftPeriod);
    const right = parseSpanishPeriodRange(rightPeriod && rightPeriod.raw ? rightPeriod.raw : rightPeriod);

    if (left.key && right.key && left.key === right.key) return true;
    if (!left.comparable || !right.comparable) return false;

    const leftStart = periodToNumber(left.startYear, left.startMonth);
    const leftEnd = periodToNumber(left.endYear, left.endMonth);
    const rightStart = periodToNumber(right.startYear, right.startMonth);
    const rightEnd = periodToNumber(right.endYear, right.endMonth);

    if (leftStart <= rightStart && leftEnd >= rightEnd) return true;
    if (rightStart <= leftStart && rightEnd >= leftEnd) return true;
    return leftStart <= rightEnd && rightStart <= leftEnd;
  }

  window.RulesTypes = {
    safeText: safeText,
    normalizeWhitespace: normalizeWhitespace,
    stripAccents: stripAccents,
    normalizeScope: normalizeScope,
    normalizeSeverity: normalizeSeverity,
    normalizeRelativePath: normalizeRelativePath,
    getParentRelativePath: getParentRelativePath,
    getPathDepth: getPathDepth,
    buildFindingId: buildFindingId,
    formatDateTime: formatDateTime,
    buildScanIndex: buildScanIndex,
    escapeRegExp: escapeRegExp,
    parseProcessFolderName: parseProcessFolderName,
    validateSubfolderName: validateSubfolderName,
    parseDocumentFileName: parseDocumentFileName,
    parsePeriodFolderName: parsePeriodFolderName,
    isDescendantOf: isDescendantOf,
    findProcessFolders: findProcessFolders,
    normalizeCompareText: normalizeCompareText,
    normalizePeriodLabel: normalizePeriodLabel,
    removeFileExtension: removeFileExtension,
    cleanupBusinessLabel: cleanupBusinessLabel,
    extractBusinessFileName: extractBusinessFileName,
    normalizeTeacherName: normalizeTeacherName,
    pathStartsWithAny: pathStartsWithAny,
    findAncestorFolders: findAncestorFolders,
    findAncestorFolderByName: findAncestorFolderByName,
    findNearestPeriodFolder: findNearestPeriodFolder,
    parseSpanishPeriodRange: parseSpanishPeriodRange,
    arePeriodsRelated: arePeriodsRelated
  };
})(window);