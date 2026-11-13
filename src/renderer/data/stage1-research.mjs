// 阶段一「行业调研」：统一项目上下文、调研维度、推荐任务和推进判断。
// 所有阶段一 Skill 都从同一份上下文读取，并在这里登记来源、版本和执行状态。
import { fingerprint, readableArtifact } from './project-flow.mjs';

export const CONTEXT_FILE = '.fde-flow/context.json';
export const HANDOFF_FILE = '.fde-flow/stage1-handoff.md';
export const ANALYSIS_FILE = '.fde-flow/research/analysis.json';

export const DIMENSIONS = [
  { id: 'scenario', title: '业务场景', icon: 'fa-solid fa-hospital', hint: '在什么业务场景下使用，覆盖哪些科室或部门' },
  { id: 'roles', title: '用户角色', icon: 'fa-solid fa-user-group', hint: '谁在使用、谁在决策、谁受影响' },
  { id: 'process', title: '现有流程', icon: 'fa-solid fa-diagram-project', hint: '现在怎么做，关键环节与交接点' },
  { id: 'data', title: '数据系统', icon: 'fa-solid fa-database', hint: '涉及哪些系统、数据从哪来、能否对接' },
  { id: 'pain', title: '核心痛点', icon: 'fa-solid fa-triangle-exclamation', hint: '最影响效率或质量的问题' },
  { id: 'value', title: '价值目标', icon: 'fa-solid fa-bullseye', hint: '希望达到的效果和衡量方式' },
];

export const DIMENSION_STATUS = {
  missing: { label: '待补充', tone: 'grey', weight: 0 },
  partial: { label: '进行中', tone: 'blue', weight: 0.5 },
  review: { label: '待确认', tone: 'amber', weight: 0.6 },
  complete: { label: '已完善', tone: 'green', weight: 1 },
};

export const MODULES = [
  { id: 'industry', title: '行业预研', icon: 'fa-solid fa-book-open', desc: '行业政策、术语、常见痛点和对标做法', dims: ['scenario', 'pain', 'value'] },
  { id: 'background', title: '客户背景分析', icon: 'fa-solid fa-building', desc: '客户组织、现状、系统与已知诉求', dims: ['roles', 'process', 'data'] },
  { id: 'communication', title: '沟通准备', icon: 'fa-solid fa-comments', desc: '准备要点、访谈提纲和待确认事项', dims: ['roles', 'pain', 'value'] },
];

// 每个可调用的阶段一能力：Skill、输出文件和用途。
export const RESEARCH_JOBS = {
  intake: { id: 'intake', skill: 'fde-research-intake', title: 'AI 解析资料', module: 'overview', files: [ANALYSIS_FILE], kind: 'analysis',
    instruction: '解析项目资料，区分资料中明确陈述的事实（已经知道）、AI 根据行业经验推断的潜在问题（可能需要了解）和尚未确认的信息，并评估六个调研维度的信息完整度。' },
  industry: { id: 'industry', skill: 'fde-industry-research', title: '行业预研摘要', module: 'industry', files: ['stage1/industry-research.md'],
    instruction: '形成行业预研摘要：行业背景与政策、关键术语、常见痛点、典型做法与对标案例、对本项目的启示。行业经验必须标注为推断，不当作客户事实。' },
  background: { id: 'background', skill: 'fde-customer-background', title: '客户背景摘要', module: 'background', files: ['stage1/customer-background.md'],
    instruction: '形成客户背景摘要：客户概况、组织与角色、现有流程与系统、已知诉求、信息缺口。每条注明来源；没有来源的写入信息缺口。' },
  brief: { id: 'brief', skill: 'fde-research-brief', title: '调研准备要点', module: 'communication', files: ['stage1/research-brief.md'], deliverable: true,
    instruction: '编写《调研准备要点》，必须包含：客户背景、行业特点、拟调研业务、已知信息、需要验证的假设。复用已有行业预研和客户背景结果。' },
  bizflow: { id: 'bizflow', skill: 'fde-business-flow', title: '业务流转图', module: 'communication', files: ['stage1/business-flow.md'], deliverable: true,
    instruction: '按 fde-business-flow 规范画客户现有业务流程：角色泳道、Mermaid flowchart、节点表（列与阶段二对接确认表 §4 一致）、痛点汇总和待确认事项。每条信息标可信度（已确认/资料/推测/待确认），推测不画实线。' },
  dataflow: { id: 'dataflow', skill: 'fde-data-flow', title: '数据流程图', module: 'communication', files: ['stage1/data-flow.md'], deliverable: true,
    instruction: '按 fde-data-flow 规范画以 SDR 为中心的数据流：判断 CDR 有无，固定分层（数据源→CDR→SDR 三层→智能体），标出内网边界、接入方式、只出结果的出站方向和接入风险，附系统清单。智能体不得直连医院系统。系统编号 S-xx 与业务流转图保持一致。' },
  datareq: { id: 'datareq', skill: 'fde-data-requirements', title: '数据需求清单', module: 'communication', files: ['stage1/data-requirements.md'], deliverable: true,
    instruction: '按 fde-data-requirements 规范，从智能体要做的事倒推所需数据，一行一个数据项（D-xx），SDR 数据域只用词表，来源系统沿用数据流程图的 S-xx，不写字段名。' },
  outline: { id: 'outline', skill: 'fde-interview-outline', title: '首轮访谈提纲', module: 'communication', files: ['stage1/interview-outline.md'], deliverable: true,
    instruction: '编写《首轮访谈提纲》，必须包含：访谈对象、业务问题、数据问题、预期讨论内容、待确认事项。复用调研准备要点、行业预研和待确认问题；业务流转图、数据流程图、数据需求清单中的 Q 编号问题必须全部带进对应问题组，并保留原编号。' },
  prototype: { id: 'prototype', skill: 'fde-prototype-draft', prototype: true, title: '探索性原型草图', module: 'communication', files: ['stage1/prototype-sketch/index.html', 'stage1/prototype-sketch/assumptions.md'],
    instruction: '用户希望先做原型。基于当前已知信息生成探索性原型草图，写入 stage1/prototype-sketch/index.html；同时在 assumptions.md 写明依据来源和所有未确认假设。这不是阶段二正式原型，页面顶部需提示“探索草图，基于未确认假设”。' },
};

