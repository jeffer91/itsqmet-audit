(function (window) {
  "use strict";
  /*
  Nombre completo: scan.state.js
  Ruta o ubicación: /screens/scan/scan.state.js
  Función o funciones:
  - Administrar el estado de la auditoría institucional
  - Mantener la raíz institucional y los resultados UGPA/UTET
  - Gestionar mensajes, carga, historial y exportación
  */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function createMessage(type, text) {
    return {
      type: safeText(type) || "neutral",
      text: safeText(text)
    };
  }

  function createDefaultState() {
    return {
      loading: false,
      exportMode: "both",
      historyFilePath: "",
      institutionalRootPath: "",
      detection: null,
      ugpaResult: null,
      utetResult: null,
      exportResult: {
        ok: false,
        filePath: "",
        fileName: "",
        error: ""
      },
      message: createMessage("neutral", "")
    };
  }

  let state = createDefaultState();
  const listeners = new Set();

  function emit() {
    const snapshot = clone(state);
    listeners.forEach(function notify(listener) {
      try {
        listener(snapshot);
      } catch (_error) {}
    });
  }

  function get() {
    return clone(state);
  }

  function set(patch) {
    state = {
      ...state,
      ...(patch && typeof patch === "object" ? patch : {})
    };
    emit();
    return get();
  }

  function patchMessage(type, text) {
    return set({ message: createMessage(type, text) });
  }

  function hydrateFromHistory(history, historyFilePath) {
    const safeHistory = history && typeof history === "object" ? history : {};

    return set({
      institutionalRootPath: safeText(safeHistory.institutionalRootPath),
      ugpaResult: safeHistory.ugpaResult || null,
      utetResult: safeHistory.utetResult || null,
      historyFilePath: safeText(historyFilePath),
      detection: null,
      exportResult: {
        ok: false,
        filePath: "",
        fileName: "",
        error: ""
      }
    });
  }

  function reset() {
    state = createDefaultState();
    emit();
    return get();
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

  window.ScanState = {
    get: get,
    set: set,
    reset: reset,
    subscribe: subscribe,
    patchMessage: patchMessage,
    hydrateFromHistory: hydrateFromHistory
  };
})(window);
