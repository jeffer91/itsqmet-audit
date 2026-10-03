(function (window) {
  "use strict";

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
      ugpaSourcePath: "",
      utetSourcePath: "",
      ugpaValidation: null,
      utetValidation: null,
      auditUgpa: false,
      auditUtet: false,
      ugpaResult: null,
      utetResult: null,
      exportResult: {
        ok: false,
        filePath: "",
        fileName: "",
        error: ""
      },
      progress: {
        active: false,
        type: "",
        phase: "",
        folders: 0,
        files: 0,
        processed: 0,
        currentPath: "",
        unitIndex: 0,
        unitTotal: 0
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
    const safe = history && typeof history === "object" ? history : {};
    const ugpaResult = safe.ugpaResult || null;
    const utetResult = safe.utetResult || null;
    const nextUgpaPath = safeText(safe.ugpaSourcePath);
    const nextUtetPath = safeText(safe.utetSourcePath);
    const keepUgpaChoice =
      !!state.ugpaSourcePath &&
      state.ugpaSourcePath.toLowerCase() === nextUgpaPath.toLowerCase();
    const keepUtetChoice =
      !!state.utetSourcePath &&
      state.utetSourcePath.toLowerCase() === nextUtetPath.toLowerCase();

    return set({
      ugpaSourcePath: nextUgpaPath,
      utetSourcePath: nextUtetPath,
      auditUgpa: keepUgpaChoice ? state.auditUgpa : !!nextUgpaPath,
      auditUtet: keepUtetChoice ? state.auditUtet : !!nextUtetPath,
      ugpaValidation:
        ugpaResult && ugpaResult.validation ? ugpaResult.validation : null,
      utetValidation:
        utetResult && utetResult.validation ? utetResult.validation : null,
      ugpaResult: ugpaResult,
      utetResult: utetResult,
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
      return function noop() {};
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
