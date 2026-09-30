/*
Nombre completo: dashboard.ui.js
Ruta: /screens/dashboard/dashboard.ui.js
Función:
- Renderizar contadores compactos y una lista operativa de novedades.
- Mostrar nombre, ubicación y botón para abrir la carpeta contenedora.
*/
(function (window, document) {
  "use strict";

  const refs = {};
  let handlers = {};

  function must(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error("Elemento no encontrado: " + id);
    return el;
  }

  function getRefs() {
    if (refs.ready) return refs;
    refs.globalMessage = must("globalMessage");
    refs.noScanNotice = must("noScanNotice");
    refs.filterScope = must("filterScope");
    refs.filterStatus = must("filterStatus");
    refs.filterRule = must("filterRule");
    refs.sortBy = must("sortBy");
    refs.filterSearch = must("filterSearch");
    refs.btnResetFilters = must("btnResetFilters");
    refs.btnRefreshDashboard = must("btnRefreshDashboard");
    refs.summaryGrid = must("summaryGrid");
    refs.rulesBoard = must("rulesBoard");
    refs.ready = true;
    return refs;
  }

  function safeText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    return text || String(fallback == null ? "" : fallback).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderOptions(select, options, selected) {
    select.innerHTML = (Array.isArray(options) ? options : [])
      .map(function map(option) {
        const value = safeText(option.value);
        return '<option value="' + escapeHtml(value) + '"' +
          (value === safeText(selected) ? ' selected="selected"' : "") +
          '>' + escapeHtml(option.label) + '</option>';
      })
      .join("");
  }

  function renderSummary(vm) {
    const r = getRefs();
    const selected = safeText(vm.dashboardState && vm.dashboardState.selectedCategory, "all");

    r.summaryGrid.innerHTML = (Array.isArray(vm.categoryCounts) ? vm.categoryCounts : [])
      .map(function map(item) {
        return [
          '<button class="kpi kpi--button' +
            (selected === item.id ? ' is-active' : '') +
            '" type="button" data-action="category" data-category="' +
            escapeHtml(item.id) + '">',
          '<span class="kpi__label">' + escapeHtml(item.label) + '</span>',
          '<strong class="kpi__value">' + Number(item.count || 0) + '</strong>',
          '</button>'
        ].join("");
      })
      .join("");
  }

  function findingName(finding) {
    return safeText(
      finding.missingFileName ||
      finding.foundFileName ||
      finding.actualValue ||
      finding.expectedValue ||
      finding.title,
      "Novedad"
    );
  }

  function findingPath(finding) {
    return safeText(
      finding.missingExpectedPath ||
      finding.foundRelativePath ||
      finding.relativePath ||
      finding.rootName,
      "Sin ruta"
    );
  }

  function openPath(finding) {
    return safeText(
      finding.primaryActionPath ||
      finding.secondaryActionPath ||
      finding.tertiaryActionPath ||
      finding.rootPath
    );
  }

  function renderFinding(finding) {
    const path = openPath(finding);
    const isName = safeText(finding.category) === "names";
    const compare = isName && safeText(finding.expectedValue)
      ? '<div class="finding-row__compare"><span>' +
        escapeHtml(safeText(finding.actualValue)) +
        '</span><b>→</b><span>' +
        escapeHtml(safeText(finding.expectedValue)) +
        '</span></div>'
      : "";

    return [
      '<article class="finding-row">',
      '<div class="finding-row__scope">' + escapeHtml(safeText(finding.scope)) + '</div>',
      '<div class="finding-row__main">',
      '<strong>' + escapeHtml(findingName(finding)) + '</strong>',
      '<span>' + escapeHtml(findingPath(finding)) + '</span>',
      compare,
      '</div>',
      '<div class="finding-row__actions">',
      path
        ? '<button class="btn btn--ghost btn--small" type="button" data-action="open-path" data-path="' +
          escapeHtml(path) + '">Abrir carpeta</button>'
        : '',
      '<button class="btn btn--ghost btn--small" type="button" data-action="go-rules" data-rule-id="' +
        escapeHtml(safeText(finding.ruleId)) + '" data-finding-id="' +
        escapeHtml(safeText(finding.id)) + '">Detalle</button>',
      '</div>',
      '</article>'
    ].join("");
  }

  function renderFindings(findings) {
    const r = getRefs();
    const list = Array.isArray(findings) ? findings : [];

    if (!list.length) {
      r.rulesBoard.innerHTML = '<div class="empty-state">No hay novedades con los filtros actuales.</div>';
      return;
    }

    r.rulesBoard.innerHTML = list.map(renderFinding).join("");
  }

  function render(vm) {
    const r = getRefs();
    const state = vm.dashboardState || {};
    const filters = vm.filters || {};

    renderOptions(r.filterScope, filters.scopeOptions, state.selectedScope);
    renderOptions(r.filterStatus, filters.statusOptions, state.selectedStatus);
    renderOptions(r.filterRule, filters.ruleOptions, state.selectedRuleId);
    renderOptions(r.sortBy, filters.sortOptions, state.sortBy);
    r.filterSearch.value = safeText(state.searchText);

    r.noScanNotice.style.display = vm.noScan ? "block" : "none";
    r.noScanNotice.textContent = vm.noScan
      ? "Seleccione y audite primero UGPA, UTET o ambas."
      : "";

    renderSummary(vm);
    renderFindings(vm.findings);
  }

  function setGlobalMessage(message, type) {
    const r = getRefs();
    r.globalMessage.textContent = safeText(message);
    r.globalMessage.className = "global-message";
    if (type === "error") r.globalMessage.classList.add("is-error");
    if (type === "success") r.globalMessage.classList.add("is-success");
  }

  function emitFilters() {
    if (!handlers.onFiltersChange) return;
    const r = getRefs();
    handlers.onFiltersChange({
      selectedScope: r.filterScope.value,
      selectedStatus: r.filterStatus.value,
      selectedRuleId: r.filterRule.value,
      searchText: r.filterSearch.value,
      sortBy: r.sortBy.value
    });
  }

  function bindEvents(nextHandlers) {
    handlers = nextHandlers || {};
    const r = getRefs();

    r.btnRefreshDashboard.addEventListener("click", function () {
      if (handlers.onRefresh) handlers.onRefresh();
    });

    r.btnResetFilters.addEventListener("click", function () {
      if (handlers.onResetFilters) handlers.onResetFilters();
    });

    [r.filterScope, r.filterStatus, r.filterRule, r.sortBy].forEach(function (el) {
      el.addEventListener("change", emitFilters);
    });
    r.filterSearch.addEventListener("input", emitFilters);

    document.addEventListener("click", function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const action = safeText(button.getAttribute("data-action"));

      if (action === "category" && handlers.onCategory) {
        handlers.onCategory(safeText(button.getAttribute("data-category")));
      } else if (action === "open-path" && handlers.onOpenPath) {
        handlers.onOpenPath(safeText(button.getAttribute("data-path")));
      } else if (action === "go-rules" && handlers.onGoRules) {
        handlers.onGoRules(
          safeText(button.getAttribute("data-rule-id")),
          safeText(button.getAttribute("data-finding-id"))
        );
      }
    });
  }

  window.DashboardUI = {
    render: render,
    bindEvents: bindEvents,
    setGlobalMessage: setGlobalMessage
  };
})(window, document);
