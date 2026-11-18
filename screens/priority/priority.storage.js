(function (window) {
  "use strict";
  // El seguimiento es local. Nunca equivale a la validación documental.
  const KEY = "audit_priority_workspace_v2";
  const LEGACY = "audit_priority_progress_v1";
  const VALID = new Set(["pending", "doing", "review", "done", "blocked", "snoozed", "signing", "correction", "signed", "verified", "dismissed"]);
  function empty() { return { version: 2, queue: [], statuses: {}, stages: {}, activity: [], tasks: {}, focus: {}, scanFiles: null }; }
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
    result.tasks = result.tasks && typeof result.tasks === "object" ? result.tasks : {};
    result.focus = result.focus && typeof result.focus === "object" ? result.focus : {};
    return result;
  }
  let saving = Promise.resolve();
  let saveError = null;
  let backupLocked = false;
  function persist(data) {
    if (backupLocked) return;
    data.updatedAt = new Date().toISOString();
    window.localStorage.setItem(KEY, JSON.stringify(data));
    // El motor de reglas actual lee esta clave; mantener compatibilidad.
    const legacy = {};
    Object.keys(data.statuses).forEach(function (id) {
      const status = data.statuses[id] && data.statuses[id].status;
      if (status === "pending") delete legacy[id];
      else if (["doing", "review", "done"].includes(status)) legacy[id] = status;
      else delete legacy[id];
    });
    window.localStorage.setItem(LEGACY, JSON.stringify(legacy));
    if (window.api && window.api.workspace) {
      const snapshot = JSON.parse(JSON.stringify(data));
      saving = saving.then(async function () {
        const response = await window.api.workspace.save(snapshot);
        if (!response || !response.ok) throw new Error(response && response.error || "No se pudo respaldar el avance.");
        saveError = null;
      }).catch(function(error) { saveError = error; });
    }
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
  function setStatus(id, status, note, details) {
    if (!id || !VALID.has(status)) throw new Error("Estado no válido.");
    const data = load();
    const previous=data.statuses[id] || {};
    details = details || {};
    if (status === "verified" && !String(details.evidencePath || "").trim() && details.structureConfirmed !== true)
      throw new Error("Indica el archivo definitivo revisado.");
    if (["blocked", "correction", "dismissed"].includes(status) && !String(note || "").trim())
      throw new Error("Indica el motivo o las observaciones.");
    if (status === "pending") data.statuses[id] = { status: "pending", updatedAt: new Date().toISOString() };
    else data.statuses[id] = { status: status, note: String(note === undefined ? previous.note || "" : note),
      updatedAt: new Date().toISOString(), evidenceVerified: false };
    data.statuses[id] = Object.assign({}, data.statuses[id], {
      responsible: String(details.responsible !== undefined ? details.responsible : previous.responsible || ""),
      evidencePath: String(details.evidencePath || previous.evidencePath || ""),
      evidenceVerified: status === "verified" && details.structureConfirmed !== true,
      structureVerified: status === "verified" && details.structureConfirmed === true,
      signatureSentAt: status === "signing" ? new Date().toISOString() : previous.signatureSentAt || null
    });
    Object.keys(data.focus).forEach(tab => { if (data.focus[tab] === id && !["doing", "pending", "correction", "signed"].includes(status)) delete data.focus[tab]; });
    record(data, id, status, note);
    persist(data);
    return data;
  }
  function addNote(id, details) {
    const data=load();
    if(!data.statuses[id])throw new Error("No hay seguimiento para este documento.");
    data.statuses[id].note=String(details.note||"");
    data.statuses[id].responsible=String(details.responsible||"");
    data.statuses[id].updatedAt=new Date().toISOString();
    record(data,id,"note",details.note);persist(data);
  }
  function resetTask(id) {
    if (!id) throw new Error("Tarea no válida.");
    const data = load();
    data.statuses[id] = { status: "pending", updatedAt: new Date().toISOString() };
    // Reactivar conserva las etapas; una devolución no borra el trabajo realizado.
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
  async function flush() { await saving; if (saveError) throw saveError; }
  async function initialize() {
    if (!window.api || !window.api.workspace) return;
    let response;
    try { response = await window.api.workspace.load(); }
    catch (error) { response = {ok:false,error:error.message}; }
    if (!response || !response.ok) {
      backupLocked=true;
      saveError=new Error(response && response.error || "No se pudo recuperar el seguimiento.");
      return {error:saveError.message};
    }
    const local = load(), disk = response.data;
    if (disk && (!local.updatedAt || String(disk.updatedAt) > local.updatedAt)) {
      window.localStorage.setItem(KEY, JSON.stringify(disk));
      window.localStorage.setItem(LEGACY, "{}");
    }
    const merged=load();
    const migrated=[];
    for(let i=0;i<window.localStorage.length;i++){
      const key=window.localStorage.key(i);
      if(!key || !key.startsWith("audit-draft-rules-v1:"))continue;
      const entries=readJson(key,null);
      if(!Array.isArray(entries))continue;
      merged.documentCriteria ||= {};
      if(!Object.hasOwn(merged.documentCriteria,key))merged.documentCriteria[key]=entries;
      migrated.push(key);
    }
    persist(merged); await flush();
    for(const key of migrated)window.localStorage.removeItem(key);
    return response.recovered;
  }
  function trackingKey(item) {
    // Solo fusionar coincidencias inequívocas del mismo documento y ámbito.
    if (!item.periodLabel || !(item.resolvedDocumentId || item.documentId)) return "";
    const normalize = value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+a\s+/g," ").replace(/[^a-z0-9]+/g," ").trim();
    const process=window.AuditManualCatalog && window.AuditManualCatalog.getProcess(item.scope,item.processNumber);
    const context=item.careerKey||item.careerName||(process&&process.documentGranularity==="institutional"?"institutional":item.pathLabel);
    if(!context)return "";
    return [item.scope,item.processNumber,item.periodLabel,item.resolvedDocumentId||item.documentId,context].map(normalize).join("|");
  }
  function reconcile(items) {
    const data=load(), buckets=new Map();let changed=false;
    items.forEach(item=>{
      item.trackingKey=trackingKey(item);
      if(item.trackingKey){if(!buckets.has(item.trackingKey))buckets.set(item.trackingKey,[]);buckets.get(item.trackingKey).push(item);}
    });
    const oldBuckets=new Map();
    Object.values(data.tasks).forEach(item=>{
      const key=item.trackingKey||trackingKey(item);
      if(key&&data.statuses[item.id]){if(!oldBuckets.has(key))oldBuckets.set(key,[]);oldBuckets.get(key).push(item);}
    });
    for(const [key,targets] of buckets){
      const prior=oldBuckets.get(key)||[];
      if(targets.length!==1||prior.length!==1)continue;
      const id=targets[0].id,old=prior[0].id;
      if(id===old||data.statuses[id]||items.some(x=>x.id===old))continue;
      data.statuses[id]=data.statuses[old];delete data.statuses[old];
      if(data.stages[old]!==undefined){data.stages[id]=data.stages[old];delete data.stages[old];}
      data.tasks[id]=Object.assign({},prior[0],{id});delete data.tasks[old];
      Object.keys(data.focus).forEach(tab=>{if(data.focus[tab]===old)data.focus[tab]=id;});
      data.queue=data.queue.map(x=>x===old?id:x);
      record(data,id,"reconcile","Seguimiento conservado desde "+old);changed=true;
    }
    if(changed)persist(data);
    return data;
  }
  function remember(items, focus) {
    const data = load();
    let changed = false;
    for (const item of items) {
      if (!data.statuses[item.id] && !Object.values(focus || {}).includes(item.id)) continue;
      // No guardar listas masivas ni derivados de presentación en el respaldo.
      const snapshot = {};
      for (const key of ["id","scope","processNumber","area","workType","level","title","displayTitle","periodLabel","careerKey","careerName","blockedBy","trackingKey","resolvedDocumentId","documentId","officialName","pathLabel","actionPath","sourceFilePath","referenceFilePath","referenceFileName","sharePointUrl","reason","sourceCategory"])
        if (item[key] !== undefined) snapshot[key] = item[key];
      if (!item.trackedOnly && JSON.stringify(data.tasks[item.id]) !== JSON.stringify(snapshot)) {
        data.tasks[item.id] = snapshot; changed = true;
      }
    }
    if (JSON.stringify(data.focus) !== JSON.stringify(focus || {})) { data.focus = focus || {}; changed = true; }
    if (changed) persist(data);
  }
  function compareScan(files) {
    const data = load(), previous = data.scanFiles;
    const current = Array.from(new Set(files)).sort();
    const before = new Set(previous || []), after = new Set(current);
    const delta = previous ? {added:current.filter(x=>!before.has(x)).length, removed:previous.filter(x=>!after.has(x)).length} : null;
    data.scanFiles = current; persist(data); return delta;
  }
  function criteria(key) {
    const data=load();
    if (Array.isArray(data.documentCriteria?.[key])) return data.documentCriteria[key];
    const legacy=readJson(key,[]);
    if (Array.isArray(legacy) && legacy.length) saveCriteria(key,legacy);
    return Array.isArray(legacy)?legacy:[];
  }
  function saveCriteria(key,entries) {
    if (backupLocked) throw new Error("Restaure el seguimiento antes de guardar criterios.");
    const data=load();
    data.documentCriteria={...data.documentCriteria,[key]:entries};
    persist(data);
    window.localStorage.removeItem(key);
  }
  async function exportBackup() { await flush(); return window.api.workspace.export(); }
  async function importBackup() {
    await saving;
    const response = await window.api.workspace.import();
    if (response && response.ok && response.data) {
      backupLocked=false;saveError=null;
      window.localStorage.setItem(LEGACY, "{}");
      window.localStorage.setItem(KEY, JSON.stringify(response.data));
    }
    return response;
  }
  window.PriorityStorage = { load: load, setStatus: setStatus, resetTask: resetTask, completeStep: completeStep,
    criteria, saveCriteria, initialize, flush, remember, addNote, reconcile, compareScan, exportBackup, importBackup,
    setQueue: setQueue, completedToday: completedToday };
})(window);
