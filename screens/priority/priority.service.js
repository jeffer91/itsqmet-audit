(function (window) {
  "use strict";

  const Config = window.PriorityConfig;
  const Types = window.RulesTypes || {};
  const Manual = window.AuditManualCatalog || {};
  const DAY = 24 * 60 * 60 * 1000;
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
    if (!validation || !validation.shouldEvaluate || !validation.normalizedPeriod) return null;
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
        return { level: "max", dueDate: due, reason: "Superó los 15 días de gracia posteriores al cierre del período." };
      }
      if (today.getTime() >= period.end.getTime()) {
        return { level: "high", dueDate: due, reason: "El período cerró y está dentro de los 15 días de gracia." };
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
    const level = due.level || levelFallback(area, category);
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
      reason: due.reason || safeText(finding.description, "Pendiente detectado por las reglas de auditoría."),
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
      return samePeriod(periodFromName(folder && folder.name, processNumber, scope), target);
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
      level: due.level,
      levelLabel: levelDef(due.level).label,
      stage: stage,
      stageLabel: stage === "close" ? "Cierre" : "Inicio",
      effort: profile.effort || "high",
      periodLabel: label,
      dueDate: due.dueDate,
      reason: missingProcess
        ? "No existe la carpeta del proceso estratégico en el escaneo. " + due.reason
        : "No existe la carpeta de este período. " + due.reason,
      title: missingProcess
        ? "Crear carpeta de " + scope + "-PRO-" + processNumber
        : "Crear carpeta del período",
      pathLabel: safeText(processFolder && processFolder.relativePath),
      actionPath: actionPath,
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
    return normalize(pro60CareerName(value));
  }

  function buildPro60DocumentTask(params) {
    const due = dueFor("close", params.cycle, params.today);
    return {
      id: ["pro60", params.careerKey, params.documentId, periodLabel(params.cycle)].join("|"),
      scope: "UGPA",
      processNumber: "60",
      processName: "Proceso de Construcción Curricular Continua",
      area: "strategic",
      areaLabel: Config.areas.strategic.label,
      level: due.level,
      levelLabel: levelDef(due.level).label,
      stage: "close",
      stageLabel: "Cierre bienal",
      effort: "high",
      periodLabel: periodLabel(params.cycle),
      dueDate: due.dueDate,
      reason: params.reason + " " + due.reason,
      title: params.title + " · " + params.careerName,
      pathLabel: safeText(params.careerFolder && params.careerFolder.relativePath),
      actionPath: safeText(params.actionPath || (params.careerFolder && params.careerFolder.path)),
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
      const due = dueFor("start", currentCycle, today);
      tasks.push({
        id: "pro60|cycle|" + periodLabel(currentCycle),
        scope: "UGPA",
        processNumber: "60",
        processName: "Proceso de Construcción Curricular Continua",
        area: "strategic",
        areaLabel: Config.areas.strategic.label,
        level: due.level,
        levelLabel: levelDef(due.level).label,
        stage: "start",
        stageLabel: "Inicio bienal",
        effort: "high",
        periodLabel: periodLabel(currentCycle),
        dueDate: due.dueDate,
        reason: "El proceso trabaja en ciclos de 24 meses. Las nuevas carreras pueden incorporarse cada 6 meses sin crear un nuevo ciclo bienal. " + due.reason,
        title: "Iniciar ciclo bienal de Construcción Curricular",
        pathLabel: processRel,
        actionPath: safeText(processFolder.path),
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
        actionPath: targetPath("acta"), cycle: previousCycle, today: today
      }));
      if (!hasFicha) tasks.push(buildPro60DocumentTask({
        careerKey: careerKey, careerName: career.name, careerFolder: latestBase,
        documentId: "ficha", title: "Faltan fichas de análisis curricular",
        reason: "No se encontraron fichas de nivel de esta carrera. Se aceptan las fichas históricas por carrera y el formato UGPA-RGI2 vigente.",
        actionPath: targetPath("ficha"), cycle: previousCycle, today: today
      }));
      if (!hasGuide) tasks.push(buildPro60DocumentTask({
        careerKey: careerKey, careerName: career.name, careerFolder: latestBase,
        documentId: "guia", title: "Falta Guía Curricular de Aplicación Académica",
        reason: "No se encontró la guía curricular RGI3 de esta carrera dentro del ciclo bienal.",
        actionPath: targetPath("guide"), cycle: previousCycle, today: today
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
        if (!policy || !policy.required) return;
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
      return other.scope === task.scope && other.processNumber === task.processNumber;
    });
  }

  function inconsistencyFromFinding(finding) {
    const category = mapCategory(finding);
    if (["required-documents", "empty-folders", "folders-without-pdf"].includes(category)) return null;
    return {
      id: "issue|" + safeText(finding.id),
      scope: safeText(finding.scope).toUpperCase(),
      category: category,
      title: safeText(finding.title, "Inconsistencia detectada"),
      description: safeText(finding.description),
      actual: safeText(finding.actualValue),
      expected: safeText(finding.expectedValue),
      pathLabel: safeText(finding.relativePath),
      actionPath: safeText(finding.primaryActionPath || finding.absolutePath || finding.rootPath)
    };
  }

  function groupInconsistencies(items) {
    const groups = new Map();
    (Array.isArray(items) ? items : []).forEach(function each(item) {
      const key = [item.scope, item.category, item.title].join("|");
      if (!groups.has(key)) {
        groups.set(key, { ...item, groupCount: 0, examples: [] });
      }
      const group = groups.get(key);
      group.groupCount += 1;
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
            title: "Carpeta principal faltante: " + expected,
            description: "El escaneo no contiene la carpeta principal requerida para este tipo de procesos.",
            actual: "No encontrada",
            expected: expected,
            pathLabel: "",
            actionPath: safeText(scan.rootPath)
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
      const byEffort = effortRank(b.effort) - effortRank(a.effort);
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
      if (filters.area !== "all" && task.area !== filters.area) return false;
      if (filters.level !== "all" && task.level !== filters.level) return false;
      return !search || haystack(task).includes(search);
    });
  }

  function buildViewModel(filters) {
    const sharedState = window.AppStore.get();
    const today = todayUtc();
    const findings = activeFindings(sharedState);
    const syntheticTasks = buildStrategicScheduleTasks(sharedState, today).concat(
      buildPro60Tasks(sharedState, today),
      buildOtherScheduleTasks(sharedState, today)
    );
    const findingTasks = findings.map(function map(item) { return taskFromFinding(item, today); }).filter(Boolean);
    const tasks = syntheticTasks.concat(findingTasks.filter(function keep(task) {
      return !duplicateGenericMissingPeriod(task, syntheticTasks);
    }));
    sortTasks(tasks);

    const safeFilters = Object.assign({ scope: "all", area: "all", level: "all", search: "" }, filters || {});
    const visibleTasks = applyFilters(tasks, safeFilters);
    const rawInconsistencies = findings.map(inconsistencyFromFinding).filter(Boolean).concat(structuralInconsistencies(sharedState));
    const inconsistencies = groupInconsistencies(rawInconsistencies);
    const visibleIssues = inconsistencies.filter(function keep(item) {
      if (safeFilters.scope !== "all" && item.scope !== safeFilters.scope) return false;
      return !normalize(safeFilters.search) || haystack(item).includes(normalize(safeFilters.search));
    });

    const counts = {};
    Config.levels.forEach(function each(level) {
      counts[level.id] = tasks.filter(function keep(item) { return item.level === level.id; }).length;
    });

    return {
      todayLabel: formatDate(today),
      noScan: !(sharedState.ugpaResult && sharedState.ugpaResult.ok) && !(sharedState.utetResult && sharedState.utetResult.ok),
      tasks: visibleTasks,
      inconsistencies: visibleIssues,
      counts: counts,
      totalTasks: tasks.length,
      totalInconsistencies: rawInconsistencies.length,
      inconsistencyGroups: inconsistencies.length,
      filters: safeFilters
    };
  }

  async function exportPdf(filters) {
    const vm = buildViewModel(filters || {});
    if (!vm.tasks.length) throw new Error("No hay pendientes para exportar con los filtros actuales.");
    if (!window.api || !window.api.pdf) throw new Error("La API de exportación PDF no está disponible.");
    const response = await window.api.pdf.export({
      mode: "priority",
      generatedAt: new Date().toISOString(),
      tasks: vm.tasks,
      inconsistencies: vm.inconsistencies,
      rawInconsistenciesCount: vm.totalInconsistencies,
      counts: vm.counts
    });
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "No se pudo generar el PDF de prioridades.");
    }
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

  window.PriorityService = {
    buildViewModel: buildViewModel,
    openPath: openPath,
    exportPdf: exportPdf
  };
})(window);
