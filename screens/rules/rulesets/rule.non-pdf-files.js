/*
Nombre completo: rule.non-pdf-files.js
Ruta: /screens/rules/rulesets/rule.non-pdf-files.js
Función:
- Detectar cualquier archivo documental que no sea PDF.
- Ignorar exclusivamente archivos técnicos del sistema.
- Abrir siempre la carpeta que contiene el archivo.
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};
  const TECHNICAL = new Set(["desktop.ini", "thumbs.db"]);

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function getParentAbsolutePath(absolutePath) {
    return safeText(absolutePath).replace(/[\\/][^\\/]+$/, "");
  }

  function isTechnical(fileName) {
    return TECHNICAL.has(safeText(fileName).toLowerCase());
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];

    return (Array.isArray(scanData.files) ? scanData.files : [])
      .filter(function keep(file) {
        if (!file || isTechnical(file.name)) return false;
        return safeText(file.extension).toLowerCase() !== ".pdf";
      })
      .map(function mapFile(file) {
        const finding = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: "non-pdf",
          scope: scope,
          severity: rule.severity,
          title: "Archivo no PDF",
          description: "Todo archivo documental de la auditoría debe estar en formato PDF.",
          rootName: scanData.rootName || "",
          rootPath: scanData.rootPath || "",
          relativePath: Types.normalizeRelativePath
            ? Types.normalizeRelativePath(file.relativePath)
            : safeText(file.relativePath),
          absolutePath: file.path || "",
          actualLabel: "Archivo",
          actualValue: file.name || "",
          expectedLabel: "Formato permitido",
          expectedValue: "PDF",
          foundFileName: file.name || "",
          primaryActionLabel: "Abrir carpeta",
          primaryActionPath: getParentAbsolutePath(file.path || "") || scanData.rootPath || ""
        };

        finding.id = Types.buildFindingId
          ? Types.buildFindingId(finding)
          : [rule.id, scope, finding.relativePath].join("|");

        return finding;
      });
  }

  window.RuleNonPdfFiles = {
    id: "non-pdf-files",
    name: "Archivos no PDF",
    scope: "BOTH",
    severity: "warning",
    description: "Detecta DOCX, XLSX, imágenes, ZIP y cualquier otro archivo documental distinto de PDF.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
