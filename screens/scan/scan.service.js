(function (window) {
  "use strict";
  /*
  Nombre completo: scan.service.js
  Ruta o ubicación: /screens/scan/scan.service.js
  Función o funciones:
  - Interactuar con la API local para escaneo de carpetas, importación ZIP/RAR, historial, PDF y navegación
  - Construir el viewModel de la pantalla Escaneo
  - Ejecutar carga inicial, escaneo, limpieza, apertura del historial y exportación PDF
  */

  const REQUIRED_PROCESS_FOLDERS = [
    "PROCESOS DE APOYO",
    "PROCESOS ESTRATEGICOS",
    "PROCESOS MISIONALES"
  ];

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeType(type) {
    const value = safeText(type).toUpperCase();
    return value === "UGPA" || value === "UTET" ? value : "";
  }

  function mustScanState() {
    if (!window.ScanState || typeof window.ScanState.get !== "function") {
      throw new Error("ScanState no está disponible.");
    }
    return window.ScanState;
  }

  function mustArchiveApi() {
    if (!window.api || !window.api.archive) {
      throw new Error("La API de escaneo/importación no está disponible.");
    }
    return window.api.archive;
  }

  function mustHistoryApi() {
    if (!window.api || !window.api.history) {
      throw new Error("La API de historial no está disponible.");
    }
    return window.api.history;
  }

  function mustPdfApi() {
    if (!window.api || !window.api.pdf) {
      throw new Error("La API de exportación PDF no está disponible.");
    }
    return window.api.pdf;
  }

  function mustShellApi() {
    if (!window.api || !window.api.shell) {
      throw new Error("La API para abrir rutas no está disponible.");
    }
    return window.api.shell;
  }

  function normalizeObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeSummary(summary) {
    const safeSummary = normalizeObject(summary);
    return {
      totalFolders: Number(safeSummary.totalFolders || 0),
      totalFiles: Number(safeSummary.totalFiles || 0),
      totalSizeBytes: Number(safeSummary.totalSizeBytes || 0),
      byExtension:
        safeSummary.byExtension && typeof safeSummary.byExtension === "object"
          ? safeSummary.byExtension
          : {}
    };
  }

  function normalizeValidation(validation) {
    const safeValidation = normalizeObject(validation);
    const requiredProcessFolders = normalizeArray(
      safeValidation.requiredProcessFolders
    ).length
      ? normalizeArray(safeValidation.requiredProcessFolders)
      : REQUIRED_PROCESS_FOLDERS.slice();

    const foundProcessFolders = normalizeArray(
      safeValidation.foundProcessFolders
    );

    const missingProcessFolders = normalizeArray(
      safeValidation.missingProcessFolders
    ).length
      ? normalizeArray(safeValidation.missingProcessFolders)
      : requiredProcessFolders.filter(function keep(requiredFolder) {
          return foundProcessFolders.indexOf(requiredFolder) === -1;
        });

    return {
      requiredProcessFolders: requiredProcessFolders,
      foundProcessFolders: foundProcessFolders,
      missingProcessFolders: missingProcessFolders,
      hasAllRequiredFolders:
        safeValidation.hasAllRequiredFolders === true ||
        missingProcessFolders.length === 0
    };
  }

  function normalizeSource(source, rootPath) {
    const safeSource = normalizeObject(source);
    const sourceKind = safeText(safeSource.kind).toLowerCase();

    return {
      kind: sourceKind === "folder" ? "folder" : "archive",
      selectedFolderPath: safeText(safeSource.selectedFolderPath),
      originalArchivePath: safeText(safeSource.originalArchivePath),
      storedArchivePath: safeText(safeSource.storedArchivePath),
      extractionRootPath: safeText(safeSource.extractionRootPath),
      effectiveRootPath: safeText(safeSource.effectiveRootPath || rootPath),
      archiveExtension: safeText(safeSource.archiveExtension),
      extractor: safeText(safeSource.extractor)
    };
  }

  function normalizeScanResult(scanResult, fallbackType) {
    const safeScanResult = normalizeObject(scanResult);
    const type = normalizeType(safeScanResult.type || fallbackType);

    return {
      ok: safeScanResult.ok === true,
      type: type,
      rootPath: safeText(safeScanResult.rootPath),
      rootName: safeText(safeScanResult.rootName),
      scannedAt: safeScanResult.scannedAt || null,
      folders: normalizeArray(safeScanResult.folders),
      files: normalizeArray(safeScanResult.files),
      summary: normalizeSummary(safeScanResult.summary),
      validation: normalizeValidation(safeScanResult.validation),
      source: normalizeSource(safeScanResult.source, safeScanResult.rootPath)
    };
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);

    if (!Number.isFinite(size) || size <= 0) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let current = size;
    let index = 0;

    while (current >= 1024 && index < units.length - 1) {
      current /= 1024;
      index += 1;
    }

    return (
      (current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)) +
      " " +
      units[index]
    );
  }

  function formatDateTime(iso) {
    if (!iso) {
      return "Sin fecha";
    }

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
      return "Sin fecha";
    }

    return date.toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function syncAppStore(history) {
    try {
      const store = window.AppStore;
      const safeHistory = normalizeObject(history);

      if (!store || typeof store !== "object") {
        return;
      }

      const payload = {
        ugpaResult: safeHistory.ugpaResult || null,
        utetResult: safeHistory.utetResult || null,
        discardedFindings: Array.isArray(safeHistory.discardedFindings)
          ? safeHistory.discardedFindings
          : []
      };

      if (typeof store.setHistory === "function") {
        store.setHistory(safeHistory);
        return;
      }

      if (typeof store.set === "function") {
        store.set(payload);
        return;
      }

      if (typeof store.update === "function") {
        store.update(payload);
      }
    } catch (_error) {
      // Mantener estable la pantalla si AppStore no está listo
    }
  }

  function buildValidationLabel(scanResult) {
    const validation =
      scanResult && scanResult.validation && typeof scanResult.validation === "object"
        ? scanResult.validation
        : null;

    if (!validation) {
      return {
        status: "neutral",
        text: "Sin validación estructural."
      };
    }

    if (validation.hasAllRequiredFolders) {
      return {
        status: "success",
        text: "Se encontraron las carpetas estructurales requeridas."
      };
    }

    const missing = Array.isArray(validation.missingProcessFolders)
      ? validation.missingProcessFolders
      : [];

    if (!missing.length) {
      return {
        status: "neutral",
        text: "No se detectaron carpetas estructurales requeridas."
      };
    }

    return {
      status: "warning",
      text: "Faltan carpetas requeridas: " + missing.join(", ")
    };
  }

  function buildSourceLabel(scanResult) {
    const source =
      scanResult && scanResult.source && typeof scanResult.source === "object"
        ? scanResult.source
        : null;

    if (!source) {
      return {
        kind: "neutral",
        title: "Origen no disponible",
        detail: ""
      };
    }

    if (safeText(source.kind).toLowerCase() === "folder") {
      return {
        kind: "success",
        title: "Escaneo desde carpeta",
        detail: safeText(source.selectedFolderPath || source.effectiveRootPath)
      };
    }

    return {
      kind: "neutral",
      title: "Importación desde archivo comprimido",
      detail: safeText(source.originalArchivePath || source.storedArchivePath)
    };
  }

  function buildEmptyCardModel(type) {
    const safeType = normalizeType(type);

    return {
      type: safeType,
      loaded: false,
      title: safeType,
      summary: {
        totalFolders: 0,
        totalFiles: 0,
        totalSizeBytes: 0
      },
      rootName: "",
      rootPath: "",
      scannedAtLabel: "Sin fecha",
      validationLabel: {
        status: "neutral",
        text: "No existe información cargada."
      },
      sourceLabel: {
        kind: "neutral",
        title: "Sin origen cargado",
        detail: ""
      },
      sourcePath: "",
      effectiveRootPath: "",
      result: null
    };
  }

  function buildCardModel(type, scanResult) {
    const safeType = normalizeType(type);
    const normalized = scanResult ? normalizeScanResult(scanResult, safeType) : null;

    if (!normalized || normalized.ok !== true) {
      return buildEmptyCardModel(safeType);
    }

    const sourceLabel = buildSourceLabel(normalized);

    return {
      type: safeType,
      loaded: true,
      title: safeType,
      summary: {
        totalFolders: Number(normalized.summary.totalFolders || 0),
        totalFiles: Number(normalized.summary.totalFiles || 0),
        totalSizeBytes: Number(normalized.summary.totalSizeBytes || 0)
      },
      rootName: safeText(normalized.rootName),
      rootPath: safeText(normalized.rootPath),
      scannedAtLabel: formatDateTime(normalized.scannedAt),
      validationLabel: buildValidationLabel(normalized),
      sourceLabel: sourceLabel,
      sourcePath: sourceLabel.detail,
      effectiveRootPath: safeText(
        normalized.source.effectiveRootPath || normalized.rootPath
      ),
      result: normalized
    };
  }

  function buildSummaryCards(ugpaCard, utetCard, discardedCount) {
    const totalFolders =
      Number(ugpaCard.summary.totalFolders || 0) +
      Number(utetCard.summary.totalFolders || 0);

    const totalFiles =
      Number(ugpaCard.summary.totalFiles || 0) +
      Number(utetCard.summary.totalFiles || 0);

    const totalBytes =
      Number(ugpaCard.summary.totalSizeBytes || 0) +
      Number(utetCard.summary.totalSizeBytes || 0);

    return [
      {
        label: "Carpetas",
        value: String(totalFolders)
      },
      {
        label: "Archivos",
        value: String(totalFiles)
      },
      {
        label: "Peso total",
        value: formatBytes(totalBytes)
      },
      {
        label: "Descartadas",
        value: String(Number(discardedCount || 0))
      }
    ];
  }

  function getViewModel() {
    const scanState = mustScanState();
    const state = scanState.get();
    const ugpaCard = buildCardModel("UGPA", state.ugpaResult);
    const utetCard = buildCardModel("UTET", state.utetResult);

    const appStore =
      window.AppStore && typeof window.AppStore.get === "function"
        ? window.AppStore.get()
        : {};

    const discardedCount = Array.isArray(appStore && appStore.discardedFindings)
      ? appStore.discardedFindings.length
      : 0;

    return {
      loading: !!state.loading,
      message: state.message || { type: "neutral", text: "" },
      exportMode: safeText(state.exportMode) || "both",
      historyFilePath: safeText(state.historyFilePath),
      exportResult: state.exportResult || {
        ok: false,
        filePath: "",
        fileName: "",
        error: ""
      },
      summaryCards: buildSummaryCards(ugpaCard, utetCard, discardedCount),
      ugpaCard: ugpaCard,
      utetCard: utetCard
    };
  }

  async function initializeFromHistory() {
    const scanState = mustScanState();
    scanState.set({ loading: true });

    try {
      const response = await mustHistoryApi().get();

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo cargar el historial."
        );
      }

      const history = normalizeObject(response.history);

      scanState.hydrateFromHistory(history, response.filePath || "");
      scanState.patchMessage("success", "Historial cargado correctamente.");
      syncAppStore(history);
    } catch (error) {
      scanState.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo cargar el historial."
      );
    } finally {
      scanState.set({ loading: false });
    }
  }

  async function importArchive(type) {
    const safeType = normalizeType(type);
    const scanState = mustScanState();

    if (!safeType) {
      throw new Error("Tipo no válido para importación.");
    }

    scanState.set({ loading: true });

    try {
      const response = await mustArchiveApi().pickAndImport(safeType);

      if (response && response.cancelled) {
        scanState.patchMessage("neutral", "Importación cancelada por el usuario.");
        return;
      }

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo importar el archivo comprimido."
        );
      }

      const normalized = normalizeScanResult(response.result, safeType);

      scanState.setResult(safeType, normalized);
      scanState.set({
        historyFilePath: safeText(response.historyFilePath),
        exportResult: {
          ok: false,
          filePath: "",
          fileName: "",
          error: ""
        }
      });
      scanState.patchMessage(
        "success",
        safeType + " importado correctamente desde ZIP/RAR."
      );

      syncAppStore(response.history || {});
    } catch (error) {
      scanState.patchMessage(
        "error",
        error && error.message
          ? error.message
          : "No se pudo importar el archivo comprimido."
      );
    } finally {
      scanState.set({ loading: false });
    }
  }

  async function scanFolder(type) {
    const safeType = normalizeType(type);
    const scanState = mustScanState();

    if (!safeType) {
      throw new Error("Tipo no válido para escaneo.");
    }

    scanState.set({ loading: true });

    try {
      const response = await mustArchiveApi().pickAndScanFolder(safeType);

      if (response && response.cancelled) {
        scanState.patchMessage("neutral", "Escaneo cancelado por el usuario.");
        return;
      }

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo escanear la carpeta."
        );
      }

      const normalized = normalizeScanResult(response.result, safeType);

      scanState.setResult(safeType, normalized);
      scanState.set({
        historyFilePath: safeText(response.historyFilePath),
        exportResult: {
          ok: false,
          filePath: "",
          fileName: "",
          error: ""
        }
      });
      scanState.patchMessage(
        "success",
        safeType + " escaneado correctamente desde carpeta local."
      );

      syncAppStore(response.history || {});
    } catch (error) {
      scanState.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo escanear la carpeta."
      );
    } finally {
      scanState.set({ loading: false });
    }
  }

  async function clearScan(type) {
    const safeType = normalizeType(type);
    const scanState = mustScanState();

    if (!safeType) {
      throw new Error("Tipo no válido para limpiar.");
    }

    scanState.set({ loading: true });

    try {
      const response = await mustHistoryApi().clearScan(safeType);

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error ? response.error : "No se pudo limpiar el escaneo."
        );
      }

      const history = normalizeObject(response.history);

      scanState.hydrateFromHistory(history, response.filePath || "");
      scanState.patchMessage("success", safeType + " limpiado correctamente.");
      syncAppStore(history);
    } catch (error) {
      scanState.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo limpiar el escaneo."
      );
    } finally {
      scanState.set({ loading: false });
    }
  }

  async function openHistoryFile() {
    const scanState = mustScanState();
    const state = scanState.get();
    const historyFilePath = safeText(state.historyFilePath);

    if (!historyFilePath) {
      throw new Error("No existe una ruta de historial disponible.");
    }

    const response = await mustShellApi().openPath(historyFilePath);

    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error
          ? response.error
          : "No se pudo abrir el historial."
      );
    }

    return response;
  }

  async function openPath(targetPath) {
    const safePath = safeText(targetPath);

    if (!safePath) {
      throw new Error("No existe una ruta válida para abrir.");
    }

    const response = await mustShellApi().openPath(safePath);

    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error ? response.error : "No se pudo abrir la ruta."
      );
    }

    return response;
  }

  function buildExportPayload(mode, state) {
    const safeMode = safeText(mode).toLowerCase();
    const safeState = normalizeObject(state);

    if (safeMode === "single-ugpa") {
      if (!safeState.ugpaResult || safeState.ugpaResult.ok !== true) {
        throw new Error("No existe un resultado UGPA para exportar.");
      }

      return {
        mode: "single",
        type: "UGPA",
        scanData: safeState.ugpaResult
      };
    }

    if (safeMode === "single-utet") {
      if (!safeState.utetResult || safeState.utetResult.ok !== true) {
        throw new Error("No existe un resultado UTET para exportar.");
      }

      return {
        mode: "single",
        type: "UTET",
        scanData: safeState.utetResult
      };
    }

    if (
      !safeState.ugpaResult ||
      safeState.ugpaResult.ok !== true ||
      !safeState.utetResult ||
      safeState.utetResult.ok !== true
    ) {
      throw new Error(
        "Para exportar ambas carpetas deben existir resultados UGPA y UTET."
      );
    }

    return {
      mode: "both",
      items: [
        {
          type: "UGPA",
          scanData: safeState.ugpaResult
        },
        {
          type: "UTET",
          scanData: safeState.utetResult
        }
      ]
    };
  }

  async function exportPdf() {
    const scanState = mustScanState();
    scanState.set({ loading: true });

    try {
      const state = scanState.get();
      const payload = buildExportPayload(state.exportMode, state);
      const response = await mustPdfApi().export(payload);

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo exportar el PDF."
        );
      }

      scanState.set({
        exportResult: {
          ok: true,
          filePath: safeText(response.filePath),
          fileName: safeText(response.fileName),
          error: ""
        }
      });

      scanState.patchMessage("success", "PDF generado correctamente.");
    } catch (error) {
      scanState.set({
        exportResult: {
          ok: false,
          filePath: "",
          fileName: "",
          error: error && error.message ? error.message : "No se pudo exportar el PDF."
        }
      });

      scanState.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo exportar el PDF."
      );
    } finally {
      scanState.set({ loading: false });
    }
  }

  function setExportMode(mode) {
    const scanState = mustScanState();
    scanState.set({
      exportMode: safeText(mode) || "both"
    });
  }

  function goToDashboard() {
    window.location.href = "../dashboard/dashboard.index.html";
  }

  function goToRules() {
    window.location.href = "../rules/rules.index.html";
  }

  window.ScanService = {
    getViewModel: getViewModel,
    initializeFromHistory: initializeFromHistory,
    importArchive: importArchive,
    scanFolder: scanFolder,
    clearScan: clearScan,
    openHistoryFile: openHistoryFile,
    openPath: openPath,
    exportPdf: exportPdf,
    setExportMode: setExportMode,
    goToDashboard: goToDashboard,
    goToRules: goToRules,
    formatBytes: formatBytes,
    formatDateTime: formatDateTime
  };
})(window);