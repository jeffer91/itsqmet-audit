(function (window, document) {
  "use strict";
  const byId = id => document.getElementById(id);
  const val = v => String(v == null ? "" : v).trim();
  const esc = v => val(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const STATUS = {pending:"Pendiente",doing:"En proceso",review:"En revisión",
    done:"Realizado · por verificar",blocked:"Bloqueado",snoozed:"Pospuesto",signing:"En firma",correction:"Por corregir",signed:"Firmado · por archivar/verificar",verified:"Completado · revisión manual",dismissed:"Descartado con motivo"};
  let board = {items:[],all:[]};
  let vm = {processes:[]};
  let limit = 40;
  let activeTab = "pending";
  let sectionLimit = 12;
  const SECTIONS = [
    ["pending", "tabPending", "pendingCount", "Pendientes", "Documentos detectados que aún no has comenzado."],
    ["doing", "tabDoing", "doingCount", "En elaboración", "Documentos que estás preparando."],
    ["signing", "tabSigning", "signingCount", "Por firmar", "Documentos enviados a firma o en revisión."],
    ["archive", "tabArchive", "archiveCount", "Por archivar", "Documentos recibidos o realizados: comprobar el PDF definitivo."],
    ["completed", "tabCompleted", "completedCount", "Completados", "Documentos y correcciones revisados manualmente."],
    ["corrections", "tabCorrections", "correctionsCount", "Correcciones", "Nombres, carpetas y documentos devueltos para corregir."]
  ];
  function tabOf(item) {
    if (window.PriorityQueue && window.PriorityQueue.tabOf) return window.PriorityQueue.tabOf(item);
    if (item.workType==="document" || item.large || item.resolvedDocumentId ||
      (item.workType==="review" && /firma|pdf|document|archivo|evidencia|elaborar|informe|acta|reporte/i.test(val(item.title)))) return "documents";
    return "folders";
  }
  function sectionOf(item) {
    if (window.PriorityQueue && window.PriorityQueue.sectionOf) return window.PriorityQueue.sectionOf(item);
    const status=item.status||"pending";
    if(status==="verified")return "completed";
    if(["blocked","snoozed","dismissed"].includes(status))return "other";
    if(status==="correction" || tabOf(item)==="folders")return "corrections";
    if(["signing","review"].includes(status))return "signing";
    if(["signed","done"].includes(status))return "archive";
    return status==="doing"?"doing":"pending";
  }
  function tabItems() {
    return (board.all||[]).filter(item=>sectionOf(item)===activeTab);
  }
  function rankedItems(items) {
    const score=window.PriorityQueue && window.PriorityQueue.score;
    return items.slice().sort((a,b)=>{
      const blockedA=(a.blockedBy||[]).length||a.waitingForStructure?1:0;
      const blockedB=(b.blockedBy||[]).length||b.waitingForStructure?1:0;
      return blockedA-blockedB || (a.status==="doing"?-1:0)-(b.status==="doing"?-1:0) ||
        (score?score(b)-score(a):0) || val(a.title).localeCompare(val(b.title),"es");
    });
  }
  function updateTabs() {
    for (const [section,id,count] of SECTIONS) {
      const el=byId(id);
      if (el) {
        el.className="work-tab"+(activeTab===section?" is-active":"");
        if (typeof el.setAttribute==="function") el.setAttribute("aria-selected",String(activeTab===section));
        else el.ariaSelected=String(activeTab===section);
      }
      const metric=byId(count);
      if(metric)metric.textContent=String((board.all||[]).filter(x=>sectionOf(x)===section).length);
    }
    // Old test and external link compatibility: no legacy controls in the new page.
    for(const [id,section,count] of [["tabDocuments","pending","documentsCount"],["tabFolders","corrections","foldersCount"]]){
      const el=byId(id);
      if(el)el["aria-selected"]=String(activeTab===section);
      const metric=byId(count);
      if(metric)metric.textContent=String((board.all||[]).filter(x=>sectionOf(x)===section).length);
    }
  }
  function renderPeriods() {
    const module=window.PriorityPeriods;
    if (!module) return;
    const periods=module.getItems(),status=module.getStatus();
    const source=status.source==="Firebase"?"Firebase (solo lectura)":
      "referencia del 12/11/2026, pendiente de sincronizar";
    byId("periodsStatus").textContent="UTET: "+periods.length+" períodos ("+
      periods.filter(x=>x.type==="regular").length+" regulares, "+
      periods.filter(x=>x.type==="PVC").length+" PVC) · Fuente: "+source+
      ". UGPA: periodicidad semestral, anual o especial según el proceso.";
    byId("periodsCatalog").innerHTML='<strong>Períodos UTET · '+esc(source)+'</strong>'+
      '<ul>'+periods.map(x=>'<li>'+esc(x.label)+
      ' <span>('+esc(x.type)+')</span></li>').join("")+'</ul>';
  }
  function periodMeta(item) {
    const period=val(item.periodLabel);
    if (!period) return "";
    const result=item.scope==="UTET" && window.PriorityPeriods
      ? window.PriorityPeriods.classifyLabel(period) : null;
    const kind=result && result.type!=="sin determinar" ? " · "+result.type : "";
    return '<span class="task-meta">Período: '+esc(period+kind)+'</span>';
  }
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
    const url = esc(item.sharePointUrl);
    // El href permite copiar la dirección y el clic lo abre mediante Electron.
    return '<a class="btn btn-light js-open" href="' + url + '" data-path="' + url + '" target="_blank" rel="noopener noreferrer">Abrir carpeta en SharePoint</a>' +
      '<button class="btn btn-light js-copy-sharepoint" type="button" data-url="' + url + '">Copiar enlace</button>';
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
          (x.actionPath?'<button type="button" class="btn btn-light js-open" data-path="'+esc(x.actionPath)+'">Abrir carpeta local</button>':"")+
          '</div></article>';
      }).join("")+'</div></section>';
  }
  function primaryAction(item) {
    const status=item.status||"pending";
    if((item.blockedBy||[]).length || item.waitingForStructure)
      return '<span class="work-item__warning">Necesita un paso previo; revisa los detalles</span>';
    if(status==="verified")return "";
    if(status==="correction")return statusButton(item,"doing","Reanudar corrección");
    if(tabOf(item)==="folders"){
      if(status==="done")return statusButton(item,"verified","Confirmar corrección revisada");
      if(status==="doing")return statusButton(item,"done","Corrección realizada");
      return statusButton(item,"doing","Empezar corrección");
    }
    if(status==="pending")return statusButton(item,"doing","Empezar");
    if(status==="doing" && item.large && item.stepIndex<item.stepCount)
      return '<button class="btn js-step" type="button" data-id="'+esc(item.id)+'">Registrar paso '+(item.stepIndex+1)+' de '+item.stepCount+'</button>';
    if(status==="doing")return statusButton(item,"signing","Enviar a firma");
    if(status==="signing" || status==="review")return statusButton(item,"signed","Ya está firmado");
    if(status==="signed" || status==="done")return statusButton(item,"verified","Archivar y completar");
    return "";
  }
  function card(item,index) {
    const status=item.status||"pending";
    const title=esc(item.displayTitle||item.projectTitle||item.title);
    const decision=item.decision||{};
    const meta=esc([item.scope,item.processNumber?"PRO-"+item.processNumber:"",item.periodLabel,STATUS[status]||"Pendiente"].filter(Boolean).join(" · "));
    const canCreate=!!(item.parentPath && item.proposedFolderName && item.workType==="quick" &&
      (!item.decision || decision.action==="CREAR"));
    const followup=["signing","review","correction","signed","done","doing"].includes(status);
    return '<article class="task-card work-item" data-id="'+esc(item.id)+'">'+
      '<div class="work-item__top"><span class="task-number">'+String(index+1).padStart(2,"0")+'</span>'+
      '<div class="work-item__intro"><h3 class="task-title">'+title+'</h3>'+
      '<p class="task-meta">'+meta+'</p>'+
      '<p class="task-next">'+esc(taskSummary(item))+'</p></div></div>'+
      '<div class="work-item__primary">'+primaryAction(item)+'</div>'+
      '<details class="work-item__detail"><summary>Ver detalles y otras opciones</summary>'+
      '<div class="task-detail">'+
      (item.large?'<span class="task-step">Paso '+Math.min(item.stepIndex+1,item.stepCount)+' de '+item.stepCount+
          ' · '+esc(item.nextAction||"")+'</span>':"")+
      (item.levelLabel?'<p class="task-meta"><strong>Prioridad:</strong> '+esc(item.levelLabel)+'</p>':"")+
      periodMeta(item)+
      (item.priorityReason||item.reason?'<p class="priority-reason"><strong>Por qué:</strong> '+esc(item.priorityReason||item.reason)+'</p>':"")+
      (item.note?'<p><strong>Observaciones:</strong> '+esc(item.note)+'</p>':"")+
      (item.pathLabel?'<p class="group-path"><strong>Ubicación:</strong> '+esc(item.pathLabel)+'</p>':"")+
      (item.origin!=="group"?comparisonBox(item):"")+
      itemDetails(item)+decisionSteps(decision)+
      ((item.preparation||[]).length?'<details class="evidence-details"><summary>Insumos y comprobaciones</summary><ol>'+item.preparation.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ol></details>':"")+
      evidenceDetails(item)+
      (tabOf(item)==="documents"?'<button class="btn js-draft" type="button" data-id="'+esc(item.id)+'">Preparar borrador</button><button class="btn btn-light js-context" type="button" data-id="'+esc(item.id)+'">Copiar contexto para elaborar</button>':"")+
      '<p class="decision-disclaimer">La confirmación es manual; no se renombran ni firman archivos automáticamente.</p>'+
      '<div class="task-actions">'+sharePointButton(item)+
      (item.actionPath?'<button class="btn btn-light js-open" type="button" data-path="'+esc(item.actionPath)+'">Abrir carpeta local</button>':"")+
      (canCreate?'<button class="btn btn-soft js-mkdir" type="button" data-id="'+esc(item.id)+'">Crear carpeta (confirmar)</button>':"")+
      (status==="signing"||status==="review"?statusButton(item,"correction","Devuelto para corregir"):"")+
      (status==="signed"||status==="done"?statusButton(item,"correction","Necesita corrección"):"")+
      (followup?statusButton(item,"note","Registrar seguimiento"):"")+
      (status==="verified"?'<button class="btn btn-light js-reopen" type="button" data-id="'+esc(item.id)+'">Reabrir</button>':
       statusButton(item,"snoozed","Posponer")+statusButton(item,"blocked","Bloquear")+
       statusButton(item,"dismissed","Ya existe / no aplica / duplicado"))+
      '</div></div></details></article>';
  }
  function statusButton(item,status,label) {
    return '<button class="btn btn-light js-status" type="button" data-id="'+esc(item.id)+'" data-status="'+status+'">'+esc(label)+'</button>';
  }
  function trackingDetails(item) {
    const sent = item.signatureSentAt && new Date(item.signatureSentAt);
    const age = sent && Number.isFinite(sent.getTime()) ? Math.max(0,Math.floor((Date.now()-sent.getTime())/86400000)) : null;
    return '<p class="micro">'+esc([item.periodLabel,item.responsible?"Responsable: "+item.responsible:"",
      age!==null ? age+" días en firma":"",item.note,item.trackedOnly?"No aparece como hallazgo en el último escaneo; verificar cierre":""].filter(Boolean).join(" · "))+'</p>'+
      (item.evidencePath?'<button class="btn btn-light js-open" data-path="'+esc(item.evidencePath)+'">Abrir evidencia registrada</button>':"");
  }
  function renderTracking() {
    const items=(board.all||[]).filter(x=>["signing","review","blocked","signed","correction","done"].includes(x.status));
    items.sort((a,b)=>val(a.signatureSentAt||a.updatedAt).localeCompare(val(b.signatureSentAt||b.updatedAt)));
    const panel=byId("trackingList");
    if (!panel) return;
    byId("trackingCount").textContent=String(items.length);
    panel.innerHTML=items.map(item=>'<article class="tracking-item"><strong>'+esc(item.displayTitle||item.title)+'</strong>'+
      '<span class="task-meta">'+esc([item.scope,item.processNumber,STATUS[item.status]].join(" · "))+'</span>'+trackingDetails(item)+
      '<div class="task-actions">'+
      (["signing","review"].includes(item.status)?statusButton(item,"signed","Recibido firmado")+statusButton(item,"correction","Devuelto para corregir"):"")+
      (["signed","done"].includes(item.status)?statusButton(item,"verified","Registrar archivo revisado y completar")+statusButton(item,"correction","Requiere corrección"):"")+
      (item.status==="blocked"?statusButton(item,"pending","Desbloquear"):"")+
      statusButton(item,"note","Registrar seguimiento")+'</div></article>').join("")||'<p>No hay documentos esperando gestión.</p>';
  }
  function backlogRows() {
    const unit = byId("filterScope").value;
    const work = byId("filterWork").value;
    const query = val(byId("filterSearch").value).toLowerCase();
    const status = byId("filterStatus") ? byId("filterStatus").value : "all";
    return (board.all||[]).filter(function (item) {
      if (status && status !== "all" && item.status !== status) return false;
      if (unit !== "all" && item.scope !== unit) return false;
      if (work !== "all" && item.workType !== work) return false;
      return !query || [item.displayTitle,item.title,item.officialName,item.sourceFileName,item.processNumber,item.processName,item.scope,item.periodLabel,item.pathLabel]
        .join(" ").toLowerCase().includes(query);
    });
  }
  function renderBacklog() {
    const items = backlogRows();
    byId("backlogList").innerHTML = items.slice(0,limit).map(function (item) {
      const inactive = ["done","blocked","snoozed","signing","review","verified","dismissed"].includes(item.status);
      const extra = (item.origin==='group'?'':comparisonBox(item)) + itemDetails(item) + decisionSteps(item.decision);
      const details = extra
        ? '<details class="backlog-detail"><summary>Ver instrucciones, nombres y rutas</summary>' +
          extra + '</details>' : "";
      return '<div class="backlog-row"><div class="backlog-row__main"><strong>' +
        esc(item.displayTitle || item.projectTitle || item.title) + '</strong><small>' +
        esc([item.scope,item.processNumber ? "PRO-"+item.processNumber : "",item.decision&&item.decision.action || kind(item),STATUS[item.status]||"Pendiente"]
        .filter(Boolean).join(" · ")) + '</small></div>' +
        '<p class="micro">'+esc(item.waitingForStructure?'Antes: corregir la estructura de carpetas del proceso.':(item.blockedBy||[]).length?'Antes: '+item.blockedBy.join('; '):'')+'</p>'+
         '<div class="backlog-row__actions">' + sharePointButton(item) +
        (item.actionPath?'<button type="button" class="btn btn-light js-open" data-path="' +
        esc(item.actionPath) + '">Abrir</button>':"") +
        (inactive?'<button type="button" class="btn btn-soft js-reopen" data-id="' +
        esc(item.id) + '">Reactivar</button>':"") + trackingDetails(item) +
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
  function render(nextVm,nextBoard) {
    vm=nextVm||{};
    board=nextBoard||{items:[],all:[]};
    byId("todayCompleted").textContent=String(board.completedToday||0);
    updateTabs();
    const def=SECTIONS.find(x=>x[0]===activeTab)||SECTIONS[0];
    const selected=rankedItems(tabItems());
    byId("workHeading").textContent=def[3];
    byId("queueSummary").textContent=selected.length+" registro(s). "+def[4];
    const docs=(board.all||[]).filter(x=>tabOf(x)==="documents" && x.status!=="dismissed");
    const verified=docs.filter(x=>x.status==="verified").length;
    const progress=byId("queueProgressFill");
    if(progress&&progress.style)progress.style.width=(docs.length?Math.round(verified*100/docs.length):0)+"%";
    const info=byId("queueProgressText");
    if(info)info.textContent=verified+" de "+docs.length+" documentos revisados manualmente. No representa el cumplimiento institucional.";
    byId("priorityList").innerHTML=selected.slice(0,sectionLimit).map(card).join("")||
      '<div class="empty-state">No hay registros en esta sección.</div>';
    const more=byId("btnMoreSection");
    if(more)more.hidden=selected.length<=sectionLimit;
    byId("backlogCount").textContent="("+((board.all||[]).length)+")";
    byId("scanLabel").textContent=vm.scansLabel||"";
    byId("noScanNotice").hidden=!vm.noScan;
    byId("noScanNotice").textContent=vm.noScan?"No hay escaneos. Selecciona UGPA o UTET en Escaneo.":"";
    renderBacklog();renderProcesses();renderPeriods();
  }
  function bindEvents(handlers) {
    const settings = window.PrioritySharePoint.load();
    byId("sharePointUGPA").value = settings.UGPA;
    byId("sharePointUTET").value = settings.UTET;
    byId("btnSaveSharePoint").addEventListener("click", () => handlers.onSaveSharePoint({
      UGPA: byId("sharePointUGPA").value, UTET: byId("sharePointUTET").value
    }));
    for(const [section,id] of SECTIONS){
      const el=byId(id);
      if(el)el.addEventListener("click",()=>setTab(section));
    }
    const oldDocs=byId("tabDocuments"),oldFolders=byId("tabFolders");
    if(oldDocs)oldDocs.addEventListener("click",()=>setTab("pending"));
    if(oldFolders)oldFolders.addEventListener("click",()=>setTab("corrections"));
    const moreSection=byId("btnMoreSection");
    if(moreSection)moreSection.addEventListener("click",()=>{sectionLimit+=12;render(vm,board);});
    byId("btnSyncPeriods").addEventListener("click",handlers.onSyncPeriods);
    byId("btnRefreshPriority").addEventListener("click",handlers.onRefresh);
    byId("btnExportBackup").addEventListener("click",()=>handlers.onExportBackup());
    byId("btnImportBackup").addEventListener("click",()=>handlers.onImportBackup());
    byId("btnRescanPriority").addEventListener("click",handlers.onRescan);
    byId("btnExportPriorityExcel").addEventListener("click",()=>handlers.onExportExcel(activeFilters()));
    byId("btnExportPriorityPdf").addEventListener("click",()=>handlers.onExportPdf(activeFilters()));
    ["filterScope","filterWork","filterStatus"].forEach(id => byId(id).addEventListener("change",function(){
      limit=40;renderBacklog();
    }));
    byId("filterSearch").addEventListener("input",function(){limit=40;renderBacklog();});
    byId("btnMore").addEventListener("click",function(){limit+=40;renderBacklog();});
    document.addEventListener("click",function (event) {
      const button=event.target.closest("button,a.js-open");
      if (!button) return;
      const id=button.dataset.id;
      if (button.classList.contains("js-open")) {
        if (button.tagName === "A" && typeof event.preventDefault === "function") event.preventDefault();
        handlers.onOpenPath(button.dataset.path);
      }
      else if(button.classList.contains("js-copy-sharepoint")) handlers.onCopySharePoint(button.dataset.url);
      else if(button.classList.contains("js-draft")) handlers.onDraft(id);
      else if(button.classList.contains("js-context")) handlers.onCopyContext(id);
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
  function setTab(next) {
    const mapped=next==="documents"?"pending":next==="folders"?"corrections":next;
    if(!SECTIONS.some(s=>s[0]===mapped))return;
    activeTab=mapped;limit=40;sectionLimit=12;render(vm,board);
  }
  function requestDetails(task,status) {
    return new Promise(resolve=>{
      const dialog=byId("statusDialog"),form=byId("statusForm");
      byId("statusTitle").textContent=status==="note"?"Registrar seguimiento":(STATUS[status]||status);
      byId("statusDocument").textContent=task.displayTitle||task.title;
      byId("statusNote").value=task.note||"";
      byId("statusNote").required=["blocked","correction","dismissed","note"].includes(status);
      byId("statusResponsible").value=task.responsible||"";
      byId("statusEvidence").value=task.evidencePath||task.sourceFilePath||"";
      const isFolder=tabOf(task)==="folders";
      byId("statusEvidence").required=status==="verified" && !isFolder;
      byId("evidenceField").hidden=status!=="verified" || isFolder;
      const verifyText=byId("verificationText");
      if(verifyText)verifyText.textContent=isFolder
        ?"He corregido y comprobado manualmente la estructura después de volver a escanear. No se ha validado un PDF."
        :"He revisado contenido, período, aprobación y firmas del PDF definitivo. Esta confirmación es manual.";
      byId("statusVerify").checked=false;
      byId("statusVerify").required=status==="verified";
      byId("verificationField").hidden=status!=="verified";
      const close=()=>{form.onsubmit=null;resolve(null);};
      dialog.oncancel=close;
      byId("statusCancel").onclick=()=>{dialog.close();close();};
      form.onsubmit=event=>{
        event.preventDefault();
        if (!form.reportValidity())return;
        const result={note:val(byId("statusNote").value),responsible:val(byId("statusResponsible").value),
          evidencePath:status==="verified" && isFolder?"":val(byId("statusEvidence").value),
          structureConfirmed:status==="verified" && isFolder};
        form.onsubmit=null;dialog.close();resolve(result);
      };
      dialog.showModal();
    });
  }
  window.PriorityUI={requestDetails:requestDetails,render:render,bindEvents:bindEvents,setTab:setTab,setGlobalMessage:setGlobalMessage};
})(window,document);

