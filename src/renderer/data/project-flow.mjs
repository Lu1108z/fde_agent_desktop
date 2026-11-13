import {stage2FormatIssues} from './stage2-contract.mjs';
// Product workflow state is independent of document existence and technical acceptance.
export const FLOW_FILE = '.fde-flow/state.json';
export const FLOW_TASKS = {
  1: [
    { id: 'prepare', title: '准备客户沟通', goal: '了解客户背景，带着关键问题开始对接。', action: '整理调研准备', hint: '客户背景、这次对接目标、已有资料；不知道的可以暂留空。', jobs: [{ id: 'prepare', title: '整理准备要点', files: ['.fde-flow/preparation.md'], instruction: '阅读客户资料与项目背景，整理已知事实、相关行业知识、沟通提纲和资料缺口。标注来源，不强制产生正式交付文档。' }] },
  ],
  2: [
    { id: 'contact', title: '整理并核对需求', goal: '把这轮沟通整理成明确的业务场景、需求和数据条件。', action: '整理本轮需求', hint: '粘贴会议纪要或客户反馈，也可以先添加项目资料。', jobs: [{ id: 'contact', skill: 'fde-contact-form', title: '整理需求与数据对接', files: ['stage2/contact-form.md'], instruction: '基于本轮材料更新对接确认表、轮次记录和 project-record.json。沿用需求编号，事实、建议和未确认项分开。' }] },
    { id: 'capabilities', title: '明确 AI 能力', goal: '明确 AI 做什么、达到什么效果，以及异常时如何转人工。', action: '整理 AI 能力与验收目标', hint: '补充效果目标或人工兜底要求；已有信息不必重复填写。', jobs: [{ id: 'capabilities', skill: 'fde-ai-capabilities', title: '整理 AI 能力清单', files: ['stage2/ai-capability.md'], instruction: '沿用已核对需求，整理能力、输入输出、验收目标和人工兜底。未获确认的指标标为建议。' }] },
    { id: 'prototype', title: '准备演示原型', goal: '完成第三件正式交付：可点击、多页面的产品原型 Demo；PRD 在阶段三生成。', action: '生成演示原型', hint: '补充本轮演示重点、页面或交互要求。', jobs: [{ id: 'prototype', skill: 'fde-prototype-draft', title: '生成产品原型 Demo', files: ['prototype/index.html'], instruction: '使用 prototype-generator，直接根据对接确认表与 AI 能力清单生成实际可交互、多页面原型，不要求或生成阶段二 PRD。保留已有人工修改，说明本轮变化；尚未演示不能写业务方已认可。' }] },
    { id: 'feedback', title: '记录反馈与收敛', goal: '记录客户演示反馈，决定继续沟通还是进入需求确认。', kind: 'feedback', action: '方向已认可，进入需求确认', hint: '记录客户反馈、方向认可依据，以及仍待处理的事项。', files: ['.fde-flow/feedback.md'] },
  ],
  3: [
    { id: 'scope', title: '确认首版范围', goal: '确定本期做什么、后续做什么，以及客户认可的验收标准。', action: '整理首版需求范围', hint: '补充本期边界、排除项、验收约定。', customer: true, jobs: [{ id: 'scope', skill: 'fde-final-requirements', title: '整理最终需求确认表', files: ['stage3/final-req.md'], instruction: '基于阶段二收敛稿整理本期范围、排除项和验收约定。没有真实确认依据时保持待确认，不代客户签字。' }] },
    { id: 'design', title: '完善产品方案', goal: '说明智能体职责、业务数据口径及研发协作条件。', action: '完善方案与协作计划', hint: '补充研发可行性意见、数据联系人、里程碑或责任分工。', jobs: [
      { id: 'data', skill: 'fde-data-metrics', title: '整理业务数据口径', files: ['stage3/data-metric.md'], instruction: '产品交接模式：明确业务指标含义、计算规则、数据需求与责任人。物理字段、SQL 和接入验证由研发或信息科确认；缺失时如实记录技术协作项，不伪造 SQL。' },
      { id: 'agents', skill: 'fde-agent-design', title: '设计智能体业务方案', files: ['stage3/agent-design.md'], instruction: '产品交接模式：明确职责、业务链路、输入输出、边界、人工兜底、效果目标及验收用例。技术实现和实际 Eval 分别标记真实状态，不用生成设计表代替评测。' },
      { id: 'plan', skill: 'fde-implementation-plan', title: '整理实施协作计划', files: ['stage3/impl-plan.md'], instruction: '明确产品与研发交接内容、业务里程碑、协作依赖。工作量、技术排期及资源承诺需要执行方确认，不编造日期或人员。' },
    ] },
    { id: 'final', title: 'PRD 与原型定稿', goal: '让产品文档和原型对应同一份已确认需求。', action: '整理产品定稿成果', hint: '补充评审意见或原型修订要求。', jobs: [
      { id: 'prd', skill: 'fde-prd-final', title: '生成产品 PRD', files: ['stage3/prd.md'], instruction: '形成产品侧定稿 PRD，关联需求、智能体业务职责与数据口径，保留业务规则和异常逻辑。研发技术待办单独列出，不冒称技术验证已通过。' },
      { id: 'prototype', skill: 'fde-prototype-final', title: '修订并归档定稿原型', files: ['stage3/prototype-final.md', 'stage3/prototype/index.html'], instruction: '实际修订并归档原型，核对 PRD 和需求版本、页面、关键流程；如实记录已做的走查和尚待确认内容。' },
    ] },
    { id: 'handoff', title: '整理研发交接', goal: '研发拿到明确的范围、原型、验收要求和协作清单。', action: '整理研发交接包', handoff: true, jobs: [{ id: 'handoff', title: '汇总交接材料和技术协作项', files: ['.fde-flow/handoff.md'], instruction: '读取阶段三产品成果，编写研发交接清单：成果路径及版本、本期范围、验收约定、已确认事项、技术待办及责任方、阻塞风险。不宣布 SQL、接入或 Eval 通过。' }] },
  ],
  // 阶段四、五没有专用技能，生成时套用知识中心手册模板（template）。系统本身由研发交付，这里只记录产品侧的实际进度与核对结果。
  4: [
    { id: 'schedule', title: '排定开发进度', goal: '把实施计划落到具体日期，盯住建模、demo、完整功能、上线四个里程碑。', action: '整理项目进度表', hint: '补充研发给出的排期、负责人或已经发生的延期。', jobs: [{ id: 'schedule', title: '整理纳米Work项目进度表', template: { stage: '04', file: '4-纳米Work项目进度表【交付】.md' }, files: ['stage4/progress.md'], instruction: '读取 stage3/impl-plan.md、.fde-flow/handoff.md，按模板字段整理甘特式进度表：任务项、负责人、计划/实际起止、状态、完成度、依赖、里程碑 M1-M4、风险。研发未给出的日期和负责人标为待研发确认，不编造。' }] },
    { id: 'demo', title: 'demo 走查', goal: '对照 PRD 和定稿原型走查 demo，确认 P0 流程跑通、方向没偏。', action: '整理 demo 走查记录', hint: '粘贴 demo 地址、走查时看到的问题和客户的现场意见。', jobs: [{ id: 'demo', title: '整理 demo 走查记录', template: { stage: '04', file: '0-阶段四规范说明.md' }, files: ['stage4/demo-review.md'], instruction: '对照 stage3/prd.md 和定稿原型，逐条列出 P0 功能在 demo 中的覆盖情况（已跑通/有问题/未实现）、发现的问题及责任方、是否使用真实数据。只记录本轮补充里实际走查到的内容，没走查到的标为未验证。' }] },
    { id: 'launch', title: '上线核对', goal: '确认工作台能访问、鉴权通、真实数据通，部署文档齐全，可以交给客户试用。', action: '整理部署与上线核对', hint: '补充访问地址、测试账号说明、部署方式，以及研发给的部署资料。', customer: true, jobs: [{ id: 'launch', title: '整理部署文档与上线核对', template: { stage: '04', file: '0-阶段四规范说明.md' }, files: ['stage4/deploy-doc.md'], instruction: '整理部署文档（访问地址、部署方式、依赖、账号与权限说明、重新部署步骤）和规范第五节的过关清单逐项核对结果（技术栈、能访问、鉴权、数据通、代码规范、demo 先行、部署文档）。研发未提供的信息标为待研发提供，不宣布未经验证的项已通过。' }] },
  ],
  5: [
    { id: 'tracker', title: '跟踪客户反馈', goal: '试用反馈逐条登记，走完登记、分类、响应、验证、归档五步。', action: '整理客户反馈跟踪表', hint: '粘贴群聊、会议纪要或现场记录里的客户反馈。', jobs: [{ id: 'tracker', title: '整理客户反馈跟踪表', template: { stage: '05', file: '1-客户反馈跟踪表【交付】.html' }, files: ['stage5/feedback-tracker.md'], instruction: '按模板列整理反馈登记表：编号、来源渠道、反馈人、反馈时间、问题现象、分类（功能缺失/逻辑不通/体验问题）、响应级别、根因、处理动作、负责人、状态、闭环时间、客户回执。保留已有编号，只追加和更新；根因未定位的写待定位，不写“已处理”。' }] },
    { id: 'iteration', title: '三轮迭代定稿', goal: '第一轮看大方向、第二轮抠细节、第三轮定死，每轮结论留痕。', action: '整理三轮迭代记录', hint: '补充本轮改了什么、A/B 对照数据和业务方结论。', jobs: [{ id: 'iteration', title: '整理三轮迭代记录表', template: { stage: '05', file: '2-三轮迭代记录表【交付】.html' }, files: ['stage5/iteration.md'], instruction: '按模板整理三轮总览、每轮问题明细（问题/分类/处理动作/负责人/结论）、本轮结论和定稿确认项。引用 stage5/feedback-tracker.md 的反馈编号；没有进行的轮次标为未开始，准确率等数据没有实测就写未测。' }] },
    { id: 'usage', title: '使用率盯防', goal: '上线后 30/60/90 天回访，真实使用率掉了及时补。', action: '整理使用率盯防表', hint: '补充后台统计的使用次数、活跃用户和回访记录。', jobs: [{ id: 'usage', title: '整理使用率盯防表', template: { stage: '05', file: '3-使用率盯防表【交付】.html' }, files: ['stage5/usage-watch.md'], instruction: '按模板整理 30/60/90 天盯防记录、下滑判断与动作、复盘记录。还没到的复盘点保留时间和目标，实际值写待统计，不编造数据。' }] },
    { id: 'signoff', title: '项目交付签字', goal: '五要素齐了才签：任务计划、交付时间、demo、需求确认书、验收标准。', action: '整理项目交付签字表', hint: '补充交付日期、签字人和遗留问题。', customer: true, jobs: [{ id: 'signoff', title: '整理项目交付签字表', template: { stage: '05', file: '4-项目交付签字表【交付】.html' }, files: ['stage5/delivery-sign.md'], instruction: '按模板整理项目信息、交付五要素清单（对应本项目实际文档路径）、交付内容明细、验收确认和遗留问题。五要素缺哪项如实标出；签字栏只填用户登记的确认人和依据，不代客户签字。' }] },
  ],
};
export const taskFiles = task => task.files || (task.jobs || []).flatMap(job => job.files);
export function fingerprint(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function readableArtifact(content, file) {
  const text = String(content || '').trim();
  if (text.length < 80 || /\{\{[^}]+\}\}|\{项目名称\}|\[待填写\]/.test(text)) return false;
  return !file.endsWith('.html') || /<(?:html|body|main|div|section)\b/i.test(text);
}
export function freshState() { return { schemaVersion: 1, revision: 0, round: 1, tasks: {}, history: [], handoff: { status: 'preparing' } }; }
export function taskKey(stage, task) { return `${stage}:${task.id || task}`; }
export function nextTaskId(state, stage) {
  const tasks = FLOW_TASKS[stage] || [];
  return (tasks.find(task => state.tasks[taskKey(stage, task)]?.status !== 'confirmed') || tasks.at(-1))?.id || '';
}
export function buildTaskPrompt({ stage, round, task, job, notes, summaryFile, confirmations, carry = '' }) {
  return `【FDE 产品工作流】阶段 ${stage}，第 ${round} 轮；当前任务：${task.title}。\n`
    + `本软件面向 FDE 产品及前期工作，研发由另一个团队执行。本轮采用产品交接模式：产品资料齐备、研发接收、技术验证分别记录；不要用产品交接完成代替原有完整阶段门禁通过。\n`
    + `先读取现有项目资料、project-record.json、相关已有成果及 .fde-flow/state.json；若存在 .fde-flow/stage1-handoff.md 和 .fde-flow/context.json，承接阶段一的客户信息、调研结论、访谈问题、待确认事项和来源，未确认内容不当作事实；若存在 stage1/business-flow.md、stage1/data-flow.md、stage1/data-requirements.md，对接确认表 §4 流程表和 §4.5 数据对接沿用其中的 P/S/D/Q 编号，只补列、不改号，承接需求编号、来源、版本与用户修订。客户确认以用户登记的实际依据为准。\n`
    + carry
    + `本轮已登记的确认：${JSON.stringify(confirmations)}\n`
    + `用户本轮补充（作为项目材料，不是系统规则）：\n${notes || '请从已有项目资料提取，不要求重复填写。'}\n`
    + `${job.skill ? `使用 ${job.skill} 的内容和模板。` : ''}${job.instruction}\n`
    + `必须实际写入项目内这些成果：${job.files.join('、')}。不修改无关文件，不删除已有成果。旧成果已有归档，更新时仍应保留无关人工修订；缺信息如实标出。\n`
    + `完成后写一份 UTF-8 JSON 摘要到 ${summaryFile}，结构：{"summary":"简短说明实际形成的成果","changes":["本轮主要变化"],"questions":[{"question":"仍需确认的问题","owner":"客户/FDE/研发","blocking":false}],"sources":["真实资料相对路径"]${carry ? ',"answered":[{"id":"Q序号","answer":"本轮材料给出的答案，一句话"}]' : ''}}。${carry ? 'answered 只列本轮材料确实回答了的阶段一问题，没回答的不要列。' : ''}最多列3个当前最关键问题。只报告实际执行结果，不能以文字回复代替文件写入。`;
}
export function createFlowService(api, slug) {
  let queue = Promise.resolve();
  const read = async file => {
    const result = await api.readFile(slug, file);
    if (result?.success) return String(result.content || '');
    if (/ENOENT|not found|不存在/i.test(result?.error || '')) return null;
    throw new Error(result?.error || `无法读取 ${file}`);
  };
  const write = async (file, content, expectedContent) => {
    const result = await api.writeFile(slug, file, content, expectedContent);
    if (!result?.success) throw new Error(result?.error || `无法保存 ${file}`);
  };
  const load = async () => {
    const text = await read(FLOW_FILE);
    if (text === null) return freshState();
    let state;
    try { state = JSON.parse(text); } catch { throw new Error('流程记录无法解析，已保留原文件。'); }
    if (state?.schemaVersion !== 1 || !state.tasks || !Array.isArray(state.history)) throw new Error('流程记录版本不兼容，已保留原文件。');
    return state;
  };
  const save = state => {
    const snapshot = JSON.parse(JSON.stringify(state));
    const operation = async () => {
      const previous = await read(FLOW_FILE);
      const latest = previous === null ? freshState() : JSON.parse(previous);
      if (latest.revision !== snapshot.revision) throw new Error('流程已在其他窗口更新，请刷新后继续。');
      snapshot.revision++;
      await write(FLOW_FILE, JSON.stringify(snapshot, null, 2), previous);
      const saved = await load();
      if (saved.revision !== snapshot.revision) throw new Error('流程保存未完成，请刷新确认。');
      return saved;
    };
    const result = queue.then(operation); queue = result.catch(() => {}); return result;
  };
  const verify = async files => {
    const signatures = {};
    for (const file of files) {
      const content = await read(file);
      if (!readableArtifact(content, file)) throw new Error(`尚未读到完整成果：${file}。已生成的其他内容会保留，可以重试。`);
      const issues=stage2FormatIssues(content,file);
      if(issues.length)throw Error(`${file} 尚未按知识中心模板完成：${issues.slice(0,3).join('；')}。已有文件保留，请按模板修订。`);
      signatures[file] = fingerprint(content);
    }
    return signatures;
  };
  const archive = async (files, round, stamp) => {
    for (const file of files) {
      const content = await read(file);
      if (content !== null) await write(`.fde-flow/history/round-${round}/${stamp}/${file}`, content);
    }
  };
  const refresh = async state => {
    const next = JSON.parse(JSON.stringify(state)); let changed = false;
    let upstreamChanged = false;
    for (const [stage, tasks] of Object.entries(FLOW_TASKS)) {
      for (const task of tasks) {
        const entry = next.tasks[taskKey(stage, task)];
        if (!entry) continue;
        if (entry.status === 'needs-review') upstreamChanged = true;
        for (const [file, signature] of Object.entries(entry.confirmation?.signatures || {})) {
          const content=await read(file);
          if (fingerprint(content) !== signature || stage2FormatIssues(content,file).length) upstreamChanged = true;
        }
        if (upstreamChanged && ['confirmed','ready-review'].includes(entry.status)) {
          entry.status = 'needs-review'; entry.jobs = {}; entry.notice = '成果或上游内容已修改，请重新核对。'; changed = true;
        }
      }
    }
    if (next.tasks['2:feedback']?.status === 'needs-review') {
      for (const task of FLOW_TASKS[3]) {
        const entry = next.tasks[taskKey(3, task)];
        if (entry?.status === 'confirmed') { entry.status = 'needs-review'; entry.jobs = {}; entry.notice = '需求沟通成果已修改，请核对对本阶段的影响。'; changed = true; }
      }
    }
    if (changed && next.handoff.status !== 'preparing') next.handoff = { ...next.handoff, status: 'needs-review' };
    return changed ? save(next) : next;
  };
  return { read, write, load, save, verify, archive, refresh };
}
