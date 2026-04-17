"use strict";
/*
Nombre completo: shell.ipc.js
Ruta o ubicación: /core/ipc/shell.ipc.js
Función o funciones:
- Registrar el handler IPC para abrir rutas locales o enlaces web
- Detectar si el destino es URL o ruta del sistema
- Abrir ubicaciones de SharePoint con el navegador y rutas locales con el explorador
*/

const fs = require("fs");
const { ipcMain, shell } = require("electron");

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function registerShellIpc() {
  ipcMain.handle("shell:open-path", async (_event, payload = {}) => {
    try {
      const targetPath = String(payload.path || "").trim();

      if (!targetPath) {
        return {
          ok: false,
          error: "La ruta o enlace no es válido."
        };
      }

      if (isHttpUrl(targetPath)) {
        await shell.openExternal(targetPath);
        return {
          ok: true,
          path: targetPath,
          openedAs: "external-url"
        };
      }

      if (!fs.existsSync(targetPath)) {
        return {
          ok: false,
          error: "La ruta no existe en el sistema."
        };
      }

      const result = await shell.openPath(targetPath);
      if (result) {
        return {
          ok: false,
          error: result
        };
      }

      return {
        ok: true,
        path: targetPath,
        openedAs: "local-path"
      };
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : "No se pudo abrir la ruta."
      };
    }
  });
}

module.exports = {
  registerShellIpc
};