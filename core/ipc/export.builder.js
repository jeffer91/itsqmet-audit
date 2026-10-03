"use strict";
/*
Nombre completo: export.builder.js
Ruta o ubicación: /core/ipc/export.builder.js
Función o funciones:
- Construir el contenido HTML del reporte PDF
- Organizar portada, resumen, estructura jerárquica y detalle completo
- Preparar un nombre base de archivo para el PDF final
- Mostrar el origen del escaneo, sea carpeta local o archivo ZIP/RAR
*/

const path = require("path");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeType(type) {
  return String(type || "").trim().toUpperCase();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDateForFile(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(iso) {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-EC", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = size;
  let index = 0;

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function sanitizeFileToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeRelPath(value) {
  const raw = String(value || "").replace(/\\/g, "/").trim();
  if (!raw || raw === ".") return "";
  return raw.replace(/^\/+|\/+$/g, "");
}

function getParentRelPath(relPath) {
  const clean = normalizeRelPath(relPath);
  if (!clean) return "";
  const parent = path.posix.dirname(clean);
  return parent === "." ? "" : normalizeRelPath(parent);
}

function sortByRelPath(list, fieldName) {
  list.sort(function sort(left, right) {
    const a = String(left && left[fieldName] ? left[fieldName] : "");
    const b = String(right && right[fieldName] ? right[fieldName] : "");
    return a.localeCompare(b, "es", { sensitivity: "base" });
  });
}

function normalizeSource(source, rootPath) {
  const safeSource = source && typeof source === "object" ? source : {};
  const kind = String(safeSource.kind || "").trim().toLowerCase();
  const selectedFolderPath = String(safeSource.selectedFolderPath || "").trim();

  const normalizedKind =
    kind === "archive" || !selectedFolderPath ? "archive" : "folder";

  return {
    kind: normalizedKind,
    selectedFolderPath: selectedFolderPath,
    originalArchivePath: String(safeSource.originalArchivePath || "").trim(),
    storedArchivePath: String(safeSource.storedArchivePath || "").trim(),
    extractionRootPath: String(safeSource.extractionRootPath || "").trim(),
    effectiveRootPath: String(safeSource.effectiveRootPath || rootPath || "").trim(),
    archiveExtension: String(safeSource.archiveExtension || "").trim().toLowerCase(),
    extractor: String(safeSource.extractor || "").trim()
  };
}

function normalizeValidation(validation) {
  const safeValidation =
    validation && typeof validation === "object" ? validation : {};

  return {
    requiredProcessFolders: normalizeArray(safeValidation.requiredProcessFolders),
    foundProcessFolders: normalizeArray(safeValidation.foundProcessFolders),
    missingProcessFolders: normalizeArray(safeValidation.missingProcessFolders),
    hasAllRequiredFolders: safeValidation.hasAllRequiredFolders === true
  };
}

function normalizeScanData(scanData, fallbackType) {
  const safeType = normalizeType(
    scanData && scanData.type ? scanData.type : fallbackType
  );
  const safeRootPath = String(
    scanData && scanData.rootPath ? scanData.rootPath : ""
  ).trim();

  const safeRootName = String(
    scanData && scanData.rootName
      ? scanData.rootName
      : safeRootPath
      ? path.basename(safeRootPath)
      : safeType || "CARPETA"
  ).trim();

  return {
    ok: true,
    type: safeType,
    rootPath: safeRootPath,
    rootName: safeRootName,
    scannedAt: scanData && scanData.scannedAt ? String(scanData.scannedAt) : "",
    folders: normalizeArray(scanData && scanData.folders),
    files: normalizeArray(scanData && scanData.files),
    summary: {
      totalFolders: Number(
        scanData && scanData.summary && scanData.summary.totalFolders || 0
      ),
      totalFiles: Number(
        scanData && scanData.summary && scanData.summary.totalFiles || 0
      ),
      totalSizeBytes: Number(
        scanData && scanData.summary && scanData.summary.totalSizeBytes || 0
      ),
      byExtension:
        scanData &&
        scanData.summary &&
        scanData.summary.byExtension &&
        typeof scanData.summary.byExtension === "object"
          ? scanData.summary.byExtension
          : {}
    },
    validation: normalizeValidation(scanData && scanData.validation),
    source: normalizeSource(scanData && scanData.source, safeRootPath)
  };
}

function buildTreeModel(scanData) {
  const rootNode = {
    id: "",
    name: scanData.rootName,
    type: "folder",
    children: []
  };

  const folders = normalizeArray(scanData.folders).map(function mapFolder(item) {
    return {
      ...item,
      relativePath: normalizeRelPath(item.relativePath)
    };
  });

  const files = normalizeArray(scanData.files).map(function mapFile(item) {
    return {
      ...item,
      relativePath: normalizeRelPath(item.relativePath)
    };
  });

  sortByRelPath(folders, "relativePath");
  sortByRelPath(files, "relativePath");

  const folderMap = new Map();
  folderMap.set("", rootNode);

  folders.forEach(function eachFolder(folder) {
    const parts = normalizeRelPath(folder.relativePath).split("/").filter(Boolean);
    let currentKey = "";
    let currentNode = rootNode;

    parts.forEach(function eachPart(part) {
      const nextKey = currentKey ? `${currentKey}/${part}` : part;
      if (!folderMap.has(nextKey)) {
        const newNode = {
          id: nextKey,
          name: part,
          type: "folder",
          children: []
        };
        currentNode.children.push(newNode);
        folderMap.set(nextKey, newNode);
      }
      currentNode = folderMap.get(nextKey);
      currentKey = nextKey;
    });
  });

  files.forEach(function eachFile(file) {
    const parentKey = getParentRelPath(file.relativePath);
    const parentNode = folderMap.get(parentKey) || rootNode;

    parentNode.children.push({
      id: file.relativePath,
      name: file.name || path.posix.basename(file.relativePath),
      type: "file",
      sizeBytes: Number(file.sizeBytes || 0),
      modifiedAt: file.modifiedAt || "",
      extension: file.extension || "[sin extensión]",
      relativePath: file.relativePath
    });
  });

  function sortNode(node) {
    node.children.sort(function sortChildren(left, right) {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return String(left.name || "").localeCompare(String(right.name || ""), "es", {
        sensitivity: "base"
      });
    });

    node.children.forEach(function eachChild(child) {
      if (child.type === "folder") {
        sortNode(child);
      }
    });
  }

  sortNode(rootNode);
  return rootNode;
}

function buildTreeHtmlFromNode(node) {
  if (!node || !Array.isArray(node.children) || !node.children.length) {
    return '<p class="muted">No existen elementos para mostrar en el árbol.</p>';
  }

  function renderChildren(children) {
    const items = children
      .map(function mapChild(child) {
        if (child.type === "folder") {
          return `
            <li class="tree__item">
              <div class="tree__row tree__row--folder">
                <span class="tree__label">Carpeta</span>
                <span class="tree__name">${escapeHtml(child.name)}</span>
              </div>
              ${child.children && child.children.length ? renderChildren(child.children) : ""}
            </li>
          `;
        }

        return `
          <li class="tree__item">
            <div class="tree__row tree__row--file">
              <span class="tree__label">Archivo</span>
              <span class="tree__name">${escapeHtml(child.name)}</span>
              <span class="tree__meta">${escapeHtml(child.extension)} - ${escapeHtml(
            formatBytes(child.sizeBytes || 0)
          )}</span>
            </div>
          </li>
        `;
      })
      .join("");

    return `<ul class="tree">${items}</ul>`;
  }

  return `
    <div class="tree-root">
      <div class="tree-root__title">${escapeHtml(node.name)}</div>
      ${renderChildren(node.children)}
    </div>
  `;
}

function buildExtensionSummaryHtml(scanData) {
  const entries = Object.entries(scanData.summary.byExtension || {});
  if (!entries.length) {
    return '<p class="muted">No se registraron extensiones.</p>';
  }

  entries.sort(function sort(a, b) {
    return String(a[0]).localeCompare(String(b[0]), "es", {
      sensitivity: "base"
    });
  });

  const rows = entries
    .map(function mapEntry(entry) {
      return `
        <tr>
          <td>${escapeHtml(entry[0])}</td>
          <td class="center">${Number(entry[1] || 0)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="table table--compact">
      <thead>
        <tr>
          <th>Extensión</th>
          <th class="center">Cantidad</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildSourceHtml(scanData) {
  const source = scanData.source;
  const originLabel =
    source.kind === "folder" ? "Carpeta local" : "Archivo comprimido";

  const sourceRows = [];

  sourceRows.push(`
    <tr>
      <th>Origen</th>
      <td>${escapeHtml(originLabel)}</td>
    </tr>
  `);

  if (source.kind === "folder") {
    sourceRows.push(`
      <tr>
        <th>Carpeta seleccionada</th>
        <td>${escapeHtml(source.selectedFolderPath || "No disponible")}</td>
      </tr>
    `);
  } else {
    sourceRows.push(`
      <tr>
        <th>Archivo original</th>
        <td>${escapeHtml(source.originalArchivePath || "No disponible")}</td>
      </tr>
    `);

    sourceRows.push(`
      <tr>
        <th>Archivo almacenado</th>
        <td>${escapeHtml(source.storedArchivePath || "No disponible")}</td>
      </tr>
    `);

    sourceRows.push(`
      <tr>
        <th>Carpeta de extracción</th>
        <td>${escapeHtml(source.extractionRootPath || "No disponible")}</td>
      </tr>
    `);

    sourceRows.push(`
      <tr>
        <th>Extensión</th>
        <td>${escapeHtml(source.archiveExtension || "No disponible")}</td>
      </tr>
    `);

    sourceRows.push(`
      <tr>
        <th>Extractor</th>
        <td>${escapeHtml(source.extractor || "No disponible")}</td>
      </tr>
    `);
  }

  sourceRows.push(`
    <tr>
      <th>Raíz efectiva</th>
      <td>${escapeHtml(source.effectiveRootPath || scanData.rootPath || "")}</td>
    </tr>
  `);

  return `
    <section class="section">
      <h2 class="section__title">Origen del escaneo - ${escapeHtml(scanData.type)}</h2>
      <table class="table table--meta">
        <tbody>
          ${sourceRows.join("")}
        </tbody>
      </table>
    </section>
  `;
}

function buildValidationHtml(scanData) {
  const validation = scanData.validation || {};
  const found = normalizeArray(validation.foundProcessFolders);
  const missing = normalizeArray(validation.missingProcessFolders);

  const status = validation.hasAllRequiredFolders
    ? '<span class="pill pill--success">Estructura completa</span>'
    : '<span class="pill pill--warning">Estructura incompleta</span>';

  const foundHtml = found.length
    ? found.map(function mapItem(item) {
        return `<li>${escapeHtml(item)}</li>`;
      }).join("")
    : '<li class="muted">No se detectaron carpetas requeridas.</li>';

  const missingHtml = missing.length
    ? missing.map(function mapItem(item) {
        return `<li>${escapeHtml(item)}</li>`;
      }).join("")
    : '<li class="muted">No existen faltantes.</li>';

  return `
    <section class="section">
      <h2 class="section__title">Validación estructural - ${escapeHtml(scanData.type)}</h2>
      <div class="status-row">${status}</div>
      <div class="columns">
        <div class="panel">
          <h3 class="panel__title">Carpetas encontradas</h3>
          <ul class="list">
            ${foundHtml}
          </ul>
        </div>
        <div class="panel">
          <h3 class="panel__title">Carpetas faltantes</h3>
          <ul class="list">
            ${missingHtml}
          </ul>
        </div>
      </div>
    </section>
  `;
}

function buildFolderDetailHtml(scanData) {
  const folders = normalizeArray(scanData.folders).map(function mapFolder(item) {
    return {
      ...item,
      relativePath: normalizeRelPath(item.relativePath),
      path: String(item.path || "")
    };
  });

  const files = normalizeArray(scanData.files).map(function mapFile(item) {
    return {
      ...item,
      relativePath: normalizeRelPath(item.relativePath),
      extension: item.extension || "[sin extensión]",
      sizeBytes: Number(item.sizeBytes || 0)
    };
  });

  sortByRelPath(folders, "relativePath");
  sortByRelPath(files, "relativePath");

  const sections = [];
  const allFolderRows = [
    {
      relativePath: "",
      path: scanData.rootPath,
      name: scanData.rootName
    }
  ].concat(folders);

  allFolderRows.forEach(function eachFolder(folder) {
    const currentRel = normalizeRelPath(folder.relativePath);

    const directSubfolders = folders.filter(function keep(item) {
      return getParentRelPath(item.relativePath) === currentRel;
    });

    const directFiles = files.filter(function keep(item) {
      return getParentRelPath(item.relativePath) === currentRel;
    });

    const folderTitle = currentRel
      ? `${scanData.rootName}/${currentRel}`
      : scanData.rootName;

    const subfolderHtml = directSubfolders.length
      ? `
        <table class="table table--compact">
          <thead>
            <tr>
              <th>Subcarpeta</th>
              <th>Ruta relativa</th>
              <th>Última modificación</th>
            </tr>
          </thead>
          <tbody>
            ${directSubfolders
              .map(function mapItem(item) {
                return `
                  <tr>
                    <td>${escapeHtml(item.name || path.posix.basename(item.relativePath))}</td>
                    <td>${escapeHtml(item.relativePath)}</td>
                    <td>${escapeHtml(formatDateTime(item.modifiedAt))}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `
      : '<p class="muted">No contiene subcarpetas directas.</p>';

    const filesHtml = directFiles.length
      ? `
        <table class="table">
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Extensión</th>
              <th class="center">Tamaño</th>
              <th>Ruta relativa</th>
              <th>Última modificación</th>
            </tr>
          </thead>
          <tbody>
            ${directFiles
              .map(function mapItem(item) {
                return `
                  <tr>
                    <td>${escapeHtml(item.name || path.posix.basename(item.relativePath))}</td>
                    <td>${escapeHtml(item.extension)}</td>
                    <td class="center">${escapeHtml(formatBytes(item.sizeBytes))}</td>
                    <td>${escapeHtml(item.relativePath)}</td>
                    <td>${escapeHtml(formatDateTime(item.modifiedAt))}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `
      : '<p class="muted">No contiene archivos directos.</p>';

    sections.push(`
      <section class="section avoid-break">
        <h3 class="section__title section__title--small">${escapeHtml(folderTitle)}</h3>
        <p class="section__path"><strong>Ruta absoluta:</strong> ${escapeHtml(
          folder.path || scanData.rootPath || ""
        )}</p>
        <div class="block">
          <h4 class="block__title">Subcarpetas directas</h4>
          ${subfolderHtml}
        </div>
        <div class="block">
          <h4 class="block__title">Archivos directos</h4>
          ${filesHtml}
        </div>
      </section>
    `);
  });

  return sections.join("");
}

function buildFullInventoryHtml(scanData) {
  const files = normalizeArray(scanData.files).map(function mapFile(item) {
    return {
      ...item,
      relativePath: normalizeRelPath(item.relativePath),
      extension: item.extension || "[sin extensión]",
      sizeBytes: Number(item.sizeBytes || 0)
    };
  });

  sortByRelPath(files, "relativePath");

  if (!files.length) {
    return '<p class="muted">No existen archivos registrados.</p>';
  }

  const rows = files
    .map(function mapItem(item) {
      return `
        <tr>
          <td>${escapeHtml(item.name || path.posix.basename(item.relativePath))}</td>
          <td>${escapeHtml(item.extension)}</td>
          <td class="center">${escapeHtml(formatBytes(item.sizeBytes))}</td>
          <td>${escapeHtml(item.relativePath)}</td>
          <td>${escapeHtml(formatDateTime(item.modifiedAt))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="table">
      <thead>
        <tr>
          <th>Archivo</th>
          <th>Extensión</th>
          <th class="center">Tamaño</th>
          <th>Ruta relativa</th>
          <th>Última modificación</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildItemOverviewHtml(scanData) {
  return `
    <section class="section">
      <h2 class="section__title">Resumen general - ${escapeHtml(scanData.type)}</h2>
      <div class="kpis">
        <div class="kpi">
          <div class="kpi__label">Carpeta raíz</div>
          <div class="kpi__value kpi__value--small">${escapeHtml(scanData.rootName)}</div>
        </div>
        <div class="kpi">
          <div class="kpi__label">Subcarpetas</div>
          <div class="kpi__value">${scanData.summary.totalFolders}</div>
        </div>
        <div class="kpi">
          <div class="kpi__label">Archivos</div>
          <div class="kpi__value">${scanData.summary.totalFiles}</div>
        </div>
        <div class="kpi">
          <div class="kpi__label">Peso total</div>
          <div class="kpi__value">${escapeHtml(formatBytes(scanData.summary.totalSizeBytes))}</div>
        </div>
      </div>

      <table class="table table--meta">
        <tbody>
          <tr>
            <th>Tipo</th>
            <td>${escapeHtml(scanData.type)}</td>
          </tr>
          <tr>
            <th>Ruta raíz</th>
            <td>${escapeHtml(scanData.rootPath)}</td>
          </tr>
          <tr>
            <th>Fecha de escaneo</th>
            <td>${escapeHtml(formatDateTime(scanData.scannedAt))}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2 class="section__title">Distribución por extensión - ${escapeHtml(scanData.type)}</h2>
      ${buildExtensionSummaryHtml(scanData)}
    </section>
  `;
}

function buildComparativeOverviewHtml(items) {
  const rows = items
    .map(function mapItem(scanData) {
      return `
        <tr>
          <td>${escapeHtml(scanData.type)}</td>
          <td>${escapeHtml(scanData.rootName)}</td>
          <td class="center">${scanData.summary.totalFolders}</td>
          <td class="center">${scanData.summary.totalFiles}</td>
          <td class="center">${escapeHtml(formatBytes(scanData.summary.totalSizeBytes))}</td>
          <td>${escapeHtml(formatDateTime(scanData.scannedAt))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="section">
      <h2 class="section__title">Resumen comparativo</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Carpeta raíz</th>
            <th class="center">Subcarpetas</th>
            <th class="center">Archivos</th>
            <th class="center">Peso total</th>
            <th>Fecha de escaneo</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  `;
}

function buildItemSectionHtml(scanData) {
  const treeModel = buildTreeModel(scanData);

  return `
    <section class="page-break-before">
      <div class="chapter-tag">${escapeHtml(scanData.type)}</div>
      <h1 class="chapter-title">${escapeHtml(scanData.rootName)}</h1>
      <p class="chapter-subtitle">${escapeHtml(scanData.rootPath)}</p>
    </section>

    ${buildItemOverviewHtml(scanData)}
    ${buildSourceHtml(scanData)}
    ${buildValidationHtml(scanData)}

    <section class="section">
      <h2 class="section__title">Estructura jerárquica completa - ${escapeHtml(scanData.type)}</h2>
      ${buildTreeHtmlFromNode(treeModel)}
    </section>

    <section class="section">
      <h2 class="section__title">Detalle por carpeta - ${escapeHtml(scanData.type)}</h2>
      ${buildFolderDetailHtml(scanData)}
    </section>

    <section class="section">
      <h2 class="section__title">Inventario completo de archivos - ${escapeHtml(scanData.type)}</h2>
      ${buildFullInventoryHtml(scanData)}
    </section>
  `;
}

function buildDocumentHtml(payload, items, todayLabel) {
  const folderNames = items
    .map(function mapItem(item) {
      return item.rootName;
    })
    .filter(Boolean)
    .join(" + ");

  const modeLabel = payload.mode === "both" ? "UGPA y UTET" : items[0].type;

  const coverSummary = items
    .map(function mapItem(item) {
      const sourceLabel =
        item.source.kind === "folder" ? "Carpeta local" : "Archivo comprimido";

      return `
        <tr>
          <td>${escapeHtml(item.type)}</td>
          <td>${escapeHtml(item.rootName)}</td>
          <td>${escapeHtml(sourceLabel)}</td>
          <td class="center">${item.summary.totalFolders}</td>
          <td class="center">${item.summary.totalFiles}</td>
          <td class="center">${escapeHtml(formatBytes(item.summary.totalSizeBytes))}</td>
        </tr>
      `;
    })
    .join("");

  const comparativeHtml =
    payload.mode === "both" ? buildComparativeOverviewHtml(items) : "";

  const bodySections = items
    .map(function mapItem(item) {
      return buildItemSectionHtml(item);
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte de auditoría</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 12mm 16mm 12mm;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      color: #132238;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.8px;
      line-height: 1.45;
      background: #ffffff;
    }
    h1, h2, h3, h4 {
      margin: 0;
      color: #10233a;
    }
    p {
      margin: 0 0 10px;
    }
    .cover {
      min-height: 250px;
      padding: 10px 4px 8px;
      border-bottom: 2px solid #d8e3f3;
      margin-bottom: 18px;
    }
    .cover__eyebrow {
      color: #2463eb;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .cover__title {
      font-size: 26px;
      line-height: 1.15;
      margin-bottom: 8px;
    }
    .cover__subtitle {
      font-size: 13px;
      color: #58708f;
      margin-bottom: 18px;
    }
    .cover__meta {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
    }
    .cover__meta th,
    .cover__meta td {
      text-align: left;
      border: 1px solid #dbe4f0;
      padding: 8px 10px;
      vertical-align: middle;
    }
    .cover__meta th {
      width: 180px;
      background: #f4f8ff;
      font-weight: 700;
    }
    .section {
      margin-top: 18px;
    }
    .section__title {
      font-size: 16px;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #dbe4f0;
    }
    .section__title--small {
      font-size: 13px;
    }
    .section__path {
      color: #445a75;
      margin-bottom: 10px;
      word-break: break-word;
    }
    .chapter-tag {
      display: inline-block;
      padding: 5px 10px;
      border-radius: 999px;
      background: #edf4ff;
      color: #1748b4;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .chapter-title {
      font-size: 24px;
      line-height: 1.15;
      margin-bottom: 6px;
    }
    .chapter-subtitle {
      color: #58708f;
      margin-bottom: 8px;
      word-break: break-word;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .kpi {
      border: 1px solid #dbe4f0;
      border-radius: 10px;
      padding: 10px;
      background: #f8fbff;
      min-height: 72px;
    }
    .kpi__label {
      font-size: 10px;
      color: #58708f;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 6px;
    }
    .kpi__value {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
      word-break: break-word;
    }
    .kpi__value--small {
      font-size: 14px;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      table-layout: fixed;
    }
    .table th,
    .table td {
      border: 1px solid #dbe4f0;
      padding: 8px 10px;
      vertical-align: middle;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .table th {
      background: #f4f8ff;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: left;
    }
    .table td {
      font-size: 10.3px;
    }
    .table--compact th,
    .table--compact td {
      padding: 7px 9px;
    }
    .table--meta {
      table-layout: auto;
    }
    .center {
      text-align: center;
    }
    .muted {
      color: #6c8098;
    }
    .block {
      margin-top: 12px;
    }
    .block__title {
      font-size: 13px;
      margin-bottom: 8px;
      color: #17375d;
    }
    .tree-root {
      border: 1px solid #dbe4f0;
      border-radius: 12px;
      padding: 12px 14px;
      background: #fbfdff;
    }
    .tree-root__title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 10px;
      color: #17375d;
    }
    .tree {
      list-style: none;
      margin: 0;
      padding-left: 18px;
    }
    .tree__item {
      margin: 6px 0;
      padding-left: 8px;
      border-left: 1px solid #dbe4f0;
    }
    .tree__row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-height: 22px;
    }
    .tree__row--folder .tree__name {
      font-weight: 700;
      color: #17375d;
    }
    .tree__row--file .tree__name {
      color: #22364f;
    }
    .tree__label {
      display: inline-block;
      min-width: 58px;
      padding: 2px 8px;
      border-radius: 999px;
      background: #eef4ff;
      color: #2463eb;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .tree__meta {
      color: #6c8098;
      font-size: 10px;
    }
    .page-break-before {
      page-break-before: always;
      break-before: page;
    }
    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .status-row {
      margin-bottom: 12px;
    }
    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .pill--success {
      background: rgba(6, 118, 71, 0.12);
      color: #067647;
    }
    .pill--warning {
      background: rgba(181, 71, 8, 0.12);
      color: #b54708;
    }
    .columns {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .panel {
      border: 1px solid #dbe4f0;
      border-radius: 12px;
      padding: 12px;
      background: #fbfdff;
    }
    .panel__title {
      font-size: 13px;
      margin-bottom: 8px;
      color: #17375d;
    }
    .list {
      margin: 0;
      padding-left: 18px;
    }
    .list li {
      margin-bottom: 6px;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="cover__eyebrow">Reporte de auditoría</div>
    <h1 class="cover__title">Estructura completa de carpetas y archivos</h1>
    <p class="cover__subtitle">
      Documento generado automáticamente para mostrar la organización completa,
      el contenido y el detalle estructural de ${escapeHtml(modeLabel)}.
    </p>
    <table class="cover__meta">
      <tbody>
        <tr>
          <th>Modo de exportación</th>
          <td>${escapeHtml(payload.mode === "both" ? "Ambas carpetas" : "Carpeta individual")}</td>
        </tr>
        <tr>
          <th>Carpetas incluidas</th>
          <td>${escapeHtml(folderNames)}</td>
        </tr>
        <tr>
          <th>Fecha del reporte</th>
          <td>${escapeHtml(todayLabel)}</td>
        </tr>
      </tbody>
    </table>
    <section class="section">
      <h2 class="section__title">Resumen de carpetas incluidas</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Carpeta raíz</th>
            <th>Origen</th>
            <th class="center">Subcarpetas</th>
            <th class="center">Archivos</th>
            <th class="center">Peso total</th>
          </tr>
        </thead>
        <tbody>
          ${coverSummary}
        </tbody>
      </table>
    </section>
  </section>
  ${comparativeHtml}
  ${bodySections}
</body>
</html>
  `;
}


function buildPriorityDocument(payload) {
  const now = new Date();
  const todayForFile = formatDateForFile(now);
  const todayLabel = now.toLocaleDateString("es-EC", {
    year: "numeric", month: "2-digit", day: "2-digit"
  });
  const tasks = normalizeArray(payload && payload.tasks);
  const issues = normalizeArray(payload && payload.inconsistencies);
  if (!tasks.length) {
    throw new Error("No hay pendientes de priorización para exportar.");
  }

  const priorityOrder = { max: 4, high: 3, medium: 2, low: 1 };
  const priorityLabel = { max: "Máxima", high: "Alta", medium: "Media", low: "Baja" };
  const sorted = tasks.slice().sort(function sort(a, b) {
    return (priorityOrder[b && b.level] || 0) - (priorityOrder[a && a.level] || 0);
  });

  const rows = sorted.map(function mapTask(task, index) {
    const process = task && task.processNumber
      ? String(task.scope || "") + "-PRO-" + String(task.processNumber)
      : String(task && task.scope || "");
    const dueDate = task && task.dueDate ? new Date(task.dueDate) : null;
    const dueLabel = dueDate && !Number.isNaN(dueDate.getTime())
      ? dueDate.toLocaleDateString("es-EC", { year: "numeric", month: "2-digit", day: "2-digit" })
      : "";
    return `
      <tr>
        <td class="center">${index + 1}</td>
        <td><span class="priority priority--${escapeHtml(task.level || "low")}">${escapeHtml(priorityLabel[task.level] || task.level || "")}</span></td>
        <td><strong>${escapeHtml(process)}</strong><br><span class="muted">${escapeHtml(task.areaLabel || "")}</span></td>
        <td><strong>${escapeHtml(task.title || "")}</strong><br><span class="muted">${escapeHtml(task.processName || "")}</span></td>
        <td>${escapeHtml(task.periodLabel || "Sin período")}</td>
        <td>${escapeHtml(task.stageLabel || "")}${dueLabel ? "<br><span class=\"muted\">Ref.: " + escapeHtml(dueLabel) + "</span>" : ""}</td>
        <td>${escapeHtml(task.reason || "")}</td>
        <td class="path">${escapeHtml(task.pathLabel || "")}</td>
      </tr>
    `;
  }).join("");

  const issueRows = issues.map(function mapIssue(issue) {
    return `
      <tr>
        <td>${escapeHtml(issue.scope || "")}</td>
        <td><strong>${Number(issue.groupCount || 1)} × ${escapeHtml(issue.title || "")}</strong></td>
        <td>${escapeHtml(issue.description || "")}</td>
        <td class="path">${escapeHtml((issue.examples && issue.examples[0]) || issue.pathLabel || "")}</td>
      </tr>
    `;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Plan de prioridades AUDIT</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #16263a; font-family: Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.35; }
h1,h2 { margin: 0; color: #173b64; }
.header { border-bottom: 2px solid #2f6fed; padding-bottom: 10px; margin-bottom: 12px; }
.eyebrow { color: #2f6fed; font-size: 10px; font-weight: 800; text-transform: uppercase; }
.header h1 { font-size: 22px; margin-top: 3px; }
.header p { margin: 4px 0 0; color: #66798f; }
.kpis { display: grid; grid-template-columns: repeat(5,1fr); gap: 7px; margin: 10px 0 14px; }
.kpi { border: 1px solid #d9e2ec; border-radius: 8px; padding: 8px; background: #f8fbff; }
.kpi span { color: #66798f; font-size: 8px; text-transform: uppercase; }
.kpi strong { display: block; margin-top: 2px; font-size: 16px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 7px; }
th,td { border: 1px solid #d9e2ec; padding: 6px; vertical-align: top; overflow-wrap: anywhere; }
th { background: #eef4ff; color: #173b64; font-size: 8px; text-transform: uppercase; text-align: left; }
.center { text-align: center; }
.muted { color: #66798f; }
.path { color: #526a83; font-size: 8px; }
.priority { display: inline-block; padding: 3px 6px; border-radius: 999px; font-weight: 800; }
.priority--max { background: #fde9e7; color: #9f2018; }
.priority--high { background: #fff0dc; color: #9a5d00; }
.priority--medium { background: #eaf1ff; color: #245fcf; }
.priority--low { background: #edf2f7; color: #536b83; }
.section { margin-top: 14px; }
.note { margin-top: 10px; padding: 8px; background: #fff8e8; border: 1px solid #efd28c; border-radius: 8px; }
</style>
</head>
<body>
<section class="header">
  <div class="eyebrow">AUDIT · Plan operativo</div>
  <h1>Qué tengo que hacer primero</h1>
  <p>Generado el ${escapeHtml(todayLabel)}. Ordenado por urgencia, jerarquía del proceso y esfuerzo.</p>
</section>
<section class="kpis">
  <div class="kpi"><span>Máxima</span><strong>${Number(payload.counts && payload.counts.max || 0)}</strong></div>
  <div class="kpi"><span>Alta</span><strong>${Number(payload.counts && payload.counts.high || 0)}</strong></div>
  <div class="kpi"><span>Media</span><strong>${Number(payload.counts && payload.counts.medium || 0)}</strong></div>
  <div class="kpi"><span>Baja</span><strong>${Number(payload.counts && payload.counts.low || 0)}</strong></div>
  <div class="kpi"><span>Inconsistencias</span><strong>${Number(payload.rawInconsistenciesCount || 0)}</strong></div>
</section>
<section>
  <h2>Pendientes priorizados</h2>
  <table>
    <thead><tr>
      <th style="width:4%">#</th><th style="width:7%">Prioridad</th><th style="width:10%">Proceso</th>
      <th style="width:19%">Qué hacer</th><th style="width:11%">Período</th><th style="width:8%">Etapa</th>
      <th style="width:23%">Por qué</th><th style="width:18%">Ubicación</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>
${issueRows ? `
<section class="section">
  <h2>Inconsistencias agrupadas para revisión</h2>
  <div class="note">Estas observaciones no se mezclan con la lista de trabajo prioritario. Se agrupan para evitar cientos de filas repetidas.</div>
  <table>
    <thead><tr><th style="width:8%">Unidad</th><th style="width:27%">Grupo</th><th style="width:40%">Descripción</th><th style="width:25%">Ejemplo</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
</section>` : ""}
</body>
</html>`;

  return {
    baseName: "audit_prioridades_" + todayForFile,
    html: html
  };
}

function buildExportDocument(payload) {
  const today = new Date();
  const todayForFile = formatDateForFile(today);
  const todayLabel = today.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  if (!payload || typeof payload !== "object") {
    throw new Error("No se recibió información para exportar.");
  }

  const mode = String(payload.mode || "").trim().toLowerCase();
  if (mode === "priority") {
    return buildPriorityDocument(payload);
  }
  let items = [];

  if (mode === "single") {
    if (!payload.scanData || typeof payload.scanData !== "object") {
      throw new Error("No existe información de escaneo para exportar.");
    }

    items = [
      normalizeScanData(payload.scanData, payload.type || payload.scanData.type)
    ];
  } else if (mode === "both") {
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    items = rawItems
      .filter(function keep(item) {
        return item && item.scanData && typeof item.scanData === "object";
      })
      .map(function mapItem(item) {
        return normalizeScanData(
          item.scanData,
          item.type || item.scanData.type
        );
      });
  } else {
    throw new Error("Modo de exportación no válido.");
  }

  if (!items.length) {
    throw new Error("No hay resultados escaneados disponibles para exportar.");
  }

  const combinedNames = items
    .map(function mapItem(item) {
      return sanitizeFileToken(item.rootName || item.type || "carpeta");
    })
    .filter(Boolean)
    .join("_");

  const baseName = `audit_${combinedNames || "reporte"}_${todayForFile}`;
  const html = buildDocumentHtml({ mode: mode }, items, todayLabel);

  return {
    baseName,
    html
  };
}

module.exports = {
  buildExportDocument
};