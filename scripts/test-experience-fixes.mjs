import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { FLOW_TASKS, taskFiles, fingerprint, freshState, createFlowService } from '../src/renderer/data/project-flow.mjs';
import { freshContext, stage1Steps } from '../src/renderer/data/stage1-research.mjs';
import { lifecycleStatus, addMonths } from '../src/renderer/data/agent-lifecycle.mjs';
import { CONTACT_HEADERS, AI_HEADERS } from '../src/renderer/data/stage2-contract.mjs';
const require = createRequire(import.meta.url);
const { reconcileCompletion } = require('../src/main/project-completion');
const { createMaterialLibrary } = require('../src/main/material-library');
const gate = require('../src/main/product-flow-gate');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fde-experience-fix-'));
test('前后端固定清单只提供 Opus 5.5 和 DS 4.1 Flash', () => {
  const server=fs.readFileSync(new URL('../src/main/index.js',import.meta.url),'utf8');
  const renderer=fs.readFileSync(new URL('../src/renderer/constants/models.js',import.meta.url),'utf8');
  const ids=source=>[...source.match(/(?:export )?const FIXED_MODELS = \[([\s\S]*?)\];/)[1].matchAll(/id:\s*'([^']+)'/g)].map(m=>m[1]).sort();
  const expected=['anthropic/claude-opus-5-5','deepseek/deepseek-v4.1-flash'];
  assert.deepEqual(ids(server),expected);assert.deepEqual(ids(renderer),expected);
  const handlers={};
  const start=server.indexOf("ipcMain.handle('hermes:set-model'"),end=server.indexOf("ipcMain.handle('hermes:set-config-model'",start);
  vm.runInNewContext(server.slice(start,end),{ipcMain:{handle:(name,handler)=>handlers[name]=handler},isFixedModel:id=>expected.includes(id)});
  return handlers['hermes:set-model'](null,{modelId:'unapproved/model'}).then(result=>assert.equal(result.success,false));
});
const table = cols => `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n| ${cols.map(() => '业务记录').join(' | ')} |`;
function artifact(file) {
  if (file === 'stage2/contact-form.md') return ['# 对接确认表', '一、基本信息 二、组织关系 三、本次结论与确认 四、业务场景', '4.1 场景概述 4.2 业务流程 4.3 需求清单 4.4 业务流程 4.5 数据对接 4.6 验收标准初稿', '客户/单位 所属沟通轮次 遗留未定事项 AI能力确认结论 业务目标 现状基线（As-Is） 业务痛点 期望效果（To-Be） AI介入价值', ...CONTACT_HEADERS.map(table)].join('\n\n');
  if (file === 'stage2/ai-capability.md') return ['# AI能力', '一、AI能力总览 二、AI能力详细定义 三、AI能力与需求映射关系 四、AI验收口径汇总', '能力描述 关联需求 AI承担角色 输入 输出 数据依赖 验收口径 异常处理', ...AI_HEADERS.map(table)].join('\n\n');
  if (file.endsWith('.html')) return '<html><body><main><button onclick="this.textContent=\'完成\'">点击体验项目流程</button></main></body></html>';
  return '# 项目成果\n' + '依据客户会议纪要整理的业务需求与核对记录。'.repeat(10);
}
function confirmedFiles() {
  const state = freshState(), files = new Map();
  for (const stage of [2,3,4,5]) for (const task of FLOW_TASKS[stage]) {
    const signatures = {};
    for (const file of taskFiles(task)) { files.set(file, artifact(file)); signatures[file] = fingerprint(files.get(file)); }
    state.tasks[`${stage}:${task.id}`] = { status:'confirmed', notes:'客户反馈', confirmedBy:'客户', evidence:'会议纪要', confirmation:{at:'2026-11-04',by:'客户',evidence:'会议纪要',signatures} };
  }
  files.set('.fde-flow/state.json', JSON.stringify(state));
  return {state,files};
}
test('不同中文客户含相同 AI 名称时创建独立项目；引擎失败仍保留项目', async () => {
  const root = temp(), records = new Map();
  try {
    const source = fs.readFileSync(new URL('../src/main/index.js', import.meta.url),'utf8');
    const slugCode = source.slice(source.indexOf('function slugify(name)'), source.indexOf('function resolveProjectPath'));
    const handlerCode = source.slice(source.indexOf("ipcMain.handle('hermes:create-project'"),source.indexOf("ipcMain.handle('hermes:load-project'"));
    let create;
    const context = {fs,path,require,console,Date,FDE_DEFAULT_STAGE:1,ipcMain:{handle:(_,handler)=>create=handler},resolveProjectPath:slug=>path.join(root,slug),readProjectMeta:slug=>records.get(slug),writeProjectMeta:(slug,meta)=>records.set(slug,{...meta}),usageTracker:{trackProjectCreate(){}},acp:{request:async()=>{throw Error('引擎离线');}}};
    vm.runInNewContext(slugCode + handlerCode,context);
    const a=await create(null,{name:'甲医院AI项目',requirement:'甲需求',projectType:'fde-project'});
    const b=await create(null,{name:'乙医院AI项目',requirement:'乙需求',projectType:'fde-project'});
    assert.notEqual(a.slug,b.slug); assert.equal(b.requirement,'乙需求'); assert.equal(records.size,2);
    assert.equal(records.get(a.slug).sessionId,null); assert.match(a.sessionWarning,/已保存/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('直接进入交接也列出未开始步骤，空目标不能通过后台门禁', () => {
  const ctx=freshContext(), flow=stage1Steps(ctx);
  assert.deepEqual(flow.gaps.map(s=>s.id),['goal','materials','analysis','interview']);
  const root=temp();
  try {
    fs.mkdirSync(path.join(root,'.fde-flow'));
    const body=artifact('handoff.md');ctx.stage1.completion={by:'负责人',at:'2026-11-04',signature:fingerprint(body)};
    fs.writeFileSync(path.join(root,'.fde-flow/stage1-handoff.md'),body);
    fs.writeFileSync(path.join(root,'.fde-flow/context.json'),JSON.stringify(ctx));
    assert.ok(gate.gate(root,1).some(s=>s.includes('目标')));
    ctx.goal.text='了解客户需求';fs.writeFileSync(path.join(root,'.fde-flow/context.json'),JSON.stringify(ctx));
    assert.deepEqual(gate.gate(root,1),[]);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('PRD 变更传播到实施和签字，未变更的上游保持确认', async () => {
  const {state,files}=confirmedFiles();
  const api={readFile:async(_,file)=>files.has(file)?{success:true,content:files.get(file)}:{success:false,error:'不存在'},writeFile:async(_,file,content)=>{files.set(file,content);return {success:true};}};
  files.set('stage3/prd.md',files.get('stage3/prd.md')+'\n新增需求');
  const updated=await createFlowService(api,'p').refresh(state);
  assert.equal(updated.tasks['3:scope'].status,'confirmed');
  for (const key of ['3:final','3:handoff','4:demo','4:launch','5:signoff']) assert.equal(updated.tasks[key].status,'needs-review',key);
});
test('项目验收后文件变化重开待复核；未变化不重开', () => {
  const root=temp(),{files}=confirmedFiles();
  try {
    for (const [file,body] of files) {const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);}
    const meta={workflowMode:'product-flow-v1',stageStatus:{5:'done'},status:'completed'};
    assert.equal(reconcileCompletion(root,meta),false);
    fs.appendFileSync(path.join(root,'stage5/delivery-sign.md'),'\n修改交付范围');
    assert.equal(reconcileCompletion(root,meta),true);assert.equal(meta.stageStatus[5],'active');assert.equal(meta.status,'active');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('生命周期拒绝未来购买和无效日期，旧未来记录不算已购买', async () => {
  assert.equal(addMonths('2026-08-31',6),'2027-02-28');
  assert.equal(lifecycleStatus({launchAt:'2026-01-01',months:6,purchases:[{date:'2099-01-01'}]},'2026-11-04').status,'offline');
  const root=temp();
  try {
    const lib=createMaterialLibrary(root),agent=await lib.create({spaceId:'promo',title:'测试智能体',kind:'folder'});
    assert.throws(()=>lib.setLifecycle(agent.id,{launchAt:'2026-02-31',months:6,purchases:[]}),/日期不存在/);
    assert.throws(()=>lib.setLifecycle(agent.id,{launchAt:'2026-01-01',months:6,purchases:[{customer:'测试客户',date:'2099-01-01'}]}),/晚于今天/);
    lib.trash(agent.id);lib.restore(agent.id);assert.ok(!lib.state().entries.find(e=>e.id===agent.id).deletedAt);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
