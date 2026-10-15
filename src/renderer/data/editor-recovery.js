// 大文档含内嵌图片，使用 IndexedDB 暂存保存失败的草稿，避免 localStorage 的配额限制。
async function database() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('fde-editor-recovery',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function operation(mode, action) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('drafts',mode);
    const request=action(transaction.objectStore('drafts'));
    transaction.oncomplete=()=>{db.close();resolve(request.result);};
    transaction.onerror=()=>{db.close();reject(transaction.error);};
    transaction.onabort=()=>{db.close();reject(transaction.error);};
  });
}
export const readEditorDraft=()=>operation('readonly',store=>store.get('active'));
export const writeEditorDraft=draft=>operation('readwrite',store=>store.put(draft,'active'));
export const clearEditorDraft=()=>operation('readwrite',store=>store.delete('active'));
