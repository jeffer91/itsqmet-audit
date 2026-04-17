/*
Nombre completo: rule.empty-folders.js
Ruta o ubicación: /screens/rules/rulesets/rule.empty-folders.js
Función o funciones:
- Definir la regla de carpetas vacías
- Detectar carpetas que no tienen archivos ni subcarpetas
- Generar novedades por cada carpeta vacía encontrada
- Exponer una acción directa para abrir la carpeta vacía
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};

  function safeText(value) {
    if (Types && typeof Types.safeText === "function") {
      return Types.safeText(value);
    }
    return String(value == null ? "" : value).trim();
  }

  function normalizeScope(value) {
    if (Types && typeof Types.normalizeScope === "function") {
      return Types.normalizeScope(value);
    }
    return safeText(value).toUpperCase();
  }

  function normalizeSeverity(value) {
    if (Types && typeof Types.normalizeSeverity === "function") {
      return Types.normalizeSeverity(value);
    }
    return safeText(value).toLowerCase();
  }

  function normalizeRelativePath(value) {
    if (Types && typeof Types.normalizeRelativePath === "function") {
      return Types.normalizeRelativePath(value);
    }
    return safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function getParentRelativePath(value) {
    if (Types && typeof Types.getParentRelativePath === "function") {
      return Types.getParentRelativePath(value);
    }
    const clean = normalizeRelativePath(value);
    if (!clean) return "";
    const parts = clean.split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }

  function buildFindingId(finding) {
    if (Types && typeof Types.buildFindingId === "function") {
      return Types.buildFindingId(finding);
    }
    return [
      safeText(finding.ruleId),
      safeText(finding.scope),
      safeText(finding.relativePath),
      safeText(finding.title)
    ].join("|");
  }

  function createFinding(payload) {
    const finding = {
      ruleId: safeText(payload.ruleId),
      ruleName: safeText(payload.ruleName),
      scope: normalizeScope(payload.scope),
      severity: normalizeSeverity(payload.severity),
      title: safeText(payload.title),
      description: safeText(payload.description),
      rootName: safeText(payload.rootName),
      rootPath: safeText(payload.rootPath),
      relativePath: normalizeRelativePath(payload.relativePath),
      absolutePath: safeText(payload.absolutePath),
      actualValue: safeText(payload.actualValue),
      expectedValue: safeText(payload.expectedValue),
      exampleValue: safeText(payload.exampleValue),
      foundLabel: safeText(payload.foundLabel),
      missingLabel: safeText(payload.missingLabel),
      primaryActionLabel: safeText(payload.primaryActionLabel),
      primaryActionPath: safeText(payload.primaryActionPath),
      secondaryActionLabel: safeText(payload.secondaryActionLabel),
      secondaryActionPath: safeText(payload.secondaryActionPath),
      tertiaryActionLabel: safeText(payload.tertiaryActionLabel),
      tertiaryActionPath: safeText(payload.tertiaryActionPath)
    };

    finding.id = buildFindingId(finding);
    return finding;
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) {
      return [];
    }

    if (!Types || typeof Types.buildScanIndex !== "function") {
      return [];
    }

    const index = Types.buildScanIndex(scanData);
    const findings = [];
    const allFolders = Array.isArray(index.folders) ? index.folders : [];
    const allFiles = Array.isArray(index.files) ? index.files : [];

    allFolders.forEach(function eachFolder(folder) {
      const rel = normalizeRelativePath(folder && folder.relativePath);
      if (!rel) return;

      const childFolders = allFolders.filter(function keepFolder(item) {
        return getParentRelativePath(item && item.relativePath) === rel;
      });

      const childFiles = allFiles.filter(function keepFile(item) {
        return getParentRelativePath(item && item.relativePath) === rel;
      });

      if (childFolders.length > 0 || childFiles.length > 0) {
        return;
      }

      findings.push(
        createFinding({
          ruleId: rule.id,
          ruleName: rule.name,
          scope: scope,
          severity: rule.severity,
          title: "Carpeta vacía",
          description: "La carpeta no contiene archivos ni subcarpetas.",
          rootName: scanData.rootName || "",
          rootPath: scanData.rootPath || "",
          relativePath: rel,
          absolutePath: folder.path || scanData.rootPath || "",
          actualValue: "Carpeta detectada sin contenido.",
          expectedValue: "La carpeta debe contener al menos un archivo o una subcarpeta válida.",
          exampleValue: "Si la carpeta ya no se usa, conviene eliminarla o moverla al lugar correcto.",
          foundLabel: folder.name || rel,
          missingLabel: "Contenido de la carpeta",
          primaryActionLabel: "Abrir carpeta vacía",
          primaryActionPath: folder.path || scanData.rootPath || ""
        })
      );
    });

    return findings;
  }

  window.RuleEmptyFolders = {
    id: "empty-folders",
    name: "Carpetas vacías",
    scope: "BOTH",
    severity: "warning",
    description: "Detecta carpetas que no contienen archivos ni subcarpetas.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);