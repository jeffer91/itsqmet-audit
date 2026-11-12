(function (window) {
  "use strict";
  // Catálogo de referencia tomado únicamente de la colección "periodos" de
  // una exportación del 12/11/2026. Nunca contiene datos de estudiantes.
  const BASE = [
    ["2025-02__2025-05","Febrero 2025 a Mayo 2025"],
    ["2025-10__2026-03","Octubre 2025 a Marzo 2026"],
    ["2025-11__2026-05","Noviembre 2025 a Mayo 2026"],
    ["2026-02__2026-08","Febrero 2026 a Agosto 2026"],
    ["2026-04__2026-09","Abril 2026 a Septiembre 2026"],
    ["2026-05__2026-11","Mayo 2026 a Noviembre 2026"],
    ["2026-08__2027-01","Agosto 2026 a Enero 2027"]
  ];
  const MONTHS=["Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const map=new Map(MONTHS.map((m,i)=>[m.toLowerCase(),i+1]));
  map.set("setiembre",9);
  const validId=/^(\d{4})-(0[1-9]|1[0-2])__(\d{4})-(0[1-9]|1[0-2])$/;
  const idParts=id=>{
    const m=String(id||"").match(validId);
    if (!m) return null;
    const a=Number(m[1])*12+Number(m[2]),b=Number(m[3])*12+Number(m[4]);
    return a<=b ? {startYear:+m[1],startMonth:+m[2],endYear:+m[3],endMonth:+m[4]} : null;
  };
  const validEntry=p=>p && idParts(p.periodoId||p.id) &&
    p.eliminado!==true && p.activo!==false;
  function regular(p) {
    return (p.startMonth===4&&p.endMonth===9&&p.startYear===p.endYear) ||
      (p.startMonth===10&&p.endMonth===3&&p.endYear===p.startYear+1);
  }
  const defaultItems=BASE.map(([periodoId,label])=>({periodoId,label}));
  let items=defaultItems.slice(),source="referencia",lastUpdated="";
  function classifyId(id) {
    const parts=idParts(id);
    if (!parts) return {type:"sin determinar",known:false,periodoId:String(id||"")};
    return {type:regular(parts)?"regular":"PVC",known:items.some(x=>x.periodoId===id),periodoId:id};
  }
  function classifyRange(r) {
    if (!r || ![r.ay,r.a,r.by,r.b].every(Number.isInteger))
      return {type:"sin determinar",known:false,periodoId:""};
    const id=String(r.ay).padStart(4,"0")+"-"+String(r.a).padStart(2,"0")+
      "__"+String(r.by).padStart(4,"0")+"-"+String(r.b).padStart(2,"0");
    return classifyId(id);
  }
  function classifyLabel(label) {
    const values=Array.from(String(label||"").matchAll(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})/gi));
    if (values.length!==2) return {type:"sin determinar",known:false,periodoId:""};
    return classifyRange({ay:+values[0][2],a:map.get(values[0][1].toLowerCase()),
      by:+values[1][2],b:map.get(values[1][1].toLowerCase())});
  }
  function setPeriods(remote) {
    if (!Array.isArray(remote)) return false;
    const clean=remote.filter(validEntry).map(p=>{
      const periodoId=String(p.periodoId||p.id);
      const parts=idParts(periodoId);
      const label=MONTHS[parts.startMonth-1]+" "+parts.startYear+" a "+
        MONTHS[parts.endMonth-1]+" "+parts.endYear;
      return {periodoId,label};
    });
    if (!clean.length) return false;
    items=Array.from(new Map(clean.map(x=>[x.periodoId,x])).values())
      .sort((a,b)=>a.periodoId.localeCompare(b.periodoId));
    source="Firebase";lastUpdated=new Date().toISOString();
    return true;
  }
  function getItems() {
    return items.map(p=>({...p,...classifyId(p.periodoId)}));
  }
  function getStatus() {return {source,lastUpdated,count:items.length};}
  window.PriorityPeriods={getItems,getStatus,setPeriods,classifyId,classifyLabel,classifyRange};
})(window);
