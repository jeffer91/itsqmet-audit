/*
Nombre completo: rules.catalog.js
Ruta o ubicación: /screens/rules/rules.catalog.js
Función o funciones:
- Detectar reglas disponibles cargadas en window
- Validar la forma mínima de cada regla
- Exponer consulta de todas las reglas y búsqueda por id
*/
(function (window) {
  "use strict";

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeScope(value) {
    const scope = safeText(value).toUpperCase();
    if (scope === "UGPA" || scope === "UTET" || scope === "BOTH") {
      return scope;
    }
    return "";
  }

  function isRuleObject(value) {
    if (!value || typeof value !== "object") return false;

    const scope = normalizeScope(value.scope);

    return (
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.description === "string" &&
      typeof value.run === "function" &&
      !!scope
    );
  }

  function normalizeRule(rule) {
    return {
      id: safeText(rule.id),
      name: safeText(rule.name),
      description: safeText(rule.description),
      detail: safeText(rule.detail || rule.description),
      scope: normalizeScope(rule.scope),
      severity: safeText(rule.severity || "warning").toLowerCase(),
      run: rule.run
    };
  }

  function getAll() {
    const rules = [];
    const seen = new Set();

    Object.keys(window).forEach(function eachKey(key) {
      if (!/^Rule[A-Z]/.test(safeText(key))) return;

      const candidate = window[key];
      if (!isRuleObject(candidate)) return;

      const normalized = normalizeRule(candidate);
      if (!normalized.id || seen.has(normalized.id)) return;

      seen.add(normalized.id);
      rules.push(normalized);
    });

    rules.sort(function sortByName(a, b) {
      const left = String(a.name || a.id || "");
      const right = String(b.name || b.id || "");
      return left.localeCompare(right, "es", { sensitivity: "base" });
    });

    return rules;
  }

  function getById(ruleId) {
    const safeId = safeText(ruleId);
    return getAll().find(function findRule(rule) {
      return rule.id === safeId;
    }) || null;
  }

  window.RulesCatalog = {
    getAll: getAll,
    getById: getById
  };
})(window);