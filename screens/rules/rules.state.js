/*
Nombre completo: rules.state.js
Ruta o ubicación: /screens/rules/rules.state.js
Función o funciones:
- Mantener el estado local de la pantalla Reglas
- Persistir filtros y búsqueda en localStorage
- Permitir enfocar una novedad específica
*/
(function (window) {
  "use strict";

  const STORAGE_KEY = "audit_rules_state_v3";
  const listeners = new Set();

  const state = {
    selectedRuleId: "all",
    selectedScope: "all",
    selectedStatus: "issues",
    searchText: "",
    focusFindingId: ""
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      state.selectedRuleId = safeText(parsed.selectedRuleId) || "all";
      state.selectedScope = safeText(parsed.selectedScope) || "all";
      state.selectedStatus = safeText(parsed.selectedStatus) || "issues";
      state.searchText = typeof parsed.searchText === "string" ? parsed.searchText : "";
      state.focusFindingId = safeText(parsed.focusFindingId);
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

    if (typeof next.selectedRuleId === "string") {
      state.selectedRuleId = safeText(next.selectedRuleId) || "all";
    }

    if (typeof next.selectedScope === "string") {
      state.selectedScope = safeText(next.selectedScope) || "all";
    }

    if (typeof next.selectedStatus === "string") {
      state.selectedStatus = safeText(next.selectedStatus) || "issues";
    }

    if (typeof next.searchText === "string") {
      state.searchText = next.searchText;
    }

    if (typeof next.focusFindingId === "string") {
      state.focusFindingId = safeText(next.focusFindingId);
    }

    writeStorage();
    notify();
  }

  function setSelectedRuleId(ruleId) {
    state.selectedRuleId = safeText(ruleId) || "all";
    writeStorage();
    notify();
  }

  function setFocusFindingId(findingId) {
    state.focusFindingId = safeText(findingId);
    writeStorage();
    notify();
  }

  function clearFocusFindingId() {
    if (!state.focusFindingId) return;
    state.focusFindingId = "";
    writeStorage();
    notify();
  }

  function reset() {
    state.selectedRuleId = "all";
    state.selectedScope = "all";
    state.selectedStatus = "issues";
    state.searchText = "";
    state.focusFindingId = "";
    writeStorage();
    notify();
  }

  readStorage();

  window.RulesState = {
    subscribe: subscribe,
    get: get,
    setFilters: setFilters,
    setSelectedRuleId: setSelectedRuleId,
    setFocusFindingId: setFocusFindingId,
    clearFocusFindingId: clearFocusFindingId,
    reset: reset
  };
})(window);