/*
Nombre completo: rule.folders-without-pdf.js
Ruta: /screens/rules/rulesets/rule.folders-without-pdf.js
Función:
- Detectar únicamente subcarpetas finales con contenido documental pero sin ningún PDF.
- Evitar alertar carpetas padre por la ausencia de PDF directo.
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};
  const TECHNICAL = new Set(["desktop.ini", "thumbs.db"]);

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function parentOf(relativePath) {
    if (Types.getParentRelativePath) return Types.getParentRelativePath(relativePath);
    const clean = safeText(relativePath).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const parts = clean.split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }

  function normalizeRel(value) {
    return Types.normalizeRelativePath
      ? Types.normalizeRelativePath(value)
      : safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function isTechnical(file) {
    return TECHNICAL.has(safeText(file && file.name).toLowerCase());
  }

  function createFinding(rule, scope, scanData, folder) {
    const finding = {
      ruleId: rule.id,
      ruleName: rule.name,
      category: "folders-without-pdf",
      scope: scope,
      severity: rule.severity,
      title: "Subcarpeta sin PDF",
      description: "La subcarpeta final contiene archivos, pero ninguno está en formato PDF.",
      rootName: scanData.rootName || "",
      rootPath: scanData.rootPath || "",
      relativePath: normalizeRel(folder.relativePath),
      absolutePath: folder.path || scanData.rootPath || "",
      actualLabel: "Subcarpeta",
      actualValue: folder.name || folder.relativePath,
      expectedLabel: "Esperado",
      expectedValue: "Al menos un archivo PDF",
      primaryActionLabel: "Abrir carpeta",
      primaryActionPath: folder.path || scanData.rootPath || ""
    };
    finding.id = Types.buildFindingId ? Types.buildFindingId(finding) : [
      rule.id, scope, finding.relativePath
    ].join("|");
    return finding;
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];

    const folders = Array.isArray(scanData.folders) ? scanData.folders : [];
    const files = Array.isArray(scanData.files) ? scanData.files : [];
    const findings = [];

    folders.forEach(function eachFolder(folder) {
      const rel = normalizeRel(folder && folder.relativePath);
      if (!rel) return;

      const hasChildFolder = folders.some(function hasChild(item) {
        return parentOf(item && item.relativePath) === rel;
      });

      if (hasChildFolder) return;

      const directFiles = files.filter(function keep(file) {
        return parentOf(file && file.relativePath) === rel && !isTechnical(file);
      });

      if (!directFiles.length) return;

      const hasPdf = directFiles.some(function hasPdfFile(file) {
        return safeText(file && file.extension).toLowerCase() === ".pdf";
      });

      if (!hasPdf) {
        findings.push(createFinding(rule, scope, scanData, folder));
      }
    });

    return findings;
  }

  window.RuleFoldersWithoutPdf = {
    id: "folders-without-pdf",
    name: "Subcarpetas sin PDF",
    scope: "BOTH",
    severity: "warning",
    description: "Detecta solo subcarpetas finales con archivos pero sin PDF.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
