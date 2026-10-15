const fs = require('fs');
const path = require('path');
const {randomUUID, createHash} = require('crypto');
const JSZip = require('jszip');
const {markdownHtml, htmlToWord} = require('./handbook-word');
const {previewFile,textExtensions}=require('./material-preview');
const {extractFileText, retrievePassages}=require('./knowledge-retrieval');
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
const hash = value => createHash('sha256').update(value).digest('hex');

function createMaterialLibrary(root, onChange = () => {}) {
  const indexPath = path.join(root, 'index.json');
  const now = () => new Date().toISOString();
  const writes = new Map();
  let restoring = false;
  function atomic(target, data) {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target+'.tmp',data);fs.renameSync(target+'.tmp',target);}
  function persist(db) {fs.mkdirSync(path.join(root,'files'),{recursive:true});atomic(indexPath,JSON.stringify(db,null,2));}
  function state() {
    if (fs.existsSync(indexPath)) return JSON.parse(fs.readFileSync(indexPath,'utf8'));
    const db={version:2,spaces:[{id:'agents',title:'FDE医疗智能体标品',description:'智能体原型、PRD、宣传材料与标准产品资产'},{id:'projects',title:'FDE医疗项目管理',description:'项目资料、客户对接、日报与会议纪要'}],entries:[]};
    persist(db); return db;
  }
  function name(value) {if (typeof value !== 'string' || !value.trim()) throw Error('请输入名称');return value.trim();}
  function space(db,id) {if (!db.spaces.some(s=>s.id===id&&!s.deletedAt)) throw Error('空间不存在');}
  function parent(db,spaceId,parentId) {space(db,spaceId);if(parentId&&!db.entries.some(e=>e.id===parentId&&e.spaceId===spaceId&&e.kind==='folder'&&!e.deletedAt))throw Error('文件夹不存在');}
  function entry(db,id) {const e=db.entries.find(x=>x.id===id&&!x.deletedAt);if(!e)throw Error('资料不存在');return e;}
  function file(e,suffix=e.ext) {if(!validId(e.id)||!/^[a-zA-Z0-9]+$/.test(suffix))throw Error('无效资料路径');return path.join(root,'files',e.id+'.'+suffix);}
  function token(e) {return e.ext && fs.existsSync(file(e)) ? hash(fs.readFileSync(file(e))) : '';}
  function ensureWritable(){if(restoring)throw Error('正在恢复备份，请稍后再试');}
  function serial(id, action) {
    ensureWritable();const previous=writes.get(id)||Promise.resolve();
    const work=previous.catch(()=>{}).then(action);writes.set(id,work);
    return work.finally(()=>{if(writes.get(id)===work)writes.delete(id);});
  }
  function changed(db,e,action) {ensureWritable();e.updatedAt=now();persist(db);onChange({kind:'library-file',slug:e.spaceId,spaceId:e.spaceId,file:e.id,title:e.title,projectName:db.spaces.find(s=>s.id===e.spaceId)?.title,action,updatedAt:e.updatedAt});return {...e,token:token(e)};}
  function revisionDir(id){if(!validId(id))throw Error('无效资料');return path.join(root,'revisions',id);}
  function history(id){const directory=revisionDir(id);if(!fs.existsSync(directory))return [];return fs.readdirSync(directory).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(directory,n),'utf8'))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  function snapshot(e,label) {
    if(!e.ext || !fs.existsSync(file(e)))return;
    const fingerprint=token(e);if(history(e.id).some(r=>r.token===fingerprint))return;
    const id=randomUUID(),dir=revisionDir(e.id),meta={id,title:e.title,ext:e.ext,createdAt:now(),label,token:fingerprint};
    fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(file(e),path.join(dir,id+'.'+e.ext));
    if(fs.existsSync(file(e,'html'))&&e.htmlSourceToken===fingerprint)fs.copyFileSync(file(e,'html'),path.join(dir,id+'.html'));
    atomic(path.join(dir,id+'.json'),JSON.stringify(meta));
  }
  function createSpace(title) {ensureWritable();const db=state();const s={id:randomUUID(),title:name(title),description:'材料与工作记录',createdAt:now()};db.spaces.push(s);persist(db);return s;}
  function renameSpace(id,title) {ensureWritable();const db=state();space(db,id);const s=db.spaces.find(x=>x.id===id);s.title=name(title);persist(db);return s;}
  function trashSpace(id) {ensureWritable();const db=state();space(db,id);const time=now();db.spaces.find(s=>s.id===id).deletedAt=time;db.entries.filter(e=>e.spaceId===id&&!e.deletedAt).forEach(e=>e.deletedAt=time);persist(db);}
  function restoreSpace(id) {ensureWritable();const db=state();const s=db.spaces.find(x=>x.id===id);if(!s)throw Error('空间不存在');const time=s.deletedAt;delete s.deletedAt;db.entries.filter(e=>e.spaceId===id&&e.deletedAt===time).forEach(e=>delete e.deletedAt);persist(db);}
  async function create({spaceId,parentId=null,title,kind='document',content='',url='',sourceUrl='',sourceId=''}) {
    ensureWritable();parent(state(),spaceId,parentId);
    if(!['folder','document','daily','link','text'].includes(kind))throw Error('不支持的资料类型');
    if(kind==='link'&&!/^https?:\/\//i.test(url))throw Error('请输入完整的 http / https 链接');
    const e={id:randomUUID(),spaceId,parentId,title:name(title),kind,ext:['folder','document','daily'].includes(kind)?'docx':kind==='text'?'txt':'',url,sourceUrl,sourceId,createdAt:now(),updatedAt:now()};
    let word;
    if(['folder','document','daily'].includes(kind)) {
      if(!content)content=kind==='daily'?`<h1>${escape(e.title)}</h1><p>日期：${new Date().toLocaleDateString('zh-CN')}</p><h2>今日完成</h2><p><br></p><h2>问题与风险</h2><p><br></p><h2>明日计划</h2><p><br></p>`:`<h1>${escape(e.title)}</h1><p><br></p>`;
      word=await htmlToWord(content,root);
    }
    // Re-read after conversion: other IPC calls may have changed the index.
    ensureWritable();const db=state();parent(db,spaceId,parentId);
    if(kind==='text')atomic(file(e),content);
    if(word){atomic(file(e),word);atomic(file(e,'html'),content);e.htmlSourceToken=token(e);}
    db.entries.push(e);snapshot(e,'初始版本');return changed(db,e,kind==='folder'?'创建了文件夹':'新建了资料');
  }
  async function upload({spaceId,parentId=null,paths,sourceUrl='',sourceId='',title}) {
    ensureWritable();const db=state();parent(db,spaceId,parentId);const result=[];
    for(const source of paths) {
      if(typeof source!=='string'||!fs.statSync(source).isFile())throw Error('请选择文件');
      const ext=path.extname(source).slice(1).toLowerCase()||'bin';
      const e={id:randomUUID(),spaceId,parentId,title:title||path.basename(source),kind:'file',ext:/^[a-z0-9]+$/.test(ext)?ext:'bin',sourceUrl,sourceId,createdAt:now(),updatedAt:now(),size:fs.statSync(source).size};
      fs.copyFileSync(source,file(e));db.entries.push(e);snapshot(e,'上传版本');changed(db,e,'上传了资料');result.push(e);
    }
    return result;
  }
  async function read(id) {return serial(id,async()=>{
    let e=entry(state(),id);const fingerprint=token(e);
    if(e.kind==='link')return {...e,format:'link',content:e.url,token:fingerprint};
    if(['docx','md'].includes(e.ext)) {
      const htmlFile=file(e,'html');let content;
      const cacheValid=fs.existsSync(htmlFile)&&(e.htmlSourceToken===fingerprint || (!e.htmlSourceToken&&fs.statSync(htmlFile).mtimeMs>=fs.statSync(file(e)).mtimeMs));
      if(cacheValid)content=fs.readFileSync(htmlFile,'utf8');
      else {content=e.ext==='docx'?(await require('mammoth').convertToHtml({path:file(e)})).value:await markdownHtml(fs.readFileSync(file(e),'utf8'));}
      if(token(e)!==fingerprint)throw Error('原件正在被修改，请稍后刷新');
      if(!cacheValid || e.htmlSourceToken!==fingerprint){const db=state();e=entry(db,id);atomic(htmlFile,content);e.htmlSourceToken=fingerprint;persist(db);snapshot(e,'原件同步版本');}
      return {...e,format:'html',content,token:fingerprint};
    }
    return {...e,...await previewFile(file(e),e.ext,path.join(root,'previews')),token:fingerprint};
  });}
  async function write(id,format,content,expectedToken) {return serial(id,async()=>{
    let e=entry(state(),id);if(typeof content!=='string')throw Error('无效的正文');const baseline=token(e);
    if(expectedToken!==undefined&&expectedToken!==baseline)throw Error('原件已被其他编辑更新。当前草稿已保留，请刷新并核对后再保存。');
    let word;
    if(format==='html'&&(e.kind==='folder'||['docx','md'].includes(e.ext)))word=await htmlToWord(content,root);
    else if(!(format==='text'&&textExtensions.has(e.ext)))throw Error('该格式不支持直接编辑');
    const db=state();e=entry(db,id);parent(db,e.spaceId,e.parentId);
    if(token(e)!==baseline)throw Error('原件在保存期间被修改。草稿已保留，请刷新并核对。');
    snapshot(e,'编辑前');
    if(word){atomic(file(e,'html'),content);atomic(file(e,'docx'),word);e.ext='docx';e.htmlSourceToken=token(e);}
    else atomic(file(e),content);
    snapshot(e,'自动保存');return changed(db,e,'修改了文档');
  });}
  function rename(id,title) {ensureWritable();const db=state();const e=entry(db,id);e.title=name(title);return changed(db,e,'重命名了资料');}
  function move(id,parentId) {ensureWritable();const db=state();const e=entry(db,id);parent(db,e.spaceId,parentId);let current=parentId;while(current){if(current===id)throw Error('不能移动到自身或子文件夹');current=entry(db,current).parentId;}e.parentId=parentId||null;return changed(db,e,'移动了资料');}
  function associate(id,slugs) {ensureWritable();if(!Array.isArray(slugs)||slugs.some(s=>!validId(s)))throw Error('无效项目');const db=state(),e=entry(db,id);e.projectSlugs=[...new Set(slugs)];return changed(db,e,'更新了关联项目');}
  function linked(slug){const db=state();return db.entries.filter(e=>{if(e.deletedAt)return false;let current=e;const seen=new Set();while(current&&!seen.has(current.id)){seen.add(current.id);if((current.projectSlugs||[]).includes(slug))return true;current=db.entries.find(p=>p.id===current.parentId&&!p.deletedAt);}return false;});}
  function trash(id) {ensureWritable();const db=state();const e=entry(db,id);const ids=new Set([id]);let size=0;while(size!==ids.size){size=ids.size;db.entries.filter(x=>ids.has(x.parentId)).forEach(x=>ids.add(x.id));}const deletedAt=now();db.entries.filter(x=>ids.has(x.id)).forEach(x=>x.deletedAt=deletedAt);changed(db,e,'移入了回收站');}
  function restore(id) {ensureWritable();const db=state();const e=db.entries.find(x=>x.id===id);if(!e)throw Error('资料不存在');const deletedAt=e.deletedAt;const s=db.spaces.find(x=>x.id===e.spaceId);if(s?.deletedAt)delete s.deletedAt;const ids=new Set([id]);let size=0;while(size!==ids.size){size=ids.size;db.entries.filter(x=>ids.has(x.parentId)&&x.deletedAt===deletedAt).forEach(x=>ids.add(x.id));}db.entries.filter(x=>ids.has(x.id)).forEach(x=>delete x.deletedAt);let current=e;while(current){delete current.deletedAt;current=db.entries.find(x=>x.id===current.parentId);}persist(db);}
  async function restoreRevision(id,revisionId,expectedToken){return serial(id,async()=>{
    if(!validId(revisionId))throw Error('无效版本');const db=state(),e=entry(db,id);
    if(expectedToken!==undefined&&expectedToken!==token(e))throw Error('原件已更新，请刷新后再恢复');
    const meta=history(id).find(r=>r.id===revisionId);if(!meta)throw Error('版本不存在');snapshot(e,'恢复前');
    const dir=revisionDir(id);e.ext=meta.ext;fs.copyFileSync(path.join(dir,revisionId+'.'+meta.ext),file(e));
    if(fs.existsSync(path.join(dir,revisionId+'.html')))fs.copyFileSync(path.join(dir,revisionId+'.html'),file(e,'html'));
    else fs.rmSync(file(e,'html'),{force:true});
    e.htmlSourceToken=fs.existsSync(file(e,'html'))?token(e):undefined;return changed(db,e,'恢复了历史版本');
  });}
  async function locate(id) {await writes.get(id);const e=entry(state(),id);return file(e);}
  async function passages(id,query){const d=await read(id);const extracted=await extractFileText(file(d),d.ext,d);return {...extracted,passages:retrievePassages(extracted.text||'',query)};}
  async function search(query,spaceId){const matches=[];for(const e of state().entries.filter(e=>!e.deletedAt&&(!spaceId||e.spaceId===spaceId))){if(e.title.toLowerCase().includes(query.toLowerCase())){matches.push({id:e.id,snippet:'名称匹配'});continue;}if(e.kind==='link')continue;const result=await passages(e.id,query);const best=result.passages.find(p=>p.score>0);if(best)matches.push({id:e.id,snippet:best.section+' · '+best.text.slice(0,160)});}return matches;}
  async function backup(target){await Promise.allSettled([...writes.values()]);state();const zip=new JSZip();
    function collect(dir,relative=''){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const rel=path.posix.join(relative,item.name);if(rel==='previews'||item.name.endsWith('.tmp')||item.isSymbolicLink())continue;const full=path.join(dir,item.name);if(item.isDirectory())collect(full,rel);else zip.file(rel,fs.readFileSync(full));}}
    collect(root);const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});atomic(target,buffer);return target;
  }
  async function restoreBackup(source){
    await Promise.allSettled([...writes.values()]);restoring=true;
    const stage=root+'.restore-'+randomUUID(),old=root+'.before-restore-'+randomUUID();
    try{const zip=await JSZip.loadAsync(fs.readFileSync(source));const raw=zip.file('index.json');if(!raw)throw Error('不是有效的资料库备份');const db=JSON.parse(await raw.async('string'));
      if(!Array.isArray(db.spaces)||!Array.isArray(db.entries)||db.spaces.some(s=>!validId(s.id))||db.entries.some(e=>!validId(e.id)||!db.spaces.some(s=>s.id===e.spaceId)||!['folder','document','daily','link','text','file'].includes(e.kind)|| (e.ext&&!/^[a-z0-9]+$/i.test(e.ext))))throw Error('备份目录无效');
      for(const e of db.entries){const seen=new Set([e.id]);let p=e.parentId;while(p){const parent=db.entries.find(x=>x.id===p&&x.spaceId===e.spaceId&&x.kind==='folder');if(!parent||seen.has(p))throw Error('备份文件夹关系无效');seen.add(p);p=parent.parentId;}}
      fs.mkdirSync(stage,{recursive:true});for(const [name,item] of Object.entries(zip.files)){if(item.dir)continue;if(item.unsafeOriginalName&&item.unsafeOriginalName!==name)throw Error('备份包含无效路径');if(!/^(index\.json|files\/[a-zA-Z0-9_.-]+|revisions\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)$/.test(name))throw Error('备份包含无效文件');atomic(path.join(stage,name),await item.async('nodebuffer'));}
      for(const e of db.entries)if(e.ext&&!fs.existsSync(path.join(stage,'files',e.id+'.'+e.ext)))throw Error('备份缺少资料原件');
      fs.renameSync(root,old);try{fs.renameSync(stage,root);}catch(e){fs.renameSync(old,root);throw e;}return {previousBackup:old};
    }finally{restoring=false;fs.rmSync(stage,{recursive:true,force:true});}
  }
  return {state,createSpace,renameSpace,trashSpace,restoreSpace,create,upload,read,write,rename,move,trash,restore,locate,history,restoreRevision,backup,restoreBackup,associate,linked,passages,search};
}
function escape(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
module.exports={createMaterialLibrary};
