// 端到端：从阶段二开始，按步骤工作台一路生成、核对，进入阶段三、四、五，最后验收完成项目。
// 需要 dev server（npm run dev，端口 43917）；AI 由 testBridge 模拟：收到生成指令就按指令里要求的文件写出符合模板的内容。
const assert=require('node:assert/strict');const fs=require('fs');const os=require('os');const path=require('path');
const {chromium}=require(process.env.FDE_PLAYWRIGHT||'/Users/luzhenpeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const integrity=require('../src/main/project-integrity');const flowGate=require('../src/main/product-flow-gate');
const {CONTACT_HEADERS,AI_HEADERS}={CONTACT_HEADERS:[['项目','内容'],['姓名','职务','项目角色','关注点'],['序号','需求描述','优先级','本期是否实施','备注（来源/约束）','是否涉及AI'],['步骤','节点/环节','执行角色','输入','处理动作','输出','涉及系统','异常/例外处理','AI嵌入'],['序号','数据项','源系统/厂商','数据内容','对接方式','可否提供','更新频率','责任人','就绪度AI影响'],['验收指标','目标值','验收方','AI专项验收口径']],AI_HEADERS:[['序号','AI能力','做什么','关联需求','效果指标','优先级','数据依赖度'],['定义项','内容'],['需求ID','需求描述','对应AI能力','是否本期实施'],['AI能力','验收口径','测试数据集','判定方']]};
const table=cols=>`| ${cols.join(' | ')} |\n|${cols.map(()=>'---').join('|')}|\n| ${cols.map((_,i)=>i?'示例':'1').join(' | ')} |\n`;
const contact=()=>['# 需求与数据对接确认表','## 一、基本信息','客户/单位 所属沟通轮次 遗留未定事项 AI能力确认结论','## 二、组织关系','## 三、本次结论与确认','## 四、业务场景','### 4.1 场景概述','业务目标 现状基线（As-Is） 业务痛点 期望效果（To-Be） AI介入价值','### 4.2 业务流程','### 4.3 需求清单','### 4.4 业务流程','### 4.5 数据对接','### 4.6 验收标准初稿',...CONTACT_HEADERS.map(table)].join('\n\n');
const ai=()=>['# AI能力清单','## 一、AI能力总览','## 二、AI能力详细定义','能力描述 关联需求 AI承担角色 输入 输出 数据依赖 验收口径 异常处理','## 三、AI能力与需求映射关系','## 四、AI验收口径汇总',...AI_HEADERS.map(table)].join('\n\n');
const html='<!doctype html><html><body><main><button onclick="go()">进入排班</button><a href="agent-tools.html">工具</a></main></body></html>';
function artifact(file){if(file==='stage2/contact-form.md')return contact();if(file==='stage2/ai-capability.md')return ai();if(file.endsWith('.html'))return html;return `# ${path.basename(file,'.md')}\n\n按知识中心模板整理的本项目成果。\n\n| 项 | 内容 |\n|---|---|\n| 状态 | 已整理，待研发确认的项已标注 |\n| 来源 | 本轮补充与上游成果 |\n`;}
(async()=>{
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fde-e2e-')),projectRoot=path.join(root,'project');fs.mkdirSync(projectRoot);
const meta={name:'端到端测试项目',projectType:'fde-project',stage:2,workflowMode:'product-flow-v1',requirement:'智能排班',stageStatus:{1:'done',2:'active',3:'todo',4:'todo',5:'todo'}};
integrity.write(projectRoot,'knowledge/首次对接.md','# 首次对接\n\n客户希望智能排班。');
integrity.write(projectRoot,'.fde-flow/context.json',JSON.stringify({version:1,customer:{name:'测试医院'},goal:{text:'排班'},openQuestions:[],skillRuns:[],steps:{}}));
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];const pass=m=>{results.push(m);console.log('PASS',m);};
const prompts=[];
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.stack);});page.on('dialog',d=>d.accept());
await page.exposeFunction('testBridge',async(ns,method,args)=>{try{
 if(ns==='license')return {success:true,ok:true,remainingDays:90};if(ns==='env')return {success:true,engine:{ok:true},apiKey:{configured:true},acp:{ok:true}};
 if(ns==='app')return 'test';if(ns==='window')return false;if(ns==='management')return {success:true,data:{records:[]}};if(ns==='activity')return {success:true,items:[]};if(ns==='projectCover')return {success:true,cover:null};
 if(ns==='skills'&&method==='read'){const target=path.join(__dirname,'..','skills',args[0],args[1]);return fs.existsSync(target)?{success:true,content:fs.readFileSync(target,'utf8')}:{success:false,error:'不存在'};}
 if(ns==='handbook'&&['readMd','readHtml','readEditable'].includes(method)){const name=method==='readEditable'?String(args[1]).replace(/\.docx$/,fs.existsSync(path.join(__dirname,'..','fde-handbook',args[0],String(args[1]).replace(/\.docx$/,'.md')))?'.md':'.html'):args[1];const target=path.join(__dirname,'..','fde-handbook',args[0],name);return fs.existsSync(target)?{success:true,content:fs.readFileSync(target,'utf8')}:{success:false,error:'file not found'};}
 if(ns==='library'){if(method==='list')return {success:true,spaces:[],entries:[]};if(method==='linked')return {success:true,entries:[]};}
 if(ns==='hermes'){
  if(method==='listProjects')return [{slug:'e2e',...meta}];if(method==='loadProject')return {meta,messages:[]};if(method==='listModels')return {models:[{id:'m',name:'m'}],current:'m'};if(method==='readConfigModel')return {model:'m'};
  if(method==='listFiles'){const files=[];const scan=(dir,prefix='')=>{if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory())scan(path.join(dir,e.name),prefix+e.name+'/');else files.push({name:e.name,relPath:prefix+e.name,path:path.join(dir,e.name),isDirectory:false});}};scan(path.join(projectRoot,args[1]||'knowledge'));return {success:true,files};}
  if(method==='readFile'){const target=path.join(projectRoot,args[1]);if(!fs.existsSync(target)||fs.statSync(target).isDirectory())return {success:false,error:'不存在'};const content=fs.readFileSync(target,'utf8');return {success:true,content,token:integrity.digest(content)};}
  if(method==='writeFile'){integrity.write(projectRoot,args[1],args[2],args[3]);return {success:true};}
  if(method==='mdToDocx')return {success:true,path:args[1].replace(/\.md$/,'.docx')};if(method==='docxPreview')return {success:true,html:'<p>Word预览</p>'};
  if(method==='openInBrowser')return {success:true};
  if(method==='updateProjectMeta'){const updates=args[1];const progressing=updates.stage!==undefined&&updates.stage!==meta.stage;const completing=updates.stageStatus?.[5]==='done'&&meta.stageStatus?.[5]!=='done';if(progressing||completing){if(progressing&&updates.stage!==meta.stage+1)throw Error('只能按顺序推进');const issues=flowGate.gate(projectRoot,meta.stage);if(issues.length)throw Error('请先完成验收：'+issues.join('；'));}Object.assign(meta,updates);return {success:true,meta};}
  if(method==='fileHistory')return {success:true,versions:integrity.versions(projectRoot,args[1])};
  if(method==='knowledgePassages')return {success:true,result:{text:'',passages:[]}};
  if(method==='prompt'){const text=String(args[1]||'');prompts.push(text);
   const m=/必须实际写入项目内这些成果：([^。]+)。/.exec(text);const summary=/写一份 UTF-8 JSON 摘要到 (\S+?\.json)/.exec(text);
   if(m){for(const file of m[1].split('、'))integrity.write(projectRoot,file,artifact(file));
    if(m[1].includes('prototype/index.html')||m[1].includes('stage3/prototype/index.html')){const dir=m[1].includes('stage3/prototype')?'stage3/prototype':'prototype';integrity.write(projectRoot,dir+'/agent-tools.html',html);for(const f of ['image/icon.png','image/bot.png'])integrity.write(projectRoot,dir+'/'+f,'png');}
    if(summary)integrity.write(projectRoot,summary[1],JSON.stringify({summary:'已按模板整理',changes:['首版'],questions:[],sources:['knowledge/首次对接.md']}));}
   return {success:true,stopReason:'end_turn'};}
  if(method==='cancel')return {success:true};
 }
 return {success:true};
}catch(e){return {success:false,error:e.message};}});
await page.addInitScript(()=>{const ns=names=>new Proxy({}, {get:(_,name)=>typeof name==='string'&&name.startsWith('on')?()=>()=>{}:(...args)=>window.testBridge(names,name,args)});window.api=new Proxy({}, {get:(_,name)=>ns(name)});});
await page.goto('http://127.0.0.1:43917/#/projects/e2e');
const card=page.locator('.step-card:visible');const foot=card.locator('.step-foot');
const head=page.locator('.fde-flow:visible .head');
async function runStep(title,{confirm}={}){
 await card.locator('h2').filter({hasText:title}).waitFor({timeout:8000});
 await card.locator('textarea').first().fill(`${title}：本轮补充`);
 if(confirm){const inputs=card.locator('.confirm-fields input');await inputs.nth(0).fill('客户张主任');await inputs.nth(1).fill('2026-11-03 评审会纪要');}
 const gen=foot.getByRole('button',{name:/整理|生成|完善/}).filter({hasNotText:'重新整理'}).first();await gen.click();
 const ok=foot.getByRole('button',{name:/核对完成|资料已核对/});await ok.waitFor({timeout:15000});
 await ok.click();
}
async function nextStage(n,label){const btn=foot.getByRole('button',{name:`进入阶段${label}`});await btn.waitFor({timeout:8000});await btn.click();await head.filter({hasText:`阶段${label}`}).waitFor({timeout:8000});assert.equal(meta.stage,n);}
// 阶段二
await runStep('整理并核对需求');await runStep('明确 AI 能力');await runStep('准备演示原型');
await card.locator('h2').filter({hasText:'记录反馈与收敛'}).waitFor();await card.locator('textarea').first().fill('方向认可，按科室排班');const fi=card.locator('.confirm-fields input');await fi.nth(0).fill('客户张主任');await fi.nth(1).fill('11-03 演示会');
await foot.getByRole('button',{name:'方向已认可，进入需求确认'}).click();await head.filter({hasText:'阶段三'}).waitFor({timeout:8000});assert.equal(meta.stage,3);
pass('阶段二四步完成，进入阶段三');
// 阶段三
await runStep('确认首版范围',{confirm:true});await runStep('完善产品方案');await runStep('PRD 与原型定稿');await runStep('整理研发交接');
await nextStage(4,'四');pass('阶段三四步完成，进入阶段四');
// 阶段四
await runStep('排定开发进度');
assert.ok(prompts.some(p=>p.includes('【知识中心模板 04/4-纳米Work项目进度表【交付】.md】')&&p.includes('M1 建模完成')),'未注入阶段四模板');await runStep('demo 走查');
// 上线核对需要确认人：先不填确认人点核对 → 按钮禁用
await card.locator('h2').filter({hasText:'上线核对'}).waitFor();await card.locator('textarea').first().fill('上线');await foot.getByRole('button',{name:'整理部署与上线核对'}).click();
const ok4=foot.getByRole('button',{name:/核对完成/});await ok4.waitFor({timeout:15000});assert.equal(await ok4.isDisabled(),true,'客户确认任务未填确认人也能核对');
const ci=card.locator('.confirm-fields input');await ci.nth(0).fill('信息科李工');await ci.nth(1).fill('11-03 上线验收');await ok4.click();
pass('阶段四生成走知识中心模板；上线核对必须登记确认人');
await nextStage(5,'五');pass('进入阶段五');
// 阶段五
await runStep('跟踪客户反馈');await runStep('三轮迭代定稿');await runStep('使用率盯防');await runStep('项目交付签字',{confirm:true});
await page.locator('.stage-done').filter({hasText:'可以验收并完成项目'}).waitFor();
await foot.getByRole('button',{name:'验收并完成项目'}).click();await page.locator('.stage-done').filter({hasText:'项目已验收完成'}).waitFor({timeout:8000});
assert.equal(meta.stageStatus[5],'done');
pass('阶段五四步完成，验收并完成项目');
for(const f of ['stage4/progress.md','stage4/deploy-doc.md','stage5/feedback-tracker.md','stage5/delivery-sign.md'])assert.ok(fs.existsSync(path.join(projectRoot,f)),f);
// 侧栏：阶段四、五都有步骤工作台和交付物
const sidebar=page.locator('.project-sidebar');
await sidebar.getByRole('button',{name:/客户反馈跟踪表|反馈跟踪表/}).first().click();await page.locator('.review-status').waitFor();await page.screenshot({path:'/tmp/fde-e2e-s5-doc.png'});
await sidebar.getByRole('button',{name:'步骤工作台'}).last().click();await card.first().waitFor();
pass('阶段五交付物能在侧栏打开，并能回到步骤工作台');
// 回看阶段四
const s4=sidebar.getByRole('button',{name:/阶段4/});if(await s4.getAttribute('aria-expanded')!=='true')await s4.click();await sidebar.getByRole('button',{name:'项目进度表'}).click();await page.locator('.review-status').waitFor();
await page.screenshot({path:'/tmp/fde-e2e-s4-doc.png'});
pass('已完成的阶段四可回看文档');
// 验收后的真实成果变更：回到工作台应重开项目，并允许复核后重新验收。
integrity.write(projectRoot,'stage5/delivery-sign.md',artifact('stage5/delivery-sign.md')+'\n\n更新交付范围，增加客户提出的需求。');
await page.reload();
await page.locator('.fde-flow:visible .rail').getByText(/需重新核对/).first().waitFor();
await page.waitForFunction(()=>!document.body.innerText.includes('项目已验收完成。'));
assert.equal(meta.stageStatus[5],'active');
const signInputs=card.locator('.confirm-fields input');await signInputs.nth(0).fill('客户张主任');await signInputs.nth(1).fill('修改后重新验收会议');
await foot.getByRole('button',{name:'核对完成，下一步'}).click();
await foot.getByRole('button',{name:'验收并完成项目'}).click();
await page.locator('.stage-done').filter({hasText:'项目已验收完成'}).waitFor();assert.equal(meta.stageStatus[5],'done');
pass('验收后修改会重开复核，重新确认后可再次验收');
assert.deepEqual(errors,[]);pass('页面无运行时异常');
}catch(e){console.error('FAIL',e.message.split('\n').slice(0,6).join(' | '));await browser.contexts()[0]?.pages()[0]?.screenshot({path:'/tmp/fde-e2e-fail.png'}).catch(()=>{});process.exitCode=1;}
finally{await browser.close();fs.rmSync(root,{recursive:true,force:true});console.log(`${results.length} passed`);}
})();
