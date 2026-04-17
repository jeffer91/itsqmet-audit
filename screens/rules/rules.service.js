(function (window) {
  "use strict";
  /*
  Nombre completo: rules.service.js
  Ruta o ubicación: /screens/rules/rules.service.js
  Función o funciones:
  - Construir el viewModel de la pantalla de reglas
  - Filtrar hallazgos activos y descartados
  - Abrir rutas locales
  - Preparar payload de exportación Excel de novedades
  */

  function safeText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    if (text) return text;
    return String(fallback == null ? "" : fallback).trim();
  }

  function normalizeText(value) {
    return safeText(value);
  }

  function mustShellApi() {
    if (!window.api || !window.api.shell) {
      throw new Error("La API para abrir rutas no está disponible.");
    }
    return window.api.shell;
  }

  function mustRulesState() {
    if (!window.RulesState || typeof window.RulesState.get !== "function") {
      throw new Error("RulesState no está disponible.");
    }
    return window.RulesState;
  }

  function getSharedState() {
    if (window.AppStore && typeof window.AppStore.get === "function") {
      return window.AppStore.get();
    }
    return {};
  }

  function containsText(base, searchText) {
    return String(base || "")
      .toLowerCase()
      .includes(String(searchText || "").toLowerCase());
  }

  function matchesScope(itemScope, selectedScope) {
    const safeScope = normalizeText(selectedScope).toUpperCase();
    if (!safeScope || safeScope === "ALL") return true;
    return normalizeText(itemScope).toUpperCase() === safeScope;
  }

  function matchesStatus(itemStatus, selectedStatus) {
    const safeStatus = normalizeText(selectedStatus).toLowerCase();
    if (!safeStatus || safeStatus === "all") return true;
    return normalizeText(itemStatus).toLowerCase() === safeStatus;
  }

  function buildFindingSearchHaystack(finding) {
    return [
      finding.ruleName,
      finding.title,
      finding.description,
      finding.rootName,
      finding.relativePath,
      finding.actualValue,
      finding.expectedValue,
      finding.exampleValue,
      finding.scope,
      finding.personLabel,
      finding.periodLabel,
      finding.foundPeriodLabel,
      finding.missingPeriodLabel,
      finding.foundFileName,
      finding.missingFileName,
      finding.foundRelativePath,
      finding.missingExpectedPath
    ]
      .join(" ")
      .toLowerCase();
  }

  function matchesSearchOnFinding(finding, searchText) {
    const safeSearch = normalizeText(searchText).toLowerCase();
    if (!safeSearch) return true;
    return buildFindingSearchHaystack(finding).includes(safeSearch);
  }

  function buildRuleSearchHaystack(rule, relatedFindings) {
    return [
      rule.name,
      rule.description,
      rule.detail,
      relatedFindings.map(buildFindingSearchHaystack).join(" ")
    ]
      .join(" ")
      .toLowerCase();
  }

  function buildDiscardedIdSet(sharedState) {
    const discarded = Array.isArray(sharedState && sharedState.discardedFindings)
      ? sharedState.discardedFindings
      : [];

    return new Set(
      discarded
        .map(function mapItem(item) {
          return safeText(item && item.id);
        })
        .filter(Boolean)
    );
  }

  function getAllRulesAnalysis() {
    const sharedState = getSharedState();
    const analysis =
      window.RulesEngine && typeof window.RulesEngine.analyze === "function"
        ? window.RulesEngine.analyze(sharedState) || {}
        : {};

    return {
      sharedState: sharedState,
      analysisFindings: Array.isArray(analysis.findings) ? analysis.findings : [],
      analysisRuleResults: Array.isArray(analysis.ruleResults)
        ? analysis.ruleResults
        : []
    };
  }

  function applyFindingFilters(list, rulesState, discardedMode) {
    const safeList = Array.isArray(list) ? list : [];
    const selectedRuleId = safeText(rulesState.selectedRuleId, "all");
    const selectedScope = safeText(rulesState.selectedScope, "all");
    const selectedStatus = safeText(rulesState.selectedStatus, "issues");
    const searchText = safeText(rulesState.searchText);

    return safeList.filter(function keep(finding) {
      if (selectedRuleId !== "all" && safeText(finding.ruleId) !== selectedRuleId) {
        return false;
      }

      if (!matchesScope(finding.scope, selectedScope)) {
        return false;
      }

      if (!discardedMode && !matchesStatus("issues", selectedStatus)) {
        return false;
      }

      if (!matchesSearchOnFinding(finding, searchText)) {
        return false;
      }

      return true;
    });
  }

  function applyRuleFilters(ruleResults, activeFindings, rulesState) {
    const selectedRuleId = safeText(rulesState.selectedRuleId, "all");
    const selectedScope = safeText(rulesState.selectedScope, "all");
    const selectedStatus = safeText(rulesState.selectedStatus, "issues");
    const searchText = safeText(rulesState.searchText);

    return (Array.isArray(ruleResults) ? ruleResults : []).filter(function keep(rule) {
      if (selectedRuleId !== "all" && safeText(rule.id) !== selectedRuleId) {
        return false;
      }

      if (!matchesScope(rule.scope, selectedScope) && safeText(rule.scope) !== "BOTH") {
        return false;
      }

      if (!matchesStatus(rule.status, selectedStatus)) {
        return false;
      }

      const relatedFindings = activeFindings.filter(function filterByRule(finding) {
        return safeText(finding.ruleId) === safeText(rule.id);
      });

      if (
        searchText &&
        !buildRuleSearchHaystack(rule, relatedFindings).includes(
          searchText.toLowerCase()
        )
      ) {
        return false;
      }

      return true;
    });
  }

  function buildViewModel() {
    const rulesState = mustRulesState().get();
    const bundle = getAllRulesAnalysis();
    const sharedState = bundle.sharedState;
    const analysisFindings = bundle.analysisFindings;
    const analysisRuleResults = bundle.analysisRuleResults;

    const discardedIds = buildDiscardedIdSet(sharedState);

    const activeFindingsAll = analysisFindings.filter(function keep(finding) {
      return !discardedIds.has(safeText(finding.id));
    });

    const discardedFindingsAll = analysisFindings.filter(function keep(finding) {
      return discardedIds.has(safeText(finding.id));
    });

    const activeFindings = applyFindingFilters(
      activeFindingsAll,
      rulesState,
      false
    );
    const discardedFindings = applyFindingFilters(
      discardedFindingsAll,
      rulesState,
      true
    );

    const visibleRuleResults = applyRuleFilters(
      analysisRuleResults,
      activeFindingsAll,
      rulesState
    );

    const allRules =
      window.RulesCatalog && typeof window.RulesCatalog.getAll === "function"
        ? window.RulesCatalog.getAll()
        : [];

    return {
      generatedAt: new Date().toISOString(),
      focusFindingId: safeText(rulesState.focusFindingId),
      activeFindings: activeFindings,
      discardedFindings: discardedFindings,
      visibleRuleResults: visibleRuleResults,
      summary: {
        ugpaLoaded: !!(sharedState.ugpaResult && sharedState.ugpaResult.ok),
        utetLoaded: !!(sharedState.utetResult && sharedState.utetResult.ok),
        totalRulesCount: analysisRuleResults.length,
        visibleRulesCount: visibleRuleResults.length,
        activeFindingsCount: activeFindings.length,
        discardedFindingsCount: discardedFindings.length,
        rulesWithIssuesCount: visibleRuleResults.filter(function keep(rule) {
          return rule.status === "issues";
        }).length
      },
      filters: {
        selectedRuleId: safeText(rulesState.selectedRuleId, "all"),
        selectedScope: safeText(rulesState.selectedScope, "all"),
        selectedStatus: safeText(rulesState.selectedStatus, "issues"),
        searchText: safeText(rulesState.searchText),
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
          allRules.map(function mapRule(rule) {
            return {
              value: rule.id,
              label: rule.name
            };
          })
        )
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

  function discardFinding(finding) {
    if (window.AppStore && typeof window.AppStore.addDiscardedFinding === "function") {
      window.AppStore.addDiscardedFinding(finding);
    }
  }

  function restoreFinding(id) {
    if (
      window.AppStore &&
      typeof window.AppStore.removeDiscardedFinding === "function"
    ) {
      window.AppStore.removeDiscardedFinding(id);
    }
  }

  function buildExportColumns() {
    return [
      { key: "estado", label: "Estado" },
      { key: "regla", label: "Regla" },
      { key: "tipo", label: "Tipo" },
      { key: "severidad", label: "Severidad" },
      { key: "persona", label: "Persona" },
      { key: "periodoEncontrado", label: "Periodo encontrado" },
      { key: "periodoFaltante", label: "Periodo faltante" },
      { key: "archivoEncontrado", label: "Archivo encontrado" },
      { key: "documentoFaltante", label: "Documento faltante" },
      { key: "rutaEncontrada", label: "Ruta encontrada" },
      { key: "rutaEsperada", label: "Ruta esperada" },
      { key: "titulo", label: "Titulo" },
      { key: "descripcion", label: "Descripcion" },
      { key: "valorActual", label: "Valor actual" },
      { key: "valorEsperado", label: "Valor esperado" },
      { key: "carpetaRaiz", label: "Carpeta raiz" },
      { key: "rutaAbsoluta", label: "Ruta absoluta" },
      { key: "id", label: "ID" }
    ];
  }

  function buildExportRows() {
    const bundle = getAllRulesAnalysis();
    const sharedState = bundle.sharedState;
    const analysisFindings = bundle.analysisFindings;
    const discardedIds = buildDiscardedIdSet(sharedState);

    return analysisFindings.map(function mapFinding(finding) {
      const isDiscarded = discardedIds.has(safeText(finding.id));
      return {
        estado: isDiscarded ? "Descartada" : "Activa",
        regla: safeText(finding.ruleName),
        tipo: safeText(finding.scope),
        severidad: safeText(finding.severity),
        persona: safeText(finding.personLabel),
        periodoEncontrado: safeText(
          finding.foundPeriodLabel || finding.periodLabel
        ),
        periodoFaltante: safeText(finding.missingPeriodLabel),
        archivoEncontrado: safeText(
          finding.foundFileName || finding.actualValue
        ),
        documentoFaltante: safeText(
          finding.missingFileName || finding.expectedValue
        ),
        rutaEncontrada: safeText(
          finding.foundRelativePath || finding.relativePath
        ),
        rutaEsperada: safeText(finding.missingExpectedPath),
        titulo: safeText(finding.title),
        descripcion: safeText(finding.description),
        valorActual: safeText(finding.actualValue),
        valorEsperado: safeText(finding.expectedValue),
        carpetaRaiz: safeText(finding.rootName),
        rutaAbsoluta: safeText(finding.absolutePath),
        id: safeText(finding.id)
      };
    });
  }

  function buildExportPayload() {
    return {
      baseName:
        "audit_novedades_reglas_" +
        new Date().toISOString().slice(0, 10),
      title: "Novedades de reglas",
      columns: buildExportColumns(),
      rows: buildExportRows()
    };
  }

  window.RulesService = {
    buildViewModel: buildViewModel,
    openPath: openPath,
    discardFinding: discardFinding,
    restoreFinding: restoreFinding,
    buildExportPayload: buildExportPayload
  };
})(window);