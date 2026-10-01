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

  function normalizeRelativePath(value) {
    return safeText(value)
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/{2,}/g, "/");
  }

  function parentRelativePath(value) {
    const parts = normalizeRelativePath(value).split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }

  function baseName(value) {
    const parts = normalizeRelativePath(value).split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  function parentAbsolutePath(value) {
    const clean = safeText(value).replace(/[\\/]+$/g, "");
    const lastSlash = Math.max(clean.lastIndexOf("\\"), clean.lastIndexOf("/"));
    return lastSlash > 0 ? clean.slice(0, lastSlash) : "";
  }

  function canGroupFinding(finding) {
    const category = safeText(finding && finding.category);
    if (category === "required-documents") {
      return safeText(finding && finding.ruleId) === "required-documents";
    }
    return [
      "empty-folders",
      "folders-without-pdf",
      "non-pdf",
      "names",
      "root-files"
    ].includes(category);
  }

  function groupLocation(finding) {
    const relativePath = normalizeRelativePath(finding && finding.relativePath);
    if (
      safeText(finding && finding.category) === "required-documents" &&
      safeText(finding && finding.ruleId) === "required-documents"
    ) {
      return relativePath;
    }
    return parentRelativePath(relativePath);
  }

  function groupItemLabel(finding) {
    const category = safeText(finding && finding.category);
    if (category === "required-documents") {
      return safeText(
        finding.missingFileName || finding.expectedValue || finding.title,
        "Documento faltante"
      );
    }
    return safeText(
      finding.foundFileName ||
      finding.missingFileName ||
      baseName(finding.relativePath) ||
      finding.actualValue ||
      finding.title,
      "Novedad"
    );
  }

  function isPeriodLabel(value) {
    const label = safeText(value).toLowerCase();
    return (
      /(?:19|20)\d{2}[-_](?:0?[1-9]|1[0-2])(?:\b|_)/.test(label) ||
      /\b(?:19|20)\d{2}\b.*\b(?:19|20)\d{2}\b/.test(label) ||
      /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b.*\b(?:19|20)\d{2}\b/.test(label) ||
      /\bperiodo\b|\bper[ií]odo\b/.test(label)
    );
  }

  function isLevelLabel(value) {
    return /\bnivel[\s_-]*(?:\d+|[ivx]+)\b/i.test(safeText(value));
  }

  function groupTitle(category, items) {
    const count = items.length;
    const labels = items.map(groupItemLabel);

    if (category === "empty-folders") {
      if (labels.every(isPeriodLabel)) {
        return "Falta subir documentación en " + count + " períodos";
      }
      if (labels.every(isLevelLabel)) {
        return "Falta subir documentación en " + count + " niveles";
      }
      return "Falta subir documentación en " + count + " carpetas";
    }
    if (category === "folders-without-pdf") {
      return count + " carpetas necesitan documentos PDF";
    }
    if (category === "non-pdf") {
      return count + " archivos deben convertirse o reemplazarse por PDF";
    }
    if (category === "names") {
      const allFiles = items.every(function every(item) {
        return !!safeText(item && item.foundFileName);
      });
      return count + (allFiles ? " archivos" : " elementos") +
        " requieren corrección de nombre";
    }
    if (category === "required-documents") {
      return "Faltan " + count + " documentos";
    }
    if (category === "root-files") {
      return count + " archivos requieren revisión en la raíz";
    }
    return count + " novedades en la misma carpeta";
  }

  function buildGroup(items) {
    const first = items[0];
    const category = safeText(first.category);
    const location = groupLocation(first);
    const isRequiredDocuments = category === "required-documents";
    const actionPath = isRequiredDocuments
      ? safeText(first.primaryActionPath || first.absolutePath || first.rootPath)
      : safeText(parentAbsolutePath(first.absolutePath) || first.primaryActionPath || first.rootPath);

    return {
      isGroup: true,
      id: ["group", first.scope, category, first.ruleId, location].join("|"),
      scope: first.scope,
      category: category,
      ruleId: first.ruleId,
      ruleName: first.ruleName,
      title: groupTitle(category, items),
      groupCount: items.length,
      groupLocation: location,
      groupLocationLabel: baseName(location) || safeText(first.rootName, "Raíz"),
      primaryActionPath: actionPath,
      items: items.map(function map(item) {
        return {
          ...item,
          groupItemLabel: groupItemLabel(item)
        };
      })
    };
  }

  function groupFindings(findings) {
    const buckets = new Map();
    const order = [];

    findings.forEach(function each(finding, index) {
      if (!canGroupFinding(finding)) {
        order.push({ type: "single", finding: finding, index: index });
        return;
      }

      const location = groupLocation(finding);
      const key = [
        safeText(finding.scope).toUpperCase(),
        safeText(finding.category),
        safeText(finding.ruleId),
        location.toLowerCase()
      ].join("|");

      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push({ type: "bucket", key: key, index: index });
      }
      buckets.get(key).push(finding);
    });

    return order.map(function map(entry) {
      if (entry.type === "single") return entry.finding;
      const items = buckets.get(entry.key) || [];
      return items.length > 1 ? buildGroup(items) : items[0];
    }).filter(Boolean);
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

    const groupedFindings = groupFindings(visibleFindings);

    return {
      noScan:
        !(base.sharedState.ugpaResult && base.sharedState.ugpaResult.ok) &&
        !(base.sharedState.utetResult && base.sharedState.utetResult.ok),
      dashboardState: state,
      categoryCounts: categoryCounts,
      findings: groupedFindings,
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
        ],        ruleOptions: [{ value: "all", label: "Todas las reglas" }].concat(
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
