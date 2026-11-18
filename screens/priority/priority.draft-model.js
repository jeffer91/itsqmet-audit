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
  function profile(task) {
    const key=[task.scope,task.processNumber,task.resolvedDocumentId || task.documentId].join("/");
    if (["UGPA/70/rgi2","UGPA/31/rgi2","UTET/56/rgi1","UTET/56/rgi2","UTET/56/rgi3"].includes(key))
      return ["Diagnóstico","Objetivos","Metodología","Plan de acción","Cronograma","Responsables","Indicadores","Seguimiento"];
    if (["UGPA/70/rgi3","UGPA/31/rgi3","UTET/95/inf"].includes(key))
      return ["Plan aprobado","Objetivos y metas","Actividades ejecutadas","Resultados","Desviaciones","Recursos","Acciones correctivas","Conclusiones","Evidencias"];
    if (key==="UTET/58/rgi1")
      return ["Estudiante","Requisitos verificados","Fecha de corte","Observaciones"];
    return [];
  }
  function tableFindings(draft) {
    const findings=[];
    for(const table of draft.tables || []){
      const [header,...rows]=table.rows;
      if(!header || !rows.length)continue;
      for(const [column,label] of header.entries()){
        const key=normalize(label);
        if(!["sede","campus","carrera","modalidad","cumplimiento","estado de requisito"].includes(key))continue;
        const counts=new Map();
        for(const row of rows){
          const value=String(row[column] || "").trim() || "(sin dato)";
          counts.set(value,(counts.get(value) || 0)+1);
        }
        const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)
          .map(([value,count])=>value+" ("+count+")");
        findings.push(table.label+" · "+label+": "+top.join(", ")+
          (counts.size>8?" y "+(counts.size-8)+" categorías adicionales":"")+
          ". Base: "+rows.length+" filas de datos.");
      }
    }
    return findings;
  }
  function review(draft) {
    const included=draft.fields.filter(f=>f.decision!=="no");
    const missing=included.filter(f=>!f.text.trim()).map(f=>f.label);
    const historical=included.filter(f=>periodsIn(f.text).some(p=>periodKey(p)!==periodKey(draft.period))).map(f=>f.label);
    return {filled:included.length-missing.length,missing,historical};
  }
  function periodKey(value) {
    return normalize(value).replace(/\bde\b/g,"").replace(/\s*(?:\ba(?:l)?\b|\bhasta\b|[-–—])\s*/g,"/").replace(/\s+/g,"");
  }
  function create(task, period, rules = []) {
    const template = String(task.expectedTemplate || "").toUpperCase();
    const kind = (template.match(/(?:^|-)(RGI|INF|ACT)\d*(?:-|$)/) || [])[1] || "GENERAL";
    const title = (task.officialName || task.documentLabel || task.displayTitle || task.title).replace(/per[ií]odo\s+X{2,}/ig,"Período " + period);
    const process = [task.scope, task.processNumber && "PRO-" + task.processNumber].filter(Boolean).join("-");
    const labels = ["Fecha","Sede"];
    if (kind !== "GENERAL") labels.push("Código");
    if (["INF","ACT"].includes(kind)) labels.push("Versión");
    const structure=profile(task);
    if (structure.length) labels.push(...structure);
    else if (kind === "ACT") labels.push("Participantes","Temas tratados","Acuerdos");
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
    draft.referencePeriods = periodsIn(text).filter(p => periodKey(p) !== periodKey(draft.period));
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
  root.DraftModel = {create,analyze,output,identity,normalize,periodsIn,periodKey,review,tableFindings};
})(typeof window === "undefined" ? module.exports : window);
