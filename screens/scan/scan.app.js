(function (window, document) {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  function setBusyState(isBusy) {
    const disabled = !!isBusy;

    [
      "btnSelectInstitutionRoot",
      "btnAuditInstitution",
      "btnOpenHistory",
      "btnExportPdf",
      "btnOpenDashboard",
      "btnOpenRules"
    ].forEach(function each(id) {
      const element = getElement(id);
      if (element) element.disabled = disabled;
    });

    const exportMode = getElement("exportMode");
    if (exportMode) exportMode.disabled = disabled;

    document.body.dataset.loading = disabled ? "true" : "false";
  }

  function render() {
    const viewModel = window.ScanService.getViewModel();
    window.ScanUi.renderViewModel(viewModel);
    setBusyState(viewModel.loading);

    const auditButton = getElement("btnAuditInstitution");
    if (auditButton && !viewModel.loading) {
      auditButton.disabled = !viewModel.rootSelected;
    }
  }

  function safeRun(task) {
    return async function wrappedHandler() {
      try {
        await task();
      } catch (error) {
        window.ScanState.patchMessage(
          "error",
          error && error.message ? error.message : "Se produjo un error inesperado."
        );
      }
    };
  }

  function bindEvents() {
    const selectRoot = getElement("btnSelectInstitutionRoot");
    const audit = getElement("btnAuditInstitution");
    const history = getElement("btnOpenHistory");
    const exportPdf = getElement("btnExportPdf");
    const dashboard = getElement("btnOpenDashboard");
    const rules = getElement("btnOpenRules");
    const exportMode = getElement("exportMode");

    if (selectRoot) {
      selectRoot.addEventListener(
        "click",
        safeRun(function onSelectRoot() {
          return window.ScanService.selectInstitutionRoot();
        })
      );
    }

    if (audit) {
      audit.addEventListener(
        "click",
        safeRun(function onAudit() {
          return window.ScanService.auditInstitution();
        })
      );
    }

    if (history) {
      history.addEventListener(
        "click",
        safeRun(function onHistory() {
          return window.ScanService.openHistoryFile();
        })
      );
    }

    if (exportPdf) {
      exportPdf.addEventListener(
        "click",
        safeRun(function onExport() {
          return window.ScanService.exportPdf();
        })
      );
    }

    if (dashboard) {
      dashboard.addEventListener("click", function onDashboard() {
        window.ScanService.goToDashboard();
      });
    }

    if (rules) {
      rules.addEventListener("click", function onRules() {
        window.ScanService.goToRules();
      });
    }

    if (exportMode) {
      exportMode.addEventListener("change", function onExportMode(event) {
        window.ScanService.setExportMode(event.target.value);
      });
    }
  }

  function subscribeToStores() {
    window.ScanState.subscribe(render);

    if (window.AppStore && typeof window.AppStore.subscribe === "function") {
      window.AppStore.subscribe(render);
    }
  }

  async function boot() {
    render();
    bindEvents();
    subscribeToStores();
    await window.ScanService.initializeFromHistory();
  }

  document.addEventListener("DOMContentLoaded", function onReady() {
    boot().catch(function onBootError(error) {
      window.ScanState.patchMessage(
        "error",
        error && error.message
          ? error.message
          : "No se pudo inicializar la pantalla de auditoría."
      );
      render();
    });
  });
})(window, document);
