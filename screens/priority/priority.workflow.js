(function (window) {
  "use strict";
  const RE = /plan|informe|detecci[oó]n|gu[ií]a curricular|construcci[oó]n curricular/i;
  function isLarge(task) {
    if (!task || task.area !== "strategic" || task.workType !== "document") return false;
    const name = String(task.title || "");
    return RE.test(name) && !/^(?:falta )?acta\b|carpeta|fichas de an[aá]lisis/i.test(name);
  }
  function steps(task) {
    const title = String(task.title || "").toLowerCase();
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
  function decorate(task, state) {
    const large = isLarge(task);
    if (!large) return Object.assign({}, task, {
      large: false, stepIndex: 0, stepCount: 1, nextAction: task.title
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
