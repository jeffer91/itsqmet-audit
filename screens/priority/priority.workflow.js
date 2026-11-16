(function (window) {
  "use strict";
  const RE = /plan|informe|detecci[oó]n|gu[ií]a curricular|construcci[oó]n curricular/i;
  function isLarge(task) {
    if (!task || task.resolvedDocumentId === "" || task.sourceFileName || task.area !== "strategic" || task.workType !== "document") return false;
    const name = String(task.title || "");
    return RE.test(name) && !/^(?:falta )?acta\b|carpeta|fichas de an[aá]lisis/i.test(name);
  }
  function steps(task) {
    const title = String(task.title || "").toLowerCase();
    if (task.scope === "UGPA" && String(task.processNumber) === "60" &&
        (task.documentId === "guia" || task.resolvedDocumentId === "rgi3")) return [
      "Verificar el acta y las fichas de análisis curricular por nivel",
      "Confirmar la aprobación de las fichas con los responsables",
      "Reunir los insumos curriculares y resultados de las fichas",
      "Elaborar la Guía Curricular de Aplicación Académica",
      "Tramitar aprobación y archivar el PDF definitivo"
    ];
    if (/informe/.test(title)) return [
      "Localizar antecedentes e informe anterior", "Reunir resultados y evidencias",
      "Organizar indicadores y análisis", "Redactar el informe",
      "Revisar, tramitar aprobación y archivar PDF"
    ];
    if (/plan/.test(title)) return [
      "Comprobar planes y diagnósticos existentes", "Recopilar necesidades e insumos",
      "Definir actividades, responsables y fechas", "Redactar el plan",
      "Revisar, tramitar aprobación y archivar PDF"
    ];
    if (/detecci[oó]n/.test(title)) return [
      "Verificar encuesta y documentos existentes", "Reunir respuestas e información",
      "Analizar las necesidades", "Redactar el documento",
      "Revisar y archivar la evidencia final"
    ];
    return [
      "Revisar antecedentes y evidencias existentes", "Reunir insumos de las carreras",
      "Elaborar el documento curricular", "Validar con responsables",
      "Archivar el PDF final aprobado"
    ];
  }
  function preparation(task) {
    const name=String(task.officialName||task.title||"").toLowerCase();
    const context=[task.scope,task.processNumber?"PRO-"+task.processNumber:"",task.periodLabel,task.careerName].filter(Boolean).join(" · ");
    let inputs=[];
    if(/cronograma/.test(name))inputs=["Confirmar fechas de inicio, entregas, evaluación y cierre con los responsables.","Asignar responsable y plazo a cada actividad y comprobar cruces."];
    else if(/designaci[oó]n/.test(name))inputs=["Confirmar la nómina de docentes, carreras, funciones y período de asignación.","Verificar quién autoriza la designación antes de enviarla a firma."];
    else if(/plagio/.test(name))inputs=["Reunir los reportes de similitud y vincular cada resultado con su artículo y estudiante.","Comprobar el criterio institucional aplicable sin inventar un porcentaje permitido."];
    else if(/acta/.test(name))inputs=["Reunir fecha, participantes, resultados y acuerdos de la sesión o evaluación.","Contrastar nombres, decisiones y firmantes con los registros originales."];
    else if(/informe|reporte/.test(name))inputs=["Reunir registros del período y comprobar totales, resultados e indicadores.","Relacionar cada resultado y conclusión con su evidencia y anexos."];
    else if(/plan/.test(name))inputs=["Reunir el diagnóstico de necesidades y los resultados del plan anterior.","Definir objetivos, actividades, responsables, fechas y evidencias de cumplimiento."];
    else if(/gu[ií]a|ficha/.test(name))inputs=["Reunir actas, fichas por nivel e insumos de la carrera.","Confirmar la aprobación de antecedentes antes de elaborar la versión final."];
    else if(/comunicado/.test(name))inputs=["Confirmar destinatarios, fechas, instrucciones y autoridad que autoriza el comunicado."];
    if(!inputs.length)return [];
    return ["Confirmar el ámbito: "+context].concat(inputs,["Usar el formato institucional vigente. Una referencia anterior no acredita que sea la plantilla vigente."]);
  }
  function decorate(task, state) {
    task=Object.assign({},task,{preparation:preparation(task)});
    const large = isLarge(task);
    if (!large) return Object.assign({}, task, {
      large: false, stepIndex: 0, stepCount: 1, nextAction: task.suggestedAction || task.title
    });
    const list = steps(task);
    const index = Math.max(0, Math.min(list.length, Number(state && state.stages && state.stages[task.id] || 0)));
    return Object.assign({}, task, {
      large: true, projectTitle: task.title,
      stepIndex: index, stepCount: list.length, steps: list,
      nextAction: list[index] || "Pendiente de verificación de evidencias"
    });
  }
  window.PriorityWorkflow = { isLarge: isLarge, steps: steps, decorate: decorate };
})(window);
