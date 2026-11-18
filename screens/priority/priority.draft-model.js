(function (root) {
  "use strict";
  const normalize = text => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const aliases = {
    "Fecha":["Fecha de elaboración","Fecha de reunión"], "Sede":["Lugar de la reunión","Lugar","Campus"],
    "Objetivo":["Objetivo general","Propósito"], "Actividades":["Actividades realizadas","Desarrollo"],
    "Resultados":["Resultados obtenidos"], "Evidencias":["Anexos","Medios de verificación"],
    "Participantes":["Asistentes"], "Acuerdos":["Compromisos","Tareas o compromisos"],
    "Temas tratados":["Orden del día"], "Destinatario":["Para"], "Asunto":["Tema"]
  };
  function identity(task) {
    return JSON.stringify([task.scope, String(task.processNumber || ""), task.resolvedDocumentId || task.documentId || task.officialName || task.title]);
  }
  function create(task, period, rules = []) {
    const template = String(task.expectedTemplate || "").toUpperCase();
    const kind = (template.match(/(?:^|-)(RGI|INF|ACT)\d*(?:-|$)/) || [])[1] || "GENERAL";
    const title = (task.officialName || task.documentLabel || task.displayTitle || task.title).replace(/per[ií]odo\s+X{2,}/ig,"Período " + period);
    const process = [task.scope, task.processNumber && "PRO-" + task.processNumber].filter(Boolean).join("-");
    const labels = ["Fecha","Sede"];
    if (kind !== "GENERAL") labels.push("Código");
    if (["INF","ACT"].includes(kind)) labels.push("Versión");
    if (kind === "ACT") labels.push("Participantes","Temas tratados","Acuerdos");
    else if (kind === "INF") labels.push("Objetivo","Actividades","Resultados","Conclusiones","Evidencias");
    else if (/cronograma/i.test(title)) labels.push("Actividades","Fechas programadas","Responsables");
    else if (/OFI-|COM-|MEM-/.test(template)) labels.push("Destinatario","Asunto","Contenido");
    else labels.push("Objetivo","Desarrollo","Evidencias");
    for (const rule of rules) if (!labels.includes(rule.label)) labels.push(rule.label);
    const fields = labels.map(label => ({label,text:"",decision:rules.find(r=>r.label===label)?.decision || "", alias:rules.find(r=>r.label===label)?.alias || "", candidate:""}));
    return {kind,title,scope:task.scope,period,fields,source:"",
      intro:"El presente documento corresponde a «" + title + "» del período " + period +
        (process ? ", en el proceso " + process : "") + (task.careerName ? ", carrera de " + task.careerName : "") + "."};
  }
  function periodsIn(text) {
    const month = "(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";
    const range = new RegExp(month+"\\s+(?:de\\s+)?\\d{4}\\s*(?:a|al|hasta|[-–—])\\s*"+month+"\\s+(?:de\\s+)?\\d{4}","gi");
    return [...new Set(text.match(range) || [])];
  }
  function analyze(draft, text) {
    draft.referencePeriods = periodsIn(text).filter(p => normalize(p) !== normalize(draft.period));
    const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const labels = new Map();
    for (const f of draft.fields) {
      f.candidate = "";
      for (const label of [f.label,...(aliases[f.label] || []),f.alias].filter(Boolean)) labels.set(normalize(label), f);
    }
    let current = null;
    for (const line of lines) {
      const parts = line.replace(/^\d+(?:\.\d+)*[.)]?\s+/,"").split(/\s*:\s*/);
      const name = normalize(parts[0]);
      let match = labels.get(name);
      // Use explicit headings from the example, including names outside the catalogue.
      const structured = parts.length > 1 || /^\d+(?:\.\d+)*[.)]\s/.test(line);
      if (!match && structured && /^[\p{L}][\p{L} ,()/-]{2,55}$/u.test(parts[0]) &&
          !/^(codigo|fecha|version|pagina|periodo|nombre|firma|elaborado|revisado|aprobado)\b/.test(name) &&
          draft.fields.length < 50) {
        match = {label:parts[0],text:"",decision:"",candidate:"",fromSource:true};
        draft.fields.push(match);
        labels.set(name,match);
      }
      if (match) {
        current = match;
        if (parts.length === 1) continue;
      } else if (/^.{1,65}:/.test(line) || (line.length < 65 && line === line.toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(line))) {
        current = null;
      }
      if (current) {
        const fragment = match ? parts.slice(1).join(": ") : line;
        current.candidate = [current.candidate,fragment].filter(Boolean).join("\n").slice(0,2500);
      }
    }
  }
  function output(draft) {
    const fields = draft.fields.filter(f=>f.decision !== "no");
    return {kind:draft.kind,title:draft.title,scope:draft.scope,period:draft.period,
      tables:draft.tables || [],
      values:Object.fromEntries(fields.map(f=>[f.label,f.text])),
      sections:[{label:"Presentación",text:draft.intro}, ...fields.map(f=>({label:f.label,text:f.text}))]};
  }
  root.DraftModel = {create,analyze,output,identity,normalize,periodsIn};
})(typeof window === "undefined" ? module.exports : window);
