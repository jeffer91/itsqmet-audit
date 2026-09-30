/*
Nombre completo: rule.required-documents.js
Ruta: /screens/rules/rulesets/rule.required-documents.js
Función:
- Comparar cada proceso detectado con "Documentos generados en el proceso" de los manuales UGPA/UTET.
- Revisar por período cuando existe una subcarpeta de período.
- Informar el documento faltante y abrir la carpeta exacta donde debe revisarse/cargarse.
*/
(function (window) {
  "use strict";

  const Types = window.RulesTypes || {};
  const Manual = window.AuditManualCatalog || {};

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalize(value) {
    if (Manual && typeof Manual.normalizeText === "function") {
      return Manual.normalizeText(value);
    }
    return safeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function rel(value) {
    return Types.normalizeRelativePath
      ? Types.normalizeRelativePath(value)
      : safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function isDescendant(target, parent) {
    if (Types.isDescendantOf) return Types.isDescendantOf(target, parent);
    const t = rel(target);
    const p = rel(parent);
    return t === p || t.startsWith(p + "/");
  }

  function candidateText(item) {
    return normalize([
      item && item.name,
      item && item.relativePath
    ].filter(Boolean).join(" "));
  }

  function phraseIncluded(candidate, phrase) {
    const c = " " + normalize(candidate) + " ";
    const p = " " + normalize(phrase) + " ";
    return !!normalize(phrase) && c.includes(p);
  }

  function everyKeyword(candidate, keywords) {
    const c = " " + normalize(candidate) + " ";
    const list = Array.isArray(keywords) ? keywords : [];
    if (!list.length) return false;
    return list.every(function every(keyword) {
      const k = normalize(keyword);
      return k && c.includes(" " + k + " ");
    });
  }

  function everyCode(candidate, codes) {
    const c = normalize(candidate);
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) return false;
    return list.every(function every(code) {
      const codeText = normalize(code);
      return codeText && c.includes(codeText);
    });
  }

  function matchesExpected(expected, item) {
    const text = candidateText(item);
    if (!text) return false;

    const labelMatch = phraseIncluded(text, expected && expected.label);
    const keywordMatch = everyKeyword(text, expected && expected.keywords);
    const codeList = Array.isArray(expected && expected.codes)
      ? expected.codes
      : [];
    const codeMatch = everyCode(text, codeList);

    if (codeList.length) {
      return codeMatch && (labelMatch || keywordMatch);
    }

    return labelMatch || keywordMatch;
  }

  function hasPdfWithin(files, folderRelativePath) {
    return files.some(function some(file) {
      return (
        safeText(file && file.extension).toLowerCase() === ".pdf" &&
        isDescendant(file && file.relativePath, folderRelativePath)
      );
    });
  }

  function buildPeriodContainers(index, processFolder, processNumber, scope) {
    const processRel = rel(processFolder.relativePath);
    const candidates = index.folders
      .filter(function keep(folder) {
        const folderRel = rel(folder && folder.relativePath);
        if (!folderRel || folderRel === processRel) return false;
        if (!isDescendant(folderRel, processRel)) return false;

        const parsed = Types.parsePeriodFolderName
          ? Types.parsePeriodFolderName(
              folder && folder.name,
              "PRO-" + processNumber,
              scope
            )
          : null;

        return !!(parsed && parsed.shouldEvaluate);
      })
      .map(function map(folder) {
        const parsed = Types.parsePeriodFolderName(
          folder && folder.name,
          "PRO-" + processNumber,
          scope
        );
        return {
          ...folder,
          periodValidation: parsed,
          periodLabel:
            safeText(parsed && parsed.normalizedPeriod) ||
            safeText(folder && folder.name)
        };
      });

    const outermost = candidates.filter(function keepOutermost(item) {
      return !candidates.some(function hasAncestor(other) {
        if (other === item) return false;
        const itemRel = rel(item.relativePath);
        const otherRel = rel(other.relativePath);
        return itemRel !== otherRel && isDescendant(itemRel, otherRel);
      });
    });

    if (outermost.length) return outermost;

    return [
      {
        name: processFolder.name,
        path: processFolder.path,
        relativePath: processFolder.relativePath,
        periodLabel: ""
      }
    ];
  }

  function evidenceExists(expected, container, index) {
    const containerRel = rel(container.relativePath);

    const matchingFolders = index.folders.filter(function keep(folder) {
      const folderRel = rel(folder && folder.relativePath);
      if (!folderRel || !isDescendant(folderRel, containerRel)) return false;
      return matchesExpected(expected, folder);
    });

    if (
      matchingFolders.some(function hasPdf(folder) {
        return hasPdfWithin(index.files, folder.relativePath);
      })
    ) {
      return true;
    }

    return index.files.some(function keep(file) {
      if (safeText(file && file.extension).toLowerCase() !== ".pdf") return false;
      if (!isDescendant(file && file.relativePath, containerRel)) return false;
      return matchesExpected(expected, file);
    });
  }

  function buildExpectedLocation(container, expected) {
    const base = rel(container && container.relativePath);
    const label = safeText(expected && expected.label);
    return base ? base + " → " + label : label;
  }

  function createFinding(rule, scope, scanData, processNumber, processInfo, container, expected) {
    const periodLabel = safeText(container && container.periodLabel);
    const finding = {
      ruleId: rule.id,
      ruleName: rule.name,
      category: "required-documents",
      scope: scope,
      severity: rule.severity,
      title: "Documento obligatorio faltante",
      description:
        "El Manual de Procesos establece este documento dentro del proceso " +
        scope +
        "-PRO-" +
        processNumber +
        ".",
      rootName: scanData.rootName || "",
      rootPath: scanData.rootPath || "",
      relativePath: rel(container && container.relativePath),
      absolutePath: safeText(container && container.path) || scanData.rootPath || "",
      actualLabel: "Proceso / período",
      actualValue:
        scope +
        "-PRO-" +
        processNumber +
        (periodLabel ? " · " + periodLabel : ""),
      expectedLabel: "Falta",
      expectedValue: safeText(expected && expected.label),
      exampleLabel: "Referencia del manual",
      exampleValue: safeText(expected && expected.template),
      periodLabel: periodLabel,
      missingPeriodLabel: periodLabel,
      missingFileName: safeText(expected && expected.label),
      missingExpectedPath: buildExpectedLocation(container, expected),
      primaryActionLabel: "Abrir carpeta",
      primaryActionPath: safeText(container && container.path) || scanData.rootPath || ""
    };

    finding.id = Types.buildFindingId
      ? Types.buildFindingId(finding)
      : [
          rule.id,
          scope,
          processNumber,
          periodLabel,
          expected && expected.id
        ].join("|");

    return finding;
  }

  function run(scope, scanData, rule) {
    if (!scanData || scanData.ok !== true) return [];
    if (!Types || typeof Types.buildScanIndex !== "function") return [];
    if (!Manual || typeof Manual.getProcess !== "function") return [];

    const index = Types.buildScanIndex(scanData);
    const processFolders =
      typeof Types.findProcessFolders === "function"
        ? Types.findProcessFolders(index, scope)
        : [];
    const findings = [];

    processFolders.forEach(function eachProcess(processFolder) {
      const parsed =
        processFolder.processValidation ||
        (Types.parseProcessFolderName
          ? Types.parseProcessFolderName(processFolder.name, scope)
          : null);

      if (!parsed || !parsed.valid || !parsed.processNumber) return;

      const processInfo = Manual.getProcess(scope, parsed.processNumber);
      if (!processInfo || !Array.isArray(processInfo.documents)) return;

      const containers = buildPeriodContainers(
        index,
        processFolder,
        parsed.processNumber,
        scope
      );

      containers.forEach(function eachContainer(container) {
        processInfo.documents.forEach(function eachExpected(expected) {
          if (!evidenceExists(expected, container, index)) {
            findings.push(
              createFinding(
                rule,
                scope,
                scanData,
                parsed.processNumber,
                processInfo,
                container,
                expected
              )
            );
          }
        });
      });
    });

    return findings;
  }

  window.RuleRequiredDocuments = {
    id: "required-documents",
    name: "Documentos obligatorios del manual",
    scope: "BOTH",
    severity: "warning",
    description:
      "Compara cada proceso/período con la sección Documentos generados en el proceso de los manuales UGPA y UTET.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
