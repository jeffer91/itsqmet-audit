/*
Nombre completo: rules.app.js
Ruta o ubicación: /screens/rules/rules.app.js
Función o funciones:
- Inicializar la pantalla de reglas
- Aplicar enfoque recibido desde Dashboard
- Gestionar filtros, descarte, restauración y apertura de rutas
*/
(function (window, document) {
  "use strict";

  let currentViewModel = null;

  function findFindingById(id, source) {
    if (!currentViewModel) return null;

    const safeId = String(id || "").trim();
    const list =
      source === "discarded"
        ? Array.isArray(currentViewModel.discardedFindings)
          ? currentViewModel.discardedFindings
          : []
        : Array.isArray(currentViewModel.activeFindings)
        ? currentViewModel.activeFindings
        : [];

    return (
      list.find(function findItem(item) {
        return item && item.id === safeId;
      }) || null
    );
  }

  function refresh(message, type) {
    currentViewModel = window.RulesService.buildViewModel();
    window.RulesUI.render(currentViewModel);

    if (message) {
      window.RulesUI.setGlobalMessage(message, type || "success");
    }

    if (currentViewModel && currentViewModel.focusFindingId) {
      window.requestAnimationFrame(function onFrame() {
        window.RulesUI.scrollToFocusedFinding(currentViewModel.focusFindingId);
      });
    }
  }

  async function handleOpenPath(targetPath) {
    try {
      if (!String(targetPath || "").trim()) {
        throw new Error("No se recibió una ruta válida.");
      }

      await window.RulesService.openPath(targetPath);
      window.RulesUI.setGlobalMessage("Ruta abierta correctamente.", "success");
    } catch (error) {
      window.RulesUI.setGlobalMessage(
        error && error.message ? error.message : "No se pudo abrir la ruta.",
        "error"
      );
    }
  }

  function handleDiscard(id, source) {
    const finding = findFindingById(id, source);

    if (!finding) {
      window.RulesUI.setGlobalMessage("No se encontró la novedad seleccionada.", "error");
      return;
    }

    window.RulesService.discardFinding(finding);

    if (window.RulesState.get().focusFindingId === finding.id) {
      window.RulesState.clearFocusFindingId();
    }

    refresh("Novedad descartada correctamente.", "success");
  }

  function handleRestore(id) {
    window.RulesService.restoreFinding(id);
    refresh("Novedad restaurada correctamente.", "success");
  }

  function handleFiltersChange(filters) {
    window.RulesState.setFilters(filters);
  }

  function handleResetFilters() {
    window.RulesState.reset();
    window.RulesUI.setGlobalMessage("Filtros reiniciados.", "success");
  }

  function handleQuickRule(ruleId) {
    const safeRuleId = String(ruleId || "").trim() || "all";
    const currentRuleId = window.RulesState.get().selectedRuleId;

    window.RulesState.setSelectedRuleId(
      currentRuleId === safeRuleId ? "all" : safeRuleId
    );
  }

  function handleClearFocus() {
    window.RulesState.clearFocusFindingId();
    window.RulesUI.setGlobalMessage("Enfoque eliminado.", "success");
  }

  function applyExternalFocusFromSession() {
    try {
      const ruleId = String(sessionStorage.getItem("audit_rules_focus_rule_id") || "").trim();
      const findingId = String(
        sessionStorage.getItem("audit_rules_focus_finding_id") || ""
      ).trim();

      if (!ruleId && !findingId) return;

      const patch = {};

      if (ruleId) {
        patch.selectedRuleId = ruleId;
      }

      if (findingId) {
        patch.focusFindingId = findingId;
      }

      sessionStorage.removeItem("audit_rules_focus_rule_id");
      sessionStorage.removeItem("audit_rules_focus_finding_id");

      if (Object.keys(patch).length) {
        window.RulesState.setFilters(patch);
      }
    } catch (_error) {
      // Mantener simple
    }
  }

  async function init() {
    let bootstrapResult = null;

    if (window.AppNav) {
      window.AppNav.render("rules");
    }

    if (window.RulesBootstrap && window.RulesBootstrap.ready) {
      bootstrapResult = await window.RulesBootstrap.ready;
    }

    window.RulesUI.bindEvents({
      onRefresh: function onRefresh() {
        refresh("Reglas actualizadas.", "success");
      },
      onOpenPath: function onOpenPath(targetPath) {
        handleOpenPath(targetPath);
      },
      onDiscard: function onDiscard(id, source) {
        handleDiscard(id, source);
      },
      onRestore: function onRestore(id) {
        handleRestore(id);
      },
      onFiltersChange: function onFiltersChange(filters) {
        handleFiltersChange(filters);
      },
      onResetFilters: function onResetFilters() {
        handleResetFilters();
      },
      onQuickRule: function onQuickRule(ruleId) {
        handleQuickRule(ruleId);
      },
      onClearFocus: function onClearFocus() {
        handleClearFocus();
      }
    });

    window.RulesState.subscribe(function onRulesStateChange() {
      refresh();
    });

    window.AppStore.subscribe(function onAppStoreChange() {
      refresh();
    });

    applyExternalFocusFromSession();
    refresh();

    if (bootstrapResult && bootstrapResult.ok !== true && bootstrapResult.error) {
      window.RulesUI.setGlobalMessage(bootstrapResult.error, "error");
    }

    if (!window.api || !window.api.shell) {
      window.RulesUI.setGlobalMessage(
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
          : "No se pudo inicializar la pantalla Reglas.";

      if (window.RulesUI && typeof window.RulesUI.setGlobalMessage === "function") {
        window.RulesUI.setGlobalMessage(message, "error");
      } else {
        console.error(message);
      }
    });
  });
})(window, document);