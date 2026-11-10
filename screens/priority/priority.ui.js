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
    if (type === "quick") return /nombre de pdf/i.test(val(item.title)) ? "Corregir nombre de PDF" : "Corregir carpeta";
    return "Verificación";
  }
  function taskSummary(item) {
    if (item.decision && item.decision.summary) return item.decision.summary;
    if (item.large) return item.nextAction;
    if (item.suggestedAction) return item.suggestedAction;
    if (item.origin === "group") return "Revisar " + item.groupCount + " caso(s) relacionados";
    if (item.workType === "quick") return "Comprobar y realizar la corrección";
    if (item.workType === "review") return "Comprobar la situación antes de actuar";
    return "Verificar la obligación y completar el documento";
  }
  const ACTIONS = {
    "RENOMBRAR": "rename", "CONSOLIDAR":"merge","UNIFICAR":"merge",
    "CREAR":"create","ELABORAR":"create","VERIFICAR":"verify",
    "REVISAR":"verify","REVISAR REFERENCIA":"verify"
  };
  function actionChip(decision) {
    if (!decision || !decision.action) return "";
    const type = ACTIONS[decision.action] || "verify";
    return '<span class="action-chip action-chip--' + type + '">' + esc(decision.action) + '</span>';
  }
  function decisionSteps(decision) {
    if (!decision || !(decision.steps || []).length) return "";
    return '<section class="decision-steps" aria-label="Pasos recomendados">' +
      '<h3>Qué debes hacer</h3><ol>' + decision.steps.map((s,i)=>
        '<li><span class="step-number">' + (i+1) + '</span><span>' + esc(s) + '</span></li>').join("") +
      '</ol></section>';
  }
  function evidenceDetails(item) {
    const notes=[
      item.officialName ? '<p><strong>Documento del manual:</strong> '+esc(item.officialName)+'</p>' : "",
      item.namingStageLabel ? '<p><strong>Elaboración:</strong> '+esc(item.namingStageLabel)+(item.namingDateCode ? ' · '+esc(item.namingDateCode) : '')+'</p>' : "",
      item.expectedTemplate && !item.namingComplete ? '<p><strong>Patrón:</strong> '+esc(item.expectedTemplate)+'; campos pendientes por confirmar</p>' : "",
      item.namingNotice ? '<p><strong>Observación:</strong> '+esc(item.namingNotice)+'</p>' : "",
      item.referenceFileName ? '<p><strong>Referencia previa:</strong> '+esc(item.referenceFileName)+'</p>' : "",
      item.dueDate ? '<p><strong>Fecha de referencia:</strong> '+
        esc(new Date(item.dueDate).toLocaleDateString("es-EC",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}))+'</p>' : "",
      item.reason ? '<p><strong>Hallazgo:</strong> '+esc(item.reason)+'</p>' : ""
    ].filter(Boolean).join("");
    return notes ? '<details class="evidence-details"><summary>Ver evidencia y detalles técnicos</summary>'+notes+'</details>' : "";
  }
  function sharePointButton(item) {
    if (!item.sharePointUrl) return "";
    return '<button class="btn btn-light js-open" type="button" data-path="' + esc(item.sharePointUrl) + '">Abrir carpeta en SharePoint</button>';
  }
  // Presentar decisiones y rutas, no validar documentos ni ejecutar correcciones.
  function comparisonBox(item) {
    const d=item.decision||{};
    const oldName=val(d.oldName),newName=val(d.newName);
    if (!oldName && !newName && !item.resolvedDocumentId) return "";
    const suggested=newName||val(item.proposedDocumentName||item.officialName);
    const old=oldName||val(item.referenceFileName)||"No se encontró referencia en otra carpeta o período escaneado.";
    const current=val(item.sourceFileName);
    const oldLink=item.referenceFilePath && val(item.referenceFileName)
      ? '<button class="btn btn-light js-open" type="button" data-path="'+esc(item.referenceFilePath)+'">Abrir referencia</button>' : "";
    const currentBlock=current
      ? '<p class="comparison-note"><strong>Archivo localizado en el período objetivo:</strong> '+esc(current)+
        ' · Primero verifica el archivo localizado antes de crear otro.'+
        (item.sourceFilePath?'<button class="btn btn-light js-open" type="button" data-path="'+esc(item.sourceFilePath)+'">Abrir archivo</button>':"")+
        '</p>' : "";
    const create=val(d.createNote) || (item.resolvedDocumentId && suggested
      ? (current?"Si el archivo localizado no corresponde, elaborar: ":"Si no existe una versión válida, elaborar: ")+suggested : "");
    return '<div class="task-comparison">'+
      '<div class="comparison-grid">'+
        '<div class="comparison-side comparison-side--old"><span class="comparison-label"><span aria-hidden="true">−</span> Esto es lo antiguo</span>'+
          '<strong>'+esc(old)+'</strong>'+oldLink+'</div>'+
        '<div class="comparison-side comparison-side--new"><span class="comparison-label"><span aria-hidden="true">✓</span> Esto es lo nuevo</span>'+
          '<strong>'+esc(suggested||"Requiere comprobar el período y el nombre oficial")+'</strong>'+
          (d.isNestedDuplicate?'<small>No renombrar esta subcarpeta de forma independiente.</small>':"")+
        '</div>'+
      '</div>'+
      currentBlock+
      (create?'<div class="comparison-create"><strong>Si no hay, crea esto</strong><span>'+esc(create)+
        '</span></div>':"")+
      (d.reason?'<p class="comparison-note"><strong>Por qué:</strong> '+esc(d.reason)+'</p>':"")+
    '</div>';
  }
  function itemDetails(item) {
    if (!(item.groupItems || []).length) return "";
    return '<section class="task-items"><h3>Carpetas y archivos relacionados ('+item.groupItems.length+')</h3>'+
      '<div class="group-item-grid">'+item.groupItems.map(function(x,i) {
        const d=x.decision||{};
        const oldName=val(d.oldName||x.actual||x.pathLabel||x.title)||"Sin nombre";
        const newName=val(d.newName||x.suggestedName);
        return '<article class="group-item">'+
          '<div class="group-item-head"><strong>Elemento '+(i+1)+'</strong>'+actionChip(d)+'</div>'+
          '<div class="group-compare"><span><small>Esto es lo antiguo</small>'+esc(oldName)+'</span>'+
          '<span><small>Esto es lo nuevo</small>'+esc(newName||
            (d.isNestedDuplicate?"Consolidar con carpeta contenedora":"Requiere confirmar destino"))+'</span></div>'+
          (d.summary?'<p class="group-hint">'+esc(d.summary)+'</p>':"")+
          (x.pathLabel?'<p class="group-path"><strong>Ruta:</strong> '+esc(x.pathLabel)+'</p>':"")+
          '<div class="group-item-actions">'+sharePointButton(x)+
          (x.actionPath?'<button type="button" class="btn btn-light js-open" data-path="'+esc(x.actionPath)+'">Abrir ubicación</button>':"")+
          '</div></article>';
      }).join("")+'</div></section>';
  }
  function card(item, index) {
    const title=esc(item.displayTitle||item.projectTitle||item.title);
    const decision=item.decision||{};
    const meta=esc([item.scope,item.processNumber?"PRO-"+item.processNumber:"",
      kind(item)].filter(Boolean).join(" · "));
    const canCreate=!!(item.parentPath && item.proposedFolderName &&
      item.workType==="quick" && (!item.decision || decision.action==="CREAR"));
    const action=item.large
      ? '<button class="btn js-step" type="button" data-id="'+esc(item.id)+'">Registrar este paso</button>'
      : '<button class="btn js-status" type="button" data-status="done" data-id="'+esc(item.id)+'">Registrar gestión · por verificar</button>';
    const certainty=decision.certainty
      ? '<span class="decision-certainty">Certeza '+esc(decision.certainty)+
        (decision.needsConfirmation?" · Confirmar antes de cambiar":"")+'</span>' : "";
    return '<details class="task-card" data-id="'+esc(item.id)+'">'+
      '<summary><span class="task-number">'+String(index+1).padStart(2,"0")+'</span>'+
      '<span class="task-main"><span class="task-heading"><span class="task-title">'+title+'</span>'+
        actionChip(decision)+'</span>'+
      '<span class="task-next">'+esc(taskSummary(item))+'</span>'+
      '<span class="task-meta">'+meta+(item.status==="doing"?" · En proceso":"")+'</span>'+
      '</span><span class="task-chevron" aria-hidden="true">›</span></summary>'+
      '<div class="task-detail">'+
        (item.large?'<span class="task-step">Paso '+(item.stepIndex+1)+' de '+item.stepCount+
          ' · '+esc(item.nextAction||"")+'</span>':"")+
        '<div class="decision-summary"><span class="decision-title">'+actionChip(decision)+
          '<span>Acción recomendada</span></span>'+
          '<p>'+esc(taskSummary(item))+'</p>'+certainty+'</div>'+
        (item.levelLabel?'<span class="task-meta"><strong>Prioridad:</strong> '+esc(item.levelLabel)+'</span>':"")+
        (item.periodLabel?'<span class="task-meta">Período: '+esc(item.periodLabel)+'</span>':"")+
        (item.origin!=="group"?comparisonBox(item):"")+
        itemDetails(item)+
        decisionSteps(decision)+
        evidenceDetails(item)+
        '<p class="decision-disclaimer">Las acciones son recomendaciones; confirma el destino, no sobrescribas evidencias y vuelve a escanear para comprobar el resultado.</p>'+
        '<div class="task-actions">'+sharePointButton(item)+
          (item.actionPath?'<button class="btn btn-light js-open" type="button" data-path="'+esc(item.actionPath)+'">Abrir ubicación</button>':"")+
          (canCreate?'<button class="btn btn-soft js-mkdir" type="button" data-id="'+esc(item.id)+'">Crear carpeta (confirmar)</button>':"")+
          action+
          (item.status!=="doing"?'<button class="btn btn-light js-status" type="button" data-id="'+esc(item.id)+'" data-status="doing">En proceso</button>':"")+
          '<button class="btn btn-light js-status" type="button" data-status="blocked" data-id="'+esc(item.id)+'">Bloquear</button>'+
          '<button class="btn btn-light js-status" type="button" data-status="snoozed" data-id="'+esc(item.id)+'">Posponer</button>'+
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
      const extra = (item.origin==='group'?'':comparisonBox(item)) + itemDetails(item) + decisionSteps(item.decision);
      const details = extra
        ? '<details class="backlog-detail"><summary>Ver instrucciones, nombres y rutas</summary>' +
          extra + '</details>' : "";
      return '<div class="backlog-row"><div class="backlog-row__main"><strong>' +
        esc(item.displayTitle || item.projectTitle || item.title) + '</strong><small>' +
        esc([item.scope,item.processNumber ? "PRO-"+item.processNumber : "",item.decision&&item.decision.action || kind(item),STATUS[item.status]||"Pendiente"]
        .filter(Boolean).join(" · ")) + '</small></div>' +
        '<div class="backlog-row__actions">' + sharePointButton(item) +
        (item.actionPath?'<button type="button" class="btn btn-light js-open" data-path="' +
        esc(item.actionPath) + '">Abrir</button>':"") +
        (inactive?'<button type="button" class="btn btn-soft js-reopen" data-id="' +
        esc(item.id) + '">Reactivar</button>':"") +
        '</div></div>' + details;
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
  function activeFilters(){
    return {
      scope:byId("filterScope").value,
      workType:byId("filterWork").value,
      search:val(byId("filterSearch").value)
    };
  }
  function render(nextVm, nextBoard) {
    vm = nextVm || {};
    board = nextBoard || {items:[],all:[]};
    byId("todayCompleted").textContent = String(board.completedToday || 0);
    byId("queueSummary").textContent = board.items.length + " acciones en la cola · Abre cada tarjeta para ver la decisión recomendada";
    const progress=byId("queueProgressFill");
    const completed=Number(board.completedToday||0),open=Number(board.openCount||0);
    const ratio=completed+open ? Math.min(100,Math.round(100*completed/(completed+open))) : 0;
    if(progress && progress.style)progress.style.width=ratio+"%";
    const info=byId("queueProgressText");
    if(info)info.textContent=completed+" gestiones registradas hoy · "+open+
      " pendientes activos (no equivale a evidencias validadas)";
    const quick=board.items.filter(x=>x.workType==="quick").length;
    const review=board.items.filter(x=>x.workType==="review").length;
    const quickBox=byId("quickQueueCount"),reviewBox=byId("reviewQueueCount");
    if(quickBox)quickBox.textContent=String(quick);
    if(reviewBox)reviewBox.textContent=String(review);
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
    const settings = window.PrioritySharePoint.load();
    byId("sharePointUGPA").value = settings.UGPA;
    byId("sharePointUTET").value = settings.UTET;
    byId("btnSaveSharePoint").addEventListener("click", () => handlers.onSaveSharePoint({
      UGPA: byId("sharePointUGPA").value, UTET: byId("sharePointUTET").value
    }));
    byId("btnRefreshPriority").addEventListener("click",handlers.onRefresh);
    byId("btnRescanPriority").addEventListener("click",handlers.onRescan);
    byId("btnExportPriorityExcel").addEventListener("click",()=>handlers.onExportExcel(activeFilters()));
    byId("btnExportPriorityPdf").addEventListener("click",()=>handlers.onExportPdf(activeFilters()));
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

