(function (window, document) {
  "use strict";

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
      host.textContent = "";
      return;
    }

    host.className = "global-message is-visible is-" + type;
    host.textContent = text;
  }

  function renderInstitution(viewModel) {
    const pathHost = getElement("institutionRootPath");
    const statusHost = getElement("institutionStatus");
    if (!pathHost || !statusHost) return;

    const path = safeText(viewModel && viewModel.institutionalRootPath);
    pathHost.textContent = path || "No se ha seleccionado una carpeta institucional.";

    const ugpa = viewModel && viewModel.ugpaCard;
    const utet = viewModel && viewModel.utetCard;
    const detection = viewModel && viewModel.detection ? viewModel.detection : {};
    const ugpaDetected = !!(detection.ugpa && detection.ugpa.path);
    const utetDetected = !!(detection.utet && detection.utet.path);

    function buildUnitStatus(label, card, detected) {
      const status = card && card.loaded
        ? "Auditada"
        : detected
        ? "Detectada"
        : "Pendiente";
      const className = card && card.loaded
        ? "is-ok"
        : detected
        ? "is-detected"
        : "";

      return (
        '<span class="unit-status ' + className + '">' +
        escapeHtml(label + " · " + status) +
        "</span>"
      );
    }

    statusHost.innerHTML = [
      buildUnitStatus("UGPA", ugpa, ugpaDetected),
      buildUnitStatus("UTET", utet, utetDetected)
    ].join("");
  }

  function renderSummaryGrid(cards) {
    const host = getElement("summaryGrid");
    if (!host) return;

    host.innerHTML = (Array.isArray(cards) ? cards : [])
      .map(function mapCard(card) {
        return (
          '<article class="summary-card">' +
          '<div class="summary-card__label">' + escapeHtml(card.label) + "</div>" +
          '<div class="summary-card__value">' + escapeHtml(card.value) + "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function buildScanCard(card) {
    if (!card || card.loaded !== true) {
      return (
        '<div class="scan-card__empty">' +
        "Pendiente de auditoría institucional." +
        "</div>"
      );
    }

    const validation = card.validationLabel || {
      status: "neutral",
      text: "Sin validación estructural."
    };

    const openButton = card.effectiveRootPath
      ? '<button class="btn btn--ghost" type="button" data-open-path="' +
        escapeHtml(card.effectiveRootPath) +
        '">Abrir carpeta</button>'
      : "";

    return [
      '<div class="scan-card__row scan-card__row--grid">',
      '<div class="scan-card__item"><div class="scan-card__label">Carpetas</div><div class="scan-card__metric">' +
        escapeHtml(String(card.summary.totalFolders || 0)) + "</div></div>",
      '<div class="scan-card__item"><div class="scan-card__label">Archivos</div><div class="scan-card__metric">' +
        escapeHtml(String(card.summary.totalFiles || 0)) + "</div></div>",
      '<div class="scan-card__item"><div class="scan-card__label">Peso total</div><div class="scan-card__metric">' +
        escapeHtml(window.ScanService.formatBytes(card.summary.totalSizeBytes || 0)) + "</div></div>",
      "</div>",
      '<div class="scan-card__item"><div class="scan-card__label">Carpeta detectada</div>' +
        '<div class="scan-card__value"><strong>' + escapeHtml(card.rootName) + "</strong></div>" +
        '<div class="code-path">' + escapeHtml(card.rootPath) + "</div></div>",
      '<div class="scan-card__item"><div class="scan-card__label">Última auditoría</div>' +
        '<div class="scan-card__value">' + escapeHtml(card.scannedAtLabel) + "</div></div>",
      '<div class="scan-card__validation is-' + escapeHtml(validation.status) + '">' +
        escapeHtml(validation.text) + "</div>",
      '<div class="scan-card__actions">' + openButton + "</div>"
    ].join("");
  }

  function renderHistoryInfo(viewModel) {
    const host = getElement("historyInfo");
    if (!host) return;

    const path = safeText(viewModel && viewModel.historyFilePath);
    host.innerHTML =
      '<div class="history-box__path">' +
      escapeHtml(path || "El historial se creará al ejecutar la auditoría.") +
      "</div>";
  }

  function renderExportResult(viewModel) {
    const host = getElement("exportResultBox");
    if (!host) return;

    const result = viewModel && viewModel.exportResult ? viewModel.exportResult : {};

    if (result.ok === true) {
      host.className = "export-box is-success";
      host.innerHTML =
        '<div class="export-box__title">PDF generado correctamente</div>' +
        '<div class="export-box__file">' + escapeHtml(result.fileName || "Archivo PDF") + "</div>" +
        '<div class="export-box__path">' + escapeHtml(result.filePath || "") + "</div>";
      return;
    }

    if (safeText(result.error)) {
      host.className = "export-box is-error";
      host.innerHTML =
        '<div class="export-box__title">Error de exportación</div>' +
        '<div class="export-box__path">' + escapeHtml(result.error) + "</div>";
      return;
    }

    host.className = "export-box";
    host.innerHTML =
      '<div class="export-box__path">Todavía no se ha generado un PDF.</div>';
  }

  function renderViewModel(viewModel) {
    renderGlobalMessage(viewModel && viewModel.message);
    renderInstitution(viewModel);
    renderSummaryGrid(viewModel && viewModel.summaryCards);
    renderHistoryInfo(viewModel);
    renderExportResult(viewModel);

    const exportMode = getElement("exportMode");
    if (exportMode && exportMode.value !== viewModel.exportMode) {
      exportMode.value = viewModel.exportMode;
    }

    const ugpaHost = getElement("ugpaCardBody");
    const utetHost = getElement("utetCardBody");

    if (ugpaHost) ugpaHost.innerHTML = buildScanCard(viewModel && viewModel.ugpaCard);
    if (utetHost) utetHost.innerHTML = buildScanCard(viewModel && viewModel.utetCard);
  }

  document.addEventListener("click", async function onGlobalClick(event) {
    const target = event.target && event.target.closest("[data-open-path]");
    if (!target) return;

    const path = target.getAttribute("data-open-path");
    if (!path) return;

    try {
      await window.ScanService.openPath(path);
    } catch (error) {
      window.ScanState.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo abrir la ruta."
      );
    }
  });

  window.ScanUi = {
    renderViewModel: renderViewModel
  };
})(window, document);
