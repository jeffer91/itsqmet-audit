(function (window, document) {
  "use strict";
  let loaded=false;
  let filters={scope:"all",process:"all",area:"all",level:"all",workType:"all",status:"all",search:""};
  const safe=v=>String(v==null?"":v).trim();
  function loadScript(src) {
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");script.src=src;script.async=false;
      script.onload=resolve;script.onerror=()=>reject(new Error("No se pudo cargar "+src));
      document.head.appendChild(script);
    });
  }
  async function loadRules() {
    if(loaded)return;
    const response=await window.api.rules.listFiles();
    if(!response||!response.ok)throw new Error(response&&response.error||"Error al cargar reglas");
    for(const rule of response.files||[]) {
      if(rule.globalName&&Object.prototype.hasOwnProperty.call(window,rule.globalName))continue;
      for(const file of rule.scripts||[])await loadScript("../rules/rulesets/"+safe(file).replace(/^\/+/, ""));
    }
    loaded=true;
  }
  function refresh(message) {
    const vm=window.PriorityService.buildViewModel(filters);
    window.PriorityUI.render(vm);
    if(message)window.PriorityUI.setGlobalMessage(message,"success");
    return vm;
  }
  async function perform(callback) {
    try {return await callback();}
    catch(error){window.PriorityUI.setGlobalMessage(error&&error.message||"Error inesperado.","error");return null;}
  }
  async function initialize() {
    window.AppNav&&window.AppNav.render("priority");
    window.AppNav&&window.AppNav.setLoading&&window.AppNav.setLoading(true,"Cargando Priorización…");
    await loadRules();
    const history=await window.api.history.get();
    if(history&&history.ok&&history.history)window.AppStore.setHistory(history.history);
    window.PriorityUI.bindEvents({
      onRefresh:()=>refresh("Prioridades recalculadas con el último escaneo."),
      onRescan:()=>perform(async()=>{
        window.AppNav&&window.AppNav.setLoading&&window.AppNav.setLoading(true,"Escaneando carpetas…");
        try {
          let count=0;
          for(const scope of ["UGPA","UTET"]) {
            const scan=window.AppStore.get()[scope==="UGPA"?"ugpaResult":"utetResult"];
            if(!scan||!scan.ok||!scan.source||scan.source.kind!=="folder")continue;
            const result=await window.api.archive.scanFolderFromPath(scope,scan.source.selectedFolderPath||scan.rootPath);
            if(!result||!result.ok)throw new Error(result&&result.error||"Error en "+scope);
            window.AppStore.setHistory(result.history);count++;
          }
          if(!count)throw new Error("No hay carpetas locales registradas. Usa la pestaña Escaneo.");
          refresh("Se escanearon "+count+" carpetas de unidad.");
        } finally {window.AppNav&&window.AppNav.setLoading&&window.AppNav.setLoading(false);}
      }),
      onExportExcel:()=>perform(async()=>{
        const result=await window.PriorityService.exportExcel(filters);
        window.PriorityUI.setGlobalMessage("Excel guardado en Descargas: "+result.fileName,"success");
      }),
      onExportPdf:()=>perform(async()=>{
        const result=await window.PriorityService.exportPdf(filters);
        window.PriorityUI.setGlobalMessage("PDF guardado en Descargas: "+result.fileName,"success");
      }),
      onFiltersChange:next=>{
        if(next.scope!=="all" && next.process!=="all" && !next.process.startsWith(next.scope+"-"))next.process="all";
        filters=next;refresh();
      },
      onOpenPath:target=>perform(()=>window.PriorityService.openPath(target)),
      onCopy:name=>perform(async()=>{
        const result=await window.api.shell.copyText(name);
        if(!result||!result.ok)throw new Error(result&&result.error||"No se pudo copiar.");
        window.PriorityUI.setGlobalMessage("Nombre sugerido copiado.","success");
      }),
      onStatus:(id,status)=>perform(()=>{
        window.PriorityService.saveProgress(id,status);
        refresh("Estado guardado en este equipo; no sustituye la evidencia documental.");
      }),
      onCreateFolder:id=>perform(async()=>{
        const task=window.PriorityService.buildViewModel(filters).tasks.find(item=>item.id===id);
        if(!task||!task.parentPath||!task.proposedFolderName)throw new Error("Carpeta no disponible.");
        if(!window.confirm("Crear carpeta en:\n"+task.parentPath+"\n\nNombre:\n"+task.proposedFolderName+"\n\nSe comprobará que no exista."))return;
        await window.PriorityService.createFolder(task);
        window.PriorityUI.setGlobalMessage("Carpeta creada. Vuelve a escanear para verificar.","success");
      })
    });
    window.AppStore.subscribe(()=>refresh());
    refresh();
  }
  document.addEventListener("DOMContentLoaded",()=>{
    initialize().catch(error=>window.PriorityUI&&window.PriorityUI.setGlobalMessage(error.message,"error"))
      .finally(()=>window.AppNav&&window.AppNav.setLoading&&window.AppNav.setLoading(false));
  });
})(window, document);
