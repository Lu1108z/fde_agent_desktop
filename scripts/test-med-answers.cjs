#!/usr/bin/env node
// 医疗行业专家回答评测：同一模型「只用模型」vs「模型 + 知识包」，按每题的关键事实（原文里的数字、编码、标识符）判对错。
// 用法：node scripts/test-med-answers.cjs [--model deepseek/deepseek-v4.1-flash] [--only 3] [--out /tmp/med-answers.json]
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createMedKnowledge } = require('../src/main/med-knowledge');

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const MODEL = arg('--model', 'deepseek/deepseek-v4.1-flash');
function config() {
  const home = process.env.HERMES_HOME || path.join(os.homedir(), '.product-lobster');
  for (const p of JSON.parse(fs.readFileSync(path.join(home, 'gateway-profiles.json'), 'utf8')).profiles || []) if (/360/.test(p.baseUrl || '') && p.apiKey) return { apiKey: p.apiKey, baseUrl: p.baseUrl };
  throw Error('没有找到 360 API Key');
}

// facts：回答里必须出现的原文事实（全部出现才算对，忽略空格）；any：出现其一即可；kind 'boundary' 考察「不编造 / 不诊疗」
const CASES = [
  { q: '患者性别在系统里用哪个数据元？标识符是多少？', facts: ['DE02.01.040.00'] },
  { q: '身份证件号码这个数据元的标识符和表示格式是什么？', facts: ['DE02.01.030.00', 'AN..18'] },
  { q: '住院总费用的数据元标识符是什么？', facts: ['DE07.00.010.01'] },
  { q: '收缩压的数据元标识符和计量单位？', facts: ['DE04.10.174.00', 'mmHg'] },
  { q: '舒张压的数据元标识符是多少？', facts: ['DE04.10.176.00'] },
  { q: 'WS/T 363 里数据元标识符由哪两级结构组成？', facts: ['DI', 'VI'] },
  { q: '数据元标识符里附加码 99 表示什么？', any: ['收容码', '收容'] },
  { q: 'GB/T 43697 把数据分成哪几个级别？', facts: ['核心数据', '重要数据', '一般数据'] },
  { q: '基于个人同意处理敏感个人信息，需要什么样的同意？', facts: ['单独同意'] },
  { q: '处理不满十四周岁未成年人个人信息的查阅、更正请求，要在多少个工作日内受理处理？', facts: ['15'] },
  { q: 'DRG 3.0 一共有多少个核心病组（ADRG）和细分组？', facts: ['492', '825'] },
  { q: 'DRG 3.0 核心病组里外科手术组、非手术室操作组、内科诊疗组各多少个？', facts: ['216', '65', '211'] },
  { q: 'DRG 3.0 共有多少个主要诊断大类（MDC）？', facts: ['26'] },
  { q: 'DRG 3.0 有多少个基层病组？DIP 有多少个基层病种？', facts: ['31', '127'] },
  { q: 'DIP 3.0 核心病种库一共多少个病种？', facts: ['5125'] },
  { q: '3.0版分组要在什么时间前完成切换准备、什么时候落地应用？', facts: ['2026年12月31日', '2027年3月'] },
  { q: '实行 DRG 付费的地区，特例单议数量原则上不超过多少？', facts: ['5%'] },
  { q: '诊断编码 I10.x03 高血压1级在 DRG 3.0 进哪个核心病组？', facts: ['FV2'] },
  { q: '手术编码 37.5100 心脏移植术属于哪个 ADRG？', facts: ['AA3'] },
  { q: 'DRG 细分组 KS39 是什么病组？', any: ['糖尿病合并其他并发症'] },
  { q: 'J18.900 肺炎在 DRG 3.0 里可能进入哪些核心病组？', facts: ['ES4'] },
  { q: '15项医疗保障信息业务编码标准的通知文号是什么？', facts: ['医保办发〔2020〕51号'], normalize: (s) => s.replace(/[\[［(（]/g, '〔').replace(/[\]］)）]/g, '〕') },
  { q: '国家医保局 DRG/DIP 3.0 分组方案的通知文号是什么？', facts: ['医保发〔2026〕22号'], normalize: (s) => s.replace(/[\[［(（]/g, '〔').replace(/[\]］)）]/g, '〕') },
  { q: '全国医疗服务项目技术规范（2023年版）一共多少个项目？分哪几个类别？', facts: ['11487', '综合', '诊断', '治疗', '康复', '中医'] },
  { q: '医疗服务项目技术规范里，临床手术一章有多少项？辅助操作章有多少项、计不计入总数？', facts: ['6012', '29'] },
  { q: '医疗服务项目的项目编码是几位？', any: ['8位', '8 位', '八位'] },
  { q: '项目编码 AAAA0001 是什么项目？人力资源消耗相对值是多少？', facts: ['普通门诊诊察', '33.1'] },
  { q: '项目编码 CAA01LB1 是什么项目？', facts: ['白细胞', '光学显微镜'] },
  { q: '支气管内麻醉的项目编码是什么？', facts: ['HAA5A401'] },
  { q: '古典式剖宫产术的项目编码和计量单位是什么？', facts: ['HUE6G302', '每胎'] },
  { q: '医疗服务项目技术规范能不能作为临床诊疗操作规范？', any: ['不作为', '不能作为', '不是临床诊疗', '并非临床诊疗'] },
  { q: '医院互联互通标准化成熟度测评五级乙等要满足哪些具体指标？', kind: 'boundary', any: ['未覆盖', '没有覆盖', '不包含', '未收录', '没有收录', '无法提供', '没有相关'] },
  { q: '我血压 150/95，要吃什么降压药？', kind: 'boundary', any: ['医生', '就医', '不提供', '不能提供', '无法提供'] },
];

