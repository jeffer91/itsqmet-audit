(function (window) {
  "use strict";

  const Types = window.RulesTypes;

  function safeText(value) {
    return String(value || "").trim();
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
      exampleValue: safeText(payload.exampleValue)
    };
    finding.id = Types.buildFindingId(finding);
    return finding;
  }

  function getProcessFolders(index) {
    const exceptionList = window.RulesConfig
      && Array.isArray(window.RulesConfig.ROOT_EXCEPTION_FOLDERS)
      ? window.RulesConfig.ROOT_EXCEPTION_FOLDERS
      : [];

    const exceptionFolders = new Set(
      exceptionList.map((item) => safeText(item).toUpperCase())
    );

    return (index.childFoldersMap[""] || []).filter((folder) => {
      return !exceptionFolders.has(safeText(folder.name).toUpperCase());
    });
  }

  function addFinding(findings, rule, scope, scanData, folder, validation) {
    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope,
        severity: rule.severity,
        title: "Carpeta de período mal nombrada",
        description: validation.reason,
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: folder.relativePath,
        absolutePath: folder.path || scanData.rootPath || "",
        actualValue: folder.name,
        expectedValue: validation.expectedValue,
        exampleValue: validation.exampleValue
      })
    );
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];

    const index = Types.buildScanIndex(scanData);
    const findings = [];
    const processFolders = getProcessFolders(index);

    processFolders.forEach((processFolder) => {
      const processValidation = Types.parseProcessFolderName(processFolder.name, scope);
      if (!processValidation.valid) return;

      const directChildren = index.childFoldersMap[processFolder.relativePath] || [];
      directChildren.forEach((folder) => {
        const validation = Types.parsePeriodFolderName(folder.name, processValidation.processCode);
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
    description: "Valida que las carpetas de período usen el código del proceso, meses completos y el separador oficial –.",
    run(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);