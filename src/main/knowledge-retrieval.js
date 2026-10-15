const fs=require('fs');
const path=require('path');
const {execFile}=require('child_process');
const {promisify}=require('util');
const {DOMParser}=require('@xmldom/xmldom');
const {spreadsheet,presentation,textExtensions}=require('./material-preview');
const execute=promisify(execFile);
function htmlText(content){return new DOMParser().parseFromString('<body>'+String(content).replace(/<h([1-6])(?:\s[^>]*)?>/gi,(_,level)=>'<h'+level+'>\n'+'#'.repeat(Number(level))+' ').replace(/<\/(td|th)>/gi,' | </$1>').replace(/<\/(p|h[1-6]|tr|li|div)>/gi,'\n</$1>')+'</body>','text/html').documentElement.textContent;}
async function extractFileText(file,ext,preview){
  try{
    let text='';
    if(preview?.format==='html')text=htmlText(preview.content);
    else if(ext==='docx')text=htmlText((await require('mammoth').convertToHtml({path:file})).value);
    else if(ext==='xlsx'){const d=await spreadsheet(file);text=d.sheets.map(s=>'## 工作表：'+s.name+'\n'+s.rows.map(r=>r.number+': '+r.cells.map(c=>c.value).join(' | ')).join('\n')).join('\n\n');}
    else if(ext==='pptx'){const d=await presentation(file);text=d.slides.map(s=>'## 幻灯片 '+s.number+'\n'+s.paragraphs.join('\n')).join('\n\n');}
    else if(ext==='pdf'){
      if(process.env.FDE_PDFTOTEXT){
        const result=await execute(process.env.FDE_PDFTOTEXT,['-layout',file,'-'],{maxBuffer:128*1024*1024});
        text=result.stdout.split('\f').map((t,i)=>'## 第 '+(i+1)+' 页\n'+t).join('\n\n');
      }else{
        // Ship the parser with the app: recipients do not need Homebrew or Poppler.
        const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
        const task=getDocument({data:new Uint8Array(fs.readFileSync(file)),isEvalSupported:false,useSystemFonts:true});
        try{
          const document=await task.promise,pages=[];
          for(let number=1;number<=document.numPages;number++){
            const page=await document.getPage(number),content=await page.getTextContent();
            pages.push('## 第 '+number+' 页\n'+content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));
            page.cleanup();
          }
          text=pages.join('\n\n');
        }finally{await task.destroy();}
      }
    }else if(ext==='html'||ext==='htm')text=htmlText(fs.readFileSync(file,'utf8'));
    else if(textExtensions.has(ext)||['md','csv','tsv'].includes(ext))text=fs.readFileSync(file,'utf8');
    else return {text:'',status:'needs-tool',notice:'此格式没有可检索正文，请使用原件读取工具；音视频需要转录。'};
    return {text,status:text.trim()?'ready':'empty',notice:text.trim()?'正文已解析':'没有可提取正文，扫描件可能需要 OCR'};
  }catch(error){return {text:'',status:'error',notice:'正文解析失败：'+error.message};}
}
function terms(query){const lower=String(query||'').toLowerCase();const latin=lower.match(/[a-z0-9_-]{2,}/g)||[];const chinese=lower.match(/[\u4e00-\u9fff]+/g)||[];return [...new Set([...latin,...chinese.flatMap(s=>s.length===1?[s]:Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)))])];}
function retrievePassages(text,query){
  const keywords=terms(query),lines=String(text).split('\n');const chunks=[];let section='正文',buffer='',start=1;
  function flush(){if(buffer.trim()){const lower=buffer.toLowerCase();chunks.push({section,line:start,text:buffer.trim(),score:keywords.reduce((n,t)=>n+(lower.includes(t)?1:0),0)});}buffer='';}
  for(let i=0;i<lines.length;i++){const line=lines[i];if(/^#{1,6}\s/.test(line)){flush();section=line.replace(/^#+\s*/,'');start=i+1;}if(buffer.length+line.length>1400)flush();if(!buffer)start=i+1;
    // Long single paragraphs must still be searchable beyond their beginning.
    for(let offset=0;offset<line.length;offset+=1200){if(offset)flush();buffer+=line.slice(offset,offset+1200)+'\n';}}
  flush();return chunks.sort((a,b)=>b.score-a.score||a.line-b.line);
}
module.exports={extractFileText,retrievePassages};
