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

  // Archivos emitidos por un sistema institucional (p. ej. actas de SISACAD)
  // con un patrón propio en lugar del código del manual.
  function matchesSystemPattern(expected, file) {
    return (Array.isArray(expected && expected.systemFilePatterns) ? expected.systemFilePatterns : [])
      .some(function (pattern) {
        try { return new RegExp(pattern, "i").test(safeText(file && file.name)); }
        catch (_error) { return false; }
      });
  }

  // El nombre del PDF (no solo la carpeta) debe identificar el documento requerido.
  function matchesFinalDocument(expected, file, allDocuments) {
    if (safeText(file && file.extension).toLowerCase() !== ".pdf") return false;
    if (matchesSystemPattern(expected, file)) return true;
    if (matchesExpected(expected, { name: file.name, relativePath: "" })) return true;
    // Solo un código de formulario + código de proceso identifica un
    // documento. MEM/OFI/COM generales no acreditan cualquier obligación.
    const codes=Array.isArray(expected&&expected.codes)?expected.codes:[];
    const processSpecific=codes.some(c=>/^PRO-\d+$/i.test(safeText(c)));
    const documentSpecific=codes.some(c=>/(?:^|-)RGI\d+(?:$|-)|(?:^|-)INF(?:$|-)/i.test(safeText(c)));
    // Un mismo código puede referirse a dos documentos en el mismo proceso.
    // Solo se acepta acreditación por código si identifica un único entregable.
    const signature=codes.map(c=>normalize(c)).sort().join("|");
    const ambiguous=(Array.isArray(allDocuments)?allDocuments:[]).some(function(other){
      return other!==expected &&
        (Array.isArray(other&&other.codes)?other.codes:[]).map(c=>normalize(c)).sort().join("|")===signature;
    });
    return !ambiguous && processSpecific && documentSpecific && everyCode(file.name,codes);
  }

  function hasPdfWithin(files, folderRelativePath, expected, allDocuments, container) {
    return files.some(function some(file) {
      return isDescendant(file && file.relativePath, folderRelativePath) &&
        matchesFinalDocument(expected, file, allDocuments) &&
        dateFitsContainer(file, container);
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

    const candidatePaths=new Set(candidates.map(item=>rel(item.relativePath)));
    const outermost = candidates.filter(function keepOutermost(item) {
      let current=rel(item.relativePath);
      while(current.includes("/")){
        current=current.slice(0,current.lastIndexOf("/"));
        if(candidatePaths.has(current))return false;
      }
      return true;
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

  // Fecha AAAA-MM del código del archivo (UGPA-RGI2-01-PRO-70-2025-10, COM-ITSQMET-UTET-2026-04-01).
  function fileCodeMonth(name) {
    const text = safeText(name);
    const match = text.match(/-PRO-\d+-(\d{4})-(0[1-9]|1[0-2])(?:-|\b)/i) ||
      text.match(/-ITSQMET-(?:UGPA|UTET)-(\d{4})-(0[1-9]|1[0-2])-/i);
    return match ? Number(match[1]) * 12 + Number(match[2]) : null;
  }

  function containerMonths(container) {
    const normalized = safeText(container && container.periodValidation && container.periodValidation.normalizedPeriod);
    if (!normalized || !Types.parseSpanishPeriodRange) return null;
    const parsed = Types.parseSpanishPeriodRange(normalized);
    if (!parsed || !parsed.comparable) return null;
    return {
      start: Number(parsed.startYear) * 12 + Number(parsed.startMonth),
      end: Number(parsed.endYear) * 12 + Number(parsed.endMonth)
    };
  }

  // Un archivo codificado con una fecha ajena al período no acredita el documento
  // de ese período (p. ej. el Plan 2025-10 copiado en Abril–Septiembre 2026).
  // Margen: hasta 2 meses antes del inicio (planificación) y 6 después del cierre (informes).
  function dateFitsContainer(file, container) {
    const month = fileCodeMonth(file && file.name);
    const range = containerMonths(container);
    if (month == null || !range) return true;
    return month >= range.start - 2 && month <= range.end + 6;
  }

  function evidenceExists(expected, container, index, allDocuments) {
    const containerRel = rel(container.relativePath);

    const matchingFolders = index.folders.filter(function keep(folder) {
      const folderRel = rel(folder && folder.relativePath);
      if (!folderRel || !isDescendant(folderRel, containerRel)) return false;
      return matchesExpected(expected, folder);
    });

    if (
      matchingFolders.some(function hasPdf(folder) {
        return hasPdfWithin(index.files, folder.relativePath, expected, allDocuments, container);
      })
    ) {
      return true;
    }

    return index.files.some(function keep(file) {
      if (!isDescendant(file && file.relativePath, containerRel)) return false;
      return matchesFinalDocument(expected, file, allDocuments) && dateFitsContainer(file, container);
    });
  }

  // Candidatos por código sin título verificable: no acreditar ni declarar ausente
  // automáticamente un PDF genérico que podría corresponder a otro entregable.
  function findCodeCandidate(expected, container, index) {
    const codes=Array.isArray(expected&&expected.codes)?expected.codes:[];
    if(!codes.length)return null;
    const location=rel(container.relativePath);
    return index.files.find(function(file){
      return safeText(file.extension).toLowerCase()===".pdf" &&
        isDescendant(file.relativePath,location) && everyCode(file.name,codes);
    })||null;
  }

  function buildExpectedLocation(container, expected) {
    const base = rel(container && container.relativePath);
    const label = safeText(expected && expected.label);
    return base ? base + " → " + label : label;
  }

  function createFinding(rule, scope, scanData, processNumber, processInfo, container, expected, candidate) {
    const periodLabel = safeText(container && container.periodLabel);
    const finding = {
      ruleId: rule.id,
      ruleName: rule.name,
      category: "required-documents",
      scope: scope,
      severity: rule.severity,
      title: candidate ? "PDF candidato por verificar" : "Documento obligatorio sin PDF final",
      description:
        (candidate
          ? "Se encontró un PDF con el código compatible, pero su nombre no permite confirmar el documento. No se acredita el cumplimiento ni se declara ausencia. "
          : "No se identificó el PDF final del documento aprobado. ") +
        "El Manual de Procesos establece este documento dentro del proceso " +
        scope +
        "-PRO-" +
        processNumber +
        ". Se requiere el PDF final correspondiente, no solo un Word o Excel.",
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
      candidateFileName: safeText(candidate&&candidate.name),
      candidateFilePath: safeText(candidate&&candidate.path),
      foundFileName: safeText(candidate&&candidate.name),
      foundRelativePath: rel(candidate&&candidate.relativePath),
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
      // Los entregables individuales no son un documento global por proceso.
      // Su ausencia solo puede evaluarse con un padrón de estudiantes y período.
      if (processInfo.documentGranularity === "per-student") return;

      const containers = buildPeriodContainers(
        index,
        processFolder,
        parsed.processNumber,
        scope
      );

      containers.forEach(function eachContainer(container) {
        processInfo.documents.forEach(function eachExpected(expected) {
          if (Manual.isAutomaticDocument &&
              !Manual.isAutomaticDocument(scope, parsed.processNumber, expected)) return;
          if (!evidenceExists(expected, container, index, processInfo.documents)) {
            const candidate=findCodeCandidate(expected,container,index);
            findings.push(
              createFinding(
                rule,
                scope,
                scanData,
                parsed.processNumber,
                processInfo,
                container,
                expected,
                candidate
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
      "Comprueba únicamente documentos aprobados y aplicables. Los PDF con códigos compatibles pero títulos ambiguos son candidatos por verificar, no ausencia definitiva.",
    run: function runRule(context) {
      return run(context.scope, context.scanData, this);
    }
  };
})(window);
