(function (window) {
  "use strict";

  const Types = window.RulesTypes;

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function detectExtension(fileName) {
    const raw = safeText(fileName);
    const lastDot = raw.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === raw.length - 1) return "pdf";
    return safeText(raw.slice(lastDot + 1)) || "pdf";
  }

  function buildDocumentFileExpected(scope, processNumber, extension) {
    const ext = safeText(extension) || "pdf";
    return (
      scope +
      "-[tipo]-[consecutivo]-PRO-" +
      safeText(processNumber || "000") +
      "-[año]-[mes]-[nombre del documento]." +
      ext
    );
  }

  function buildDocumentFileExample(scope, processNumber, extension) {
    const ext = safeText(extension) || "pdf";
    return (
      scope +
      "-RGI1-01-PRO-" +
      safeText(processNumber || "000") +
      "-2026-03-Nombre del documento." +
      ext
    );
  }

  function buildCorrectedFileName(fileValidation, scope, processNumber) {
    const extension =
      safeText(fileValidation && fileValidation.extension) || "pdf";
    const documentType =
      safeText(fileValidation && fileValidation.documentType) || "RGI1-01";
    const year = safeText(fileValidation && fileValidation.year) || "2026";
    const month = safeText(fileValidation && fileValidation.month) || "03";
    const documentName =
      safeText(fileValidation && fileValidation.documentName) ||
      "Nombre del documento";

    return (
      scope +
      "-" +
      documentType +
      "-PRO-" +
      processNumber +
      "-" +
      year +
      "-" +
      month +
      "-" +
      documentName +
      "." +
      extension
    );
  }

  function getParentAbsolutePath(absolutePath) {
    const safePath = safeText(absolutePath);
    if (!safePath) return "";
    return safePath.replace(/[\\/][^\\/]+$/, "");
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

  function addFileFinding(findings, rule, scope, scanData, file, title, message, options) {
    const opts = options && typeof options === "object" ? options : {};
    const processNumber = safeText(opts.processNumber) || "000";
    const extension = safeText(opts.extension) || detectExtension(file.name);

    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope: scope,
        severity: rule.severity,
        title: title,
        description: message,
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: file.relativePath,
        absolutePath: file.path || scanData.rootPath || "",
        actualValue: safeText(opts.actualValue) || file.name,
        expectedValue:
          safeText(opts.expectedValue) ||
          buildDocumentFileExpected(scope, processNumber, extension),
        exampleValue:
          safeText(opts.exampleValue) ||
          buildDocumentFileExample(scope, processNumber, extension),
        primaryActionLabel: "Abrir carpeta del documento",
        primaryActionPath:
          getParentAbsolutePath(file.path || "") || scanData.rootPath || ""
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

      index.files.forEach(function eachFile(file) {
        if (!Types.isDescendantOf(file.relativePath, processFolder.relativePath)) {
          return;
        }

        const fileName = safeText(file.name).toLowerCase();
        if (fileName === "desktop.ini" || fileName === "thumbs.db") {
          return;
        }

        const parentRel = Types.getParentRelativePath(file.relativePath);

        if (parentRel === processFolder.relativePath) {
          addFileFinding(
            findings,
            rule,
            scope,
            scanData,
            file,
            "Archivo fuera de subcarpeta",
            "El archivo está directamente dentro de la carpeta del proceso. Debe ubicarse dentro de la subcarpeta documental o de período correspondiente.",
            {
              processNumber: processValidation.processNumber,
              extension: detectExtension(file.name)
            }
          );
        }

        const fileValidation = Types.parseDocumentFileName(file.name);

        if (!fileValidation || !fileValidation.valid) {
          addFileFinding(
            findings,
            rule,
            scope,
            scanData,
            file,
            "Archivo mal nombrado",
            "El nombre no contiene de forma completa la unidad, tipo documental, proceso, año, mes y nombre del documento.",
            {
              processNumber: processValidation.processNumber,
              extension: detectExtension(file.name)
            }
          );
          return;
        }

        if (
          fileValidation.unitCode &&
          fileValidation.unitCode !== scope
        ) {
          addFileFinding(
            findings,
            rule,
            scope,
            scanData,
            file,
            "Unidad documental inconsistente",
            "El archivo identifica la unidad " +
              fileValidation.unitCode +
              ", pero se encuentra dentro de " +
              scope +
              ".",
            {
              actualValue: file.name,
              expectedValue: buildCorrectedFileName(
                fileValidation,
                scope,
                processValidation.processNumber
              ),
              exampleValue: buildDocumentFileExample(
                scope,
                processValidation.processNumber,
                detectExtension(file.name)
              ),
              processNumber: processValidation.processNumber,
              extension: detectExtension(file.name)
            }
          );
        }

        if (
          fileValidation.processNumber !== processValidation.processNumber
        ) {
          addFileFinding(
            findings,
            rule,
            scope,
            scanData,
            file,
            "Código de proceso inconsistente",
            "El archivo identifica el proceso " +
              fileValidation.processNumber +
              ", pero la carpeta corresponde al proceso " +
              processValidation.processNumber +
              ".",
            {
              actualValue: file.name,
              expectedValue: buildCorrectedFileName(
                fileValidation,
                scope,
                processValidation.processNumber
              ),
              exampleValue: buildCorrectedFileName(
                fileValidation,
                scope,
                processValidation.processNumber
              ),
              processNumber: processValidation.processNumber,
              extension: detectExtension(file.name)
            }
          );
        }
      });
    });

    return findings;
  }

  window.RuleNamingStructure = {
    id: "naming-structure",
    name: "Nomenclatura de procesos y documentos",
    scope: "BOTH",
    severity: "warning",
    description:
      "Valida los documentos ubicados dentro de procesos UGPA/UTET sin considerar como error los documentos generales de la raíz.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
