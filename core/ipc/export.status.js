"use strict";
const labels={pending:"Pendiente",doing:"En elaboración",review:"En revisión",done:"Realizado · por verificar",blocked:"Bloqueado",snoozed:"Pospuesto",signing:"En firma",correction:"Por corregir",signed:"Firmado · por archivar/verificar",verified:"Completado · revisión manual",dismissed:"Descartado con motivo"};
module.exports=status=>labels[status]||status||"Pendiente";
