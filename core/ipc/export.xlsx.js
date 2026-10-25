"use strict";
const fs=require("fs").promises;
const zlib=require("zlib");
// Generador OpenXML XLSX autocontenido. Ningún dato se interpreta como fórmula.
function esc(value){return String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"");}
function col(n){let s="";for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function sheet(head,records){
  const rows=[head].concat(records||[]);
  const data=rows.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((value,ci)=>{
    const r=col(ci)+(ri+1),style=ri?"0":"1";
    return typeof value==="number"&&Number.isFinite(value)?
      '<c r="'+r+'" s="'+style+'"><v>'+value+'</v></c>':
      '<c r="'+r+'" t="inlineStr" s="'+style+'"><is><t xml:space="preserve">'+esc(value)+'</t></is></c>';
  }).join("")+'</row>').join("");
  const widths=head.map((value,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.min(43,Math.max(15,String(value).length+5))+'" customWidth="1"/>').join("");
  const range="A1:"+col(head.length-1)+Math.max(1,rows.length);
  return '<?xml version="1.0" encoding="UTF-8"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="'+range+'"/>'+
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
    '<cols>'+widths+'</cols><sheetData>'+data+'</sheetData><autoFilter ref="'+range+'"/></worksheet>';
}
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);crcTable[i]=c>>>0;}
function crc(buf){let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(entries){
  const local=[],central=[];let offset=0;
  for(const e of entries){
    const name=Buffer.from(e.name,"utf8"),input=Buffer.from(e.content,"utf8"),compressed=zlib.deflateRawSync(input),checksum=crc(input);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(8,8);l.writeUInt32LE(checksum,14);
    l.writeUInt32LE(compressed.length,18);l.writeUInt32LE(input.length,22);l.writeUInt16LE(name.length,26);
    local.push(l,name,compressed);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);
    c.writeUInt32LE(checksum,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(input.length,24);
    c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);
    offset+=l.length+name.length+compressed.length;
  }
  const length=central.reduce((a,b)=>a+b.length,0),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat(local.concat(central,[end]));
}
function workbookTables(payload){
  const tasks=Array.isArray(payload.tasks)?payload.tasks:[];
  const processes=Array.isArray(payload.processes)?payload.processes:[];
  const groups=Array.isArray(payload.inconsistencies)?payload.inconsistencies:[];
  const issues=groups.flatMap(g=>g.items&&g.items.length?g.items:[g]);
  const period=v=>v?new Date(v).toISOString().slice(0,10):"";
  return [
    {name:"Procesos",h:["Unidad","Código","Proceso institucional","Situación","Carpeta","Total tareas","Tareas abiertas","Inconsistencias","Prioridad","Siguiente acción"],
      rows:processes.map(p=>[p.scope,p.id,p.processName,p.state,p.folderStatus,p.tasks,p.activeTasks,p.issues,p.priorityLabel,p.nextAction])},
    {name:"Pendientes",h:["Unidad","Proceso","Nombre del proceso","Prioridad","Qué hacer","Justificación","Período","Fecha orientativa","Tipo de trabajo","Seguimiento","Área","Ubicación"],
      rows:tasks.map(t=>[t.scope,t.processNumber?t.scope+"-PRO-"+t.processNumber:"Sin clasificar",t.processName,t.levelLabel,t.title,t.reason,t.periodLabel,period(t.dueDate),t.workType,t.status,t.areaLabel,t.pathLabel])},
    {name:"Inconsistencias",h:["Unidad","Proceso","Categoría","Hallazgo","Actual","Esperado","Sugerencia","Seguimiento","Ubicación","Detalle"],
      rows:issues.map(i=>[i.scope,i.processNumber?i.scope+"-PRO-"+i.processNumber:"Sin clasificar",i.category,i.title,i.actual,i.expected,i.suggestedName,i.status,i.pathLabel,i.description])},
    {name:"Indicadores",h:["Unidad","Proceso","Nombre","Indicador (resumen del manual)","Meta","Resultado","Estado medición"],
      rows:processes.map(p=>[p.scope,p.id,p.processName,p.indicator,p.target,p.indicatorValue,p.indicatorStatus])}
  ];
}
function buildPriorityWorkbook(payload){
  const tabs=workbookTables(payload||{});
  const wb='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
    tabs.map((t,i)=>'<sheet name="'+esc(t.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>';
  const rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    tabs.map((t,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+
    '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const types='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    tabs.map((t,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const styles='<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/></font><font><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173B64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
  const entries=[{name:"[Content_Types].xml",content:types},
    {name:"_rels/.rels",content:'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:"xl/workbook.xml",content:wb},{name:"xl/_rels/workbook.xml.rels",content:rels},{name:"xl/styles.xml",content:styles}];
  tabs.forEach((t,i)=>entries.push({name:"xl/worksheets/sheet"+(i+1)+".xml",content:sheet(t.h,t.rows)}));
  return zip(entries);
}
async function savePriorityWorkbook(path,payload){await fs.writeFile(path,buildPriorityWorkbook(payload));return path;}
module.exports={buildPriorityWorkbook,savePriorityWorkbook};
