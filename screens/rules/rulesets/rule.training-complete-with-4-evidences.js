/*
Nombre completo: rule.training-complete-with-4-evidences.js
Ruta o ubicación: /screens/rules/rulesets/rule.training-complete-with-4-evidences.js
Función o funciones:
- Validar que toda capacitación UGPA tenga 4 evidencias obligatorias
- Agrupar archivos por capacitación y período
- Tolerar variantes menores en el nombre de la capacitación
- Reportar qué evidencia falta, nombre esperado, archivo correcto encontrado
  y carpeta relacionada donde debería estar el faltante
*/

(function (window) {
  "use strict";

  const Types = window.RulesTypes;

  const RULE_ID = "RG-002";
  const RULE_NAME = "Capacitación completa con 4 evidencias";
  const DEFAULT_SCOPE = "UGPA";

  const PROCESS_134 = "134";
  const PROCESS_135 = "135";

  const EVIDENCE_DEFINITIONS = {
    planning: {
      key: "planning",
      title: "Planificación de la capacitación",
      processNumber: PROCESS_134,
      codeBase: "UGPA-RGI1",
      folderLabel: "Planificacion de la capacitacion",
      shortLabel: "Planificación"
    },
    finalReport: {
      key: "finalReport",
      title: "Informe final de capacitación",
      processNumber: PROCESS_134,
      codeBase: "UGPA-INF",
      folderLabel: "Informe final de capacitacion",
      shortLabel: "Informe final"
    },
    evaluationInstrument: {
      key: "evaluationInstrument",
      title: "Instrumento de evaluación de la capacitación",
      processNumber: PROCESS_135,
      codeBase: "UGPA-RGI1",
      folderLabel: "Instrumento de evaluacion de la capacitacion",
      shortLabel: "Instrumento de evaluación"
    },
    impactReport: {
      key: "impactReport",
      title: "Informe de impacto de la capacitación",
      processNumber: PROCESS_135,
      codeBase: "UGPA-INF",
      folderLabel: "Informe de impacto de la capacitacion",
      shortLabel: "Informe de impacto"
    }
  };

  const EVIDENCE_ORDER = [
    EVIDENCE_DEFINITIONS.planning,
    EVIDENCE_DEFINITIONS.finalReport,
    EVIDENCE_DEFINITIONS.evaluationInstrument,
    EVIDENCE_DEFINITIONS.impactReport
  ];

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function createFinding(payload) {
    const finding = {
      ruleId: safeText(payload.ruleId),
      ruleName: safeText(payload.ruleName),
      scope: Types.normalizeScope(payload.scope),
      severity: Types.normalizeSeverity(payload.severity),
      title: safeText(payload.title),
      description: safeText(payload.description),
      rootName: safeText(payload.rootName),
      rootPath: safeText(payload.rootPath),
      relativePath: Types.normalizeRelativePath(payload.relativePath),
      absolutePath: safeText(payload.absolutePath),
      actualValue: safeText(payload.actualValue),
      expectedValue: safeText(payload.expectedValue),
      exampleValue: safeText(payload.exampleValue),

      trainingLabel: safeText(payload.trainingLabel),
      periodLabel: safeText(payload.periodLabel),
      foundLabel: safeText(payload.foundLabel),
      missingLabel: safeText(payload.missingLabel),
      expectedFileName: safeText(payload.expectedFileName),
      foundFilePath: safeText(payload.foundFilePath),
      relatedFolderPath: safeText(payload.relatedFolderPath),
      primaryActionLabel: safeText(payload.primaryActionLabel),
      primaryActionPath: safeText(payload.primaryActionPath),
      secondaryActionLabel: safeText(payload.secondaryActionLabel),
      secondaryActionPath: safeText(payload.secondaryActionPath)
    };

    finding.id = Types.buildFindingId({
      ruleId: finding.ruleId,
      scope: finding.scope,
      relativePath: finding.relativePath,
      rootName: finding.rootName,
      title: finding.title,
      actualValue: finding.actualValue,
      expectedValue: finding.expectedValue
    });

    return finding;
  }

  function normalizeTrainingDisplayName(value) {
    return safeText(value)
      .replace(/\.[^.]+$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/[–—]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function removeTrailingNoise(text) {
    let value = safeText(text);

    value = value.replace(
      /\b(firmado|signed|escaneado|scan|scanner|copia|copy|final|borrador|draft)\b/gi,
      " "
    );

    value = value.replace(
      /\b(vers(?:ion|ión)?|edic(?:ion|ión)?|cohorte|grupo|modulo|módulo)\s*[-:_ ]*[a-z0-9.]+$/i,
      ""
    );

    value = value.replace(/\s+/g, " ").trim();
    return value;
  }

  function buildTrainingKey(value) {
    const cleaned = removeTrailingNoise(normalizeTrainingDisplayName(value));
    return Types.normalizeCompareText(cleaned);
  }

  function detectProcessNumber(value) {
    const match = safeText(value).match(/PRO-(\d+)/i);
    return match ? safeText(match[1]) : "";
  }

  function getIndexFiles(index) {
    if (Array.isArray(index && index.files)) return index.files;
    if (Array.isArray(index && index.allFiles)) return index.allFiles;
    return [];
  }

  function getIndexFolders(index) {
    if (Array.isArray(index && index.folders)) return index.folders;
    if (Array.isArray(index && index.allFolders)) return index.allFolders;
    return [];
  }

  function hasAncestorProcess(index, relativePath, processNumber) {
    const ancestors = Array.isArray(Types.findAncestorFolders(index, relativePath))
      ? Types.findAncestorFolders(index, relativePath)
      : [];

    const expected = "pro-" + safeText(processNumber);

    return ancestors.some(function keep(folder) {
      return Types.normalizeCompareText(folder && folder.name).includes(expected);
    });
  }

  function hasAncestorFolderLike(index, relativePath, folderLabel) {
    const ancestors = Array.isArray(Types.findAncestorFolders(index, relativePath))
      ? Types.findAncestorFolders(index, relativePath)
      : [];

    const expected = Types.normalizeCompareText(folderLabel);

    return ancestors.some(function keep(folder) {
      return Types.normalizeCompareText(folder && folder.name).includes(expected);
    });
  }

  function getNearestPeriodInfo(index, relativePath) {
    const periodInfo = Types.findNearestPeriodFolder(index, relativePath);

    if (!periodInfo) {
      return {
        periodRaw: "",
        periodKey: "sin-periodo"
      };
    }

    return {
      periodRaw: safeText(periodInfo.periodRaw),
      periodKey: safeText(periodInfo.periodKey) || "sin-periodo"
    };
  }

  function extractTrainingNameFromFile(file) {
    const parsed = Types.parseDocumentFileName(file.name, DEFAULT_SCOPE);

    if (parsed && parsed.valid && parsed.documentName) {
      return normalizeTrainingDisplayName(parsed.documentName);
    }

    const rawName = safeText(file.name).replace(/\.[^.]+$/i, "");
    const fallback = rawName.replace(
      /^UGPA-[A-Z0-9]+-\d+-PRO-\d{3}-\d{4}-\d{2}-/i,
      ""
    );

    return normalizeTrainingDisplayName(fallback);
  }

  function detectEvidenceType(index, file) {
    const parsed = Types.parseDocumentFileName(file.name, DEFAULT_SCOPE);
    const processNumber = parsed && parsed.valid
      ? safeText(parsed.processNumber)
      : detectProcessNumber(file.name);

    if (processNumber !== PROCESS_134 && processNumber !== PROCESS_135) {
      return null;
    }

    const documentType = parsed && parsed.valid
      ? Types.normalizeCompareText(parsed.documentType)
      : "";

    if (processNumber === PROCESS_134) {
      if (hasAncestorFolderLike(index, file.relativePath, EVIDENCE_DEFINITIONS.planning.folderLabel)) {
        return EVIDENCE_DEFINITIONS.planning;
      }
      if (hasAncestorFolderLike(index, file.relativePath, EVIDENCE_DEFINITIONS.finalReport.folderLabel)) {
        return EVIDENCE_DEFINITIONS.finalReport;
      }
      if (documentType.startsWith("rgi")) {
        return EVIDENCE_DEFINITIONS.planning;
      }
      if (documentType.startsWith("inf")) {
        return EVIDENCE_DEFINITIONS.finalReport;
      }
    }

    if (processNumber === PROCESS_135) {
      if (
        hasAncestorFolderLike(
          index,
          file.relativePath,
          EVIDENCE_DEFINITIONS.evaluationInstrument.folderLabel
        )
      ) {
        return EVIDENCE_DEFINITIONS.evaluationInstrument;
      }
      if (
        hasAncestorFolderLike(
          index,
          file.relativePath,
          EVIDENCE_DEFINITIONS.impactReport.folderLabel
        )
      ) {
        return EVIDENCE_DEFINITIONS.impactReport;
      }
      if (documentType.startsWith("rgi")) {
        return EVIDENCE_DEFINITIONS.evaluationInstrument;
      }
      if (documentType.startsWith("inf")) {
        return EVIDENCE_DEFINITIONS.impactReport;
      }
    }

    return null;
  }

  function buildEntry(index, scanData, file, evidenceDef) {
    const parsed = Types.parseDocumentFileName(file.name, DEFAULT_SCOPE);
    const periodInfo = getNearestPeriodInfo(index, file.relativePath);
    const trainingLabel = extractTrainingNameFromFile(file);
    const trainingKey = buildTrainingKey(trainingLabel);

    return {
      id: [
        safeText(file.relativePath),
        evidenceDef.key,
        trainingKey,
        periodInfo.periodKey
      ].join("|"),
      rootPath: safeText(scanData && scanData.rootPath),
      file: file,
      evidenceKey: evidenceDef.key,
      evidenceDef: evidenceDef,
      trainingLabel: trainingLabel,
      trainingKey: trainingKey,
      periodLabel: periodInfo.periodRaw || "Sin período identificado",
      periodRaw: periodInfo.periodRaw,
      periodKey: periodInfo.periodKey,
      docYear: parsed && parsed.valid ? safeText(parsed.year) : "",
      docMonth: parsed && parsed.valid ? safeText(parsed.month) : ""
    };
  }

  function indexEntries(scanData) {
    const index = Types.buildScanIndex(scanData);
    const files = getIndexFiles(index);
    const entries = [];

    files.forEach(function each(file) {
      const parsed = Types.parseDocumentFileName(file.name, DEFAULT_SCOPE);
      const processNumber = parsed && parsed.valid
        ? safeText(parsed.processNumber)
        : detectProcessNumber(file.name);

      if (processNumber !== PROCESS_134 && processNumber !== PROCESS_135) {
        return;
      }

      if (!hasAncestorProcess(index, file.relativePath, processNumber)) {
        return;
      }

      const evidenceDef = detectEvidenceType(index, file);
      if (!evidenceDef) {
        return;
      }

      const entry = buildEntry(index, scanData, file, evidenceDef);
      if (!entry.trainingKey) {
        return;
      }

      entries.push(entry);
    });

    return {
      index: index,
      entries: entries
    };
  }

  function buildGroupKey(entry) {
    return [entry.trainingKey, entry.periodKey].join("|");
  }

  function createGroup(entry) {
    return {
      trainingKey: entry.trainingKey,
      trainingLabel: entry.trainingLabel,
      periodKey: entry.periodKey,
      periodLabel: entry.periodLabel,
      periodRaw: entry.periodRaw,
      rootPath: entry.rootPath,
      entriesByEvidence: {
        planning: null,
        finalReport: null,
        evaluationInstrument: null,
        impactReport: null
      },
      anyFoundEntry: null
    };
  }

  function preferEntry(currentEntry, candidateEntry) {
    if (!currentEntry) return candidateEntry;

    const currentRel = safeText(currentEntry.file && currentEntry.file.relativePath);
    const candidateRel = safeText(candidateEntry.file && candidateEntry.file.relativePath);

    if (!currentRel) return candidateEntry;
    if (!candidateRel) return currentEntry;

    return candidateRel.localeCompare(currentRel, "es", { sensitivity: "base" }) < 0
      ? candidateEntry
      : currentEntry;
  }

  function groupEntries(indexed) {
    const groupsMap = new Map();

    indexed.entries.forEach(function each(entry) {
      const key = buildGroupKey(entry);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, createGroup(entry));
      }

      const group = groupsMap.get(key);
      group.trainingLabel = group.trainingLabel || entry.trainingLabel;
      group.periodLabel = group.periodLabel || entry.periodLabel;
      group.periodRaw = group.periodRaw || entry.periodRaw;
      group.rootPath = group.rootPath || entry.rootPath;
      group.anyFoundEntry = preferEntry(group.anyFoundEntry, entry);
      group.entriesByEvidence[entry.evidenceKey] = preferEntry(
        group.entriesByEvidence[entry.evidenceKey],
        entry
      );
    });

    return Array.from(groupsMap.values()).sort(function compare(a, b) {
      const periodCompare = safeText(a.periodLabel).localeCompare(
        safeText(b.periodLabel),
        "es",
        { sensitivity: "base" }
      );
      if (periodCompare !== 0) return periodCompare;

      return safeText(a.trainingLabel).localeCompare(
        safeText(b.trainingLabel),
        "es",
        { sensitivity: "base" }
      );
    });
  }

  function buildExpectedFileName(trainingLabel, evidenceDef) {
    const cleanTraining = normalizeTrainingDisplayName(trainingLabel) || "NOMBRE DE CAPACITACION";
    return [
      evidenceDef.codeBase,
      "XX",
      "PRO-" + evidenceDef.processNumber,
      "AAAA-MM",
      cleanTraining + ".pdf"
    ].join("-");
  }

  function buildExpectedFolderRelative(group, evidenceDef) {
    const period = safeText(group.periodLabel) || "{PERIODO}";
    return [
      "",
      "UGPA-PRO-" + evidenceDef.processNumber,
      period,
      evidenceDef.folderLabel,
      ""
    ].join("/");
  }

  function buildClosestFolderPath(index, group, evidenceDef) {
    const folders = getIndexFolders(index);
    const expectedFolderLabel = Types.normalizeCompareText(evidenceDef.folderLabel);

    const candidates = folders
      .filter(function keep(folder) {
        if (!hasAncestorProcess(index, folder.relativePath, evidenceDef.processNumber)) {
          return false;
        }

        const folderName = Types.normalizeCompareText(folder && folder.name);
        return folderName.includes(expectedFolderLabel);
      })
      .map(function map(folder) {
        const periodInfo = getNearestPeriodInfo(index, folder.relativePath);
        let score = 0;

        if (group.periodRaw && periodInfo.periodRaw && Types.arePeriodsRelated(group.periodRaw, periodInfo.periodRaw)) {
          score += 100;
        }

        if (group.periodKey && periodInfo.periodKey && group.periodKey === periodInfo.periodKey) {
          score += 25;
        }

        return {
          folder: folder,
          score: score
        };
      })
      .sort(function compare(a, b) {
        return b.score - a.score;
      });

    if (candidates.length && candidates[0].folder && candidates[0].folder.path) {
      return safeText(candidates[0].folder.path);
    }

    const periodFolders = folders.filter(function keep(folder) {
      const info = getNearestPeriodInfo(index, folder.relativePath);
      const sameFolderAsPeriod = Types.findNearestPeriodFolder(index, folder.relativePath);
      const isPeriodFolder = sameFolderAsPeriod
        && sameFolderAsPeriod.folder
        && safeText(sameFolderAsPeriod.folder.relativePath) === safeText(folder.relativePath);

      if (!isPeriodFolder) return false;
      if (!hasAncestorProcess(index, folder.relativePath, evidenceDef.processNumber)) return false;
      if (!group.periodRaw || !info.periodRaw) return false;

      return Types.arePeriodsRelated(group.periodRaw, info.periodRaw);
    });

    if (periodFolders.length && periodFolders[0].path) {
      return safeText(periodFolders[0].path);
    }

    const processFolder = folders.find(function keep(folder) {
      return Types.normalizeCompareText(folder && folder.name).includes(
        "ugpa pro " + evidenceDef.processNumber
      ) || Types.normalizeCompareText(folder && folder.name).includes(
        "pro-" + evidenceDef.processNumber
      );
    });

    if (processFolder && processFolder.path) {
      return safeText(processFolder.path);
    }

    return safeText(group.rootPath);
  }

  function buildActualValue(group) {
    function yesNo(entry) {
      return entry ? "Sí" : "No";
    }

    const planning = group.entriesByEvidence.planning;
    const finalReport = group.entriesByEvidence.finalReport;
    const evaluationInstrument = group.entriesByEvidence.evaluationInstrument;
    const impactReport = group.entriesByEvidence.impactReport;

    const foundFilePath = group.anyFoundEntry && group.anyFoundEntry.file
      ? safeText(group.anyFoundEntry.file.path)
      : "";

    return [
      "Capacitación: " + safeText(group.trainingLabel),
      "Período: " + safeText(group.periodLabel),
      "Planificación: " + yesNo(planning),
      "Informe final: " + yesNo(finalReport),
      "Instrumento de evaluación: " + yesNo(evaluationInstrument),
      "Informe de impacto: " + yesNo(impactReport),
      foundFilePath ? "Archivo correcto encontrado: " + foundFilePath : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildExpectedValue(group, evidenceDef, expectedFileName, relatedFolderRelative) {
    return [
      "Falta: " + evidenceDef.title,
      "Nombre esperado: " + expectedFileName,
      "Carpeta esperada: " + relatedFolderRelative
    ].join("\n");
  }

  function buildExampleValue(trainingLabel) {
    const cleanTraining = normalizeTrainingDisplayName(trainingLabel) || "Nombre de la capacitacion";

    return [
      "Ejemplo esperado del conjunto completo:",
      "UGPA-RGI1-XX-PRO-134-AAAA-MM-" + cleanTraining + ".pdf",
      "UGPA-INF-XX-PRO-134-AAAA-MM-" + cleanTraining + ".pdf",
      "UGPA-RGI1-XX-PRO-135-AAAA-MM-" + cleanTraining + ".pdf",
      "UGPA-INF-XX-PRO-135-AAAA-MM-" + cleanTraining + ".pdf"
    ].join("\n");
  }

  function addMissingEvidenceFinding(findings, rule, scope, scanData, index, group, evidenceDef) {
    const foundEntry = group.anyFoundEntry;
    const expectedFileName = buildExpectedFileName(group.trainingLabel, evidenceDef);
    const relatedFolderRelative = buildExpectedFolderRelative(group, evidenceDef);
    const relatedFolderPath = buildClosestFolderPath(index, group, evidenceDef);

    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope: scope,
        severity: rule.severity,
        title: "Capacitación incompleta: falta " + evidenceDef.shortLabel.toLowerCase(),
        description:
          "La capacitación existe en el período identificado, pero no cuenta con una de las 4 evidencias obligatorias.",
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath:
          foundEntry && foundEntry.file
            ? foundEntry.file.relativePath
            : "",
        absolutePath:
          foundEntry && foundEntry.file
            ? foundEntry.file.path
            : safeText(scanData.rootPath),
        actualValue: buildActualValue(group),
        expectedValue: buildExpectedValue(
          group,
          evidenceDef,
          expectedFileName,
          relatedFolderRelative
        ),
        exampleValue: buildExampleValue(group.trainingLabel),

        trainingLabel: group.trainingLabel,
        periodLabel: group.periodLabel,
        foundLabel: "Archivo correcto encontrado",
        missingLabel: evidenceDef.title,
        expectedFileName: expectedFileName,
        foundFilePath:
          foundEntry && foundEntry.file
            ? safeText(foundEntry.file.path)
            : "",
        relatedFolderPath: relatedFolderPath,
        primaryActionLabel: "Abrir archivo correcto",
        primaryActionPath:
          foundEntry && foundEntry.file
            ? safeText(foundEntry.file.path)
            : "",
        secondaryActionLabel: "Abrir carpeta donde falta",
        secondaryActionPath: relatedFolderPath
      })
    );
  }

  function run(scope, scanData, rule) {
    const safeScope = Types.normalizeScope(scope);

    if (safeScope !== DEFAULT_SCOPE) {
      return [];
    }

    if (!scanData || scanData.ok !== true) {
      return [];
    }

    const indexed = indexEntries(scanData);
    const groups = groupEntries(indexed);
    const findings = [];

    groups.forEach(function each(group) {
      EVIDENCE_ORDER.forEach(function eachEvidence(evidenceDef) {
        if (group.entriesByEvidence[evidenceDef.key]) {
          return;
        }

        addMissingEvidenceFinding(
          findings,
          rule,
          safeScope,
          scanData,
          indexed.index,
          group,
          evidenceDef
        );
      });
    });

    return findings;
  }

  window.RuleTrainingCompleteWith4Evidences = {
    id: RULE_ID,
    name: RULE_NAME,
    scope: DEFAULT_SCOPE,
    severity: "error",
    description:
      "Valida que toda capacitación UGPA tenga planificación, informe final, instrumento de evaluación e informe de impacto en el mismo período.",
    detail:
      "La comparación se hace por nombre de capacitación, período y tipo de evidencia. Tolera tildes, mayúsculas, guiones, espacios dobles y algunas palabras extra al final del nombre.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);