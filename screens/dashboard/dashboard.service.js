/*
Nombre completo: dashboard.service.js
Ruta: /screens/dashboard/dashboard.service.js
Función:
- Construir un dashboard operativo y compacto por tipo de novedad.
- Mostrar nombre, ubicación y acceso directo a la carpeta contenedora.
*/
(function (window) {
  "use strict";

  const CATEGORY_DEFS = [
    { id: "empty-folders", label: "Vacías" },
    { id: "folders-without-pdf", label: "Sin PDF" },
    { id: "non-pdf", label: "No PDF" },
    { id: "names", label: "Nombres" },
    { id: "required-documents", label: "Faltantes" },
    { id: "root-files", label: "Raíz" }
  ];

  function safeText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    return text || String(fallback == null ? "" : fallback).trim();
  }

  function mustShellApi() {
    if (!window.api || !window.api.shell) {
      throw new Error("La API para abrir rutas no está disponible.");
    }
    return window.api.shell;
  }

  function mapLegacyCategory(finding) {
    const explicit = safeText(finding && finding.category);
    if (explicit) return explicit;

    const ruleId = safeText(finding && finding.ruleId);
    if (ruleId === "empty-folders") return "empty-folders";
    if (ruleId === "folders-without-pdf") return "folders-without-pdf";
    if (ruleId === "non-pdf-files") return "non-pdf";
    if (
      ruleId === "standardized-names" ||
      ruleId === "naming-structure" ||
      ruleId === "period-folder-format"
    ) return "names";
    if (
      ruleId === "required-documents" ||
      ruleId === "plan-individual-requires-sponsorship" ||
      ruleId === "training-complete-with-4-evidences"
    ) return "required-documents";
    if (ruleId === "root-pdf-policy") return "root-files";
    return "other";
  }

  function getBaseData() {
    const sharedState = window.AppStore.get();
    const analysis = window.RulesEngine.analyze(sharedState) || {};
    const findings = Array.isArray(analysis.findings) ? analysis.findings : [];
    const discarded = new Set(
      (Array.isArray(sharedState.discardedFindings)
        ? sharedState.discardedFindings
        : []
      ).map(function map(item) {
        return safeText(item && item.id);
      })
    );

    return {
      sharedState: sharedState,
      allRules: window.RulesCatalog.getAll(),
      activeFindings: findings
        .filter(function keep(item) {
          return item && !discarded.has(safeText(item.id));
        })
        .map(function map(item) {
          return {
            ...item,
            category: mapLegacyCategory(item)
          };
        })
    };
  }

  function haystack(finding) {
    return [
      finding.ruleName,
      finding.title,
      finding.description,
      finding.scope,
      finding.relativePath,
      finding.actualValue,
      finding.expectedValue,
      finding.foundFileName,
      finding.missingFileName,
      finding.missingExpectedPath,
      finding.periodLabel
    ].join(" ").toLowerCase();
  }

  function applyCommonFilters(findings, state) {
    const search = safeText(state.searchText).toLowerCase();

    return findings.filter(function keep(finding) {
      if (
        state.selectedScope !== "all" &&
        safeText(finding.scope).toUpperCase() !== safeText(state.selectedScope).toUpperCase()
      ) return false;

      if (
        state.selectedRuleId !== "all" &&
        safeText(finding.ruleId) !== safeText(state.selectedRuleId)
      ) return false;

      if (search && !haystack(finding).includes(search)) return false;

      return true;
    });
  }

  function sortFindings(findings, sortBy) {
    const safeSort = safeText(sortBy, "category");

    findings.sort(function compare(a, b) {
      if (safeSort === "name") {
        return safeText(a.title).localeCompare(safeText(b.title), "es", { sensitivity: "base" });
      }

      if (safeSort === "scope") {
        const byScope = safeText(a.scope).localeCompare(safeText(b.scope), "es");
        if (byScope) return byScope;
      }

      const byCategory = safeText(a.category).localeCompare(safeText(b.category), "es");
      if (byCategory) return byCategory;

      return safeText(a.relativePath).localeCompare(safeText(b.relativePath), "es", {
        sensitivity: "base"
      });
    });

    return findings;
  }

  function buildCategoryCounts(findings) {
    return CATEGORY_DEFS.map(function map(def) {
      return {
        id: def.id,
        label: def.label,
        count: findings.filter(function keep(item) {
          return item.category === def.id;
        }).length
      };
    });
  }

  function buildViewModel() {
    const base = getBaseData();
    const state = window.DashboardState.get();

    const commonFiltered = applyCommonFilters(base.activeFindings, state);
    const categoryCounts = buildCategoryCounts(commonFiltered);

    const visibleFindings = commonFiltered.filter(function keep(finding) {
      return state.selectedCategory === "all" ||
        finding.category === state.selectedCategory;
    });

    sortFindings(visibleFindings, state.sortBy);

    return {
      noScan:
        !(base.sharedState.ugpaResult && base.sharedState.ugpaResult.ok) &&
        !(base.sharedState.utetResult && base.sharedState.utetResult.ok),
      dashboardState: state,
      categoryCounts: categoryCounts,
      findings: visibleFindings,
      summary: {
        ugpaLoaded: !!(base.sharedState.ugpaResult && base.sharedState.ugpaResult.ok),
        utetLoaded: !!(base.sharedState.utetResult && base.sharedState.utetResult.ok),
        activeFindingsCount: commonFiltered.length
      },
      filters: {
        scopeOptions: [
          { value: "all", label: "Todos" },
          { value: "UGPA", label: "UGPA" },
          { value: "UTET", label: "UTET" }
        ],
        statusOptions: [
          { value: "issues", label: "Con novedades" },
          { value: "all", label: "Todos" }
        ],
        ruleOptions: [{ value: "all", label: "Todas las reglas" }].concat(
          base.allRules.map(function map(rule) {
            return { value: rule.id, label: rule.name };
          })
        ),
        sortOptions: [
          { value: "category", label: "Tipo de novedad" },
          { value: "scope", label: "UGPA / UTET" },
          { value: "name", label: "Nombre" }
        ]
      }
    };
  }

  async function openPath(targetPath) {
    const response = await mustShellApi().openPath(targetPath);
    if (!response || response.ok !== true) {
      throw new Error(
        response && response.error ? response.error : "No se pudo abrir la carpeta."
      );
    }
    return response;
  }

  function goToRules(ruleId, findingId) {
    if (safeText(ruleId)) {
      sessionStorage.setItem("audit_rules_focus_rule_id", safeText(ruleId));
    }
    if (safeText(findingId)) {
      sessionStorage.setItem("audit_rules_focus_finding_id", safeText(findingId));
    }
    window.location.href = "../rules/rules.index.html";
  }

  window.DashboardService = {
    buildViewModel: buildViewModel,
    openPath: openPath,
    goToRules: goToRules
  };
})(window);
