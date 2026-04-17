(function (window) {
  "use strict";
  /*
  Nombre completo: scan.types.js
  Ruta o ubicación: /screens/scan/scan.types.js
  Función o funciones:
  - Definir utilidades base del módulo de escaneo
  - Normalizar tipos, resultados y origen de los datos
  - Crear estructuras vacías y formateadores reutilizables
  - Unificar soporte para carpeta local y archivos ZIP/RAR
  */

  const VALID_TYPES = ["UGPA", "UTET"];
  const VALID_SOURCE_KINDS = ["archive", "folder"];
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
    return VALID_TYPES.includes(value) ? value : "";
  }

  function normalizeSourceKind(kind) {
    const value = safeText(kind).toLowerCase();
    return VALID_SOURCE_KINDS.includes(value) ? value : "archive";
  }

  function isLoadedScanResult(scanResult) {
    return !!(scanResult && scanResult.ok === true);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createEmptyScanResult(type, rootPath) {
    return {
      ok: true,
      type: normalizeType(type),
      rootPath: safeText(rootPath),
      rootName: "",
      scannedAt: null,
      folders: [],
      files: [],
      summary: {
        totalFolders: 0,
        totalFiles: 0,
        totalSizeBytes: 0,
        byExtension: {}
      },
      validation: {
        requiredProcessFolders: REQUIRED_PROCESS_FOLDERS.slice(),
        foundProcessFolders: [],
        missingProcessFolders: REQUIRED_PROCESS_FOLDERS.slice(),
        hasAllRequiredFolders: false
      },
      source: {
        kind: "archive",
        selectedFolderPath: "",
        originalArchivePath: "",
        storedArchivePath: "",
        extractionRootPath: "",
        effectiveRootPath: "",
        archiveExtension: "",
        extractor: ""
      }
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

    return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
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
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function normalizeSummary(summary) {
    const safeSummary = summary && typeof summary === "object" ? summary : {};
    return {
      totalFolders: Number(safeSummary.totalFolders || 0),
      totalFiles: Number(safeSummary.totalFiles || 0),
      totalSizeBytes: Number(safeSummary.totalSizeBytes || 0),
      byExtension:
        safeSummary.byExtension && typeof safeSummary.byExtension === "object"
          ? clone(safeSummary.byExtension)
          : {}
    };
  }

  function normalizeValidation(validation) {
    const safeValidation =
      validation && typeof validation === "object" ? validation : {};

    const requiredProcessFolders = Array.isArray(
      safeValidation.requiredProcessFolders
    )
      ? safeValidation.requiredProcessFolders.map(safeText).filter(Boolean)
      : REQUIRED_PROCESS_FOLDERS.slice();

    const foundProcessFolders = Array.isArray(safeValidation.foundProcessFolders)
      ? safeValidation.foundProcessFolders.map(safeText).filter(Boolean)
      : [];

    const missingProcessFolders = Array.isArray(
      safeValidation.missingProcessFolders
    )
      ? safeValidation.missingProcessFolders.map(safeText).filter(Boolean)
      : requiredProcessFolders.filter(function keep(requiredName) {
          return !foundProcessFolders.includes(requiredName);
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
    const safeSource = source && typeof source === "object" ? source : {};
    return {
      kind: normalizeSourceKind(safeSource.kind),
      selectedFolderPath: safeText(safeSource.selectedFolderPath),
      originalArchivePath: safeText(safeSource.originalArchivePath),
      storedArchivePath: safeText(safeSource.storedArchivePath),
      extractionRootPath: safeText(safeSource.extractionRootPath),
      effectiveRootPath: safeText(safeSource.effectiveRootPath || rootPath),
      archiveExtension: safeText(safeSource.archiveExtension).toLowerCase(),
      extractor: safeText(safeSource.extractor)
    };
  }

  function normalizeArrayOfObjects(value) {
    return Array.isArray(value)
      ? value.filter(function keep(item) {
          return item && typeof item === "object";
        })
      : [];
  }

  function normalizeScanResult(scanResult, fallbackType) {
    const type = normalizeType(
      scanResult && scanResult.type ? scanResult.type : fallbackType
    );
    const base = createEmptyScanResult(type, scanResult && scanResult.rootPath);

    if (!scanResult || typeof scanResult !== "object") {
      return base;
    }

    return {
      ...base,
      ...scanResult,
      ok: scanResult.ok === true,
      type: type,
      rootPath: safeText(scanResult.rootPath),
      rootName: safeText(scanResult.rootName),
      scannedAt: scanResult.scannedAt || null,
      folders: normalizeArrayOfObjects(scanResult.folders),
      files: normalizeArrayOfObjects(scanResult.files),
      summary: normalizeSummary(scanResult.summary),
      validation: normalizeValidation(scanResult.validation),
      source: normalizeSource(scanResult.source, scanResult.rootPath)
    };
  }

  window.ScanTypes = {
    VALID_TYPES: VALID_TYPES.slice(),
    VALID_SOURCE_KINDS: VALID_SOURCE_KINDS.slice(),
    REQUIRED_PROCESS_FOLDERS: REQUIRED_PROCESS_FOLDERS.slice(),
    safeText: safeText,
    normalizeType: normalizeType,
    normalizeSourceKind: normalizeSourceKind,
    isLoadedScanResult: isLoadedScanResult,
    createEmptyScanResult: createEmptyScanResult,
    formatBytes: formatBytes,
    formatDateTime: formatDateTime,
    normalizeSummary: normalizeSummary,
    normalizeValidation: normalizeValidation,
    normalizeSource: normalizeSource,
    normalizeScanResult: normalizeScanResult
  };
})(window);