(function (window) {
  "use strict";

  const STORAGE_KEY = "audit_dashboard_state_v3";
  const listeners = new Set();

  const state = {
    selectedScope: "all",
    selectedRuleId: "all",
    selectedCategory: "all",
    searchText: "",
    sortBy: "category"
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function readStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.selectedScope = safeText(parsed.selectedScope) || "all";
      state.selectedRuleId = safeText(parsed.selectedRuleId) || "all";
      state.selectedCategory = safeText(parsed.selectedCategory) || "all";
      state.searchText = typeof parsed.searchText === "string" ? parsed.searchText : "";
      state.sortBy = safeText(parsed.sortBy) || "category";
    } catch (_error) {}
  }

  function writeStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {}
  }

  function notify() {
    const snapshot = clone(state);
    listeners.forEach(function each(listener) {
      try { listener(snapshot); } catch (_error) {}
    });
  }

  function get() {
    return clone(state);
  }

  function setFilters(patch) {
    const next = patch && typeof patch === "object" ? patch : {};

    ["selectedScope", "selectedRuleId", "sortBy"].forEach(function each(key) {
      if (typeof next[key] === "string") state[key] = safeText(next[key]) || state[key];
    });

    if (typeof next.searchText === "string") {
      state.searchText = next.searchText;
    }

    writeStorage();
    notify();
  }

  function setCategory(category) {
    const next = safeText(category) || "all";
    state.selectedCategory = state.selectedCategory === next ? "all" : next;
    writeStorage();
    notify();
  }

  function reset() {
    state.selectedScope = "all";
    state.selectedRuleId = "all";
    state.selectedCategory = "all";
    state.searchText = "";
    state.sortBy = "category";
    writeStorage();
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  readStorage();

  window.DashboardState = {
    get: get,
    setFilters: setFilters,
    setCategory: setCategory,
    reset: reset,
    subscribe: subscribe
  };
})(window);
