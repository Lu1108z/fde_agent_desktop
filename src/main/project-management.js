const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

const SOURCE_URL = 'https://wcn3xtaqzk2z.feishu.cn/base/QNnAbN7CKaHAowsD5OvcMlbQnie?table=tblRmvOhnaXoKYkL&view=vewqH5dplg';
const FIELDS = [
  ['project', '项目名称', ['项目名称', '项目', '客户名称', '医院名称']],
  ['agent', '所需智能体', ['所需智能体', '智能体名称', '智能体', '子项目']],
  ['industry', '领域', ['领域', '行业']],
  ['stage', '当前阶段', ['当前阶段', '项目阶段', '阶段']],
  ['progress', '当前阶段进度', ['当前阶段进度', '阶段进度', '进度', '完成进度']],
  ['owner', '负责人', ['负责人', '项目负责人', '责任人']],
  ['startDate', '开始时间', ['开始时间', '开始日期', '计划开始时间']],
  ['endDate', '结束时间', ['结束时间', '结束日期', '预计完成时间', '截止日期', '计划结束时间', '计划完成时间']],
  ['status', '项目状态', ['项目状态', '状态']],
  ['action', '下一步 / 待办', ['下一步', '下一步计划', '待办', '待办事项', '当前任务']],
  ['recordId', '记录 ID（可选）', ['记录ID', '记录 ID', 'record_id', 'Record ID']],
];
const MAX_ROWS = 20000;
const clean = value => String(value ?? '').trim();
const xml = text => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不支持包含外部实体的工作表');
  return new DOMParser({ onError: level => { if (level !== 'warning') throw new Error('Excel 文件格式有误'); } }).parseFromString(text, 'application/xml');
};
const nodes = (parent, name) => Array.from(parent.getElementsByTagName(name));

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0];
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || value === '') quoted = !quoted;
      else value += ch;
    } else if (ch === delimiter && !quoted) { row.push(value); value = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
      if (rows.length > MAX_ROWS + 30) throw new Error('单张表最多导入 20,000 行，请拆分后导入');
    } else value += ch;
  }
  if (quoted) throw new Error('CSV 引号未闭合，请重新导出文件');
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function excelDate(value, date1904 = false) {
  const date = new Date((Number(value) - (date1904 ? 0 : 25569)) * 86400000 + (date1904 ? Date.UTC(1904, 0, 1) : 0));
  return Number.isNaN(date.getTime()) ? clean(value) : date.toISOString().slice(0, 10);
}

async function parseXlsx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async name => {
    const file = zip.file(name);
    if (!file) return null;
    if (file._data?.uncompressedSize > 32 * 1024 * 1024) throw new Error('工作表过大，请拆分后导入');
    const data = await file.async('string');
    if (data.length > 32 * 1024 * 1024) throw new Error('工作表过大，请拆分后导入');
    return xml(data);
  };
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('无法识别 Excel 工作簿，请使用 .xlsx 或 CSV 文件');
  const date1904 = ['1', 'true'].includes(nodes(workbook, 'workbookPr')[0]?.getAttribute('date1904'));
  const targets = Object.fromEntries(nodes(rels, 'Relationship').filter(n => n.getAttribute('TargetMode') !== 'External').map(n => [n.getAttribute('Id'), n.getAttribute('Target')]));
  const shared = await read('xl/sharedStrings.xml');
  const strings = shared ? nodes(shared, 'si').map(n => nodes(n, 't').map(t => t.textContent).join('')) : [];
  const styles = await read('xl/styles.xml');
  const formats = Object.fromEntries(styles ? nodes(styles, 'numFmt').map(n => [n.getAttribute('numFmtId'), n.getAttribute('formatCode')]) : []);
  const cellFormats = styles ? nodes(styles, 'cellXfs').flatMap(n => nodes(n, 'xf').map(x => Number(x.getAttribute('numFmtId')))) : [];
  const sheets = [];
  for (const sheet of nodes(workbook, 'sheet').slice(0, 30)) {
    const target = targets[sheet.getAttribute('r:id')];
    if (!target) continue;
    const sheetPath = target.startsWith('/') ? target.slice(1) : path.posix.normalize(`xl/${target}`);
    if (!sheetPath.startsWith('xl/')) continue;
    const document = await read(sheetPath);
    if (!document) continue;
    const sheetRows = nodes(document, 'row');
    if (sheetRows.length > MAX_ROWS + 30) throw new Error('单张表最多导入 20,000 行，请拆分后导入');
    const rows = sheetRows.map(row => {
      const values = []; let fallbackColumn = 0;
      for (const cell of nodes(row, 'c')) {
        const letters = cell.getAttribute('r').match(/^[A-Z]+/)?.[0];
        const index = letters ? Array.from(letters).reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1 : fallbackColumn;
        fallbackColumn = index + 1;
        if (index > 255) continue;
        const raw = nodes(cell, 'v')[0]?.textContent ?? '';
        const type = cell.getAttribute('t');
        let value = type === 's' ? (strings[Number(raw)] || '') : type === 'inlineStr' ? nodes(cell, 't').map(n => n.textContent).join('') : raw;
        const fmtId = cellFormats[Number(cell.getAttribute('s') || 0)] || 0;
        const fmt = (formats[fmtId] || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
        if (raw !== '' && !type && Number.isFinite(Number(raw))) {
          if ((fmtId >= 14 && fmtId <= 22) || /[yd]/i.test(fmt)) value = excelDate(raw, date1904);
          else if ([9, 10].includes(fmtId) || fmt.includes('%')) value = `${Math.round(Number(raw) * 10000) / 100}%`;
        }
        values[index] = value;
      }
      return Array.from(values, v => clean(v));
    });
    sheets.push({ name: sheet.getAttribute('name') || '工作表', rows });
  }
  if (!sheets.length) throw new Error('没有可读取的工作表');
  return sheets;
}

