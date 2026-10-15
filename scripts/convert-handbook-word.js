const fs=require('fs');
const path=require('path');
const {markdownHtml,htmlToWord}=require('../src/main/handbook-word');
async function convertMarkdownItem(dir,item) {
  if (item.type !== 'md') return item;
  const content=fs.readFileSync(path.join(dir,item.file),'utf8');
  const html=await markdownHtml(content);
  const file=item.file.replace(/\.md$/i,'.Word.docx');
  const previewHtml=item.file.replace(/\.md$/i,'.Word.html');
  fs.writeFileSync(path.join(dir,file),await htmlToWord(html,dir));
  fs.writeFileSync(path.join(dir,previewHtml),html,'utf8');
  return {...item,file,type:'docx',previewable:true,previewHtml,sourceMarkdown:item.file};
}
async function main() {
  const root=path.join(__dirname,'..','fde-handbook');
  const manifestPath=path.join(root,'manifest.json');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  let converted=0;
  for (const stage of manifest.stages) {
    for (let index=0;index<stage.items.length;index++) {
      const item=stage.items[index];
      if (item.type !== 'md' && !item.sourceMarkdown) continue;
      stage.items[index]=await convertMarkdownItem(path.join(root,stage.dir),{...item,type:'md',file:item.sourceMarkdown || item.file});
      converted++;
    }
  }
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log(`Converted ${converted} Markdown documents to Word; Markdown originals retained.`);
}
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={convertMarkdownItem};
