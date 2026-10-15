const fs=require('fs');
const path=require('path');
const os=require('os');
const {execFile}=require('child_process');
const {promisify}=require('util');
const {pathToFileURL}=require('url');
const JSZip=require('jszip');
const {DOMParser}=require('@xmldom/xmldom');
const execute=promisify(execFile);
const textExtensions=new Set(['txt','json','sql','js','jsx','ts','tsx','css','scss','less','xml','log','yaml','yml','py','sh','bash','java','c','h','cpp','cs','go','rs','vue','svelte','ini','toml','conf','properties']);
const videoExtensions=new Set(['mp4','webm','mov','m4v','ogv','mkv','avi']);
const audioExtensions=new Set(['mp3','wav','m4a','ogg','oga','flac','aac']);
const imageExtensions=new Set(['png','jpg','jpeg','gif','webp','bmp','svg','avif','ico']);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function xml(text){text=String(text).replace(/^\uFEFF/,'');if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('文档包含不支持的 XML 声明');return new DOMParser().parseFromString(text,'application/xml');}
const nodes=(p,n)=>Array.from(p.getElementsByTagName(n));
const localNodes=(p,n)=>Array.from(p.getElementsByTagName('*')).filter(x=>x.localName===n);
async function readZipXml(zip,file){const entry=zip.file(file);return entry?xml(await entry.async('string')):null;}
function relationshipTarget(base,target){if(/^(?:https?:|file:|\/\/)/i.test(target))return null;const resolved=target.startsWith('/')?target.slice(1):path.posix.normalize(path.posix.join(base,target));return resolved.startsWith('../')?null:resolved;}
async function spreadsheet(file) {
  const zip=await JSZip.loadAsync(fs.readFileSync(file));
  const book=await readZipXml(zip,'xl/workbook.xml'),rels=await readZipXml(zip,'xl/_rels/workbook.xml.rels');
  if(!book||!rels)throw Error('无法读取 Excel 工作簿');
  const targets=Object.fromEntries(nodes(rels,'Relationship').filter(n=>n.getAttribute('TargetMode')!=='External').map(n=>[n.getAttribute('Id'),relationshipTarget('xl',n.getAttribute('Target'))]));
  const shared=await readZipXml(zip,'xl/sharedStrings.xml');
  const strings=shared?nodes(shared,'si').map(n=>nodes(n,'t').map(t=>t.textContent).join('')):[];
  const sheets=[];
  for(const sheet of nodes(book,'sheet')) {
    const doc=await readZipXml(zip,targets[sheet.getAttribute('r:id')]||'');if(!doc)continue;
    const rows=nodes(doc,'sheetData').flatMap(data=>nodes(data,'row')).map(row=>{
      const cells=nodes(row,'c').map(cell=>{const ref=cell.getAttribute('r');const t=cell.getAttribute('t');const value=nodes(cell,'v')[0]?.textContent??'';return {ref,value:t==='s'?strings[Number(value)]||'':t==='inlineStr'?nodes(cell,'t').map(n=>n.textContent).join(''):t==='b'?value==='1'?'是':'否':value,formula:nodes(cell,'f')[0]?.textContent||''};});
      return {number:Number(row.getAttribute('r'))||1,cells};
    });
    sheets.push({name:sheet.getAttribute('name'),rows});
  }
  return {format:'spreadsheet',sheets};
}
function csvRows(text){let rows=[],row=[],value='',quoted=false;const first=text.split(/\r?\n/)[0]||'';const delimiter=first.includes('\t')&&!first.includes(',')?'\t':',';for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}else value+=c;}if(value||row.length){row.push(value);rows.push(row);}return rows;}
async function presentation(file){
  const zip=await JSZip.loadAsync(fs.readFileSync(file));
  const book=await readZipXml(zip,'ppt/presentation.xml'),rels=await readZipXml(zip,'ppt/_rels/presentation.xml.rels');
  const targets=rels?Object.fromEntries(nodes(rels,'Relationship').filter(n=>n.getAttribute('TargetMode')!=='External').map(n=>[n.getAttribute('Id'),relationshipTarget('ppt',n.getAttribute('Target'))])):{};
  const order=book?localNodes(book,'sldId').map(n=>targets[n.getAttribute('r:id')]).filter(Boolean):[];
  const files=order.length?order:Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
  const slides=[];
  for(const filename of files){
    const doc=await readZipXml(zip,filename);const rel=await readZipXml(zip,path.posix.join(path.posix.dirname(filename),'_rels',path.posix.basename(filename)+'.rels'));
    const slideTargets=rel?Object.fromEntries(nodes(rel,'Relationship').filter(n=>n.getAttribute('TargetMode')!=='External').map(n=>[n.getAttribute('Id'),relationshipTarget(path.posix.dirname(filename),n.getAttribute('Target'))])):{};
    const paragraphs=localNodes(doc,'p').map(p=>localNodes(p,'t').map(n=>n.textContent).join('')).filter(Boolean);
    const images=[];for(const blip of localNodes(doc,'blip')){const target=slideTargets[blip.getAttribute('r:embed')];const image=target&&zip.file(target);if(image&&/\.(png|jpe?g|gif|webp|svg)$/i.test(target)){const ext=path.extname(target).slice(1).replace('jpg','jpeg');images.push('data:image/'+(ext==='svg'?'svg+xml':ext)+';base64,'+await image.async('base64'));}}
    slides.push({number:slides.length+1,paragraphs,images});
  }
  return {format:'slides',slides,previewNotice:'幻灯片内容预览'};
}
function findOfficeConverter(){
  const executable=process.platform==='win32'?'soffice.exe':'soffice';
  const candidates=[process.env.FDE_PREVIEW_CONVERTER,'/Applications/LibreOffice.app/Contents/MacOS/soffice',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice'),...String(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,executable))];
  if(process.platform==='win32')candidates.push(path.join(process.env.ProgramFiles||'C:\\Program Files','LibreOffice/program/soffice.exe'));
  return candidates.find(p=>p&&fs.existsSync(p));
}
const conversions=new Map();
async function officePdf(file,cacheDir){
  const converter=findOfficeConverter();if(!converter)return null;
  const stat=fs.statSync(file),key=path.basename(file)+'.'+Math.round(stat.mtimeMs)+'.'+stat.size;
  const directory=path.join(cacheDir,key),pdf=path.join(directory,path.basename(file,path.extname(file))+'.pdf');
  if(fs.existsSync(pdf))return pdf;
  if(conversions.has(pdf))return conversions.get(pdf);
  const work=(async()=>{fs.mkdirSync(directory,{recursive:true});const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fde-office-preview-'));try{await execute(converter,['-env:UserInstallation='+pathToFileURL(profile).href,'--headless','--convert-to','pdf','--outdir',directory,file],{timeout:45000,maxBuffer:1024*1024,windowsHide:true});return fs.existsSync(pdf)?pdf:null;}finally{fs.rmSync(profile,{recursive:true,force:true});}})();
  conversions.set(pdf,work);try{return await work;}finally{conversions.delete(pdf);}
}
async function previewFile(file,ext,cacheDir){
  if(ext==='xlsx')return spreadsheet(file);
  if(['csv','tsv'].includes(ext)){const rows=csvRows(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));return {format:'spreadsheet',sheets:[{name:'数据',rows:rows.map((row,i)=>({number:i+1,cells:row.map((value,j)=>({index:j,value}))}))}]};}
  if(['pptx','ppt','odp','xls','ods','doc','rtf','odt','pages','numbers','key'].includes(ext)){
    try{const pdf=await officePdf(file,cacheDir);if(pdf)return {format:'file',previewType:'pdf',path:pdf};}catch(_){/* 转换不可用时仍提供内容预览或打开原件。 */}
    if(ext==='pptx')return presentation(file);
    return {format:'file',path:file,previewNotice:'此格式的页式预览需要本机安装 LibreOffice，可先用本机程序打开。'};
  }
  if(['html','htm'].includes(ext))return {format:'web',content:fs.readFileSync(file,'utf8')};
  if(textExtensions.has(ext))return {format:'text',content:fs.readFileSync(file,'utf8')};
  if(ext==='zip'){const zip=await JSZip.loadAsync(fs.readFileSync(file));return {format:'archive',files:Object.values(zip.files).map(f=>({name:f.name,directory:f.dir,size:f._data?.uncompressedSize||0}))};}
  return {format:'file',path:file,previewType:ext==='pdf'?'pdf':imageExtensions.has(ext)?'image':videoExtensions.has(ext)?'video':audioExtensions.has(ext)?'audio':null};
}
module.exports={previewFile,spreadsheet,presentation,csvRows,textExtensions,findOfficeConverter};
