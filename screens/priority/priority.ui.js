(function (window, document) {
  "use strict";

  function el(id) { return document.getElementById(id); }
  function safeText(value) { return String(value == null ? "" : value).trim(); }
  function escapeHtml(value) {
    return safeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function effortLabel(value) {
    return value === "high" ? "Alto" : value === "medium" ? "Medio" : "Bajo";
  }

  function renderSummary(vm) {
    const defs = [
      ["max", "Máxima"], ["high", "Alta"], ["medium", "Media"], ["low", "Baja"]
    ];
    el("summaryGrid").innerHTML = defs.map(function map(def) {
      return '<div class="kpi kpi--' + def[0] + '"><span>' + def[1] + '</span><strong>' + (vm.counts[def[0]] || 0) + '</strong></div>';
    }).join("") +
      '<div class="kpi kpi--issue"><span>Inconsistencias</span><strong>' + vm.totalInconsistencies + '</strong></div>';
  }

  function taskCard(task) {
    const due = task.dueDate ? new Intl.DateTimeFormat("es-EC", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
    }).format(task.dueDate) : "Sin fecha exacta";
    const process = task.processNumber ? task.scope + "-PRO-" + task.processNumber : task.scope;
    return '<article class="task-card task-card--' + escapeHtml(task.level) + '">' +
      '<div class="task-card__priority"><span class="priority-pill priority-pill--' + escapeHtml(task.level) + '">' + escapeHtml(task.levelLabel) + '</span></div>' +
      '<div class="task-card__body">' +
        '<div class="task-card__meta"><span>' + escapeHtml(process) + '</span><span>' + escapeHtml(task.areaLabel) + '</span><span>' + escapeHtml(task.stageLabel) + '</span><span>Esfuerzo ' + escapeHtml(effortLabel(task.effort)) + '</span></div>' +
        '<h3>' + escapeHtml(task.title) + '</h3>' +
        (task.processName ? '<p class="task-card__process">' + escapeHtml(task.processName) + '</p>' : '') +
        '<p class="task-card__reason">' + escapeHtml(task.reason) + '</p>' +
        '<div class="task-card__foot"><span>' + escapeHtml(task.periodLabel || "Sin período identificado") + '</span><span>Referencia: ' + escapeHtml(due) + '</span></div>' +
      '</div>' +
      '<div class="task-card__actions">' + (task.actionPath ? '<button class="btn btn--small js-open" data-path="' + escapeHtml(task.actionPath) + '" type="button">Abrir carpeta</button>' : '') + '</div>' +
    '</article>';
  }

  function issueCard(issue) {
    return '<article class="issue-row">' +
      '<div class="issue-row__scope">' + escapeHtml(issue.scope) + '</div>' +
      '<div class="issue-row__body"><strong>' + (Number(issue.groupCount || 0) > 1 ? escapeHtml(issue.groupCount) + ' × ' : '') + escapeHtml(issue.title) + '</strong>' +
        (issue.description ? '<span>' + escapeHtml(issue.description) + '</span>' : '') +
        (issue.expected ? '<small>Esperado: ' + escapeHtml(issue.expected) + (issue.actual ? ' · Actual: ' + escapeHtml(issue.actual) : '') + '</small>' : '') +
        (Array.isArray(issue.examples) && issue.examples.length ? '<small>Ejemplos: ' + escapeHtml(issue.examples.join(' · ')) + '</small>' : '') +
        (issue.pathLabel ? '<small>' + escapeHtml(issue.pathLabel) + '</small>' : '') +
      '</div>' +
      '<div>' + (issue.actionPath ? '<button class="btn btn--small js-open" data-path="' + escapeHtml(issue.actionPath) + '" type="button">Abrir</button>' : '') + '</div>' +
    '</article>';
  }

  function render(vm) {
    el("todayLabel").textContent = "Corte: " + vm.todayLabel;
    el("noScanNotice").style.display = vm.noScan ? "block" : "none";
    el("noScanNotice").textContent = vm.noScan ? "Todavía no hay un escaneo cargado. Ejecuta un escaneo de UGPA o UTET para calcular prioridades." : "";
    renderSummary(vm);

    el("priorityCount").textContent = vm.tasks.length + " pendientes visibles de " + vm.totalTasks;
    el("priorityList").innerHTML = vm.tasks.length
      ? vm.tasks.map(taskCard).join("")
      : '<div class="empty-state">No hay pendientes que coincidan con los filtros.</div>';

    el("issueCount").textContent = vm.totalInconsistencies + " hallazgos agrupados en " + vm.inconsistencyGroups;
    el("issueList").innerHTML = vm.inconsistencies.length
      ? vm.inconsistencies.map(issueCard).join("")
      : '<div class="empty-state">No hay inconsistencias que coincidan con los filtros.</div>';
  }

  function getFilters() {
    return {
      scope: el("filterScope").value,
      area: el("filterArea").value,
      level: el("filterLevel").value,
      search: el("filterSearch").value
    };
  }

  function bindEvents(handlers) {
    ["filterScope", "filterArea", "filterLevel"].forEach(function each(id) {
      el(id).addEventListener("change", function () { handlers.onFiltersChange(getFilters()); });
    });
    el("filterSearch").addEventListener("input", function () { handlers.onFiltersChange(getFilters()); });
    el("btnResetFilters").addEventListener("click", function () {
      el("filterScope").value = "all";
      el("filterArea").value = "all";
      el("filterLevel").value = "all";
      el("filterSearch").value = "";
      handlers.onFiltersChange(getFilters());
    });
    el("btnRefreshPriority").addEventListener("click", handlers.onRefresh);
    el("btnExportPriorityPdf").addEventListener("click", handlers.onExportPdf);
    document.addEventListener("click", function (event) {
      const button = event.target.closest(".js-open");
      if (button) handlers.onOpenPath(button.dataset.path);
    });
  }

  function setGlobalMessage(message, type) {
    const host = el("globalMessage");
    host.className = "global-message" + (type ? " is-" + type : "");
    host.textContent = safeText(message);
  }

  window.PriorityUI = {
    render: render,
    bindEvents: bindEvents,
    setGlobalMessage: setGlobalMessage
  };
})(window, document);
