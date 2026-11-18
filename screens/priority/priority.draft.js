(function (window, document) {
  "use strict";
  const model = window.DraftModel;
  const el = id => document.getElementById(id);
  let task, draft, rules, draftKey, ruleKey, sourceText;
  function read(key, fallback) {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  }
  function persist() {
    preview();
    try { window.localStorage.setItem(draftKey, JSON.stringify(draft)); }
    catch { el("draftMessage").textContent = "No se pudo guardar este borrador en el equipo. Exporte su copia Word antes de cerrar."; }
  }
  function remember(field, enabled) {
    const next = rules.filter(rule=>rule.label !== field.label);
    if (enabled && field.decision) next.push({label:field.label,decision:field.decision,alias:field.alias || ""});
    try {
      window.localStorage.setItem(ruleKey,JSON.stringify(next));
      rules = next;
    } catch { el("draftMessage").textContent = "No se pudo guardar el criterio para próximos documentos."; }
  }
  function preview() {
    const data = model.output(draft);
    el("draftText").textContent = [data.title,data.period,...data.sections.map(s=>s.label+"\n"+(s.text || "[Pendiente de completar]")), ...data.tables.map(t=>t.label+"\n"+t.rows.map(row=>row.join(" | ")).join("\n"))].join("\n\n");
  }
  function button(label, action, selected) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn btn-light"; b.textContent = label;
    if (selected !== undefined) b.setAttribute("aria-pressed",String(selected));
    b.onclick = action;
    return b;
  }
  function render() {
    el("draftTitle").textContent = draft.title;
    el("draftIntro").value = draft.intro;
    el("draftSource").textContent = draft.source ? "Referencia analizada: "+draft.source : "Puede comenzar desde el expediente o comparar un documento anterior.";
    if (draft.referencePeriods?.length)
      el("draftSource").textContent += ". La referencia menciona " + draft.referencePeriods.join(", ") + ". Destino: " + draft.period + ".";
    const list = el("draftFields");
    list.replaceChildren();
    for (const field of draft.fields) {
      const section = document.createElement("section");
      const heading = document.createElement("strong");
      heading.textContent = field.label;
      const question = document.createElement("p");
      question.textContent = field.text ? "¿Incluir este apartado en el borrador?" :
        field.candidate ? "Encontré un posible antecedente. ¿Corresponde incluir este apartado?" :
        "Falta completar este dato. ¿Corresponde incluirlo?";
      section.append(heading,question);
      const prior = rules.find(rule=>rule.label === field.label);
      for (const [value,label] of [["sí","Sí"],["no","No"]]) {
        section.append(button(label,()=>{
          field.decision = value;
          if (prior) remember(field,true);
          persist(); render();
        },field.decision === value));
      }
      const memory = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox"; check.checked = !!prior; check.disabled = !field.decision;
      check.onchange = ()=>{ remember(field,check.checked); render(); };
      memory.append(check," Recordar este criterio para futuros documentos del mismo proceso y tipo");
      section.append(memory);
      if (field.decision !== "no") {
        const input = document.createElement("textarea");
        input.rows = 2; input.maxLength = 20000; input.value = field.text;
        input.placeholder = "Escriba el contenido confirmado o corrija la propuesta";
        input.setAttribute("aria-label",field.label);
        input.oninput = ()=>{field.text=input.value; persist();};
        if (field.candidate) {
          const sample = document.createElement("pre");
          sample.textContent = field.candidate;
          section.append(sample,button("Usar texto de referencia",()=>{
            if (field.text && !window.confirm("¿Reemplazar el texto editado de este apartado?")) return;
            field.text=field.candidate; field.decision="sí"; persist(); render();
          }));
        }
        section.append(input);
        for (const period of model.periodsIn(field.text).filter(p=>model.normalize(p)!==model.normalize(draft.period))) {
          section.append(button("Cambiar «"+period+"» por «"+draft.period+"» en este apartado",()=>{
            field.text = field.text.replace(period,draft.period); persist(); render();
          }));
        }
        const detail = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "En mi referencia este dato tiene otro nombre";
        const alias = document.createElement("input");
        alias.value = field.alias || ""; alias.maxLength = 80;
        alias.setAttribute("aria-label","Nombre equivalente para " + field.label);
        detail.append(summary,alias,button("Aplicar equivalencia",()=>{
          field.alias = alias.value.trim();
          if (sourceText) model.analyze(draft,sourceText);
          if (prior) remember(field,true);
          persist(); render();
        }));
        section.append(detail);
      }
      list.append(section);
    }
    preview();
  }
  function loadPeriod(period) {
    sourceText = "";
    draftKey = "audit-draft-v1:"+JSON.stringify([task.id,period]);
    draft = read(draftKey,null) || model.create(task,period,rules);
    el("draftExtract").hidden = true;
    el("draftExcerpt").textContent = "";
    el("draftNew").value = "";
    el("draftMessage").textContent = "";
    render();
    window.InputTray.open(draftKey,draft,()=>{persist(); render();});
  }
  function open(item) {
    if (!item) throw new Error("Actualice la tarea antes de elaborar el documento.");
    task = item;
    ruleKey = "audit-draft-rules-v1:"+model.identity(task);
    rules = read(ruleKey,[]);
    const periods = [...new Set([task.periodLabel,...window.PriorityPeriods.getItems().map(p=>p.label)].filter(Boolean))];
    const selector = el("draftPeriod");
    selector.replaceChildren();
    if (!task.periodLabel) periods.unshift("Período por confirmar");
    for (const period of periods) selector.add(new Option(period,period));
    selector.onchange = ()=>loadPeriod(selector.value);
    loadPeriod(selector.value);
    el("draftPreview").open = true;
    el("draftDialog").showModal();
  }
  el("draftIntro").oninput = event=>{draft.intro=event.target.value; persist();};
  el("draftClose").onclick = ()=>el("draftDialog").close();
  el("draftAdd").onclick = ()=>{
    const label=el("draftNew").value.trim();
    if (!label || draft.fields.some(f=>model.normalize(f.label) === model.normalize(label))) {
      el("draftMessage").textContent="Escriba un nombre de apartado nuevo."; return;
    }
    draft.fields.push({label,text:"",decision:"sí",candidate:""});
    el("draftNew").value=""; persist(); render();
  };
  el("draftReference").onclick = async ()=>{
    const target = draft;
    try {
      const result = await window.api.drafts.reference();
      if (!result || target !== draft) return;
      sourceText = result.text;
      model.analyze(draft,sourceText);
      draft.source = result.name;
      el("draftExtract").hidden = false;
      el("draftExcerpt").textContent = result.text;
      el("draftMessage").textContent="Revise las propuestas antes de incorporar fechas, cifras o conclusiones de otro período.";
      persist(); render();
    } catch (error) { el("draftMessage").textContent=error.message; }
  };
  el("draftExport").onclick = async ()=>{
    try {
      if (await window.api.drafts.export(model.output(draft)))
        el("draftMessage").textContent="Borrador Word guardado.";
    } catch (error) { el("draftMessage").textContent=error.message; }
  };
  window.PriorityDraft={open};
})(window, document);
