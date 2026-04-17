(function (window) {
  "use strict";
  /*
  Nombre completo: app.store.js
  Ruta o ubicación: /screens/shared/app.store.js
  Función o funciones:
  - Mantener el estado global compartido entre Escaneo, Dashboard y Reglas
  - Guardar resultados UGPA y UTET
  - Guardar novedades descartadas
  - Hidratar el estado desde el historial JSON y mantener caché en localStorage
  */

  const STORAGE_KEY = "audit_app_store_v5";
  const listeners = new Set();

  const state = {
    ugpaResult: null,
    utetResult: null,
    discardedFindings: []
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

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

  function normalizeFindingEntry(entry) {
    if (!entry || typeof entry !== "object") return null;

    const id = safeText(entry.id);
    if (!id) return null;

    return {
      id: id,
      ruleId: safeText(entry.ruleId),
      scope: normalizeScope(entry.scope),
      rootName: safeText(entry.rootName),
      rootPath: safeText(entry.rootPath),
      relativePath: safeText(entry.relativePath),
      absolutePath: safeText(entry.absolutePath),
      discardedAt: entry.discardedAt || new Date().toISOString()
    };
  }

  function normalizeFindings(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map(normalizeFindingEntry)
      .filter(function keep(entry) {
        return !!entry;
      });
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      // Mantener simple
    }
  }

  function emit() {
    const snapshot = clone(state);
    listeners.forEach(function notify(listener) {
      try {
        listener(snapshot);
      } catch (_error) {
        // Mantener simple
      }
    });
  }

  function applyState(nextState) {
    state.ugpaResult =
      nextState && nextState.ugpaResult && typeof nextState.ugpaResult === "object"
        ? clone(nextState.ugpaResult)
        : null;

    state.utetResult =
      nextState && nextState.utetResult && typeof nextState.utetResult === "object"
        ? clone(nextState.utetResult)
        : null;

    state.discardedFindings = normalizeFindings(
      nextState && nextState.discardedFindings
    );

    persist();
    emit();
    return get();
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      applyState(parsed);
    } catch (_error) {
      // Mantener simple
    }
  }

  function get() {
    return clone(state);
  }

  function set(nextState) {
    const safeNextState =
      nextState && typeof nextState === "object" ? nextState : {};
    return applyState({
      ugpaResult: safeNextState.ugpaResult,
      utetResult: safeNextState.utetResult,
      discardedFindings: safeNextState.discardedFindings
    });
  }

  function update(patch) {
    const safePatch = patch && typeof patch === "object" ? patch : {};
    return applyState({
      ugpaResult:
        Object.prototype.hasOwnProperty.call(safePatch, "ugpaResult")
          ? safePatch.ugpaResult
          : state.ugpaResult,
      utetResult:
        Object.prototype.hasOwnProperty.call(safePatch, "utetResult")
          ? safePatch.utetResult
          : state.utetResult,
      discardedFindings:
        Object.prototype.hasOwnProperty.call(safePatch, "discardedFindings")
          ? safePatch.discardedFindings
          : state.discardedFindings
    });
  }

  function setHistory(history) {
    const safeHistory = history && typeof history === "object" ? history : {};
    return applyState({
      ugpaResult: safeHistory.ugpaResult || null,
      utetResult: safeHistory.utetResult || null,
      discardedFindings: safeHistory.discardedFindings || []
    });
  }

  function clear() {
    return applyState({
      ugpaResult: null,
      utetResult: null,
      discardedFindings: []
    });
  }

  function addDiscardedFinding(entry) {
    const normalized = normalizeFindingEntry(entry);
    if (!normalized) {
      return get();
    }

    const current = state.discardedFindings.slice();
    const exists = current.some(function keep(item) {
      return item.id === normalized.id;
    });

    if (!exists) {
      current.push(normalized);
    }

    return update({
      discardedFindings: current
    });
  }

  function removeDiscardedFinding(id) {
    const safeId = safeText(id);
    return update({
      discardedFindings: state.discardedFindings.filter(function keep(entry) {
        return entry.id !== safeId;
      })
    });
  }

  function isDiscarded(id) {
    const safeId = safeText(id);
    return state.discardedFindings.some(function keep(entry) {
      return entry.id === safeId;
    });
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return function unsubscribeNoop() {};
    }

    listeners.add(listener);

    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  readStorage();

  window.AppStore = {
    get: get,
    set: set,
    update: update,
    clear: clear,
    subscribe: subscribe,
    setHistory: setHistory,
    addDiscardedFinding: addDiscardedFinding,
    removeDiscardedFinding: removeDiscardedFinding,
    isDiscarded: isDiscarded,
    normalizeScope: normalizeScope,
    normalizeFindingEntry: normalizeFindingEntry
  };
})(window);