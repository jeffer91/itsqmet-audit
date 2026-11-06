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
// Límites configurables de defensa frente a archivos comprimidos excesivos.
const MAX_SOURCE_BYTES=Number(process.env.AUDIT_ARCHIVE_MAX_SOURCE_BYTES)||1024*1024*1024;
const MAX_EXPANDED_BYTES=Number(process.env.AUDIT_ARCHIVE_MAX_EXPANDED_BYTES)||4*1024*1024*1024;
const MAX_ENTRIES=Number(process.env.AUDIT_ARCHIVE_MAX_ENTRIES)||40000;
function validateArchiveLimits(entries,totalBytes){
  if(entries>MAX_ENTRIES)throw new Error("El archivo contiene demasiadas entradas (máximo "+MAX_ENTRIES+").");
  if(!Number.isFinite(totalBytes)||totalBytes>MAX_EXPANDED_BYTES)
    throw new Error("El contenido descomprimido supera el límite de seguridad.");
}
function readRarList(stdout){
  let entries=0,bytes=0;
  for(const line of stdout.split(/\r?\n/)){
    if(line.startsWith("Path = ")){entries++;validateArchiveLimits(entries,bytes);}
    const m=/^Size = (\d+)\s*$/.exec(line);
    if(m){bytes+=Number(m[1]);validateArchiveLimits(entries,bytes);}
  }
  if(!entries)throw new Error("No se pudo verificar el inventario interno del RAR.");
  return {entries,bytes};
}

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
        maxBuffer: 1024 * 1024 * 32,
        timeout: 600000
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
      const listing=await execFileAsync(candidate,["l","-slt","-ba",archivePath]);
      readRarList(listing.stdout);
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
    let entries=0,bytes=0;
    await extractZip(archivePath, {
      dir:destinationPath,
      onEntry(entry){
        entries++;
        bytes+=Number(entry.uncompressedSize||0);
        validateArchiveLimits(entries,bytes);
      }
    });
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
  const sourceStats=await fsp.stat(originalArchivePath);
  if(!sourceStats.isFile()||sourceStats.size>MAX_SOURCE_BYTES)
    throw new Error("El archivo comprimido supera el tamaño de entrada permitido.");
  await ensureDirectory(workspaceRoot);

  const generation = await fsp.mkdtemp(path.join(workspaceRoot, "import-"));
  try {
    const storedArchivePath = await copyArchiveToWorkspace(
      originalArchivePath,
      generation
    );

    const extractionRootPath = path.join(generation, "current");
    const extractionInfo = await extractArchive(
      storedArchivePath,
      extractionRootPath,
      extension
    );

    const resolvedRoot = await resolveEffectiveRoot(extractionRootPath);

    return await scanArchiveDirectory({
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
  } catch (error) {
    await fsp.rm(generation, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  importArchiveFile,
  validateArchiveLimits,
  readRarList
};