export const DELIVERABLES = [
  { key: 'brief', file: 'stage1/research-brief.md', name: '调研准备要点', sections: ['客户背景', '行业特点', '拟调研业务', '已知信息', '需要验证的假设'] },
  { key: 'bizflow', file: 'stage1/business-flow.md', name: '业务流转图', sections: [] },
  { key: 'dataflow', file: 'stage1/data-flow.md', name: '数据流程图', sections: ['文件头', 'CDR 判断', '数据流程图', '系统清单', '接入风险', '待确认事项'] },
  { key: 'datareq', file: 'stage1/data-requirements.md', name: '数据需求清单', sections: ['文件头', '智能体场景', '数据需求清单', '待确认事项'] },
  { key: 'outline', file: 'stage1/interview-outline.md', name: '首轮访谈提纲', sections: ['访谈对象', '业务问题', '数据问题', '预期讨论内容', '待确认事项'] },
  { key: 'industry', file: 'stage1/industry-research.md', name: '行业预研摘要', sections: [] },
  { key: 'background', file: 'stage1/customer-background.md', name: '客户背景摘要', sections: [] },
  { key: 'prototype', file: 'stage1/prototype-sketch/assumptions.md', name: '探索原型依据与假设', sections: [] },
];

// 阶段一五步流程：只有「明确目标」必填，其余步骤都可跳过；跳过的步骤在交接记录中标注，作为阶段二的待确认事项。
export const STAGE1_STEPS = [
  { id: 'goal', title: '明确目标', heading: '先写下这次想了解什么', desc: '只知道客户名称和大致方向也可以，几句话即可，其余后面再补。' },
  { id: 'materials', title: '收集资料', heading: '上传手上已有的资料', desc: '医院介绍、客户需求说明、之前的聊天记录等。没有资料可以直接跳过。', skippable: true },
  { id: 'analysis', title: 'AI 解析', heading: '分清已知、推测和待确认', desc: 'AI 把资料分成三类，并评估六个调研维度。没有资料也能解析，结果会标为行业推断。', skippable: true },
  { id: 'interview', title: '访谈摸底', heading: '先摸清业务和数据，再出访谈提纲', desc: '依次生成调研准备要点、业务流转图、数据流程图、数据需求清单，最后生成首轮访谈提纲，把图表里的待确认问题带进访谈。信息不全也能先出初稿。', skippable: true },
  { id: 'handoff', title: '进入阶段二', heading: '负责人确认交接', desc: '确认后进入阶段二，调研结论、待确认事项和成果会自动带入首轮需求访谈。' },
];
// 第 4 步的成果，按生成顺序排列：三份摸底产出在提纲之前，提纲才能带上其中的待确认问题。
export const CORE_DOCS = ['stage1/research-brief.md', 'stage1/business-flow.md', 'stage1/data-flow.md', 'stage1/data-requirements.md', 'stage1/interview-outline.md'];
export function stage1Steps(ctx, materials = []) {
  const passed = ctx.stage1?.passed || {};
  const docs = CORE_DOCS.map(file => deliverableState(ctx, file));
  const started = docs.some(d => d.versions.length);
  const met = {
    goal: String(ctx.goal?.text || '').trim().length >= 4,
    materials: materials.length > 0,
    analysis: !!ctx.analyzedAt,
    interview: docs.every(d => d.status === 'confirmed' || d.status === 'uploaded'),
    handoff: !!ctx.stage1?.completion?.by,
  };
  const steps = STAGE1_STEPS.map(step => ({ ...step,
    status: met[step.id] ? 'done' : passed[step.id] ? (step.id === 'interview' && started ? 'partial' : 'skipped') : step.id === 'interview' && started ? 'doing' : 'todo' }));
  const current = steps.findIndex(step => step.status === 'todo' || step.status === 'doing');
  return { steps, current: current < 0 ? steps.length - 1 : current, goalReady: met.goal, gaps: steps.filter(step => step.id !== 'handoff' && step.status !== 'done') };
}

