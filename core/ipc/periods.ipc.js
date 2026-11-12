"use strict";
// Lectura exclusivamente de la colección periodos de UTET.
// No se consultan estudiantes, matrículas, requisitos ni se hacen escrituras.
const {ipcMain}=require("electron");
const ENDPOINT="https://firestore.googleapis.com/v1/projects/utet-4387a/databases/(default)/documents/periodos";
const API_KEY="AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA"; // Identificador público de la app web de Firebase.
const ID=/^\d{4}-(?:0[1-9]|1[0-2])__\d{4}-(?:0[1-9]|1[0-2])$/;
const readField=(fields,key,kind)=>fields?.[key]?.[kind];
function toPeriod(doc) {
  const fields=doc && doc.fields || {};
  const id=String(readField(fields,"periodoId","stringValue") ||
    doc?.name?.split("/").pop() || "");
  if (!ID.test(id)) return null;
  const active=readField(fields,"activo","booleanValue");
  const deleted=readField(fields,"eliminado","booleanValue");
  return {periodoId:id,label:String(readField(fields,"label","stringValue")||""),
    activo:active!==false,eliminado:deleted===true};
}
async function readPeriods() {
  try {
    const periods=[];
    let next="";
    for(let page=0;page<10;page++){
      const url=new URL(ENDPOINT);
      url.searchParams.set("key",API_KEY);
      url.searchParams.set("pageSize","100");
      if(next)url.searchParams.set("pageToken",next);
      const response=await fetch(url,{method:"GET",signal:AbortSignal.timeout(8000),
        headers:{Accept:"application/json"}});
      if(!response.ok) throw new Error("Firebase no autorizó la consulta de períodos ("+response.status+").");
      const json=await response.json();
      if(!json || !Array.isArray(json.documents)) {
        if(page===0)throw new Error("No se encontraron períodos registrados.");
        break;
      }
      for(const doc of json.documents){
        const value=toPeriod(doc);
        if(value)periods.push(value);
      }
      next=String(json.nextPageToken||"");
      if(!next) break;
    }
    if(!periods.length)throw new Error("No se encontraron períodos válidos.");
    return {ok:true,source:"Firebase",periods};
  }catch(error){
    // Un fallo de red o permisos no impide la auditoría local.
    return {ok:false,error:error?.message||"No fue posible leer los períodos de Firebase."};
  }
}
function registerPeriodsIpc(){
  ipcMain.handle("periods:list",()=>readPeriods());
}
module.exports={registerPeriodsIpc,readPeriods,toPeriod};
