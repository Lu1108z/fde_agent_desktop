#!/usr/bin/env node
// 构建「医疗行业专家」知识包：资料 → 正文 → 分段 → 向量（360 网关 text-embedding-3-large，取前 1024 维，int8 量化）。
// 产物写到 med-knowledge/（随安装包发布，见 package.json extraResources）：
//   chunks.json  分段正文 + 出处（文档、页码）
//   vectors.bin  Int8 向量，每段 DIM 字节；scales 存在 chunks.json 里
//   manifest.json 资料清单、模型、维度、构建时间
// 用法：node scripts/build-med-knowledge.cjs [--source /Volumes/lu-mac/医疗行业知识] [--downloads ~/Documents/医疗专家资料-下载] [--no-embed]
// 增量：正文与向量按段内容哈希缓存在 .med-knowledge-cache/，重跑只算新增段。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { extractFileText } = require('../src/main/knowledge-retrieval');
const { parseDrg, parseDip, parseServiceItems, DIAG, PROC } = require('../src/main/med-codes');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'med-knowledge');
const CACHE = path.join(ROOT, '.med-knowledge-cache');
const MODEL = 'text-embedding-3-large';
const DIM = 1024;
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const SOURCE = arg('--source', '/Volumes/lu-mac/医疗行业知识');
const DOWNLOADS = arg('--downloads', path.join(os.homedir(), 'Documents', '医疗专家资料-下载'));

