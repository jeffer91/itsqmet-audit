"use strict";
const {ipcMain,BrowserWindow}=require("electron");
const service=require("../signatures/signature.service");

let eventsRegistered=false;
function registerSignaturesIpc(){
  ipcMain.handle("signatures:list",async(_event,options={})=>{
    try{return await service.list({
      includePreviews:options.includePreviews!==false,
      scope:options.scope,status:options.status,search:options.search,
      priorityOnly:options.priorityOnly===true,
      limit:options.limit,offset:options.offset
    });}
    catch(error){return {ok:false,error:error && error.message || "No se pudieron consultar las firmas."};}
  });
  ipcMain.handle("signatures:scan",async()=>{
    try{return await service.scan();}
    catch(error){return {ok:false,error:error && error.message || "No se pudieron analizar las firmas."};}
  });
  if(!eventsRegistered){
    service.onChange(update=>{
      for(const win of BrowserWindow.getAllWindows()){
        if(!win.isDestroyed())win.webContents.send("signatures:updated",update);
      }
    });
    eventsRegistered=true;
  }
}
module.exports={registerSignaturesIpc};
