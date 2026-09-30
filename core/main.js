"use strict";
/*
Nombre completo: main.js
Ruta o ubicación: /core/main.js
Función o funciones:
- Registrar los IPC del proceso principal
- Crear la ventana principal de Electron
- Inicializar la auditoría institucional local de UGPA y UTET
*/

const path = require("path");
const { app, BrowserWindow } = require("electron");

const { registerExportIpc } = require("./ipc/export.ipc");
const { registerShellIpc } = require("./ipc/shell.ipc");
const { registerRulesIpc } = require("./ipc/rules.ipc");
const { registerArchiveIpc } = require("./ipc/archive.ipc");
const { registerHistoryIpc } = require("./ipc/history.ipc");

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(
    path.join(__dirname, "..", "screens", "scan", "scan.index.html")
  );

  mainWindow.once("ready-to-show", function onReadyToShow() {
    mainWindow.show();
  });

  mainWindow.on("closed", function onClosed() {
    mainWindow = null;
  });
}

function registerAppIpc() {
  registerArchiveIpc();
  registerHistoryIpc();
  registerExportIpc();
  registerShellIpc();
  registerRulesIpc();
}

app.whenReady().then(function onReady() {
  registerAppIpc();
  createMainWindow();

  app.on("activate", function onActivate() {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", function onWindowAllClosed() {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
