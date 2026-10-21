(function (window, document) {
  "use strict";
  const el = id => document.getElementById(id);
  const clean = v => String(v == null ? "" : v).trim();
  const esc = v => clean(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const workflow = {quick:"Corrección rápida",review:"Por verificar",document:"Por elaborar"};
  const states = {pending:"Pendiente",doing:"En proceso",review:"En revisión",done:"Completado (por verificar)"};
  let groups = [];
  function status(item) {
    return '<label class="status-field">Estado<select class="js-status" data-id="' + esc(item.id) + '">' +
      Object.keys(states).map(s=>'<option value="'+s+'"'+(item.status===s?' selected':'')+'>'+states[s]+'</option>').join("") +
      '</select></label>';
  }
  function task(item) {
    const due = item.dueDate ? new Intl.DateTimeFormat("es-EC",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(item.dueDate) : "Sin fecha exacta";
    return '<article class="task-card task-card--'+esc(item.level)+'"><div class="task-card__priority"><span class="priority-pill priority-pill--'+esc(item.level)+'">'+esc(item.levelLabel)+'</span></div>' +
      '<div class="task-card__body"><div class="task-card__meta"><span>'+esc(item.scope+(item.processNumber?"-PRO-"+item.processNumber:""))+'</span><span>'+esc(item.areaLabel)+'</span><span class="work-tag">'+esc(workflow[item.workType]||"Verificar")+'</span><span>Esfuerzo '+(item.effort==="high"?"alto":item.effort==="medium"?"medio":"bajo")+'</span></div>' +
      '<h3>'+esc(item.title)+'</h3><p class="task-card__reason">'+esc(item.reason)+'</p>' +
      '<div class="task-card__foot"><span>'+esc(item.periodLabel||"Sin período")+'</span><span>Fecha de referencia estimada: '+esc(due)+'</span></div></div>' +
      '<div class="task-card__actions">' +
      (item.actionPath?'<button class="btn btn--small js-open" data-path="'+esc(item.actionPath)+'">Abrir carpeta</button>':"") +
      (item.parentPath&&item.proposedFolderName?'<button class="btn btn--small btn--action js-mkdir" data-id="'+esc(item.id)+'">Crear carpeta</button>':"") +
      status(item)+'</div></article>';
  }
  function detail(item) {
    const canCopy = /nombre de (pdf|carpeta) incorrecto|carpeta de per[ií]odo mal nombrada/i.test(item.title) && item.expected;
    return '<div class="issue-detail"><div class="issue-detail__text"><strong>'+esc(item.actual||item.title)+'</strong>' +
      '<small>'+esc(item.pathLabel)+'</small>'+(item.expected?'<small>Sugerencia: '+esc(item.expected)+'</small>':"")+
      (item.description?'<small>'+esc(item.description)+'</small>':"")+'</div><div class="issue-detail__actions">' +
      (canCopy?'<button class="btn btn--small js-copy" data-name="'+esc(item.expected)+'">Copiar nombre</button>':"") +
      (item.actionPath?'<button class="btn btn--small js-open" data-path="'+esc(item.actionPath)+'">Abrir</button>':"") +
      status(item)+'</div></div>';
  }
  function key(g) {return g.scope+"|"+g.category+"|"+g.title;}
  function card(g) {
    return '<details class="issue-row" data-group="'+esc(key(g))+'"><summary><span class="issue-row__scope">'+esc(g.scope)+'</span><span><strong>'+g.groupCount+' × '+esc(g.title)+'</strong><small>'+esc(g.description)+'</small></span><span class="issue-row__arrow">Ver archivos</span></summary><div class="issue-items"></div></details>';
  }
  function render(vm) {
    el("todayLabel").textContent="Cálculo: "+vm.todayLabel;
    el("scanLabel").textContent="Últimos escaneos: "+vm.scansLabel;
    el("noScanNotice").style.display=vm.noScan?"block":"none";
    el("noScanNotice").textContent=vm.noScan?"No hay escaneos disponibles. Selecciona carpetas desde Escaneo.":"";
    const defs=[["max","Máxima"],["high","Alta"],["medium","Media"],["low","Baja"]];
    el("summaryGrid").innerHTML=defs.map(d=>'<div class="kpi kpi--'+d[0]+'"><span>'+d[1]+'</span><strong>'+(vm.counts[d[0]]||0)+'</strong></div>').join("")+
      '<div class="kpi kpi--issue"><span>Inconsistencias visibles</span><strong>'+vm.visibleInconsistencies+'</strong></div>';
    el("workCounts").textContent="Detectados: "+vm.workCounts.quick+" rápidos · "+vm.workCounts.review+" por verificar · "+vm.workCounts.document+" documentos por elaborar";
    el("priorityCount").textContent=vm.tasks.length+" visibles de "+vm.totalTasks;
    el("priorityList").innerHTML=vm.tasks.length?vm.tasks.map(task).join(""):'<div class="empty-state">No hay pendientes en este filtro.</div>';
    el("issueCount").textContent=vm.visibleInconsistencies+" hallazgos en "+vm.inconsistencyGroups+" grupos";
    groups=vm.inconsistencies;
    el("issueList").innerHTML=groups.length?groups.map(card).join(""):'<div class="empty-state">No hay inconsistencias en este filtro.</div>';
  }
  function getFilters() {
    return {scope:el("filterScope").value,area:el("filterArea").value,level:el("filterLevel").value,
      workType:el("filterWork").value,status:el("filterStatus").value,search:el("filterSearch").value};
  }
  function bindEvents(handlers) {
    ["filterScope","filterArea","filterLevel","filterWork","filterStatus"].forEach(id=>el(id).addEventListener("change",()=>handlers.onFiltersChange(getFilters())));
    el("filterSearch").addEventListener("input",()=>handlers.onFiltersChange(getFilters()));
    el("btnResetFilters").addEventListener("click",()=>{
      ["filterScope","filterArea","filterLevel","filterWork","filterStatus"].forEach(id=>{el(id).value="all";});
      el("filterSearch").value="";handlers.onFiltersChange(getFilters());
    });
    el("btnRefreshPriority").addEventListener("click",handlers.onRefresh);
    el("btnRescanPriority").addEventListener("click",handlers.onRescan);
    el("btnExportPriorityPdf").addEventListener("click",handlers.onExportPdf);
    document.addEventListener("click",event=>{
      const btn=event.target.closest("button");if(!btn)return;
      if(btn.classList.contains("js-open"))handlers.onOpenPath(btn.dataset.path);
      if(btn.classList.contains("js-copy"))handlers.onCopy(btn.dataset.name);
      if(btn.classList.contains("js-mkdir"))handlers.onCreateFolder(btn.dataset.id);
    });
    document.addEventListener("change",event=>{
      if(event.target.classList.contains("js-status"))handlers.onStatus(event.target.dataset.id,event.target.value);
    });
    el("issueList").addEventListener("toggle",event=>{
      const node=event.target;
      if(!node.matches||!node.matches("details.issue-row")||!node.open)return;
      const target=node.querySelector(".issue-items");
      if(target.dataset.ready)return;
      const g=groups.find(item=>key(item)===node.dataset.group);
      if(g){target.innerHTML=g.items.map(detail).join("");target.dataset.ready="yes";}
    },true);
  }
  function setGlobalMessage(message,type) {
    const host=el("globalMessage");host.className="global-message"+(type?" is-"+type:"");host.textContent=clean(message);
  }
  window.PriorityUI={render,bindEvents,setGlobalMessage};
})(window, document);
