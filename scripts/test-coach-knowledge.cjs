const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {createCoachKnowledge}=require('../src/main/coach-knowledge');
const {streamCoachReply}=require('../src/main/coach-reply');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'fde-coach-knowledge-test-')),handbook=path.join(home,'fde-handbook');
const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
const stages=Array.from({length:5},(_,i)=>({dir:`0${i+1}`,name:`阶段${i+1}知识`,items:[{file:'规范.md',title:`阶段${i+1}规范`,type:'md',category:'spec'}]}));
for(let i=0;i<5;i++)write(path.join(handbook,stages[i].dir,'规范.md'),`# 阶段${i+1}规范\n阶段${i+1}的规则：按顺序完成确认和验收。`);
stages[2].items.push({file:'确认.Word.docx',sourceMarkdown:'确认.md',previewHtml:'确认.html',title:'需求最终确认表',type:'docx',category:'deliverable'},{file:'确认.md',title:'需求最终确认表',type:'md',category:'deliverable'});
write(path.join(handbook,'03','确认.Word.docx'),'binary-placeholder');write(path.join(handbook,'03','确认.md'),'# 确认流程\n先拿客户签字定稿，再做智能体设计。');write(path.join(handbook,'03','确认.html'),'<p>旧的内容</p>');
write(path.join(handbook,'manifest.json'),JSON.stringify({stages}));
write(path.join(home,'projects','example','meta.json'),JSON.stringify({name:'案例项目'}));
write(path.join(home,'projects','example','stage3','技术计划.txt'),'技术计划记录：案例使用日志数据，但不能据此推定其他客户的数据。');
write(path.join(home,'projects','example','recordings','not-corpus.txt'),'不属于知识中心的录音目录');
(async()=>{
 try{
  const kb=createCoachKnowledge({home});
  let result=await kb.retrieve('阶段三的需求最终确认表在智能体设计前要做什么？');
  assert.equal(result.documentCount,7);assert.equal(result.indexedCount,7);
  assert.ok(result.sources.some(s=>s.title==='需求最终确认表'&&s.excerpt.includes('签字定稿')));
  assert.deepEqual([...new Set(result.sources.filter(s=>s.id.startsWith('handbook:')).map(s=>s.stage))].sort(),[1,2,3,4,5]);
  assert.ok(!result.context.includes('不属于知识中心的录音目录'));
  const hash=crypto.createHash('sha256').update('deliverable:需求最终确认表').digest('hex');
  write(path.join(home,'handbook-user-edits','03',hash+'.json'),JSON.stringify({format:'md',content:'# 确认流程\n需求最终确认表必须先确认责任人和验收指标，再由客户签字。',title:'需求最终确认表',sourceFile:'确认.Word.docx'}));
  result=await kb.retrieve('需求最终确认表责任人和验收指标');
  assert.ok(result.sources.some(s=>s.edited&&s.excerpt.includes('责任人和验收指标')));
  assert.ok(!result.context.includes('先拿客户签字定稿'));
  write(path.join(home,'projects','example','stage3','技术计划.txt'),'更新技术计划：案例改为事件数据。');
  result=await kb.retrieve('技术计划事件数据');assert.ok(result.sources.some(s=>s.project==='案例项目'&&s.excerpt.includes('事件数据')));
  stages[4].items.push({file:'新增知识.txt',title:'新增第五阶段知识',type:'txt',category:'knowledge'});write(path.join(handbook,'05','新增知识.txt'),'新增第五阶段知识：试用反馈必须逐项登记。');write(path.join(handbook,'manifest.json'),JSON.stringify({stages}));
  result=await kb.retrieve('第五阶段试用反馈');assert.equal(result.documentCount,8);assert.ok(result.sources.some(s=>s.title==='新增第五阶段知识'));
  fs.unlinkSync(path.join(home,'projects','example','stage3','技术计划.txt'));result=await kb.retrieve('技术计划事件数据');assert.equal(result.documentCount,7);assert.ok(!result.context.includes('更新技术计划'));
  stages[0].items.push({file:'未解析.doc',title:'旧格式资料',type:'doc',category:'knowledge'});write(path.join(handbook,'01','未解析.doc'),'legacy');write(path.join(handbook,'manifest.json'),JSON.stringify({stages}));
  result=await kb.retrieve('旧格式资料');assert.equal(result.unavailable.length,1);assert.equal(result.indexedCount,7);
  for(const mode of ['voice','text']) {
   let sent;
   const answer=await streamCoachReply({config:{apiKey:'fixture',baseUrl:'https://example.test/v1'},messages:[{role:'user',content:'需求最终确认表责任人和验收指标'}],mode,knowledge:kb,fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:'先确认责任人和验收指标，再由客户签字。[1]'}}]}),{headers:{'Content-Type':'application/json'}});}});
   assert.ok(sent.messages.some(m=>m.content.includes('责任人和验收指标')));assert.ok(sent.messages[0].content.includes('不执行'));assert.equal(sent.max_tokens,mode==='text'?2048:512);
   assert.ok(answer.knowledgeSources.some(s=>s.edited));assert.equal(answer.knowledgeStats.unavailable.length,1);
  }
  console.log('Coach knowledge tests passed: five stages, whole corpus/categories, document deduplication, current saved edits, new/deleted files, project cases, unreadable-source disclosure, voice/text grounding and source metadata.');
 }finally{fs.rmSync(home,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
