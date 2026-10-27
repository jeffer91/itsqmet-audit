(function (window) {
  "use strict";
  // Convenciones confirmadas por los manuales UGPA v1 y UTET v2.
  // Son fechas de generación propuestas, no una validación de firma o contenido.
  const MONTHS={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
    julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  const normalize=value=>String(value==null?"":value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const pad=n=>String(n).padStart(2,"0");
  const RULES={
    "UGPA-31":{
      rgi1:{stage:"start",one:true},rgi2:{stage:"start",one:true},
      rgi3:{stage:"close",one:true}
    },
    "UGPA-70":{
      rgi1:{stage:"start",one:true},rgi2:{stage:"start",one:true},
      rgi3:{stage:"close",one:true}
    },
    "UTET-56":{
      rgi1:{stage:"start",one:true},rgi2:{stage:"start",one:true},
      rgi3:{stage:"start",one:true}
    },
    "UTET-95":{inf:{stage:"close",one:true}},
    // La guía se hace después de aprobar las fichas, no necesariamente en el último mes.
    "UGPA-60":{rgi3:{stage:"after-approval",one:true}}
  };
  function parsePeriod(label) {
    const value=normalize(label);
    const matches=Array.from(value.matchAll(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})\b/g));
    if(matches.length!==2)return null;
    const first={month:MONTHS[matches[0][1]],year:Number(matches[0][2])};
    const last={month:MONTHS[matches[1][1]],year:Number(matches[1][2])};
    if(!first.month || !last.month || last.year*12+last.month < first.year*12+first.month)return null;
    return {start:first,end:last};
  }
  function policy(scope,processNumber,documentId,periodLabel) {
    const byProcess=RULES[String(scope)+"-"+String(processNumber)]||{};
    const rule=byProcess[String(documentId)]||null;
    const period=parsePeriod(periodLabel);
    const date=rule&&period&&(rule.stage==="start"?period.start:
      rule.stage==="close"?period.end:null);
    const dateCode=date?date.year+"-"+pad(date.month):"";
    const sequence=rule&&rule.one?"01":"";
    const stage=rule?rule.stage:"unconfirmed";
    const stageLabel=stage==="start"?"Inicio del período":
      stage==="close"?"Cierre del período":
      stage==="after-approval"?"Después de aprobar las fichas":"Fecha de elaboración por confirmar";
    return {stage,stageLabel,dateCode,sequence,period,
      isComplete:!!dateCode&&!!sequence,
      sequenceReason:sequence?"Un entregable de este tipo por período"+
        (String(scope)==="UGPA"&&String(processNumber)==="60"?" y carrera":""):"",
      planned:true};
  }
  function propose(template,docLabel,careerName,p) {
    const t=String(template||"");
    const seq=p&&p.sequence||"0X";
    const date=p&&p.dateCode||"AÑO-MES";
    const code=t.replace(/0X/g,seq).replace(/AÑO-MES/g,date);
    const raw=(String(docLabel||"")+(careerName?" "+String(careerName):""));
    const name=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^A-Za-z0-9 ]/g," ").replace(/\s+/g," ").trim();
    return code+(name?"-"+name:"");
  }
  function codeOf(filename) {
    const match=String(filename||"").match(/-([0-9]{4})-(0[1-9]|1[0-2])(?:-|$)/);
    return match?match[1]+"-"+match[2]:"";
  }
  window.PriorityNamingPolicy={policy,parsePeriod,propose,codeOf};
})(window);
