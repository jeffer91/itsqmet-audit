"use strict";
const {ipcMain}=require("electron");
const service=require("../signatures/signature.service");
function registerSignaturesIpc(){
 ipcMain.handle("signatures:list",async()=>service.list());
 ipcMain.handle("signatures:scan",async()=>{try{return await service.scan();}catch(e){return {ok:false,error:e.message};}});
}
module.exports={registerSignaturesIpc};