// 只收公开标准和官方文件；厂商资料（东华 HIS 表结构）、项目内部文档、爬虫疾病库不进安装包。
const DOCUMENTS = [
  ...[
    ['1', '总则'], ['2', '标识'], ['3', '人口学及社会经济学特征'], ['4', '健康史'], ['5', '健康危险因素'], ['6', '主诉与症状'],
    ['7', '体格检查'], ['8', '临床辅助检查'], ['9', '医学诊断'], ['10', '实验室检查'], ['11', '医学评估'], ['12', '计划与干预'],
    ['13', '卫生健康费用'], ['14', '卫生健康机构'], ['15', '卫生健康人员'], ['16', '药品与医疗器械'], ['17', '卫生健康管理'],
  ].map(([n, name]) => ({ file: `${SOURCE}/数据标准/行业标准/数据元/卫生健康信息数据元目录（第${n}部分+${name}）.pdf`,
    title: `WS/T 363.${n}—2023 卫生健康信息数据元目录 第${n}部分：${name}`, topic: '数据标准', elements: true })),
  { file: `${SOURCE}/数据标准/行业标准/数据元值域/卫生健康信息数据元值域代码+第1部分+总则.pdf`, title: 'WS/T 364.1—2023 卫生健康信息数据元值域代码 第1部分：总则', topic: '数据标准' },
  { file: `${SOURCE}/数据标准/行业标准/数据集/卫生健康信息数据集分类与编码规则+306-2023 (1).pdf`, title: 'WS/T 306—2023 卫生健康信息数据集分类与编码规则', topic: '数据标准' },
  { file: `${SOURCE}/数据标准/数据安全（通用标准）/分类分级/数据分类分级规则+GBT%2B43697-2024.pdf`, title: 'GB/T 43697—2024 数据安全技术 数据分类分级规则', topic: '数据安全', spaced: true },
  { file: `${SOURCE}/数据标准/数据安全（通用标准）/敏感个人信息/数据安全技术敏感个人信息处理安全要求GBT455742025-20250523.pdf`, title: 'GB/T 45574—2025 数据安全技术 敏感个人信息处理安全要求', topic: '数据安全', spaced: true },
  { file: `${SOURCE}/电子病历评级/附件1：XXXX医院电子病历评级调研内容V2.0.xlsx`, title: '电子病历系统应用水平分级评价 调研内容（评估项目明细）', topic: '电子病历评级', scrub: [/上海森亿医疗科技有限公司\s*/g, /https?:\/\/www\.synyi\.com\s*/g] },
  { file: `${DOWNLOADS}/DRG_DIP/1.按病组（DRG）付费3.0版分组方案（更新）.pdf`, title: '按病组（DRG）付费3.0版分组方案（医保发〔2026〕22号附件1）', topic: 'DRG/DIP', codes: 'drg' },
  { file: `${DOWNLOADS}/DRG_DIP/2.按病种分值（DIP）付费3.0版分组方案（更新）.pdf`, title: '按病种分值（DIP）付费3.0版分组方案（医保发〔2026〕22号附件2）', topic: 'DRG/DIP', codes: 'dip' },
  { file: `${DOWNLOADS}/DRG_DIP/国家医疗保障局关于印发按病组和病种分值付费3.0版分组方案并做好落地实施相关工作的通知.txt`, title: '关于印发按病组和病种分值付费3.0版分组方案并做好落地实施相关工作的通知（医保发〔2026〕22号）', topic: 'DRG/DIP' },
  { file: `${DOWNLOADS}/DRG_DIP/国家医疗保障局关于印发《医疗保障按病种付费管理暂行办法》的通知.txt`, title: '医疗保障按病种付费管理暂行办法（2025）', topic: 'DRG/DIP' },
  { file: `${DOWNLOADS}/DRG_DIP/国家医疗保障局办公室关于印发《按病种付费医疗保障经办管理规程（2025版）》的通知.txt`, title: '按病种付费医疗保障经办管理规程（2025版）', topic: 'DRG/DIP' },
  { file: `${DOWNLOADS}/DRG_DIP/国家医疗保障局办公室关于印发国家医疗保障按病种分值付费（DIP）技术规范和DIP病种目录库（1.0版）的通知.正文.txt`, title: '关于印发DIP技术规范和DIP病种目录库（1.0版）的通知（2020，历史版本）', topic: 'DRG/DIP' },
  { file: `${DOWNLOADS}/医疗服务项目/国家卫健委_全国医疗服务项目技术规范.pdf`, title: '全国医疗服务项目技术规范（2023年版）', topic: '医疗服务项目', codes: 'service' },
  { file: `${DOWNLOADS}/医保编码标准/国家医疗保障局办公室关于贯彻执行15项医疗保障信息业务编码标准的通知.正文.txt`, title: '关于贯彻执行15项医疗保障信息业务编码标准的通知（医保办发〔2020〕51号）', topic: '医保' },
  { file: `${DOWNLOADS}/医保编码标准/国家医疗保障局关于进一步深化推进医保信息化标准化工作的通知.正文.txt`, title: '关于进一步深化推进医保信息化标准化工作的通知（医保发〔2022〕8号）', topic: '医保' },
  { file: `${DOWNLOADS}/医保编码标准/国家医疗保障局办公室关于进一步做好医保疾病诊断、手术操作分类与代码应用工作的通知.txt`, title: '关于进一步做好医保疾病诊断、手术操作分类与代码应用工作的通知（2026）', topic: '医保' },
];

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const clean = (text) => String(text).replace(/\u0000/g, '').replace(/[ \t　]+/g, ' ').replace(/ ?\n ?/g, '\n')
  // PDF 抽出来的数字常被拆成「8 2 5」「4 9 2」，目录行带一长串「.... ....」页码引导点
  .replace(/\d+(?: \d+)+/g, (m, offset, s) => (/[一-鿿，、（] ?$/.test(s.slice(Math.max(0, offset - 2), offset)) && /^ ?[一-鿿，、）%]/.test(s.slice(offset + m.length, offset + m.length + 2)) ? m.replace(/ /g, '') : m))
  .replace(/\.{3}[. ]*(\d+)$/gm, '…… $1')
  .replace(/\n{3,}/g, '\n\n').trim();

