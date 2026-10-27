(function (window) {
  "use strict";
  const MAX = 5;
  const RANK = { max: 4, high: 3, medium: 2, low: 1 };
  const val = x => String(x == null ? "" : x).trim();
  function candidateTasks(vm) {
    const tasks = (vm.tasks || []).map(function (item) {
      return Object.assign({}, item, { origin: "task" });
    });
    // Los hallazgos masivos son grupos para revisar, nunca miles de tareas individuales.
    const groups = (vm.inconsistencies || []).map(function (group) {
      const id = ["group", group.scope, group.processNumber || "", group.category || "", group.title].join("|");
      const count = Number(group.groupCount || (group.items || []).length || 1);
      return {
        id: id, origin: "group", scope: group.scope,
        processNumber: group.processNumber || "", area: group.area || "other",
        level: group.area === "strategic" ? "medium" : "low",
        workType: group.workType || "review", title: group.title,
        nextAction: "Revisar los archivos de esta inconsistencia",
        reason: group.description || "Comprobar el hallazgo antes de corregir.",
        actionPath: group.actionPath, pathLabel: group.pathLabel,
        groupCount: count, groupItems: (group.items || []).slice(0, 12),
        category: group.category, proposedFolderName: "", effort: "low"
      };
    });
    const seen = new Set();
    return tasks.concat(groups).filter(function (item) {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }
  function score(item) {
    const historical = /rezago de per[ií]odo hist[oó]rico/i.test(val(item.reason));
    const statusBoost = item.status === "doing" ? 90 : item.status === "review" ? 15 : 0;
    const urgency = (RANK[item.level] || 1) * 15;
    const area = item.area === "strategic" ? 17 : item.area === "mission" ? 8 : 2;
    const type = item.workType === "document" ? 13 : item.workType === "quick" ? 6 : 1;
    const known = item.origin === "task" ? 5 : 0;
    return statusBoost + urgency + area + type + known - (historical ? 35 : 0);
  }
  function eligible(item) { return !["done", "blocked", "snoozed"].includes(item.status); }
  function build(vm, storage) {
    const progress = storage || { statuses: {}, stages: {}, queue: [], activity: [] };
    const all = candidateTasks(vm).map(function (item) {
      const saved = progress.statuses && progress.statuses[item.id];
      const status = saved ? saved.status : (item.status || "pending");
      return window.PriorityWorkflow.decorate(Object.assign({}, item, { status: status }), progress);
    });
    const pool = all.filter(eligible);
    const indexed = new Map(pool.map(item => [item.id, item]));
    const selected = [];
    (progress.queue || []).forEach(function (id) {
      if (selected.length < MAX && indexed.has(id) && !selected.some(t=>t.id===id))
        selected.push(indexed.get(id));
    });
    const rank = pool.slice().sort(function (a,b) {
      return score(b) - score(a) || val(a.id).localeCompare(val(b.id), "es");
    });
    function pick(predicate) {
      if (selected.length >= MAX) return;
      // No monopolizar la cola con un único proceso.
      const unused = rank.filter(item => !selected.some(t=>t.id===item.id) && predicate(item));
      const distinct = unused.find(item => !selected.some(t=>t.scope===item.scope && t.processNumber && t.processNumber===item.processNumber));
      const item = distinct || unused[0];
      if (item) selected.push(item);
    }
    const strategic = item => item.area === "strategic" && item.workType === "document";
    if (!selected.length) {
      pick(strategic); pick(strategic);
      pick(item => item.level === "max" || item.level === "high");
      pick(item => item.workType === "quick");
      pick(item => item.workType === "review");
    }
    while (selected.length < MAX) {
      const before = selected.length;
      pick(() => true);
      if (selected.length === before) break;
    }
    return {
      items: selected, all: all, queueIds: selected.map(item=>item.id),
      openCount: pool.length,
      completedToday: window.PriorityStorage.completedToday(progress)
    };
  }
  window.PriorityQueue = { build: build, score: score };
})(window);
