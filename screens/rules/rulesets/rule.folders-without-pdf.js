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
  const Policy = window.RulesFilePolicy;
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
      title: folder.editableOnly ? "Subcarpeta con editables, sin PDF final" : "Subcarpeta sin PDF",
      description: folder.editableOnly
        ? "Solo hay archivos de trabajo Word/Excel; todavía no se encontró evidencia final en PDF."
        : "La subcarpeta final contiene archivos, pero ninguno está en formato PDF.",
      rootName: scanData.rootName || "",
      rootPath: scanData.rootPath || "",
      relativePath: normalizeRel(folder.relativePath),
      absolutePath: folder.path || scanData.rootPath || "",
      actualLabel: "Subcarpeta",
      actualValue: folder.name || folder.relativePath,
      expectedLabel: "Esperado",
      expectedValue: "El PDF final correspondiente a la documentación de la carpeta",
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
    const parentsWithFolders=new Set();
    const filesByParent=new Map();
    for(const folder of folders){
      parentsWithFolders.add(parentOf(folder&&folder.relativePath));
    }
    for(const file of files){
      if(!file||isTechnical(file.name)||Policy.isIgnored(file))continue;
      const parent=parentOf(file.relativePath);
      if(!filesByParent.has(parent))filesByParent.set(parent,{count:0,hasPdf:false,allEditable:true});
      const entry=filesByParent.get(parent);
      entry.count++;
      if(safeText(file.extension).toLowerCase()===".pdf")entry.hasPdf=true;
      if(!Policy.isEditable(file))entry.allEditable=false;
    }

    folders.forEach(function eachFolder(folder) {
      const rel = normalizeRel(folder && folder.relativePath);
      if (!rel) return;

      if (parentsWithFolders.has(rel)) return;
      const entry=filesByParent.get(rel);
      if (!entry || !entry.count || entry.hasPdf) return;
      findings.push(createFinding(rule, scope, scanData, {
        ...folder,
        editableOnly:entry.allEditable
      }));
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
