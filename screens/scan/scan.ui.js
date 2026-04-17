(function (window, document) {
  "use strict";
  /*
  Nombre completo: scan.ui.js
  Ruta o ubicación: /screens/scan/scan.ui.js
  Función o funciones:
  - Renderizar la interfaz de la pantalla Escaneo
  - Dibujar resumen global, tarjetas UGPA/UTET, historial y exportación
  - Conectar acciones nuevas de escaneo por carpeta sin romper la pantalla actual
  */

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function renderGlobalMessage(message) {
    const host = getElement("globalMessage");
    if (!host) return;

    const text = safeText(message && message.text);
    const type = safeText(message && message.type) || "neutral";

    if (!text) {
      host.className = "global-message";
      host.innerHTML = "";
      return;
    }

    host.className = `global-message is-visible is-${escapeHtml(type)}`;
    host.textContent = text;
  }

  function renderSummaryGrid(cards) {
    const host = getElement("summaryGrid");
    if (!host) return;

    const safeCards = Array.isArray(cards) ? cards : [];
    host.innerHTML = safeCards.map(function mapCard(card) {
      return `
        <article class="summary-card">
          <div class="summary-card__label">${escapeHtml(card.label)}</div>
          <div class="summary-card__value">${escapeHtml(card.value)}</div>
        </article>
      `;
    }).join("");
  }

  function buildBadge(label, variant) {
    const safeVariant = safeText(variant) || "neutral";
    return `<span class="badge badge--${escapeHtml(safeVariant)}">${escapeHtml(label)}</span>`;
  }

  function buildEmptyCard(type) {
    return `
      <div class="scan-card__empty">
        No existe información cargada para <strong>${escapeHtml(type)}</strong>.<br />
        Use <strong>Escanear carpeta</strong> o <strong>Importar ZIP/RAR</strong>.
      </div>
    `;
  }

  function buildScanCard(card) {
    if (!card || card.loaded !== true) {
      return buildEmptyCard(card && card.type ? card.type : "este módulo");
    }

    const validation = card.validationLabel || {
      status: "neutral",
      text: "Sin validación estructural."
    };

    const sourceLabel = card.sourceLabel || {
      kind: "neutral",
      title: "Origen no disponible",
      detail: ""
    };

    const openRootButton = card.effectiveRootPath
      ? `
        <button
          class="btn btn--ghost"
          type="button"
          data-open-path="${escapeHtml(card.effectiveRootPath)}"
        >
          Abrir carpeta raíz
        </button>
      `
      : "";

    const openSourceButton = card.sourcePath
      ? `
        <button
          class="btn btn--ghost"
          type="button"
          data-open-path="${escapeHtml(card.sourcePath)}"
        >
          Abrir origen
        </button>
      `
      : "";

    return `
      <div class="scan-card__row scan-card__row--grid">
        <div class="scan-card__item">
          <div class="scan-card__label">Carpetas</div>
          <div class="scan-card__value">
            <span class="scan-card__metric">${escapeHtml(String(card.summary.totalFolders))}</span>
          </div>
        </div>
        <div class="scan-card__item">
          <div class="scan-card__label">Archivos</div>
          <div class="scan-card__value">
            <span class="scan-card__metric">${escapeHtml(String(card.summary.totalFiles))}</span>
          </div>
        </div>
        <div class="scan-card__item">
          <div class="scan-card__label">Peso total</div>
          <div class="scan-card__value">
            <span class="scan-card__metric">${escapeHtml(window.ScanService.formatBytes(card.summary.totalSizeBytes))}</span>
          </div>
        </div>
      </div>

      <div class="scan-card__row">
        <div class="scan-card__item">
          <div class="scan-card__label">Carpeta raíz detectada</div>
          <div class="scan-card__value">${escapeHtml(card.rootName || "Sin nombre")}</div>
          <div class="code-path">${escapeHtml(card.rootPath || "")}</div>
        </div>
      </div>

      <div class="scan-card__row">
        <div class="scan-card__item">
          <div class="scan-card__label">Fecha de escaneo</div>
          <div class="scan-card__value">${escapeHtml(card.scannedAtLabel || "Sin fecha")}</div>
        </div>
      </div>

      <div class="scan-card__row">
        <div class="scan-card__item">
          <div class="scan-card__label">Origen</div>
          <div class="scan-card__value">
            ${buildBadge(sourceLabel.title, sourceLabel.kind === "success" ? "success" : "neutral")}
          </div>
          <div class="code-path">${escapeHtml(sourceLabel.detail || "")}</div>
        </div>
      </div>

      <div class="scan-card__row">
        <div class="scan-card__validation is-${escapeHtml(validation.status)}">
          ${escapeHtml(validation.text)}
        </div>
      </div>

      <div class="scan-card__actions">
        ${openRootButton}
        ${openSourceButton}
      </div>
    `;
  }

  function renderHistoryInfo(viewModel) {
    const host = getElement("historyInfo");
    if (!host) return;

    const path = safeText(viewModel && viewModel.historyFilePath);
    if (!path) {
      host.innerHTML = `
        <div class="history-box__path">
          Todavía no existe una ruta de historial disponible.
        </div>
      `;
      return;
    }

    host.innerHTML = `
      <div class="history-box__path">${escapeHtml(path)}</div>
    `;
  }

  function renderExportResult(viewModel) {
    const host = getElement("exportResultBox");
    if (!host) return;

    const exportResult = viewModel && viewModel.exportResult
      ? viewModel.exportResult
      : { ok: false, filePath: "", fileName: "", error: "" };

    if (exportResult.ok === true) {
      host.className = "export-box is-success";
      host.innerHTML = `
        <div class="export-box__title">PDF generado correctamente</div>
        <div class="export-box__file">${escapeHtml(exportResult.fileName || "Archivo PDF")}</div>
        <div class="export-box__path">${escapeHtml(exportResult.filePath || "")}</div>
      `;
      return;
    }

    if (safeText(exportResult.error)) {
      host.className = "export-box is-error";
      host.innerHTML = `
        <div class="export-box__title">Error de exportación</div>
        <div class="export-box__path">${escapeHtml(exportResult.error)}</div>
      `;
      return;
    }

    host.className = "export-box";
    host.innerHTML = `
      <div class="export-box__path">Todavía no se ha generado un PDF.</div>
    `;
  }

  function syncExportMode(viewModel) {
    const select = getElement("exportMode");
    if (!select) return;
    const nextValue = safeText(viewModel && viewModel.exportMode) || "both";
    if (select.value !== nextValue) {
      select.value = nextValue;
    }
  }

  function renderViewModel(viewModel) {
    renderGlobalMessage(viewModel && viewModel.message);
    renderSummaryGrid(viewModel && viewModel.summaryCards);
    renderHistoryInfo(viewModel);
    renderExportResult(viewModel);
    syncExportMode(viewModel);

    const ugpaHost = getElement("ugpaCardBody");
    if (ugpaHost) {
      ugpaHost.innerHTML = buildScanCard(viewModel && viewModel.ugpaCard);
    }

    const utetHost = getElement("utetCardBody");
    if (utetHost) {
      utetHost.innerHTML = buildScanCard(viewModel && viewModel.utetCard);
    }
  }

  function bindExtraButtonsOnce() {
    if (document.body && document.body.dataset.scanExtraBound === "true") {
      return;
    }

    if (document.body) {
      document.body.dataset.scanExtraBound = "true";
    }

    document.addEventListener("click", async function onGlobalClick(event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

// ❌ ELIMINADO: evita doble ejecución del escaneo
// Los botones ya están enlazados en la capa de inicialización (app/bootstrap)
// Mantener aquí causaba ejecución duplicada por click

/*
if (target.id === "btnScanFolderUgpa") {
  event.preventDefault();
  await window.ScanService.scanFolder("UGPA");
  return;
}

if (target.id === "btnScanFolderUtet") {
  event.preventDefault();
  await window.ScanService.scanFolder("UTET");
  return;
}
*/

      const pathToOpen = target.getAttribute("data-open-path");
      if (pathToOpen) {
        event.preventDefault();
        try {
          await window.ScanService.openPath(pathToOpen);
        } catch (error) {
          window.ScanState.set({
            message: {
              type: "error",
              text: error && error.message ? error.message : "No se pudo abrir la ruta."
            }
          });
        }
      }
    });
  }

  bindExtraButtonsOnce();

  window.ScanUi = {
    renderViewModel: renderViewModel
  };
})(window, document);