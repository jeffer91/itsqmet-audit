(function (window) {
  "use strict";
  const MAX = 5;
  const RANK = { max: 4, high: 3, medium: 2, low: 1 };
  const val = x => String(x == null ? "" : x).trim();

  function candidateTasks(vm) {
    const tasks = (vm.tasks || []).map(function(item) {
      return Object.assign({}, item, { origin: "task" });
    });
    // Los hallazgos masivos se trabajan por grupos, no como miles de tareas.
    const groups = (vm.inconsistencies || []).map(function(group) {
      const id = ["group", group.scope, group.processNumber || "", group.category || "", group.title].join("|");
      const quick = group.workType === "quick";
      return {
        id, origin: "group", scope: group.scope,
        processNumber: group.processNumber || "", area: group.area || "other",
        // Las correcciones de nombres y carpetas son rápidas y van primero;
        // corregirlas antes evita elaborar documentos que ya existen.
        level: quick ? "medium" : "low", levelLabel: quick ? "Media" : "Baja",
        workType: quick ? "quick" : "review", title: group.title,
        nextAction: quick ? "Corregir los nombres de este grupo" : "Revisar las observaciones de este grupo",
        reason: group.description || "Comprobar los hallazgos antes de corregir.",
        actionPath: group.actionPath, pathLabel: group.pathLabel,
        groupCount: Number(group.groupCount || (group.items || []).length || 1),
        groupItems: (group.items || []).slice(0, 12),
        category: group.category, proposedFolderName: "", effort: "low"
      };
    });
    const seen = new Set();
    return tasks.concat(groups).filter(function(item) {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  // Bloques de trabajo: 1) nombres y carpetas, 2) documentos, 3) revisiones.
  const PERIOD_FOLDER = /carpeta de per[ií]odo|nombre de carpeta/i;
  function block(item) {
    if (item.workType === "quick") return 1;
    if (item.workType === "document") return 2;
    return 3;
  }
  function deadlineBonus(item) {
    if (!item.dueDate) return 0;
    const due = new Date(item.dueDate);
    if (Number.isNaN(due.getTime())) return 0;
    const remaining = (due.getTime() - Date.now()) / 86400000;
    // Un mayor atraso nunca resta urgencia.
    if (remaining < 0) return 18 + Math.min(12, Math.floor(-remaining / 30) * 2);
    if (remaining <= 7) return 18;
    if (remaining <= 21) return 10;
    return 0;
  }
  function closedPeriodAge(item) {
    // Sin fecha institucional (UTET) no hay mora, pero un período cerrado hace
    // más tiempo se ordena antes que uno recién cerrado.
    if (item.dueDate || !item.periodEnd) return 0;
    const end = new Date(item.periodEnd);
    if (Number.isNaN(end.getTime())) return 0;
    const months = (Date.now() - end.getTime()) / (30 * 86400000);
    return months > 0 ? Math.min(8, Math.floor(months)) : 0;
  }
  function score(item) {
    const historical = item.historical === true ||
      /rezago de per[ií]odo hist[oó]rico/i.test(val(item.reason));
    const urgency = (RANK[item.level] || 1) * 18;
    const area = item.area === "strategic" ? 17 : item.area === "mission" ? 9 : 3;
    const status = item.status === "doing" ? 125 : item.status === "review" ? 12 : 0;
    const confidence = item.evidenceState === "pdf-candidate" ? -24 :
      item.evidenceState === "editable-only" ? -12 :
      item.evidenceState === "other-period-candidate" ? -5 : 0;
    const blockBase = (4 - block(item)) * 300;
    let inner;
    if (block(item) === 1) {
      // Primero las carpetas de período (determinan cómo se lee su contenido).
      inner = (PERIOD_FOLDER.test(val(item.title)) ? 40 : 0) +
        Math.min(20, Math.floor(Number(item.groupCount || 1) / 5)) + area;
    } else {
      const structural = item.synthetic && item.workType !== "document" ? -24 : 0;
      const grouped = item.origin === "group" ? -16 : 0;
      const known = item.origin === "task" ? 6 : 0;
      inner = urgency + area + confidence + structural + grouped + known +
        deadlineBonus(item) + closedPeriodAge(item) - (historical ? 38 : 0);
    }
    return blockBase + status + inner;
  }

  function eligible(item) {
    return !["done", "blocked", "snoozed"].includes(item.status);
  }

  function build(vm, storage, preparedNamesContext) {
    const progress = storage || { statuses: {}, stages: {}, queue: [], activity: [] };
    const namesContext = preparedNamesContext || (window.PriorityNames ? window.PriorityNames.prepare() : null);
    const all = candidateTasks(vm).map(function(item) {
      const saved = progress.statuses && progress.statuses[item.id];
      const status = saved ? saved.status : (item.status || "pending");
      const input = Object.assign({}, item, {status});
      // Las tareas del servicio ya llegan contrastadas; no se renombran dos veces.
      const named = namesContext && !input.named ? window.PriorityNames.rename(input, namesContext) : input;
      return window.PriorityWorkflow.decorate(named, progress);
    });
    const pool = all.filter(eligible);
    const ranked = pool.slice().sort(function(a, b) {
      return score(b) - score(a) || val(a.id).localeCompare(val(b.id), "es");
    });

    // Solo las acciones iniciadas se fijan arriba: las pendientes se repriorizan.
    const selected = [];
    (progress.queue || []).forEach(function(id) {
      const item = ranked.find(x => x.id === id && x.status === "doing");
      if (item && selected.length < MAX && !selected.some(x => x.id === id))
        selected.push(item);
    });
    ranked.forEach(function(item) {
      if (item.status === "doing" && selected.length < MAX &&
          !selected.some(x => x.id === item.id)) selected.push(item);
    });

    function processCount(item) {
      return selected.filter(x =>
        x.scope === item.scope && !!x.processNumber &&
        x.processNumber === item.processNumber).length;
    }
    // Diversidad razonable sin reservar cuotas a errores menores.
    ranked.forEach(function(item) {
      if (selected.length < MAX && !selected.some(x => x.id === item.id) &&
          processCount(item) < 2) selected.push(item);
    });
    ranked.forEach(function(item) {
      if (selected.length < MAX && !selected.some(x => x.id === item.id))
        selected.push(item);
    });
    return {
      items: selected, all, queueIds: selected.map(item => item.id),
      openCount: pool.length,
      completedToday: window.PriorityStorage.completedToday(progress)
    };
  }

  window.PriorityQueue = { build, score, block };
})(window);
