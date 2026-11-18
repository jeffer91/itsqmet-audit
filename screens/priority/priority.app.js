(function (window, document) {
  "use strict";
  let loaded = false;
  let currentBoard = null;
  let signatureRecords = [];
  async function loadSignatureFindings() {
    try {
      const result = await window.api.signatures.list({includePreviews:false,priorityOnly:true});
      if (!result || !result.ok) throw new Error(result && result.error || "No se pudieron consultar las firmas.");
      signatureRecords = Array.isArray(result.records) ? result.records : [];
    } catch (error) {
      signatureRecords = [];
      window.console && window.console.warn("Firmas no disponibles:",error);
    }
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
  function approvedSignatureRecord(record) {
    if (record.scope !== "UTET") return true;
    const number=(String(record.path||"").match(/UTET-PRO[-_ ]*(\d+)/i)||[])[1];
    return !!(number && window.AuditManualCatalog.getProcess("UTET",number));
  }
  function refresh(message,type) {
    const signatureTasks = signatureRecords.filter(x => x.status === "invalid" && !x.stale && approvedSignatureRecord(x)).map(x => ({
      id: "signature-invalid|" + x.scope + "|" + x.path,
      scope: x.scope, processNumber: (String(x.path).match(/PRO[-_ ]*(\d+)/i)||[])[1] || "",
      area: "other", level: "max", levelLabel: "Máxima", workType: "review",
      title: "Verificar firma electrónica inválida: " + x.name,
      nextAction: "Abrir el PDF y gestionar una versión firmada válida",
      reason: "El análisis criptográfico detectó una firma inválida. Confirmar antes de reemplazar evidencias.",
      actionPath: x.path, pathLabel: x.path, effort: "medium", evidenceState: "invalid-signature"
    }));
    for (const record of signatureRecords) {
      if (record.stale || !approvedSignatureRecord(record) || record.status !== "no-electronic-signature") continue;
      const pending = (record.cover?.slots || []).filter(slot => slot.required &&
        ["empty", "review"].includes(slot.status));
      if (!pending.length) continue;
      signatureTasks.push({
        id: "cover-required|" + record.scope + "|" + record.path,
        scope: record.scope, processNumber: (String(record.path).match(/PRO[-_ ]*(\d+)/i) || [])[1] || "",
        area: "other", level: "medium", levelLabel: "Media", workType: "review",
        title: "Revisar casilla de firma en portada: " + record.name,
        suggestedAction: "Contrastar los espacios señalados con la portada original",
        reason: "La portada identifica como obligatorias estas casillas pendientes de revisión: " +
          pending.map(slot => slot.label).join(", "),
        actionPath: record.path, pathLabel: record.path, effort: "medium", evidenceState: "cover-review"
      });
    }
    window.PriorityService.setExternalTasks(signatureTasks);
    const shared=window.AppStore.getSnapshot ? window.AppStore.getSnapshot() : window.AppStore.get();
    const vm=window.PriorityService.buildViewModel({},shared);
    const data=window.PriorityStorage.load();
    const namesContext=window.PriorityNames ? window.PriorityNames.prepare(shared) : null;
    const board=window.PriorityQueue.build(vm,data,namesContext);
    window.PriorityStorage.setQueue(board.queueIds);
    window.PriorityStorage.remember(board.all,board.focusIds);
    window.PriorityStorage.flush().catch(error=>window.PriorityUI.setGlobalMessage("Avance local guardado, pero falló el respaldo: "+error.message,"error"));
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
  function buildDocumentContext(task) {
    const lines=[
      "CONTEXTO PARA ELABORACIÓN DOCUMENTAL — ITSQMET AUDIT",
      "Este texto es una guía de preparación, no un documento aprobado ni evidencia de incumplimiento.",
      "Unidad: "+safe(task.scope),
      "Proceso: "+[safe(task.scope)+"-PRO-"+safe(task.processNumber),safe(task.processName)].filter(Boolean).join(" · "),
      "Período: "+(safe(task.periodLabel)||"Pendiente de confirmar"),
      "Documento solicitado: "+safe(task.officialName||task.documentLabel||task.displayTitle||task.title),
      "Ubicación prevista o detectada: "+(safe(task.pathLabel)||"Pendiente de confirmar"),
      "Situación observada: "+(safe(task.reason)||"Verificar el hallazgo contra el expediente original"),
      "Acción sugerida: "+(safe(task.suggestedAction||task.nextAction)||"Revisar aplicabilidad y reunir evidencias"),
      "Insumos y verificaciones: "+((task.preparation||[]).map(safe).filter(Boolean).join("; ")||"Revisar manual vigente, actas, matrices, cronogramas y antecedentes del proceso"),
      "Referencia disponible: "+(safe(task.referenceFileName||task.candidateFileName)||"Ninguna verificada"),
      "INSTRUCCIONES: Redactar únicamente con información verificable del expediente. Distinguir hechos confirmados, datos pendientes y recomendaciones. No inventar fechas, responsables, firmas, aprobaciones, códigos ni normas. Verificar vigencia y aplicabilidad de los requisitos en el manual institucional. Proponer objetivo, antecedentes, desarrollo, evidencias, conclusiones y anexos según el tipo documental. Respetar la plantilla institucional aprobada; no crear un documento definitivo sin revisión."
    ];
    return lines.join("\n\n");
  }
  async function initialize() {
    window.AppNav && window.AppNav.render("priority");
    window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(true,"Cargando prioridades…");
    const recovered = await window.PriorityStorage.initialize();
    await loadRules();
    await loadSignatureFindings();
    const history=await window.api.history.get();
    if(history&&history.ok&&history.history)window.AppStore.setHistory(history.history);
    const scanPaths=()=>{
      const state=window.AppStore.get();
      return ["UGPA","UTET"].flatMap(scope=>{
        const scan=scope==="UGPA"?state.ugpaResult:state.utetResult;
        return scan&&scan.ok?(scan.files||[]).map(file=>scope+"|"+(file.relativePath||file.path||file.name)):[];
      });
    };
    window.PriorityStorage.compareScan(scanPaths());
    window.PriorityUI.bindEvents({
      onExportBackup:()=>perform(async()=>{
        const result=await window.PriorityStorage.exportBackup();
        if(!result.ok)throw new Error(result.error);
        if(!result.canceled)window.PriorityUI.setGlobalMessage("Respaldo guardado: "+result.filePath,"success");
      }),
      onImportBackup:()=>perform(async()=>{
        const result=await window.PriorityStorage.importBackup();
        if(!result.ok)throw new Error(result.error);
        if(!result.canceled)refresh("Seguimiento restaurado.");
      }),
      onSyncPeriods:()=>perform(async()=>{
        const service=window.api && window.api.periods;
        if (!service || !service.list) throw new Error("La consulta de períodos no está disponible.");
        const response=await service.list();
        if (response && response.ok && window.PriorityPeriods.setPeriods(response.periods))
          refresh("Períodos UTET actualizados desde Firebase (solo lectura).");
        else
          refresh("No se pudo consultar Firebase. Se conservan los períodos de referencia; "+
            (response?.error||"revisar conexión y permisos."),"warning");
      }),
      onSaveSharePoint: values => perform(() => {
        window.PrioritySharePoint.save(values);
        refresh("Enlaces guardados. Comprueba que cada biblioteca corresponde a su raíz local.");
      }),
      onRefresh:()=>perform(()=>{
        window.PriorityStorage.setQueue([]);
        refresh("Prioridades actualizadas. Se conserva el documento actual mientras esté disponible.");
      }),
      onRescan:()=>perform(async()=>{
        window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(true,"Escaneando carpetas…");
        try {
          const total=await rescan();
          // El escaneo de carpetas ya inicia la validación en segundo plano.
          // No esperar ni solicitar una segunda pasada de todos los PDF.
          await loadSignatureFindings();
          const delta=window.PriorityStorage.compareScan(scanPaths());
          await window.PriorityStorage.flush();
          refresh("Se revisaron "+total+" unidad(es). "+(delta?delta.added+" archivos nuevos y "+delta.removed+" rutas que ya no aparecen (pueden ser renombres). ":"")+"El seguimiento se conserva; los archivos nuevos requieren revisión.");
        } finally {
          window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(false);
        }
      }),
      onExportExcel:filters=>perform(async()=>{
        const result=await window.PriorityService.exportExcel(filters||{});
        window.PriorityUI.setGlobalMessage("Excel guardado en Descargas: "+result.fileName,"success");
      }),
      onExportPdf:filters=>perform(async()=>{
        const result=await window.PriorityService.exportPdf(filters||{});
        window.PriorityUI.setGlobalMessage("PDF guardado en Descargas: "+result.fileName,"success");
      }),
      onOpenPath:path=>perform(async()=>{
        await window.PriorityService.openPath(path);
      }),
      onCopySharePoint:url=>perform(async()=>{
        if (!/^https:\/\/itsqmet\.sharepoint\.com\//i.test(String(url || "")))
          throw new Error("El enlace no corresponde al SharePoint institucional.");
        const result=await window.api.shell.copyText(url);
        if (!result || !result.ok) throw new Error(result?.error || "No se pudo copiar el enlace.");
        window.PriorityUI.setGlobalMessage("Enlace de SharePoint copiado.", "success");
      }),
      onStatus:(id,status)=>perform(async()=>{
        const task=getTask(id);
        if(!task)throw new Error("La tarea ya no está disponible. Actualiza.");
        let details={};
        if(["signing","blocked","correction","verified","dismissed","note"].includes(status)){
          details=await window.PriorityUI.requestDetails(task,status);
          if(details===null)return;
        }
        if(status==="verified" && !details.structureConfirmed){
          const result=await window.api.workspace.verifyEvidence(details.evidencePath);
          if(!result||!result.ok)throw new Error(result&&result.error||"No se pudo localizar el PDF definitivo.");
        }
        if(status==="note"){
          window.PriorityStorage.addNote(id,details);
        } else window.PriorityStorage.setStatus(id,status,details.note,details);
        window.PriorityStorage.remember([task],window.PriorityStorage.load().focus);
        await window.PriorityStorage.flush();
        const target=window.PriorityQueue.sectionOf({...task,status});
        refresh(target==="other"?"Guardado en Todos los registros; puedes reactivar desde allí.":
          status==="signing"?"Guardado en Por firmar.":"Guardado en "+({
            pending:"Pendientes",doing:"En elaboración",archive:"Por archivar",
            completed:"Completados",corrections:"Correcciones",signing:"Por firmar"
          }[target]||"su sección")+".");
        if(target!=="other")window.PriorityUI.setTab(target);
      }),
      onStep:id=>perform(async()=>{
        const task=getTask(id);
        if(!task||!task.large)throw new Error("Esta tarea no tiene etapas.");
        window.PriorityStorage.completeStep(id,task.stepIndex,task.stepCount);
        await window.PriorityStorage.flush();
        const finished=task.stepIndex+1===task.stepCount;
        refresh(finished?"Etapas realizadas; pasa a Por archivar para verificar el PDF definitivo.":"Paso registrado. Continúa con la siguiente etapa.");
        if(finished)window.PriorityUI.setTab(window.PriorityQueue.sectionOf({...task,status:"done"}));
      }),
      onReopen:id=>perform(async()=>{
        window.PriorityStorage.resetTask(id);
        await window.PriorityStorage.flush();
        refresh("La tarea se reactivó.");
        window.PriorityUI.setTab(window.PriorityQueue.sectionOf({...getTask(id),status:"pending"}));
      }),
      onCopyContext:id=>perform(async()=>{
        const task=getTask(id);
        if(!task)throw new Error("La tarea ya no está disponible.");
        const result=await window.api.shell.copyText(buildDocumentContext(task));
        if(!result||!result.ok)throw new Error(result&&result.error||"No se pudo copiar el contexto.");
        window.PriorityUI.setGlobalMessage("Contexto documental copiado. Verifica los antecedentes antes de elaborar.","success");
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
    if(window.api.signatures && typeof window.api.signatures.onUpdated==="function"){
      window.api.signatures.onUpdated(update=>{
        if(update.phase==="completed"){
          loadSignatureFindings().then(()=>refresh())
            .catch(error=>window.PriorityUI.setGlobalMessage(error.message||"Error al actualizar firmas.","error"));
        }else if(update.phase==="failed"){
          window.PriorityUI.setGlobalMessage("El análisis de firmas falló. Las prioridades siguen disponibles.","error");
        }
      });
    }
    refresh(recovered && recovered.error ? recovered.error+" Usa Herramientas → Restaurar respaldo. El seguimiento no se sobrescribirá." : recovered?"Seguimiento recuperado desde la copia automática.":"", recovered && recovered.error ? "error":"success");
    // Sincronizar al abrir Priorización sin bloquear el inventario si falla la red.
    if (window.api && window.api.periods && window.api.periods.list) {
      window.api.periods.list().then(response=>{
        if (response && response.ok && window.PriorityPeriods &&
            window.PriorityPeriods.setPeriods(response.periods)) refresh();
      }).catch(error=>window.console && window.console.warn(
        "No se pudo actualizar el catálogo de períodos; se conserva la referencia.",error));
    }
  }
  document.addEventListener("DOMContentLoaded",function () {
    initialize().catch(error=>window.PriorityUI &&
      window.PriorityUI.setGlobalMessage(error && error.message || "No se pudo iniciar.","error"))
      .finally(()=>window.AppNav && window.AppNav.setLoading && window.AppNav.setLoading(false));
  });
})(window,document);

