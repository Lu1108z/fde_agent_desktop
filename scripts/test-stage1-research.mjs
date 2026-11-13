import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {createRequire} from 'node:module';
import {fingerprint} from '../src/renderer/data/project-flow.mjs';
import {freshContext,completion,dimensionHints,recommendations,advanceAdvice,mergeAnalysis,buildResearchPrompt,RESEARCH_JOBS,guessIndustry,markdownSections,stage1Steps,handoffMarkdown,CORE_DOCS,DELIVERABLES,TEMPLATES,checkDocument,stage1CarryPrompt,applyAnswered,addQuestions} from '../src/renderer/data/stage1-research.mjs';
import {buildTaskPrompt} from '../src/renderer/data/project-flow.mjs';
const gate=createRequire(import.meta.url)('../src/main/product-flow-gate.js');
test('project direction is detected so a newcomer can start',()=>{assert.deepEqual(guessIndustry('某三甲医院人事管理系统'),{industry:'医疗',direction:'人事管理'});const c=freshContext({requirement:'医院人事管理'});assert.equal(c.goal.focus,'了解业务与准备客户访谈');});
test('missing dimensions only hint, never block, and recommend next tasks',()=>{const c=freshContext({});c.dimensions.scenario.status='partial';const h=dimensionHints(c);assert.match(h,/业务场景已有初步信息/);assert.match(h,/数据系统.*尚不明确，建议在客户访谈中确认/);assert.equal(completion(c).percent,8);const r=recommendations(c,[]);assert.ok(r.some(x=>x.job==='outline'));});
test('analysis keeps stated facts separate from inferences and preserves manual dimensions',()=>{const c=freshContext({});c.dimensions.data={status:'complete',manual:true,summary:'人工',notes:'',sources:[]};const n=mergeAnalysis(c,{known:[{text:'医院有3000名员工',source:'knowledge/a.pdf'}],possible:[{text:'排班可能依赖Excel',basis:'行业经验'}],unconfirmed:[{question:'HIS是否开放接口',dimension:'data'}],dimensions:{data:{status:'missing'},scenario:{status:'partial',summary:'人事'}}});assert.equal(n.facts.known[0].kind,'stated');assert.equal(n.facts.possible[0].kind,'inferred');assert.equal(n.dimensions.data.status,'complete');assert.equal(n.dimensions.scenario.status,'partial');assert.equal(n.openQuestions.length,1);});
test('advance advice allows stage 2 with open questions when goal is clear',()=>{const c=freshContext({requirement:'医院人事管理智能化'});assert.equal(advanceAdvice(c,[]).mode,'with-questions');assert.equal(advanceAdvice(freshContext({}),[]).mode,'needs-goal');});
test('prompt reuses shared context and supports partial regeneration',()=>{const c=freshContext({requirement:'医院人事'});const p=buildResearchPrompt({job:RESEARCH_JOBS.outline,ctx:c,materials:[],summaryFile:'.fde-flow/results/x.json',section:'数据问题'});assert.match(p,/统一项目上下文/);assert.match(p,/只重新生成文档中「数据问题」/);assert.deepEqual(markdownSections('# 首轮访谈提纲\n## 一、访谈对象\n## 二、业务问题'),['首轮访谈提纲','访谈对象','业务问题']);});
test('stage 1 gate accepts owner confirmation and rejects edited handoff',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'fde-s1-'));try{fs.mkdirSync(path.join(root,'.fde-flow'));assert.ok(gate.gate(root,1).length);const body='# 阶段一交接\n'+'内容'.repeat(60);fs.writeFileSync(path.join(root,'.fde-flow/stage1-handoff.md'),body);const ctx=freshContext({requirement:'了解医院人事管理'});ctx.stage1.completion={by:'',at:'2026-10-30',signature:fingerprint(body)};fs.writeFileSync(path.join(root,'.fde-flow/context.json'),JSON.stringify(ctx));assert.ok(gate.gate(root,1).some(i=>i.includes('负责人')));ctx.stage1.completion.by='张经理';fs.writeFileSync(path.join(root,'.fde-flow/context.json'),JSON.stringify(ctx));assert.deepEqual(gate.gate(root,1),[]);fs.appendFileSync(path.join(root,'.fde-flow/stage1-handoff.md'),'改动');assert.ok(gate.gate(root,1).some(i=>i.includes('已变化')));}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('workflow only requires a goal; skipped steps are carried into the handoff',()=>{const c=freshContext({});let f=stage1Steps(c,[]);assert.equal(f.current,0);assert.equal(f.goalReady,false);c.goal.text='了解医院人事管理';f=stage1Steps(c,[]);assert.equal(f.current,1);c.stage1.passed={materials:true,analysis:true};f=stage1Steps(c,[]);assert.equal(f.steps[1].status,'skipped');assert.equal(f.current,3);c.deliverables['stage1/research-brief.md']={versions:[{status:'draft'}]};f=stage1Steps(c,[]);assert.equal(f.steps[3].status,'doing');c.stage1.passed.interview=true;f=stage1Steps(c,[]);assert.equal(f.steps[3].status,'partial');assert.equal(f.current,4);assert.deepEqual(f.gaps.map(s=>s.id),['materials','analysis','interview']);c.stage1.completion={by:'张经理',at:'x',skipped:f.gaps.map(s=>s.title)};assert.match(handoffMarkdown(c,[],[]),/跳过或未完成的步骤[\s\S]*收集资料/);assert.equal(stage1Steps(c,[{path:'knowledge/a.pdf'}]).steps[1].status,'done');});
test('step 4 orders the data survey before the interview outline and needs all five docs',()=>{const c=freshContext({});c.goal.text='了解医院人事管理';c.stage1.passed={materials:true,analysis:true};assert.deepEqual(CORE_DOCS,['stage1/research-brief.md','stage1/business-flow.md','stage1/data-flow.md','stage1/data-requirements.md','stage1/interview-outline.md']);for(const f of CORE_DOCS.slice(0,4))c.deliverables[f]={versions:[{status:'confirmed'}]};assert.equal(stage1Steps(c,[]).steps[3].status,'doing');c.deliverables[CORE_DOCS[4]]={versions:[{status:'uploaded'}]};assert.equal(stage1Steps(c,[]).steps[3].status,'done');for(const f of CORE_DOCS)assert.ok(DELIVERABLES.some(d=>d.file===f)&&Object.values(RESEARCH_JOBS).some(j=>j.files.includes(f)),f);});

