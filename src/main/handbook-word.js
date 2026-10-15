const fs = require('fs');
const path = require('path');
const {DOMParser} = require('@xmldom/xmldom');
const {Document, Paragraph, TextRun, Table, TableRow, TableCell, Packer,
  HeadingLevel, WidthType, ImageRun, ExternalHyperlink} = require('docx');

async function markdownHtml(content) {
  const {marked} = await import('marked');
  return marked.parse(content.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => inner.split('|').pop()));
}

// Word 原生段落、标题、列表与表格；不使用只能在部分 Word 中显示的 HTML 嵌入。
async function htmlToWord(content, baseDir) {
  const root = new DOMParser().parseFromString(`<html><body>${content}</body></html>`, 'text/html').getElementsByTagName('body')[0];
  const tag = node => (node.localName || node.nodeName || '').toLowerCase();
  const nodes = node => Array.from(node.childNodes || []);
  const image = node => {
    const src = node.getAttribute('src') || '';
    let data, type;
    const embedded = src.match(/^data:image\/(png|jpeg|jpg|gif|bmp);base64,(.+)$/s);
    if (embedded) { data = Buffer.from(embedded[2], 'base64'); type = embedded[1]; }
    else if (baseDir && src && !/^(https?:|file:|\/\/)/i.test(src)) {
      const file = path.resolve(baseDir, decodeURIComponent(src));
      if (file.startsWith(path.resolve(baseDir) + path.sep) && fs.existsSync(file)) {
        type = path.extname(file).slice(1).toLowerCase();
        if (['png','jpg','jpeg','gif','bmp'].includes(type)) data = fs.readFileSync(file);
      }
    }
    if (!data) return new TextRun({text:node.getAttribute('alt') || '[图片]', italics:true});
    let width = Number(node.getAttribute('width')) || 520;
    let height = Number(node.getAttribute('height')) || 300;
    if (type === 'png' && data.length > 24) { width=data.readUInt32BE(16); height=data.readUInt32BE(20); }
    const scale=Math.min(1, 540/width);
    return new ImageRun({data, type:type === 'jpg' ? 'jpeg' : type, transformation:{width:width*scale,height:height*scale}, altText:{title:node.getAttribute('alt') || '文档图片',description:node.getAttribute('alt') || '文档图片',name:'文档图片'}});
  };
  function inline(node, style={}) {
    if (node.nodeType === 3) return [new TextRun({text:node.data, ...style})];
    const name=tag(node);
    if (['script','style','iframe','object'].includes(name)) return [];
    if (name === 'br') return [new TextRun({break:1})];
    if (name === 'img') return [image(node)];
    const next={...style};
    if (['b','strong','th'].includes(name)) next.bold=true;
    if (['i','em'].includes(name)) next.italics=true;
    if (name === 'u') next.underline={};
    if (['s','del','strike'].includes(name)) next.strike=true;
    if (['code','pre'].includes(name)) next.font='Consolas';
    const fontSize=(node.getAttribute?.('style') || '').match(/(?:^|;)\s*font-size\s*:\s*([\d.]+)(pt|px)\b/i);
    if (fontSize) {
      const points=Number(fontSize[1]) * (fontSize[2].toLowerCase()==='px' ? 0.75 : 1);
      if (points>0 && points<=200) {next.size=Math.round(points*2);next.sizeComplexScript=next.size;}
    }
    const children=nodes(node).flatMap(child=>inline(child,next));
    const href=node.getAttribute?.('href');
    if (name === 'a' && /^https?:/i.test(href || '')) return [new ExternalHyperlink({link:href, children})];
    return children;
  }
  let listId=0;
  const numbering=[];
  function blocks(parent, level=0) {
    const result=[];
    for (const node of nodes(parent)) {
      const name=tag(node);
      if (node.nodeType === 3) { if (node.data.trim()) result.push(new Paragraph({children:inline(node)})); continue; }
      if (['script','style','head','iframe'].includes(name)) continue;
      if (name === 'table') {
        const rows=Array.from(node.getElementsByTagName('tr')).filter(row=>{let p=row.parentNode;while(p && p!==node && tag(p)!=='table') p=p.parentNode;return p===node;});
        result.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map(row=>new TableRow({
          tableHeader:nodes(row).some(cell=>tag(cell)==='th') ? true : undefined,
          children:nodes(row).filter(cell=>['td','th'].includes(tag(cell))).map(cell=>new TableCell({
            columnSpan:Number(cell.getAttribute('colspan')) || 1,
            rowSpan:Number(cell.getAttribute('rowspan')) || 1,
            shading:tag(cell)==='th' ? {fill:'EDF3FC'} : undefined,
            children:blocks(cell).length ? blocks(cell) : [new Paragraph({children:inline(cell)})],
          })),
        }))}));
        result.push(new Paragraph({text:''}));
      } else if (['ul','ol'].includes(name)) {
        const reference=`list-${++listId}`;
        if (name==='ol') numbering.push({reference,levels:[{level:0,format:'decimal',text:'%1.',start:Number(node.getAttribute('start')) || 1,style:{paragraph:{indent:{left:420,hanging:240}}}}]});
        for (const li of nodes(node).filter(n=>tag(n)==='li')) {
          const children=nodes(li).filter(n=>!['ul','ol'].includes(tag(n))).flatMap(n=>inline(n));
          result.push(new Paragraph({children, ...(name==='ul' ? {bullet:{level:Math.min(level,8)}} : {numbering:{reference,level:0}})}));
          for (const nested of nodes(li).filter(n=>['ul','ol'].includes(tag(n)))) result.push(...blocks({childNodes:[nested]},level+1));
        }
      } else if (/^h[1-6]$/.test(name)) result.push(new Paragraph({heading:HeadingLevel[`HEADING_${name[1]}`],children:inline(node),spacing:{before:240,after:120},keepNext:true}));
      else if (['div','section','article','body','html','blockquote'].includes(name)) result.push(...blocks(node,level));
      else if (name==='hr') result.push(new Paragraph({text:''}));
      else result.push(new Paragraph({children:inline(node),spacing:{after:100,line:300}}));
    }
    return result;
  }
  const children=blocks(root);
  const document=new Document({styles:{default:{document:{run:{font:'Microsoft YaHei',size:22,color:'243247'},paragraph:{spacing:{after:100,line:300}}}}},numbering:{config:numbering},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,bottom:1134,left:1134,right:1134}}},children:children.length ? children : [new Paragraph({text:''})]}]});
  return Packer.toBuffer(document);
}
module.exports={markdownHtml,htmlToWord};
