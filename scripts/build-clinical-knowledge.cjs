#!/usr/bin/env node
// 构建「临床医学知识专家」知识包：疾病百科 + 卫健委临床路径 → 分段 → 向量（360 网关 text-embedding-3-large，取前 1024 维，int8）。
// 产物写到 clinical-knowledge/（见 package.json extraResources）：
//   chunks.json  分段正文 + 出处
//   vectors.bin  Int8 向量，每段 DIM 字节；scales 存在 chunks.json 里
//   manifest.json 资料清单、模型、维度、构建时间
// 用法：node scripts/build-clinical-knowledge.cjs [--downloads ~/Documents/临床知识资料-下载] [--no-embed]
// 增量：正文与向量按段内容哈希缓存在 .clinical-knowledge-cache/，重跑只算新增段。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { extractFileText } = require('../src/main/knowledge-retrieval');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'clinical-knowledge');
const CACHE = path.join(ROOT, '.clinical-knowledge-cache');
const MODEL = 'text-embedding-3-large';
const DIM = 1024;
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const DOWNLOADS = arg('--downloads', path.join(os.homedir(), 'Documents', '临床知识资料-下载'));
const DISEASE_FILE = arg('--diseases', '/Volumes/lu-mac/医疗行业知识/医药知识图谱自动问答系统/QASystemOnMedicalKG-master/data/medical.json');
const PATHWAY_DIR = path.join(DOWNLOADS, '临床路径');
const NO_EMBED = process.argv.includes('--no-embed');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const clean = (text) => String(text).replace(/\u0000/g, '').replace(/[ \t　]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// ── 疾病百科：一行一种疾病（JSON Lines），转成「一种病一段」 ──
// 短而关键的字段（症状、检查、并发症、科室）放前面，保证落在第一段；简介、病因、预防这类长文放后面
const DISEASE_FIELDS = [
  ['category', '所属科室'], ['cure_department', '就诊科室'], ['symptom', '常见症状'], ['check', '检查项目'],
  ['acompany', '并发症'], ['cure_way', '治疗方式'], ['cure_lasttime', '治疗周期'], ['cured_prob', '治愈率'],
  ['get_prob', '发病概率'], ['easy_get', '易感人群'], ['get_way', '传播/发病方式'], ['yibao_status', '医保'],
  ['recommand_drug', '常用药物'], ['common_drug', '参考用药'],
  ['desc', '疾病简介'], ['cause', '病因'], ['prevent', '预防'],
  ['do_eat', '宜吃'], ['not_eat', '忌吃'], ['recommand_eat', '推荐食谱'],
];
const listText = (v) => (Array.isArray(v) ? v.filter(Boolean).join('、') : String(v || '').trim());

function diseaseChunks() {
  if (!fs.existsSync(DISEASE_FILE)) { console.warn('疾病库缺失：' + DISEASE_FILE); return []; }
  const pieces = [];
  for (const line of fs.readFileSync(DISEASE_FILE, 'utf8').split('\n')) {
    const raw = line.trim();
    if (!raw) continue;
    let d; try { d = JSON.parse(raw); } catch { continue; }
    const name = String(d.name || '').trim();
    if (!name) continue;
    const lines = [`【疾病】${name}`];
    for (const [key, label] of DISEASE_FIELDS) {
      const value = listText(d[key]);
      if (value) lines.push(`${label}：${value}`);
    }
    // 药物明细只保留药名，去掉厂商前缀里的多余空格
    const drugs = listText(d.drug_detail);
    if (drugs) lines.push(`在售药品（厂商-商品名）：${drugs}`);
    const body = lines.join('\n');
    // 单种病控制在 2000 字内，超长的（简介+病因+预防特别长）按 1800 字切开
    for (let off = 0; off < body.length; off += 1800) {
      pieces.push({
        doc: 'disease', title: `疾病百科：${name}`, topic: '疾病百科',
        section: name, text: off ? `【疾病】${name}（续）\n${body.slice(off, off + 1800)}` : body.slice(0, 1800), pageFrom: null, pageTo: null,
      });
    }
  }
  return pieces;
}

// ── 临床路径：每份 PDF 按页标记切段 ──
async function pathwayPieces() {
  if (!fs.existsSync(PATHWAY_DIR)) { console.warn('临床路径目录缺失：' + PATHWAY_DIR); return { pieces: [], docs: [] }; }
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.pdf$/i.test(entry.name)) files.push(full);
    }
  };
  walk(PATHWAY_DIR);
  files.sort();
  const pieces = [], docs = [];
  for (const [index, file] of files.entries()) {
    const rel = path.relative(PATHWAY_DIR, file).replace(/\\/g, '/');
    const edition = rel.split('/')[0] || '临床路径';
    const title = path.basename(file, path.extname(file));
    const id = `p${String(index + 1).padStart(3, '0')}`;
    const stat = fs.statSync(file);
    const cacheFile = path.join(CACHE, 'text', sha(file + stat.size + stat.mtimeMs) + '.txt');
    let text;
    if (fs.existsSync(cacheFile)) text = fs.readFileSync(cacheFile, 'utf8');
    else {
      const r = await extractFileText(file, 'pdf');
      if (r.status !== 'ready') { console.warn(`跳过（无法读正文）：${rel}`); continue; }
      text = clean(r.text);
      fs.mkdirSync(path.join(CACHE, 'text'), { recursive: true });
      fs.writeFileSync(cacheFile, text);
    }
    // 按「## 第 N 页」切页，再按每 2 页合并成一段（临床路径一份通常 2~6 页）
    const pages = [];
    let page = null, buf = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^##\s*第\s*(\d+)\s*页\s*$/);
      if (m) { if (buf.length) pages.push({ page, lines: buf }); page = Number(m[1]); buf = []; continue; }
      if (line.trim()) buf.push(line.trim());
    }
    if (buf.length) pages.push({ page, lines: buf });
    for (let i = 0; i < pages.length; i += 2) {
      const group = pages.slice(i, i + 2);
      const body = group.map((p) => p.lines.join('\n')).join('\n');
      if (body.replace(/\s/g, '').length < 40) continue;
      pieces.push({
        doc: id, title, topic: `临床路径 ${edition}`, section: title,
        text: body, pageFrom: group[0].page, pageTo: group[group.length - 1].page,
      });
    }
    docs.push({ id, title, topic: `临床路径 ${edition}`, file: rel, chars: text.length, chunks: pieces.filter((p) => p.doc === id).length });
    console.log(`${id} ${String(pieces.filter((p) => p.doc === id).length).padStart(3)} 段  ${title}`);
  }
  return { pieces, docs };
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

  const diseases = diseaseChunks();
  const { pieces: pathways, docs: pathwayDocs } = await pathwayPieces();
  const diseaseDoc = { id: 'disease', title: `常见疾病百科（${new Set(diseases.map((p) => p.section)).size} 种）`, topic: '疾病百科', perSection: true, file: path.basename(DISEASE_FILE), chars: diseases.reduce((n, p) => n + p.text.length, 0), chunks: diseases.length };
  const all = [...diseases, ...pathways];
  const docs = diseases.length ? [diseaseDoc, ...pathwayDocs] : pathwayDocs;
  console.log(`共 ${docs.length} 份资料，${all.length} 段，${all.reduce((n, c) => n + c.text.length, 0)} 字`);

  const vectors = new Int8Array(all.length * DIM), scales = new Float32Array(all.length);
  if (!NO_EMBED) {
    const key = apiKey();
    const todo = [];
    all.forEach((c, i) => {
      const f = path.join(CACHE, 'vec', sha(MODEL + DIM + c.title + c.text) + '.bin');
      if (fs.existsSync(f)) { const buf = fs.readFileSync(f); scales[i] = buf.readFloatLE(0); vectors.set(new Int8Array(buf.buffer, buf.byteOffset + 4, DIM), i * DIM); }
      else todo.push(i);
    });
    console.log(`需要向量化 ${todo.length} 段（缓存命中 ${all.length - todo.length}）`);
    const BATCH = 48, PARALLEL = 4;
    let done = 0;
    const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    const worker = async () => {
      while (batches.length) {
        const batch = batches.shift();
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

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'chunks.json'), JSON.stringify(all.map((c, i) => ({ doc: c.doc, p: [c.pageFrom, c.pageTo], s: c.section || undefined, t: c.text,
    v: NO_EMBED ? -1 : i, k: NO_EMBED ? undefined : +scales[i].toPrecision(6) }))));
  fs.writeFileSync(path.join(OUT, 'vectors.bin'), Buffer.from(vectors.buffer));
  fs.writeFileSync(path.join(OUT, 'codes.json'), '{}');
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version: 1, model: MODEL, dim: DIM, quantization: 'int8-per-row', builtAt: new Date().toISOString(),
    embedded: !NO_EMBED, stats: { chunks: all.length, diseases: new Set(diseases.map((p) => p.section)).size, pathways: pathwayDocs.length },
    documents: docs }, null, 2));
  const size = (f) => (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1) + 'MB';
  console.log(`已写入 clinical-knowledge/：chunks.json ${size('chunks.json')}，vectors.bin ${size('vectors.bin')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
