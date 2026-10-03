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
    if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(true, "Cargando reglas y prioridades…");
    await ensureRulesetsLoaded();
    window.PriorityUI.bindEvents({
      onRefresh: function () { refresh("Priorización actualizada.", "success"); },
      onExportPdf: async function () {
        try {
          if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(true, "Generando PDF de pendientes…");
          const result = await window.PriorityService.exportPdf(filters);
          window.PriorityUI.setGlobalMessage("PDF guardado en Descargas: " + result.fileName, "success");
        } catch (error) {
          window.PriorityUI.setGlobalMessage(error && error.message ? error.message : "No se pudo generar el PDF.", "error");
        } finally {
          if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(false);
        }
      },
      onFiltersChange: function (nextFilters) { filters = nextFilters; refresh(); },
      onOpenPath: async function (path) {
        try { await window.PriorityService.openPath(path); }
        catch (error) {
          window.PriorityUI.setGlobalMessage(error && error.message ? error.message : "No se pudo abrir la carpeta.", "error");
        }
      }
    });
    window.AppStore.subscribe(function () { refresh(); });
    if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(true, "Analizando pendientes…");
    await new Promise(function (resolve) { window.requestAnimationFrame(function () { window.requestAnimationFrame(resolve); }); });
    refresh();
    if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(false);
  }

  document.addEventListener("DOMContentLoaded", function () {
    init().catch(function (error) {
      if (window.PriorityUI) {
        window.PriorityUI.setGlobalMessage(error && error.message ? error.message : "No se pudo iniciar Priorización.", "error");
      }
    }).finally(function () {
      if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(false);
    });
  });
})(window, document);
