(function (window) {
  "use strict";

  const Types = window.RulesTypes;
  const Manual = window.AuditManualCatalog || {};

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function createFinding(payload) {
    const finding = {
      ruleId: safeText(payload.ruleId),
      ruleName: safeText(payload.ruleName),
      category: safeText(payload.category) || "names",
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
      primaryActionLabel: safeText(payload.primaryActionLabel),
      primaryActionPath: safeText(payload.primaryActionPath)
    };

    finding.id = Types.buildFindingId(finding);
    return finding;
  }

  function addFinding(findings, rule, scope, scanData, folder, validation) {
    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        category: "names",
        scope: scope,
        severity: rule.severity,
        title: "Carpeta de período mal nombrada",
        description:
          validation.message ||
          "La carpeta parece representar un período, pero no usa un formato oficial.",
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: folder.relativePath,
        absolutePath: folder.path || scanData.rootPath || "",
        actualValue: folder.name,
        expectedValue:
          validation.expected || "Usar un formato oficial de período",
        exampleValue:
          validation.example || "Octubre 2025–Marzo 2026",
        primaryActionLabel: "Abrir carpeta",
        primaryActionPath: folder.path || scanData.rootPath || ""
      })
    );
  }

  function monthNumber(year, month) {
    return Number(year || 0) * 12 + Number(month || 0);
  }

  function parseVersionStart(value) {
    const match = safeText(value).match(/^(\d{4})-(\d{2})$/);
    if (!match) return 0;
    return monthNumber(Number(match[1]), Number(match[2]));
  }

  function resolvePeriodPolicy(policy, range) {
    const resolved = {
      required: !!(policy && policy.required),
      months: Number(policy && policy.months) || 0,
      label: safeText(policy && policy.label, "Período obligatorio")
    };
    const start = monthNumber(range && range.startYear, range && range.startMonth);

    (Array.isArray(policy && policy.versions) ? policy.versions : [])
      .slice()
      .sort(function sortVersions(a, b) {
        return parseVersionStart(a && a.from) - parseVersionStart(b && b.from);
      })
      .forEach(function eachVersion(version) {
        const from = parseVersionStart(version && version.from);
        if (from && start >= from) {
          resolved.months = Number(version.months) || resolved.months;
          resolved.label = safeText(version.label, resolved.label);
        }
      });

    return resolved;
  }

  function periodDurationMonths(range) {
    if (!range || !range.comparable) return 0;
    const start = monthNumber(range.startYear, range.startMonth);
    const end = monthNumber(range.endYear, range.endMonth);
    return end >= start ? end - start + 1 : 0;
  }

  function expectedDurationText(policy) {
    const months = Number(policy && policy.months) || 0;
    const label = safeText(policy && policy.label);
    if (!months) return label || "Período configurado para el proceso";
    return months + " meses" + (label ? " (" + label + ")" : "");
  }

  function addDurationFinding(findings, rule, scope, scanData, folder, validation, policy, actualMonths) {
    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        category: "names",
        scope: scope,
        severity: rule.severity,
        title: "Duración de período incorrecta",
        description:
          "La carpeta usa un período válido, pero su duración no corresponde a la periodicidad definida para este proceso.",
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: folder.relativePath,
        absolutePath: folder.path || scanData.rootPath || "",
        actualValue: safeText(folder.name) + " · " + actualMonths + " meses",
        expectedValue: expectedDurationText(policy),
        exampleValue: safeText(validation && validation.example),
        primaryActionLabel: "Abrir carpeta",
        primaryActionPath: folder.path || scanData.rootPath || ""
      })
    );
  }

  function addMissingPeriodFinding(findings, rule, scope, scanData, processFolder, processValidation, policy) {
    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        category: "required-documents",
        scope: scope,
        severity: rule.severity,
        title: "Carpeta de período faltante",
        description:
          "El proceso debe organizar su documentación dentro de una carpeta de período antes de las carpetas o documentos del proceso.",
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: processFolder.relativePath,
        absolutePath: processFolder.path || scanData.rootPath || "",
        actualValue: safeText(processFolder.name),
        expectedValue: expectedDurationText(policy),
        exampleValue: "Ejemplo: Octubre 2025–Marzo 2026",
        primaryActionLabel: "Abrir proceso",
        primaryActionPath: processFolder.path || scanData.rootPath || ""
      })
    );
  }

  function getProcessPolicy(scope, processValidation) {
    if (!Manual || typeof Manual.getProcess !== "function") return null;
    const process = Manual.getProcess(scope, processValidation && processValidation.processNumber);
    return process && process.periodPolicy ? process.periodPolicy : null;
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];
    if (!Types || typeof Types.findProcessFolders !== "function") return [];

    const index = Types.buildScanIndex(scanData);
    const findings = [];
    const processFolders = Types.findProcessFolders(index, scope);

    processFolders.forEach(function eachProcess(processFolder) {
      const processValidation =
        processFolder.processValidation ||
        Types.parseProcessFolderName(processFolder.name, scope);

      if (!processValidation || !processValidation.valid) return;

      const processPolicy = getProcessPolicy(scope, processValidation);
      let hasPeriodCandidate = false;

      index.folders.forEach(function eachFolder(folder) {
        if (folder.relativePath === processFolder.relativePath) return;
        if (!Types.isDescendantOf(folder.relativePath, processFolder.relativePath)) {
          return;
        }

        const validation = Types.parsePeriodFolderName(
          folder.name,
          processValidation.processCode,
          scope
        );

        if (!validation.shouldEvaluate) return;
        hasPeriodCandidate = true;

        if (!validation.valid) {
          addFinding(findings, rule, scope, scanData, folder, validation);
          return;
        }

        if (!processPolicy) return;

        const range = Types.parseSpanishPeriodRange
          ? Types.parseSpanishPeriodRange(validation.normalizedPeriod)
          : null;
        const resolvedPolicy = resolvePeriodPolicy(processPolicy, range);
        const actualMonths = periodDurationMonths(range);

        if (
          resolvedPolicy.months > 0 &&
          actualMonths > 0 &&
          actualMonths !== resolvedPolicy.months
        ) {
          addDurationFinding(
            findings,
            rule,
            scope,
            scanData,
            folder,
            validation,
            resolvedPolicy,
            actualMonths
          );
        }
      });

      if (processPolicy && processPolicy.required && !hasPeriodCandidate) {
        addMissingPeriodFinding(
          findings,
          rule,
          scope,
          scanData,
          processFolder,
          processValidation,
          resolvePeriodPolicy(processPolicy, null)
        );
      }
    });

    return findings;
  }

  window.RulePeriodFolderFormat = {
    id: "period-folder-format",
    name: "Formato de carpetas de período",
    scope: "BOTH",
    severity: "warning",
    description:
      "Valida que cada proceso tenga período y que su formato y duración correspondan a la periodicidad configurada, incluyendo cambios históricos.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
