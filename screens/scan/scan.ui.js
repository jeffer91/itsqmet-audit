(function (window, document) {
  "use strict";

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function renderMessage(message) {
    const host = byId("globalMessage");
    const text = safeText(message && message.text);
    const type = safeText(message && message.type) || "neutral";

    host.className = text
      ? "global-message is-visible is-" + type
      : "global-message";
    host.textContent = text;
  }

  function renderSummary(cards) {
    byId("summaryGrid").innerHTML = (Array.isArray(cards) ? cards : [])
      .map(function (card) {
        return (
          '<article class="summary-card">' +
          '<span>' + escapeHtml(card.label) + '</span>' +
          '<strong>' + escapeHtml(card.value) + '</strong>' +
          '</article>'
        );
      })
      .join("");
  }

  function renderUnit(card, targetId) {
    const host = byId(targetId);
    const path = safeText(card && card.sourcePath);

    const statusClass = card && card.loaded
      ? "is-ok"
      : card && card.selected
      ? "is-selected"
      : "";

    const statusText = card && card.loaded
      ? "Auditada"
      : card && card.selected
      ? "Seleccionada"
      : "Sin seleccionar";

    const validation = card && card.validationLabel
      ? card.validationLabel
      : { status: "neutral", text: "" };

    host.innerHTML = [
      '<div class="unit-source">',
      ' <div class="unit-source__status ' + statusClass + '">' +
        escapeHtml(statusText) +
        '</div>',
      ' <div class="unit-source__path">' +
        escapeHtml(path || "Seleccione una carpeta local sincronizada.") +
        '</div>',
      '</div>',
      '<div class="unit-validation is-' + escapeHtml(validation.status) + '">' +
        escapeHtml(validation.text || "") +
        '</div>',
      card && card.loaded
        ? '<div class="unit-stats">' +
          '<span><strong>' + Number(card.summary.totalFolders || 0) + '</strong> carpetas</span>' +
          '<span><strong>' + Number(card.summary.totalFiles || 0) + '</strong> archivos</span>' +
          '<span><strong>' + escapeHtml(window.ScanService.formatBytes(card.summary.totalSizeBytes || 0)) + '</strong></span>' +
          '<span>' + escapeHtml(card.scannedAtLabel) + '</span>' +
          '</div>'
        : '',
      path
        ? '<button class="btn btn--ghost btn--small" type="button" data-open-path="' +
          escapeHtml(path) +
          '">Abrir carpeta</button>'
        : ''
    ].join("");
  }

  function renderExport(vm) {
    const result = vm && vm.exportResult ? vm.exportResult : {};
    const host = byId("exportResultBox");

    if (result.ok) {
      host.className = "export-box is-success";
      host.innerHTML =
        '<strong>PDF generado</strong><div>' +
        escapeHtml(result.fileName || "") +
        '</div>';
      return;
    }

    if (safeText(result.error)) {
      host.className = "export-box is-error";
      host.textContent = result.error;
      return;
    }

    host.className = "export-box";
    host.textContent = "Sin exportación reciente.";
  }

  function renderViewModel(vm) {
    renderMessage(vm && vm.message);
    renderSummary(vm && vm.summaryCards);
    renderUnit(vm && vm.ugpaCard, "ugpaSourceBody");
    renderUnit(vm && vm.utetCard, "utetSourceBody");
    renderExport(vm);

    const history = byId("historyInfo");
    history.textContent =
      safeText(vm && vm.historyFilePath) ||
      "El historial se creará al auditar.";

    const exportMode = byId("exportMode");
    if (exportMode && exportMode.value !== vm.exportMode) {
      exportMode.value = vm.exportMode;
    }
  }

  document.addEventListener("click", async function (event) {
    const target = event.target.closest("[data-open-path]");
    if (!target) return;

    try {
      await window.ScanService.openPath(target.getAttribute("data-open-path"));
    } catch (error) {
      window.ScanState.patchMessage(
        "error",
        error && error.message ? error.message : "No se pudo abrir la carpeta."
      );
    }
  });

  window.ScanUi = {
    renderViewModel: renderViewModel
  };
})(window, document);
