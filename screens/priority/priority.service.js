(function (window) {
  "use strict";

  const Config = window.PriorityConfig;
  const Types = window.RulesTypes || {};
  const Manual = window.AuditManualCatalog || {};
  const DAY = 24 * 60 * 60 * 1000;
  let externalTasks = [];
  function setExternalTasks(items) { externalTasks = Array.isArray(items) ? items.slice() : []; }
  const MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  function safeText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    return text || String(fallback == null ? "" : fallback).trim();
  }

  function normalize(value) {
    if (Manual && typeof Manual.normalizeText === "function") {
      return Manual.normalizeText(value);
    }
    return safeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function rel(value) {
    return safeText(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function mapCategory(finding) {
    const explicit = safeText(finding && finding.category);
    if (explicit) return explicit;
    const ruleId = safeText(finding && finding.ruleId);
    if (ruleId === "empty-folders") return "empty-folders";
    if (ruleId === "folders-without-pdf") return "folders-without-pdf";
    if (ruleId === "non-pdf-files") return "non-pdf";
    if (["standardized-names", "naming-structure", "period-folder-format"].includes(ruleId)) return "names";
    if (["required-documents", "plan-individual-requires-sponsorship", "training-complete-with-4-evidences"].includes(ruleId)) return "required-documents";
    if (ruleId === "root-pdf-policy") return "root-files";
    return "other";
  }

  function areaFromPath(path) {
    const text = normalize(path);
    if (text.includes("procesos estrategicos")) return "strategic";
    if (text.includes("procesos misionales")) return "mission";
    if (text.includes("procesos de apoyo")) return "support";
    return "other";
  }

  function processFromText(value) {
    const match = safeText(value).match(/PRO[\s_-]*(\d+)/i);
    return match ? match[1] : "";
  }

  function processFromFinding(finding) {
    return processFromText([
      finding && finding.relativePath,
      finding && finding.actualValue,
      finding && finding.expectedValue,
      finding && finding.description
    ].join(" "));
  }

  function dateUtc(year, monthIndex, day) {
    return new Date(Date.UTC(year, monthIndex, day));
  }

  function todayUtc() {
    const now = new Date();
    return dateUtc(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function addDays(date, days) {
    return new Date(date.getTime() + Number(days || 0) * DAY);
  }

  function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-EC", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
    }).format(date);
  }

  function periodLabel(period) {
    return MONTHS[period.start.getUTCMonth()] + " " + period.start.getUTCFullYear() +
      " – " + MONTHS[period.end.getUTCMonth()] + " " + period.end.getUTCFullYear();
  }

  function semiannualPeriod(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    if (month >= 9) {
      return { start: dateUtc(year, 9, 1), end: dateUtc(year + 1, 2, 31) };
    }
    if (month >= 3) {
      return { start: dateUtc(year, 3, 1), end: dateUtc(year, 8, 30) };
    }
    return { start: dateUtc(year - 1, 9, 1), end: dateUtc(year, 2, 31) };
  }

  function annualPeriod(date) {
    const year = date.getUTCFullYear();
    if (date.getUTCMonth() >= 9) {
      return { start: dateUtc(year, 9, 1), end: dateUtc(year + 1, 8, 30) };
    }
    return { start: dateUtc(year - 1, 9, 1), end: dateUtc(year, 8, 30) };
  }

  function previousPeriod(period, months) {
    const start = dateUtc(period.start.getUTCFullYear(), period.start.getUTCMonth() - months, 1);
    const nextStart = dateUtc(start.getUTCFullYear(), start.getUTCMonth() + months, 1);
    return { start: start, end: new Date(nextStart.getTime() - DAY) };
  }

  function currentAndPrevious(cadenceMonths, today) {
    const current = cadenceMonths === 12 ? annualPeriod(today) : semiannualPeriod(today);
    return [current, previousPeriod(current, cadenceMonths)];
  }

  function rangeFromParsed(parsed) {
    if (!parsed || !parsed.comparable) return null;
    const startMonth = Number(parsed.startMonth) - 1;
    const endMonth = Number(parsed.endMonth) - 1;
    if (startMonth < 0 || endMonth < 0) return null;
    const endLastDay = dateUtc(Number(parsed.endYear), endMonth + 1, 0).getUTCDate();
    return {
      start: dateUtc(Number(parsed.startYear), startMonth, 1),
      end: dateUtc(Number(parsed.endYear), endMonth, endLastDay)
    };
  }

  function periodFromName(name, processNumber, scope) {
    if (!Types.parsePeriodFolderName || !Types.parseSpanishPeriodRange) return null;
    const validation = Types.parsePeriodFolderName(name, "PRO-" + processNumber, scope);
    if (!validation || !validation.valid || !validation.shouldEvaluate || !validation.normalizedPeriod) return null;
    return rangeFromParsed(Types.parseSpanishPeriodRange(validation.normalizedPeriod));
  }

  function samePeriod(a, b) {
    return !!a && !!b && a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
  }

  function rangeFromFinding(finding, processNumber, scope) {
    const candidates = [finding && finding.periodLabel].concat(rel(finding && finding.relativePath).split("/").reverse());
    for (const candidate of candidates) {
      if (!safeText(candidate)) continue;
      const range = periodFromName(candidate, processNumber, scope);
      if (range) return range;
    }
    return null;
  }

  function stageFromFinding(finding, processNumber, scope) {
    const text = normalize([
      finding && finding.missingFileName,
      finding && finding.expectedValue,
      finding && finding.title
    ].join(" "));
    if (/informe (de )?cumplimiento|informe final|reporte final|informe de impacto/.test(text)) return "close";
    if (/deteccion|planificacion|\bplan\b|cronograma/.test(text)) return "start";

    const profile = Config.strategicProfiles[scope] && Config.strategicProfiles[scope][processNumber];
    if (profile && profile.stages) {
      const values = Object.values(profile.stages);
      if (values.length && values.every(function every(value) { return value === "close"; })) return "close";
    }
    return "ongoing";
  }

  function dueFor(stage, period, today) {
    if (!period) return { level: "", dueDate: null, reason: "" };
    // Una deuda histórica no equivale automáticamente a una urgencia actual.
    // Revisar POA antes de subir su prioridad.
    if (period.end.getTime() < addDays(today, -60).getTime()) {
      return {level:"medium",dueDate:period.end,
        reason:"Rezago de período histórico: verificar vigencia, evidencias y POA antes de ejecutar."};
    }
    if (stage === "start") {
      const due = addDays(period.start, Config.graceDays.start);
      if (today.getTime() > due.getTime()) {
        return { level: "max", dueDate: due, reason: "Superó los 30 días de gracia desde el inicio del período." };
      }
      return { level: "high", dueDate: due, reason: "Está dentro de los 30 días de gracia del inicio del período." };
    }
    if (stage === "close") {
      const due = addDays(period.end, Config.graceDays.close);
      if (today.getTime() > due.getTime()) {
        return { level: "max", dueDate: due, reason: "Superó el plazo general de referencia posterior al cierre del período (confirmar manual)." };
      }
      if (today.getTime() >= period.end.getTime()) {
        return { level: "high", dueDate: due, reason: "El período cerró y está dentro del plazo general de referencia (confirmar manual)." };
      }
      return { level: "low", dueDate: due, reason: "Corresponde al cierre del período; todavía no vence." };
    }
    if (today.getTime() > period.end.getTime()) {
      return { level: "max", dueDate: period.end, reason: "Pertenece a un período ya cerrado." };
    }
    return { level: "medium", dueDate: period.end, reason: "Trabajo pendiente del período vigente." };
  }

  function effortFor(area, processNumber, finding) {
    const text = normalize([
      finding && finding.missingFileName,
      finding && finding.expectedValue,
      finding && finding.title
    ].join(" "));
    if (area === "strategic" || /informe|plan|deteccion|ficha|guia curricular/.test(text)) return "high";
    if (area === "mission" || /acta|reporte|cronograma|oficio/.test(text)) return "medium";
    return "low";
  }

  function levelFallback(area, category) {
    if (category === "empty-folders" || category === "folders-without-pdf") {
      return area === "strategic" ? "high" : "medium";
    }
    if (area === "strategic") return "high";
    if (area === "mission") return "medium";
    return "low";
  }

  function levelDef(id) {
    return Config.levels.find(function find(item) { return item.id === id; }) || Config.levels[3];
  }

  function areaDef(id) {
    return Config.areas[id] || Config.areas.other;
  }

  function effortRank(value) {
    return value === "high" ? 3 : value === "medium" ? 2 : 1;
  }
  const PROGRESS_KEY = "audit_priority_progress_v1";
  function progressMap() {
    if (window.PriorityStorage) {
      const { statuses } = window.PriorityStorage.load();
      return Object.fromEntries(Object.entries(statuses).map(([id, entry]) => [id, entry.status]));
    }
    try {
      const value = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_err) { return {}; }
  }
  function saveProgress(id, status) {
    if (!id || !["pending", "doing", "review", "done"].includes(status))
      throw new Error("Estado de seguimiento no válido.");
    if (window.PriorityStorage) return window.PriorityStorage.setStatus(id, status);
    const map = progressMap();
    if (status === "pending") delete map[id];
    else map[id] = status;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  }
  function classifyIssue(item) {
    const title = normalize(item.title);
    return /nombre de pdf incorrecto|nombre de carpeta incorrecto|carpeta de periodo mal nombrada/.test(title) ? "quick" : "review";
  }

  function taskFromFinding(finding, today) {
    const category = mapCategory(finding);
    if (!["required-documents", "empty-folders", "folders-without-pdf"].includes(category)) return null;
    const scope = safeText(finding.scope).toUpperCase();
    const processNumber = processFromFinding(finding);
    // PRO-60 se evalúa aparte por ciclo bienal y por carrera. La regla genérica
    // del manual no distingue las incorporaciones semestrales ni el formato
    // histórico de fichas, por lo que aquí se evita convertirla en falsos pendientes.
    if (scope === "UGPA" && processNumber === "60" && category === "required-documents") return null;
    const area = areaFromPath(finding.relativePath);
    const stage = stageFromFinding(finding, processNumber, scope);
    const period = processNumber ? rangeFromFinding(finding, processNumber, scope) : null;
    const due = dueFor(stage, period, today);
    const verify = category !== "required-documents" ||
      (category === "required-documents" && !period) ||
      (scope === "UTET" && processNumber === "56" && /articulo academico/.test(normalize(finding.missingFileName || finding.expectedValue)));
    const level = verify ? "medium" : due.level || levelFallback(area, category);
    const manualProcess = Manual.getProcess ? Manual.getProcess(scope, processNumber) : null;
    const title = category === "required-documents"
      ? safeText(finding.missingFileName || finding.expectedValue || finding.title, "Completar documento obligatorio")
      : safeText(finding.title, category === "empty-folders" ? "Completar carpeta vacía" : "Subir documentación PDF");

    return {
      id: "rule|" + safeText(finding.id),
      sourceId: safeText(finding.id),
      sourceTitle: safeText(finding.title),
      scope: scope,
      processNumber: processNumber,
      processName: safeText(manualProcess && manualProcess.name),
      area: area,
      areaLabel: areaDef(area).label,
      level: level,
      levelLabel: levelDef(level).label,
      stage: stage,
      stageLabel: stage === "start" ? "Inicio" : stage === "close" ? "Cierre" : "Ejecución",
      effort: effortFor(area, processNumber, finding),
      periodLabel: period ? periodLabel(period) : safeText(finding.periodLabel),
      dueDate: due.dueDate,
      reason: verify ? (scope === "UTET" && processNumber === "56" && /articulo academico/.test(normalize(title))
        ? "Planificación de Artículo Académico: verificar si aplica a este período antes de elaborar."
        : "Revisar antes de elaborar o corregir: " + safeText(finding.description))
        : due.reason || safeText(finding.description, "Pendiente detectado por las reglas de auditoría."),
      workType: verify ? "review" : "document",
      sourceCategory: category,
      detectedName: safeText(finding.foundLabel || finding.actualValue),
      documentLabel: category === "required-documents" ? title : "",
      title: title,
      pathLabel: safeText(finding.relativePath),
      actionPath: safeText(finding.primaryActionPath || finding.absolutePath || finding.rootPath),
      synthetic: false
    };
  }

  function activeFindings(sharedState) {
    const analysis = window.RulesEngine.analyze(sharedState) || {};
    const findings = Array.isArray(analysis.findings) ? analysis.findings : [];
    const discarded = new Set((sharedState.discardedFindings || []).map(function map(item) {
      return safeText(item && item.id);
    }));
    return findings.filter(function keep(item) { return item && !discarded.has(safeText(item.id)); });
  }

  function scanForScope(sharedState, scope) {
    return scope === "UGPA" ? sharedState.ugpaResult : sharedState.utetResult;
  }

  function findProcessFolder(index, scope, processNumber) {
    if (!Types.findProcessFolders) return null;
    const folders = Types.findProcessFolders(index, scope);
    return folders.find(function find(folder) {
      const parsed = folder.processValidation || (Types.parseProcessFolderName && Types.parseProcessFolderName(folder.name, scope));
      return parsed && String(parsed.processNumber) === String(processNumber);
    }) || null;
  }

  function findPeriodFolder(index, processFolder, processNumber, scope, target) {
    if (!processFolder) return null;
    const parent = rel(processFolder.relativePath);
    return index.folders.find(function find(folder) {
      const folderRel = rel(folder && folder.relativePath);
      if (!folderRel || folderRel === parent || !folderRel.startsWith(parent + "/")) return false;
      if (samePeriod(periodFromName(folder && folder.name, processNumber, scope), target)) return true;
      // Un período mal nombrado puede existir: no ofrecer una carpeta duplicada.
      const txt = normalize(folder && folder.name);
      const first = normalize(MONTHS[target.start.getUTCMonth()] + " " + target.start.getUTCFullYear());
      const last = normalize(MONTHS[target.end.getUTCMonth()] + " " + target.end.getUTCFullYear());
      return txt.includes(first) && txt.includes(last);
    }) || null;
  }

  function onlyCloseProfile(profile) {
    const values = Object.values(profile && profile.stages || {});
    return values.length > 0 && values.every(function every(value) { return value === "close"; });
  }

  function syntheticFolderTask(scope, processNumber, processInfo, processFolder, period, profile, today, missingProcess, areaOverride) {
    const stage = onlyCloseProfile(profile) ? "close" : "start";
    const due = dueFor(stage, period, today);
    const label = periodLabel(period);
    const actionPath = safeText(processFolder && processFolder.path) || safeText(processFolder && processFolder.absolutePath);
    const area = areaOverride || "strategic";
    return {
      id: ["schedule", scope, processNumber, label, missingProcess ? "process" : "period"].join("|"),
      scope: scope,
      processNumber: processNumber,
      processName: safeText(processInfo && processInfo.name),
      area: area,
      areaLabel: areaDef(area).label,
      level: "medium",
      levelLabel: levelDef("medium").label,
      stage: stage,
      stageLabel: "Revisión documental",
      effort: "low",
      periodLabel: label,
      dueDate: null,
      reason: missingProcess
        ? "No se localizó la carpeta de este proceso en el escaneo. Revisar otras ubicaciones antes de crearla."
        : "No se localizó una carpeta específica para este período. La frecuencia del proceso no acredita por sí sola que sea obligatoria.",
      title: missingProcess
        ? "Localizar la carpeta de " + scope + "-PRO-" + processNumber
        : "Verificar la ubicación documental del período",
      pathLabel: safeText(processFolder && processFolder.relativePath),
      actionPath: actionPath,
      parentPath: "",
      proposedFolderName: "",
      workType: "review",
      synthetic: true
    };
  }

  function buildStrategicScheduleTasks(sharedState, today) {
    const tasks = [];
    ["UGPA", "UTET"].forEach(function eachScope(scope) {
      const scan = scanForScope(sharedState, scope);
      if (!scan || scan.ok !== true || !Types.buildScanIndex) return;
      const index = Types.buildScanIndex(scan);
      const profiles = Config.strategicProfiles[scope] || {};

      Object.keys(profiles).forEach(function eachProcess(processNumber) {
        const profile = profiles[processNumber];
        if (profile.special || !profile.cadenceMonths) return;
        const processInfo = Manual.getProcess ? Manual.getProcess(scope, processNumber) : null;
        const processFolder = findProcessFolder(index, scope, processNumber);
        const periods = currentAndPrevious(profile.cadenceMonths, today);

        periods.forEach(function eachPeriod(period, periodIndex) {
          if (!processFolder) {
            if (periodIndex === 0) {
              tasks.push(syntheticFolderTask(scope, processNumber, processInfo, null, period, profile, today, true, "strategic"));
            }
            return;
          }
          if (!findPeriodFolder(index, processFolder, processNumber, scope, period)) {
            tasks.push(syntheticFolderTask(scope, processNumber, processInfo, processFolder, period, profile, today, false, "strategic"));
          }
        });
      });
    });
    return tasks;
  }

  function biennialPeriod(date) {
    const referenceYear = date.getUTCMonth() >= 9
      ? date.getUTCFullYear()
      : date.getUTCFullYear() - 1;
    const offset = ((referenceYear - 2024) % 2 + 2) % 2;
    const startYear = referenceYear - offset;
    const start = dateUtc(startYear, 9, 1);
    const nextStart = dateUtc(startYear + 2, 9, 1);
    return { start: start, end: new Date(nextStart.getTime() - DAY) };
  }

  function isDirectChild(childPath, parentPath) {
    const child = rel(childPath).split("/").filter(Boolean);
    const parent = rel(parentPath).split("/").filter(Boolean);
    if (child.length !== parent.length + 1) return false;
    return child.slice(0, parent.length).join("/") === parent.join("/");
  }

  function overlapsInside(period, cycle) {
    return !!period && period.start.getTime() >= cycle.start.getTime() && period.end.getTime() <= cycle.end.getTime();
  }

  function pro60CareerName(folderName) {
    return safeText(folderName).replace(/^UGPA-PRO-60-/i, "").trim();
  }

  function pro60CareerKey(value) {
    return normalize(pro60CareerName(value)).replace(/gestion de talento humano/g, "gestion del talento humano");
  }

  function buildPro60DocumentTask(params) {
    // La aprobación de fichas, no el cierre calendario + 15 días,
    // determina cuándo puede elaborarse la guía curricular RGI3.
    const p = params.period || params.cycle;
    const isGuide = params.documentId === "guia";
    const priority = isGuide ? "high" : "medium";
    return {
      id: ["pro60", params.careerKey, params.documentId, periodLabel(p)].join("|"),
      scope: "UGPA",
      processNumber: "60",
      processName: "Proceso de Construcción Curricular Continua",
      area: "strategic",
      areaLabel: Config.areas.strategic.label,
      level: priority,
      levelLabel: levelDef(priority).label,
      stage: isGuide ? "after-approval" : "review",
      stageLabel: isGuide ? "Después de aprobar las fichas" : "Revisión documental",
      effort: "high",
      periodLabel: periodLabel(p),
      dueDate: null,
      reason: params.reason + (isGuide
        ? " Se localizaron fichas de análisis; confirmar su aprobación antes de elaborar la guía. No se ha verificado un vencimiento específico."
        : " Verificar otras ubicaciones y la vigencia del período antes de elaborar el documento."),
      title: params.title + " · " + params.careerName,
      documentId: params.documentId,
      careerName: params.careerName,
      sourceCategory: "required-documents",
      pathLabel: safeText(params.careerFolder && params.careerFolder.relativePath),
      actionPath: safeText(params.actionPath || (params.careerFolder && params.careerFolder.path)),
      workType: "document",
      synthetic: true
    };
  }

  function buildPro60Tasks(sharedState, today) {
    const scan = scanForScope(sharedState, "UGPA");
    if (!scan || scan.ok !== true || !Types.buildScanIndex) return [];
    const index = Types.buildScanIndex(scan);
    const processFolder = findProcessFolder(index, "UGPA", "60");
    if (!processFolder) return [];

    const currentCycle = biennialPeriod(today);
    const previousCycle = previousPeriod(currentCycle, 24);
    const processRel = rel(processFolder.relativePath);

    const periodFolders = index.folders.filter(function keep(folder) {
      if (!isDirectChild(folder.relativePath, processRel)) return false;
      const parsed = periodFromName(folder.name, "60", "UGPA");
      return overlapsInside(parsed, previousCycle);
    });

    const tasks = [];
    const currentHasContainer = index.folders.some(function some(folder) {
      if (!isDirectChild(folder.relativePath, processRel)) return false;
      return overlapsInside(periodFromName(folder.name, "60", "UGPA"), currentCycle);
    });

    if (!currentHasContainer) {
      tasks.push({
        id: "pro60|cycle|" + periodLabel(currentCycle),
        scope: "UGPA",
        processNumber: "60",
        processName: "Proceso de Construcción Curricular Continua",
        area: "strategic",
        areaLabel: Config.areas.strategic.label,
        level: "medium",
        levelLabel: levelDef("medium").label,
        stage: "review",
        stageLabel: "Revisión de ciclo",
        effort: "low",
        periodLabel: periodLabel(currentCycle),
        dueDate: null,
        reason: "No se identificó un contenedor para el ciclo bienal actual. Revisar la estructura real y las incorporaciones de carreras antes de crear nuevas carpetas.",
        title: "Verificar organización del nuevo ciclo curricular",
        pathLabel: processRel,
        actionPath: safeText(processFolder.path),
        parentPath: "",
        proposedFolderName: "",
        workType: "review",
        synthetic: true
      });
    }

    const careers = new Map();
    periodFolders.forEach(function eachPeriod(periodFolder) {
      index.folders.forEach(function eachFolder(folder) {
        if (!isDirectChild(folder.relativePath, periodFolder.relativePath)) return;
        const name = pro60CareerName(folder.name);
        const key = pro60CareerKey(name);
        if (!key || key === "acta" || key === "fichas") return;
        if (!careers.has(key)) careers.set(key, { name: name, folders: [] });
        careers.get(key).folders.push(folder);
      });
    });

    careers.forEach(function eachCareer(career, careerKey) {
      const careerFiles = [];
      const careerFolders = [];
      career.folders.forEach(function eachBase(base) {
        index.files.forEach(function eachFile(file) {
          if (Types.isDescendantOf ? Types.isDescendantOf(file.relativePath, base.relativePath) : rel(file.relativePath).startsWith(rel(base.relativePath) + "/")) {
            if (safeText(file.extension).toLowerCase() === ".pdf") careerFiles.push(file);
          }
        });
        index.folders.forEach(function eachSub(folder) {
          if (Types.isDescendantOf ? Types.isDescendantOf(folder.relativePath, base.relativePath) : rel(folder.relativePath).startsWith(rel(base.relativePath) + "/")) {
            careerFolders.push(folder);
          }
        });
      });

      const hasActa = careerFiles.some(function some(file) {
        const text = normalize([file.name, file.relativePath].join(" "));
        return text.includes("acta") && text.includes("pro 60");
      });
      const hasFicha = careerFiles.some(function some(file) {
        const text = normalize([file.name, file.relativePath].join(" "));
        return text.includes("ficha") || text.includes("pro 60 fichas") || /ugpa rgi2/.test(text);
      });
      const hasGuide = careerFiles.some(function some(file) {
        const text = normalize([file.name, file.relativePath].join(" "));
        return text.includes("guia curricular") || /\brgi3\b/.test(text);
      });

      const latestBase = career.folders.slice().sort(function sort(a, b) {
        return rel(b.relativePath).localeCompare(rel(a.relativePath), "es");
      })[0];
      const actualContainer = periodFolders.find(function find(folder) {
        return isDirectChild(latestBase.relativePath, folder.relativePath);
      });
      const actualPeriod = actualContainer && periodFromName(actualContainer.name, "60", "UGPA") || previousCycle;
      function targetPath(kind) {
        const wanted = kind === "acta" ? "acta" : kind === "ficha" ? "fichas" : "";
        const found = careerFolders.find(function find(folder) {
          return wanted && normalize(folder.name).includes(wanted);
        });
        return safeText(found && found.path) || safeText(latestBase && latestBase.path);
      }

      if (!hasActa) tasks.push(buildPro60DocumentTask({
        careerKey: careerKey, careerName: career.name, careerFolder: latestBase,
        documentId: "acta", title: "Falta Acta de reunión de colectivos docentes",
        reason: "No se encontró el Acta RGI1 de esta carrera dentro del ciclo bienal.",
        actionPath: targetPath("acta"), cycle: previousCycle, period: actualPeriod, today: today
      }));
      if (!hasFicha) tasks.push(buildPro60DocumentTask({
        careerKey: careerKey, careerName: career.name, careerFolder: latestBase,
        documentId: "ficha", title: "Faltan fichas de análisis curricular",
        reason: "No se encontraron fichas de nivel de esta carrera. Se aceptan las fichas históricas por carrera y el formato UGPA-RGI2 vigente.",
        actionPath: targetPath("ficha"), cycle: previousCycle, period: actualPeriod, today: today
      }));
      if (!hasGuide) tasks.push(buildPro60DocumentTask({
        careerKey: careerKey, careerName: career.name, careerFolder: latestBase,
        documentId: "guia", title: "Falta Guía Curricular de Aplicación Académica",
        reason: "No se encontró la guía curricular RGI3 de esta carrera dentro del ciclo bienal.",
        actionPath: targetPath("guide"), cycle: previousCycle, period: actualPeriod, today: today
      }));
    });

    return tasks;
  }

  function cadenceForDate(policy, date) {
    let months = Number(policy && policy.months) || 0;
    const currentKey = date.getUTCFullYear() * 12 + date.getUTCMonth() + 1;
    (Array.isArray(policy && policy.versions) ? policy.versions : [])
      .slice()
      .sort(function sort(a, b) { return safeText(a && a.from).localeCompare(safeText(b && b.from)); })
      .forEach(function each(version) {
        const match = safeText(version && version.from).match(/^(\d{4})-(\d{2})$/);
        if (!match) return;
        const versionKey = Number(match[1]) * 12 + Number(match[2]);
        if (versionKey <= currentKey) months = Number(version.months) || months;
      });
    return months;
  }

  function buildOtherScheduleTasks(sharedState, today) {
    const tasks = [];
    ["UGPA", "UTET"].forEach(function eachScope(scope) {
      const scan = scanForScope(sharedState, scope);
      if (!scan || scan.ok !== true || !Types.buildScanIndex || !Types.findProcessFolders) return;
      const index = Types.buildScanIndex(scan);
      Types.findProcessFolders(index, scope).forEach(function eachProcess(processFolder) {
        const parsed = processFolder.processValidation || (Types.parseProcessFolderName && Types.parseProcessFolderName(processFolder.name, scope));
        const processNumber = safeText(parsed && parsed.processNumber);
        if (!processNumber) return;
        const strategicProfile = Config.strategicProfiles[scope] && Config.strategicProfiles[scope][processNumber];
        if (strategicProfile) return;
        const processInfo = Manual.getProcess ? Manual.getProcess(scope, processNumber) : null;
        const policy = processInfo && processInfo.periodPolicy;
        // Una frecuencia semestral/anual no impone por sí sola un directorio de ese período.
        // Solo se crean hallazgos de carpeta cuando una política explícita lo exige.
        if (!policy || !policy.required || processInfo.periodFolderRequired !== true) return;
        const cadence = cadenceForDate(policy, today);
        if (cadence !== 6 && cadence !== 12) return;
        const area = areaFromPath(processFolder.relativePath);
        if (area === "other") return;
        currentAndPrevious(cadence, today).forEach(function eachPeriod(period) {
          if (!findPeriodFolder(index, processFolder, processNumber, scope, period)) {
            tasks.push(syntheticFolderTask(
              scope, processNumber, processInfo, processFolder, period,
              { effort: area === "mission" ? "medium" : "low", stages: {} },
              today, false, area
            ));
          }
        });
      });
    });
    return tasks;
  }

  function duplicateGenericMissingPeriod(task, syntheticTasks) {
    if (!task || task.synthetic || !task.sourceId) return false;
    if (!/carpeta de periodo faltante/i.test(normalize(task.sourceTitle))) return false;
    return syntheticTasks.some(function some(other) {
      return other.scope === task.scope && other.processNumber === task.processNumber &&
        normalize(other.periodLabel) === normalize(task.periodLabel);
    });
  }

  // Sugerir nombres solo cuando son inequívocos. La norma del manual puede
  // describir el formato, pero esa descripción NO es un nombre de carpeta.
  function proposedName(finding) {
    const title = normalize(finding && finding.title);
    const actual = safeText(finding && finding.actualValue);
    const expected = safeText(finding && finding.expectedValue);
    if (/^nombre de (pdf|carpeta) incorrecto$/.test(title)) {
      return expected && !/usar uno de|formato oficial|mes aaaa|meses/.test(normalize(expected))
        ? expected : "";
    }
    if (title !== "carpeta de periodo mal nombrada" || !actual) return "";
    const match = actual.match(/^(.*?)\b(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})\s+(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})$/i);
    if (!match || !Types.parsePeriodFolderName) return "";
    const suggestion = match[1] + match[2] + " " + match[3] + "–" + match[4] + " " + match[5];
    const processNumber = processFromFinding(finding);
    if (!processNumber) return "";
    const validation = Types.parsePeriodFolderName(suggestion, "PRO-" + processNumber, safeText(finding.scope).toUpperCase());
    return validation && validation.valid ? suggestion : "";
  }

  function inconsistencyFromFinding(finding) {
    const category = mapCategory(finding);
    if (["required-documents", "empty-folders", "folders-without-pdf"].includes(category)) return null;
    return {
      id: "issue|" + safeText(finding.id),
      scope: safeText(finding.scope).toUpperCase(),
      processNumber: processFromFinding(finding),
      category: category,
      area: areaFromPath(finding.relativePath),
      title: safeText(finding.title, "Inconsistencia detectada"),
      description: safeText(finding.description),
      actual: safeText(finding.actualValue),
      expected: safeText(finding.expectedValue),
      suggestedName: proposedName(finding),
      pathLabel: safeText(finding.relativePath),
      actionPath: safeText(finding.primaryActionPath || finding.absolutePath || finding.rootPath),
      workType: classifyIssue(finding)
    };
  }

  function groupInconsistencies(items) {
    const groups = new Map();
    (Array.isArray(items) ? items : []).forEach(function each(item) {
      const key = [item.scope, item.processNumber || "", item.category, item.title].join("|");
      if (!groups.has(key)) {
        groups.set(key, { ...item, groupCount: 0, examples: [], items: [] });
      }
      const group = groups.get(key);
      group.groupCount += 1;
      group.items.push(item);
      if (group.examples.length < 3 && item.pathLabel) group.examples.push(item.pathLabel);
    });
    return Array.from(groups.values()).sort(function sort(a, b) {
      return b.groupCount - a.groupCount || safeText(a.title).localeCompare(safeText(b.title), "es");
    });
  }

  function structuralInconsistencies(sharedState) {
    const issues = [];
    ["UGPA", "UTET"].forEach(function eachScope(scope) {
      const scan = scanForScope(sharedState, scope);
      if (!scan || scan.ok !== true || !Types.buildScanIndex) return;
      const index = Types.buildScanIndex(scan);
      Object.keys(Config.areas).filter(function keep(key) { return key !== "other"; }).forEach(function eachArea(key) {
        const expected = Config.areas[key].folder;
        const exists = index.folders.some(function some(folder) {
          const parts = rel(folder && folder.relativePath).split("/").filter(Boolean);
          return parts.length === 1 && normalize(parts[0]) === normalize(expected);
        });
        if (!exists) {
          issues.push({
            id: ["structure", scope, key].join("|"),
            scope: scope,
            category: "structure",
            area: key,
            title: "Carpeta principal faltante: " + expected,
            description: "El escaneo no contiene la carpeta principal requerida para este tipo de procesos.",
            actual: "No encontrada",
            expected: expected,
            pathLabel: "",
            actionPath: safeText(scan.rootPath),
            workType: "review"
          });
        }
      });
    });
    return issues;
  }

  function sortTasks(tasks) {
    tasks.sort(function compare(a, b) {
      const byUrgency = levelDef(b.level).rank - levelDef(a.level).rank;
      if (byUrgency) return byUrgency;
      const byArea = areaDef(b.area).rank - areaDef(a.area).rank;
      if (byArea) return byArea;
      const byEffort = effortRank(a.effort) - effortRank(b.effort);
      if (byEffort) return byEffort;
      const byScope = safeText(a.scope).localeCompare(safeText(b.scope), "es");
      if (byScope) return byScope;
      return safeText(a.title).localeCompare(safeText(b.title), "es", { sensitivity: "base" });
    });
    return tasks;
  }

  function haystack(item) {
    return normalize([
      item.scope, item.title, item.processNumber, item.processName, item.periodLabel,
      item.areaLabel, item.stageLabel, item.pathLabel, item.reason, item.description,
      item.actual, item.expected
    ].join(" "));
  }

  function applyFilters(tasks, filters) {
    const search = normalize(filters.search);
    return tasks.filter(function keep(task) {
      if (filters.scope !== "all" && task.scope !== filters.scope) return false;
      if (filters.process && filters.process !== "all" && task.scope+"-"+task.processNumber !== filters.process) return false;
      if (filters.area !== "all" && task.area !== filters.area) return false;
      if (filters.level !== "all" && task.level !== filters.level) return false;
      if (filters.workType !== "all" && task.workType !== filters.workType) return false;
      if (filters.status !== "all" && task.status !== filters.status) return false;
      return !search || haystack(task).includes(search);
    });
  }

  function buildViewModel(filters) {
    const shared = window.AppStore.get();
    const today = todayUtc();
    const progress = progressMap();
    const findings = activeFindings(shared);
    const synthetic = buildStrategicScheduleTasks(shared, today).concat(
      buildPro60Tasks(shared, today), buildOtherScheduleTasks(shared, today)
    );
    const fromRules = findings.map(function (finding) { return taskFromFinding(finding, today); }).filter(Boolean);
    const tasks = synthetic.concat(fromRules.filter(function (task) {
      return !duplicateGenericMissingPeriod(task, synthetic);
    }),externalTasks).map(function (task) {
      const scan = scanForScope(shared, task.scope);
      const localFolder = !!(scan && scan.source && scan.source.kind === "folder");
      return {...task, status: progress[task.id] || "pending",
        parentPath: localFolder ? task.parentPath : "",
        proposedFolderName: localFolder ? task.proposedFolderName : ""};
    });
    sortTasks(tasks);

    const filtersSafe = Object.assign({scope:"all",process:"all",area:"all",level:"all",workType:"all",status:"all",search:""},filters || {});
    const visibleTasks = applyFilters(tasks,filtersSafe);
    const allIssues = findings.map(inconsistencyFromFinding).filter(Boolean).concat(structuralInconsistencies(shared))
      .map(function (issue) {
        const groupId = ["group", issue.scope, issue.processNumber || "", issue.category || "", issue.title].join("|");
        return { ...issue, status: progress[groupId] || progress[issue.id] || "pending" };
      });
    const visibleIssues = allIssues.filter(function (issue) {
      return (filtersSafe.scope === "all" || filtersSafe.scope === issue.scope) &&
        (filtersSafe.process === "all" || (issue.processNumber && issue.scope+"-"+issue.processNumber === filtersSafe.process)) &&
        (filtersSafe.area === "all" || filtersSafe.area === issue.area) &&
        (filtersSafe.workType === "all" || filtersSafe.workType === issue.workType) &&
        (filtersSafe.status === "all" || filtersSafe.status === issue.status) &&
        (!normalize(filtersSafe.search) || haystack(issue).includes(normalize(filtersSafe.search)));
    });
    const grouped = groupInconsistencies(visibleIssues);
    // Los indicadores y el estado de cada proceso representan todo el escaneo,
    // no solo los elementos visibles bajo filtros de prioridad o tipo de trabajo.
    const processes = window.PriorityProcesses ? window.PriorityProcesses.buildRows(shared,tasks,allIssues,filtersSafe) : [];
    const counts = {};
    Config.levels.forEach(function (def) {
      counts[def.id] = visibleTasks.filter(function (item) { return item.level === def.id; }).length;
    });
    const buckets = { quick:0, review:0, document:0 };
    tasks.concat(allIssues).forEach(function (item) {
      if (buckets[item.workType] !== undefined) buckets[item.workType] += 1;
    });
    const scansLabel = ["UGPA","UTET"].map(function (scope) {
      const scan = scanForScope(shared,scope);
      return scope + ": " + (scan && scan.ok && scan.scannedAt
        ? new Date(scan.scannedAt).toLocaleString("es-EC") : "sin escaneo");
    }).join(" · ");
    return {
      todayLabel:formatDate(today), scansLabel:scansLabel,
      noScan:!(shared.ugpaResult && shared.ugpaResult.ok) && !(shared.utetResult && shared.utetResult.ok),
      tasks:visibleTasks, inconsistencies:grouped, processes:processes, counts:counts, workCounts:buckets,
      totalTasks:tasks.length, totalInconsistencies:allIssues.length,
      visibleInconsistencies:visibleIssues.length, inconsistencyGroups:grouped.length, filters:filtersSafe
    };
  }

  function exportedTasks(tasks) {
    // Los informes comparten los mismos nombres contrastados con el escaneo y el manual.
    const ctx=window.PriorityNames ? window.PriorityNames.prepare() : null;
    return (tasks||[]).map(function (task) {
      if (!ctx) return task;
      const named=window.PriorityNames.rename(task,ctx);
      return Object.assign({},task,{
        title: named.displayTitle || task.title,
        officialName: named.officialName,
        sourceFileName: named.sourceFileName,
        referenceFileName: named.referenceFileName,
        expectedTemplate: named.expectedTemplate
      });
    });
  }

  async function exportPdf(filters) {
    const vm = buildViewModel(filters || {});
    if (!vm.tasks.length && !vm.inconsistencies.length) throw new Error("No hay pendientes ni inconsistencias para exportar con los filtros actuales.");
    if (!window.api || !window.api.pdf) throw new Error("La API de exportación PDF no está disponible.");
    const response = await window.api.pdf.export({
      mode: "priority",
      generatedAt: new Date().toISOString(),
      tasks: exportedTasks(vm.tasks),
      inconsistencies: vm.inconsistencies,
      processes: vm.processes,
      rawInconsistenciesCount: vm.visibleInconsistencies,
      counts: vm.counts,
      scansLabel: vm.scansLabel,
      workType: vm.filters.workType
    });
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "No se pudo generar el PDF de prioridades.");
    }
    return response;
  }

  async function exportExcel(filters) {
    const vm=buildViewModel(filters||{});
    if(!vm.tasks.length&&!vm.inconsistencies.length)
      throw new Error("No hay pendientes ni inconsistencias para exportar con los filtros actuales.");
    if(!window.api||!window.api.excel||!window.api.excel.export)
      throw new Error("La API de Excel no está disponible.");
    const response=await window.api.excel.export({
      tasks:exportedTasks(vm.tasks),inconsistencies:vm.inconsistencies,
      processes:vm.processes,scansLabel:vm.scansLabel,filters:vm.filters
    });
    if(!response||!response.ok)throw new Error(response&&response.error||"No se pudo exportar Excel.");
    return response;
  }

  async function openPath(targetPath) {
    if (!targetPath) throw new Error("No hay una ruta disponible para este pendiente.");
    if (!window.api || !window.api.shell) throw new Error("La API para abrir rutas no está disponible.");
    const response = await window.api.shell.openPath(targetPath);
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "No se pudo abrir la carpeta.");
    }
    return response;
  }

  async function createFolder(task) {
    if (!task || !task.parentPath || !task.proposedFolderName || task.workType !== "quick")
      throw new Error("No existe una carpeta de destino verificada.");
    const response = await window.api.shell.createFolder(task.scope, task.parentPath, task.proposedFolderName);
    if (!response || !response.ok) throw new Error(response && response.error || "No se pudo crear la carpeta.");
    return response;
  }
  window.PriorityService = {
    buildViewModel: buildViewModel, setExternalTasks: setExternalTasks, openPath: openPath, exportPdf: exportPdf, exportExcel: exportExcel,
    saveProgress: saveProgress, createFolder: createFolder
  };
})(window);
