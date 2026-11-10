/*
 * screens/priority/priority.decisions.js
 * Motor de recomendaciones de solo lectura para Priorización.
 * Contrasta inventario local, periodicidad del catálogo y antecedentes.
 * Nunca mueve, renombra, borra ni da por aprobada una evidencia.
 * Consumidores: priority.service.js, priority.queue.js y priority.ui.js.
 */
(function (window) {
  "use strict";
  const MONTHS=["Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const monthMap=new Map(MONTHS.map((m,i)=>[m.toLowerCase(),i+1]));
  const text=v=>String(v==null?"":v).trim();
  const rel=v=>text(v).replace(/\\/g,"/").replace(/^\/+|\/+$/g,"");
  const basename=v=>rel(v).split("/").pop()||"";
  const parent=v=>rel(v).split("/").slice(0,-1).join("/");
  const key=v=>rel(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[–—]/g,"-").replace(/\s+/g," ").trim();
  const exactPart=(path,name)=>key(basename(path))===key(name);
  function prepare(shared) {
    const indices={};
    for(const scope of ["UGPA","UTET"]) {
      const scan=shared && shared[scope==="UGPA"?"ugpaResult":"utetResult"];
      if(scan && scan.ok && window.RulesTypes && window.RulesTypes.buildScanIndex)
        indices[scope]=window.RulesTypes.buildScanIndex(scan);
    }
    return {indices,manual:window.AuditManualCatalog||{}};
  }
  function policyFor(scope,number,year,month,ctx) {
    const process=ctx.manual.getProcess && ctx.manual.getProcess(scope,number);
    const policy=process && process.periodPolicy;
    if(!policy)return 0;
    let months=Number(policy.months)||0;
    const start=year*12+month;
    for(const version of (policy.versions||[]).slice().sort((a,b)=>
      text(a.from).localeCompare(text(b.from)))) {
      const m=text(version.from).match(/^(\d{4})-(\d{2})$/);
      if(m && Number(m[1])*12+Number(m[2])<=start)months=Number(version.months)||months;
    }
    return months;
  }
  function rangeOf(name) {
    const regex=/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})\s*(?:[-–—]|a)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})\s*$/i;
    const m=text(name).match(regex);
    if(!m)return null;
    const month=v=>monthMap.get(v.toLowerCase()==="setiembre"?"septiembre":v.toLowerCase());
    return {a:month(m[1]),ay:Number(m[2]),b:month(m[3]),by:Number(m[4])};
  }
  function standardRange(r,months) {
    if(months===6 && r.a===4 && r.b===9)return {a:4,ay:r.ay,b:9,by:r.ay};
    if(months===6 && r.a===10 && r.b===3)return {a:10,ay:r.ay,b:3,by:r.ay+1};
    if(months===12 && r.b===9)return {a:10,ay:r.b===9&&r.a===10?r.ay:r.by-1,b:9,
      by:r.a===10?r.ay+1:r.by};
    if(months===24 && r.b===9)return {a:10,ay:r.a===10?r.ay:r.by-2,b:9,
      by:r.a===10?r.ay+2:r.by};
    return null;
  }
  function periodSuggestion(entry,ctx) {
    const old=text(entry.actual)||basename(entry.pathLabel);
    const r=rangeOf(old);
    if(!r)return {name:"",reason:"El nombre no permite identificar dos meses y años con suficiente certeza.",certainty:"baja"};
    const scope=text(entry.scope).toUpperCase(),number=text(entry.processNumber);
    const months=policyFor(scope,number,r.ay,r.a,ctx);
    if(!months)return {name:"",reason:"El catálogo no define una duración verificable para esta carpeta.",certainty:"baja"};
    const target=standardRange(r,months);
    if(!target)return {name:"",reason:"El rango no coincide con los ciclos configurados de "+months+" meses. Confirmar las fechas reales con el responsable.",certainty:"baja"};
    const name=scope+"-PRO-"+number+"-"+MONTHS[target.a-1]+" "+target.ay+
      "–"+MONTHS[target.b-1]+" "+target.by;
    const datesChanged=r.a!==target.a||r.ay!==target.ay||r.b!==target.b||r.by!==target.by;
    return {name,reason:datesChanged
      ?"La periodicidad es de "+months+" meses; esta propuesta cambia fechas y exige confirmar a qué período pertenecen los archivos."
      :"La duración coincide con "+months+" meses; solo hay que normalizar el nombre o su prefijo.",
      certainty:datesChanged?"media":"alta",datesChanged};
  }
  function existsTarget(index,target,source) {
    if(!index || !target || !Array.isArray(index.folders))return false;
    const desired=key(target),old=key(source);
    return index.folders.some(folder=>key(folder.relativePath)===desired && key(folder.relativePath)!==old);
  }
  function folderDecision(entry,ctx,groupItems) {
    const path=rel(entry.pathLabel), old=text(entry.actual)||basename(path);
    const index=ctx.indices[entry.scope];
    const isPeriod=/carpeta de per[ií]odo mal nombrada|duraci[oó]n de per[ií]odo incorrecta/i.test(text(entry.title));
    const attempt=isPeriod?periodSuggestion(entry,ctx):{
      name:text(entry.suggestedName),
      reason:text(entry.suggestedName)?"Nombre sugerido por la regla institucional. Confirmar la estructura y el contenido.":"El hallazgo no proporciona un nombre inequívoco; revisar la regla y la evidencia.",
      certainty:text(entry.suggestedName)?"media":"baja"};
    if(isPeriod && !attempt.name && text(entry.suggestedName)) {
      attempt.name=text(entry.suggestedName);
      attempt.reason="La regla institucional propone un nombre válido; confirmar el período antes de cambiarlo.";
      attempt.certainty="media";
    }
    const isFile=/nombre de pdf/i.test(text(entry.title)) || /\.pdf$/i.test(old);
    const newName=attempt.name;
    const dest=newName?parent(path)+"/"+newName:"";
    const other=Array.isArray(groupItems)?groupItems:[];
    const hasParent=other.some(x=>rel(x.pathLabel)===parent(path) && exactPart(parent(path),old));
    const hasNested=other.some(x=>parent(x.pathLabel)===path && exactPart(x.pathLabel,old));
    const duplicate=!isFile && (hasParent || hasNested);
    const conflict=existsTarget(index,dest,path) || !!(isFile && index &&
      index.files && index.files.some(file=>key(file.relativePath)===key(dest) && key(file.relativePath)!==key(path)));
    let action="VERIFICAR", summary=attempt.reason,certainty=attempt.certainty;
    let steps=[
      "Abrir la carpeta y comprobar su nombre, contenido y período real.",
      "Identificar el destino correcto antes de modificar archivos.",
      "Volver a escanear para verificar el resultado."
    ];
    if(hasParent) {
      action="CONSOLIDAR";
      summary="Carpeta repetida dentro de otra con el mismo nombre: no renombrarla por separado.";
      certainty="media";
      steps=[
        "Comprobar si contiene documentos útiles o solamente archivos técnicos.",
        "Revisar la carpeta contenedora antes de consolidar el contenido.",
        "No borrar ni renombrar esta carpeta por separado hasta comprobar el destino.",
        "Volver a escanear después de la corrección."
      ];
    } else if(hasNested) {
      action="CONSOLIDAR";
      summary="Hay otra carpeta idéntica anidada. Revisarlas juntas y conservar una sola estructura válida.";
      certainty="media";
      steps=[
        "Abrir la carpeta interior y comprobar si contiene documentos o solo archivos técnicos.",
        "Conservar y ordenar las evidencias útiles sin sobrescribir ninguna.",
        "Confirmar el período institucional y corregir el nombre de la carpeta principal si corresponde.",
        "Volver a escanear antes de dar el caso por resuelto."
      ];
    } else if(conflict) {
      action="UNIFICAR";
      summary="Ya existe una carpeta con el nombre propuesto. Comparar contenidos antes de mover o renombrar.";
      certainty="media";
      steps=[
        "Abrir ambas carpetas y comparar archivos, fechas y versiones.",
        "Definir una carpeta de destino sin sobrescribir evidencias.",
        "Reorganizar manualmente solo después de confirmar la correspondencia.",
        "Volver a escanear para comprobar que no quedan duplicados."
      ];
    } else if(newName && key(newName)!==key(old)) {
      action="RENOMBRAR";
      summary=attempt.datesChanged?"Corregir el período solo después de confirmar a qué ciclo pertenece.":
        isFile?"Corregir el nombre del PDF sin modificar su contenido.":"Cambiar el nombre conservando sus documentos.";
      steps=[
        "Confirmar que los documentos corresponden al período propuesto.",
        "Comprobar que no existe otra carpeta de destino.",
        isFile?"Renombrar únicamente el archivo, manteniendo intacto el PDF.":
          "Renombrar la carpeta sin modificar ni eliminar archivos.",
        "Volver a escanear para validar el nombre."
      ];
    } else if(newName) {
      action="RENOMBRAR";
      summary="Normalizar el formato del nombre sin modificar archivos.";
      steps=[
        "Confirmar que este es el período correcto.",
        "Normalizar espacios, separadores y prefijo del nombre.",
        "Volver a escanear."
      ];
    }
    return {
      action,oldName:old,newName:hasParent?"":newName,
      suggestion:newName,certainty,
      summary,reason:attempt.reason,steps,conflict,duplicate,
      isNestedDuplicate:hasParent,hasNestedDuplicate:hasNested,
      pathLabel:path,actionPath:text(entry.actionPath),
      createIfMissing:!duplicate&&!conflict&&!!newName,
      createNote:newName
        ?"Solo si falta y el período está confirmado: "+newName
        :"No crear hasta confirmar el nombre y período oficiales.",
      needsConfirmation:certainty!=="alta"||duplicate||conflict
    };
  }
  function groupDecision(item,ctx) {
    const entries=Array.isArray(item.groupItems)?item.groupItems:[];
    const items=entries.map(entry=>{
      const e={...entry,scope:entry.scope||item.scope,
        processNumber:entry.processNumber||item.processNumber,title:entry.title||item.title};
      const d=folderDecision(e,ctx,entries);
      return {...entry,suggestedName:d.suggestion||text(entry.suggestedName),decision:d};
    });
    const all=items.map(x=>x.decision);
    const complex=all.some(x=>x.duplicate||x.conflict);
    const unsolved=all.some(x=>!x.suggestion);
    const main=complex?"CONSOLIDAR":unsolved?"VERIFICAR":all.every(x=>x.certainty==="alta")?"RENOMBRAR":"REVISAR";
    return {
      ...item,groupItems:items,
      decision:{
        action:main,certainty:complex||unsolved?"media":all.every(x=>x.certainty==="alta")?"alta":"media",
        summary:complex
          ?"Resolver "+entries.length+" rutas relacionadas sin renombrar duplicados por separado."
          :unsolved?"Hay "+entries.length+" casos; algunos requieren confirmar el nombre antes de corregir."
          :"Corregir "+entries.length+" nombre(s) concretos, conservando archivos y verificando destinos.",
        steps:complex
          ?["Revisar las rutas relacionadas de este grupo.","Conservar todas las evidencias sin sobrescribir ni borrar.",
            "Corregir primero la estructura principal y después verificar las subcarpetas.",
            "Volver a escanear para confirmar las correcciones."]
          :["Revisar los nombres propuestos de cada elemento.","Confirmar los períodos y evitar destinos existentes.",
            "Realizar las correcciones en sus carpetas de origen.","Volver a escanear para comprobar los resultados."],
        oldName:all.length===1?all[0].oldName:"",
        newName:all.length===1?all[0].newName:"",
        createIfMissing:false,
        needsConfirmation:true
      }
    };
  }
  function documentDecision(item) {
    const current=text(item.sourceFileName),previous=text(item.referenceFileName);
    const proposed=text(item.proposedDocumentName)||text(item.officialName)||text(item.displayTitle);
    const hasCode=!!item.namingComplete || !item.expectedTemplate;
    const action=current?"VERIFICAR":previous?"REVISAR REFERENCIA":
      item.workType==="document"?"ELABORAR":"VERIFICAR";
    const summary=current?"Se encontró un archivo candidato en el período: comprobarlo antes de generar otro.":
      previous?"Existe una posible referencia de otra ubicación o período: verificar vigencia y contenido.":
      "No se identificó evidencia de este entregable; confirmar la obligación antes de elaborarlo.";
    return {action,oldName:current||previous,newName:proposed,
      certainty:current||previous?"media":hasCode?"media":"baja",
      summary,steps:[
        "Comprobar en el manual la obligación, el período y las condiciones aplicables.",
        current?"Abrir y validar el archivo localizado: contenido, fecha, aprobación y firma.":
          previous?"Revisar el documento de otro período, sin darlo por válido automáticamente.":
            "Buscar posibles evidencias bajo otros nombres o ubicaciones.",
        "Solo si falta, elaborar la versión correspondiente y tramitar su aprobación.",
        "Archivar el PDF definitivo y volver a escanear."
      ],
      createIfMissing:!current&&!!proposed,createNote:hasCode
        ?"Si no existe una versión válida, elaborar: "+proposed
        :"Si falta, elaborar el documento tras confirmar su código y fecha (no usar marcadores del manual).",
      needsConfirmation:true
    };
  }
  function simpleDecision(item,ctx) {
    if(item.proposedFolderName && item.workType==="quick") {
      const name=text(item.proposedFolderName);
      const index=ctx.indices[item.scope];
      const exists=index&&index.folders.some(x=>key(x.relativePath).endsWith("/"+key(name)));
      return {action:exists?"VERIFICAR":"CREAR",oldName:exists?name:"No localizado",
        newName:name,summary:exists?"Existe una carpeta con este nombre; confirmar su ubicación.":"Crear la carpeta solo si la ruta y el período son correctos.",
        certainty:exists?"media":"alta",steps:[
          "Confirmar la carpeta de destino en el inventario actual.",
          "Comprobar que no existe una carpeta equivalente.",
          "Si falta, crearla sin sobrescribir ninguna existente y volver a escanear."
        ],createIfMissing:!exists,createNote:"Si falta y el destino está confirmado: "+name,
        needsConfirmation:true};
    }
    return {action:"VERIFICAR",oldName:"",newName:"",certainty:"baja",
      summary:text(item.suggestedAction)||text(item.reason)||"Revisar la evidencia documental.",
      steps:["Abrir la ubicación asociada y contrastar el hallazgo con el manual.",
        "Registrar la corrección necesaria solo cuando la evidencia sea concluyente.",
        "Volver a escanear después de cualquier modificación."],
      createIfMissing:false,needsConfirmation:true};
  }
  function decorate(item,ctx) {
    if(!item || item.decision)return item;
    const context=ctx||{indices:{},manual:window.AuditManualCatalog||{}};
    if(item.origin==="group" && Array.isArray(item.groupItems))return groupDecision(item,context);
    let decision;
    if(text(item.resolvedDocumentId)&&text(item.officialName))decision=documentDecision(item);
    else if(item.workType==="quick" && (/carpeta de per[ií]odo mal nombrada|duraci[oó]n de per[ií]odo incorrecta|nombre de (pdf|carpeta) incorrecto/i.test(text(item.title))) &&
      (item.actual||item.pathLabel) && !item.proposedFolderName)
      decision=folderDecision(item,context,[]);
    else decision=simpleDecision(item,context);
    return {...item,decision};
  }
  window.PriorityDecisions={prepare,decorate,folderDecision,periodSuggestion};
})(window);
