"use strict";
/*
Nombre completo: institution.ipc.js
Ruta o ubicación: /core/ipc/institution.ipc.js
Función o funciones:
- Seleccionar la carpeta institucional sincronizada desde SharePoint/OneDrive
- Detectar automáticamente UGPA y UTET
- Auditar ambas unidades en una sola operación
- Persistir la raíz institucional y ambos resultados
*/

const { dialog, ipcMain } = require("electron");
const {
  detectInstitutionFolders,
  scanInstitutionRoot
} = require("../institution/institution.scan");
const historyStore = require("../history/history.store");

function safeText(value) {
  return String(value == null ? "" : value).trim();
}

function buildErrorResponse(error, fallbackMessage) {
  return {
    ok: false,
    error: error && error.message ? error.message : fallbackMessage
  };
}

function registerInstitutionIpc() {
  ipcMain.handle("institution:pick-root", async function onPickRoot() {
    try {
      const selection = await dialog.showOpenDialog({
        title: "Seleccionar carpeta institucional de ITSQMET",
        properties: ["openDirectory"]
      });

      if (selection.canceled || !selection.filePaths.length) {
        return {
          ok: false,
          cancelled: true
        };
      }

      const detection = await detectInstitutionFolders(selection.filePaths[0]);

      return {
        ok: true,
        rootPath: detection.rootPath,
        rootName: detection.rootName,
        detection: detection
      };
    } catch (error) {
      return buildErrorResponse(
        error,
        "No se pudo validar la carpeta institucional seleccionada."
      );
    }
  });

  ipcMain.handle(
    "institution:scan-root",
    async function onScanRoot(_event, payload = {}) {
      try {
        const rootPath = safeText(payload.rootPath);

        if (!rootPath) {
          throw new Error("No se recibió la carpeta institucional.");
        }

        const result = await scanInstitutionRoot(rootPath);
        const history = await historyStore.saveInstitutionAudit(
          result.rootPath,
          result.ugpaResult,
          result.utetResult
        );

        return {
          ok: true,
          rootPath: result.rootPath,
          rootName: result.rootName,
          detection: result.detection,
          ugpaResult: result.ugpaResult,
          utetResult: result.utetResult,
          history: history,
          historyFilePath: historyStore.getHistoryFilePath()
        };
      } catch (error) {
        return buildErrorResponse(
          error,
          "No se pudo completar la auditoría institucional."
        );
      }
    }
  );
}

module.exports = {
  registerInstitutionIpc
};
