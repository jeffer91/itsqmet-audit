(function (window) {
  "use strict";
  /*
  Nombre completo: scan.state.js
  Ruta o ubicación: /screens/scan/scan.state.js
  Función o funciones:
  - Administrar el estado local de la pantalla Escaneo
  - Guardar resultados UGPA y UTET cargados desde historial o desde nuevos escaneos
  - Gestionar mensajes globales, estado de carga, exportación e historial visible
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
      } catch (_error) {
        // Mantener simple y estable
      }
    });
  }

  function get() {
    return clone(state);
  }

  function set(patch) {
    const safePatch = patch && typeof patch === "object" ? patch : {};
    state = {
      ...state,
      ...safePatch
    };
    emit();
    return get();
  }

  function patchMessage(type, text) {
    return set({
      message: createMessage(type, text)
    });
  }

  function setResult(type, result) {
    const safeType = safeText(type).toUpperCase();
    if (safeType === "UGPA") {
      return set({ ugpaResult: result || null });
    }
    if (safeType === "UTET") {
      return set({ utetResult: result || null });
    }
    return get();
  }

  function clearResult(type) {
    return setResult(type, null);
  }

  function hydrateFromHistory(history, historyFilePath) {
    const safeHistory = history && typeof history === "object" ? history : {};
    return set({
      ugpaResult: safeHistory.ugpaResult || null,
      utetResult: safeHistory.utetResult || null,
      historyFilePath: safeText(historyFilePath),
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
    setResult: setResult,
    clearResult: clearResult,
    hydrateFromHistory: hydrateFromHistory
  };
})(window);