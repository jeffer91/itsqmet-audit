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
    // Agrupar una sola vez evita recorrer todas las tareas por cada proceso.
    const taskStats=new Map(),issueCounts=new Map();
    for(const task of tasks||[]){
      const id=task.scope+"-"+String(task.processNumber||"");
      if(!taskStats.has(id))taskStats.set(id,{total:0,active:0,first:null});
      const stats=taskStats.get(id);
      stats.total++;
      if(task.status!=="done"){
        stats.active++;
        if(!stats.first||(ranks[task.level]||0)>(ranks[stats.first.level]||0))stats.first=task;
      }
    }
    for(const issue of issues||[]){
      const id=issue.scope+"-"+String(issue.processNumber||"");
      issueCounts.set(id,(issueCounts.get(id)||0)+1);
    }
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
        const stats=taskStats.get(id)||{total:0,active:0,first:null};
        const issueCount=issueCounts.get(id)||0;
        const first=stats.first;
        const ind=(indicators[scope]||{})[number]||["Consultar el manual","Según manual"];
        const located=scanned&&folderNumbers.has(number);
        rows.push({
          id,scope,processNumber:number,processName:meta.name,
          indicator:ind[0],target:ind[1],indicatorValue:"Sin datos para calcular",
          indicatorStatus:"No evaluado",
          folderStatus:!scanned?"Sin escaneo":located?"Localizada":"No localizada",
          tasks:stats.total,activeTasks:stats.active,issues:issueCount,
          priority:first?first.level:"",priorityLabel:first?first.levelLabel:"Sin urgencia calculada",
          nextAction:first?first.title:!scanned?"Escanear carpeta":!located?
            "Verificar ubicación y evidencias del proceso":issueCount?
            "Revisar inconsistencias documentales":"Contrastar indicador con registros de gestión",
          state:!scanned?"Sin escaneo":!located?"Evidencia por localizar":
            stats.total||issueCount?"Con observaciones":"Sin observaciones detectadas"
        });
      });
    });
    return rows.sort((a,b)=>(ranks[b.priority]||0)-(ranks[a.priority]||0)||
      b.activeTasks-a.activeTasks||a.id.localeCompare(b.id,"es"));
  }
  window.PriorityProcesses={buildRows,indicators};
})(window);
