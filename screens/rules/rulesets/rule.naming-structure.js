(function (window) {
  "use strict";

  const Types = window.RulesTypes;

  function safeText(value) {
    return String(value || "").trim();
  }

  function detectProcessNumber(value) {
    const match = safeText(value).match(/PRO-(\d+)/i);
    return match ? safeText(match[1]) : "00";
  }

  function detectExtension(fileName) {
    const raw = safeText(fileName);
    const lastDot = raw.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === raw.length - 1) {
      return "pdf";
    }
    return safeText(raw.slice(lastDot + 1)) || "pdf";
  }

  function buildProcessFolderExpected(scope, sourceName) {
    const processNumber = detectProcessNumber(sourceName);
    return `${scope}-PRO-${processNumber}-[nombre del proceso]`;
  }

  function buildProcessFolderExample(scope, sourceName) {
    const processNumber = detectProcessNumber(sourceName);
    return `${scope}-PRO-${processNumber}-Nombre del proceso`;
  }

  function buildSubfolderExpected(processCode) {
    return `${safeText(processCode)}-[período oficial o tema]`;
  }

  function buildSubfolderExample(processCode) {
    return `${safeText(processCode)}-Abril 2025–Septiembre 2025`;
  }

  function buildDocumentFileExpected(scope, processNumber, extension) {
    const ext = safeText(extension) || "pdf";
    return `${scope}-[tipo]-[consecutivo]-PRO-${safeText(processNumber) || "00"}-[año]-[mes]-[nombre del documento].${ext}`;
  }

  function buildDocumentFileExample(scope, processNumber, extension) {
    const ext = safeText(extension) || "pdf";
    return `${scope}-RGI1-01-PRO-${safeText(processNumber) || "00"}-2026-03-Nombre del documento.${ext}`;
  }

  function buildCorrectedFileName(fileValidation, expectedUnit, expectedProcessNumber) {
    const extension = safeText(fileValidation && fileValidation.extension) || "pdf";
    const unit = safeText(fileValidation && fileValidation.unit) || expectedUnit;
    const documentType = safeText(fileValidation && fileValidation.documentType) || "RGI1";
    const consecutive = safeText(fileValidation && fileValidation.consecutive) || "01";
    const year = safeText(fileValidation && fileValidation.year) || "2026";
    const month = safeText(fileValidation && fileValidation.month) || "03";
    const documentName = safeText(fileValidation && fileValidation.documentName) || "Nombre del documento";
    return `${unit}-${documentType}-${consecutive}-PRO-${expectedProcessNumber}-${year}-${month}-${documentName}.${extension}`;
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

  function addProcessFolderFinding(findings, rule, scope, scanData, folder, message) {
    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope,
        severity: rule.severity,
        title: "Carpeta de proceso mal nombrada",
        description: message,
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: folder.relativePath,
        absolutePath: folder.path || scanData.rootPath || "",
        actualValue: folder.name,
        expectedValue: buildProcessFolderExpected(scope, folder.name),
        exampleValue: buildProcessFolderExample(scope, folder.name)
      })
    );
  }

  function addSubfolderFinding(findings, rule, scope, scanData, folder, message, expectedProcessCode) {
    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope,
        severity: rule.severity,
        title: "Subcarpeta mal nombrada",
        description: message,
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: folder.relativePath,
        absolutePath: folder.path || scanData.rootPath || "",
        actualValue: folder.name,
        expectedValue: buildSubfolderExpected(expectedProcessCode),
        exampleValue: buildSubfolderExample(expectedProcessCode)
      })
    );
  }

  function addFileFinding(findings, rule, scope, scanData, file, title, message, options) {
    const opts = options && typeof options === "object" ? options : {};
    const processNumber = safeText(opts.processNumber) || detectProcessNumber(file.name || file.relativePath);
    const extension = safeText(opts.extension) || detectExtension(file.name);

    findings.push(
      createFinding({
        ruleId: rule.id,
        ruleName: rule.name,
        scope,
        severity: rule.severity,
        title,
        description: message,
        rootName: scanData.rootName || "",
        rootPath: scanData.rootPath || "",
        relativePath: file.relativePath,
        absolutePath: file.path || scanData.rootPath || "",
        actualValue: safeText(opts.actualValue) || file.name,
        expectedValue: safeText(opts.expectedValue) || buildDocumentFileExpected(scope, processNumber, extension),
        exampleValue: safeText(opts.exampleValue) || buildDocumentFileExample(scope, processNumber, extension)
      })
    );
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];

    const expectedUnit = scope;
    const index = Types.buildScanIndex(scanData);
    const findings = [];
    const exceptionFolders = new Set([
      "PROCESOS DE APOYO",
      "PROCESOS ESTRATEGICOS",
      "PROCESOS MISIONALES"
    ]);

    const processFolders = (index.childFoldersMap[""] || []).filter((folder) => {
      return !exceptionFolders.has(safeText(folder.name).toUpperCase());
    });

    processFolders.forEach((processFolder) => {
      const processValidation = Types.parseProcessFolderName(processFolder.name, expectedUnit);
      if (!processValidation.valid) {
        addProcessFolderFinding(
          findings,
          rule,
          scope,
          scanData,
          processFolder,
          processValidation.reason
        );
        return;
      }

      const expectedProcessCode = processValidation.processCode;

      index.allFolders.forEach((folder) => {
        if (folder.relativePath === processFolder.relativePath) return;
        if (!Types.isDescendantOf(folder.relativePath, processFolder.relativePath)) return;

        const subfolderValidation = Types.validateSubfolderName(folder.name, expectedProcessCode);
        if (!subfolderValidation.valid) {
          addSubfolderFinding(
            findings,
            rule,
            scope,
            scanData,
            folder,
            subfolderValidation.reason,
            expectedProcessCode
          );
        }
      });

      index.allFiles.forEach((file) => {
        if (!Types.isDescendantOf(file.relativePath, processFolder.relativePath)) return;

        const parentRel = Types.getParentRelativePath(file.relativePath);
        if (parentRel === processFolder.relativePath) {
          addFileFinding(
            findings,
            rule,
            scope,
            scanData,
            file,
            "Archivo fuera de subcarpeta",
            "El archivo está directamente dentro de la carpeta del proceso. Debe ir dentro de una subcarpeta de período o tema.",
            {
              actualValue: `[En carpeta del proceso] ${file.name}`,
              expectedValue: `[Dentro de subcarpeta] ${buildSubfolderExpected(expectedProcessCode)}/${file.name}`,
              exampleValue: `[Dentro de subcarpeta] ${buildSubfolderExample(expectedProcessCode)}/${buildDocumentFileExample(scope, processValidation.processNumber, detectExtension(file.name))}`,
              processNumber: processValidation.processNumber,
              extension: detectExtension(file.name)
            }
          );
        }

        const fileValidation = Types.parseDocumentFileName(file.name, expectedUnit);
        if (!fileValidation.valid) {
          addFileFinding(
            findings,
            rule,
            scope,
            scanData,
            file,
            "Archivo mal nombrado",
            fileValidation.reason,
            {
              actualValue: file.name,
              expectedValue: buildDocumentFileExpected(scope, processValidation.processNumber, detectExtension(file.name)),
              exampleValue: buildDocumentFileExample(scope, processValidation.processNumber, detectExtension(file.name)),
              processNumber: processValidation.processNumber,
              extension: detectExtension(file.name)
            }
          );
          return;
        }

        if (fileValidation.processNumber !== processValidation.processNumber) {
          addFileFinding(
            findings,
            rule,
            scope,
            scanData,
            file,
            "Código de proceso inconsistente",
            `El archivo identifica el proceso ${fileValidation.processNumber}, pero la carpeta del proceso corresponde a ${processValidation.processNumber}.`,
            {
              actualValue: file.name,
              expectedValue: buildCorrectedFileName(fileValidation, scope, processValidation.processNumber),
              exampleValue: buildCorrectedFileName(fileValidation, scope, processValidation.processNumber),
              processNumber: processValidation.processNumber,
              extension: fileValidation.extension
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
    description: "Valida que las carpetas identifiquen el proceso y que los archivos identifiquen el documento completo.",
    run(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);