const INDUSTRY_WORDS = [
  ['医疗', /医院|医疗|卫健|诊所|患者|门诊|护理/], ['教育', /学校|教育|学生|教学|高校/], ['政务', /政务|政府|街道|审批|12345/],
  ['金融', /银行|金融|保险|证券|信贷/], ['制造', /工厂|制造|生产线|车间|设备/], ['零售', /零售|门店|电商|商品|会员/],
];
const DIRECTION_WORDS = [
  ['人事管理', /人事|HR|招聘|考勤|绩效|薪酬|排班/i], ['客服服务', /客服|咨询|工单|投诉/], ['运营管理', /运营|管理驾驶舱|报表|指标/],
  ['质控合规', /质控|合规|审核|稽查/], ['知识问答', /知识库|问答|检索/],
];
export function guessIndustry(text) {
  const source = String(text || '');
  return { industry: INDUSTRY_WORDS.find(([, re]) => re.test(source))?.[0] || '', direction: DIRECTION_WORDS.find(([, re]) => re.test(source))?.[0] || '' };
}

export function freshContext(meta = {}) {
  const guess = guessIndustry(`${meta.name || ''} ${meta.requirement || ''}`);
  return {
    schemaVersion: 1, revision: 0,
    customer: { name: meta.customer || '', industry: meta.industry || guess.industry, direction: meta.direction || guess.direction, contacts: '' },
    goal: { focus: '了解业务与准备客户访谈', text: String(meta.requirement || '').slice(0, 300), counterpart: '', plannedAt: '' },
    facts: { known: [], possible: [], unconfirmed: [] },
    dimensions: Object.fromEntries(DIMENSIONS.map(d => [d.id, { status: 'missing', summary: '', notes: '', sources: [] }])),
    customDimensions: [], hiddenDimensions: [],
    modules: { industry: { notes: '' }, background: { notes: '' }, communication: { notes: '' } },
    openQuestions: [], requirements: [], decisions: [],
    deliverables: {}, skillRuns: [], impacts: [],
    stage1: { completion: null },
  };
}

export function normalizeContext(raw, meta) {
  const base = freshContext(meta);
  if (!raw || raw.schemaVersion !== 1) return base;
  return {
    ...base, ...raw,
    customer: { ...base.customer, ...raw.customer }, goal: { ...base.goal, ...raw.goal },
    facts: { ...base.facts, ...raw.facts }, modules: { ...base.modules, ...raw.modules },
    dimensions: { ...base.dimensions, ...raw.dimensions }, stage1: { ...base.stage1, ...raw.stage1 },
  };
}

export function visibleDimensions(ctx) {
  const hidden = new Set(ctx.hiddenDimensions || []);
  return [...DIMENSIONS, ...(ctx.customDimensions || []).map(d => ({ icon: 'fa-solid fa-layer-group', hint: '自定义维度', ...d, custom: true }))].filter(d => !hidden.has(d.id));
}

export function completion(ctx) {
  const dims = visibleDimensions(ctx);
  const states = dims.map(d => ctx.dimensions[d.id]?.status || 'missing');
  const score = states.reduce((sum, s) => sum + (DIMENSION_STATUS[s]?.weight || 0), 0);
  return { percent: dims.length ? Math.round(score / dims.length * 100) : 0, done: states.filter(s => s === 'complete').length, started: states.filter(s => s !== 'missing').length, total: dims.length };
}

// 缺失维度只给出提示，不阻止生成初步成果。
export function dimensionHints(ctx) {
  const dims = visibleDimensions(ctx);
  const by = s => dims.filter(d => (ctx.dimensions[d.id]?.status || 'missing') === s).map(d => d.title);
  const parts = [];
  const ready = [...by('complete'), ...by('partial'), ...by('review')];
  if (ready.length) parts.push(`${ready.join('、')}已有初步信息`);
  if (by('missing').length) parts.push(`${by('missing').join('、')}尚不明确，建议在客户访谈中确认`);
  return parts.length ? parts.join('；') + '。' : '还没有调研信息。可以先上传资料，或直接让 AI 基于项目方向生成初步准备。';
}

export function deliverableState(ctx, file) {
  const versions = ctx.deliverables?.[file]?.versions || [];
  const latest = versions.at(-1);
  return { versions, latest, status: latest?.status || 'none', label: latest ? ({ draft: '草稿', confirmed: '已确认', uploaded: '已导入', stale: '需复核' })[latest.status] || '草稿' : '未生成' };
}

// 推荐下一步：只做建议，用户可以任选或忽略。
export function recommendations(ctx, materials = []) {
  const has = file => !!ctx.deliverables?.[file]?.versions?.length;
  const done = completion(ctx);
  const list = [];
  if (materials.length && !has(ANALYSIS_FILE)) list.push({ job: 'intake', title: 'AI 解析已上传资料', reason: `已有 ${materials.length} 份资料，先区分已知事实、可能问题和待确认信息。` });
  if (!materials.length && !has(ANALYSIS_FILE)) list.push({ job: 'industry', title: '先做行业预研', reason: `还没有客户资料。可以先基于${ctx.customer.industry || '所属行业'}${ctx.customer.direction ? '·' + ctx.customer.direction : ''}了解常见业务和痛点。` });
  if (!has('stage1/customer-background.md')) list.push({ job: 'background', title: '生成客户背景摘要', reason: done.started ? '已具备初步访谈准备条件，先汇总客户背景。' : '根据现有信息整理客户背景，缺口会单独列出。' });
  if (!has('stage1/interview-outline.md')) list.push({ job: 'outline', title: '生成首轮访谈提纲', reason: done.percent >= 40 ? '目前已经具备初步访谈准备条件，建议生成首轮访谈提纲。' : '信息不全也可以先出提纲，缺失维度会写入待确认事项。' });
  if (!has('stage1/research-brief.md')) list.push({ job: 'brief', title: '生成调研准备要点', reason: '汇总客户背景、行业特点、已知信息和需要验证的假设。' });
  if (!has('stage1/industry-research.md') && list.every(item => item.job !== 'industry')) list.push({ job: 'industry', title: '补充行业预研', reason: '了解行业政策、术语和对标做法，访谈时更有把握。' });
  if (materials.length && has(ANALYSIS_FILE)) list.push({ job: 'intake', title: '重新解析资料', reason: '有新资料时重新解析，更新三类信息和维度完整度。' });
  if (!has('stage1/prototype-sketch/index.html')) list.push({ job: 'prototype', title: '先做探索原型', reason: '希望先给客户看样子时可用，会标注依据和未确认假设。' });
  return list;
}

