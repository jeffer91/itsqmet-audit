"use strict";
/*
Nombre completo: history.ipc.js
Ruta o ubicación: /core/ipc/history.ipc.js
Función o funciones:
- Registrar handlers IPC para historial
- Obtener historial y ruta del archivo JSON
- Guardar descartes
- Limpiar resultados de UGPA o UTET
*/

const { ipcMain } = require("electron");
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

function registerHistoryIpc() {
  ipcMain.handle("history:get", async function onHistoryGet() {
    try {
      const history = await historyStore.loadHistory();

      return {
        ok: true,
        history: history,
        historyFilePath: historyStore.getHistoryFilePath()
      };
    } catch (error) {
      return buildErrorResponse(error, "No se pudo cargar el historial.");
    }
  });

  ipcMain.handle("history:get-file-path", async function onHistoryGetFilePath() {
    try {
      return {
        ok: true,
        historyFilePath: historyStore.getHistoryFilePath()
      };
    } catch (error) {
      return buildErrorResponse(
        error,
        "No se pudo obtener la ruta del historial."
      );
    }
  });

  ipcMain.handle(
    "history:save-discarded-findings",
    async function onSaveDiscardedFindings(_event, payload = {}) {
      try {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        const history = await historyStore.saveDiscardedFindings(entries);

        return {
          ok: true,
          history: history,
          historyFilePath: historyStore.getHistoryFilePath()
        };
      } catch (error) {
        return buildErrorResponse(
          error,
          "No se pudieron guardar las novedades descartadas."
        );
      }
    }
  );

  ipcMain.handle("history:clear-scan", async function onClearScan(_event, payload = {}) {
    try {
      const type = safeText(payload.type).toUpperCase();
      const history = await historyStore.clearScanResult(type);

      return {
        ok: true,
        type: type,
        history: history,
        historyFilePath: historyStore.getHistoryFilePath()
      };
    } catch (error) {
      return buildErrorResponse(error, "No se pudo limpiar el escaneo.");
    }
  });
}

module.exports = {
  registerHistoryIpc
};