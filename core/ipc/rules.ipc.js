"use strict";
/*
Nombre completo: rules.ipc.js
Ruta o ubicación: /core/ipc/rules.ipc.js
Función o funciones:
- Registrar el handler IPC del módulo de reglas
- Entregar el listado normalizado de reglas disponibles
- Soportar reglas modulares por carpeta y reglas legadas planas
*/

const { ipcMain } = require("electron");
const { listRuleDescriptors } = require("./rules.registry");

function registerRulesIpc() {
  ipcMain.handle("rules:list-files", async () => {
    try {
      const files = await listRuleDescriptors();

      return {
        ok: true,
        files: files
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error && error.message
            ? error.message
            : "No se pudieron listar las reglas."
      };
    }
  });
}

module.exports = {
  registerRulesIpc
};