// 数据元目录每条是「标识符 / 名称 / 定义 / 类型 / 格式 / 允许值」多行，分行后模型会把名称和相邻条目的标识符配错，这里并成一行。
// 跨页的条目记在起始页；页眉（WS/T 363.x—2023）和页码行丢弃。
function joinElements(text) {
  const out = []; let rec = null, closed = false, held = [];
  const flush = () => { if (rec) out.push(rec.join(' ｜ ')); out.push(...held); rec = null; closed = false; held = []; };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (/^数据元标识符 DE\d/.test(t)) { flush(); rec = [t]; continue; }
    if (!rec) { out.push(line); continue; }
    if (/^## 第/.test(t)) { held.push(line); continue; }
    if (!t || /^WS\/T 363/.test(t) || /^\d{1,3}$/.test(t)) continue;
    if (/^(数据元名称|定义|数据元值的数据类型|表示格式|数据元允许值)( |$)/.test(t)) { rec.push(t); closed = t.startsWith('数据元允许值'); continue; }
    // 允许值之后：明显不属于本条（索引行、附录、字母分隔）就结束；否则是上一字段换行的续行
    if (closed && (/DE\d{2}\.|^附|^索引|^参考|^[A-Z]$/.test(t) || rec.join('').length > 500)) { flush(); out.push(line); continue; }
    rec[rec.length - 1] += t;
  }
  flush();
  return out.join('\n');
}

// 按页（## 第 N 页）/ 工作表 / 段落切分，每段约 600~900 字，相邻段重叠 120 字，保证跨页的条目不被切断后找不到。
function chunk(text, doc) {
  const pieces = [];
  let page = null, section = '';
  const blocks = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(/^##\s+(?:第\s*(\d+)\s*页|工作表：(.+))\s*$/);
    if (m) { if (m[1]) page = Number(m[1]); else section = m[2]; continue; }
    if (raw.trim()) blocks.push({ line: raw.trim(), page, section });
  }
  let buf = [], len = 0;
  const flush = () => {
    if (!buf.length) return;
    const body = buf.map((b) => b.line).join('\n');
    const pages = buf.map((b) => b.page).filter(Boolean);
    pieces.push({ text: body, pageFrom: pages[0] || null, pageTo: pages[pages.length - 1] || null, section: buf[0].section || '' });
    // 保留尾部做重叠
    const tail = []; let t = 0;
    for (let i = buf.length - 1; i >= 0 && t < 120; i--) { tail.unshift(buf[i]); t += buf[i].line.length; }
    buf = tail.length < buf.length ? tail : []; len = buf.reduce((n, b) => n + b.line.length, 0);
  };
  for (const b of blocks) {
    if (b.section !== (buf[0]?.section ?? b.section)) { flush(); buf = []; len = 0; }
    for (let off = 0; off < b.line.length; off += 800) {
      const part = { ...b, line: b.line.slice(off, off + 800) };
      if (len + part.line.length > 900 && len > 300) flush();
      buf.push(part); len += part.line.length;
    }
  }
  flush();
  return pieces.filter((p) => p.text.replace(/\s/g, '').length >= 30)
    .map((p) => ({ ...p, doc: doc.id, title: doc.title, topic: doc.topic }));
}

function apiKey() {
  if (process.env.MED_EMBED_KEY) return process.env.MED_EMBED_KEY;
  const home = process.env.HERMES_HOME || path.join(os.homedir(), '.product-lobster');
  try {
    for (const p of JSON.parse(fs.readFileSync(path.join(home, 'gateway-profiles.json'), 'utf8')).profiles || []) if (/360/.test(p.baseUrl || '') && p.apiKey) return p.apiKey;
  } catch {}
  throw Error('没有找到 360 API Key（可设 MED_EMBED_KEY）');
}

async function embedBatch(key, inputs) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('https://api.360.cn/v1/embeddings', { method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, input: inputs, dimensions: DIM }) });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.data)) throw Error(json?.error?.message || `HTTP ${res.status}`);
      return json.data.sort((a, b) => a.index - b.index).map((d) => normalize(d.embedding.slice(0, DIM)));
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}
function normalize(v) { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); }
function quantize(v) { const scale = Math.max(...v.map(Math.abs)) / 127 || 1; return { q: Int8Array.from(v, (x) => Math.round(x / scale)), scale }; }

