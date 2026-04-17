"use strict";
/*
Nombre completo: archive.extract.js
Ruta o ubicación: /core/archive/archive.extract.js
Función o funciones:
- Detectar y extraer ZIP o RAR
- Copiar el archivo importado a la carpeta de trabajo
- Resolver la raíz efectiva y lanzar el escaneo estándar
- Devolver un resultado listo para persistir en el historial
*/

const fsp = require("fs").promises;
const path = require("path");
const { execFile } = require("child_process");
const extractZip = require("extract-zip");
const { scanArchiveDirectory } = require("./archive.scan");
const {
  ensureValidType,
  safeText,
  sanitizeFileName,
  pathExists,
  ensureDirectory,
  ensureEmptyDirectory,
  ensureSupportedArchiveExtension,
  resolveEffectiveRoot
} = require("./archive.normalize");

function execFileAsync(file, args) {
  return new Promise(function executor(resolve, reject) {
    execFile(
      file,
      args,
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 32
      },
      function onComplete(error, stdout, stderr) {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({
          stdout: stdout,
          stderr: stderr
        });
      }
    );
  });
}

function getSevenZipCandidates() {
  const candidates = [
    process.env.SEVEN_ZIP_PATH,
    "7z",
    "7za",
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe"
  ];

  return candidates.filter(Boolean);
}

async function extractRarWith7Zip(archivePath, destinationPath) {
  const candidates = getSevenZipCandidates();
  let lastError = null;

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["x", "-y", `-o${destinationPath}`, archivePath]);
      return candidate;
    } catch (error) {
      lastError = error;
    }
  }

  const detail =
    lastError && lastError.message ? " Detalle: " + lastError.message : "";

  throw new Error(
    "No se pudo extraer el archivo RAR. Instale 7-Zip o defina SEVEN_ZIP_PATH." +
      detail
  );
}

async function extractArchive(archivePath, destinationPath, extension) {
  await ensureEmptyDirectory(destinationPath);

  if (extension === ".zip") {
    await extractZip(archivePath, { dir: destinationPath });
    return {
      extractor: "extract-zip"
    };
  }

  if (extension === ".rar") {
    const extractorBinary = await extractRarWith7Zip(archivePath, destinationPath);
    return {
      extractor: extractorBinary
    };
  }

  throw new Error("Extensión no soportada.");
}

async function copyArchiveToWorkspace(archivePath, workspaceRoot) {
  const sourceDir = path.join(workspaceRoot, "source");
  await ensureEmptyDirectory(sourceDir);

  const originalExtension = path.extname(archivePath);
  const extension = originalExtension.toLowerCase();
  const baseName =
    sanitizeFileName(path.basename(archivePath, originalExtension)) || "archivo";

  const targetPath = path.join(sourceDir, `${baseName}${extension}`);
  await fsp.copyFile(archivePath, targetPath);
  return targetPath;
}

async function importArchiveFile(params) {
  const safeParams = params && typeof params === "object" ? params : {};
  const type = ensureValidType(safeParams.type);
  const originalArchivePath = safeText(safeParams.archivePath);
  const workspaceRoot = safeText(safeParams.workspaceRoot);

  if (!originalArchivePath) {
    throw new Error("No se recibió la ruta del archivo comprimido.");
  }

  if (!workspaceRoot) {
    throw new Error("No se recibió la carpeta de trabajo de importación.");
  }

  if (!(await pathExists(originalArchivePath))) {
    throw new Error("El archivo comprimido no existe en el sistema.");
  }

  const extension = ensureSupportedArchiveExtension(originalArchivePath);
  await ensureDirectory(workspaceRoot);

  const storedArchivePath = await copyArchiveToWorkspace(
    originalArchivePath,
    workspaceRoot
  );

  const extractionRootPath = path.join(workspaceRoot, "current");
  const extractionInfo = await extractArchive(
    storedArchivePath,
    extractionRootPath,
    extension
  );

  const resolvedRoot = await resolveEffectiveRoot(extractionRootPath);

  return scanArchiveDirectory({
    type: type,
    rootPath: resolvedRoot.rootPath,
    directFolders: resolvedRoot.directFolders,
    validation: resolvedRoot.validation,
    originalArchivePath: originalArchivePath,
    storedArchivePath: storedArchivePath,
    extractionRootPath: extractionRootPath,
    archiveExtension: extension,
    extractor: extractionInfo.extractor
  });
}

module.exports = {
  importArchiveFile
};