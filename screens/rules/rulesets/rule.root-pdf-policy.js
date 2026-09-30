/*
Nombre completo: rule.root-pdf-policy.js
Ruta: /screens/rules/rulesets/rule.root-pdf-policy.js
Función:
- Permitir en la raíz únicamente el Manual de Procesos reconocido de cada unidad.
- Alertar otros PDF sueltos en la raíz.
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};
  const Manual = window.AuditManualCatalog || {};

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];

    return (Array.isArray(scanData.files) ? scanData.files : [])
      .filter(function keep(file) {
        const directoryPath = Types.normalizeRelativePath
          ? Types.normalizeRelativePath(file && file.directoryPath)
          : safeText(file && file.directoryPath);
        if (directoryPath) return false;
        if (safeText(file && file.extension).toLowerCase() !== ".pdf") return false;
        if (
          Manual &&
          typeof Manual.isRecognizedRootManual === "function" &&
          Manual.isRecognizedRootManual(scope, file && file.name)
        ) {
          return false;
        }
        return true;
      })
      .map(function mapFile(file) {
        const finding = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: "root-files",
          scope: scope,
          severity: rule.severity,
          title: "PDF no reconocido en la raíz",
          description: "En la raíz de la unidad solo se reconoce como excepción el Manual de Procesos correspondiente.",
          rootName: scanData.rootName || "",
          rootPath: scanData.rootPath || "",
          relativePath: file.relativePath || file.name || "",
          absolutePath: file.path || "",
          actualLabel: "Archivo",
          actualValue: file.name || "",
          expectedLabel: "Ubicación",
          expectedValue: "Mover al proceso/subcarpeta correspondiente o validar su excepción.",
          foundFileName: file.name || "",
          primaryActionLabel: "Abrir carpeta",
          primaryActionPath: scanData.rootPath || ""
        };
        finding.id = Types.buildFindingId
          ? Types.buildFindingId(finding)
          : [rule.id, scope, finding.relativePath].join("|");
        return finding;
      });
  }

  window.RuleRootPdfPolicy = {
    id: "root-pdf-policy",
    name: "PDF en raíz",
    scope: "BOTH",
    severity: "warning",
    description: "Controla los PDF sueltos en la raíz y permite el Manual de Procesos reconocido.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
