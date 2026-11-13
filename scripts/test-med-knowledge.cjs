#!/usr/bin/env node
// 医疗知识检索评测：每道题给出「应命中的资料」，比较 混合检索 与 仅关键词检索 的 top-5 命中率。
// 用法：node scripts/test-med-knowledge.cjs [--verbose]
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createMedKnowledge } = require('../src/main/med-knowledge');

const dir = path.join(__dirname, '..', 'med-knowledge');
function config() {
  const home = process.env.HERMES_HOME || path.join(os.homedir(), '.product-lobster');
  for (const p of JSON.parse(fs.readFileSync(path.join(home, 'gateway-profiles.json'), 'utf8')).profiles || []) if (/360/.test(p.baseUrl || '') && p.apiKey) return { apiKey: p.apiKey, baseUrl: p.baseUrl };
  return {};
}

// expect: 文档标题里应出现的关键字；mustContain: 命中段落里应出现的原文（可选，验证段落级准确）
const CASES = [
  { q: '病人男女在系统里怎么编码', expect: 'WS/T 363.3', mustContain: '性别' },
  { q: '患者的身份证号用哪个数据元', expect: 'WS/T 363.3', mustContain: '身份证' },
  { q: '住院一共花了多少钱应该记在哪个字段', expect: 'WS/T 363.13', mustContain: '费用' },
  { q: '血压测量结果的数据元标识符是多少', expect: 'WS/T 363.7', mustContain: '收缩压' },
  { q: '诊断代码用哪个编码体系', expect: 'WS/T 363.9' },
  { q: '数据元标识符 DE 开头的编号是怎么组成的', expect: 'WS/T 363.1' },
  { q: '值域代码表的编码规则', expect: 'WS/T 364.1' },
  { q: '数据集分类编码有几级类目', expect: 'WS/T 306' },
  { q: '吸烟饮酒这些生活习惯怎么记录', expect: 'WS/T 363.5' },
  { q: '检验结果的参考值范围怎么表示', expect: 'WS/T 363.10' },
  { q: '医疗健康数据算不算敏感个人信息', expect: 'GB/T 45574' },
  { q: '处理敏感个人信息需要单独同意吗', expect: 'GB/T 45574', mustContain: '单独同意' },
  { q: '核心数据、重要数据、一般数据怎么划分', expect: 'GB/T 43697' },
  { q: '数据分类分级的基本流程是什么', expect: 'GB/T 43697' },
  { q: '电子病历评4级病房医生要达到什么要求', expect: '电子病历系统应用水平', mustContain: '病房医生' },
  { q: '门诊检验报告在分级评价里怎么评', expect: '电子病历系统应用水平', mustContain: '检验报告' },
  { q: '病历质量控制有哪些评价项目', expect: '电子病历系统应用水平', mustContain: '质量控制' },
  { q: 'DRG 3.0 一共有多少个核心病组和细分组', expect: 'DRG）付费3.0版分组方案', mustContain: '825' },
  { q: '基层病组有哪些', expect: 'DRG）付费3.0版分组方案', mustContain: '基层病组' },
  { q: '机器人辅助手术怎么入组', expect: 'DRG）付费3.0版分组方案', mustContain: '机器人' },
  { q: 'DIP 3.0 的核心病种是怎么划分的', expect: 'DIP）付费3.0版分组方案' },
  { q: '3.0版分组方案什么时候开始执行', expect: '3.0版分组方案并做好落地实施' },
  { q: '按病种付费的特例单议是什么', expect: '按病种付费' },
  { q: '医保 15 项信息业务编码标准包括哪些', expect: '15项医疗保障信息业务编码标准' },
  { q: '医疗服务项目一共有多少项，分几章', expect: '全国医疗服务项目技术规范', mustContain: '11487' },
  { q: '腹腔镜切胆囊这个手术的项目内涵是什么', expect: '全国医疗服务项目技术规范', mustContain: '胆囊' },
  { q: '查血常规白细胞计数的医疗服务项目', expect: '全国医疗服务项目技术规范', mustContain: '白细胞' },
  { q: '医疗服务项目的人力资源消耗相对值怎么理解', expect: '全国医疗服务项目技术规范', mustContain: '人力资源消耗相对值' },
  { q: '医保疾病诊断和手术操作代码要和卫健委版本对应吗', expect: '医保疾病诊断、手术操作分类与代码应用' },
];
const CODE_CASES = [
  { q: 'I10.x03 高血压1级进哪个病组', expect: 'FV2' },
  { q: '37.5100 心脏移植术属于哪个 ADRG', expect: 'AA3' },
  { q: 'J18.900 肺炎能进哪些组', expect: 'ES4' },
  { q: 'KS39 是什么病组', expect: '糖尿病' },
  { q: 'AAAA0001 是什么项目', expect: '普通门诊诊察' },
  { q: 'CAA01LB1 是什么项目', expect: '白细胞' },
  { q: '支气管内麻醉的项目编码', expect: 'HAA5A401' },
];

(async () => {
  const verbose = process.argv.includes('--verbose');
  const hybrid = createMedKnowledge({ dir, getConfig: config });
  const keyword = createMedKnowledge({ dir, getConfig: () => ({}) });
  const tally = { hybrid: { top1: 0, top5: 0, para: 0 }, keyword: { top1: 0, top5: 0, para: 0 } };
  let fellBack = 0;
  for (const c of CASES) {
    const row = [];
    for (const [name, kb] of [['hybrid', hybrid], ['keyword', keyword]]) {
      const r = await kb.retrieve(c.q);
      if (name === 'hybrid' && r.mode !== 'hybrid') fellBack++;
      const titles = r.sources.slice(0, 5).map((s) => s.title);
      const pos = titles.findIndex((t) => t.includes(c.expect));
      const para = !c.mustContain || r.sources.slice(0, 5).some((s) => s.title.includes(c.expect) && s.excerpt.includes(c.mustContain));
      if (pos === 0) tally[name].top1++;
      if (pos >= 0) tally[name].top5++;
      if (pos >= 0 && para) tally[name].para++;
      row.push(`${name === 'hybrid' ? '混合' : '关键词'} ${pos >= 0 ? `✓#${pos + 1}` : '✗  '}${pos >= 0 && !para ? '(段落不准)' : ''}`);
      if (verbose && name === 'hybrid') console.log('   ', titles.map((t) => t.slice(0, 28)).join(' | '));
    }
    console.log(`${row.join('  ').padEnd(34)} ${c.q}`);
  }
  const n = CASES.length;
  console.log(`\n资料定位（${n} 题）`);
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k === 'hybrid' ? '混合检索' : '仅关键词'}：第1条命中 ${v.top1}/${n}，前5条命中 ${v.top5}/${n}，前5条且段落正确 ${v.para}/${n}`);
  if (fellBack) console.log(`  注意：有 ${fellBack} 题向量接口失败，退回了关键词`);
  console.log('\n编码精确查询');
  for (const c of CODE_CASES) {
    const hits = hybrid.lookupCodes(c.q); const text = JSON.stringify(hits);
    console.log(`  ${text.includes(c.expect) ? '✓' : '✗'} ${c.q}  →  ${hits.slice(0, 2).map((h) => h.type + ' ' + (h.code || h.diagnosis) + ' ' + (h.name || h.diagnosisName || '') + (h.groups ? ' → ' + h.groups.map((g) => g.adrg + g.adrgName).join('、') : '') + (h.adrgName ? ' ∈ ' + h.adrg + h.adrgName : '')).join('；')}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
