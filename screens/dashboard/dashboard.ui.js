/*
Nombre completo: dashboard.ui.js
Ruta o ubicación: /screens/dashboard/dashboard.ui.js
Función o funciones:
- Renderizar la pantalla Dashboard
- Mostrar KPIs, filtros y tarjetas compactas por regla
- Mostrar hallazgos resumidos con acceso directo a reglas y rutas
- Gestionar acciones de refresco, filtros, expansión y apertura de rutas
*/
(function (window, document) {
  "use strict";

  const refs = {};
  let handlers = {};

  function must(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error("Elemento no encontrado: " + id);
    }
    return element;
  }

  function getRefs() {
    if (refs.__ready) return refs;

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
    refs.__ready = true;

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

  function truncateText(value, maxLength, fallback) {
    const safe = safeText(value, fallback || "No disponible");
    const limit = Number(maxLength || 0);
    if (!limit || safe.length <= limit) {
      return safe;
    }
    return safe.slice(0, Math.max(0, limit - 1)) + "…";
  }

  function formatTextBlock(value, fallback, maxLength) {
    const text = truncateText(value, maxLength || 220, fallback || "No disponible");
    return escapeHtml(text).replaceAll("\n", "<br>");
  }

  function buildStatusClass(status) {
    const safeStatus = safeText(status).toLowerCase() || "waiting";
    return "status-pill status-pill--" + safeStatus;
  }

  function buildStatusLabel(status) {
    const safeStatus = safeText(status).toLowerCase();
    if (safeStatus === "ok") return "Cumple";
    if (safeStatus === "issues") return "Con novedades";
    if (safeStatus === "partial") return "Parcial";
    return "Pendiente";
  }

  function renderOptions(selectElement, options, selectedValue) {
    const safeOptions = Array.isArray(options) ? options : [];
    const safeSelected = safeText(selectedValue);

    selectElement.innerHTML = safeOptions.map(function mapOption(option) {
      const value = safeText(option && option.value);
      const label = safeText(option && option.label, value || "Opción");
      const isSelected = value === safeSelected ? ' selected="selected"' : "";
      return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function renderSummary(summary) {
    const r = getRefs();

    r.summaryGrid.innerHTML = `
      <article class="kpi">
        <span class="kpi__label">UGPA</span>
        <strong class="kpi__value">${summary.ugpaLoaded ? "Cargado" : "Pendiente"}</strong>
      </article>
      <article class="kpi">
        <span class="kpi__label">UTET</span>
        <strong class="kpi__value">${summary.utetLoaded ? "Cargado" : "Pendiente"}</strong>
      </article>
      <article class="kpi">
        <span class="kpi__label">Reglas visibles</span>
        <strong class="kpi__value">${Number(summary.visibleRulesCount || 0)}</strong>
      </article>
      <article class="kpi">
        <span class="kpi__label">Reglas con novedades</span>
        <strong class="kpi__value">${Number(summary.rulesWithIssuesCount || 0)}</strong>
      </article>
      <article class="kpi">
        <span class="kpi__label">Novedades activas</span>
        <strong class="kpi__value">${Number(summary.activeFindingsCount || 0)}</strong>
      </article>
      <article class="kpi">
        <span class="kpi__label">Descartadas</span>
        <strong class="kpi__value">${Number(summary.discardedFindingsCount || 0)}</strong>
      </article>
    `;
  }

  function renderPreviewFinding(finding) {
    const openPath = safeText(
      finding.absolutePath || finding.primaryActionPath || finding.rootPath
    );

    return `
      <article class="finding-item">
        <div class="finding-item__top">
          <div class="finding-item__text">
            <strong>${escapeHtml(safeText(finding.title, "Novedad"))}</strong>
            <p>${formatTextBlock(
              finding.description || finding.relativePath || finding.rootName,
              "Sin detalle",
              180
            )}</p>
          </div>
          <span class="finding-item__scope">${escapeHtml(safeText(finding.scope, "BOTH"))}</span>
        </div>
        <div class="finding-item__actions">
          <button
            class="btn btn--ghost btn--small"
            type="button"
            data-action="go-rules"
            data-rule-id="${escapeHtml(safeText(finding.ruleId))}"
            data-finding-id="${escapeHtml(safeText(finding.id))}"
          >
            Ver en reglas
          </button>
          ${
            openPath
              ? `
                <button
                  class="btn btn--ghost btn--small"
                  type="button"
                  data-action="open-path"
                  data-path="${escapeHtml(openPath)}"
                >
                  Abrir
                </button>
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderRuleCard(card) {
    const previewFindings = Array.isArray(card.previewFindings) ? card.previewFindings : [];
    const hiddenCount = Number(card.hiddenActiveCount || 0);

    const findingsHtml = previewFindings.length
      ? previewFindings.map(renderPreviewFinding).join("")
      : `<div class="empty-inline">No hay novedades activas para esta regla.</div>`;

    return `
      <article class="dashboard-card">
        <div class="dashboard-card__top">
          <div class="dashboard-card__title-wrap">
            <h3 class="dashboard-card__title">${escapeHtml(safeText(card.name, "Regla"))}</h3>
            <p class="dashboard-card__subtitle">${formatTextBlock(card.description, "Sin descripción", 200)}</p>
          </div>
          <span class="${buildStatusClass(card.status)}">${escapeHtml(buildStatusLabel(card.status))}</span>
        </div>

        <div class="dashboard-card__meta">
          <span><strong>Ámbito:</strong> ${escapeHtml(safeText(card.scope, "BOTH"))}</span>
          <span><strong>Activas:</strong> ${Number(card.activeCount || 0)}</span>
          <span><strong>Descartadas:</strong> ${Number(card.discardedCount || 0)}</span>
        </div>

        <div class="dashboard-card__body">
          ${findingsHtml}
        </div>

        <div class="dashboard-card__footer">
          <div class="dashboard-card__footer-actions">
            ${
              hiddenCount > 0
                ? `
                  <button
                    class="btn btn--ghost btn--small"
                    type="button"
                    data-action="toggle-expand"
                    data-rule-id="${escapeHtml(safeText(card.id))}"
                  >
                    Ver ${hiddenCount} más
                  </button>
                `
                : card.isExpanded && Number(card.activeCount || 0) > previewFindings.length
                ? `
                  <button
                    class="btn btn--ghost btn--small"
                    type="button"
                    data-action="toggle-expand"
                    data-rule-id="${escapeHtml(safeText(card.id))}"
                  >
                    Ver menos
                  </button>
                `
                : `
                  <button
                    class="btn btn--ghost btn--small"
                    type="button"
                    data-action="toggle-expand"
                    data-rule-id="${escapeHtml(safeText(card.id))}"
                  >
                    ${card.isExpanded ? "Ver menos" : "Expandir"}
                  </button>
                `
            }
            <button
              class="btn btn--ghost btn--small"
              type="button"
              data-action="go-rules"
              data-rule-id="${escapeHtml(safeText(card.id))}"
            >
              Ir a reglas
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderRulesBoard(ruleCards) {
    const r = getRefs();
    const cards = Array.isArray(ruleCards) ? ruleCards : [];

    if (!cards.length) {
      r.rulesBoard.innerHTML = `
        <div class="empty-state">
          No hay reglas visibles con los filtros actuales.
        </div>
      `;
      return;
    }

    r.rulesBoard.innerHTML = cards.map(renderRuleCard).join("");
  }

  function render(viewModel) {
    const r = getRefs();
    const vm = viewModel && typeof viewModel === "object" ? viewModel : {};

    renderOptions(r.filterScope, vm.filters && vm.filters.scopeOptions, vm.dashboardState && vm.dashboardState.selectedScope);
    renderOptions(r.filterStatus, vm.filters && vm.filters.statusOptions, vm.dashboardState && vm.dashboardState.selectedStatus);
    renderOptions(r.filterRule, vm.filters && vm.filters.ruleOptions, vm.dashboardState && vm.dashboardState.selectedRuleId);
    renderOptions(r.sortBy, vm.filters && vm.filters.sortOptions, vm.dashboardState && vm.dashboardState.sortBy);

    r.filterSearch.value = safeText(vm.dashboardState && vm.dashboardState.searchText);

    renderSummary(vm.summary || {});

    r.noScanNotice.style.display = vm.noScan ? "block" : "none";
    r.noScanNotice.innerHTML = vm.noScan
      ? "Aún no hay resultados de escaneo disponibles. Ejecuta primero el escaneo de UGPA o UTET."
      : "";

    renderRulesBoard(vm.ruleCards || []);
  }

  function setGlobalMessage(message, type) {
    const r = getRefs();
    const safeMessage = safeText(message);

    r.globalMessage.textContent = safeMessage;
    r.globalMessage.className = "global-message";

    if (!safeMessage) return;
    if (type === "error") r.globalMessage.classList.add("is-error");
    if (type === "success") r.globalMessage.classList.add("is-success");
  }

  function emitFiltersChange() {
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
    handlers = nextHandlers && typeof nextHandlers === "object" ? nextHandlers : {};

    const r = getRefs();

    r.btnRefreshDashboard.addEventListener("click", function onRefresh() {
      if (handlers.onRefresh) handlers.onRefresh();
    });

    r.btnResetFilters.addEventListener("click", function onReset() {
      if (handlers.onResetFilters) handlers.onResetFilters();
    });

    [r.filterScope, r.filterStatus, r.filterRule, r.sortBy].forEach(function each(element) {
      element.addEventListener("change", emitFiltersChange);
    });

    r.filterSearch.addEventListener("input", emitFiltersChange);

    r.rulesBoard.addEventListener("click", function onBoardClick(event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const action = safeText(button.getAttribute("data-action"));
      if (!action) return;

      if (action === "open-path" && handlers.onOpenPath) {
        handlers.onOpenPath(safeText(button.getAttribute("data-path")));
        return;
      }

      if (action === "go-rules" && handlers.onGoRules) {
        handlers.onGoRules(
          safeText(button.getAttribute("data-rule-id")),
          safeText(button.getAttribute("data-finding-id"))
        );
        return;
      }

      if (action === "toggle-expand" && handlers.onToggleExpand) {
        handlers.onToggleExpand(safeText(button.getAttribute("data-rule-id")));
      }
    });
  }

  window.DashboardUI = {
    render: render,
    bindEvents: bindEvents,
    setGlobalMessage: setGlobalMessage
  };
})(window, document);