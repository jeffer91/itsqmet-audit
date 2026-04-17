"use strict";
/*
Nombre completo: export.ipc.js
Ruta o ubicación: /core/ipc/export.ipc.js
Función o funciones:
- Registrar el handler IPC de exportación PDF
- Generar el HTML del reporte
- Crear el PDF con BrowserWindow.printToPDF
- Guardar automáticamente el archivo final en Descargas
*/

const fsp = require("fs").promises;
const path = require("path");
const { app, ipcMain, BrowserWindow } = require("electron");
const { buildExportDocument } = require("./export.builder");

function sanitizeFileName(name, fallback) {
  return String(name || fallback || "audit_reporte")
    .replace(/\.(pdf)$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

async function ensureUniqueFilePath(targetPath) {
  const parsed = path.parse(targetPath);
  let candidate = targetPath;
  let counter = 2;

  while (true) {
    try {
      await fsp.access(candidate);
      candidate = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
      counter += 1;
    } catch (_error) {
      return candidate;
    }
  }
}

async function wait(ms) {
  await new Promise(function executor(resolve) {
    setTimeout(resolve, Number(ms || 0));
  });
}

async function printHtmlToPdf(html, outputPath) {
  const tempDir = app.getPath("temp");
  const tempFileName = `audit_export_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.html`;
  const tempHtmlPath = path.join(tempDir, tempFileName);

  let pdfWindow = null;

  try {
    await fsp.writeFile(tempHtmlPath, html, "utf8");

    pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: false
      }
    });

    await pdfWindow.loadFile(tempHtmlPath);
    await wait(250);

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: "A4",
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });

    await fsp.writeFile(outputPath, pdfBuffer);
  } finally {
    if (pdfWindow && !pdfWindow.isDestroyed()) {
      pdfWindow.destroy();
    }

    await fsp.unlink(tempHtmlPath).catch(function noop() {});
  }
}

async function exportPdf(payload) {
  const downloadsDir = app.getPath("downloads");
  const document = buildExportDocument(payload);
  const finalBaseName = `${sanitizeFileName(document.baseName, "audit_reporte")}.pdf`;
  const requestedPath = path.join(downloadsDir, finalBaseName);
  const outputPath = await ensureUniqueFilePath(requestedPath);

  await printHtmlToPdf(document.html, outputPath);

  return {
    ok: true,
    filePath: outputPath,
    fileName: path.basename(outputPath),
    downloadsDir: downloadsDir
  };
}

function registerExportIpc() {
  ipcMain.handle("pdf:export", async function onPdfExport(_event, payload = {}) {
    try {
      return await exportPdf(payload);
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : "No se pudo exportar el PDF."
      };
    }
  });
}

module.exports = {
  registerExportIpc
};