(function (window) {
  "use strict";
  // El nombre se obtiene del escaneo o del manual; nunca se completan números ni fechas imaginarios.
  const safe = value => String(value == null ? "" : value).trim();
  const normalize = value => safe(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const relative = value => safe(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const basename = value => relative(value).split("/").pop() || "";
  const stripExtension = value => safe(value).replace(/\.(pdf|docx|doc|xlsx|xls|odt)$/i, "");
  const technical = value => /^(desktop\.ini|thumbs\.db|\.ds_store)$/i.test(safe(value));
  const descendants = (value,folder) => {
    const a=relative(value).toLowerCase(), b=relative(folder).toLowerCase();
    return !!b && (a === b || a.startsWith(b + "/"));
  };
  function prepare() {
    const state=window.AppStore && window.AppStore.get ? window.AppStore.get() : {};
    const indices={};
    ["UGPA","UTET"].forEach(function (scope) {
      const scan=state[scope==="UGPA"?"ugpaResult":"utetResult"];
      if (scan && scan.ok) {
        indices[scope]=window.RulesTypes && window.RulesTypes.buildScanIndex
          ? window.RulesTypes.buildScanIndex(scan) : scan;
      }
    });
    return { indices:indices, manual:window.AuditManualCatalog || {} };
  }
  function manualDoc(task, manual) {
    const process=manual.getProcess && manual.getProcess(task.scope,task.processNumber);
    const docs=process && Array.isArray(process.documents) ? process.documents : [];
    if (task.documentId) {
      const direct=docs.find(doc=>doc.id===task.documentId);
      if(direct)return direct;
    }
    const sought=normalize(task.documentLabel || task.title);
    return docs.find(function (doc) {
      const label=normalize(doc.label);
      return label && (sought===label || sought.includes(label));
    }) || null;
  }
  function isExpectedFile(file,doc) {
    if (!file || !doc || technical(file.name)) return 0;
    const name=normalize(stripExtension(file.name));
    if (!name) return 0;
    const codes=Array.isArray(doc.codes)?doc.codes:[];
    const codeMatch=codes.length>0 && codes.every(code=>name.includes(normalize(code)));
    const label=normalize(doc.label);
    const families=["deteccion","plan","informe","guia","acta","ficha","registro","comunicado","cronograma","memorando","trabajo","articulo"];
    const noun=families.find(key=>label.split(" ").includes(key));
    const subjects=["formacion","capacitacion","curricular","titulacion","complexivo","academico","induccion","impacto","colectivos","requisitos","plagio"];
    const topics=subjects.filter(key=>label.split(" ").includes(key));
    const nounMatch=!!noun && name.split(" ").includes(noun);
    const topicMatch=topics.some(key=>name.split(" ").includes(key));
    // El código RGI + proceso identifica un candidato, no certifica su contenido.
    if(codeMatch) return 100+(nounMatch?15:0)+(topicMatch?10:0);
    if(nounMatch && topicMatch) return 65;
    return 0;
  }
  function fileMatches(task,index,doc) {
    if(!index || !Array.isArray(index.files)||!doc)return {current:null,previous:null};
    const base=relative(task.pathLabel);
    const prefix=task.scope+"-PRO-"+task.processNumber;
    const period=normalize(task.periodLabel);
    const current=[],previous=[];
    index.files.forEach(function (file) {
      const name=safe(file.name);
      if(technical(name))return;
      const path=relative(file.relativePath);
      if(!new RegExp("(^|/)"+task.scope+"-PRO-"+task.processNumber+"(?:-|/|$)","i").test(path))return;
      const score=isExpectedFile(file,doc);
      if(!score)return;
      const inPath=descendants(path,base);
      const periodParts=path.split("/").filter(seg=>/^(UGPA|UTET)-PRO-\d+-/i.test(seg) && /\d{4}/.test(seg));
      const samePeriod=periodParts.some(seg=>period && normalize(seg).includes(period));
      const candidate={file:file,score:score+(/\.pdf$/i.test(name)?10:0)};
      if(inPath || (!base && samePeriod))current.push(candidate);
      else previous.push(candidate);
    });
    function best(list) {
      list.sort((a,b)=>b.score-a.score||safe(a.file.name).localeCompare(safe(b.file.name),"es"));
      return list.length?list[0].file:null;
    }
    return {current:best(current),previous:best(previous)};
  }
  function rename(task,ctx) {
    const original=Object.assign({},task);
    const manual=ctx && ctx.manual || {};
    const index=ctx && ctx.indices && ctx.indices[task.scope];
    const doc=manualDoc(original,manual);
    const category=safe(task.sourceCategory||task.category);
    const folderName=safe(task.detectedName)||basename(task.pathLabel);
    let displayTitle=safe(task.title);
    let nextAction="";
    let sourceFileName="";
    let referenceFileName="";
    let officialName=doc && doc.label || safe(task.documentLabel);
    let expectedTemplate=doc && safe(doc.template) || "";
    let sourceKind="";
    if(task.proposedFolderName && (task.workType==="quick" || task.synthetic)) {
      displayTitle=safe(task.proposedFolderName);
      nextAction="Verificar y crear la carpeta del período, si todavía falta";
      sourceKind="folder-suggested";
    } else if(category==="empty-folders" || normalize(task.title)==="carpeta vacia") {
      displayTitle=folderName || safe(task.title);
      nextAction="Comprobar el contenido y la función de esta carpeta";
      sourceKind="folder-existing";
    } else if(category==="folders-without-pdf") {
      displayTitle=folderName || safe(task.title);
      nextAction="Comprobar los documentos de esta carpeta y su PDF final";
      sourceKind="folder-existing";
    } else if(doc) {
      const evidence=fileMatches(task,index,doc);
      if(evidence.current) {
        sourceFileName=safe(evidence.current.name);
        displayTitle=stripExtension(sourceFileName);
        nextAction=/\.pdf$/i.test(sourceFileName)
          ? "Revisar si el PDF corresponde al documento requerido y al período"
          : "Revisar el editable y verificar si falta el PDF final";
        sourceKind="file-existing";
      } else {
        displayTitle=(expectedTemplate?expectedTemplate+" · ":"")+officialName+
          (task.careerName?" · "+safe(task.careerName):"");
        nextAction="Localizar la evidencia del período antes de elaborar un documento nuevo";
        sourceKind=expectedTemplate?"template":"manual";
        if(evidence.previous)referenceFileName=safe(evidence.previous.name);
      }
    } else if(task.origin==="group") {
      const first=Array.isArray(task.groupItems)&&task.groupItems[0];
      const seen=first&&safe(first.actual||first.suggestedName);
      displayTitle=(seen&&!/carpeta detectada|no encontrada|no localizado/i.test(seen))
        ? seen : (safe(task.scope)+"-PRO-"+safe(task.processNumber)+" · "+safe(task.title));
      nextAction="Revisar "+Number(task.groupCount||1)+" observación(es) de este grupo";
      sourceKind="group";
    } else if(folderName && /^(carpeta|subcarpeta)/i.test(displayTitle)) {
      displayTitle=folderName;
      nextAction="Revisar la ubicación y los archivos de esta carpeta";
      sourceKind="folder-existing";
    }
    return Object.assign(original,{displayTitle:displayTitle,officialName:officialName,
      expectedTemplate:expectedTemplate,sourceFileName:sourceFileName,
      referenceFileName:referenceFileName,sourceKind:sourceKind,
      suggestedAction:nextAction});
  }
  window.PriorityNames={prepare:prepare,rename:rename,stripExtension:stripExtension};
})(window);
