(function (window) {
  "use strict";
  /*
  Nombre completo: scan.service.js
  Ruta o ubicación: /screens/scan/scan.service.js
  Función o funciones:
  - Seleccionar una única carpeta institucional
  - Auditar automáticamente UGPA y UTET
  - Construir el viewModel de Escaneo
  - Gestionar historial, apertura de rutas y exportación PDF
  */

  const REQUIRED_PROCESS_FOLDERS = [
    "PROCESOS DE APOYO",
    "PROCESOS ESTRATEGICOS",
    "PROCESOS MISIONALES"
  ];

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function mustScanState() {
    if (!window.ScanState || typeof window.ScanState.get !== "function") {
      throw new Error("ScanState no está disponible.");
    }
    return window.ScanState;
  }

  function mustInstitutionApi() {
    if (!window.api || !window.api.institution) {
      throw new Error("La API de auditoría institucional no está disponible.");
    }
    return window.api.institution;
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

  function normalizeSummary(summary) {
    const safe = normalizeObject(summary);
    return {
      totalFolders: Number(safe.totalFolders || 0),
      totalFiles: Number(safe.totalFiles || 0),
      totalSizeBytes: Number(safe.totalSizeBytes || 0),
      byExtension:
        safe.byExtension && typeof safe.byExtension === "object"
          ? safe.byExtension
          : {}
    };
  }

  function normalizeValidation(validation) {
    const safe = normalizeObject(validation);
    const required = normalizeArray(safe.requiredProcessFolders).length
      ? normalizeArray(safe.requiredProcessFolders)
      : REQUIRED_PROCESS_FOLDERS.slice();
    const found = normalizeArray(safe.foundProcessFolders);
    const missing = normalizeArray(safe.missingProcessFolders).length
      ? normalizeArray(safe.missingProcessFolders)
      : required.filter(function keep(item) {
          return !found.includes(item);
        });

    return {
      requiredProcessFolders: required,
      foundProcessFolders: found,
      missingProcessFolders: missing,
      hasAllRequiredFolders:
        safe.hasAllRequiredFolders === true || missing.length === 0
    };
  }

  function normalizeScanResult(scanResult, fallbackType) {
    const safe = normalizeObject(scanResult);
    const type = safeText(safe.type || fallbackType).toUpperCase();

    if (!safe || (type !== "UGPA" && type !== "UTET")) {
      return null;
    }

    return {
      ok: safe.ok === true,
      type: type,
      rootPath: safeText(safe.rootPath),
      rootName: safeText(safe.rootName),
      scannedAt: safe.scannedAt || null,
      folders: normalizeArray(safe.folders),
      files: normalizeArray(safe.files),
      summary: normalizeSummary(safe.summary),
      validation: normalizeValidation(safe.validation),
      source: normalizeObject(safe.source)
    };
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 B";

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
    if (!iso) return "Sin fecha";

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Sin fecha";

    return date.toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function syncAppStore(history) {
    try {
      if (window.AppStore && typeof window.AppStore.setHistory === "function") {
        window.AppStore.setHistory(history || {});
      }
    } catch (_error) {}
  }

  function buildValidationLabel(result) {
    const validation = result && result.validation ? result.validation : null;

    if (!validation) {
      return {
        status: "neutral",
        text: "Todavía no se ha ejecutado la auditoría."
      };
    }

    if (validation.hasAllRequiredFolders) {
      return {
        status: "success",
        text: "Estructura principal completa: Apoyo, Estratégicos y Misionales."
      };
    }

    const missing = normalizeArray(validation.missingProcessFolders);

    return {
      status: "warning",
      text: missing.length
        ? "Faltan carpetas principales: " + missing.join(", ")
        : "La estructura principal está incompleta."
    };
  }

  function buildEmptyCardModel(type) {
    return {
      type: type,
      loaded: false,
      title: type,
      summary: {
        totalFolders: 0,
        totalFiles: 0,
        totalSizeBytes: 0
      },
      rootName: "",
      rootPath: "",
      scannedAtLabel: "Sin auditoría",
      validationLabel: {
        status: "neutral",
        text: "Ejecute la auditoría institucional."
      },
      effectiveRootPath: ""
    };
  }

  function buildCardModel(type, rawResult) {
    const result = normalizeScanResult(rawResult, type);

    if (!result || result.ok !== true) {
      return buildEmptyCardModel(type);
    }

    return {
      type: type,
      loaded: true,
      title: type,
      summary: result.summary,
      rootName: result.rootName,
      rootPath: result.rootPath,
      scannedAtLabel: formatDateTime(result.scannedAt),
      validationLabel: buildValidationLabel(result),
      effectiveRootPath: safeText(
        result.source && result.source.effectiveRootPath
          ? result.source.effectiveRootPath
          : result.rootPath
      )
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
      { label: "Unidades auditadas", value: String((ugpaCard.loaded ? 1 : 0) + (utetCard.loaded ? 1 : 0)) + "/2" },
      { label: "Carpetas", value: String(totalFolders) },
      { label: "Archivos", value: String(totalFiles) },
      { label: "Peso total", value: formatBytes(totalBytes) },
      { label: "Descartadas", value: String(Number(discardedCount || 0)) }
    ];
  }

  function getViewModel() {
    const state = mustScanState().get();
    const ugpaCard = buildCardModel("UGPA", state.ugpaResult);
    const utetCard = buildCardModel("UTET", state.utetResult);
    const appStore =
      window.AppStore && typeof window.AppStore.get === "function"
        ? window.AppStore.get()
        : {};
    const discardedCount = Array.isArray(appStore.discardedFindings)
      ? appStore.discardedFindings.length
      : 0;

    return {
      loading: !!state.loading,
      message: state.message || { type: "neutral", text: "" },
      institutionalRootPath: safeText(state.institutionalRootPath),
      rootSelected: !!safeText(state.institutionalRootPath),
      detection: state.detection || null,
      exportMode: safeText(state.exportMode) || "both",
      historyFilePath: safeText(state.historyFilePath),
      exportResult: state.exportResult || {},
      summaryCards: buildSummaryCards(ugpaCard, utetCard, discardedCount),
      ugpaCard: ugpaCard,
      utetCard: utetCard
    };
  }

  async function initializeFromHistory() {
    const state = mustScanState();
    state.set({ loading: true });

    try {
      const response = await mustHistoryApi().get();

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error ? response.error : "No se pudo cargar el historial."
        );
      }

      const history = normalizeObject(response.history);
      state.hydrateFromHistory(history, response.historyFilePath || "");
      syncAppStore(history);

      if (safeText(history.institutionalRootPath)) {
        state.patchMessage(
          "neutral",
          "Carpeta institucional recuperada. Puede ejecutar una nueva auditoría."
        );
      }
    } catch (error) {
      state.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo cargar el historial."
      );
    } finally {
      state.set({ loading: false });
    }
  }

  async function selectInstitutionRoot() {
    const state = mustScanState();
    state.set({ loading: true });

    try {
      const response = await mustInstitutionApi().pickRoot();

      if (response && response.cancelled) {
        state.patchMessage("neutral", "Selección cancelada.");
        return;
      }

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "La carpeta seleccionada no es válida."
        );
      }

      const currentState = state.get();
      const previousRootPath = safeText(currentState.institutionalRootPath);
      const nextRootPath = safeText(response.rootPath);
      const changedRoot = previousRootPath
        ? previousRootPath.toLowerCase() !== nextRootPath.toLowerCase()
        : !!(currentState.ugpaResult || currentState.utetResult);

      state.set({
        institutionalRootPath: nextRootPath,
        detection: response.detection || null,
        ugpaResult: changedRoot ? null : currentState.ugpaResult,
        utetResult: changedRoot ? null : currentState.utetResult,
        exportResult: changedRoot
          ? { ok: false, filePath: "", fileName: "", error: "" }
          : currentState.exportResult
      });

      if (
        changedRoot &&
        window.AppStore &&
        typeof window.AppStore.update === "function"
      ) {
        window.AppStore.update({
          ugpaResult: null,
          utetResult: null
        });
      }

      state.patchMessage(
        "success",
        changedRoot
          ? "Nueva carpeta institucional detectada. Ejecute la auditoría para actualizar UGPA y UTET."
          : "Carpeta institucional válida. Se detectaron UGPA y UTET."
      );
    } catch (error) {
      state.patchMessage(
        "error",
        error && error.message
          ? error.message
          : "No se pudo seleccionar la carpeta institucional."
      );
    } finally {
      state.set({ loading: false });
    }
  }

  async function auditInstitution() {
    const state = mustScanState();
    const current = state.get();
    const rootPath = safeText(current.institutionalRootPath);

    if (!rootPath) {
      throw new Error("Primero seleccione la carpeta institucional.");
    }

    state.set({ loading: true });

    try {
      const response = await mustInstitutionApi().scanRoot(rootPath);

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo completar la auditoría."
        );
      }

      const history = normalizeObject(response.history);

      state.hydrateFromHistory(history, response.historyFilePath || "");
      state.set({
        detection: response.detection || null,
        exportResult: {
          ok: false,
          filePath: "",
          fileName: "",
          error: ""
        }
      });

      syncAppStore(history);
      state.patchMessage(
        "success",
        "Auditoría completada. UGPA y UTET fueron analizadas correctamente."
      );
    } catch (error) {
      state.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo completar la auditoría."
      );
    } finally {
      state.set({ loading: false });
    }
  }

  async function openHistoryFile() {
    const state = mustScanState().get();
    const filePath = safeText(state.historyFilePath);

    if (!filePath) {
      throw new Error("No existe una ruta de historial disponible.");
    }

    return openPath(filePath);
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

    if (safeMode === "single-ugpa") {
      if (!state.ugpaResult || state.ugpaResult.ok !== true) {
        throw new Error("No existe un resultado UGPA para exportar.");
      }
      return { mode: "single", type: "UGPA", scanData: state.ugpaResult };
    }

    if (safeMode === "single-utet") {
      if (!state.utetResult || state.utetResult.ok !== true) {
        throw new Error("No existe un resultado UTET para exportar.");
      }
      return { mode: "single", type: "UTET", scanData: state.utetResult };
    }

    if (
      !state.ugpaResult ||
      state.ugpaResult.ok !== true ||
      !state.utetResult ||
      state.utetResult.ok !== true
    ) {
      throw new Error("Debe auditar UGPA y UTET antes de exportar ambas unidades.");
    }

    return {
      mode: "both",
      items: [
        { type: "UGPA", scanData: state.ugpaResult },
        { type: "UTET", scanData: state.utetResult }
      ]
    };
  }

  async function exportPdf() {
    const scanState = mustScanState();
    scanState.set({ loading: true });

    try {
      const state = scanState.get();
      const response = await mustPdfApi().export(
        buildExportPayload(state.exportMode, state)
      );

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error ? response.error : "No se pudo exportar el PDF."
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
    mustScanState().set({ exportMode: safeText(mode) || "both" });
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
    selectInstitutionRoot: selectInstitutionRoot,
    auditInstitution: auditInstitution,
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