function prepareSheet(sheet) {
  const nonempty = sheet.rows.filter(row => row.some(value => clean(value)));
  const score = row => FIELDS.filter(([, , aliases]) => row.some(v => aliases.includes(clean(v)))).length;
  const candidate = nonempty.slice(0, 20).map((row, index) => ({ index, score: score(row) })).sort((a, b) => b.score - a.score)[0];
  const headerRow = candidate?.score ? candidate.index : 0;
  const headers = (nonempty[headerRow] || []).map((v, i) => clean(v) || `第 ${i + 1} 列`);
  const rows = nonempty.slice(headerRow + 1);
  const mapping = Object.fromEntries(FIELDS.map(([key, , aliases]) => [key, headers.findIndex(header => aliases.includes(header))]));
  return { name: sheet.name, headers, rows, mapping };
}

function parseStage(value) {
  const text = clean(value);
  if (/未开始|待启动|未启动/.test(text)) return 0;
  const number = text.match(/(?:阶段|第)\s*([1-5一二三四五])/i)?.[1] || text.match(/^[1-5]$/)?.[0];
  if (number) return Number(number) || ('一二三四五'.indexOf(number) + 1);
  const labels = ['调研准备', '需求沟通', '需求确认', '行业工作台', '客户试用'];
  const index = labels.findIndex(label => text.includes(label));
  if (index >= 0) return index + 1;
  if (/工作台上线|纳米Work/i.test(text)) return 4;
  return null;
}
function parseProgress(value) {
  const text = clean(value);
  if (!text) return null;
  const percent = text.endsWith('%') || text.endsWith('％');
  let number = Number(text.replace(/[%％,]/g, ''));
  if (!Number.isFinite(number)) return null;
  if (!percent && text.includes('.') && number >= 0 && number <= 1) number *= 100;
  return number >= 0 && number <= 100 ? Math.round(number * 100) / 100 : null;
}
function parseDate(value) {
  const text = clean(value);
  if (!text) return '';
  if (/^\d{5}(\.\d+)?$/.test(text)) return excelDate(text);
  const match = text.match(/^(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  if (!match) return '';
  const result = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : '';
}

function normalizeRows(sheet, mapping) {
  if (!Number.isInteger(mapping.project) || mapping.project < 0 || mapping.project >= sheet.headers.length) throw new Error('请指定「项目名称」对应的列');
  const seen = new Map(); const records = []; let skipped = 0; const warnings = [];
  for (const [index, row] of sheet.rows.entries()) {
    const get = field => clean(row[mapping[field]]);
    const project = get('project');
    if (!project) { skipped++; continue; }
    const identity = get('recordId') ? `record:${get('recordId')}` : JSON.stringify([project, get('agent'), get('industry')]);
    const occurrence = (seen.get(identity) || 0) + 1; seen.set(identity, occurrence);
    const stageText = get('stage'); const progressText = get('progress');
    const stage = parseStage(stageText); const progress = parseProgress(progressText);
    const startDate = parseDate(get('startDate')); const endDate = parseDate(get('endDate'));
    if ((stageText && stage === null) || (progressText && progress === null) || (get('startDate') && !startDate) || (get('endDate') && !endDate)) warnings.push(`第 ${index + 2} 行有无法识别的阶段、进度或日期，请查看原始字段。`);
    records.push({ id: crypto.createHash('sha256').update(`${identity}\n${occurrence}`).digest('hex').slice(0, 24), identity, project, agent: get('agent'), industry: get('industry'), stage, stageText, progress, owner: get('owner'), startDate, endDate, status: get('status'), action: get('action'), linkedSlug: '', original: Object.fromEntries(sheet.headers.map((header, i) => [header, clean(row[i])])) });
  }
  if (!records.length) throw new Error('所选工作表没有有效项目，请检查工作表和字段对应关系');
  const duplicates = Array.from(seen.values()).filter(n => n > 1).length;
  if (duplicates) warnings.push(`${duplicates} 组项目名称和智能体重复；重新导入时这些行需要重新确认本地关联。建议导出记录 ID 列。`);
  return { records, skipped, warnings };
}

function createManagementStore(file) {
  const read = () => {
    if (!fs.existsSync(file)) return { version: 1, revision: 0, records: [], sourceUrl: SOURCE_URL };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.records)) throw new Error('项目管理数据格式异常，请恢复备份后重试');
    return data;
  };
  const write = data => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2)); fs.renameSync(temporary, file);
    return data;
  };
  const replace = (parsed, source, expectedRevision) => {
    const before = read();
    if (expectedRevision !== before.revision) throw new Error('项目管理数据已更新，请关闭导入窗口后重新导入');
    const count = records => records.reduce((result, record) => { result.set(record.identity, (result.get(record.identity) || 0) + 1); return result; }, new Map());
    const oldCounts = count(before.records), newCounts = count(parsed.records);
    const oldRecords = new Map(before.records.map(record => [record.identity, record]));
    const records = parsed.records.map(record => ({ ...record, linkedSlug: oldCounts.get(record.identity) === 1 && newCounts.get(record.identity) === 1 ? oldRecords.get(record.identity)?.linkedSlug || '' : '' }));
    return write({ version: 1, revision: before.revision + 1, sourceUrl: SOURCE_URL, importedAt: new Date().toISOString(), source, records, warnings: parsed.warnings, skipped: parsed.skipped });
  };
  const link = (id, slug) => {
    const data = read(); const record = data.records.find(item => item.id === id);
    if (!record) throw new Error('该项目记录已不存在，请刷新');
    record.linkedSlug = slug; data.revision++;
    return write(data);
  };
  return { read, replace, link };
}

