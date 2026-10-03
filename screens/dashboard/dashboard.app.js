(function (window, document) {
  "use strict";

  let rulesetsLoaded = false;

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function buildRuleScriptUrl(relativePath) {
    return "../rules/rulesets/" + safeText(relativePath).replace(/^\/+/, "");
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("No se pudo cargar: " + src));
      };
      document.head.appendChild(script);
    });
  }

  async function ensureRulesetsLoaded() {
    if (rulesetsLoaded) return;
    const response = await window.api.rules.listFiles();

    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error ? response.error : "No se pudieron cargar las reglas."
      );
    }

    for (const descriptor of Array.isArray(response.files) ? response.files : []) {
      const globalName = safeText(descriptor.globalName);
      if (globalName && Object.prototype.hasOwnProperty.call(window, globalName)) {
        continue;
      }

      for (const relativePath of Array.isArray(descriptor.scripts) ? descriptor.scripts : []) {
        await loadScript(buildRuleScriptUrl(relativePath));
      }
    }

    rulesetsLoaded = true;
  }

  function refresh(message, type) {
    const vm = window.DashboardService.buildViewModel();
    window.DashboardUI.render(vm);
    if (message) window.DashboardUI.setGlobalMessage(message, type || "success");
  }

  async function init() {
    if (window.AppNav) window.AppNav.render("dashboard");
    if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(true, "Cargando reglas del Dashboard…");
    await ensureRulesetsLoaded();

    window.DashboardUI.bindEvents({
      onRefresh: function () {
        refresh("Dashboard actualizado.", "success");
      },
      onFiltersChange: function (filters) {
        window.DashboardState.setFilters(filters);
      },
      onResetFilters: function () {
        window.DashboardState.reset();
      },
      onCategory: function (category) {
        window.DashboardState.setCategory(category);
      },
      onOpenPath: async function (path) {
        try {
          await window.DashboardService.openPath(path);
        } catch (error) {
          window.DashboardUI.setGlobalMessage(
            error && error.message ? error.message : "No se pudo abrir la carpeta.",
            "error"
          );
        }
      },
      onGoRules: function (ruleId, findingId) {
        window.DashboardService.goToRules(ruleId, findingId);
      }
    });

    window.DashboardState.subscribe(function () { refresh(); });
    window.AppStore.subscribe(function () { refresh(); });
    if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(true, "Analizando Dashboard…");
    await new Promise(function (resolve) { window.requestAnimationFrame(function () { window.requestAnimationFrame(resolve); }); });
    refresh();
    if (window.AppNav && window.AppNav.setLoading) window.AppNav.setLoading(false);
  }

  document.addEventListener("DOMContentLoaded", function () {
    init().catch(function (error) {
      if (window.DashboardUI) {
        window.DashboardUI.setGlobalMessage(
          error && error.message ? error.message : "No se pudo iniciar Dashboard.",
          "error"
        );
      }
    });
  });
})(window, document);
