(function (window) {
  "use strict";

  const Types = window.RulesTypes;

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

        if (validation.shouldEvaluate && !validation.valid) {
          addFinding(findings, rule, scope, scanData, folder, validation);
        }
      });
    });

    return findings;
  }

  window.RulePeriodFolderFormat = {
    id: "period-folder-format",
    name: "Formato de carpetas de período",
    scope: "BOTH",
    severity: "warning",
    description:
      "Valida períodos dentro de los procesos aunque la estructura incluya carpetas contenedoras de SharePoint.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
