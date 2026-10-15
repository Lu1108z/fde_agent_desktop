const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { parseCsv, parseXlsx, prepareSheet, normalizeRows, createManagementStore } = require('../src/main/project-management');

test('CSV handles quoted commas, multiline cells, blank progress and Chinese stages', () => {
  const rows = parseCsv('\uFEFF项目名称,所需智能体,当前阶段,当前阶段进度,负责人,下一步\r\n医院,运营智能体,阶段三 需求确认-智能体设计,50%,负责人,"确认数据,字段\n与客户沟通"\r\n医院,健康智能体,未开始,,,\r\n');
  const sheet = prepareSheet({ name: '项目进度', rows });
  const parsed = normalizeRows(sheet, sheet.mapping);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].stage, 3);
  assert.equal(parsed.records[0].progress, 50);
  assert.equal(parsed.records[0].action, '确认数据,字段\n与客户沟通');
  assert.equal(parsed.records[1].stage, 0);
  assert.equal(parsed.records[1].progress, null);
  assert.notEqual(parsed.records[0].id, parsed.records[1].id);
  assert.throws(() => parseCsv('项目名称\n"未闭合'), /引号/);
});

test('XLSX resolves sheet relationships, shared/inline strings, sparse cells, percentage and dates', async () => {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="进度" r:id="rId1" /></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet2.xml" /></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>医院项目</t></si></sst>');
  zip.file('xl/styles.xml', '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="10"/><xf numFmtId="14"/></cellXfs></styleSheet>');
  zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>项目名称</t></is></c><c r="B1" t="inlineStr"><is><t>当前阶段进度</t></is></c><c r="D1" t="inlineStr"><is><t>开始时间</t></is></c></row><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" s="1"><v>0.6</v></c><c r="D2" s="2"><v>46266</v></c></row></sheetData></worksheet>');
  const sheets = await parseXlsx(await zip.generateAsync({ type: 'nodebuffer' }));
  const sheet = prepareSheet(sheets[0]);
  const { records } = normalizeRows(sheet, sheet.mapping);
  assert.equal(records[0].project, '医院项目');
  assert.equal(records[0].progress, 60);
  assert.equal(records[0].startDate, '2026-09-01');
});

test('Reimport preserves unique project links, separates agents, resets ambiguous duplicates and rejects stale revision', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fde-management-'));
  try {
    const store = createManagementStore(path.join(dir, 'projects.json'));
    const parse = text => { const sheet = prepareSheet({ name: '进度', rows: parseCsv(text) }); return normalizeRows(sheet, sheet.mapping); };
    const first = parse('项目名称,所需智能体,当前阶段进度\n医院,运营,50%\n医院,健康,40%');
    const initial = store.replace(first, { filename: 'test.csv' }, 0);
    store.link(initial.records[0].id, 'project-123');
    const updated = store.replace(parse('项目名称,所需智能体,当前阶段进度\n医院,健康,60%\n医院,运营,70%'), {}, 2);
    assert.equal(updated.records[0].linkedSlug, '');
    assert.equal(updated.records[1].linkedSlug, 'project-123');
    assert.equal(updated.records[1].progress, 70);
    assert.throws(() => store.replace(first, {}, 0), /数据已更新/);
    const ambiguous = store.replace(parse('项目名称,所需智能体\n医院,运营\n医院,运营'), {}, 3);
    assert.ok(ambiguous.records.every(row => !row.linkedSlug));
    assert.equal(new Set(ambiguous.records.map(row => row.id)).size, 2);
    assert.ok(ambiguous.warnings.length);
    assert.ok(fs.existsSync(path.join(dir, 'projects.json.bak')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Unknown stages, invalid percentages and invalid dates remain unset with warnings', () => {
  const sheet = prepareSheet({ name: '进度', rows: parseCsv('项目名称,当前阶段,当前阶段进度,结束时间\n项目甲,审核中,120%,2026-02-30') });
  const parsed = normalizeRows(sheet, sheet.mapping);
  assert.equal(parsed.records[0].stage, null);
  assert.equal(parsed.records[0].progress, null);
  assert.equal(parsed.records[0].endDate, '');
  assert.ok(parsed.warnings.length);
});
