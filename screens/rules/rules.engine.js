(function (window) {
  "use strict";
  /*
  Nombre completo: rules.engine.js
  Ruta o ubicación: /screens/rules/rules.engine.js
  Función o funciones:
  - Ejecutar todas las reglas disponibles sobre UGPA, UTET o ambos
  - Normalizar hallazgos para consumo de la UI
  - Conservar campos extendidos para exportación Excel y tarjetas visuales
  */

  const Types = window.RulesTypes || {};
  let lastAnalysisKey = "";
  let lastAnalysis = null;

  function safeText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    if (text) return text;
    return String(fallback == null ? "" : fallback).trim();
  }

  function normalizeScope(value) {
    if (Types.normalizeScope) {
      return Types.normalizeScope(value);
    }
    const scope = safeText(value).toUpperCase();
    return scope === "UGPA" || scope === "UTET" || scope === "BOTH" ? scope : "";
  }

  function normalizeSeverity(value) {
    if (Types.normalizeSeverity) {
      return Types.normalizeSeverity(value);
    }
    const severity = safeText(value, "warning").toLowerCase();
    return severity === "error" || severity === "warning" || severity === "info"
      ? severity
      : "warning";
  }

  function normalizeRelativePath(value) {
    if (Types.normalizeRelativePath) {
      return Types.normalizeRelativePath(value);
    }
    return safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function buildFindingId(finding) {
    if (Types.buildFindingId) {
      return Types.buildFindingId(finding);
    }
    return [
      safeText(finding.ruleId),
      safeText(finding.scope),
      safeText(finding.relativePath),
      safeText(finding.actualValue),
      safeText(finding.expectedValue),
      safeText(finding.personLabel),
      safeText(finding.foundPeriodLabel),
      safeText(finding.missingPeriodLabel)
    ]
      .join("|")
      .toLowerCase();
  }

  function hasValidScan(scanData) {
    return !!(scanData && scanData.ok === true);
  }

  function normalizeFinding(rule, scope, scanData, rawFinding) {
    const safeFinding =
      rawFinding && typeof rawFinding === "object" ? rawFinding : {};

    const finding = {
      ruleId: safeText(safeFinding.ruleId || rule.id),
      ruleName: safeText(safeFinding.ruleName || rule.name),
      category: safeText(safeFinding.category || rule.category || rule.id),
      scope: normalizeScope(safeFinding.scope || scope || rule.scope),
      severity: normalizeSeverity(safeFinding.severity || rule.severity),
      title: safeText(safeFinding.title, "Novedad detectada"),
      description: safeText(
        safeFinding.description,
        safeFinding.detail || rule.description || ""
      ),
      rootName: safeText(
        safeFinding.rootName,
        scanData && scanData.rootName ? scanData.rootName : ""
      ),
      rootPath: safeText(
        safeFinding.rootPath,
        scanData && scanData.rootPath ? scanData.rootPath : ""
      ),
      relativePath: normalizeRelativePath(safeFinding.relativePath),
      absolutePath: safeText(safeFinding.absolutePath),
      actualLabel: safeText(safeFinding.actualLabel, "Actual"),
      expectedLabel: safeText(safeFinding.expectedLabel, "Esperado"),
      exampleLabel: safeText(safeFinding.exampleLabel, "Referencia"),
      actualValue: safeText(safeFinding.actualValue),
      expectedValue: safeText(safeFinding.expectedValue),
      exampleValue: safeText(safeFinding.exampleValue),

      personLabel: safeText(safeFinding.personLabel),
      periodLabel: safeText(safeFinding.periodLabel),
      foundPeriodLabel: safeText(
        safeFinding.foundPeriodLabel || safeFinding.periodLabel
      ),
      missingPeriodLabel: safeText(safeFinding.missingPeriodLabel),
      foundFileName: safeText(safeFinding.foundFileName),
      missingFileName: safeText(safeFinding.missingFileName),
      foundRelativePath: normalizeRelativePath(
        safeFinding.foundRelativePath || safeFinding.relativePath
      ),
      missingExpectedPath: normalizeRelativePath(
        safeFinding.missingExpectedPath
      ),

      primaryActionLabel: safeText(safeFinding.primaryActionLabel),
      primaryActionPath: safeText(safeFinding.primaryActionPath),
      secondaryActionLabel: safeText(safeFinding.secondaryActionLabel),
      secondaryActionPath: safeText(safeFinding.secondaryActionPath),
      tertiaryActionLabel: safeText(safeFinding.tertiaryActionLabel),
      tertiaryActionPath: safeText(safeFinding.tertiaryActionPath)
    };

    finding.id = safeText(safeFinding.id) || buildFindingId(finding);
    return finding;
  }

  function executeRule(rule, scope, scanData, sharedState) {
    if (!rule || typeof rule.run !== "function") {
      return [];
    }

    try {
      const result = rule.run({
        scope: scope,
        scanData: scanData,
        sharedState: sharedState
      });

      const list = Array.isArray(result) ? result : [];
      return list
        .map(function mapFinding(item) {
          return normalizeFinding(rule, scope, scanData, item);
        })
        .filter(function keep(item) {
          return !!item;
        });
    } catch (error) {
      return [
        normalizeFinding(rule, scope, scanData, {
          title: "Error al ejecutar la regla",
          description:
            error && error.message
              ? error.message
              : "La regla no pudo ejecutarse correctamente.",
          actualLabel: "Regla",
          actualValue: safeText(rule.name || rule.id),
          expectedLabel: "Resultado esperado",
          expectedValue: "La regla debía ejecutarse sin errores.",
          exampleLabel: "Referencia",
          exampleValue: safeText(rule.description),
          primaryActionLabel: "",
          primaryActionPath: ""
        })
      ];
    }
  }

  function buildRuleDetail(rule, findingsCount, availableScopes, missingScopes, status) {
    const safeAvailable = Array.isArray(availableScopes) ? availableScopes : [];
    const safeMissing = Array.isArray(missingScopes) ? missingScopes : [];
    if (status === "issues") {
      return findingsCount === 1
        ? "Se detectó 1 novedad."
        : "Se detectaron " + findingsCount + " novedades.";
    }
    if (status === "partial") {
      return "Escaneo incompleto. Falta: " + safeMissing.join(", ") + ".";
    }
    if (status === "waiting") {
      return "Esperando información de " + safeMissing.join(", ") + ".";
    }
    if (safeAvailable.length) {
      return "Sin novedades en las fuentes disponibles.";
    }
    return safeText(rule && rule.description, "Sin novedades.");
  }

  function analyze(sharedState) {
    const safeState =
      sharedState && typeof sharedState === "object" ? sharedState : {};
    const ugpaStamp = safeText(safeState.ugpaResult && safeState.ugpaResult.scannedAt);
    const utetStamp = safeText(safeState.utetResult && safeState.utetResult.scannedAt);
    const discardedKey = (Array.isArray(safeState.discardedFindings) ? safeState.discardedFindings : [])
      .map(function map(item) { return safeText(item && item.id); }).sort().join("|");
    const analysisKey = [ugpaStamp, utetStamp, discardedKey].join("||");
    if (analysisKey && analysisKey === lastAnalysisKey && lastAnalysis) return lastAnalysis;
    const ugpaResult = safeState.ugpaResult;
    const utetResult = safeState.utetResult;

    const rules =
      window.RulesCatalog && typeof window.RulesCatalog.getAll === "function"
        ? window.RulesCatalog.getAll()
        : [];

    const findings = [];
    const ruleResults = [];

    rules.forEach(function eachRule(rule) {
      const normalizedRuleScope = normalizeScope(rule.scope);
      const scopesToEvaluate =
        normalizedRuleScope === "BOTH"
          ? ["UGPA", "UTET"]
          : [normalizedRuleScope];

      const availableScopes = [];
      const missingScopes = [];
      const ruleFindings = [];

      scopesToEvaluate.forEach(function eachScope(scope) {
        const scanData = scope === "UGPA" ? ugpaResult : utetResult;
        if (!hasValidScan(scanData)) {
          missingScopes.push(scope);
          return;
        }

        availableScopes.push(scope);
        const currentFindings = executeRule(rule, scope, scanData, safeState);
        currentFindings.forEach(function eachFinding(finding) {
          ruleFindings.push(finding);
          findings.push(finding);
        });
      });

      let status = "waiting";
      if (availableScopes.length === 0) {
        status = "waiting";
      } else if (ruleFindings.length > 0) {
        status = "issues";
      } else if (missingScopes.length > 0) {
        status = "partial";
      } else {
        status = "ok";
      }

      ruleResults.push({
        id: safeText(rule.id),
        name: safeText(rule.name),
        description: safeText(rule.description),
        detail: buildRuleDetail(
          rule,
          ruleFindings.length,
          availableScopes,
          missingScopes,
          status
        ),
        scope: normalizedRuleScope,
        status: status,
        severity: normalizeSeverity(rule.severity),
        activeCount: ruleFindings.length,
        findingCount: ruleFindings.length,
        availableScopes: availableScopes.slice(),
        missingScopes: missingScopes.slice()
      });
    });

    findings.sort(function sortFindings(left, right) {
      const a = [
        safeText(left.ruleName),
        safeText(left.scope),
        safeText(left.relativePath),
        safeText(left.title),
        safeText(left.personLabel)
      ].join("|");

      const b = [
        safeText(right.ruleName),
        safeText(right.scope),
        safeText(right.relativePath),
        safeText(right.title),
        safeText(right.personLabel)
      ].join("|");

      return a.localeCompare(b, "es", { sensitivity: "base" });
    });

    ruleResults.sort(function sortRules(left, right) {
      return safeText(left.name).localeCompare(safeText(right.name), "es", {
        sensitivity: "base"
      });
    });

    const result = {
      generatedAt: new Date().toISOString(),
      findings: findings,
      ruleResults: ruleResults
    };
    lastAnalysisKey = analysisKey;
    lastAnalysis = result;
    return result;
  }

  window.RulesEngine = {
    analyze: analyze
  };
})(window);