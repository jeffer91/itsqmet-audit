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
      return {
        id, origin: "group", scope: group.scope,
        processNumber: group.processNumber || "", area: group.area || "other",
        level: "low", levelLabel: "Baja",
        workType: "review", title: group.title,
        nextAction: "Revisar las observaciones de este grupo",
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

  function score(item) {
    const historical = /rezago de per[ií]odo hist[oó]rico/i.test(val(item.reason));
    const urgency = (RANK[item.level] || 1) * 18;
    const area = item.area === "strategic" ? 17 : item.area === "mission" ? 9 : 3;
    const type = item.workType === "document" ? 13 : item.workType === "review" ? 8 : 3;
    const status = item.status === "doing" ? 125 : item.status === "review" ? 12 : 0;
    const confidence = item.evidenceState === "pdf-candidate" ? -24 :
      item.evidenceState === "editable-only" ? -12 :
      item.evidenceState === "other-period-candidate" ? -5 : 0;
    // Los cambios de carpetas no deben desplazar entregables o verificaciones sustantivas.
    const structural = item.synthetic && item.workType !== "document" ? -24 : 0;
    const grouped = item.origin === "group" ? -16 : 0;
    const known = item.origin === "task" ? 6 : 0;
    let deadline = 0;
    if (item.dueDate) {
      const due = new Date(item.dueDate);
      if (!Number.isNaN(due.getTime())) {
        const remaining = (due.getTime() - Date.now()) / 86400000;
        if (remaining >= -60 && remaining <= 7) deadline = 18;
        else if (remaining > 7 && remaining <= 21) deadline = 10;
      }
    }
    return urgency + area + type + status + confidence + structural +
      grouped + known + deadline - (historical ? 38 : 0);
  }

  function eligible(item) {
    return !["done", "blocked", "snoozed"].includes(item.status);
  }

  function build(vm, storage) {
    const progress = storage || { statuses: {}, stages: {}, queue: [], activity: [] };
    const namesContext = window.PriorityNames ? window.PriorityNames.prepare() : null;
    const all = candidateTasks(vm).map(function(item) {
      const saved = progress.statuses && progress.statuses[item.id];
      const status = saved ? saved.status : (item.status || "pending");
      const input = Object.assign({}, item, {status});
      const named = namesContext ? window.PriorityNames.rename(input, namesContext) : input;
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

  window.PriorityQueue = { build, score };
})(window);