async function main() {
  fs.mkdirSync(path.join(CACHE, 'text'), { recursive: true });
  fs.mkdirSync(path.join(CACHE, 'vec'), { recursive: true });
  const docs = [], all = [], missing = [], codeTables = {};
  for (const [i, d] of DOCUMENTS.entries()) {
    const doc = { ...d, id: `d${String(i + 1).padStart(2, '0')}` };
    if (!fs.existsSync(doc.file)) { missing.push(doc.file); continue; }
    const stat = fs.statSync(doc.file);
    const cacheFile = path.join(CACHE, 'text', sha(doc.file + stat.size + stat.mtimeMs) + '.txt');
    let text;
    if (fs.existsSync(cacheFile)) text = fs.readFileSync(cacheFile, 'utf8');
    else {
      const ext = path.extname(doc.file).slice(1).toLowerCase();
      const r = await extractFileText(doc.file, ext);
      if (r.status !== 'ready') { missing.push(`${doc.file}（${r.notice}）`); continue; }
      text = clean(r.text);
      fs.writeFileSync(cacheFile, text);
    }
    for (const re of doc.scrub || []) text = text.replace(re, '');
    // 官网正文的小数点是私有区字符（U+E010，「3.0版」显示成「30版」），PDF 的项目符号也在私有区
    text = text.replace(/\ue010/g, '.').replace(/[\uf0b7\uf06c]/g, '•');
    // GB/T 的 PDF 字字之间带空格（「个 人 权 益」），引用和关键词都对不上；页码标记行要保留
    if (doc.elements) text = joinElements(text);
    if (doc.spaced) text = text.replace(/^(?!## ).*$/gm, (l) => l.replace(/ /g, ''));
    if (doc.codes === 'drg') codeTables.drg = { doc: doc.id, ...parseDrg(text) };
    if (doc.codes === 'dip') codeTables.dip = { doc: doc.id, ...parseDip(text) };
    // 项目表 17 列被 PDF 拆得很碎：解析成「一个项目一行」再分段，名称、内涵、人力、分类才在同一段里
    if (doc.codes === 'service') { const r = parseServiceItems(text); codeTables.service = { doc: doc.id, items: r.items }; text = r.text; }
    const pieces = chunk(text, doc);
    // 分组方案的总述句（「分为 492 个核心病组」「共包括 825 个细分组」）夹在长目录里，单独抽成一段，保证能被检索到
    if (doc.codes && doc.codes !== 'service') {
      const lead = text.split('\n').filter((l) => /^(分为|共包括|共分为|下表所列|全部\s*\S+\s*列表参见)|个核心病组|个细分组|个基层病|个核心病种|个综合病种/.test(l.trim())).slice(0, 12);
      if (lead.length) pieces.unshift({ text: `【${doc.title} 概况（原文摘录）】\n${lead.join('\n')}`, pageFrom: null, pageTo: null, section: '概况', doc: doc.id, title: doc.title, topic: doc.topic });
    }
    // 技术规范各章项目数只在使用说明表 1 和各章「本章说明」里，同样抽成概况段
    if (doc.codes === 'service') {
      const lead = text.split('\n').filter((l) => /(?:^|\s)[一二三四五六七八九十]+、\S+ \d+\s*$|^总 ?计 \d+|共计 ?\d+ ?项/.test(l.trim())).slice(0, 30);
      if (lead.length) pieces.unshift({ text: `【${doc.title} 各章项目数（原文摘录）】\n${lead.join('\n')}`, pageFrom: null, pageTo: null, section: '概况', doc: doc.id, title: doc.title, topic: doc.topic });
    }
    // 分组方案里大段「编码 名称」清单交给 codes.json 精确查；这些段仍保留给关键词检索，但不做向量（e: false）
    if (doc.codes && doc.codes !== 'service') for (const p of pieces) { const ls = p.text.split('\n'); p.embed = ls.filter((l) => DIAG.test(l) || PROC.test(l)).length / ls.length <= 0.6; }
    docs.push({ id: doc.id, title: doc.title, topic: doc.topic, file: path.basename(doc.file), chars: text.length, chunks: pieces.length });
    all.push(...pieces);
    console.log(`${doc.id} ${pieces.length.toString().padStart(5)} 段 ${String(text.length).padStart(8)} 字  ${doc.title}`);
  }
  if (missing.length) console.warn('缺失或无法解析：\n  ' + missing.join('\n  '));
  console.log(`共 ${docs.length} 份资料，${all.length} 段（向量 ${all.filter((c) => c.embed !== false).length} 段），${all.reduce((n, c) => n + c.text.length, 0)} 字`);

  const vectors = new Int8Array(all.length * DIM), scales = new Float32Array(all.length);
  if (!process.argv.includes('--no-embed')) {
    const key = apiKey();
    const todo = [];
    all.forEach((c, i) => {
      if (c.embed === false) return;
      const f = path.join(CACHE, 'vec', sha(MODEL + DIM + c.title + c.text) + '.bin');
      if (fs.existsSync(f)) { const buf = fs.readFileSync(f); scales[i] = buf.readFloatLE(0); vectors.set(new Int8Array(buf.buffer, buf.byteOffset + 4, DIM), i * DIM); }
      else todo.push(i);
    });
    console.log(`需要向量化 ${todo.length} 段（缓存命中 ${all.filter((c) => c.embed !== false).length - todo.length}）`);
    const BATCH = 48, PARALLEL = 4;
    let done = 0;
    const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    const worker = async () => {
      while (batches.length) {
        const batch = batches.shift();
        // 向量输入带上文档标题，让「属于哪个标准」也参与语义匹配
        const embs = await embedBatch(key, batch.map((i) => `${all[i].title}\n${all[i].text}`));
        embs.forEach((v, k) => {
          const i = batch[k], { q, scale } = quantize(v);
          vectors.set(q, i * DIM); scales[i] = scale;
          const buf = Buffer.alloc(4 + DIM); buf.writeFloatLE(scale, 0); Buffer.from(q.buffer).copy(buf, 4);
          fs.writeFileSync(path.join(CACHE, 'vec', sha(MODEL + DIM + all[i].title + all[i].text) + '.bin'), buf);
        });
        done += batch.length; process.stdout.write(`\r  已向量化 ${done}/${todo.length}`);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    if (todo.length) process.stdout.write('\n');
  }

  // 只为参与向量检索的段落存向量；v 是该段在 vectors.bin 里的行号，-1 表示只走关键词
  const order = all.map((c, i) => (c.embed === false ? -1 : i)).filter((i) => i >= 0);
  const row = new Map(order.map((i, r) => [i, r]));
  const packed = new Int8Array(order.length * DIM);
  order.forEach((i, r) => packed.set(vectors.subarray(i * DIM, (i + 1) * DIM), r * DIM));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'chunks.json'), JSON.stringify(all.map((c, i) => ({ doc: c.doc, p: [c.pageFrom, c.pageTo], s: c.section || undefined, t: c.text,
    v: row.has(i) ? row.get(i) : -1, k: row.has(i) ? +scales[i].toPrecision(6) : undefined }))));
  fs.writeFileSync(path.join(OUT, 'vectors.bin'), Buffer.from(packed.buffer));
  fs.writeFileSync(path.join(OUT, 'codes.json'), JSON.stringify(codeTables));
  console.log(`编码表：DRG 细分组 ${codeTables.drg?.drgs.length || 0}，ADRG ${codeTables.drg?.adrgs.length || 0}，编码 ${codeTables.drg?.codes.length || 0}；DIP 病种 ${codeTables.dip?.diseases.length || 0}；医疗服务项目 ${codeTables.service?.items.length || 0}`);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version: 1, model: MODEL, dim: DIM, quantization: 'int8-per-row', builtAt: new Date().toISOString(),
    embedded: !process.argv.includes('--no-embed'),
    stats: { chunks: all.length, drgCodes: codeTables.drg?.codes.length || 0, adrgs: codeTables.drg?.adrgs.length || 0, drgs: codeTables.drg?.drgs.length || 0, dipDiseases: codeTables.dip?.diseases.length || 0, serviceItems: codeTables.service?.items.length || 0 },
    documents: docs }, null, 2));
  const size = (f) => (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1) + 'MB';
  console.log(`已写入 med-knowledge/：chunks.json ${size('chunks.json')}，vectors.bin ${size('vectors.bin')}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
