(function (window) {
  "use strict";
  // El manual define la identidad documental; el escaneo aporta evidencia, no nombres oficiales nuevos.
  const safe = value => String(value == null ? "" : value).trim();
  const normalize = value => safe(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const relative = value => safe(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const basename = value => relative(value).split("/").pop() || "";
  const stripExtension = value => safe(value).replace(/\.(pdf|docx|doc|xlsx|xls|odt)$/i, "");
  const technical = name => /^(desktop\.ini|thumbs\.db|\.ds_store)$/i.test(safe(name));
  const meaningless = name => !name || /^(carpeta (detectada sin contenido|vac[ií]a)|sin contenido|no encontrada|no localizado|carpeta detectada|documento obligatorio sin pdf final)[.! ]*$/i.test(safe(name));
  const inFolder = (value,folder) => {
    const a=relative(value).toLowerCase(),b=relative(folder).toLowerCase();
    return !!b && (a===b || a.startsWith(b+"/"));
  };
  function prepare() {
    const state=window.AppStore && window.AppStore.get ? window.AppStore.get() : {};
    const indices={};
    ["UGPA","UTET"].forEach(function (scope) {
      const scan=state[scope==="UGPA"?"ugpaResult":"utetResult"];
      if (scan && scan.ok) indices[scope]=window.RulesTypes && window.RulesTypes.buildScanIndex
        ? window.RulesTypes.buildScanIndex(scan) : scan;
    });
    return {indices:indices,manual:window.AuditManualCatalog||{}};
  }
  function documents(task,manual) {
    const process=manual.getProcess && manual.getProcess(task.scope,task.processNumber);
    return process && Array.isArray(process.documents)?process.documents:[];
  }
  function docScore(input,doc) {
    const value=normalize(input),name=normalize(doc.label);
    if(!value||!name)return 0;
    if(value===name || value.includes(name))return 110;
    const ignore=new Set(["de","del","la","el","los","las","por","para","un","una","docente","docentes","carrera"]);
    const words=name.split(" ").filter(word=>word.length>3&&!ignore.has(word));
    const contained=words.filter(word=>value.split(" ").includes(word));
    if(!words.length||!contained.length)return 0;
    const ratio=contained.length/words.length;
    const heads=["deteccion","plan","informe","acta","ficha","guia","planificacion","reporte","registro","instrumento","comunicado"];
    const first=heads.find(word=>words.includes(word));
    if(first && !value.split(" ").includes(first))return 0;
    return ratio>=0.64 ? 45+Math.round(ratio*50) : 0;
  }
  function manualDoc(task,manual) {
    const docs=documents(task,manual);
    const aliases=task.scope==="UGPA" && safe(task.processNumber)==="60"
      ? {acta:"rgi1",ficha:"rgi2",guia:"rgi3"} : {};
    const id=aliases[task.documentId]||task.documentId;
    if(id) {
      const match=docs.find(doc=>doc.id===id);
      if(match)return match;
    }
    const category=safe(task.sourceCategory||task.category);
    const inputs=[task.documentLabel,task.missingFileName,task.title];
    if(["empty-folders","folders-without-pdf"].includes(category))
      inputs.unshift(task.detectedName,basename(task.pathLabel));
    const matches=docs.map(doc=>({
      doc:doc,score:Math.max(...inputs.map(value=>docScore(value,doc)),0)
    })).sort((a,b)=>b.score-a.score);
    return matches.length&&matches[0].score>=65&&
      (!matches[1]||matches[0].score>matches[1].score+10)?matches[0].doc:null;
  }
  function candidateScore(file,doc) {
    if(!file||!doc||technical(file.name))return 0;
    const filename=normalize(stripExtension(file.name));
    if(!filename)return 0;
    const codes=Array.isArray(doc.codes)?doc.codes:[];
    const codeMatch=codes.length>0 && codes.every(c=>filename.includes(normalize(c)));
    const phraseScore=docScore(file.name,doc);
    const keywords=Array.isArray(doc.keywords)?doc.keywords.filter(Boolean):[];
    const keywordScore=keywords.length && keywords.every(word=>filename.split(" ").includes(normalize(word)))?65:0;
    if(codeMatch)return 130+(phraseScore>0?15:0);
    return Math.max(phraseScore,keywordScore);
  }
  function matchFiles(task,index,doc) {
    if(!index||!Array.isArray(index.files)||!doc)return {current:null,previous:null};
    const base=relative(task.pathLabel);
    const prefix=String(task.scope)+"-PRO-"+String(task.processNumber);
    const all=index.files.filter(file => {
      const filepath=relative(file.relativePath);
      return filepath.toUpperCase().split("/").some(part=>part.toUpperCase().startsWith(prefix.toUpperCase()+"-")) &&
        candidateScore(file,doc)>=65;
    });
    const pick=list=>list.map(file=>({file,score:candidateScore(file,doc)+(/\.pdf$/i.test(file.name)?10:0)}))
      .sort((a,b)=>b.score-a.score||safe(a.file.name).localeCompare(safe(b.file.name),"es"))
      .map(item=>item.file)[0]||null;
    return {current:pick(all.filter(file=>inFolder(file.relativePath,base))),
      previous:pick(all.filter(file=>!inFolder(file.relativePath,base)))};
  }
  function matchesTemplate(fileName,template) {
    if(!template || !/0X|AÑO-MES/i.test(template))return false;
    // Las plantillas del manual son cadenas de segmentos separados por guiones.
    const expression=safe(template).replace(/0X/gi,"[0-9]{1,3}")
      .replace(/AÑO/g,"[0-9]{4}").replace(/MES/g,"(?:0[1-9]|1[0-2])");
    try {return new RegExp("^"+expression+"(?:-|$)","i").test(stripExtension(fileName));}
    catch(_error){return false;}
  }
  function dateMatchesPeriod(fileName,periodLabel) {
    const file=stripExtension(fileName);
    const part=file.match(/-([0-9]{4})-(0[1-9]|1[0-2])(?:-|$)/);
    if(!part || !periodLabel)return true; // Sin información suficiente, no se inventa una fecha.
    const months={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
      julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
    const range=normalize(periodLabel).match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+([0-9]{4})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+([0-9]{4})\b/);
    if(!range)return true; // Rango desconocido: conservar como candidato, sin certificar vigencia.
    const date=Number(part[1])*12+Number(part[2]);
    const start=Number(range[2])*12+months[range[1]];
    const end=Number(range[4])*12+months[range[3]];
    return date>=start && date<=end;
  }
  function suffix(doc,task) {
    const raw=safe(doc&&doc.label)+(task.careerName?" "+safe(task.careerName):"");
    return raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^A-Za-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
  }
  function actualFolder(task) {
    const explicit=safe(task.detectedName);
    return !meaningless(explicit)?explicit:basename(task.pathLabel);
  }
  function rename(task,ctx) {
    const original=Object.assign({},task);
    const manual=ctx&&ctx.manual||{};
    const index=ctx&&ctx.indices&&ctx.indices[task.scope];
    const category=safe(task.sourceCategory||task.category);
    const folderName=actualFolder(task);
    const doc=manualDoc(task,manual);
    const officialName=doc&&safe(doc.label)||safe(task.documentLabel);
    const expectedTemplate=doc&&safe(doc.template)||"";
    const hasDoc=!!doc;
    const isFolder=["empty-folders","folders-without-pdf"].includes(category);
    const found=hasDoc?matchFiles(task,index,doc):{current:null,previous:null};
    const sourceFileName=safe(found.current&&found.current.name);
    const sourceFilePath=safe(found.current&&found.current.path);
    const referenceFileName=safe(found.previous&&found.previous.name);
    const canonical=expectedTemplate
      ? expectedTemplate+"-"+suffix(doc,task) : officialName+(task.careerName?" · "+task.careerName:"");
    let displayTitle=safe(task.title),suggestedAction="",sourceKind="",namingNotice="";
    let displayWorkType=safe(task.workType);
    if(task.proposedFolderName && (task.workType==="quick" || task.synthetic)) {
      displayTitle=safe(task.proposedFolderName);
      suggestedAction="Comprobar si existe y crear esta carpeta solo si falta";
      sourceKind="folder-suggested";
      namingNotice="Carpeta de organización; no es un documento generado por el manual.";
    } else if(hasDoc) {
      const completeCode=sourceFileName && matchesTemplate(sourceFileName,expectedTemplate);
      const samePeriod=sourceFileName && dateMatchesPeriod(sourceFileName,task.periodLabel);
      const validDescription=sourceFileName && docScore(sourceFileName,doc)>=65;
      const usableName=completeCode && samePeriod && validDescription;
      displayTitle=usableName?stripExtension(sourceFileName):canonical;
      sourceKind=sourceFileName?(usableName?"file-coded":"file-to-verify"):"template";
      if(isFolder) {
        suggestedAction="Revisar la carpeta y comprobar si contiene el documento oficial";
        displayWorkType="review";
        namingNotice="Carpeta detectada: "+folderName;
        if(folderName && /RGI[0-9]/i.test(folderName) && expectedTemplate) {
          const detected=(folderName.match(/\bRGI\d+\b/i)||[])[0];
          const required=(expectedTemplate.match(/\bRGI\d+\b/i)||[])[0];
          if(detected&&required&&detected.toUpperCase()!==required.toUpperCase())
            namingNotice+=". Código de carpeta "+detected+"; el manual exige "+required+".";
        }
      } else if(sourceFileName) {
        displayWorkType="review";
        suggestedAction=/\.pdf$/i.test(sourceFileName)
          ? usableName?"Verificar contenido y vigencia del PDF localizado":"Revisar el nombre, período y contenido del PDF"
          : "Verificar el editable, su código, su período y la versión PDF final";
        if(!completeCode)namingNotice="El archivo localizado no acredita por su nombre la codificación oficial.";
        else if(!samePeriod)namingNotice="La fecha del código del archivo no corresponde al período de la tarea; verificar antes de renombrar o reutilizar.";
        else if(!validDescription)namingNotice="El código aparece en un archivo cuyo título no identifica claramente este entregable.";
      } else {
        suggestedAction="Buscar el documento del período antes de redactarlo";
        sourceKind="template";
        namingNotice="Patrón por completar: confirmar consecutivo, año y mes antes de nombrar el archivo.";
      }
      if(task.scope==="UGPA" && safe(task.processNumber)==="60" && doc.id==="rgi2") {
        namingNotice+=(namingNotice?" ":"")+"El manual UGPA escribe RI2 en esta ficha, pero el inventario utiliza RGI2; verificar la codificación antes de renombrar.";
      }
    } else if(isFolder) {
      displayTitle=folderName || safe(task.scope)+"-PRO-"+safe(task.processNumber)+" · Carpeta por identificar";
      suggestedAction=category==="empty-folders"
        ?"Verificar el contenido y la finalidad de esta carpeta"
        :"Verificar los archivos y el PDF final de esta carpeta";
      sourceKind="folder-existing";
      displayWorkType="review";
      namingNotice="No se puede asignar un código documental sin identificar el entregable.";
    } else if(task.origin==="group") {
      const first=Array.isArray(task.groupItems)&&task.groupItems[0];
      const actual=safe(first&&(first.pathLabel||first.actual));
      displayTitle=safe(task.scope)+"-PRO-"+safe(task.processNumber)+" · "+safe(task.title);
      suggestedAction="Revisar las "+Number(task.groupCount||1)+" observaciones agrupadas";
      namingNotice=actual?"Ejemplo: "+actual:"";
      sourceKind="group";
    }
    return Object.assign(original,{
      displayTitle,officialName,expectedTemplate,sourceFileName,sourceFilePath,
      referenceFileName,sourceKind,suggestedAction,namingNotice,
      displayWorkType,
      originalWorkType:task.workType,
      workType:sourceFileName&&task.workType==="document"?"review":task.workType,
      resolvedDocumentId:doc&&doc.id||""
    });
  }
  window.PriorityNames={prepare,rename,manualDoc,matchesTemplate,dateMatchesPeriod,stripExtension};
})(window);