// 推进判断：资料完整推荐进入；目标清楚允许携带问题进入；外部报告或先做原型也允许，最终由负责人确认。
export function advanceAdvice(ctx, materials = []) {
  const done = completion(ctx);
  const hasDoc = DELIVERABLES.slice(0, 2).some(d => ctx.deliverables?.[d.file]?.versions?.length);
  const uploaded = Object.values(ctx.deliverables || {}).some(d => d.versions?.some(v => v.source === 'upload'));
  const goalClear = String(ctx.goal.text || '').trim().length >= 4;
  const open = (ctx.openQuestions || []).filter(q => q.status !== 'resolved');
  if (done.percent >= 80 && hasDoc) return { mode: 'ready', title: '建议进入阶段二', text: '资料和调研基本完整，可以开展首轮需求访谈。', open };
  if (uploaded) return { mode: 'external', title: '可复用外部报告进入阶段二', text: '已导入外部报告，会作为阶段二的依据。', open };
  if (goalClear || hasDoc || materials.length) return { mode: 'with-questions', title: '可以携带待确认问题进入阶段二', text: `调研完成度 ${done.percent}%。未明确的内容会作为待确认问题带入首轮访谈。`, open };
  return { mode: 'needs-goal', title: '请先明确本阶段目标', text: '填写至少 4 个字的目标后，由负责人确认进入阶段二；其他资料缺口可以随交接带入。', open };
}

