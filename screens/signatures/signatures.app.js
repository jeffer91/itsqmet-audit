(function(window,document){"use strict";
window.AppNav.render("signatures");
let records=[];
const $=id=>document.getElementById(id);
const escape=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const labels={verified:"Firma verificada",invalid:"Firma inválida",unverifiable:"No verificable","no-electronic-signature":"Sin firma electrónica"};
const visualLabels = {possible:"Posible firma manuscrita",empty:"Sin trazo visible",review:"Revisión necesaria"};
function coverDetails(record) {
  if (record.status !== "no-electronic-signature") return "";
  const cover = record.cover;
  if (!cover) return "<p>Portada pendiente de análisis.</p>";
  const rows = (cover.slots || []).map(slot => {
    const image = slot.preview && /^[A-Za-z0-9+/=]+$/.test(slot.preview)
      ? '<img loading="lazy" alt="Recorte del espacio de firma" src="data:image/jpeg;base64,' + slot.preview + '">' : "";
    return '<li><strong>' + escape(slot.label) + '</strong> · ' + escape(visualLabels[slot.status] || visualLabels.review) + image + '</li>';
  }).join("");
  return '<section><strong>Portada · página 1</strong><p>' + escape(cover.reason || "Inspección visual de casillas. La autoría requiere comprobación.") +
    '</p><ul class="cover-slots">' + rows + '</ul></section>';
}
function matchesStatus(record, filter) {
  if (!filter || record.status === filter) return true;
  if (!filter.startsWith("visual-") || record.status !== "no-electronic-signature") return false;
  const status = filter.slice(7);
  return (record.cover?.slots || []).some(slot => slot.status === status) ||
    (status === "review" && record.cover?.status !== "inspected");
}
function render(){
 const scope=$("scope").value,status=$("status").value,query=$("search").value.toLowerCase();
 const filtered=records.filter(r=>(!scope||r.scope===scope)&&matchesStatus(r,status)&&(!query||(r.path||"").toLowerCase().includes(query)));
 $("summary").textContent=filtered.length+" PDF · "+filtered.filter(r=>r.status==="verified"&&!r.stale).length+" verificados · "+filtered.filter(r=>r.status==="invalid"&&!r.stale).length+" inválidos · "+filtered.filter(r=>r.status==="unverifiable"&&!r.stale).length+" no verificables";
 $("results").innerHTML=filtered.map(r=>'<article class="item"><strong>'+escape(r.name)+'</strong><p>'+escape(r.scope)+' · '+escape(r.path)+'</p><span class="status '+escape(r.stale?"historical":r.status)+'">'+escape((r.stale?"Histórico · última revisión: ":"")+(labels[r.status]||r.status))+'</span><p>'+escape(r.reason||"")+'</p>'+coverDetails(r)+((r.signatures||[]).length?'<details><summary>Ver '+r.signatures.length+' firma(s)</summary>'+r.signatures.map(s=>'<p>'+escape(s.field)+' · Integridad: '+escape(s.integrity)+' · Certificado confiable: '+escape(s.trusted)+' · Fecha declarada: '+escape(s.signingTime||"No disponible")+'</p>').join("")+'</details>':"")+'</article>').join("")||"<p>No hay documentos para mostrar. Selecciona carpetas en Escaneo y ejecuta el análisis.</p>";
}
async function load(){const r=await window.api.signatures.list();records=r.records||[];
 if(r.partial)$("message").textContent="Revisión parcial. "+(r.errors||[]).join(" · ");
 render();}
$("scan").addEventListener("click",async()=>{$("scan").disabled=true;$("message").textContent="Analizando PDF locales…";try{const r=await window.api.signatures.scan();if(!r.ok)throw Error(r.error);records=r.records||[];$("message").textContent=(r.stats.partial?"Revisión parcial. ":"Análisis completado. ")+r.stats.scanned+" archivos procesados, "+r.stats.reused+" reutilizados. "+(r.errors||[]).join(" · ");render();}catch(e){$("message").textContent="Error: "+e.message;}finally{$("scan").disabled=false;}});
["scope","status","search"].forEach(id=>$(id).addEventListener("input",render));
load().catch(e=>$("message").textContent=e.message);
})(window,document);