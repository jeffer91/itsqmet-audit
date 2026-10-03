(function (window) {
  "use strict";

  const REQUIRED_PROCESS_FOLDERS = [
    "PROCESOS DE APOYO",
    "PROCESOS ESTRATEGICOS",
    "PROCESOS MISIONALES"
  ];

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  function mustScanState() {
    if (!window.ScanState || typeof window.ScanState.get !== "function") {
      throw new Error("ScanState no está disponible.");
    }
    return window.ScanState;
  }

  function mustArchiveApi() {
    if (!window.api || !window.api.archive) {
      throw new Error("La API de carpetas no está disponible.");
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

  function normalizeSummary(summary) {
    const safe = normalizeObject(summary);
    return {
      totalFolders: Number(safe.totalFolders || 0),
      totalFiles: Number(safe.totalFiles || 0),
      totalSizeBytes: Number(safe.totalSizeBytes || 0)
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
      : required.filter(function keep(name) {
          return !found.includes(name);
        });

    return {
      requiredProcessFolders: required,
      foundProcessFolders: found,
      missingProcessFolders: missing,
      hasAllRequiredFolders:
        safe.hasAllRequiredFolders === true || missing.length === 0
    };
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let current = value;
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

  function formatDateTime(value) {
    if (!value) return "Sin auditoría";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sin auditoría";
    return date.toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function syncAppStore(history) {
    if (
      window.AppStore &&
      typeof window.AppStore.setHistory === "function"
    ) {
      window.AppStore.setHistory(history || {});
    }
  }

  function buildValidationLabel(validation) {
    if (!validation) {
      return {
        status: "neutral",
        text: "Carpeta seleccionada. Pendiente de validación/auditoría."
      };
    }

    const safe = normalizeValidation(validation);

    if (safe.hasAllRequiredFolders) {
      return {
        status: "success",
        text: "Estructura principal completa."
      };
    }

    return {
      status: "warning",
      text:
        "Estructura incompleta · faltan: " +
        safe.missingProcessFolders.join(", ")
    };
  }

  function resultMatchesSource(result, sourcePath) {
    if (!result || result.ok !== true || !safeText(sourcePath)) return false;

    const resultPath = safeText(
      result.source && result.source.selectedFolderPath
        ? result.source.selectedFolderPath
        : result.rootPath
    );

    return resultPath.toLowerCase() === safeText(sourcePath).toLowerCase();
  }

  function buildUnitCard(type, sourcePath, validation, result) {
    const loaded = resultMatchesSource(result, sourcePath);
    const safeResult = loaded ? result : null;

    return {
      type: type,
      selected: !!safeText(sourcePath),
      sourcePath: safeText(sourcePath),
      loaded: loaded,
      validationLabel: buildValidationLabel(
        validation || (safeResult && safeResult.validation)
      ),
      summary: normalizeSummary(safeResult && safeResult.summary),
      scannedAtLabel: formatDateTime(safeResult && safeResult.scannedAt),
      openPath: safeText(sourcePath)
    };
  }

  function buildSummaryCards(ugpaCard, utetCard) {
    const selected = Number(ugpaCard.selected) + Number(utetCard.selected);
    const audited = Number(ugpaCard.loaded) + Number(utetCard.loaded);

    return [
      { label: "Seleccionadas", value: selected + "/2" },
      { label: "Auditadas", value: audited + "/2" },
      {
        label: "Carpetas",
        value: String(
          Number(ugpaCard.summary.totalFolders || 0) +
            Number(utetCard.summary.totalFolders || 0)
        )
      },
      {
        label: "Archivos",
        value: String(
          Number(ugpaCard.summary.totalFiles || 0) +
            Number(utetCard.summary.totalFiles || 0)
        )
      },
      {
        label: "Peso",
        value: formatBytes(
          Number(ugpaCard.summary.totalSizeBytes || 0) +
            Number(utetCard.summary.totalSizeBytes || 0)
        )
      }
    ];
  }

  function getViewModel() {
    const state = mustScanState().get();
    const ugpa = buildUnitCard(
      "UGPA",
      state.ugpaSourcePath,
      state.ugpaValidation,
      state.ugpaResult
    );
    const utet = buildUnitCard(
      "UTET",
      state.utetSourcePath,
      state.utetValidation,
      state.utetResult
    );

    return {
      loading: !!state.loading,
      message: state.message || { type: "neutral", text: "" },
      exportMode: safeText(state.exportMode) || "both",
      historyFilePath: safeText(state.historyFilePath),
      exportResult: state.exportResult || {},
      canAudit:
        (ugpa.selected && state.auditUgpa) ||
        (utet.selected && state.auditUtet),
      auditUgpa: !!state.auditUgpa,
      auditUtet: !!state.auditUtet,
      progress: state.progress || {},
      summaryCards: buildSummaryCards(ugpa, utet),
      ugpaCard: ugpa,
      utetCard: utet
    };
  }

  async function initializeFromHistory() {
    const state = mustScanState();
    state.set({ loading: true });

    try {
      const response = await mustHistoryApi().get();
      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo cargar el historial."
        );
      }

      state.hydrateFromHistory(response.history || {}, response.historyFilePath || "");
      syncAppStore(response.history || {});
    } catch (error) {
      state.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo cargar el historial."
      );
    } finally {
      state.set({ loading: false });
    }
  }

  async function selectFolder(type) {
    const state = mustScanState();
    const safeType = safeText(type).toUpperCase();

    if (safeType !== "UGPA" && safeType !== "UTET") {
      throw new Error("Unidad inválida.");
    }

    state.set({ loading: true });

    try {
      const response = await mustArchiveApi().pickFolder(safeType);

      if (response && response.cancelled) {
        state.patchMessage("neutral", "Selección cancelada.");
        return;
      }

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo seleccionar la carpeta."
        );
      }

      state.hydrateFromHistory(response.history || {}, response.historyFilePath || "");

      state.set(
        safeType === "UGPA"
          ? { ugpaValidation: response.validation || null }
          : { utetValidation: response.validation || null }
      );

      syncAppStore(response.history || {});

      const validation = normalizeValidation(response.validation);
      state.patchMessage(
        validation.hasAllRequiredFolders ? "success" : "warning",
        safeType +
          " seleccionada. " +
          (validation.hasAllRequiredFolders
            ? "Estructura principal completa."
            : "La carpeta se acepta, pero tiene estructura incompleta.")
      );
    } catch (error) {
      state.patchMessage(
        "error",
        error && error.message
          ? error.message
          : "No se pudo seleccionar la carpeta."
      );
    } finally {
      state.set({ loading: false });
    }
  }

  async function auditSelected() {
    const state = mustScanState();
    const current = state.get();
    const units = [];

    if (safeText(current.ugpaSourcePath) && current.auditUgpa) {
      units.push({ type: "UGPA", path: current.ugpaSourcePath });
    }

    if (safeText(current.utetSourcePath) && current.auditUtet) {
      units.push({ type: "UTET", path: current.utetSourcePath });
    }

    if (!units.length) {
      throw new Error("Seleccione al menos una carpeta: UGPA o UTET.");
    }

    state.set({
      loading: true,
      progress: {
        active: true,
        type: "",
        phase: "preparing",
        folders: 0,
        files: 0,
        processed: 0,
        currentPath: "",
        unitIndex: 0,
        unitTotal: units.length
      }
    });

    const errors = [];
    let latestHistory = null;
    let historyFilePath = current.historyFilePath;

    try {
      for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
        const unit = units[unitIndex];
        state.set({
          progress: {
            active: true,
            type: unit.type,
            phase: "preparing",
            folders: 0,
            files: 0,
            processed: 0,
            currentPath: "",
            unitIndex: unitIndex + 1,
            unitTotal: units.length
          }
        });
        try {
          const response = await mustArchiveApi().scanFolderFromPath(
            unit.type,
            unit.path
          );

          if (!response || response.ok !== true) {
            throw new Error(
              response && response.error
                ? response.error
                : "No se pudo auditar " + unit.type + "."
            );
          }

          latestHistory = response.history || latestHistory;
          historyFilePath = response.historyFilePath || historyFilePath;
        } catch (error) {
          errors.push(
            unit.type +
              ": " +
              (error && error.message ? error.message : "error de auditoría")
          );
        }
      }

      if (latestHistory) {
        state.hydrateFromHistory(latestHistory, historyFilePath);
        syncAppStore(latestHistory);
      }

      if (errors.length) {
        state.patchMessage("warning", errors.join(" · "));
      } else {
        state.patchMessage(
          "success",
          units.map(function map(unit) { return unit.type; }).join(" + ") +
            " auditada(s) correctamente."
        );
      }
    } finally {
      const lastProgress = state.get().progress || {};
      state.set({
        loading: false,
        progress: {
          ...lastProgress,
          active: false,
          phase: "done"
        }
      });
    }
  }

  async function openPath(targetPath) {
    const safePath = safeText(targetPath);
    if (!safePath) throw new Error("No existe una ruta válida para abrir.");

    const response = await mustShellApi().openPath(safePath);
    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error ? response.error : "No se pudo abrir la ruta."
      );
    }
    return response;
  }

  async function openHistoryFile() {
    const path = safeText(mustScanState().get().historyFilePath);
    if (!path) throw new Error("No existe un historial disponible.");
    return openPath(path);
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
      throw new Error("Para exportar ambas unidades deben existir ambos resultados.");
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
    const state = mustScanState();
    state.set({ loading: true });

    try {
      const current = state.get();
      const response = await mustPdfApi().export(
        buildExportPayload(current.exportMode, current)
      );

      if (!response || response.ok !== true) {
        throw new Error(
          response && response.error
            ? response.error
            : "No se pudo exportar el PDF."
        );
      }

      state.set({
        exportResult: {
          ok: true,
          filePath: safeText(response.filePath),
          fileName: safeText(response.fileName),
          error: ""
        }
      });
      state.patchMessage("success", "PDF generado correctamente.");
    } catch (error) {
      state.set({
        exportResult: {
          ok: false,
          filePath: "",
          fileName: "",
          error: error && error.message ? error.message : "Error de exportación."
        }
      });
      state.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo exportar el PDF."
      );
    } finally {
      state.set({ loading: false });
    }
  }

  function setExportMode(mode) {
    mustScanState().set({ exportMode: safeText(mode) || "both" });
  }

  function setAuditSelection(type, checked) {
    const safeType = safeText(type).toUpperCase();
    if (safeType === "UGPA") {
      mustScanState().set({ auditUgpa: !!checked });
    } else if (safeType === "UTET") {
      mustScanState().set({ auditUtet: !!checked });
    }
  }

  window.ScanService = {
    getViewModel: getViewModel,
    initializeFromHistory: initializeFromHistory,
    selectFolder: selectFolder,
    auditSelected: auditSelected,
    openPath: openPath,
    openHistoryFile: openHistoryFile,
    exportPdf: exportPdf,
    setExportMode: setExportMode,
    setAuditSelection: setAuditSelection,
    goToDashboard: function () {
      window.location.href = "../dashboard/dashboard.index.html";
    },
    goToRules: function () {
      window.location.href = "../rules/rules.index.html";
    },
    formatBytes: formatBytes
  };
})(window);
