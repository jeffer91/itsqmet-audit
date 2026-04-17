(function (window, document) {
  "use strict";
  /*
  Nombre completo: scan.app.js
  Ruta o ubicación: /screens/scan/scan.app.js
  Función o funciones:
  - Inicializar la pantalla Escaneo
  - Conectar eventos de importación, limpieza, historial y exportación PDF
  - Coordinar el flujo entre ScanState, AppStore, ScanService y ScanUI
  - Mantener la pantalla sincronizada con los cambios del estado local y global
  */

  function getElement(id) {
    return document.getElementById(id);
  }

  function setBusyState(isBusy) {
    const disabled = !!isBusy;
    const buttonIds = [
      "btnScanFolderUgpa",
      "btnImportUgpa",
      "btnClearUgpa",
      "btnScanFolderUtet",
      "btnImportUtet",
      "btnClearUtet",
      "btnOpenHistory",
      "btnExportPdf",
      "btnOpenDashboard",
      "btnOpenRules"
    ];

    buttonIds.forEach(function each(id) {
      const element = getElement(id);
      if (element) {
        element.disabled = disabled;
      }
    });

    const exportMode = getElement("exportMode");
    if (exportMode) {
      exportMode.disabled = disabled;
    }

    document.body.dataset.loading = disabled ? "true" : "false";
  }

  function render() {
    const viewModel = window.ScanService.getViewModel();
    // Corrección técnica: scan.ui.js expone window.ScanUi, no window.ScanUI.
    // Esto evita el fallo de render por referencia global inexistente.
    window.ScanUi.renderViewModel(viewModel);
    setBusyState(viewModel.loading);
  }

  function safeRun(task) {
    return async function wrappedHandler() {
      try {
        await task();
      } catch (error) {
        window.ScanState.set({
          message: {
            type: "error",
            text:
              error && error.message
                ? error.message
                : "Se produjo un error inesperado."
          }
        });
      }
    };
  }

  function bindEvents() {
    const btnScanFolderUgpa = getElement("btnScanFolderUgpa");
    const btnScanFolderUtet = getElement("btnScanFolderUtet");
    const btnImportUgpa = getElement("btnImportUgpa");
    const btnImportUtet = getElement("btnImportUtet");
    const btnClearUgpa = getElement("btnClearUgpa");
    const btnClearUtet = getElement("btnClearUtet");
    const btnOpenHistory = getElement("btnOpenHistory");
    const btnExportPdf = getElement("btnExportPdf");
    const btnOpenDashboard = getElement("btnOpenDashboard");
    const btnOpenRules = getElement("btnOpenRules");
    const exportMode = getElement("exportMode");

    if (btnScanFolderUgpa) {
      btnScanFolderUgpa.addEventListener(
        "click",
        safeRun(async function onScanFolderUgpa() {
          await window.ScanService.scanFolder("UGPA");
          // Corrección técnica: conecta el botón de escaneo local de UGPA.
          // Esto evita que el control exista en pantalla pero no ejecute ninguna acción.
        })
      );
    }

    if (btnScanFolderUtet) {
      btnScanFolderUtet.addEventListener(
        "click",
        safeRun(async function onScanFolderUtet() {
          await window.ScanService.scanFolder("UTET");
          // Corrección técnica: conecta el botón de escaneo local de UTET.
          // Esto evita que el control exista en pantalla pero no ejecute ninguna acción.
        })
      );
    }

    if (btnImportUgpa) {
      btnImportUgpa.addEventListener(
        "click",
        safeRun(async function onImportUgpa() {
          await window.ScanService.importArchive("UGPA");
        })
      );
    }

    if (btnImportUtet) {
      btnImportUtet.addEventListener(
        "click",
        safeRun(async function onImportUtet() {
          await window.ScanService.importArchive("UTET");
        })
      );
    }

    if (btnClearUgpa) {
      btnClearUgpa.addEventListener(
        "click",
        safeRun(async function onClearUgpa() {
          await window.ScanService.clearScan("UGPA");
        })
      );
    }

    if (btnClearUtet) {
      btnClearUtet.addEventListener(
        "click",
        safeRun(async function onClearUtet() {
          await window.ScanService.clearScan("UTET");
        })
      );
    }

    if (btnOpenHistory) {
      btnOpenHistory.addEventListener(
        "click",
        safeRun(async function onOpenHistory() {
          await window.ScanService.openHistoryFile();
        })
      );
    }

    if (btnExportPdf) {
      btnExportPdf.addEventListener(
        "click",
        safeRun(async function onExportPdf() {
          await window.ScanService.exportPdf();
        })
      );
    }

    if (btnOpenDashboard) {
      btnOpenDashboard.addEventListener("click", function onOpenDashboard() {
        window.ScanService.goToDashboard();
      });
    }

    if (btnOpenRules) {
      btnOpenRules.addEventListener("click", function onOpenRules() {
        window.ScanService.goToRules();
      });
    }

    if (exportMode) {
      exportMode.addEventListener("change", function onChangeExportMode(event) {
        const value =
          event && event.target ? String(event.target.value || "") : "both";
        window.ScanService.setExportMode(value);
      });
    }
  }

  function subscribeToStores() {
    if (window.ScanState && typeof window.ScanState.subscribe === "function") {
      window.ScanState.subscribe(function onStateChange() {
        render();
      });
    }

    if (window.AppStore && typeof window.AppStore.subscribe === "function") {
      window.AppStore.subscribe(function onGlobalStoreChange() {
        render();
      });
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
      window.ScanState.set({
        message: {
          type: "error",
          text:
            error && error.message
              ? error.message
              : "No se pudo inicializar la pantalla de escaneo."
        }
      });
      render();
    });
  });
})(window, document);