const short = (text, n = 1600) => { const s = String(text || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
export function contextDigest(ctx) {
  const dims = visibleDimensions(ctx).map(d => { const v = ctx.dimensions[d.id] || {}; return `- ${d.title}（${DIMENSION_STATUS[v.status]?.label || '待补充'}）：${short([v.summary, v.notes].filter(Boolean).join('；'), 240) || '暂无'}`; }).join('\n');
  const facts = (key, label) => (ctx.facts[key] || []).slice(0, 12).map(f => `- [${label}] ${f.text}${f.source ? `（来源：${f.source}）` : f.basis ? `（推断依据：${f.basis}）` : ''}`).join('\n');
  const outputs = Object.entries(ctx.deliverables || {}).map(([file, d]) => `- ${file} v${d.versions.length}（${d.versions.at(-1)?.status}）`).join('\n');
  return `【统一项目上下文 ${CONTEXT_FILE}】\n客户：${ctx.customer.name || '未填写'}；行业：${ctx.customer.industry || '未知'}；方向：${ctx.customer.direction || '未知'}；对接人：${ctx.customer.contacts || ctx.goal.counterpart || '未知'}\n`
    + `项目目标：${ctx.goal.text || '未填写'}；当前重点：${ctx.goal.focus}\n调研维度：\n${dims}\n`
    + `${facts('known', '资料陈述') || ''}\n${facts('possible', 'AI 推断') || ''}\n${(ctx.openQuestions || []).filter(q => q.status !== 'resolved').slice(0, 12).map(q => `- [待确认] ${q.question}${q.owner ? `（${q.owner}）` : ''}`).join('\n')}\n`
    + `模块补充：行业预研 ${short(ctx.modules.industry.notes, 400) || '无'}；客户背景 ${short(ctx.modules.background.notes, 400) || '无'}；沟通准备 ${short(ctx.modules.communication.notes, 400) || '无'}\n`
    + `已有成果（可复用）：\n${outputs || '- 暂无'}\n`;
}

export function buildResearchPrompt({ job, ctx, materials, summaryFile, focus = '', section = '', revise = '' }) {
  const isAnalysis = job.kind === 'analysis';
  return `【FDE 阶段一 · 行业调研】任务：${job.title}${focus ? `（聚焦：${focus}）` : ''}\n`
    + `先读取 ${CONTEXT_FILE} 与下列项目资料，复用已有成果，不重复劳动。资料不足时照常完成初步结果，缺失信息写为待确认，不编造客户事实。\n`
    + `项目资料：${materials.length ? materials.map(f => f.path).join('、') : '暂无上传资料，依据项目方向和行业经验，并明确标为推断'}\n`
    + contextDigest(ctx)
    + `使用 ${job.skill} 的内容和模板。${job.instruction}\n`
    + (section ? `本次只重新生成文档中「${section}」这一部分，其余部分逐字保留。\n` : '')
    + (revise ? `这是对已有文件的修改，不是重写：先读取 ${job.files.join('、')} 的当前内容，按以下修改意见调整${section ? `「${section}」这一部分` : ''}，意见未提到的内容逐字保留，已有编号不改。修改意见：${revise}\n` : '')
    + (isAnalysis
      ? `把结果写入 ${ANALYSIS_FILE}，UTF-8 JSON：{"customer":{"name":"","industry":"","direction":""},"known":[{"text":"资料中明确陈述的事实","source":"资料相对路径","dimension":"维度 id"}],"possible":[{"text":"AI 推断的潜在问题","basis":"推断依据","dimension":"维度 id"}],"unconfirmed":[{"question":"尚未确认的问题","dimension":"scenario|roles|process|data|pain|value","owner":"客户/FDE"}],"dimensions":{"scenario":{"status":"missing|partial|review|complete","summary":"一句完整的话：已知什么 + 还缺什么","reason":"为什么判为这个状态","sources":["资料路径"]}},"summary":"简要说明"}。\n`
        + `写法要求：known 只放资料原文支持的内容，每条一个具体事实（系统名、角色、数字、环节），并写来源；资料里有的就要写进 known，不要全部塞进待确认。summary 写成完整句，不用斜杠堆名词，例如"已知排班用 Excel、考勤用独立考勤机；尚不清楚考勤数据能否导出、集成平台是否有 CDR"。reason 说明判定依据，例如"系统清单明确，但接入方式都还没确认"。每个 known/possible/unconfirmed 都标 dimension。\n`
      : `必须实际写入：${job.files.join('、')}。不修改其他文件。\n完成后写 UTF-8 JSON 摘要到 ${summaryFile}：{"summary":"实际形成的成果","sources":["真实资料相对路径"],"questions":[{"question":"仍需确认的问题","owner":"客户/FDE","dimension":"维度 id"}]}。\n`)
    + '只报告实际执行结果，不能以文字回复代替文件写入。';
}

export function createContextService(api, slug) {
  let queue = Promise.resolve();
  const read = async file => {
    const result = await api.readFile(slug, file);
    if (result?.success) return String(result.content || '');
    if (/ENOENT|not found|不存在/i.test(result?.error || '')) return null;
    throw new Error(result?.error || `无法读取 ${file}`);
  };
  const write = async (file, content, expected) => {
    const result = await api.writeFile(slug, file, content, expected);
    if (!result?.success) throw new Error(result?.error || `无法保存 ${file}`);
  };
  const load = async meta => {
    const text = await read(CONTEXT_FILE);
    if (text === null) return freshContext(meta);
    try { return normalizeContext(JSON.parse(text), meta); } catch { throw new Error('项目上下文无法解析，已保留原文件。'); }
  };
  const save = (ctx, meta) => {
    const snapshot = JSON.parse(JSON.stringify(ctx));
    const op = async () => {
      const previous = await read(CONTEXT_FILE);
      const latest = previous === null ? freshContext(meta) : JSON.parse(previous);
      if ((latest.revision || 0) !== (snapshot.revision || 0)) throw new Error('项目上下文已在其他窗口更新，请刷新后继续。');
      snapshot.revision = (snapshot.revision || 0) + 1; snapshot.updatedAt = new Date().toISOString();
      await write(CONTEXT_FILE, JSON.stringify(snapshot, null, 2), previous);
      return snapshot;
    };
    const result = queue.then(op); queue = result.catch(() => {}); return result;
  };
  const archive = async (files, stamp) => { for (const file of files) { const c = await read(file); if (c !== null) await write(`.fde-flow/history/stage1/${stamp}/${file}`, c); } };
  const verify = async file => { const c = await read(file); if (!readableArtifact(c, file)) throw new Error(`尚未读到完整成果：${file}`); return fingerprint(c); };
  return { read, write, load, save, archive, verify };
}

// 合并 AI 解析结果；资料陈述与 AI 推断分开保存，用户手工补充的内容不被覆盖。
export function mergeAnalysis(ctx, analysis, at = new Date().toISOString()) {
  const next = JSON.parse(JSON.stringify(ctx));
  const take = (list, map) => (Array.isArray(list) ? list : []).map(map).filter(x => x.text || x.question);
  next.facts.known = take(analysis.known, f => ({ text: String(f.text || ''), source: String(f.source || ''), dimension: f.dimension || '', kind: 'stated', at }));
  next.facts.possible = take(analysis.possible, f => ({ text: String(f.text || ''), basis: String(f.basis || ''), dimension: f.dimension || '', kind: 'inferred', at }));
  next.facts.unconfirmed = take(analysis.unconfirmed, q => ({ question: String(q.question || ''), dimension: q.dimension || '', owner: q.owner || '' }));
  for (const [id, d] of Object.entries(analysis.dimensions || {})) {
    if (!next.dimensions[id]) continue;
    const current = next.dimensions[id];
    const status = DIMENSION_STATUS[d.status] ? d.status : current.status;
    next.dimensions[id] = { ...current, status: current.manual ? current.status : status, summary: String(d.summary || current.summary || ''), reason: String(d.reason || ''), sources: Array.isArray(d.sources) ? d.sources : current.sources };
  }
  for (const key of ['name', 'industry', 'direction']) if (!next.customer[key] && analysis.customer?.[key]) next.customer[key] = String(analysis.customer[key]);
  addQuestions(next, next.facts.unconfirmed, 'AI 解析资料');
  return next;
}

export function addQuestions(ctx, questions, source) {
  const seen = new Set(ctx.openQuestions.map(q => q.question));
  for (const q of questions || []) {
    const question = String(q?.question || '').trim();
    if (!question || seen.has(question)) continue;
    seen.add(question); ctx.openQuestions.push({ question, owner: q.owner || '', dimension: q.dimension || '', status: 'open', source });
  }
}

export function markdownSections(text) {
  return [...String(text || '').matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => m[1].replace(/^[一二三四五六七八九十\d]+[、.．\s]+/, '').trim()).filter(Boolean);
}

export function handoffMarkdown(ctx, materials, outputs) {
  const open = ctx.openQuestions.filter(q => q.status !== 'resolved');
  const lines = [
    '# 阶段一交接：行业调研 → 首轮需求访谈', '',
    `确认人：${ctx.stage1.completion?.by || ''}　确认时间：${ctx.stage1.completion?.at || ''}　推进方式：${ctx.stage1.completion?.modeLabel || ''}`, '',
    '## 客户信息', `- 客户：${ctx.customer.name || '未填写'}`, `- 行业 / 方向：${ctx.customer.industry || '未知'} / ${ctx.customer.direction || '未知'}`, `- 对接对象：${ctx.goal.counterpart || ctx.customer.contacts || '待确认'}`, `- 项目目标：${ctx.goal.text || '待明确'}`, '',
    '## 调研结论',
    ...visibleDimensions(ctx).map(d => `- ${d.title}（${DIMENSION_STATUS[ctx.dimensions[d.id]?.status]?.label || '待补充'}）：${[ctx.dimensions[d.id]?.summary, ctx.dimensions[d.id]?.notes].filter(Boolean).join('；') || '尚不明确，需访谈确认'}`),
    ...(ctx.facts.known || []).map(f => `- 已知：${f.text}${f.source ? `（${f.source}）` : ''}`), '',
    '## 访谈问题与成果', ...outputs.map(o => `- ${o.name}：${o.file}（${o.status}）`), '',
    '## 待确认事项', ...(open.length ? open.map(q => `- ${q.question}${q.owner ? `（${q.owner}）` : ''}`) : ['- 无']),
    ...(ctx.stage1.completion?.assumptions ? ['', '## 未确认假设', ctx.stage1.completion.assumptions] : []), '',
    ...(ctx.stage1.completion?.skipped?.length ? ['## 跳过或未完成的步骤', ...ctx.stage1.completion.skipped.map(t => `- ${t}：相关信息需在首轮访谈中确认`), ''] : []),
    '## 来源', ...(materials.length ? materials.map(f => `- ${f.path}`) : ['- 暂无上传资料']), '',
  ];
  return lines.join('\n');
}

// 空白模板：按 Skill 规范的固定章节和表头生成，供用户自己填写。
const head = name => `# ${name}\n\n## 一、文件头\n\n- 项目：\n- 版本：v0.1\n- 日期：\n- 编写人：\n- 资料来源：\n`;
const table = cols => `| ${cols.join(' | ')} |\n|${cols.map(() => ' --- ').join('|')}|\n| ${cols.map(() => ' ').join(' | ')} |\n`;
const FLOW_CLASSES = '  classDef guess stroke-dasharray:5 4,stroke:#c27a1e\n  classDef pain stroke:#c27a1e,stroke-width:2px\n';
export const TEMPLATES = {
  'stage1/research-brief.md': () => `# 调研准备要点\n\n## 一、客户背景\n\n## 二、行业特点\n\n## 三、拟调研业务\n\n## 四、已知信息\n\n## 五、需要验证的假设\n`,
  'stage1/business-flow.md': () => `${head('业务流转图')}\n## 二、场景 P1：场景名称\n\n\`\`\`mermaid\nflowchart LR\n${FLOW_CLASSES}  subgraph 角色A\n    P01([开始]) --> P02[处理动作]\n  end\n\`\`\`\n\n${table(['编号', '节点/环节', '执行角色', '输入', '处理动作', '输出', '涉及系统', '可信度', '异常/例外', 'AI 嵌入'])}\n## 三、痛点汇总\n\n${table(['痛点', '关联节点', '影响', '可信度', '依据'])}\n## 四、待确认事项\n\n${table(['编号', '问题', '关联节点', '应向谁确认'])}`,
  'stage1/data-flow.md': () => `${head('数据流程图')}\n## 二、CDR 判断\n\n有 / 无 / 未知，依据：\n\n## 三、数据流程图\n\n\`\`\`mermaid\nflowchart LR\n${FLOW_CLASSES}  subgraph 医院内网\n    S01[(HIS)] -->|只读 View| SDR[SDR 数据底座]\n  end\n  SDR -->|标准化数据| AG[智能体]\n\`\`\`\n\n## 四、系统清单\n\n${table(['编号', '系统（标准名）', '厂商', '主要数据域', '接入方式', '可信度', '风险', '应向谁确认'])}\n## 五、接入风险\n\n${table(['风险', '关联系统', '影响', '应对建议'])}\n## 六、待确认事项\n\n${table(['编号', '问题', '关联系统', '应向谁确认'])}`,
  'stage1/data-requirements.md': () => `${head('数据需求清单')}\n## 二、智能体场景\n\n${table(['场景', '智能体要做的事', '关联业务节点（P 编号）'])}\n## 三、数据需求清单\n\n${table(['编号', '用途/智能体场景', 'SDR 数据域', '数据内容', '可能来源系统', '接入方式', '可信度', '敏感级别（初判）', '确认人/待确认编号', '更新频率'])}\n## 四、待确认事项\n\n${table(['编号', '问题', '关联数据项', '应向谁确认'])}`,
  'stage1/interview-outline.md': () => `# 首轮访谈提纲\n\n## 一、访谈对象\n\n## 二、业务问题\n\n## 三、数据问题\n\n## 四、预期讨论内容\n\n## 五、待确认事项\n`,
};

// 规范检查：只读检查，不改原文；结果为 { level: 'error'|'warn', text } 列表。
export const SDR_DOMAINS = ['患者主索引', '就诊', '诊断', '医嘱', '检验', '检查', '手术麻醉', '护理', '药品', '费用', '设备物资', '组织科室', '人员', '排班考勤'];
const ACCESS = ['只读 View', '只读View', '接口', '文件导入', '从 CDR 抽取', '从CDR抽取', '待确认'];
const CONFIDENCE = ['已确认', '资料', '推测', '待确认'];
const REQUIRED = {
  'stage1/research-brief.md': ['客户背景', '行业特点', '拟调研业务', '已知信息', '需要验证的假设'],
  'stage1/business-flow.md': ['文件头', '场景 P1', '痛点汇总', '待确认事项'],
  'stage1/data-flow.md': ['文件头', 'CDR 判断', '数据流程图', '系统清单', '接入风险', '待确认事项'],
  'stage1/data-requirements.md': ['文件头', '智能体场景', '数据需求清单', '待确认事项'],
  'stage1/interview-outline.md': ['访谈对象', '业务问题', '数据问题', '预期讨论内容', '待确认事项'],
};
function tableRows(text, firstCol) {
  const lines = String(text).split('\n'); const i = lines.findIndex(l => /^\s*\|/.test(l) && l.split('|')[1]?.trim() === firstCol);
  if (i < 0) return null;
  const header = lines[i].split('|').slice(1, -1).map(c => c.trim()); const rows = [];
  for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
    const cells = lines[j].split('|').slice(1, -1).map(c => c.trim());
    if (cells.some(Boolean)) rows.push(Object.fromEntries(header.map((h, k) => [h, cells[k] || ''])));
  }
  return rows;
}
// 解析 mermaid 连线：节点编号换成名称后，找出「业务系统 → 智能体」且不经 SDR 的边。
const SYSTEM_RE = /HIS|EMR|LIS|PACS|RIS|手麻|护理系统|HRP|HR 系统|人事系统|考勤|OA|CDR|Excel|线下/i, AGENT_RE = /智能体|SEAF|Agent|助手|纳米/i;
function directLinks(mermaid) {
  const labels = {}, NODE = /([A-Za-z_][\w-]*)\s*(?:\[\(|\(\[|\[\[|\{\{|\[|\(|\{)([^\]\)\}]*)/g;
  for (const m of mermaid.matchAll(NODE)) if (m[2] && !labels[m[1]]) labels[m[1]] = m[2];
  const name = id => `${id} ${labels[id] || ''}`, found = [];
  for (const line of mermaid.split('\n')) {
    const ids = [...line.matchAll(/([A-Za-z_][\w-]*)(?:\s*(?:\[\(|\(\[|\[\[|\{\{|\[|\(|\{)[^\]\)\}]*[\]\)\}]+)?(?::::\w+)?\s*(?=(?:-->|-\.->|==>|---|-\.-)|$)/g)].map(m => m[1]).filter(id => !/^(flowchart|graph|subgraph|end|classDef|class|LR|TD|TB|RL)$/.test(id));
    if (!/-->|-\.->|==>/.test(line)) continue;
    for (let i = 0; i < ids.length - 1; i++) {
      const a = name(ids[i]), b = name(ids[i + 1]);
      if (SYSTEM_RE.test(a) && !/SDR/i.test(a) && AGENT_RE.test(b) && !/SDR/i.test(b)) found.push(`${labels[ids[i]] || ids[i]} → ${labels[ids[i + 1]] || ids[i + 1]}`);
    }
  }
  return found;
}
const inVocab = (value, vocab) => !value || vocab.some(v => value.includes(v));
export function checkDocument(file, text) {
  const issues = []; const t = String(text || '');
  if (!t.trim()) return [{ level: 'error', text: '文件为空' }];
  const heads = markdownSections(t);
  for (const name of REQUIRED[file] || []) if (!heads.some(h => h.includes(name))) issues.push({ level: 'error', text: `缺少章节「${name}」` });
  const mermaid = (t.match(/```mermaid\n([\s\S]*?)```/g) || []).join('\n');
  if (file === 'stage1/business-flow.md' || file === 'stage1/data-flow.md') {
    if (!mermaid) issues.push({ level: 'error', text: '没有 mermaid 图' });
    else if (!/classDef guess/.test(mermaid)) issues.push({ level: 'warn', text: '图中未声明 classDef guess，推测内容无法用虚线区分' });
  }
  if (file === 'stage1/business-flow.md') {
    const rows = tableRows(t, '编号');
    if (!rows?.length) issues.push({ level: 'error', text: '缺少节点表' });
    else rows.forEach(r => {
      if (!/^P\d*-\d{2}/.test(r['编号'])) issues.push({ level: 'warn', text: `节点编号「${r['编号']}」不符合 P-01 / P1-01 格式` });
      if (r['可信度'] && !inVocab(r['可信度'], CONFIDENCE)) issues.push({ level: 'warn', text: `${r['编号']} 可信度「${r['可信度']}」不在词表内` });
    });
  }
  if (file === 'stage1/data-flow.md' && mermaid) {
    if (!/SDR/.test(mermaid)) issues.push({ level: 'error', text: '数据流程图中没有 SDR，智能体必须经 SDR 取数' });
    directLinks(mermaid).forEach(l => issues.push({ level: 'error', text: `业务系统直连智能体，必须经 SDR：${l}` }));
  }
  if (file === 'stage1/data-requirements.md') {
    const rows = tableRows(t, '编号')?.filter(r => 'SDR 数据域' in r) ?? tableRows(t.slice(t.indexOf('数据需求清单')), '编号');
    if (!rows?.length) issues.push({ level: 'error', text: '数据需求清单主表为空' });
    else rows.forEach(r => {
      const id = r['编号'] || '(无编号)';
      if (!/^D-\d{2}/.test(r['编号'])) issues.push({ level: 'warn', text: `编号「${id}」不符合 D-01 格式` });
      for (const col of ['用途/智能体场景', 'SDR 数据域', '数据内容', '可能来源系统', '接入方式', '可信度']) if (col in r && !r[col]) issues.push({ level: 'error', text: `${id} 必填列「${col}」为空` });
      if (r['SDR 数据域'] && !inVocab(r['SDR 数据域'], SDR_DOMAINS)) issues.push({ level: 'warn', text: `${id} 数据域「${r['SDR 数据域']}」不在 14 个数据域词表内` });
      if (r['接入方式'] && !inVocab(r['接入方式'], ACCESS)) issues.push({ level: 'warn', text: `${id} 接入方式「${r['接入方式']}」不在词表内` });
    });
  }
  return issues;
}

// 阶段一 → 阶段二承接：每份阶段一成果对应对接确认表/AI 能力清单的哪一节，编号沿用不改。
export const STAGE1_CARRY = [
  { file: 'stage1/research-brief.md', name: '调研准备要点', to: '一、基本信息 / 4.1 场景概述' },
  { file: 'stage1/interview-outline.md', name: '首轮访谈提纲', to: '二、组织关系 / 本轮议题' },
  { file: 'stage1/business-flow.md', name: '业务流转图', to: '4.2 / 4.4 业务流程（沿用 P、S 编号）' },
  { file: 'stage1/data-flow.md', name: '数据流程图', to: '4.5 数据对接（沿用 S 编号）' },
  { file: 'stage1/data-requirements.md', name: '数据需求清单', to: '4.5 数据对接、AI 能力数据依赖（沿用 D 编号）' },
];

// 写进阶段二生成提示词的承接说明；questions 按顺序编号 Q1… 供 AI 回报哪些已在本轮回答。
export function stage1CarryPrompt(ctx, existing = {}) {
  if (!ctx) return '';
  const docs = STAGE1_CARRY.filter(d => existing[d.file]);
  const open = (ctx.openQuestions || []).filter(q => q.status !== 'resolved');
  if (!docs.length && !open.length) return '';
  const dimTitle = id => DIMENSIONS.find(d => d.id === id)?.title || '未归类';
  return '【承接阶段一】阶段二不是从零开始，必须先读下列阶段一成果再动笔：\n'
    + docs.map(d => `- ${d.file}（${d.name}，${deliverableState(ctx, d.file).label}）→ 对应 ${d.to}`).join('\n') + '\n'
    + (existing[HANDOFF_FILE] ? `- ${HANDOFF_FILE}（阶段一交接记录：客户信息、调研结论、推进方式）\n` : '')
    + '规则：阶段一已有的 P/S/D 编号原样沿用，只补列、不改号、不重排；阶段一标"推测/待确认"的内容，本轮材料证实了才能改写为事实，并在备注写明本轮来源。\n'
    + (open.length ? `阶段一遗留的待确认问题（本轮材料能回答的就写进对应章节，不能回答的放进"遗留未定事项"）：\n${open.map((q, i) => `Q${i + 1} [${dimTitle(q.dimension)}] ${q.question}${q.owner ? `（${q.owner}）` : ''}`).join('\n')}\n` : '');
}

// 把 AI 回报的"本轮已回答"写回阶段一问题列表；按 Q 序号或原文匹配。
export function applyAnswered(ctx, answered, round) {
  const open = (ctx.openQuestions || []).filter(q => q.status !== 'resolved');
  let count = 0;
  for (const a of Array.isArray(answered) ? answered : []) {
    const n = /^Q?(\d+)$/i.exec(String(a?.id || '').trim());
    const q = n ? open[Number(n[1]) - 1] : open.find(x => x.question === String(a?.question || '').trim());
    if (!q || q.status === 'resolved' || !String(a?.answer || '').trim()) continue;
    Object.assign(q, { status: 'resolved', answer: String(a.answer).trim(), resolvedAt: new Date().toISOString(), resolvedIn: `阶段二第 ${round} 轮` });
    count++;
  }
  return count;
}
