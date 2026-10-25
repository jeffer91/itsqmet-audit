(function (window) {
  "use strict";
  // Las metas provienen de los manuales. Sin numerador/denominador no hay KPI calculado.
  const indicators = {
    UGPA:{
      "70":["Plan de capacitación elaborado y aprobado","100%"],
      "31":["Plan de formación elaborado y aprobado","100%"],
      "60":["Fichas y guías curriculares por carrera","100%"],
      "134":["Participación docente en capacitación","100%"],
      "135":["Capacitaciones evaluadas posteriormente","100%"],
      "251":["Planes individuales elaborados y aprobados","80%"],
      "248":["Seguimiento de formación docente","80%"],
      "321":["Fichas de análisis curricular por carrera","100%"]
    },
    UTET:{
      "94":["Plazo de actualización y aprobación normativa","60 días (según contexto)"],
      "56":["Planificaciones entregadas oportunamente","95%"],
      "95":["Informes de resultados entregados","95%"],
      "58":["Estudiantes con requisitos cumplidos en plazo","95%"],
      "59":["Guías aprobadas dentro del plazo","95%"],
      "88":["Estudiantes que aprueban seminarios","95%"],
      "93":["Estudiantes que aprueban examen complexivo","95%"],
      "96":["Temas de titulación entregados oportunamente","95%"],
      "164":["Estudiantes que culminan y aprueban el trabajo","95%"],
      "57":["Estudiantes que culminan y aprueban artículo académico","95%"],
      "97":["Estudiantes que reciben inducción","95%"]
    }
  };
  const ranks={max:4,high:3,medium:2,low:1};
  function buildRows(shared,tasks,issues,filters) {
    const catalog=window.AuditManualCatalog && window.AuditManualCatalog.catalog || {};
    const rows=[];
    ["UGPA","UTET"].forEach(function (scope){
      const unit=catalog[scope];if(!unit||!unit.processes)return;
      const scan=scope==="UGPA"?shared.ugpaResult:shared.utetResult;
      const scanned=!!(scan&&scan.ok);
      const folderNumbers=new Set();
      if(scanned&&window.RulesTypes&&window.RulesTypes.buildScanIndex&&window.RulesTypes.findProcessFolders){
        const index=window.RulesTypes.buildScanIndex(scan);
        window.RulesTypes.findProcessFolders(index,scope).forEach(function(folder){
          const parsed=folder.processValidation||
            (window.RulesTypes.parseProcessFolderName&&window.RulesTypes.parseProcessFolderName(folder.name,scope));
          if(parsed&&parsed.processNumber)folderNumbers.add(String(parsed.processNumber));
        });
      }
      Object.keys(unit.processes).forEach(function(number){
        const id=scope+"-"+number;
        if(filters&&filters.scope&&filters.scope!=="all"&&filters.scope!==scope)return;
        if(filters&&filters.process&&filters.process!=="all"&&filters.process!==id)return;
        const meta=unit.processes[number];
        const processTasks=(tasks||[]).filter(x=>x.scope===scope&&String(x.processNumber)===number);
        const processIssues=(issues||[]).filter(x=>x.scope===scope&&String(x.processNumber)===number);
        const active=processTasks.filter(x=>x.status!=="done");
        const first=active.slice().sort((a,b)=>(ranks[b.level]||0)-(ranks[a.level]||0))[0];
        const ind=(indicators[scope]||{})[number]||["Consultar el manual","Según manual"];
        const located=scanned&&folderNumbers.has(number);
        rows.push({
          id,scope,processNumber:number,processName:meta.name,
          indicator:ind[0],target:ind[1],indicatorValue:"Sin datos para calcular",
          indicatorStatus:"No evaluado",
          folderStatus:!scanned?"Sin escaneo":located?"Localizada":"No localizada",
          tasks:processTasks.length,activeTasks:active.length,issues:processIssues.length,
          priority:first?first.level:"",priorityLabel:first?first.levelLabel:"Sin urgencia calculada",
          nextAction:first?first.title:!scanned?"Escanear carpeta":!located?
            "Verificar ubicación y evidencias del proceso":processIssues.length?
            "Revisar inconsistencias documentales":"Contrastar indicador con registros de gestión",
          state:!scanned?"Sin escaneo":!located?"Evidencia por localizar":
            processTasks.length||processIssues.length?"Con observaciones":"Sin observaciones detectadas"
        });
      });
    });
    return rows.sort((a,b)=>(ranks[b.priority]||0)-(ranks[a.priority]||0)||
      b.activeTasks-a.activeTasks||a.id.localeCompare(b.id,"es"));
  }
  window.PriorityProcesses={buildRows,indicators};
})(window);
