/*
Nombre completo: rules.ui.js
Ruta o ubicación: /screens/rules/rules.ui.js
Función o funciones:
- Renderizar la pantalla de reglas alineada con rules.styles.css
- Mostrar novedades activas con bloques compactos y útiles
- Mostrar únicamente las acciones configuradas por cada regla, sin ruta base automática
- Ocultar elementos visuales no deseados como nombre técnico de regla y ruta relativa
- Gestionar filtros, foco, descarte y restauración
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
    refs.focusBanner = must("focusBanner");
    refs.summaryGrid = must("summaryGrid");
    refs.ruleFilter = must("ruleFilter");
    refs.scopeFilter = must("scopeFilter");
    refs.statusFilter = must("statusFilter");
    refs.searchFilter = must("searchFilter");
    refs.btnResetFilters = must("btnResetFilters");
    refs.btnClearFocus = must("btnClearFocus");
    refs.btnRefreshRules = must("btnRefreshRules");
    refs.activeFindingsCount = must("activeFindingsCount");
    refs.discardedFindingsCount = must("discardedFindingsCount");
    refs.rulesCardsCount = must("rulesCardsCount");
    refs.rulesCards = must("rulesCards");
    refs.activeFindings = must("activeFindings");
    refs.discardedFindings = must("discardedFindings");
    refs.__ready = true;

    return refs;
  }

  function safeText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    if (text) return text;
    return String(fallback == null ? "" : fallback).trim();
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
    const size = Number(maxLength || 0);

    if (!size || safe.length <= size) return safe;

    return safe.slice(0, Math.max(0, size - 1)) + "…";
  }

  function formatTextBlock(value, fallback, maxLength) {
    const text = truncateText(value, maxLength || 500, fallback || "No disponible");
    return escapeHtml(text).replaceAll("\n", "<br />");
  }

  function renderOptionList(selectElement, options, selectedValue) {
    const list = Array.isArray(options) ? options : [];
    const current = safeText(selectedValue);

    selectElement.innerHTML = list
      .map(function mapOption(option) {
        const value = safeText(option && option.value);
        const label = safeText(option && option.label, value || "Opción");
        const selected = value === current ? ' selected="selected"' : "";

        return (
          '<option value="' +
          escapeHtml(value) +
          '"' +
          selected +
          ">" +
          escapeHtml(label) +
          "</option>"
        );
      })
      .join("");
  }

  function setGlobalMessage(message, type) {
    const r = getRefs();
    const safe = safeText(message);

    if (!safe) {
      r.globalMessage.className = "global-message";
      r.globalMessage.innerHTML = "";
      return;
    }

    const tone = safeText(type, "info").toLowerCase();

    r.globalMessage.className = "global-message";
    if (tone === "error") {
      r.globalMessage.classList.add("is-error");
    } else if (tone === "success") {
      r.globalMessage.classList.add("is-success");
    }

    r.globalMessage.innerHTML = escapeHtml(safe);
  }

  function renderNoScanNotice(viewModel) {
    const r = getRefs();
    const summary = viewModel && viewModel.summary ? viewModel.summary : {};
    const hasAnyScan = !!(summary.ugpaLoaded || summary.utetLoaded);

    if (hasAnyScan) {
      r.noScanNotice.classList.remove("is-visible");
      r.noScanNotice.innerHTML = "";
      return;
    }

    r.noScanNotice.classList.add("is-visible");
    r.noScanNotice.innerHTML = [
      '<div class="notice__title"><strong>Todavía no hay escaneos cargados</strong></div>',
      '<div class="notice__text">Primero debes ejecutar un escaneo en UGPA, UTET o ambos.</div>'
    ].join("");
  }

  function renderSummary(viewModel) {
    const r = getRefs();
    const summary = viewModel && viewModel.summary ? viewModel.summary : {};
    const items = [
      { label: "UGPA", value: summary.ugpaLoaded ? "Cargado" : "Pendiente" },
      { label: "UTET", value: summary.utetLoaded ? "Cargado" : "Pendiente" },
      { label: "Reglas visibles", value: String(summary.visibleRulesCount || 0) },
      { label: "Con novedades", value: String(summary.rulesWithIssuesCount || 0) },
      { label: "Activas", value: String(summary.activeFindingsCount || 0) },
      { label: "Descartadas", value: String(summary.discardedFindingsCount || 0) }
    ];

    r.summaryGrid.innerHTML = items
      .map(function mapItem(item) {
        return [
          '<article class="kpi">',
          ' <div class="kpi__label">' + escapeHtml(item.label) + "</div>",
          ' <div class="kpi__value">' + escapeHtml(item.value) + "</div>",
          "</article>"
        ].join("");
      })
      .join("");
  }

  function renderFocusBanner(viewModel) {
    const r = getRefs();
    const focusedFinding = viewModel && viewModel.focusedFinding ? viewModel.focusedFinding : null;

    if (!focusedFinding) {
      r.focusBanner.classList.remove("is-visible");
      r.focusBanner.innerHTML = "";
      return;
    }

    const parts = [
      "<strong>Novedad enfocada:</strong> " + formatTextBlock(focusedFinding.title, "Novedad", 180)
    ];

    if (safeText(focusedFinding.personLabel)) {
      parts.push("Persona: " + escapeHtml(safeText(focusedFinding.personLabel)));
    }

    if (safeText(focusedFinding.periodLabel)) {
      parts.push("Período: " + escapeHtml(safeText(focusedFinding.periodLabel)));
    }

    r.focusBanner.classList.add("is-visible");
    r.focusBanner.innerHTML = [
      '<div class="focus-banner__text">',
      parts.join(" · "),
      "</div>"
    ].join("");
  }

  function buildStatusPill(status) {
    const safeStatus = safeText(status, "waiting").toLowerCase();

    return (
      '<span class="status-pill status-pill--' +
      escapeHtml(safeStatus) +
      '">' +
      escapeHtml(safeStatus) +
      "</span>"
    );
  }

  function buildSeverityBadge(severity) {
    return (
      '<span class="severity-badge">' +
      escapeHtml(safeText(severity, "info").toUpperCase()) +
      "</span>"
    );
  }

  function buildScopeBadge(scope) {
    return (
      '<span class="scope-badge">' +
      escapeHtml(safeText(scope, "N/A")) +
      "</span>"
    );
  }

  function renderRulesMiniList(viewModel) {
    const r = getRefs();
    const rules = Array.isArray(viewModel && viewModel.visibleRuleResults)
      ? viewModel.visibleRuleResults
      : [];
    const selectedRuleId = safeText(viewModel && viewModel.selectedRuleId, "all");

    r.rulesCardsCount.innerHTML = escapeHtml(String(rules.length || 0));

    if (!rules.length) {
      r.rulesCards.innerHTML =
        '<div class="empty-state">No hay reglas visibles con los filtros actuales.</div>';
      return;
    }

    r.rulesCards.innerHTML = rules
      .map(function mapRule(rule) {
        const isActive =
          selectedRuleId !== "all" && selectedRuleId === safeText(rule.id);

        return [
          '<button class="rule-mini-card' + (isActive ? " is-active" : "") + '"',
          ' type="button"',
          ' data-action="quick-rule"',
          ' data-rule-id="' + escapeHtml(safeText(rule.id)) + '">',
          ' <div class="rule-mini-card__top">',
          ' <div class="rule-mini-card__title">' + escapeHtml(safeText(rule.name, "Regla")) + "</div>",
          " " + buildStatusPill(rule.status),
          " </div>",
          ' <div class="rule-mini-card__meta">',
          ' <span>Alcance: ' + escapeHtml(safeText(rule.scope, "N/A")) + "</span>",
          ' <span>Novedades: ' + escapeHtml(String(rule.activeCount || rule.findingCount || 0)) + "</span>",
          " </div>",
          "</button>"
        ].join("");
      })
      .join("");
  }

  function buildMetaLine(finding) {
    const parts = [];

    if (safeText(finding.scope)) {
      parts.push(buildScopeBadge(finding.scope));
    }

    if (safeText(finding.severity)) {
      parts.push(buildSeverityBadge(finding.severity));
    }

    if (safeText(finding.personLabel)) {
      parts.push(
        "<span><strong>Persona:</strong> " +
          escapeHtml(truncateText(finding.personLabel, 45, "Sin persona")) +
          "</span>"
      );
    }

    if (safeText(finding.periodLabel)) {
      parts.push(
        "<span><strong>Período:</strong> " +
          escapeHtml(truncateText(finding.periodLabel, 90, "Sin período")) +
          "</span>"
      );
    }

    if (safeText(finding.foundLabel)) {
      parts.push(
        "<span><strong>Encontrado:</strong> " +
          escapeHtml(truncateText(finding.foundLabel, 70, "No disponible")) +
          "</span>"
      );
    }

    if (safeText(finding.missingLabel)) {
      parts.push(
        "<span><strong>Falta:</strong> " +
          escapeHtml(truncateText(finding.missingLabel, 70, "No disponible")) +
          "</span>"
      );
    }

    if (!parts.length) {
      parts.push("<span>Sin metadatos adicionales.</span>");
    }

    return parts.join("");
  }

  function renderCompareBox(label, value, tone) {
    const safeValue = safeText(value);
    if (!safeValue) return "";

    const modifier =
      tone === "actual"
        ? " compare-box--actual"
        : tone === "expected"
        ? " compare-box--expected"
        : "";

    return [
      '<article class="compare-box' + modifier + '">',
      ' <div class="compare-box__label">' + escapeHtml(label) + "</div>",
      ' <div class="compare-box__value">' + formatTextBlock(safeValue, "No disponible", 420) + "</div>",
      "</article>"
    ].join("");
  }

  function buildOpenButton(label, path) {
    const safeLabel = safeText(label);
    const safePath = safeText(path);

    if (!safeLabel || !safePath) {
      return "";
    }

    return (
      '<button class="btn btn--ghost btn--small" type="button" data-action="open-path" data-path="' +
      escapeHtml(safePath) +
      '">' +
      escapeHtml(safeLabel) +
      "</button>"
    );
  }

  function buildActionButtons(finding, source) {
    const buttons = [];
    const usedLabels = new Set();

    function pushOpen(label, path) {
      const html = buildOpenButton(label, path);
      const key = safeText(label).toLowerCase();

      if (!html || !key || usedLabels.has(key)) {
        return;
      }

      usedLabels.add(key);
      buttons.push(html);
    }

    pushOpen(
      safeText(finding.primaryActionLabel, ""),
      safeText(finding.primaryActionPath, "")
    );

    pushOpen(
      safeText(finding.secondaryActionLabel, ""),
      safeText(finding.secondaryActionPath, "")
    );

    pushOpen(
      safeText(finding.tertiaryActionLabel, ""),
      safeText(finding.tertiaryActionPath, "")
    );

    if (source === "discarded") {
      buttons.push(
        '<button class="btn btn--ghost btn--small" type="button" data-action="restore-finding" data-id="' +
          escapeHtml(safeText(finding.id)) +
          '" data-source="discarded">Restaurar</button>'
      );
    } else {
      buttons.push(
        '<button class="btn btn--ghost btn--small" type="button" data-action="discard-finding" data-id="' +
          escapeHtml(safeText(finding.id)) +
          '" data-source="active">Descartar</button>'
      );
    }

    return buttons.filter(Boolean).join("");
  }

  function renderFindingCard(finding, source, focusedFindingId) {
    const isFocused = safeText(finding.id) === safeText(focusedFindingId);
    const actualLabel = safeText(finding.actualLabel, "Actual");
    const expectedLabel = safeText(finding.expectedLabel, "Esperado");
    const exampleLabel = safeText(finding.exampleLabel, "Ejemplo / referencia");

    const compareBlocks = [
      renderCompareBox(actualLabel, finding.actualValue, "actual"),
      renderCompareBox(expectedLabel, finding.expectedValue, "expected"),
      renderCompareBox(exampleLabel, finding.exampleValue, "")
    ]
      .filter(Boolean)
      .join("");

    const description = safeText(finding.description, "Sin descripción.");
    const actionsHtml = buildActionButtons(finding, source);

    return [
      '<article id="finding-' +
        escapeHtml(safeText(finding.id)) +
        '" class="finding-card' +
        (isFocused ? " is-focused" : "") +
        '">',
      ' <div class="finding-card__top">',
      ' <div class="finding-card__top-left">',
      ' <h3 class="finding-card__title">' + formatTextBlock(finding.title, "Novedad", 160) + "</h3>",
      " </div>",
      ' <div class="finding-card__top-right">',
      buildScopeBadge(finding.scope),
      buildSeverityBadge(finding.severity),
      " </div>",
      " </div>",
      ' <div class="finding-card__meta">' + buildMetaLine(finding) + "</div>",
      ' <p class="finding-card__desc">' + formatTextBlock(description, "Sin descripción", 320) + "</p>",
      compareBlocks
        ? ' <div class="finding-card__compare">' + compareBlocks + "</div>"
        : ' <div class="empty-inline">No hay detalle adicional para esta novedad.</div>',
      ' <div class="finding-card__actions">' + actionsHtml + "</div>",
      "</article>"
    ].join("");
  }

  function renderFindingList(container, findings, source, focusedFindingId) {
    const list = Array.isArray(findings) ? findings : [];

    if (!list.length) {
      container.innerHTML = '<div class="empty-state">No hay registros para mostrar.</div>';
      return;
    }

    container.innerHTML = list
      .map(function mapFinding(finding) {
        return renderFindingCard(finding, source, focusedFindingId);
      })
      .join("");
  }

  function renderDiscardedTable(findings) {
    const list = Array.isArray(findings) ? findings : [];

    if (!list.length) {
      return '<div class="empty-state">No hay novedades descartadas.</div>';
    }

    const rows = list
      .map(function mapFinding(finding) {
        const path = safeText(
          finding.primaryActionPath ||
            finding.secondaryActionPath ||
            finding.tertiaryActionPath ||
            finding.absolutePath
        );

        return [
          "<tr>",
          " <td>" + formatTextBlock(finding.title, "Novedad", 180) + "</td>",
          " <td>" + escapeHtml(safeText(finding.scope, "N/A")) + "</td>",
          " <td>" + escapeHtml(safeText(finding.periodLabel || finding.relativePath, "Sin dato")) + "</td>",
          " <td>" + escapeHtml(safeText(finding.discardedAt, "Sin fecha")) + "</td>",
          " <td>",
          ' <div class="actions-inline">',
          path
            ? '<button class="btn btn--ghost btn--small" type="button" data-action="open-path" data-path="' +
              escapeHtml(path) +
              '">Abrir</button>'
            : "",
          '<button class="btn btn--ghost btn--small" type="button" data-action="restore-finding" data-id="' +
            escapeHtml(safeText(finding.id)) +
            '" data-source="discarded">Restaurar</button>',
          " </div>",
          " </td>",
          "</tr>"
        ].join("");
      })
      .join("");

    return [
      '<div class="table-scroll">',
      ' <table class="audit-table">',
      " <thead>",
      " <tr>",
      " <th>Título</th>",
      " <th>Tipo</th>",
      " <th>Dato</th>",
      " <th>Descartada</th>",
      " <th>Acción</th>",
      " </tr>",
      " </thead>",
      " <tbody>",
      rows,
      " </tbody>",
      " </table>",
      "</div>"
    ].join("");
  }

  function render(viewModel) {
    const r = getRefs();
    const filters = viewModel && viewModel.filters ? viewModel.filters : {};

    const rulesState = {
      selectedRuleId: safeText(viewModel && viewModel.selectedRuleId, "all"),
      selectedScope: safeText(viewModel && viewModel.selectedScope, "all"),
      selectedStatus: safeText(viewModel && viewModel.selectedStatus, "issues"),
      searchText: safeText(viewModel && viewModel.searchText, "")
    };

    renderOptionList(r.ruleFilter, filters.ruleOptions, rulesState.selectedRuleId);
    renderOptionList(r.scopeFilter, filters.scopeOptions, rulesState.selectedScope);
    renderOptionList(r.statusFilter, filters.statusOptions, rulesState.selectedStatus);
    r.searchFilter.value = rulesState.searchText;

    renderNoScanNotice(viewModel);
    renderSummary(viewModel);
    renderFocusBanner(viewModel);

    r.activeFindingsCount.innerHTML = escapeHtml(
      String((viewModel && viewModel.activeFindings ? viewModel.activeFindings.length : 0) || 0)
    );

    r.discardedFindingsCount.innerHTML = escapeHtml(
      String((viewModel && viewModel.discardedFindings ? viewModel.discardedFindings.length : 0) || 0)
    );

    renderFindingList(
      r.activeFindings,
      viewModel && viewModel.activeFindings,
      "active",
      viewModel && viewModel.focusFindingId
    );

    renderRulesMiniList(viewModel);

    r.discardedFindings.innerHTML = renderDiscardedTable(
      viewModel && viewModel.discardedFindings
    );
  }

  function collectFilters() {
    const r = getRefs();

    return {
      selectedRuleId: safeText(r.ruleFilter.value, "all"),
      selectedScope: safeText(r.scopeFilter.value, "all"),
      selectedStatus: safeText(r.statusFilter.value, "issues"),
      searchText: String(r.searchFilter.value || "")
    };
  }

  function bindEvents(nextHandlers) {
    handlers = nextHandlers && typeof nextHandlers === "object" ? nextHandlers : {};
    const r = getRefs();

    function emitFilters() {
      if (handlers && typeof handlers.onFiltersChange === "function") {
        handlers.onFiltersChange(collectFilters());
      }
    }

    r.ruleFilter.addEventListener("change", emitFilters);
    r.scopeFilter.addEventListener("change", emitFilters);
    r.statusFilter.addEventListener("change", emitFilters);
    r.searchFilter.addEventListener("input", emitFilters);

    r.btnResetFilters.addEventListener("click", function onReset() {
      if (handlers && typeof handlers.onResetFilters === "function") {
        handlers.onResetFilters();
      }
    });

    r.btnClearFocus.addEventListener("click", function onClearFocus() {
      if (handlers && typeof handlers.onClearFocus === "function") {
        handlers.onClearFocus();
      }
    });

    r.btnRefreshRules.addEventListener("click", function onRefresh() {
      if (handlers && typeof handlers.onRefresh === "function") {
        handlers.onRefresh();
      }
    });

    document.addEventListener("click", function onClick(event) {
      const target = event.target && event.target.closest("[data-action]");
      if (!target) return;

      const action = safeText(target.getAttribute("data-action"));
      const id = safeText(target.getAttribute("data-id"));
      const source = safeText(target.getAttribute("data-source"));
      const path = safeText(target.getAttribute("data-path"));
      const ruleId = safeText(target.getAttribute("data-rule-id"));

      if (action === "open-path" && handlers && typeof handlers.onOpenPath === "function") {
        handlers.onOpenPath(path);
        return;
      }

      if (action === "discard-finding" && handlers && typeof handlers.onDiscard === "function") {
        handlers.onDiscard(id, source || "active");
        return;
      }

      if (action === "restore-finding" && handlers && typeof handlers.onRestore === "function") {
        handlers.onRestore(id, source || "discarded");
        return;
      }

      if (action === "quick-rule" && handlers && typeof handlers.onQuickRule === "function") {
        handlers.onQuickRule(ruleId);
      }
    });
  }

  function scrollToFocusedFinding(findingId) {
    const safeId = safeText(findingId);
    if (!safeId) return;

    const element = document.getElementById("finding-" + safeId);
    if (!element) return;

    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  window.RulesUI = {
    render: render,
    bindEvents: bindEvents,
    setGlobalMessage: setGlobalMessage,
    scrollToFocusedFinding: scrollToFocusedFinding
  };
})(window, document);