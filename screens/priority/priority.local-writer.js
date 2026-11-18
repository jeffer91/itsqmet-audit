(function(window,document){
  "use strict";
  const el=id=>document.getElementById(id);
  let draft, changed, request=null;
  function status(value){el("aiStatus").textContent=value;}
  function refresh(){
    const data=window.DraftModel.output(draft);
    const text=[data.title,data.period,...window.DraftModel.tableFindings(draft),...data.sections.filter(s=>s.text).map(s=>s.label+": "+s.text),
      ...data.tables.map(t=>t.label+"\n"+t.rows.map(r=>r.join(" | ")).join("\n"))].join("\n");
    el("aiContext").value=text.slice(0,16000);
    if(text.length>16000)status("Se muestran los primeros 16 000 caracteres. Seleccione los extractos relevantes.");
    const select=el("aiTarget");
    select.replaceChildren(...draft.fields.filter(f=>f.decision!=="no").map(f=>new Option(f.label,f.label)));
  }
  async function open(value,callback){
    draft=value;changed=callback;
    el("aiAnswer").value="";el("aiQuestion").value="";status("");refresh();
    try{const name=await window.api.localAi.status();el("aiModel").textContent=name || "Seleccione un modelo de instrucciones GGUF del equipo.";}
    catch(error){status(error.message);}
  }
  el("aiChoose").onclick=async()=>{
    try{const name=await window.api.localAi.choose();if(name)el("aiModel").textContent=name;}
    catch(error){status(error.message);}
  };
  el("aiRefresh").onclick=refresh;
  el("aiAsk").onclick=async()=>{
    if(request)return;
    const instruction=el("aiQuestion").value.trim();
    if(!instruction){status("Escriba una instrucción.");return;}
    const target=draft;
    request=target;el("aiAsk").disabled=true;el("aiStop").hidden=false;
    status("Procesando en este equipo…");el("aiAnswer").value="";
    try{
      const result=await window.api.localAi.generate({instruction,contexto:el("aiContext").value});
      if(target===draft){el("aiAnswer").value=result.text;status("Revise la propuesta antes de incorporarla.");}
    }catch(error){if(target===draft)status(error.message);}
    finally{request=null;el("aiAsk").disabled=false;el("aiStop").hidden=true;}
  };
  el("aiStop").onclick=()=>window.api.localAi.cancel().catch(error=>status(error.message));
  el("aiApply").onclick=()=>{
    const text=el("aiAnswer").value.trim();
    const field=draft.fields.find(f=>f.label===el("aiTarget").value && f.decision!=="no");
    if(!text || !field){status("Seleccione un apartado vigente y revise la propuesta.");return;}
    if(field.text && !window.confirm("¿Reemplazar el contenido de «"+field.label+"» por esta propuesta revisada?"))return;
    field.text=text;field.decision="sí";field.inputSource="IA local · revisión del usuario";
    changed();status("Propuesta incorporada en «"+field.label+"».");
  };
  window.LocalWriter={open};
})(window,document);
