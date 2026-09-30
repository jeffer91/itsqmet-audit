"use strict";
/*
Nombre completo: preload.js
Ruta o ubicación: /core/preload.js
Función o funciones:
- Exponer un puente seguro entre Electron y el renderer
- Publicar la API de auditoría institucional
- Mantener compatibilidad con escaneo/importación legado, historial, PDF y reglas
*/

const { contextBridge, ipcRenderer } = require("electron");

function normalizeType(type) {
  return String(type == null ? "" : type).trim().toUpperCase();
}

function safeText(value) {
  return String(value == null ? "" : value).trim();
}

contextBridge.exposeInMainWorld("api", {
  archive: {
    pickFolder: function pickFolder(type) {
      return ipcRenderer.invoke("archive:pick-folder", {
        type: normalizeType(type)
      });
    },
    validateFolder: function validateFolder(type, folderPath) {
      return ipcRenderer.invoke("archive:validate-folder", {
        type: normalizeType(type),
        folderPath: safeText(folderPath)
      });
    },
    pickAndImport: function pickAndImport(type) {
      return ipcRenderer.invoke("archive:pick-and-import", {
        type: normalizeType(type)
      });
    },
    importFromPath: function importFromPath(type, archivePath) {
      return ipcRenderer.invoke("archive:import-from-path", {
        type: normalizeType(type),
        archivePath: safeText(archivePath)
      });
    },
    pickAndScanFolder: function pickAndScanFolder(type) {
      return ipcRenderer.invoke("archive:pick-and-scan-folder", {
        type: normalizeType(type)
      });
    },
    scanFolderFromPath: function scanFolderFromPath(type, folderPath) {
      return ipcRenderer.invoke("archive:scan-folder-from-path", {
        type: normalizeType(type),
        folderPath: safeText(folderPath)
      });
    }
  },
  history: {
    get: function get() {
      return ipcRenderer.invoke("history:get");
    },
    getFilePath: function getFilePath() {
      return ipcRenderer.invoke("history:get-file-path");
    },
    saveDiscardedFindings: function saveDiscardedFindings(entries) {
      return ipcRenderer.invoke("history:save-discarded-findings", {
        entries: Array.isArray(entries) ? entries : []
      });
    },
    clearScan: function clearScan(type) {
      return ipcRenderer.invoke("history:clear-scan", {
        type: normalizeType(type)
      });
    }
  },
  pdf: {
    export: function exportPdf(payload) {
      return ipcRenderer.invoke("pdf:export", payload);
    }
  },
  shell: {
    openPath: function openPath(targetPath) {
      return ipcRenderer.invoke("shell:open-path", {
        path: safeText(targetPath)
      });
    }
  },
  rules: {
    listFiles: function listFiles() {
      return ipcRenderer.invoke("rules:list-files");
    }
  }
});
