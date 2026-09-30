/*
Nombre completo: rule.naming-structure.js
Ruta: /screens/rules/rulesets/rule.naming-structure.js
Función:
- Validar coherencia entre el código de proceso escrito en un PDF y la carpeta de proceso donde está ubicado.
- Evitar exigir una plantilla única a documentos cuyo nombre libre está permitido por el manual.
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeRelativePath(value) {
    return Types.normalizeRelativePath
      ? Types.normalizeRelativePath(value)
      : safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function getParentAbsolutePath(absolutePath) {
    return safeText(absolutePath).replace(/[\\/][^\\/]+$/, "");
  }

  function extractProcessNumber(fileName) {
    const match = safeText(fileName).match(/PRO-(\d{2,4})/i);
    return match ? safeText(match[1]) : "";
  }

  function extractUnit(fileName) {
    const match = safeText(fileName).match(/^(UGPA|UTET)(?:-|_)/i);
    return match ? safeText(match[1]).toUpperCase() : "";
  }

  function createFinding(rule, scope, scanData, file, title, description, expectedValue) {
    const finding = {
      ruleId: rule.id,
      ruleName: rule.name,
      category: "names",
      scope: scope,
      severity: rule.severity,
      title: title,
      description: description,
      rootName: scanData.rootName || "",
      rootPath: scanData.rootPath || "",
      relativePath: normalizeRelativePath(file.relativePath),
      absolutePath: file.path || "",
      actualLabel: "Actual",
      actualValue: file.name || "",
      expectedLabel: "Debe corresponder a",
      expectedValue: expectedValue,
      foundFileName: file.name || "",
      primaryActionLabel: "Abrir carpeta",
      primaryActionPath: getParentAbsolutePath(file.path || "") || scanData.rootPath || ""
    };

    finding.id = Types.buildFindingId
      ? Types.buildFindingId(finding)
      : [rule.id, scope, finding.relativePath, title].join("|");

    return finding;
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];
    if (!Types || typeof Types.buildScanIndex !== "function") return [];

    const index = Types.buildScanIndex(scanData);
    const processFolders =
      typeof Types.findProcessFolders === "function"
        ? Types.findProcessFolders(index, scope)
        : [];
    const findings = [];

    processFolders.forEach(function eachProcess(processFolder) {
      const parsed =
        processFolder.processValidation ||
        (Types.parseProcessFolderName
          ? Types.parseProcessFolderName(processFolder.name, scope)
          : null);

      if (!parsed || !parsed.valid) return;

      index.files.forEach(function eachFile(file) {
        if (safeText(file && file.extension).toLowerCase() !== ".pdf") return;
        if (
          !Types.isDescendantOf(
            file && file.relativePath,
            processFolder && processFolder.relativePath
          )
        ) {
          return;
        }

        const fileProcess = extractProcessNumber(file && file.name);
        const fileUnit = extractUnit(file && file.name);

        if (fileUnit && fileUnit !== scope) {
          findings.push(
            createFinding(
              rule,
              scope,
              scanData,
              file,
              "Unidad documental inconsistente",
              "El PDF identifica " + fileUnit + " pero está dentro de " + scope + ".",
              scope
            )
          );
        }

        if (fileProcess && fileProcess !== parsed.processNumber) {
          findings.push(
            createFinding(
              rule,
              scope,
              scanData,
              file,
              "Código de proceso inconsistente",
              "El PDF identifica PRO-" +
                fileProcess +
                " pero está dentro de " +
                scope +
                "-PRO-" +
                parsed.processNumber +
                ".",
              scope + "-PRO-" + parsed.processNumber
            )
          );
        }
      });
    });

    return findings;
  }

  window.RuleNamingStructure = {
    id: "naming-structure",
    name: "Coherencia de códigos",
    scope: "BOTH",
    severity: "warning",
    description:
      "Comprueba únicamente códigos explícitos de unidad/proceso; los documentos de nombre libre se validan contra el manual.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
