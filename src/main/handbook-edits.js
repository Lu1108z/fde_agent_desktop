const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {markdownHtml, htmlToWord} = require('./handbook-word');

// 用户修改独立保存，应用升级同步内置手册时不会覆盖。
function createHandbookEditor(handbookDir, editsDir) {
  function locate(stage, file) {
    if (!/^0[1-5]$/.test(String(stage)) || typeof file !== 'string' || path.basename(file) !== file || /[\\/]/.test(file)) throw new Error('无效文档路径');
    const manifest = JSON.parse(fs.readFileSync(path.join(handbookDir, 'manifest.json'), 'utf8'));
    const group = manifest.stages.find(entry => entry.dir === stage);
    const item = group?.items.find(entry => entry.file === file || entry.previewHtml === file || entry.sourceMarkdown === file);
    if (!item) throw new Error('文档未登记');
    const identity = `${item.category || 'other'}:${String(item.title || item.file).normalize('NFKC').replace(/\s/g, '').toLowerCase()}`;
    const key = crypto.createHash('sha256').update(identity).digest('hex');
    return {item, stage, editPath:path.join(editsDir, stage, `${key}.json`)};
  }
  function readOverride(stage, file) {
    const record = locate(stage, file);
    if (!fs.existsSync(record.editPath)) return null;
    const edit = JSON.parse(fs.readFileSync(record.editPath, 'utf8'));
    if (!['md','html'].includes(edit.format) || typeof edit.content !== 'string') throw new Error('保存的文档格式不正确');
    return {...edit, edited:true};
  }
  async function read(stage, file) {
    const saved = readOverride(stage, file);
    if (saved) return saved.format === 'md' ? {...saved,format:'html',content:await markdownHtml(saved.content)} : saved;
    const {item} = locate(stage, file);
    if (item.sourceMarkdown || item.type === 'md') return {format:'html', content:await markdownHtml(fs.readFileSync(path.join(handbookDir, stage, item.sourceMarkdown || item.file),'utf8')), edited:false};
    if (item.previewHtml) return {format:'html', content:fs.readFileSync(path.join(handbookDir, stage, item.previewHtml),'utf8'), edited:false};
    if (item.type === 'docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.convertToHtml({path:path.join(handbookDir, stage, item.file)});
      return {format:'html', content:result.value || '', edited:false};
    }
    throw new Error('该文档格式暂不支持应用内编辑');
  }
  async function write(stage, file, format, content) {
    const {editPath,item} = locate(stage, file);
    if (!['md','html'].includes(format) || typeof content !== 'string') throw new Error('不支持的文档格式');
    const edit = {format, content, title:item.title, sourceFile:item.file, updatedAt:new Date().toISOString()};
    fs.mkdirSync(path.dirname(editPath), {recursive:true});
    const temporary = `${editPath}.tmp`;
    const word = await htmlToWord(format === 'md' ? await markdownHtml(content) : content, path.join(handbookDir, stage));
    const wordPath = editPath.replace(/\.json$/, '.docx');
    fs.writeFileSync(`${wordPath}.tmp`, word);
    fs.renameSync(`${wordPath}.tmp`, wordPath);
    fs.writeFileSync(temporary, JSON.stringify(edit, null, 2), 'utf8');
    fs.renameSync(temporary, editPath);
    return {...edit, edited:true};
  }
  async function wordBuffer(stage, file) {
    const document = await read(stage,file);
    return htmlToWord(document.format === 'md' ? await markdownHtml(document.content) : document.content, path.join(handbookDir, stage));
  }
  return {read, write, readOverride, wordBuffer};
}
module.exports = {createHandbookEditor};
