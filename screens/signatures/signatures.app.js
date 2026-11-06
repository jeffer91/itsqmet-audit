(function(window,document){
  "use strict";
  window.AppNav.render("signatures");
  const $=id=>document.getElementById(id);
  const escape=value=>String(value==null?"":value)
    .replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const labels={verified:"Firma verificada",invalid:"Firma inválida",
    unverifiable:"No verificable","no-electronic-signature":"Sin firma electrónica"};
  const visualLabels={possible:"Posible firma manuscrita",empty:"Sin trazo visible",
    review:"Revisión necesaria"};
  const PAGE_SIZE=40;
  let records=[];
  let pageIndex=0;
  const previous=document.createElement("button");
  previous.type="button";
  previous.className="btn";
  previous.textContent="Página anterior";
  previous.hidden=true;
  more.insertAdjacentElement("beforebegin",previous);
  let matchedCount=0;
  let summaryCounts={verified:0,invalid:0,unverifiable:0};
  let loading=false;
  let requestId=0;
  const more=document.createElement("button");
  more.type="button";
  more.className="btn";
  more.textContent="Mostrar más resultados";
  more.hidden=true;
  $("results").insertAdjacentElement("afterend",more);

  function coverDetails(record){
    if(record.status!=="no-electronic-signature")return "";
    const cover=record.cover;
    if(!cover)return "<p>Portada pendiente de análisis.</p>";
    const rows=(cover.slots||[]).map(slot=>{
      const preview=slot.preview && slot.preview.length<100000 && /^[A-Za-z0-9+/=]+$/.test(slot.preview)
        ? '<img loading="lazy" alt="Recorte del espacio de firma" src="data:image/jpeg;base64,'+slot.preview+'">' : "";
      return "<li><strong>"+escape(slot.label)+"</strong> · "+
        escape(visualLabels[slot.status]||visualLabels.review)+preview+"</li>";
    }).join("");
    return "<section><strong>Portada · página 1</strong><p>"+
      escape(cover.reason||"Inspección visual de casillas. La autoría requiere comprobación.")+
      '</p><ul class="cover-slots">'+rows+"</ul></section>";
  }
  function matchesStatus(record,filter){
    if(!filter||record.status===filter)return true;
    if(!filter.startsWith("visual-")||record.status!=="no-electronic-signature")return false;
    const status=filter.slice(7);
    return (record.cover?.slots||[]).some(slot=>slot.status===status)||
      (status==="review"&&record.cover?.status!=="inspected");
  }
  function itemHtml(r){
    const signatures=(r.signatures||[]);
    return '<article class="item"><strong>'+escape(r.name)+'</strong><p>'+
      escape(r.scope)+' · '+escape(r.path)+'</p><span class="status '+
      escape(r.stale?"historical":r.status)+'">'+
      escape((r.stale?"Histórico · última revisión: ":"")+(labels[r.status]||r.status))+
      '</span><p>'+escape(r.reason||"")+'</p>'+coverDetails(r)+
      (signatures.length?'<details><summary>Ver '+signatures.length+' firma(s)</summary>'+
      signatures.map(s=>'<p>'+escape(s.field)+' · Integridad: '+escape(s.integrity)+
        ' · Certificado confiable: '+escape(s.trusted)+' · Fecha declarada: '+
        escape(s.signingTime||"No disponible")+'</p>').join("")+"</details>":"")+"</article>";
  }
  function render(){
    const scope=$("scope").value,status=$("status").value,query=$("search").value.toLowerCase();
    const filtered=records.filter(r=>(!scope||r.scope===scope)&&matchesStatus(r,status)&&
      (!query||(r.path||"").toLowerCase().includes(query)));
    $("summary").textContent=matchedCount+" PDF · "+
      summaryCounts.verified+" verificados · "+
      summaryCounts.invalid+" inválidos · "+
      summaryCounts.unverifiable+" no verificables";
    $("results").innerHTML=filtered.map(itemHtml).join("")||
      "<p>No hay documentos para mostrar. Selecciona carpetas en Escaneo y ejecuta el análisis.</p>";
    previous.hidden=pageIndex===0;
    more.hidden=(pageIndex+1)*PAGE_SIZE>=matchedCount;
    if(!more.hidden)more.textContent="Siguiente página ("+
      (matchedCount-Math.min(matchedCount,(pageIndex+1)*PAGE_SIZE))+" restantes)";
  }
  async function load(){
    const requested=++requestId;
    const result=await window.api.signatures.list({
      scope:$("scope").value,status:$("status").value,
      search:$("search").value,limit:PAGE_SIZE,offset:pageIndex*PAGE_SIZE,
      includePreviews:true
    });
    if(requested!==requestId)return;
    if(!result||!result.ok)throw new Error(result&&result.error||"No se pudieron consultar firmas.");
    records=Array.isArray(result.records)?result.records:[];
    matchedCount=Number(result.totalMatched)||0;
    summaryCounts=result.summaryCounts||{verified:0,invalid:0,unverifiable:0};
    if(result.analyzing&&!loading)$("message").textContent="Se están analizando firmas. Se muestran los últimos resultados disponibles.";
    else if(result.partial&&!loading)$("message").textContent="Revisión parcial: "+(result.errors||[]).join(" · ");
    render();
  }
  $("scan").addEventListener("click",async()=>{
    if(loading)return;
    loading=true;
    $("scan").disabled=true;
    $("message").textContent="Analizando PDF locales… Los resultados anteriores siguen disponibles.";
    try{
      const result=await window.api.signatures.scan();
      if(!result||!result.ok)throw new Error(result&&result.error||"Falló el análisis de firmas.");
      await load();
      $("message").textContent=(result.stats.partial?"Revisión parcial. ":"Análisis completado. ")+
        result.stats.scanned+" archivos procesados, "+result.stats.reused+" reutilizados.";
    }catch(error){
      $("message").textContent="Error: "+error.message;
    }finally{
      loading=false;
      $("scan").disabled=false;
    }
  });
  for(const id of ["scope","status","search"]){
    $(id).addEventListener("input",()=>{pageIndex=0;load().catch(error=>$("message").textContent="Error: "+error.message);});
  }
  more.addEventListener("click",()=>{
    pageIndex++;
    load().catch(error=>$("message").textContent="Error: "+error.message);
  });
  previous.addEventListener("click",()=>{
    pageIndex=Math.max(0,pageIndex-1);
    load().catch(error=>$("message").textContent="Error: "+error.message);
  });
  if(window.api.signatures.onUpdated){
    window.api.signatures.onUpdated(update=>{
      if(update.phase==="completed"){
        load().catch(error=>$("message").textContent="Error: "+error.message);
      }else if(update.phase==="progress"){
        $("message").textContent="Analizando PDF locales: "+update.processed+" de "+update.total+" revisados…";
      }else if(update.phase==="failed"){
        $("message").textContent="No se pudo completar el análisis: "+(update.error||"Error desconocido");
      }else if(update.phase==="started"&&!loading){
        $("message").textContent="Se está analizando documentación en segundo plano.";
      }
    });
  }
  load().catch(error=>$("message").textContent="Error: "+error.message);
})(window,document);
