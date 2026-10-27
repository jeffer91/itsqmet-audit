(function (window, document) {
  "use strict";
  const byId = id => document.getElementById(id);
  const val = v => String(v == null ? "" : v).trim();
  const esc = v => val(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const STATUS = {pending:"Pendiente",doing:"En proceso",review:"En revisión",
    done:"Realizado · por verificar",blocked:"Bloqueado",snoozed:"Pospuesto"};
  let board = {items:[],all:[]};
  let vm = {processes:[]};
  let limit = 40;
  function kind(item) {
    if (item.large) return "Documento estratégico";
    const type = item.displayWorkType || item.workType;
    if (type === "document") return "Documento pendiente";
    if (type === "quick") return "Organizar carpeta";
    return "Verificación";
  }
  function taskSummary(item) {
    if (item.large) return item.nextAction;
    if (item.suggestedAction) return item.suggestedAction;
    if (item.origin === "group") return "Revisar " + item.groupCount + " caso(s) relacionados";
    if (item.workType === "quick") return "Comprobar y realizar la corrección";
    if (item.workType === "review") return "Comprobar la situación antes de actuar";
    return "Verificar la obligación y completar el documento";
  }
  function card(item, index) {
    const title = esc(item.displayTitle || item.projectTitle || item.title);
    const meta = esc([item.scope, item.processNumber ? "PRO-" + item.processNumber : "",
      kind(item)].filter(Boolean).join(" · "));
    const canCreate = !!(item.parentPath && item.proposedFolderName && item.workType === "quick");
    const groupDetails = (item.groupItems || []).length
      ? '<div class="task-items"><strong>Algunos elementos:</strong><ul>' +
        item.groupItems.map(x => '<li>' + esc(x.actual || x.pathLabel || x.title) + '</li>').join("") +
        '</ul></div>' : "";
    const action = item.large
      ? '<button class="btn js-step" type="button" data-id="' + esc(item.id) + '">Terminé este paso</button>'
      : '<button class="btn js-status" type="button" data-status="done" data-id="' + esc(item.id) + '">Terminé mi parte</button>';
    return '<details class="task-card" data-id="' + esc(item.id) + '">' +
      '<summary><span class="task-number">' + String(index + 1).padStart(2,"0") + '</span>' +
      '<span class="task-main"><span class="task-title">' + title + '</span>' +
      '<span class="task-next">' + esc(taskSummary(item)) + '</span>' +
      '<span class="task-meta">' + meta + (item.status==="doing"?" · En proceso":"") +
      '</span></span><span class="task-chevron" aria-hidden="true">›</span></summary>' +
      '<div class="task-detail">' +
      (item.large ? '<span class="task-step">Paso ' + (item.stepIndex+1) + ' de ' + item.stepCount + '</span>' : "") +
      (item.officialName ? '<span class="task-meta"><strong>Documento del manual:</strong> ' + esc(item.officialName) + '</span>' : "") +
      (item.sourceFileName ? '<span class="task-meta"><strong>Archivo encontrado:</strong> ' + esc(item.sourceFileName) + '</span>' : "") +
      (item.expectedTemplate && item.sourceKind !== "file-coded" ? '<span class="task-meta"><strong>Patrón del manual:</strong> ' + esc(item.expectedTemplate) + ' (0X, AÑO y MES sin completar)</span>' : "") +
      (item.namingNotice ? '<span class="task-meta"><strong>Observación:</strong> ' + esc(item.namingNotice) + '</span>' : "") +
      (item.referenceFileName ? '<span class="task-meta"><strong>Referencia de otro período:</strong> ' + esc(item.referenceFileName) + '</span>' : "") +
      '<p class="task-reason">' + esc(item.reason || "Verifica el documento antes de darlo por finalizado.") + '</p>' +
      (item.periodLabel ? '<span class="task-meta">Período: ' + esc(item.periodLabel) + '</span>' : "") +
      groupDetails +
      '<div class="task-actions">' +
      (item.actionPath ? '<button class="btn btn-light js-open" type="button" data-path="' + esc(item.actionPath) + '">Abrir carpeta</button>' : "") +
      (canCreate ? '<button class="btn btn-soft js-mkdir" type="button" data-id="' + esc(item.id) + '">Crear carpeta</button>' : "") +
      action +
      (item.status !== "doing" ? '<button class="btn btn-light js-status" type="button" data-id="' + esc(item.id) + '" data-status="doing">En proceso</button>' : "") +
      '<button class="btn btn-light js-status" type="button" data-status="blocked" data-id="' + esc(item.id) + '">Bloquear</button>' +
      '<button class="btn btn-light js-status" type="button" data-status="snoozed" data-id="' + esc(item.id) + '">Posponer</button>' +
      '</div></div></details>';
  }
  function backlogRows() {
    const unit = byId("filterScope").value;
    const work = byId("filterWork").value;
    const query = val(byId("filterSearch").value).toLowerCase();
    return (board.all || []).filter(function (item) {
      if (unit !== "all" && item.scope !== unit) return false;
      if (work !== "all" && item.workType !== work) return false;
      return !query || [item.displayTitle,item.title,item.officialName,item.sourceFileName,item.processNumber,item.processName,item.scope,item.periodLabel,item.pathLabel]
        .join(" ").toLowerCase().includes(query);
    });
  }
  function renderBacklog() {
    const items = backlogRows();
    byId("backlogList").innerHTML = items.slice(0,limit).map(function (item) {
      const inactive = ["done","blocked","snoozed"].includes(item.status);
      return '<div class="backlog-row"><div class="backlog-row__main"><strong>' +
        esc(item.displayTitle || item.projectTitle || item.title) + '</strong><small>' +
        esc([item.scope,item.processNumber ? "PRO-"+item.processNumber : "",kind(item),STATUS[item.status]||"Pendiente"]
        .filter(Boolean).join(" · ")) + '</small></div>' +
        '<div class="backlog-row__actions">' +
        (item.actionPath?'<button type="button" class="btn btn-light js-open" data-path="' +
        esc(item.actionPath) + '">Abrir</button>':"") +
        (inactive?'<button type="button" class="btn btn-soft js-reopen" data-id="' +
        esc(item.id) + '">Reactivar</button>':"") +
        '</div></div>';
    }).join("") || '<div class="empty-state">No hay registros con estos filtros.</div>';
    byId("btnMore").hidden = items.length <= limit;
  }
  function renderProcesses() {
    byId("processSummary").innerHTML = '<table class="process-table"><thead><tr>' +
      '<th>Proceso</th><th>Estado</th><th>Pendientes</th><th>Evidencias</th><th>Siguiente acción</th></tr></thead><tbody>' +
      (vm.processes || []).map(function (p) {
        return '<tr><td><strong>' + esc(p.scope+"-PRO-"+p.processNumber) + '</strong><small>' +
          esc(p.processName) + '</small></td><td>' + esc(p.state) + '</td><td>' +
          Number(p.activeTasks || 0) + '</td><td>' + Number(p.issues || 0) +
          '<small>' + esc(p.indicatorStatus || "No evaluado") + '</small></td><td>' +
          esc(p.nextAction) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }
  function render(nextVm, nextBoard) {
    vm = nextVm || {};
    board = nextBoard || {items:[],all:[]};
    byId("todayCompleted").textContent = String(board.completedToday || 0);
    byId("queueSummary").textContent = board.items.length + " acciones en la cola";
    byId("priorityList").innerHTML = board.items.map(card).join("") ||
      '<div class="empty-state">No hay acciones activas. Revisa los pendientes o ejecuta un nuevo escaneo.</div>';
    byId("backlogCount").textContent = "(" + board.all.length + ")";
    byId("scanLabel").textContent = vm.scansLabel || "";
    byId("noScanNotice").hidden = !vm.noScan;
    byId("noScanNotice").textContent = vm.noScan ? "No hay escaneos. Selecciona UGPA o UTET en Escaneo." : "";
    renderBacklog();
    renderProcesses();
  }
  function bindEvents(handlers) {
    byId("btnRefreshPriority").addEventListener("click",handlers.onRefresh);
    byId("btnRescanPriority").addEventListener("click",handlers.onRescan);
    byId("btnExportPriorityExcel").addEventListener("click",handlers.onExportExcel);
    byId("btnExportPriorityPdf").addEventListener("click",handlers.onExportPdf);
    ["filterScope","filterWork"].forEach(id => byId(id).addEventListener("change",function(){
      limit=40;renderBacklog();
    }));
    byId("filterSearch").addEventListener("input",function(){limit=40;renderBacklog();});
    byId("btnMore").addEventListener("click",function(){limit+=40;renderBacklog();});
    document.addEventListener("click",function (event) {
      const button=event.target.closest("button");
      if (!button) return;
      const id=button.dataset.id;
      if (button.classList.contains("js-open")) handlers.onOpenPath(button.dataset.path);
      else if(button.classList.contains("js-mkdir")) handlers.onCreateFolder(id);
      else if(button.classList.contains("js-status")) handlers.onStatus(id,button.dataset.status);
      else if(button.classList.contains("js-step")) handlers.onStep(id);
      else if(button.classList.contains("js-reopen")) handlers.onReopen(id);
    });
  }
  function setGlobalMessage(message,type) {
    const box=byId("globalMessage");
    box.textContent=val(message);
    box.className="global-message" + (type ? " is-"+type : "");
  }
  window.PriorityUI={render:render,bindEvents:bindEvents,setGlobalMessage:setGlobalMessage};
})(window,document);