function registerManagement({ ipcMain, dialog, BrowserWindow, home, projectExists }) {
  const store = createManagementStore(path.join(home, 'project-management.json'));
  const pending = new Map();
  const changed = () => BrowserWindow.getAllWindows().forEach(window => window.webContents.send('management:changed'));
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return { success: true, ...(await fn(event, payload || {})) }; }
    catch (error) { return { success: false, error: error.message || '项目管理操作失败' }; }
  });
  handle('management:get', () => ({ data: store.read() }));
  handle('management:preview-import', async event => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '导入飞书导出的项目进度表', properties: ['openFile'], filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv', 'tsv'] }] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const file = result.filePaths[0];
    if (!['.xlsx', '.csv', '.tsv'].includes(path.extname(file).toLowerCase())) throw new Error('请选择 .xlsx、.csv 或 .tsv 格式的项目表格');
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请导出较小的工作表');
    const buffer = fs.readFileSync(file);
    let sheets;
    if (path.extname(file).toLowerCase() === '.xlsx') sheets = await parseXlsx(buffer);
    else {
      let text = buffer.toString('utf8');
      if (text.includes('\uFFFD')) text = new TextDecoder('gb18030').decode(buffer);
      sheets = [{ name: path.basename(file), rows: parseCsv(text) }];
    }
    const prepared = sheets.map(prepareSheet).filter(sheet => sheet.headers.length && sheet.rows.length);
    if (!prepared.length) throw new Error('文件中没有可导入的数据');
    for (const [id, entry] of pending) if (Date.now() - entry.createdAt > 30 * 60 * 1000 || entry.sender === event.sender.id) pending.delete(id);
    const token = crypto.randomUUID(); const revision = store.read().revision;
    pending.set(token, { sheets: prepared, sender: event.sender.id, createdAt: Date.now(), filename: path.basename(file), revision });
    return { token, filename: path.basename(file), fields: FIELDS.map(([key, label]) => ({ key, label })), sheets: prepared.map(sheet => ({ name: sheet.name, headers: sheet.headers, mapping: sheet.mapping, count: sheet.rows.length, preview: sheet.rows.slice(0, 4) })) };
  });
  handle('management:commit-import', (event, { token, sheetIndex, mapping }) => {
    const entry = pending.get(token);
    if (!entry || entry.sender !== event.sender.id || Date.now() - entry.createdAt > 30 * 60 * 1000) throw new Error('导入预览已过期，请重新选择文件');
    const sheet = entry.sheets[sheetIndex];
    if (!sheet || !mapping || typeof mapping !== 'object') throw new Error('请选择工作表和字段');
    const parsed = normalizeRows(sheet, mapping);
    const data = store.replace(parsed, { filename: entry.filename, sheet: sheet.name }, entry.revision);
    pending.delete(token); changed(); return { data };
  });
  handle('management:link', (_event, { id, slug }) => {
    if (typeof slug !== 'string' || (slug && !projectExists(slug))) throw new Error('本地项目不存在，请重新选择');
    const data = store.link(id, slug); changed(); return { data };
  });
  handle('management:template', async event => {
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { title: '保存导入字段模板', defaultPath: '项目进度导入模板.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, '\uFEFF项目名称,所需智能体,领域,当前阶段,当前阶段进度,负责人,开始时间,结束时间,项目状态,下一步\r\n');
    return {};
  });
}

module.exports = { registerManagement, parseCsv, parseXlsx, prepareSheet, normalizeRows, createManagementStore, parseStage, parseProgress, SOURCE_URL };
