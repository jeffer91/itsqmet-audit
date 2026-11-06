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
const path = require("path");
const { ipcMain, shell, clipboard } = require("electron");
const historyStore = require("../history/history.store");

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}
function allowedName(name) {
  return name && name.length <= 180 && name !== "." && name !== ".." &&
    !/[\\/<>:"|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name);
}
const BLOCKED_EXTENSIONS=new Set([".exe",".msi",".com",".bat",".cmd",".ps1",".vbs",".wsf",".js",".jse",".scr",".hta",".lnk"]);
async function canOpenLocal(targetPath) {
  const realTarget=await fs.promises.realpath(targetPath);
  const stat=await fs.promises.stat(realTarget);
  if(stat.isFile()&&BLOCKED_EXTENSIONS.has(path.extname(realTarget).toLowerCase()))
    throw new Error("No se permite ejecutar programas desde AUDIT.");
  // Se permite abrir el historial incluso si su JSON está dañado.
  if(path.resolve(realTarget)===path.resolve(historyStore.getHistoryFilePath()))return true;
  const history=await historyStore.loadHistory();
  const roots=[
    history.ugpaSourcePath,history.utetSourcePath,
    history.ugpaResult&&history.ugpaResult.rootPath,
    history.utetResult&&history.utetResult.rootPath
  ].filter(Boolean);
  for(const root of roots){
    try{
      const actualRoot=await fs.promises.realpath(root);
      if(within(actualRoot,realTarget))return true;
    }catch(_error){/* Fuente desconectada: probar otras rutas autorizadas. */}
  }
  return false;
}
function registerShellIpc() {
  ipcMain.handle("shell:copy-text", async (_event, payload = {}) => {
    const value = String(payload.text || "");
    if (!value || value.length > 1000) return {ok:false,error:"Nombre no válido."};
    clipboard.writeText(value);
    return {ok:true};
  });
  ipcMain.handle("shell:create-folder", async (_event, payload = {}) => {
    try {
      const scope = String(payload.scope || "").toUpperCase();
      const parent = String(payload.parentPath || "").trim();
      const name = String(payload.name || "").trim();
      if (!["UGPA", "UTET"].includes(scope) || !path.isAbsolute(parent) || !allowedName(name))
        throw new Error("Parámetros de carpeta no válidos.");
      const history = await historyStore.loadHistory();
      const scan = scope === "UGPA" ? history.ugpaResult : history.utetResult;
      if (!scan || !scan.ok || !scan.source || scan.source.kind !== "folder")
        throw new Error("La creación solo está permitida en carpetas locales escaneadas.");
      const root = String(scan.source.selectedFolderPath || scan.rootPath || "");
      const actualRoot = await fs.promises.realpath(root);
      const actualParent = await fs.promises.realpath(parent);
      if (!within(actualRoot, actualParent) || actualParent === actualRoot)
        throw new Error("Destino fuera de la carpeta de procesos autorizada.");
      const destination = path.join(actualParent, name);
      if (!within(actualRoot, destination)) throw new Error("Destino no autorizado.");
      await fs.promises.mkdir(destination, {recursive:false});
      return {ok:true,path:destination};
    } catch (error) {
      return {ok:false,error:error && error.code === "EEXIST"
        ? "La carpeta ya existe. Verifica nombres equivalentes."
        : error && error.message || "No se pudo crear la carpeta."};
    }
  });
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

      if(!(await canOpenLocal(targetPath))){
        return {ok:false,error:"Solo se pueden abrir archivos del historial o fuentes institucionales seleccionadas."};
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