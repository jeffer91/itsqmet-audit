(function (window) {
  "use strict";
  // El seguimiento es local. Nunca equivale a la validación documental.
  const KEY = "audit_priority_workspace_v2";
  const LEGACY = "audit_priority_progress_v1";
  const VALID = new Set(["pending", "doing", "review", "done", "blocked", "snoozed"]);
  function empty() { return { version: 2, queue: [], statuses: {}, stages: {}, activity: [] }; }
  function readJson(key, fallback) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null") || fallback; }
    catch (_error) { return fallback; }
  }
  function load() {
    const data = readJson(KEY, empty());
    const result = Object.assign(empty(), data && typeof data === "object" ? data : {});
    if (!Array.isArray(result.queue)) result.queue = [];
    if (!result.statuses || typeof result.statuses !== "object" || Array.isArray(result.statuses)) result.statuses = {};
    if (!result.stages || typeof result.stages !== "object" || Array.isArray(result.stages)) result.stages = {};
    if (!Array.isArray(result.activity)) result.activity = [];
    const legacy = readJson(LEGACY, {});
    if (legacy && typeof legacy === "object") {
      Object.keys(legacy).forEach(function (id) {
        if (!result.statuses[id] && VALID.has(legacy[id]))
          result.statuses[id] = { status: legacy[id], updatedAt: null, migrated: true };
      });
    }
    return result;
  }
  function persist(data) {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    // El motor de reglas actual lee esta clave; mantener compatibilidad.
    const legacy = readJson(LEGACY, {});
    Object.keys(data.statuses).forEach(function (id) {
      const status = data.statuses[id] && data.statuses[id].status;
      if (status === "pending") delete legacy[id];
      else if (["doing", "review", "done"].includes(status)) legacy[id] = status;
      else delete legacy[id];
    });
    window.localStorage.setItem(LEGACY, JSON.stringify(legacy));
  }
  function day(value) {
    const date = value ? new Date(value) : new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  function record(data, id, action, note) {
    data.activity.push({ id: id, action: action, note: String(note || ""), at: new Date().toISOString() });
    if (data.activity.length > 1000) data.activity = data.activity.slice(-1000);
  }
  function setStatus(id, status, note) {
    if (!id || !VALID.has(status)) throw new Error("Estado no válido.");
    const data = load();
    if (status === "pending") data.statuses[id] = { status: "pending", updatedAt: new Date().toISOString() };
    else data.statuses[id] = { status: status, note: String(note || ""), updatedAt: new Date().toISOString() };
    record(data, id, status, note);
    persist(data);
    return data;
  }
  function resetTask(id) {
    if (!id) throw new Error("Tarea no válida.");
    const data = load();
    data.statuses[id] = { status: "pending", updatedAt: new Date().toISOString() };
    delete data.stages[id];
    record(data, id, "reopen", "Reactivación manual");
    persist(data);
    return data;
  }
  function completeStep(id, index, total) {
    if (!id || !Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1)
      throw new Error("Etapa no válida.");
    const data = load();
    const current = Number(data.stages[id] || 0);
    if (index !== current || index >= total) throw new Error("La etapa ya cambió. Actualiza la tarea.");
    data.stages[id] = current + 1;
    record(data, id, "step", String(index + 1) + "/" + total);
    if (data.stages[id] >= total) {
      data.statuses[id] = { status: "done", updatedAt: new Date().toISOString(), evidenceVerified: false };
      record(data, id, "done", "Trabajo realizado; evidencia por verificar");
    } else {
      data.statuses[id] = { status: "doing", updatedAt: new Date().toISOString() };
    }
    persist(data);
    return data;
  }
  function setQueue(ids) {
    const data = load();
    const unique = Array.from(new Set((ids || []).filter(Boolean))).slice(0, 5);
    if (JSON.stringify(data.queue) !== JSON.stringify(unique)) {
      data.queue = unique;
      persist(data);
    }
  }
  function completedToday(data) {
    const events = (data.activity || []).filter(entry => entry && entry.at && day(entry.at) === day());
    const stepped = new Set(events.filter(entry=>entry.action==="step").map(entry=>entry.id));
    const actions = new Set();
    events.forEach(function (entry) {
      if (entry.action === "step") actions.add(entry.id + "|step|" + (entry.note || ""));
      if (entry.action === "done" && !stepped.has(entry.id)) actions.add(entry.id + "|done");
    });
    return actions.size;
  }
  window.PriorityStorage = { load: load, setStatus: setStatus, resetTask: resetTask, completeStep: completeStep,
    setQueue: setQueue, completedToday: completedToday };
})(window);
