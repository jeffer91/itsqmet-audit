(function (window) {
  "use strict";

  /*
  Nombre completo: dashboard.state.js
  Ruta o ubicación: /screens/dashboard/dashboard.state.js
  Función o funciones:
  - Mantener el estado local de la pantalla Dashboard
  - Persistir filtros, búsqueda y orden
  - Permitir expandir o colapsar reglas con muchas novedades
  */

  const STORAGE_KEY = "audit_dashboard_state_v2";
  const listeners = new Set();

  const state = {
    selectedScope: "all",
    selectedStatus: "issues",
    selectedRuleId: "all",
    searchText: "",
    sortBy: "findings_desc",
    expandedRuleIds: []
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeExpandedRuleIds(value) {
    if (!Array.isArray(value)) return [];
    return value.map(function mapItem(item) {
      return safeText(item);
    }).filter(Boolean);
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      state.selectedScope = safeText(parsed.selectedScope) || "all";
      state.selectedStatus = safeText(parsed.selectedStatus) || "issues";
      state.selectedRuleId = safeText(parsed.selectedRuleId) || "all";
      state.searchText = typeof parsed.searchText === "string" ? parsed.searchText : "";
      state.sortBy = safeText(parsed.sortBy) || "findings_desc";
      state.expandedRuleIds = normalizeExpandedRuleIds(parsed.expandedRuleIds);
    } catch (_error) {
      // Mantener simple
    }
  }

  function writeStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      // Mantener simple
    }
  }

  function notify() {
    const snapshot = clone(state);
    listeners.forEach(function each(listener) {
      try {
        listener(snapshot);
      } catch (_error) {
        // Ignorar listeners defectuosos
      }
    });
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new Error("El listener debe ser una función.");
    }

    listeners.add(listener);

    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function get() {
    return clone(state);
  }

  function setFilters(patch) {
    const next = patch && typeof patch === "object" ? patch : {};

    if (typeof next.selectedScope === "string") {
      state.selectedScope = safeText(next.selectedScope) || "all";
    }

    if (typeof next.selectedStatus === "string") {
      state.selectedStatus = safeText(next.selectedStatus) || "issues";
    }

    if (typeof next.selectedRuleId === "string") {
      state.selectedRuleId = safeText(next.selectedRuleId) || "all";
    }

    if (typeof next.searchText === "string") {
      state.searchText = next.searchText;
    }

    if (typeof next.sortBy === "string") {
      state.sortBy = safeText(next.sortBy) || "findings_desc";
    }

    writeStorage();
    notify();
  }

  function reset() {
    state.selectedScope = "all";
    state.selectedStatus = "issues";
    state.selectedRuleId = "all";
    state.searchText = "";
    state.sortBy = "findings_desc";
    state.expandedRuleIds = [];
    writeStorage();
    notify();
  }

  function toggleExpandedRule(ruleId) {
    const safeRuleId = safeText(ruleId);
    if (!safeRuleId) return;

    const exists = state.expandedRuleIds.includes(safeRuleId);
    state.expandedRuleIds = exists
      ? state.expandedRuleIds.filter(function keep(id) {
          return id !== safeRuleId;
        })
      : state.expandedRuleIds.concat(safeRuleId);

    writeStorage();
    notify();
  }

  readStorage();

  window.DashboardState = {
    subscribe,
    get,
    setFilters,
    reset,
    toggleExpandedRule
  };
})(window);