(function (window, document) {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function safeRun(task) {
    return async function wrapped() {
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

  function setBusy(isBusy) {
    [
      "btnSelectUgpa",
      "btnSelectUtet",
      "btnAuditSelected",
      "btnOpenHistory",
      "btnExportPdf",
      "btnOpenDashboard",
      "btnOpenRules"
    ].forEach(function each(id) {
      const el = byId(id);
      if (el) el.disabled = !!isBusy;
    });

    const exportMode = byId("exportMode");
    if (exportMode) exportMode.disabled = !!isBusy;
    const includeUgpa = byId("includeUgpa");
    const includeUtet = byId("includeUtet");
    if (includeUgpa) includeUgpa.disabled = !!isBusy;
    if (includeUtet) includeUtet.disabled = !!isBusy;
  }

  function render() {
    const vm = window.ScanService.getViewModel();
    window.ScanUi.renderViewModel(vm);
    setBusy(vm.loading);

    const audit = byId("btnAuditSelected");
    if (audit && !vm.loading) {
      audit.disabled = !vm.canAudit;
    }
  }

  function bind() {
    byId("btnSelectUgpa").addEventListener(
      "click",
      safeRun(function () { return window.ScanService.selectFolder("UGPA"); })
    );

    byId("btnSelectUtet").addEventListener(
      "click",
      safeRun(function () { return window.ScanService.selectFolder("UTET"); })
    );

    byId("btnAuditSelected").addEventListener(
      "click",
      safeRun(function () { return window.ScanService.auditSelected(); })
    );

    byId("btnOpenHistory").addEventListener(
      "click",
      safeRun(function () { return window.ScanService.openHistoryFile(); })
    );

    byId("btnExportPdf").addEventListener(
      "click",
      safeRun(function () { return window.ScanService.exportPdf(); })
    );

    byId("btnOpenDashboard").addEventListener("click", function () {
      window.ScanService.goToDashboard();
    });

    byId("btnOpenRules").addEventListener("click", function () {
      window.ScanService.goToRules();
    });

    byId("exportMode").addEventListener("change", function (event) {
      window.ScanService.setExportMode(event.target.value);
    });

    byId("includeUgpa").addEventListener("change", function (event) {
      window.ScanService.setAuditSelection("UGPA", event.target.checked);
    });

    byId("includeUtet").addEventListener("change", function (event) {
      window.ScanService.setAuditSelection("UTET", event.target.checked);
    });
  }

  async function boot() {
    render();
    bind();
    window.ScanState.subscribe(render);
    if (window.AppStore && typeof window.AppStore.subscribe === "function") {
      window.AppStore.subscribe(render);
    }
    await window.ScanService.initializeFromHistory();
  }

  document.addEventListener("DOMContentLoaded", function () {
    boot().catch(function (error) {
      window.ScanState.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo iniciar AUDIT."
      );
    });
  });
})(window, document);
