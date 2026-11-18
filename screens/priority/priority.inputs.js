(function (window,document) {
  "use strict";
  const el=id=>document.getElementById(id);
  const model=window.DocumentInputs;
  let context, database;
  function db() {
    if (!database) database=new Promise((resolve,reject)=>{
      const req=indexedDB.open("audit-document-inputs",1);
      req.onupgradeneeded=()=>req.result.createObjectStore("sources",{keyPath:"id"}).createIndex("draft","draft");
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>{database=null;reject(req.error);};
    });
    return database;
  }
  async function storage(action) {
    const database=await db();
    return new Promise((resolve,reject)=>{
      const tx=database.transaction("sources","readwrite");
      const request=action(tx.objectStore("sources"));
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error || new Error("No se pudo guardar el insumo."));
    });
  }
  function node(tag,text) {
    const element=document.createElement(tag);
    element.textContent=text;
    return element;
  }
  function button(text,fn) {
    const result=node("button",text);
    result.className="btn btn-light"; result.type="button"; result.onclick=fn;
    return result;
  }
  function tableView(rows) {
    const wrapper=document.createElement("div");
    wrapper.className="input-table";
    const table=document.createElement("table");
    for(const [i,row] of rows.slice(0,30).entries()){
      const tr=table.insertRow();
      for(const value of row) tr.append(node(i===0?"th":"td",value));
    }
    wrapper.append(table);
    if(rows.length>30)wrapper.append(node("p","Vista previa de 30 de "+rows.length+" filas."));
    return wrapper;
  }
  function message(text){el("inputStatus").textContent=text;}
  function applyText(label,text,source) {
    if(!text.trim()){message("Seleccione o escriba el texto que desea incorporar.");return;}
    const {draft}=context;
    let field=draft.fields.find(f=>f.label===label);
    if(field?.text && field.text!==text &&
      !window.confirm("«"+label+"» ya tiene otro valor. ¿Reemplazarlo por el de «"+source+"»?"))return;
    if(!field){field={label,candidate:"",alias:""};draft.fields.push(field);}
    Object.assign(field,{text,decision:"sí",inputSource:source});
    context.changed();message("Incorporado en «"+label+"» desde "+source+".");
  }
  function toggleTable(id,table,source){
    const {draft}=context;
    draft.tables=(draft.tables || []).filter(t=>t.id!==id);
    if(table)draft.tables.push({id,label:table.label,rows:table.rows,source});
    context.changed();
  }
  function renderSources(){
    const list=el("inputSources");list.replaceChildren();
    const ctx=context;
    const byLabel=new Map();
    const proposals=new Map();
    for(const source of ctx.sources){
      const found=model.suggestions(ctx.draft,source,window.DraftModel);
      proposals.set(source.id,found);
      for(const item of found){
        if(!byLabel.has(item.label))byLabel.set(item.label,new Map());
        const values=byLabel.get(item.label);
        if(!values.has(item.text))values.set(item.text,[]);
        values.get(item.text).push(source.name);
      }
    }
    for(const [label,values] of byLabel){
      if(values.size<2)continue;
      const panel=document.createElement("details");
      panel.append(node("summary","Hay datos distintos para «"+label+"». ¿Cuál corresponde?"));
      for(const [text,names] of values){
        const source=names.join(", ");
        panel.append(node("p",source),node("pre",text),button("Usar esta versión",()=>applyText(label,text,source)));
      }
      list.append(panel);
    }
    for(const source of ctx.sources){
      const detail=document.createElement("details");
      detail.append(node("summary",source.name));
      if(source.text){
        const text=document.createElement("textarea");text.value=source.text;text.rows=5;
        text.setAttribute("aria-label","Texto a incorporar de "+source.name);
        const destination=document.createElement("select");
        destination.setAttribute("aria-label","Apartado de destino");
        for(const field of ctx.draft.fields)destination.add(new Option(field.label,field.label));
        detail.append(text,destination,button("Usar selección o texto en el apartado",()=>{
          const selected=text.value.substring(text.selectionStart,text.selectionEnd);
          applyText(destination.value,selected || text.value,source.name);
        }));
      }
      for(const proposal of proposals.get(source.id)){
        const panel=document.createElement("details");
        panel.append(node("summary","¿Usar este dato en «"+proposal.label+"»?"),node("pre",proposal.text),
          button("Sí, incorporar",()=>applyText(proposal.label,proposal.text,source.name)));
        detail.append(panel);
      }
      for(const [index,t] of (source.tables || []).entries()){
        const id=source.id+"-"+index;
        const included=ctx.draft.tables?.some(table=>table.id===id);
        const part=document.createElement("details");
        part.append(node("summary",t.label+" · "+t.rows.length+" filas"),tableView(t.rows));
        part.append(button(included?"Retirar tabla del borrador":"Incluir tabla completa",()=>{
          if(!included && t.rows.some(row=>row.length>63)){
            message("La hoja supera 63 columnas por tabla Word. Seleccione un bloque más pequeño en Excel.");return;
          }
          toggleTable(id,included?null:t,source.name);renderSources();
        }));
        detail.append(part);
      }
      detail.append(button("Retirar insumo de la bandeja",async()=>{
        if(!window.confirm("¿Retirar este insumo? El contenido ya incorporado al borrador se conserva."))return;
        try{
          await storage(store=>store.delete(source.id));
          if(context!==ctx)return;
          ctx.sources=ctx.sources.filter(s=>s.id!==source.id);renderSources();
        }catch(error){if(context===ctx)message(error.message);}
      }));
      list.append(detail);
    }
  }
  function schedule(){
    const s=model.schedule;
    const {draft}=context;
    const known=draft.scheduleAnswer;
    el("scheduleQuestion").textContent="Título recibido: «"+s.name+"». Las actividades van del 20/05/2026 al 02/07/2026. ¿Corresponden a «"+draft.period+"»?"+
      (known==="yes"?" Confirmado para este borrador.":known==="no"?" Descartado para este borrador.":"");
    el("scheduleYes").disabled=known==="yes" || draft.period==="Período por confirmar";
    el("scheduleNo").disabled=known==="no";
    el("scheduleRows").replaceChildren(tableView(s.rows));
  }
  async function add(loader){
    const ctx=context;
    try{
      const source=await loader();
      if(!source || ctx!==context)return;
      const id=crypto.randomUUID();
      const record={...source,id,draft:ctx.key};
      if (!record.tables?.length && record.text) record.tables=model.pastedTable(record.text);
      await storage(store=>store.add(record));
      if(ctx!==context)return;
      ctx.sources=await storage(store=>store.index("draft").getAll(ctx.key));
      if(ctx!==context)return;
      renderSources();message("Insumo guardado. Abra «"+source.name+"» para revisar las propuestas.");
      return true;
    }catch(error){if(ctx===context)message(error.message);}
  }
  el("inputUpload").onclick=()=>add(()=>window.api.drafts.input());
  el("inputAdd").onclick=async()=>{
    const text=el("inputNote").value.trim();
    if(!text){message("Escriba o pegue el texto del insumo.");return;}
    if(await add(()=>({name:"Nota · "+text.split("\n")[0].slice(0,55),text,tables:[]})))el("inputNote").value="";
  };
  function answer(yes){
    const s=model.schedule;
    context.draft.scheduleAnswer=yes?"yes":"no";
    toggleTable("universitarias-1",yes?s:null,s.name);
    schedule();
  }
  el("scheduleYes").onclick=()=>answer(true);
  el("scheduleNo").onclick=()=>answer(false);
  async function open(key,draft,changed){
    const ctx={key,draft,changed,sources:[]};
    context=ctx;el("inputNote").value="";message("");renderSources();schedule();
    try{
      const items=await storage(store=>store.index("draft").getAll(key));
      if(ctx===context){ctx.sources=items;renderSources();}
    }catch(error){if(ctx===context)message(error.message);}
  }
  window.InputTray={open};
})(window,document);
