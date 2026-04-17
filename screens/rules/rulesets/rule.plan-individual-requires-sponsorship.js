(function (window) {
  "use strict";
  /*
  Nombre completo: rule.plan-individual-requires-sponsorship.js
  Ruta o ubicación: /screens/rules/rulesets/rule.plan-individual-requires-sponsorship.js
  Función o funciones:
  - Aplicar la regla visible de correspondencia entre Plan Individual y Acuerdo de Patrocinio
  - Detectar faltantes en ambos sentidos: plan sin acuerdo y acuerdo sin plan
  - Identificar persona y período desde la ruta y el nombre del archivo
  - Exponer datos extendidos para UI y exportación Excel
  */

  const Types = window.RulesTypes || {};

  const RULE_ID = "plan-individual-requires-sponsorship";
  const RULE_NAME = "Plan individual - acuerdo";
  const RULE_SCOPE = "UGPA";
  const RULE_SEVERITY = "warning";

  const PLAN_ROOT_RELATIVE =
    "PROCESOS MISIONALES/UGPA-PRO-251-Planificacion-de-Capacitacion-y-Formacion-Individual-a-Docentes";
  const PLAN_SUBFOLDER_NAME = "UGPA-PRO-251-Plan individual";

  const AGREEMENT_ROOT_RELATIVE =
    "PROCESOS MISIONALES/EJECUCION Y MEDICION DE CAPACITACION DOCENTE/UGPA-PRO-134-Ejecucion-de-Capacitacion-Docente";
  const AGREEMENT_SUBFOLDER_NAME = "UGPA-RGI2-PRO-134-Acuerdo de Patrocinio";

  const SYSTEM_FILE_NAMES = new Set([
    "desktop.ini",
    "thumbs.db",
    ".ds_store",
    "icon\r",
    "icon"
  ]);

  const EXCLUDED_FILE_EXTENSIONS = new Set([
    ".ini",
    ".db",
    ".tmp",
    ".bak",
    ".lnk"
  ]);

  function safeText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    if (text) return text;
    return String(fallback == null ? "" : fallback).trim();
  }

  function normalizeRelativePath(value) {
    if (Types.normalizeRelativePath) {
      return Types.normalizeRelativePath(value);
    }
    return safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function normalizeCompareText(value) {
    if (Types.normalizeCompareText) {
      return Types.normalizeCompareText(value);
    }
    return safeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function removeExtension(fileName) {
    if (Types.removeFileExtension) {
      return Types.removeFileExtension(fileName);
    }
    return safeText(fileName).replace(/\.[^.]+$/i, "");
  }

  function normalizeTeacherName(value) {
    if (Types.normalizeTeacherName) {
      return Types.normalizeTeacherName(value);
    }
    return normalizeCompareText(value)
      .replace(/[_\-]+/g, " ")
      .replace(/\b(signed|firmado|firma|patrocinio|convenio)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function arePeriodsRelated(leftPeriod, rightPeriod) {
    if (Types.arePeriodsRelated) {
      return Types.arePeriodsRelated(leftPeriod, rightPeriod);
    }
    return normalizeCompareText(leftPeriod) === normalizeCompareText(rightPeriod);
  }

  function escapeForId(value) {
    return normalizeCompareText(value).replace(/[^a-z0-9]+/g, "-");
  }

  function splitRelativePath(relativePath) {
    return normalizeRelativePath(relativePath)
      .split("/")
      .map(function mapPart(part) {
        return safeText(part);
      })
      .filter(Boolean);
  }

  function splitBaseSegments(relativePath) {
    return splitRelativePath(relativePath);
  }

  function startsWithSegments(parts, baseSegments) {
    if (parts.length < baseSegments.length) return false;
    for (let index = 0; index < baseSegments.length; index += 1) {
      if (
        normalizeCompareText(parts[index]) !==
        normalizeCompareText(baseSegments[index])
      ) {
        return false;
      }
    }
    return true;
  }

  function isIgnoredFile(fileRecord) {
    const name = safeText(fileRecord && fileRecord.name).toLowerCase();
    if (!name) return true;
    if (SYSTEM_FILE_NAMES.has(name)) return true;
    const extension = safeText(fileRecord && fileRecord.extension).toLowerCase();
    if (EXCLUDED_FILE_EXTENSIONS.has(extension)) return true;
    return false;
  }

  function normalizeFileNameForMatch(fileName) {
    return removeExtension(fileName)
      .replace(/\.pdf$/i, "")
      .replace(/[_\-]+/g, " ")
      .replace(/\b(signed|firmado|firma|patrocinio|convenio)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractTeacherName(fileName) {
    const clean = normalizeFileNameForMatch(fileName);
    const directMatch = clean.match(
      /(?:^|[\s\-])(\d{4})[- ](\d{2})[- ](.+)$/i
    );
    if (directMatch && directMatch[3]) {
      return safeText(directMatch[3]);
    }

    const proMatch = clean.match(/(?:PRO[- ]\d+[- ])(.+)$/i);
    if (proMatch && proMatch[1]) {
      return safeText(proMatch[1]);
    }

    return clean;
  }

  function buildAbsolutePath(rootPath, relativePath) {
    const parts = splitRelativePath(relativePath);
    let current = safeText(rootPath);
    parts.forEach(function eachPart(part) {
      current = current ? current + "\\" + part : part;
    });
    return current;
  }

  function buildFindingId(payload) {
    if (Types.buildFindingId) {
      return Types.buildFindingId(payload);
    }
    return [
      safeText(payload.ruleId),
      safeText(payload.scope),
      safeText(payload.relativePath),
      safeText(payload.actualValue),
      safeText(payload.expectedValue),
      safeText(payload.personLabel),
      safeText(payload.foundPeriodLabel),
      safeText(payload.missingPeriodLabel)
    ]
      .join("|")
      .toLowerCase();
  }

  function createFinding(payload) {
    const finding = {
      ruleId: RULE_ID,
      ruleName: RULE_NAME,
      scope: RULE_SCOPE,
      severity: RULE_SEVERITY,
      title: safeText(payload.title),
      description: safeText(payload.description),
      rootName: safeText(payload.rootName),
      rootPath: safeText(payload.rootPath),
      relativePath: normalizeRelativePath(payload.relativePath),
      absolutePath: safeText(payload.absolutePath),
      actualLabel: safeText(payload.actualLabel, "Archivo encontrado"),
      expectedLabel: safeText(payload.expectedLabel, "Documento faltante"),
      exampleLabel: safeText(payload.exampleLabel, "Carpeta esperada"),
      actualValue: safeText(payload.actualValue),
      expectedValue: safeText(payload.expectedValue),
      exampleValue: safeText(payload.exampleValue),
      personLabel: safeText(payload.personLabel),
      periodLabel: safeText(payload.periodLabel),
      foundPeriodLabel: safeText(payload.foundPeriodLabel),
      missingPeriodLabel: safeText(payload.missingPeriodLabel),
      foundFileName: safeText(payload.foundFileName),
      missingFileName: safeText(payload.missingFileName),
      foundRelativePath: normalizeRelativePath(payload.foundRelativePath),
      missingExpectedPath: normalizeRelativePath(payload.missingExpectedPath),
      primaryActionLabel: safeText(payload.primaryActionLabel),
      primaryActionPath: safeText(payload.primaryActionPath),
      secondaryActionLabel: safeText(payload.secondaryActionLabel),
      secondaryActionPath: safeText(payload.secondaryActionPath),
      tertiaryActionLabel: safeText(payload.tertiaryActionLabel),
      tertiaryActionPath: safeText(payload.tertiaryActionPath)
    };

    finding.id = buildFindingId(finding);
    return finding;
  }

  function collectPlanDocuments(scanData) {
    const baseSegments = splitBaseSegments(PLAN_ROOT_RELATIVE);
    const files = Array.isArray(scanData && scanData.files) ? scanData.files : [];

    return files
      .filter(function keep(fileRecord) {
        return !isIgnoredFile(fileRecord);
      })
      .map(function mapFile(fileRecord) {
        const relativePath = normalizeRelativePath(fileRecord.relativePath);
        const parts = splitRelativePath(relativePath);
        if (!startsWithSegments(parts, baseSegments)) {
          return null;
        }

        const periodIndex = baseSegments.length;
        const planFolderIndex = periodIndex + 1;
        if (!parts[periodIndex] || !parts[planFolderIndex]) {
          return null;
        }

        if (
          normalizeCompareText(parts[planFolderIndex]) !==
          normalizeCompareText(PLAN_SUBFOLDER_NAME)
        ) {
          return null;
        }

        const fileName = safeText(fileRecord.name || parts[parts.length - 1]);
        if (!fileName) {
          return null;
        }

        const periodLabel = safeText(parts[periodIndex]);
        const personLabel = extractTeacherName(fileName);
        const personKey = normalizeTeacherName(personLabel);

        if (!personKey) {
          return null;
        }

        const containerRelativePath = normalizeRelativePath(
          parts.slice(0, planFolderIndex + 1).join("/")
        );

        return {
          kind: "plan",
          scope: RULE_SCOPE,
          relativePath: relativePath,
          absolutePath: safeText(fileRecord.path),
          rootName: safeText(scanData.rootName),
          rootPath: safeText(scanData.rootPath),
          periodLabel: periodLabel,
          personLabel: personLabel,
          personKey: personKey,
          fileName: fileName,
          containerRelativePath: containerRelativePath,
          containerPath: buildAbsolutePath(scanData.rootPath, containerRelativePath),
          expectedCounterpartRelativePath: normalizeRelativePath(
            [
              AGREEMENT_ROOT_RELATIVE,
              periodLabel,
              AGREEMENT_SUBFOLDER_NAME
            ].join("/")
          ),
          expectedCounterpartPath: buildAbsolutePath(
            scanData.rootPath,
            [
              AGREEMENT_ROOT_RELATIVE,
              periodLabel,
              AGREEMENT_SUBFOLDER_NAME
            ].join("/")
          )
        };
      })
      .filter(Boolean);
  }

  function collectAgreementDocuments(scanData) {
    const baseSegments = splitBaseSegments(AGREEMENT_ROOT_RELATIVE);
    const files = Array.isArray(scanData && scanData.files) ? scanData.files : [];

    return files
      .filter(function keep(fileRecord) {
        return !isIgnoredFile(fileRecord);
      })
      .map(function mapFile(fileRecord) {
        const relativePath = normalizeRelativePath(fileRecord.relativePath);
        const parts = splitRelativePath(relativePath);
        if (!startsWithSegments(parts, baseSegments)) {
          return null;
        }

        const periodIndex = baseSegments.length;
        const agreementsFolderIndex = periodIndex + 1;
        if (!parts[periodIndex] || !parts[agreementsFolderIndex]) {
          return null;
        }

        if (
          normalizeCompareText(parts[agreementsFolderIndex]) !==
          normalizeCompareText(AGREEMENT_SUBFOLDER_NAME)
        ) {
          return null;
        }

        const fileName = safeText(fileRecord.name || parts[parts.length - 1]);
        if (!fileName) {
          return null;
        }

        const periodLabel = safeText(parts[periodIndex]);
        const personLabel = extractTeacherName(fileName);
        const personKey = normalizeTeacherName(personLabel);

        if (!personKey) {
          return null;
        }

        const containerRelativePath = normalizeRelativePath(
          parts.slice(0, agreementsFolderIndex + 1).join("/")
        );

        return {
          kind: "agreement",
          scope: RULE_SCOPE,
          relativePath: relativePath,
          absolutePath: safeText(fileRecord.path),
          rootName: safeText(scanData.rootName),
          rootPath: safeText(scanData.rootPath),
          periodLabel: periodLabel,
          personLabel: personLabel,
          personKey: personKey,
          fileName: fileName,
          containerRelativePath: containerRelativePath,
          containerPath: buildAbsolutePath(scanData.rootPath, containerRelativePath),
          expectedCounterpartRelativePath: normalizeRelativePath(
            [
              PLAN_ROOT_RELATIVE,
              periodLabel,
              PLAN_SUBFOLDER_NAME
            ].join("/")
          ),
          expectedCounterpartPath: buildAbsolutePath(
            scanData.rootPath,
            [
              PLAN_ROOT_RELATIVE,
              periodLabel,
              PLAN_SUBFOLDER_NAME
            ].join("/")
          )
        };
      })
      .filter(Boolean);
  }

  function hasMatchingCounterpart(sourceDoc, candidates) {
    return candidates.some(function someCandidate(candidate) {
      return (
        candidate.personKey === sourceDoc.personKey &&
        arePeriodsRelated(sourceDoc.periodLabel, candidate.periodLabel)
      );
    });
  }

  function createMissingAgreementFinding(planDoc) {
    return createFinding({
      title: "Plan individual sin acuerdo de patrocinio",
      description:
        "Se encontró un Plan Individual, pero no se encontró su Acuerdo de Patrocinio correspondiente para la misma persona y período.",
      rootName: planDoc.rootName,
      rootPath: planDoc.rootPath,
      relativePath: planDoc.relativePath,
      absolutePath: planDoc.absolutePath,
      actualLabel: "Archivo encontrado",
      expectedLabel: "Documento faltante",
      exampleLabel: "Carpeta donde debería existir",
      actualValue: planDoc.fileName,
      expectedValue:
        "Acuerdo de Patrocinio para " +
        planDoc.personLabel +
        " en el período " +
        planDoc.periodLabel +
        ".",
      exampleValue: planDoc.expectedCounterpartRelativePath,
      personLabel: planDoc.personLabel,
      periodLabel: planDoc.periodLabel,
      foundPeriodLabel: planDoc.periodLabel,
      missingPeriodLabel: planDoc.periodLabel,
      foundFileName: planDoc.fileName,
      missingFileName: "Acuerdo de Patrocinio",
      foundRelativePath: planDoc.relativePath,
      missingExpectedPath: planDoc.expectedCounterpartRelativePath,
      primaryActionLabel: "Abrir carpeta del plan",
      primaryActionPath: planDoc.containerPath,
      secondaryActionLabel: "Abrir carpeta donde debe estar el acuerdo",
      secondaryActionPath: planDoc.expectedCounterpartPath
    });
  }

  function createMissingPlanFinding(agreementDoc) {
    return createFinding({
      title: "Acuerdo de patrocinio sin plan individual",
      description:
        "Se encontró un Acuerdo de Patrocinio, pero no se encontró su Plan Individual correspondiente para la misma persona y período.",
      rootName: agreementDoc.rootName,
      rootPath: agreementDoc.rootPath,
      relativePath: agreementDoc.relativePath,
      absolutePath: agreementDoc.absolutePath,
      actualLabel: "Archivo encontrado",
      expectedLabel: "Documento faltante",
      exampleLabel: "Carpeta donde debería existir",
      actualValue: agreementDoc.fileName,
      expectedValue:
        "Plan Individual para " +
        agreementDoc.personLabel +
        " en el período " +
        agreementDoc.periodLabel +
        ".",
      exampleValue: agreementDoc.expectedCounterpartRelativePath,
      personLabel: agreementDoc.personLabel,
      periodLabel: agreementDoc.periodLabel,
      foundPeriodLabel: agreementDoc.periodLabel,
      missingPeriodLabel: agreementDoc.periodLabel,
      foundFileName: agreementDoc.fileName,
      missingFileName: "Plan Individual",
      foundRelativePath: agreementDoc.relativePath,
      missingExpectedPath: agreementDoc.expectedCounterpartRelativePath,
      primaryActionLabel: "Abrir carpeta del acuerdo",
      primaryActionPath: agreementDoc.containerPath,
      secondaryActionLabel: "Abrir carpeta donde debe estar el plan",
      secondaryActionPath: agreementDoc.expectedCounterpartPath
    });
  }

  function dedupeFindings(findings) {
    const seen = new Set();
    return findings.filter(function keep(finding) {
      const key = safeText(finding.id) || escapeForId(
        [
          finding.title,
          finding.personLabel,
          finding.foundPeriodLabel,
          finding.missingPeriodLabel,
          finding.foundFileName,
          finding.missingFileName
        ].join("|")
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function run(context) {
    const scanData = context && context.scanData;
    if (!scanData || scanData.ok !== true) {
      return [];
    }

    const planDocuments = collectPlanDocuments(scanData);
    const agreementDocuments = collectAgreementDocuments(scanData);

    const findings = [];

    planDocuments.forEach(function eachPlan(planDoc) {
      if (!hasMatchingCounterpart(planDoc, agreementDocuments)) {
        findings.push(createMissingAgreementFinding(planDoc));
      }
    });

    agreementDocuments.forEach(function eachAgreement(agreementDoc) {
      if (!hasMatchingCounterpart(agreementDoc, planDocuments)) {
        findings.push(createMissingPlanFinding(agreementDoc));
      }
    });

    return dedupeFindings(findings);
  }

  window.RulePlanIndividualRequiresSponsorship = {
    id: RULE_ID,
    name: RULE_NAME,
    scope: RULE_SCOPE,
    severity: RULE_SEVERITY,
    description:
      "Valida que cada Plan Individual tenga su Acuerdo de Patrocinio y viceversa, mostrando persona, períodos y documento faltante.",
    run: run
  };
})(window);