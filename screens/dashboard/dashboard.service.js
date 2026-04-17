/*
Nombre completo: dashboard.service.js
Ruta o ubicación: /screens/dashboard/dashboard.service.js
Función o funciones:
- Construir el viewModel del dashboard
- Agrupar novedades activas y descartadas por regla
- Aplicar filtros y orden
- Abrir rutas locales o enlaces de SharePoint
- Navegar hacia la pantalla de reglas con foco sobre una regla o hallazgo
*/
(function (window) {
  "use strict";

  const PREVIEW_LIMIT = 2;

  function mustShellApi() {
    if (!window.api || !window.api.shell) {
      throw new Error("La API para abrir rutas no está disponible.");
    }
    return window.api.shell;
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function containsText(haystack, needle) {
    const safeHaystack = String(haystack || "").toLowerCase();
    const safeNeedle = normalizeText(needle).toLowerCase();
    if (!safeNeedle) return true;
    return safeHaystack.includes(safeNeedle);
  }

  function buildSearchHaystack(card) {
    return [
      card.name,
      card.description,
      card.detail,
      card.scope,
      card.status,
      (card.previewFindings || [])
        .map(function mapFinding(finding) {
          return [
            finding.ruleName,
            finding.title,
            finding.description,
            finding.rootName,
            finding.relativePath,
            finding.actualValue,
            finding.expectedValue,
            finding.scope,
            finding.personLabel,
            finding.periodLabel
          ].join(" ");
        })
        .join(" ")
    ]
      .join(" ")
      .toLowerCase();
  }

  function matchesScope(card, selectedScope) {
    const safeScope = normalizeText(selectedScope).toUpperCase();
    if (!safeScope || safeScope === "ALL") return true;

    const cardScope = normalizeText(card && card.scope).toUpperCase();
    if (cardScope === safeScope) return true;

    if (cardScope === "BOTH") {
      const available = Array.isArray(card.availableScopes) ? card.availableScopes : [];
      const missing = Array.isArray(card.missingScopes) ? card.missingScopes : [];
      return available.includes(safeScope) || missing.includes(safeScope);
    }

    return false;
  }

  function matchesStatus(card, selectedStatus) {
    const safeStatus = normalizeText(selectedStatus).toLowerCase();
    if (!safeStatus || safeStatus === "all") return true;
    return normalizeText(card && card.status).toLowerCase() === safeStatus;
  }

  function matchesRule(card, selectedRuleId) {
    const safeRuleId = normalizeText(selectedRuleId);
    if (!safeRuleId || safeRuleId === "all") return true;
    return normalizeText(card && card.id) === safeRuleId;
  }

  function matchesSearch(card, searchText) {
    return containsText(card && card.searchHaystack, searchText);
  }

  function buildBaseData() {
const sharedState = window.AppStore.get();
// Corrección técnica: AppStore expone get(), no getState().
const analysis = window.RulesEngine.analyze(sharedState) || {};
const analysisFindings = Array.isArray(analysis.findings) ? analysis.findings : [];
const analysisRuleResults = Array.isArray(analysis.ruleResults) ? analysis.ruleResults : [];
const discardedEntries = Array.isArray(sharedState.discardedFindings)
  ? sharedState.discardedFindings
  : [];
// Corrección técnica: las descartadas se leen desde el estado global.
// Esto evita llamar getDiscardedEntries(), que no existe en AppStore.
    const discardedMap = new Map(
      discardedEntries.map(function mapEntry(entry) {
        return [entry.id, entry];
      })
    );

    const activeFindings = [];
    const discardedFindings = [];

    analysisFindings.forEach(function eachFinding(finding) {
      if (!finding || typeof finding !== "object") return;

      if (discardedMap.has(finding.id)) {
        const entry = discardedMap.get(finding.id);
        discardedFindings.push({
          ...finding,
          discardedAt: entry && entry.discardedAt ? entry.discardedAt : ""
        });
      } else {
        activeFindings.push(finding);
      }
    });

    return {
      sharedState,
      analysis: {
        ...analysis,
        findings: analysisFindings,
        ruleResults: analysisRuleResults
      },
      allRules: window.RulesCatalog.getAll(),
      activeFindings,
      discardedFindings
    };
  }

  function sortCards(cards, sortBy) {
    const safeSort = normalizeText(sortBy) || "findings_desc";

    cards.sort(function compare(a, b) {
      if (safeSort === "name_asc") {
        return String(a.name || "").localeCompare(String(b.name || ""), "es", {
          sensitivity: "base"
        });
      }

      if (safeSort === "name_desc") {
        return String(b.name || "").localeCompare(String(a.name || ""), "es", {
          sensitivity: "base"
        });
      }

      if (safeSort === "status") {
        const rank = {
          issues: 0,
          partial: 1,
          waiting: 2,
          ok: 3
        };

        const left = rank[String(a.status || "").toLowerCase()] ?? 99;
        const right = rank[String(b.status || "").toLowerCase()] ?? 99;

        if (left !== right) return left - right;
      }

      if (safeSort === "discarded_desc" && b.discardedCount !== a.discardedCount) {
        return b.discardedCount - a.discardedCount;
      }

      if (b.activeCount !== a.activeCount) {
        return b.activeCount - a.activeCount;
      }

      return String(a.name || "").localeCompare(String(b.name || ""), "es", {
        sensitivity: "base"
      });
    });
  }

  function buildRuleCards(baseData, dashboardState) {
    const expandedRuleIds = Array.isArray(dashboardState.expandedRuleIds)
      ? dashboardState.expandedRuleIds
      : [];

    const ruleResults = Array.isArray(baseData.analysis.ruleResults)
      ? baseData.analysis.ruleResults
      : [];

    const cards = ruleResults.map(function mapRule(rule) {
      const activeFindings = baseData.activeFindings.filter(function keepFinding(finding) {
        return finding.ruleId === rule.id;
      });

      const discardedFindings = baseData.discardedFindings.filter(function keepFinding(finding) {
        return finding.ruleId === rule.id;
      });

      const isExpanded = expandedRuleIds.includes(rule.id);
      const previewFindings = isExpanded
        ? activeFindings.slice()
        : activeFindings.slice(0, PREVIEW_LIMIT);

      const card = {
        id: normalizeText(rule.id),
        name: normalizeText(rule.name, "Regla"),
        description: normalizeText(rule.description),
        detail: normalizeText(rule.detail),
        status: normalizeText(rule.status).toLowerCase() || "waiting",
        scope: normalizeText(rule.scope).toUpperCase() || "BOTH",
        availableScopes: Array.isArray(rule.availableScopes) ? rule.availableScopes.slice() : [],
        missingScopes: Array.isArray(rule.missingScopes) ? rule.missingScopes.slice() : [],
        activeCount: activeFindings.length,
        discardedCount: discardedFindings.length,
        totalCount: activeFindings.length + discardedFindings.length,
        isExpanded,
        previewFindings,
        hiddenActiveCount: Math.max(0, activeFindings.length - previewFindings.length),
        activeFindings,
        discardedFindings
      };

      card.searchHaystack = buildSearchHaystack(card);
      return card;
    });

    return cards;
  }

  function buildViewModel() {
    const baseData = buildBaseData();
    const dashboardState = window.DashboardState.get();

    const allCards = buildRuleCards(baseData, dashboardState);

    const filteredCards = allCards.filter(function keepCard(card) {
      if (!matchesScope(card, dashboardState.selectedScope)) return false;
      if (!matchesStatus(card, dashboardState.selectedStatus)) return false;
      if (!matchesRule(card, dashboardState.selectedRuleId)) return false;
      if (!matchesSearch(card, dashboardState.searchText)) return false;
      return true;
    });

    sortCards(filteredCards, dashboardState.sortBy);

    return {
      sharedState: baseData.sharedState,
      dashboardState,
      noScan:
        !(baseData.sharedState.ugpaResult && baseData.sharedState.ugpaResult.ok) &&
        !(baseData.sharedState.utetResult && baseData.sharedState.utetResult.ok),
      ruleCards: filteredCards,
      visibleRuleResults: filteredCards,
      summary: {
        ugpaLoaded: !!(baseData.sharedState.ugpaResult && baseData.sharedState.ugpaResult.ok),
        utetLoaded: !!(baseData.sharedState.utetResult && baseData.sharedState.utetResult.ok),
        totalRulesCount: allCards.length,
        visibleRulesCount: filteredCards.length,
        activeFindingsCount: filteredCards.reduce(function sum(acc, item) {
          return acc + Number(item.activeCount || 0);
        }, 0),
        discardedFindingsCount: filteredCards.reduce(function sum(acc, item) {
          return acc + Number(item.discardedCount || 0);
        }, 0),
        rulesWithIssuesCount: filteredCards.filter(function keep(item) {
          return item.status === "issues";
        }).length
      },
      filters: {
        selectedScope: dashboardState.selectedScope,
        selectedStatus: dashboardState.selectedStatus,
        selectedRuleId: dashboardState.selectedRuleId,
        searchText: dashboardState.searchText,
        sortBy: dashboardState.sortBy,
        scopeOptions: [
          { value: "all", label: "Todos" },
          { value: "UGPA", label: "UGPA" },
          { value: "UTET", label: "UTET" }
        ],
        statusOptions: [
          { value: "all", label: "Todos" },
          { value: "issues", label: "Con novedades" },
          { value: "partial", label: "Parcial" },
          { value: "waiting", label: "Pendiente" },
          { value: "ok", label: "Cumple" }
        ],
        ruleOptions: [{ value: "all", label: "Todas las reglas" }].concat(
          baseData.allRules.map(function mapRule(rule) {
            return {
              value: rule.id,
              label: rule.name
            };
          })
        ),
        sortOptions: [
          { value: "findings_desc", label: "Más novedades" },
          { value: "discarded_desc", label: "Más descartadas" },
          { value: "status", label: "Estado" },
          { value: "name_asc", label: "Nombre A-Z" },
          { value: "name_desc", label: "Nombre Z-A" }
        ]
      }
    };
  }

  async function openPath(targetPath) {
    const api = mustShellApi();
    const response = await api.openPath(targetPath);

    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error ? response.error : "No se pudo abrir la ruta."
      );
    }

    return response;
  }

  function goToRules(ruleId, findingId) {
    const safeRuleId = normalizeText(ruleId);
    const safeFindingId = normalizeText(findingId);

    if (safeRuleId) {
      sessionStorage.setItem("audit_rules_focus_rule_id", safeRuleId);
    }

    if (safeFindingId) {
      sessionStorage.setItem("audit_rules_focus_finding_id", safeFindingId);
    }

    window.location.href = "../rules/rules.index.html";
  }

  window.DashboardService = {
    buildViewModel,
    openPath,
    goToRules
  };
})(window);