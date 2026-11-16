"use strict";
const {app,ipcMain,dialog} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {createStore,validate} = require("../workspace/workspace.store");
function registerWorkspaceIpc() {
  const store = createStore(path.join(app.getPath("userData"),"priority-workspace.json"));
  const handle = (channel,action) => ipcMain.handle(channel,async(_event,payload)=>{
    try { return {ok:true,...await action(payload)}; }
    catch(error) { return {ok:false,error:error.message}; }
  });
  handle("workspace:load",()=>store.load());
  handle("workspace:verify-evidence",file=>{
    if(typeof file!=="string" || !path.isAbsolute(file) || path.extname(file).toLowerCase()!==".pdf" || !fs.statSync(file).isFile())
      throw new Error("Indica la ruta absoluta de un PDF existente.");
    return {};
  });
  handle("workspace:save",data=>{ store.save(data); return {}; });
  handle("workspace:export",async()=>{
    const {data} = store.load();
    if (!data) throw new Error("No hay seguimiento para exportar.");
    const result = await dialog.showSaveDialog({title:"Guardar respaldo del seguimiento",defaultPath:"Seguimiento-AUDIT.json",filters:[{name:"Respaldo JSON",extensions:["json"]}]});
    if (result.canceled) return {canceled:true};
    fs.writeFileSync(result.filePath,JSON.stringify(data,null,2),"utf8");
    return {filePath:result.filePath};
  });
  handle("workspace:import",async()=>{
    const result = await dialog.showOpenDialog({title:"Restaurar seguimiento",properties:["openFile"],filters:[{name:"Respaldo JSON",extensions:["json"]}]});
    if (result.canceled) return {canceled:true};
    const file=result.filePaths[0];
    if (fs.statSync(file).size>8*1024*1024) throw new Error("El respaldo supera 8 MB.");
    const data=validate(JSON.parse(fs.readFileSync(file,"utf8")));
    const answer=await dialog.showMessageBox({type:"question",buttons:["Cancelar","Restaurar"],defaultId:0,cancelId:0,message:"¿Reemplazar el seguimiento con este respaldo?",detail:"Se conservará una copia automática del estado anterior."});
    if(answer.response!==1)return {canceled:true};
    try {
      const previous=store.load().data;
      if(previous)fs.writeFileSync(path.join(app.getPath("userData"),"priority-workspace.before-restore.json"),JSON.stringify(previous,null,2),"utf8");
    } catch(error) {
      if(error.code)throw error;
      // Las copias corruptas permanecen en disco; se permite recuperar con un respaldo válido.
    }
    data.updatedAt=new Date().toISOString();store.save(data);return {data};
  });
}
module.exports={registerWorkspaceIpc};
