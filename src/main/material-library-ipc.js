const fs = require('fs');
const path = require('path');
const {createMaterialLibrary} = require('./material-library');
function registerMaterialLibrary({ipcMain,dialog,shell,root,getWindow,recordActivity,registerMediaUrl}) {
  const library=createMaterialLibrary(root,recordActivity);
  const handle=(channel,action)=>ipcMain.handle('library:'+channel,async(_event,payload={})=>{
    try {return {success:true,...await action(payload)};} catch(error){return {success:false,error:error.message};}
  });
  handle('list',()=>library.state());
  handle('create-space',async p=>({space:library.createSpace(p.title)}));
  handle('rename-space',async p=>({space:library.renameSpace(p.id,p.title)}));
  handle('trash-space',async p=>{library.trashSpace(p.id);return {};});
  handle('restore-space',async p=>{library.restoreSpace(p.id);return {};});
  handle('create',async p=>({entry:await library.create(p)}));
  handle('read',async p=>{const document=await library.read(p.id);if(document.format==='file')document.url=await registerMediaUrl(document.path);return {document};});
  handle('write',async p=>({entry:await library.write(p.id,p.format,p.content,p.token)}));
  handle('search',async p=>({matches:await library.search(p.query,p.spaceId)}));
  handle('history',p=>({versions:library.history(p.id)}));
  handle('restore-revision',async p=>({entry:await library.restoreRevision(p.id,p.revisionId,p.token)}));
  handle('associate',p=>({entry:library.associate(p.id,p.slugs)}));
  handle('linked',p=>({entries:library.linked(p.slug)}));
  handle('passages',async p=>({result:await library.passages(p.id,p.query)}));
  handle('backup',async()=>{const selected=await dialog.showSaveDialog(getWindow(),{title:'备份整个资料库',defaultPath:'FDE资料库-'+new Date().toISOString().slice(0,10)+'.zip',filters:[{name:'资料库备份',extensions:['zip']}]});if(selected.canceled)return {canceled:true};await library.backup(selected.filePath);return {};});
  handle('restore-backup',async()=>{const selected=await dialog.showOpenDialog(getWindow(),{title:'选择资料库备份',properties:['openFile'],filters:[{name:'资料库备份',extensions:['zip']}]});if(selected.canceled)return {canceled:true};const confirmed=await dialog.showMessageBox(getWindow(),{type:'question',buttons:['取消','恢复备份'],defaultId:0,cancelId:0,message:'恢复整个资料库？',detail:'当前资料会完整保留在恢复前备份中。恢复后目录和正文回到所选备份的状态。'});if(confirmed.response!==1)return {canceled:true};return await library.restoreBackup(selected.filePaths[0]);});
  handle('rename',async p=>({entry:library.rename(p.id,p.title)}));
  handle('move',async p=>({entry:library.move(p.id,p.parentId)}));
  handle('trash',async p=>{library.trash(p.id);return {};});
  handle('restore',async p=>{library.restore(p.id);return {};});
  handle('upload',async p=>{
    const selection=await dialog.showOpenDialog(getWindow(),{title:'上传资料',properties:['openFile','multiSelections'],filters:[{name:'所有文件',extensions:['*']}]});
    if(selection.canceled)return {canceled:true};
    return {entries:await library.upload({...p,paths:selection.filePaths})};
  });
  handle('open',async p=>{const d=await library.read(p.id);if(d.kind==='link'){await shell.openExternal(d.url);return {};}
    const error=await shell.openPath(await library.locate(p.id));if(error)throw Error(error);return {};
  });
  handle('export',async p=>{
    const d=await library.read(p.id);const defaultPath=d.title.endsWith('.'+d.ext)?d.title:d.title+'.'+d.ext;
    const selection=await dialog.showSaveDialog(getWindow(),{title:'下载资料',defaultPath});
    if(selection.canceled)return {canceled:true};
    fs.copyFileSync(await library.locate(p.id),selection.filePath);return {};
  });
}
module.exports={registerMaterialLibrary};
