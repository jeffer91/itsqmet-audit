(function (window, document) {
  "use strict";

  let rulesetsLoaded = false;
  let filters = { scope: "all", area: "all", level: "all", search: "" };

  function safeText(value) { return String(value == null ? "" : value).trim(); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("No se pudo cargar: " + src)); };
      document.head.appendChild(script);
    });
  }

  async function ensureRulesetsLoaded() {
    if (rulesetsLoaded) return;
    const response = await window.api.rules.listFiles();
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "No se pudieron cargar las reglas.");
    }
    for (const descriptor of Array.isArray(response.files) ? response.files : []) {
      const globalName = safeText(descriptor.globalName);
      if (globalName && Object.prototype.hasOwnProperty.call(window, globalName)) continue;
      for (const relativePath of Array.isArray(descriptor.scripts) ? descriptor.scripts : []) {
        await loadScript("../rules/rulesets/" + safeText(relativePath).replace(/^\/+/, ""));
      }
    }
    rulesetsLoaded = true;
  }

  function refresh(message, type) {
    const vm = window.PriorityService.buildViewModel(filters);
    window.PriorityUI.render(vm);
    if (message) window.PriorityUI.setGlobalMessage(message, type || "success");
  }

  async function init() {
    if (window.AppNav) window.AppNav.render("priority");
    await ensureRulesetsLoaded();
    window.PriorityUI.bindEvents({
      onRefresh: function () { refresh("Priorización actualizada.", "success"); },
      onFiltersChange: function (nextFilters) { filters = nextFilters; refresh(); },
      onOpenPath: async function (path) {
        try { await window.PriorityService.openPath(path); }
        catch (error) {
          window.PriorityUI.setGlobalMessage(error && error.message ? error.message : "No se pudo abrir la carpeta.", "error");
        }
      }
    });
    window.AppStore.subscribe(function () { refresh(); });
    refresh();
  }

  document.addEventListener("DOMContentLoaded", function () {
    init().catch(function (error) {
      if (window.PriorityUI) {
        window.PriorityUI.setGlobalMessage(error && error.message ? error.message : "No se pudo iniciar Priorización.", "error");
      }
    });
  });
})(window, document);
