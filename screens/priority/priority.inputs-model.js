(function (root) {
  "use strict";
  const schedule = {
    name:"Noviembre 2025 - Mayo 2025 - Universitarias 1",
    label:"Cronograma de Universitarias 1",
    rows:[
      ["Actividad","Fecha inicio","Fecha fin"],
      ["Inducción general al proceso de titulación","20/05/2026","20/05/2026"],
      ["Finalización de Clases","22/05/2026","22/05/2026"],
      ["Metodología 1","26/05/2026","26/05/2026"],
      ["Metodología 2","27/05/2026","27/05/2026"],
      ["Metodología 3","28/05/2026","28/05/2026"],
      ["Entrega de la Interrogante de Investigación","31/05/2026","31/05/2026"],
      ["Evaluación de la Interrogante de Investigación","01/06/2026","02/06/2026"],
      ["Clase de refuerzo por carreras 1","03/06/2026","03/06/2026"],
      ["Clase de refuerzo por carreras 2","10/06/2026","10/06/2026"],
      ["Cumplimiento de requisitos","11/06/2026","11/06/2026"],
      ["Entrega del artículo académico completo","14/06/2026","14/06/2026"],
      ["Evaluación final institucional con revisión antiplagio","15/06/2026","17/06/2026"],
      ["Defensa oral","22/06/2026","24/06/2026"],
      ["Tutoría extra supletorio","22/06/2026","24/06/2026"],
      ["Entrega del artículo académico supletorio","28/06/2026","28/06/2026"],
      ["Rúbrica institucional y plagio supletorio","29/06/2026","01/07/2026"],
      ["Defensa oral supletorio","02/07/2026","02/07/2026"]
    ]
  };
  function pastedTable(text) {
    const rows=text.trim().split(/\r?\n/).map(line=>line.trim());
    const separator=rows.some(line=>line.includes("\t"))?"\t":"|";
    const cells=rows.map(line=>line.replace(/^\||\|$/g,"").split(separator).map(cell=>cell.trim()))
      .filter(row=>!row.every(cell=>/^:?-{3,}:?$/.test(cell)));
    if(cells.length<2 || cells[0].length<2 || cells.some(row=>row.length!==cells[0].length))return [];
    return [{label:"Tabla del texto",rows:cells}];
  }
  function suggestions(draft,source,model) {
    const copy={period:draft.period,fields:draft.fields.map(f=>({...f}))};
    // Recognize vertical key/value worksheets as well as two-row forms.
    const lines=[source.text];
    for (const {rows} of source.tables || []) {
      const names=new Set(draft.fields.flatMap(field=>[field.label,field.alias].filter(Boolean).map(model.normalize)));
      const headers=rows[0] || [];
      const horizontal=rows.length===2 && (headers.length>2 ||
        (headers.length===2 && names.has(model.normalize(headers[1]))));
      if(horizontal){
        headers.forEach((key,i)=>{if (key && rows[1][i]) lines.push(key+": "+rows[1][i]);});
      }else if(!headers.slice(1).some(key=>names.has(model.normalize(key)))){
        for (const row of rows) if (row.length===2 && row[0] && row[1])
          lines.push(row[0]+": "+row[1]);
      }
    }
    model.analyze(copy,lines.join("\n"));
    return copy.fields.filter(f=>f.candidate).map(f=>({label:f.label,text:f.candidate}));
  }
  root.DocumentInputs={schedule,suggestions,pastedTable};
})(typeof window==="undefined"?module.exports:window);
