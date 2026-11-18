"use strict";
const {ipcMain, dialog} = require("electron");
const {execFile} = require("child_process");
const path = require("path");

function run(operation, file, data = {}) {
  const python = process.env.AUDIT_PYTHON || (process.platform === "win32" ? "python" : "python3");
  return new Promise((resolve, reject) => {
    const child = execFile(python, [path.join(__dirname, "../drafts/document.py"), operation, file],
      {windowsHide:true, timeout:60000, maxBuffer:5000000, env:{...process.env,PYTHONIOENCODING:"utf-8"}},
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr.trim() || "Compruebe la instalación de Python para documentos."));
        try { resolve(JSON.parse(stdout)); } catch (err) { reject(err); }
      });
    child.stdin.on("error", reject);
    child.stdin.end(JSON.stringify(data));
  });
}
function registerDraftsIpc() {
  ipcMain.handle("drafts:reference", async () => {
    const picked = await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"Referencia",extensions:["docx","pdf"]}]});
    return picked.canceled ? null : run("read", picked.filePaths[0]);
  });
  ipcMain.handle("drafts:export", async (_, data) => {
    if (!data || typeof data.title !== "string" || !Array.isArray(data.sections) ||
        Buffer.byteLength(JSON.stringify(data)) > 1500000) throw new Error("Contenido de borrador no válido o demasiado extenso.");
    const result = await dialog.showSaveDialog({defaultPath:"Borrador - " + data.title.replace(/[<>:"/\\|?*\x00-\x1f]/g," ").slice(0,100) + ".docx",
      filters:[{name:"Documento Word",extensions:["docx"]}]});
    if (result.canceled) return false;
    if (path.extname(result.filePath).toLowerCase() !== ".docx") throw new Error("Seleccione un archivo .docx.");
    await run("write", result.filePath, data);
    return true;
  });
}
module.exports = {registerDraftsIpc};
