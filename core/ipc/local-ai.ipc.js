"use strict";
const {app, ipcMain, dialog} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const {execFile} = require("node:child_process");

function registerLocalAiIpc() {
  const config = path.join(app.getPath("userData"), "local-ai-model.json");
  let active;
  async function selected() {
    try { return JSON.parse(await fs.readFile(config, "utf8")).file; }
    catch(error) { if (error.code === "ENOENT") return ""; throw error; }
  }
  ipcMain.handle("local-ai:status", async()=>path.basename(await selected()));
  ipcMain.handle("local-ai:choose", async()=>{
    const pick=await dialog.showOpenDialog({title:"Seleccionar modelo local de instrucciones",
      properties:["openFile"], filters:[{name:"Modelo GGUF",extensions:["gguf"]}]});
    if(pick.canceled)return null;
    const file=pick.filePaths[0];
    const handle=await fs.open(file,"r");
    try {
      const header=Buffer.alloc(4);
      await handle.read(header,0,4,0);
      if(header.toString()!=="GGUF")throw new Error("El archivo seleccionado no es un modelo GGUF.");
    } finally {await handle.close();}
    await fs.writeFile(config+".tmp",JSON.stringify({file}),{mode:0o600});
    await fs.rename(config+".tmp",config);
    return path.basename(file);
  });
  ipcMain.handle("local-ai:generate",async(_,request)=>{
    if(!request || typeof request.instruction!=="string" || !request.instruction.trim() || typeof request.contexto!=="string" ||
        JSON.stringify(request).length>50000)throw new Error("Revise la instrucción y la extensión del contexto.");
    const file=await selected();
    if(!file)throw new Error("Seleccione un modelo GGUF antes de consultar.");
    await fs.access(file);
    if(active)throw new Error("Hay una consulta en curso.");
    return new Promise((resolve,reject)=>{
      const child=execFile(process.env.AUDIT_PYTHON || (process.platform==="win32"?"python":"python3"),
        [path.join(__dirname,"../drafts/local_ai.py"),file],
        {windowsHide:true,timeout:240000,maxBuffer:1024*1024,env:{...process.env,PYTHONIOENCODING:"utf-8"}},
        (error,stdout,stderr)=>{
          active=null;
          if(error)return reject(new Error(error.killed?"Consulta cancelada o tiempo agotado.":stderr.trim().slice(-1000)||"No se pudo iniciar el motor Python."));
          try {resolve(JSON.parse(stdout));} catch(err){reject(err);}
        });
      active=child;
      child.stdin.on("error",()=>{}); // execFile reports process startup and termination errors.
      child.stdin.end(JSON.stringify(request));
    });
  });
  ipcMain.handle("local-ai:cancel",()=>active?.kill() || false);
  app.on("before-quit",()=>active?.kill());
}
module.exports={registerLocalAiIpc};
