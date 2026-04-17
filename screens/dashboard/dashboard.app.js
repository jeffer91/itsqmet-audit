(function (window, document) {
  "use strict";

  /*
  Nombre completo: dashboard.app.js
  Ruta o ubicación: /screens/dashboard/dashboard.app.js
  Función o funciones:
  - Inicializar la pantalla Dashboard
  - Cargar dinámicamente las reglas disponibles
  - Coordinar eventos de filtros, navegación y apertura de rutas
  - Refrescar la vista a partir del estado global y del estado local
  */

  let currentViewModel = null;
  let rulesetsLoaded = false;

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function hasRuleObject(globalName) {
    const safeName = safeText(globalName);
    return !!(safeName && Object.prototype.hasOwnProperty.call(window, safeName));
  }

  function normalizeRuleDescriptor(entry) {
    if (!entry || typeof entry !== "object") return null;

    const id = safeText(entry.id);
    if (!id) return null;

    return {
      id: id,
      type: safeText(entry.type) || "legacy",
      folderName: safeText(entry.folderName),
      globalName: safeText(entry.globalName),
      scripts: Array.isArray(entry.scripts)
        ? entry.scripts.map((item) => safeText(item)).filter(Boolean)
        : [],
      manifestFile: safeText(entry.manifestFile)
    };
  }

  function buildRuleScriptUrl(relativePath) {
    const safeRelativePath = safeText(relativePath).replace(/^\/+/, "");
    return `./rules/rulesets/${safeRelativePath}`;
  }

  function loadScript(src) {
    return new Promise(function executor(resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = function onLoad() {
        resolve();
      };
      script.onerror = function onError() {
        reject(new Error("No se pudo cargar el script de regla: " + src));
      };
      document.head.appendChild(script);
    });
  }

  async function loadRuleDescriptor(descriptor) {
    const loadedScripts = [];

    if (descriptor.globalName && hasRuleObject(descriptor.globalName)) {
      return loadedScripts;
    }

    for (const relativePath of descriptor.scripts) {
      const src = buildRuleScriptUrl(relativePath);
      await loadScript(src);
      loadedScripts.push(relativePath);
    }

    return loadedScripts;
  }

  async function ensureRulesetsLoaded() {
    if (rulesetsLoaded) {
      return { ok: true, loaded: [] };
    }

    if (!window.api || !window.api.rules || typeof window.api.rules.listFiles !== "function") {
      throw new Error("La API de reglas no está disponible. Abre esta pantalla desde Electron.");
    }

    const response = await window.api.rules.listFiles();
    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error
          ? response.error
          : "No se pudo obtener el listado de reglas."
      );
    }

    const rawFiles = Array.isArray(response.files) ? response.files : [];
    const descriptors = rawFiles.map(normalizeRuleDescriptor).filter(Boolean);
    const loaded = [];

    for (const descriptor of descriptors) {
      const scripts = await loadRuleDescriptor(descriptor);
      if (scripts.length) {
        loaded.push(descriptor.id);
      }
    }

    rulesetsLoaded = true;

    return {
      ok: true,
      loaded: loaded
    };
  }

  function refresh(message, type) {
    currentViewModel = window.DashboardService.buildViewModel();
    window.DashboardUI.render(currentViewModel);

    if (message) {
      window.DashboardUI.setGlobalMessage(message, type || "success");
    }
  }

  async function handleOpenPath(targetPath) {
    try {
      if (!targetPath) {
        throw new Error("No se recibió una ruta válida.");
      }

      await window.DashboardService.openPath(targetPath);
      window.DashboardUI.setGlobalMessage("Ruta abierta correctamente.", "success");
    } catch (error) {
      window.DashboardUI.setGlobalMessage(
        error && error.message ? error.message : "No se pudo abrir la ruta.",
        "error"
      );
    }
  }

  function handleGoRules(ruleId, findingId) {
    window.DashboardService.goToRules(ruleId, findingId);
  }

  function handleFiltersChange(filters) {
    window.DashboardState.setFilters(filters);
  }

  function handleResetFilters() {
    window.DashboardState.reset();
    window.DashboardUI.setGlobalMessage("Filtros reiniciados.", "success");
  }

  function handleToggleExpand(ruleId) {
    window.DashboardState.toggleExpandedRule(ruleId);
  }

  async function init() {
    if (window.AppNav) {
      window.AppNav.render("dashboard");
    }

    await ensureRulesetsLoaded();

    window.DashboardUI.bindEvents({
      onRefresh: function onRefresh() {
        refresh("Dashboard actualizado.", "success");
      },
      onFiltersChange: function onFiltersChange(filters) {
        handleFiltersChange(filters);
      },
      onResetFilters: function onResetFilters() {
        handleResetFilters();
      },
      onOpenPath: function onOpenPath(targetPath) {
        handleOpenPath(targetPath);
      },
      onGoRules: function onGoRules(ruleId, findingId) {
        handleGoRules(ruleId, findingId);
      },
      onToggleExpand: function onToggleExpand(ruleId) {
        handleToggleExpand(ruleId);
      }
    });

    window.DashboardState.subscribe(function onDashboardStateChange() {
      refresh();
    });

    window.AppStore.subscribe(function onSharedStateChange() {
      refresh();
    });

    refresh();

    if (!window.api || !window.api.shell) {
      window.DashboardUI.setGlobalMessage(
        "La API para abrir rutas no está disponible. Abre esta pantalla desde Electron.",
        "error"
      );
    }
  }

  document.addEventListener("DOMContentLoaded", function onReady() {
    init().catch(function onError(error) {
      const message =
        error && error.message
          ? error.message
          : "No se pudo inicializar la pantalla Dashboard.";

      if (
        window.DashboardUI &&
        typeof window.DashboardUI.setGlobalMessage === "function"
      ) {
        window.DashboardUI.setGlobalMessage(message, "error");
      } else {
        console.error(message);
      }
    });
  });
})(window, document);