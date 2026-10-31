(function (window, document) {
  "use strict";
  let loaded = false;
  let currentBoard = null;
  let signatureRecords = [];
  async function loadSignatureFindings() {
    try { const result = await window.api.signatures.list(); signatureRecords = result.records || []; }
    catch (_error) { signatureRecords = []; }
  }
  const safe = value => String(value == null ? "" : value).trim();
  function loadScript(src) {
    return new Promise(function (resolve,reject) {
      const script=document.createElement("script");
      script.src=src;script.async=false;script.onload=resolve;
      script.onerror=()=>reject(new Error("No se pudo cargar "+src));
      document.head.appendChild(script);
    });
  }
  async function loadRules() {
    if (loaded) return;
    const response=await window.api.rules.listFiles();
    if (!response || !response.ok) throw new Error(response && response.error || "No se pudieron cargar las reglas.");
    for (const rule of response.files || []) {
      if (rule.globalName && Object.prototype.hasOwnProperty.call(window,rule.globalName)) continue;
      for (const file of rule.scripts || [])
        await loadScript("../rules/rulesets/" + safe(file).replace(/^\/+/, ""));
    }
    loaded=true;
  }
  function refresh(message,type) {
    const vm=window.PriorityService.buildViewModel({});
    // Only confirmed invalid cryptographic signatures create automatic tasks.
    // Missing/unverifiable signatures are displayed in their own module.
    const signatureTasks = signatureRecords.filter(x => x.status === "invalid").map(x => ({
      id: "signature-invalid|" + x.scope + "|" + x.path,
      scope: x.scope, processNumber: (String(x.path).match(/PRO[-_ ]*(\\d+)/i)||[])[1] || "",
      area: "other", level: "max", levelLabel: "Máxima", workType: "review",
      title: "Verificar firma electrónica inválida: " + x.name,
      nextAction: "Abrir el PDF y gestionar una versión firmada válida",
      reason: "El análisis criptográfico detectó una firma inválida. Confirmar antes de reemplazar evidencias.",
      actionPath: x.path, pathLabel: x.path, effort: "medium", evidenceState: "invalid-signature"
    }));
    vm.tasks = (vm.tasks || []).concat(signatureTasks);
    const data=window.PriorityStorage.load();
    const board=window.PriorityQueue.build(vm,data);
    window.PriorityStorage.setQueue(board.queueIds);
    currentBoard=board;
    window.PriorityUI.render(vm,board);
    if(message)window.PriorityUI.setGlobalMessage(message,type||"success");
    return board;
  }
  async function perform(callback) {
    try { return await callback(); }
    catch(error) {
      window.PriorityUI.setGlobalMessage(error && error.message || "No se pudo completar la acción.","error");
      return null;
    }
  }
  function getTask(id) {
    return currentBoard && currentBoard.all.find(item=>item.id===id);
  }
  async function rescan(scopes) {
    const previous=window.AppStore.get();
    let count=0;
    const errors=[];
    for(const scope of scopes || ["UGPA","UTET"]) {
      const scan=scope==="UGPA"?previous.ugpaResult:previous.utetResult;
      if (!scan || !scan.ok || !scan.source || scan.source.kind!=="folder") continue;
      try {
        const result=await window.api.archive.scanFolderFromPath(
          scope,scan.source.selectedFolderPath||scan.rootPath);
        if(!result||!result.ok)throw new Error(result&&result.error||"Error de escaneo.");
        window.AppStore.setHistory(result.history);
        count++;
      } catch(error){errors.push(scope+": "+(error&&error.message||"Error"));}
    }
    if(!count&& !errors.length)throw new Error("Selecciona carpetas locales desde Escaneo.");
    if(errors.length)throw new Error(errors.join(" · "));
    return count;
  }
  async function initialize() {
    window.AppNav && window.AppNav.render("priority");
    window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(true,"Cargando prioridades…");
    await loadRules();
    await loadSignatureFindings();
    const history=await window.api.history.get();
    if(history&&history.ok&&history.history)window.AppStore.setHistory(history.history);
    window.PriorityUI.bindEvents({
      onRefresh:()=>perform(()=>{
        window.PriorityStorage.setQueue([]);
        refresh("Se actualizaron las cinco prioridades.");
      }),
      onRescan:()=>perform(async()=>{
        window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(true,"Escaneando carpetas…");
        try {
          const total=await rescan();
          await loadSignatureFindings();
          refresh("Se revisaron "+total+" unidad(es). El avance registrado se conserva.");
        } finally {
          window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(false);
        }
      }),
      onExportExcel:()=>perform(async()=>{
        const result=await window.PriorityService.exportExcel({});
        window.PriorityUI.setGlobalMessage("Excel guardado en Descargas: "+result.fileName,"success");
      }),
      onExportPdf:()=>perform(async()=>{
        const result=await window.PriorityService.exportPdf({});
        window.PriorityUI.setGlobalMessage("PDF guardado en Descargas: "+result.fileName,"success");
      }),
      onOpenPath:path=>perform(async()=>{
        await window.PriorityService.openPath(path);
      }),
      onStatus:(id,status)=>perform(()=>{
        const task=getTask(id);
        if(!task)throw new Error("La tarea ya no está disponible. Actualiza.");
        let note="";
        if(status==="blocked"){
          const entered=window.prompt("¿Qué falta para continuar? (responsable, insumo o aprobación)");
          if(entered===null)return;
          note=safe(entered);
          if(!note)throw new Error("Indica el motivo del bloqueo.");
        }
        window.PriorityStorage.setStatus(id,status,note);
        refresh(status==="done"?"Trabajo registrado; la evidencia sigue pendiente de validación.":
          status==="blocked"?"Tarea bloqueada; la siguiente recomendación está disponible.":
          status==="snoozed"?"Tarea pospuesta. Puedes reactivarla en Ver todos.":
          "Avance guardado.");
      }),
      onStep:id=>perform(()=>{
        const task=getTask(id);
        if(!task||!task.large)throw new Error("Esta tarea no tiene etapas.");
        window.PriorityStorage.completeStep(id,task.stepIndex,task.stepCount);
        refresh(task.stepIndex+1===task.stepCount
          ?"Se completaron las etapas; la evidencia debe validarse."
          :"Paso registrado. Ya puedes continuar con la siguiente etapa.");
      }),
      onReopen:id=>perform(()=>{
        window.PriorityStorage.resetTask(id);
        refresh("La tarea se reactivó.");
      }),
      onCreateFolder:id=>perform(async()=>{
        const task=getTask(id);
        if(!task||!task.parentPath||!task.proposedFolderName)
          throw new Error("No existe un destino local verificado.");
        if(!window.confirm("Crear carpeta en:\n"+task.parentPath+"\n\nNombre:\n"+task.proposedFolderName+"\n\nNo se reemplazará ninguna carpeta existente."))return;
        await window.PriorityService.createFolder(task);
        try {
          await rescan([task.scope]);
          refresh("Carpeta creada y unidad escaneada. Confirma la evidencia antes de validar.");
        } catch(error) {
          refresh("La carpeta se creó. Vuelve a escanear para confirmar.", "warning");
        }
      })
    });
    window.AppStore.subscribe(()=>refresh());
    refresh();
  }
  document.addEventListener("DOMContentLoaded",function () {
    initialize().catch(error=>window.PriorityUI &&
      window.PriorityUI.setGlobalMessage(error && error.message || "No se pudo iniciar.","error"))
      .finally(()=>window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(false));
  });
})(window,document);
