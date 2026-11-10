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
    if (item.large) return item.nextAction;
    if (item.suggestedAction) return item.suggestedAction;
    if (item.origin === "group") return "Revisar " + item.groupCount + " caso(s) relacionados";
    if (item.workType === "quick") return item.origin === "group"
      ? "Corregir " + item.groupCount + " nombre(s); se hace primero porque es rápido y aclara qué documentos faltan"
      : "Comprobar y realizar la corrección";
    if (item.workType === "review") return "Comprobar la situación antes de actuar";
    return "Verificar la obligación y completar el documento";
  }
  function sharePointButton(item) {
    if (!item.sharePointUrl) return "";
    return '<button class="btn btn-light js-open" type="button" data-path="' + esc(item.sharePointUrl) + '">Abrir carpeta en SharePoint</button>';
  }
  // Compara el nombre previsto con candidatos actuales o históricos. No certifica versiones.
  function comparisonBox(item) {
    const isDoc = !!val(item.resolvedDocumentId) && !!val(item.officialName);
    const isFolder = !isDoc && !!val(item.proposedFolderName) && item.workType === "quick";
    const isRename = !isDoc && !isFolder && !!val(item.suggestedName) && item.workType === "quick";
    if (!isDoc && !isFolder && !isRename) return "";
    const proposed = val(isDoc ? (item.proposedDocumentName || item.officialName) :
      (item.proposedFolderName || item.suggestedName));
    if (!proposed) return "";
    const oldName = val(isDoc ? item.referenceFileName : (item.actual || item.detectedName));
    const currentName = isDoc ? val(item.sourceFileName) : "";
    const oldMessage = oldName || (isDoc
      ? "No se encontró referencia en otra carpeta o período escaneado."
      : "No se localizó un nombre anterior para esta carpeta.");
    const oldHint = isDoc && oldName
      ? '<small>Candidato de otra ubicación o período. Comprobar fecha, contenido y vigencia.</small>'
      : "";
    const oldLink = isDoc && oldName && item.referenceFilePath
      ? '<button class="btn btn-light js-open" type="button" data-path="' + esc(item.referenceFilePath) + '">Abrir referencia</button>' : "";
    const current = currentName
      ? '<p class="comparison-note"><strong>Archivo localizado en el período objetivo:</strong> ' +
        esc(currentName) + ' · Pendiente de comprobar contenido, aprobación y vigencia.' +
        (item.sourceFilePath ? ' <button class="btn btn-light js-open" type="button" data-path="' +
          esc(item.sourceFilePath) + '">Abrir archivo</button>' : '') + '</p>' : "";
    const createText = currentName
      ? "Si el documento localizado no corresponde, elaborar: " + proposed
      : proposed;
    const createHint = isDoc
      ? (currentName
        ? "Primero verifica el archivo localizado. No generes duplicados ni lo marques como validado por existir."
        : "Primero busca otras evidencias y comprueba cualquier referencia anterior. La creación es manual y requiere los datos, firmas y aprobaciones correspondientes.")
      : "Comprueba que no exista la carpeta antes de crearla o renombrarla.";
    const namingHint = isDoc && !item.namingComplete && item.expectedTemplate
      ? '<p class="comparison-note">El código o fecha definitiva está pendiente de confirmar; no utilices 0X ni AÑO-MES como nombre final.</p>'
      : "";
    return '<div class="task-comparison">' +
      '<div class="comparison-row"><strong>Esto es lo nuevo</strong><span>' + esc(proposed) +
        '<small>' + (isDoc ? "Nombre objetivo basado en el manual y la información disponible." : "Nombre propuesto para la carpeta.") + '</small></span></div>' +
      '<div class="comparison-row"><strong>Esto es lo antiguo</strong><span>' + esc(oldMessage) +
        oldHint + oldLink + '</span></div>' +
      current +
      '<div class="comparison-row comparison-create"><strong>Si no hay, crea esto</strong><span>' +
        esc(createText) + '<small>' + createHint + '</small></span></div>' +
      namingHint + '</div>';
  }
  function itemDetails(item) {
    return (item.groupItems || []).length
      ? '<div class="task-items"><strong>Elementos del grupo:</strong><ul>' +
        item.groupItems.map(x => '<li><strong>Esto es lo antiguo:</strong> ' +
          esc(x.actual || x.pathLabel || x.title || "No identificado") +
          '<span class="group-new"><strong>Esto es lo nuevo:</strong> ' +
          (x.suggestedName ? esc(x.suggestedName) : "Por confirmar; revisar antes de renombrar") +
          '</span>' + sharePointButton(x) + '</li>').join("") +
        '</ul></div>' : "";
  }
  function card(item, index) {
    const title = esc(item.displayTitle || item.projectTitle || item.title);
    const meta = esc([item.scope, item.processNumber ? "PRO-" + item.processNumber : "",
      kind(item)].filter(Boolean).join(" · "));
    const canCreate = !!(item.parentPath && item.proposedFolderName && item.workType === "quick");
    const groupDetails = itemDetails(item);
    const action = item.large
      ? '<button class="btn js-step" type="button" data-id="' + esc(item.id) + '">Terminé este paso</button>'
      : '<button class="btn js-status" type="button" data-status="done" data-id="' + esc(item.id) + '">Terminé mi parte</button>';
    return '<details class="task-card" data-id="' + esc(item.id) + '">' +
      '<summary><span class="task-number">' + String(index + 1).padStart(2,"0") + '</span>' +
      '<span class="task-main"><span class="task-title">' + title + '</span>' +
      '<span class="task-next">' + esc(taskSummary(item)) + '</span>' +
      '<span class="task-meta">' + meta + (item.status==="doing"?" · En proceso":"") +
      '</span>' +
      (item.proposedDocumentName ? '<span class="task-version-hint">Nuevo: ' + esc(item.proposedDocumentName) +
        ' · Antiguo: ' + esc(item.referenceFileName || "No localizado") + '</span>' : '') +
      '</span><span class="task-chevron" aria-hidden="true">›</span></summary>' +
      '<div class="task-detail">' +
      (item.large ? '<span class="task-step">Paso ' + (item.stepIndex+1) + ' de ' + item.stepCount + '</span>' : "") +
      (item.officialName ? '<span class="task-meta"><strong>Documento del manual:</strong> ' + esc(item.officialName) + '</span>' : "") +
      (item.namingStageLabel ? '<span class="task-meta"><strong>Momento de elaboración:</strong> ' + esc(item.namingStageLabel) + (item.namingDateCode ? ' · ' + esc(item.namingDateCode) : '') + '</span>' : "") +
      (item.namingSequence ? '<span class="task-meta"><strong>Consecutivo propuesto:</strong> ' + esc(item.namingSequence) + '</span>' : "") +
      (item.sourceFileName ? '<span class="task-meta"><strong>Archivo encontrado:</strong> ' + esc(item.sourceFileName) + '</span>' : "") +
      (item.expectedTemplate && !item.namingComplete && item.sourceKind !== "file-coded" ? '<span class="task-meta"><strong>Patrón del manual:</strong> ' + esc(item.expectedTemplate) + ' (campos restantes por confirmar)</span>' : "") +
      (item.namingNotice ? '<span class="task-meta"><strong>Observación:</strong> ' + esc(item.namingNotice) + '</span>' : "") +
      (item.referenceFileName ? '<span class="task-meta"><strong>Referencia de otro período:</strong> ' + esc(item.referenceFileName) + '</span>' : "") +
      (item.evidenceState === "pdf-candidate" ? '<span class="task-meta"><strong>Evidencia:</strong> PDF localizado, pendiente de validar</span>' :
        item.evidenceState === "editable-only" ? '<span class="task-meta"><strong>Evidencia:</strong> Editable localizado, PDF por verificar</span>' : "") +
      (item.levelLabel ? '<span class="task-meta"><strong>Prioridad:</strong> ' + esc(item.levelLabel) + '</span>' : "") +
      (item.dueDate ? '<span class="task-meta"><strong>Fecha de referencia:</strong> ' +
        esc(new Date(item.dueDate).toLocaleDateString("es-EC", {year:"numeric",month:"long",day:"numeric",timeZone:"UTC"})) + '</span>' : "") +
      '<p class="task-reason">' + esc(item.reason || "Verifica el documento antes de darlo por finalizado.") + '</p>' +
      (item.periodLabel ? '<span class="task-meta">Período: ' + esc(item.periodLabel) + '</span>' : "") +
      comparisonBox(item) + groupDetails +
      (item.workType === 'quick' ? '<p>Después de corregir, vuelve a escanear para comprobar el resultado.</p>' : '') +
      '<div class="task-actions">' + sharePointButton(item) +
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
      const extra = comparisonBox(item) + itemDetails(item);
      const details = extra
        ? '<details class="backlog-detail"><summary>Comparar lo nuevo, lo antiguo y qué crear si falta</summary>' +
          extra + '</details>' : "";
      return '<div class="backlog-row"><div class="backlog-row__main"><strong>' +
        esc(item.displayTitle || item.projectTitle || item.title) + '</strong><small>' +
        esc([item.scope,item.processNumber ? "PRO-"+item.processNumber : "",kind(item),STATUS[item.status]||"Pendiente"]
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

