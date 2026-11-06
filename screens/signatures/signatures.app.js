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
  let visibleCount=PAGE_SIZE;
  let loading=false;
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
    $("summary").textContent=filtered.length+" PDF · "+
      filtered.filter(r=>r.status==="verified"&&!r.stale).length+" verificados · "+
      filtered.filter(r=>r.status==="invalid"&&!r.stale).length+" inválidos · "+
      filtered.filter(r=>r.status==="unverifiable"&&!r.stale).length+" no verificables";
    $("results").innerHTML=filtered.slice(0,visibleCount).map(itemHtml).join("")||
      "<p>No hay documentos para mostrar. Selecciona carpetas en Escaneo y ejecuta el análisis.</p>";
    more.hidden=filtered.length<=visibleCount;
    if(!more.hidden)more.textContent="Mostrar más ("+(filtered.length-visibleCount)+" pendientes de visualizar)";
  }
  async function load(){
    const result=await window.api.signatures.list();
    if(!result||!result.ok)throw new Error(result&&result.error||"No se pudieron consultar firmas.");
    records=Array.isArray(result.records)?result.records:[];
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
    $(id).addEventListener("input",()=>{visibleCount=PAGE_SIZE;render();});
  }
  more.addEventListener("click",()=>{visibleCount+=PAGE_SIZE;render();});
  if(window.api.signatures.onUpdated){
    window.api.signatures.onUpdated(update=>{
      if(update.phase==="completed"){
        load().catch(error=>$("message").textContent="Error: "+error.message);
      }else if(update.phase==="failed"){
        $("message").textContent="No se pudo completar el análisis: "+(update.error||"Error desconocido");
      }else if(update.phase==="started"&&!loading){
        $("message").textContent="Se está analizando documentación en segundo plano.";
      }
    });
  }
  load().catch(error=>$("message").textContent="Error: "+error.message);
})(window,document);