test('blank templates keep the fixed sections, so only empty tables are flagged', () => {
  for (const file of CORE_DOCS) {
    const issues = checkDocument(file, TEMPLATES[file]());
    assert.ok(!issues.some(i => i.text.startsWith('缺少章节')), file + ' ' + JSON.stringify(issues));
  }
});

test('rule check flags direct DB links, unknown domains and empty required columns', () => {
  const flow = TEMPLATES['stage1/data-flow.md']().replace('SDR -->|标准化数据| AG[智能体]', 'SDR -->|标准化数据| AG[智能体]\n  S02[(LIS)] --> AG2[智能体]');
  assert.ok(checkDocument('stage1/data-flow.md', flow).some(i => i.text.includes('直连')));
  const req = TEMPLATES['stage1/data-requirements.md']().replace(/\| +\|.*\n(?=\n## 四)/, '| D-01 | 排班 | 床位 |  | 待确认 | FTP | 推测 | | | |\n');
  const texts = checkDocument('stage1/data-requirements.md', req).map(i => i.text);
  assert.ok(texts.some(t => t.includes('数据域「床位」')), JSON.stringify(texts));
  assert.ok(texts.some(t => t.includes('「数据内容」为空')));
  assert.ok(texts.some(t => t.includes('接入方式「FTP」')));
});

test('revise prompt keeps untouched content and ids', () => {
  const ctx = freshContext({ name: 'x' });
  const p = buildResearchPrompt({ job: RESEARCH_JOBS.bizflow, ctx, materials: [], summaryFile: 's.json', revise: '排班在 Excel 里做', section: '场景 P1' });
  assert.match(p, /修改意见：排班在 Excel 里做/);
  assert.match(p, /已有编号不改/);
  assert.match(p, /「场景 P1」这一部分/);
});

test('direct-link check resolves node ids to labels', () => {
  const doc = TEMPLATES['stage1/data-flow.md']().replace('SDR -->|标准化数据| AG[智能体]', 'SDR -->|标准化数据| AG[智能体]\n  S01 --> AG');
  assert.ok(checkDocument('stage1/data-flow.md', doc).some(i => i.text.includes('HIS → 智能体')));
  assert.ok(!checkDocument('stage1/data-flow.md', TEMPLATES['stage1/data-flow.md']()).some(i => i.text.includes('直连')));
});

test('stage 2 prompt carries stage 1 docs and numbered open questions', () => {
  const c = freshContext({ name: '医院' });
  addQuestions(c, [{ question: '考勤机能否导出', dimension: 'data', owner: '客户' }, { question: '夜班费规则', dimension: 'process' }], 't');
  const carry = stage1CarryPrompt(c, { 'stage1/data-flow.md': true });
  assert.ok(carry.includes('stage1/data-flow.md') && carry.includes('4.5 数据对接'));
  assert.ok(carry.includes('Q1 [数据系统] 考勤机能否导出（客户）') && carry.includes('Q2 [现有流程] 夜班费规则'));
  assert.ok(!carry.includes('stage1/business-flow.md'));
  const prompt = buildTaskPrompt({ stage: 2, round: 1, task: { title: 't' }, job: { files: ['x.md'], instruction: '' }, notes: '', summaryFile: 's.json', confirmations: {}, carry });
  assert.ok(prompt.includes('【承接阶段一】') && prompt.includes('"answered"'));
  assert.ok(!buildTaskPrompt({ stage: 2, round: 1, task: { title: 't' }, job: { files: ['x.md'], instruction: '' }, notes: '', summaryFile: 's.json', confirmations: {} }).includes('answered'));
});
test('answered questions from stage 2 resolve stage 1 questions', () => {
  const c = freshContext({});
  addQuestions(c, [{ question: 'A' }, { question: 'B' }], 't');
  assert.equal(applyAnswered(c, [{ id: 'Q2', answer: '是' }, { id: 'Q1', answer: '' }, { id: 'Q9', answer: 'x' }], 2), 1);
  const b = c.openQuestions.find(q => q.question === 'B');
  assert.equal(b.status, 'resolved'); assert.equal(b.resolvedIn, '阶段二第 2 轮'); assert.equal(b.answer, '是');
  assert.equal(c.openQuestions.find(q => q.question === 'A').status, 'open');
});
