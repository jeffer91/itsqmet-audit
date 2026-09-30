"use strict";
/*
Nombre completo: archive.ipc.js
Ruta o ubicación: /core/ipc/archive.ipc.js
Función o funciones:
- Registrar los handlers IPC para carpeta local y archivos ZIP/RAR
- Permitir seleccionar archivo comprimido o carpeta para UGPA o UTET
- Escanear, persistir en historial JSON y devolver una respuesta uniforme
*/

const path = require("path");
const { app, dialog, ipcMain } = require("electron");
const { importArchiveFile } = require("../archive/archive.extract");
const { scanFolderDirectory } = require("../archive/archive.scan");
const {
  readSubdirectories,
  validateTopLevelProcessFolders
} = require("../archive/archive.normalize");
const historyStore = require("../history/history.store");

const VALID_TYPES = new Set(["UGPA", "UTET"]);

function safeText(value) {
  return String(value == null ? "" : value).trim();
}

function ensureValidType(type) {
  const safeType = safeText(type).toUpperCase();

  if (!VALID_TYPES.has(safeType)) {
    throw new Error("Tipo de operación no válido. Use UGPA o UTET.");
  }

  return safeType;
}

function buildArchiveDialogTitle(type) {
  return type === "UGPA"
    ? "Seleccionar archivo ZIP/RAR de UGPA"
    : "Seleccionar archivo ZIP/RAR de UTET";
}

function buildFolderDialogTitle(type) {
  return type === "UGPA"
    ? "Seleccionar carpeta de UGPA"
    : "Seleccionar carpeta de UTET";
}

function buildWorkspaceRoot(type) {
  return path.join(app.getPath("userData"), "imports", safeText(type).toLowerCase());
}

function buildCancelledResponse(type) {
  return {
    ok: false,
    cancelled: true,
    type: type
  };
}

function buildErrorResponse(error, fallbackMessage) {
  return {
    ok: false,
    error: error && error.message ? error.message : fallbackMessage
  };
}

async function buildPersistedResponse(type, result) {
  await historyStore.upsertScanResult(type, result);
  const history = await historyStore.loadHistory();

  return {
    ok: true,
    type: type,
    result: result,
    history: history,
    historyFilePath: historyStore.getHistoryFilePath()
  };
}

async function runArchiveImport(type, archivePath) {
  const safeType = ensureValidType(type);
  const safeArchivePath = safeText(archivePath);

  if (!safeArchivePath) {
    throw new Error("No se recibió la ruta del archivo comprimido.");
  }

  const result = await importArchiveFile({
    type: safeType,
    archivePath: safeArchivePath,
    workspaceRoot: buildWorkspaceRoot(safeType)
  });

  return buildPersistedResponse(safeType, result);
}

async function runFolderScan(type, folderPath) {
  const safeType = ensureValidType(type);
  const safeFolderPath = safeText(folderPath);

  if (!safeFolderPath) {
    throw new Error("No se recibió la carpeta a escanear.");
  }

  const result = await scanFolderDirectory({
    type: safeType,
    folderPath: safeFolderPath,
    preserveRoot: true
  });

  return buildPersistedResponse(safeType, result);
}


async function validateFolderSelection(type, folderPath) {
  const safeType = ensureValidType(type);
  const safeFolderPath = safeText(folderPath);

  if (!safeFolderPath) {
    throw new Error("No se recibió la carpeta a validar.");
  }

  const directFolders = await readSubdirectories(safeFolderPath);
  const validation = validateTopLevelProcessFolders(directFolders);
  const history = await historyStore.setSourcePath(safeType, safeFolderPath);

  return {
    ok: true,
    type: safeType,
    sourcePath: safeFolderPath,
    validation: validation,
    history: history,
    historyFilePath: historyStore.getHistoryFilePath()
  };
}

function registerArchiveIpc() {

  ipcMain.handle(
    "archive:pick-folder",
    async function onPickFolder(_event, payload = {}) {
      try {
        const type = ensureValidType(payload.type);
        const selection = await dialog.showOpenDialog({
          title: buildFolderDialogTitle(type),
          properties: ["openDirectory", "dontAddToRecent"]
        });

        if (
          selection.canceled ||
          !Array.isArray(selection.filePaths) ||
          !selection.filePaths.length
        ) {
          return buildCancelledResponse(type);
        }

        return await validateFolderSelection(type, selection.filePaths[0]);
      } catch (error) {
        return buildErrorResponse(error, "No se pudo validar la carpeta seleccionada.");
      }
    }
  );

  ipcMain.handle(
    "archive:validate-folder",
    async function onValidateFolder(_event, payload = {}) {
      try {
        return await validateFolderSelection(payload.type, payload.folderPath);
      } catch (error) {
        return buildErrorResponse(error, "No se pudo validar la carpeta.");
      }
    }
  );

  ipcMain.handle(
    "archive:pick-and-import",
    async function onPickAndImport(_event, payload = {}) {
      try {
        const type = ensureValidType(payload.type);

        const selection = await dialog.showOpenDialog({
          title: buildArchiveDialogTitle(type),
          properties: ["openFile"],
          filters: [
            {
              name: "Archivos comprimidos",
              extensions: ["zip", "rar"]
            }
          ]
        });

        if (
          selection.canceled ||
          !Array.isArray(selection.filePaths) ||
          !selection.filePaths.length
        ) {
          return buildCancelledResponse(type);
        }

        return await runArchiveImport(type, selection.filePaths[0]);
      } catch (error) {
        return buildErrorResponse(
          error,
          "No se pudo importar el archivo comprimido."
        );
      }
    }
  );

  ipcMain.handle(
    "archive:import-from-path",
    async function onImportFromPath(_event, payload = {}) {
      try {
        const type = ensureValidType(payload.type);
        const archivePath = safeText(payload.archivePath);
        return await runArchiveImport(type, archivePath);
      } catch (error) {
        return buildErrorResponse(
          error,
          "No se pudo importar el archivo comprimido."
        );
      }
    }
  );

  ipcMain.handle(
    "archive:pick-and-scan-folder",
    async function onPickAndScanFolder(_event, payload = {}) {
      try {
        const type = ensureValidType(payload.type);

        const selection = await dialog.showOpenDialog({
          title: buildFolderDialogTitle(type),
          properties: ["openDirectory", "dontAddToRecent"]
        });

        if (
          selection.canceled ||
          !Array.isArray(selection.filePaths) ||
          !selection.filePaths.length
        ) {
          return buildCancelledResponse(type);
        }

        return await runFolderScan(type, selection.filePaths[0]);
      } catch (error) {
        return buildErrorResponse(error, "No se pudo escanear la carpeta.");
      }
    }
  );

  ipcMain.handle(
    "archive:scan-folder-from-path",
    async function onScanFolderFromPath(_event, payload = {}) {
      try {
        const type = ensureValidType(payload.type);
        const folderPath = safeText(payload.folderPath);
        return await runFolderScan(type, folderPath);
      } catch (error) {
        return buildErrorResponse(error, "No se pudo escanear la carpeta.");
      }
    }
  );
}

module.exports = {
  registerArchiveIpc
};