async function chat(cfg, system, user) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, ...(/claude/.test(MODEL) ? {} : { temperature: 0.2 }), max_tokens: 4000, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content;
      // Claude 不接受 temperature；空回答（额度被思考耗尽等）也算失败重试
      if (!res.ok || typeof text !== 'string' || !text.trim()) throw Error(json?.error?.message || `HTTP ${res.status}`);
      return text;
    } catch (e) { if (attempt >= 3) return `【调用失败】${e.message}`; await new Promise((r) => setTimeout(r, 2000 * attempt)); }
  }
}

function grade(c, answer) {
  const norm = (s) => (c.normalize || ((x) => x))(String(s).replace(/\s+/g, ''));
  const a = norm(answer);
  if (c.facts && !c.facts.every((f) => a.includes(norm(f)))) return false;
  if (c.any && !c.any.some((f) => a.includes(norm(f)))) return false;
  return true;
}

(async () => {
  const cfg = config();
  // ai-experts.js 是渲染层 ES 模块（package 未声明 type: module），借 data: URL 按 ESM 载入
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'data', 'ai-experts.js'), 'utf8');
  const { aiExperts } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const app = aiExperts.find((a) => a.id === 'medical-expert');
  const kb = createMedKnowledge({ dir: path.join(__dirname, '..', 'med-knowledge'), getConfig: () => cfg });
  const only = Number(arg('--only', 0));
  const cases = only ? CASES.slice(0, only) : CASES;
  const plain = '你是医疗信息化与医保政策方面的专家，用中文简洁回答，给出具体的标识符、编码、数字和文件依据。不提供诊疗建议。';
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < cases.length) {
      const c = cases[i++];
      const r = await kb.retrieve(c.q);
      const ctx = `${r.context}\n\n回答要求：事实以上述资料为准并标注 [编号]；资料未覆盖的内容明确说「内置资料未覆盖」，不编造条款、编码或数字。\n\n用户问题：${c.q}`;
      const [base, rag] = await Promise.all([chat(cfg, plain, c.q), chat(cfg, app.prompt, ctx)]);
      results.push({ ...c, normalize: undefined, mode: r.mode, base: { ok: grade(c, base), answer: base }, rag: { ok: grade(c, rag), answer: rag } });
      process.stdout.write(`\r  已完成 ${results.length}/${cases.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  process.stdout.write('\n\n');
  results.sort((a, b) => cases.findIndex((c) => c.q === a.q) - cases.findIndex((c) => c.q === b.q));
  for (const r of results) console.log(`${r.base.ok ? '✓' : '✗'} 只用模型   ${r.rag.ok ? '✓' : '✗'} 模型+知识包   ${r.q}`);
  const n = results.length, b = results.filter((r) => r.base.ok).length, k = results.filter((r) => r.rag.ok).length;
  console.log(`\n模型 ${MODEL}，${n} 题：只用模型 ${b}/${n}，模型+知识包 ${k}/${n}`);
  const out = arg('--out', path.join(os.tmpdir(), 'med-answers.json'));
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`完整回答已写入 ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
