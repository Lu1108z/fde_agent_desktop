// 交互状态回归：确认/取消确认、AI 运行中返回工作台、跨阶段拦截提示、阶段二承接卡打开阶段一文档、阶段一左侧点文档。
// 需要 dev server（npm run dev，端口 43917）在跑；后端由 testBridge 模拟，prompt 可挂起以模拟「AI 运行中」。
const assert=require('node:assert/strict');const fs=require('fs');const os=require('os');const path=require('path');
const {chromium}=require(process.env.FDE_PLAYWRIGHT||'/Users/luzhenpeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const integrity=require('../src/main/project-integrity');
(async()=>{
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fde-ui-interaction-')),projectRoot=path.join(root,'project');fs.mkdirSync(projectRoot);
const meta={name:'交互测试项目',projectType:'fde-project',stage:2,requirement:'梳理运营指标',stageStatus:{1:'done',2:'active',3:'todo',4:'todo',5:'todo'},stageReviews:{1:{kind:'stage',state:'confirmed',reviewer:'测试',evidence:'测试',checks:[{title:'x',confirmed:true}]}}};
for(const d of require('../src/shared/project-workflow.json')['2'])integrity.write(projectRoot,d.file,`# ${d.name}\n\n## 概述\n\n${d.name}正文`);
for(const [file,name] of [['stage1/research-brief.md','调研准备要点'],['stage1/business-flow.md','业务流转图']])integrity.write(projectRoot,file,`# ${name}\n\n${name}正文内容`);
integrity.write(projectRoot,'knowledge/首次对接.md','# 首次对接\n\n客户希望梳理运营指标。');
integrity.write(projectRoot,'.fde-flow/context.json',JSON.stringify({version:1,customer:{name:'测试医院'},goal:{text:'梳理指标'},openQuestions:[{question:'床位阈值由谁定？',owner:'客户',status:'open'}],skillRuns:[],steps:{}}));
let releasePrompt=null,holdRevise=false;const calls=[];
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
const pass=m=>{results.push(m);console.log('PASS',m);};
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.stack);});page.on('dialog',d=>d.accept());
await page.exposeFunction('testBridge',async(ns,method,args)=>{calls.push({ns,method});try{
 if(ns==='license')return {success:true,ok:true,remainingDays:90};if(ns==='env')return {success:true,engine:{ok:true},apiKey:{configured:true},acp:{ok:true}};
 if(ns==='app')return 'test';if(ns==='window')return false;if(ns==='management')return {success:true,data:{records:[]}};if(ns==='activity')return {success:true,items:[]};if(ns==='projectCover')return {success:true,cover:null};
 if(ns==='skills'&&method==='read'){const target=path.join(__dirname,'..','skills',args[0],args[1]);return fs.existsSync(target)?{success:true,content:fs.readFileSync(target,'utf8')}:{success:false,error:'不存在'};}
 if(ns==='library'){if(method==='list')return {success:true,spaces:[],entries:[]};if(method==='linked')return {success:true,entries:[]};}
 if(ns==='hermes'){
  if(method==='listProjects')return [{slug:'test-project',...meta}];if(method==='loadProject')return {meta,messages:[]};if(method==='listModels')return {models:[{id:'m',name:'m'}],current:'m'};if(method==='readConfigModel')return {model:'m'};
  if(method==='listFiles'){const files=[];const scan=(dir,prefix='')=>{if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory())scan(path.join(dir,e.name),prefix+e.name+'/');else files.push({name:e.name,relPath:prefix+e.name,path:path.join(dir,e.name),isDirectory:false});}};scan(path.join(projectRoot,args[1]||'knowledge'));return {success:true,files};}
  if(method==='readFile'){const target=path.join(projectRoot,args[1]);if(!fs.existsSync(target)||fs.statSync(target).isDirectory())return {success:false,error:'不存在'};const content=fs.readFileSync(target,'utf8');return {success:true,content,token:integrity.digest(content)};}
  if(method==='writeFile'){integrity.write(projectRoot,args[1],args[2],args[3]);return {success:true};}
  if(method==='mdToDocx')return {success:true,path:args[1].replace(/\.md$/,'.docx')};if(method==='docxPreview')return {success:true,html:'<p>Word预览</p>'};
  if(method==='updateProjectMeta'){const updates=args[1];if(updates.stage!==undefined&&updates.stage!==meta.stage){const issues=integrity.gate(projectRoot,meta,meta.stage);if(issues.length)throw Error('请先完成验收：'+issues.join('；'));}Object.assign(meta,updates);return {success:true,meta};}
  if(method==='fileHistory')return {success:true,versions:integrity.versions(projectRoot,args[1])};
  if(method==='knowledgePassages'){const {extractFileText,retrievePassages}=require('../src/main/knowledge-retrieval');const result=await extractFileText(path.join(projectRoot,args[1]),path.extname(args[1]).slice(1));return {success:true,result:{...result,passages:retrievePassages(result.text||'',args[2]||'')}};}
  if(method==='prompt'){const text=String(args[1]||'');if(text.includes('【按意见修改交付物】')&&!holdRevise){const file=/\`([^`]+)\`/.exec(text)[1];integrity.write(projectRoot,file,fs.readFileSync(path.join(projectRoot,file),'utf8')+'\n\n## 按意见补充\n\n按科室统计');return {success:true,stopReason:'end_turn'};}return await new Promise(r=>{releasePrompt=()=>{releasePrompt=null;r({success:true,stopReason:'cancelled'});};});}
  if(method==='cancel'){releasePrompt?.();return {success:true};}
 }
 return {success:true};
}catch(e){return {success:false,error:e.message};}});
await page.addInitScript(()=>{const ns=names=>new Proxy({}, {get:(_,name)=>typeof name==='string'&&name.startsWith('on')?()=>()=>{}:(...args)=>window.testBridge(names,name,args)});window.api=new Proxy({}, {get:(_,name)=>ns(name)});});
const toast=text=>page.getByText(text).first().waitFor({timeout:5000});
const sidebar=page.locator('.project-sidebar');

await page.goto('http://127.0.0.1:43917/#/projects/test-project');
// 场景 A：阶段二打开对接确认表，直接确认，取消确认
await sidebar.getByRole('button',{name:/对接确认表/}).first().click();
const status=page.locator('.review-status');await status.filter({hasText:'草稿'}).waitFor();
assert.equal(await page.getByRole('button',{name:'送审'}).count(),0);
await page.getByRole('button',{name:'确认这份文档'}).click();await status.filter({hasText:'已确认'}).waitFor();
assert.equal(meta.deliverableReviews['stage2/contact-form.md'].state,'confirmed');
assert.equal(meta.deliverableReviews['stage2/contact-form.md'].token,integrity.digest(fs.readFileSync(path.join(projectRoot,'stage2/contact-form.md'))));
pass('文档无送审，草稿直接确认，记录的是当前版本');
await page.getByRole('button',{name:'取消确认'}).click();await status.filter({hasText:'草稿'}).waitFor();assert.equal(meta.deliverableReviews['stage2/contact-form.md'],undefined);
await page.getByRole('button',{name:'确认这份文档'}).waitFor();pass('取消确认后回到草稿，可再次确认');
assert.equal(await page.locator('#project-reading-assistant').count(),0);assert.equal(await page.locator('.assistant-collapsed-rail').count(),0);
pass('右侧 AI 助手不再显示');
await page.getByRole('button',{name:'确认这份文档'}).click();await status.filter({hasText:'已确认'}).waitFor();
await page.getByRole('button',{name:'按意见修改'}).first().click();await page.locator('.revise-bar textarea').fill('指标改成按科室统计');await page.screenshot({path:'/tmp/fde-revise.png'});await page.locator('.revise-bar').getByRole('button',{name:'按意见修改'}).click();
await page.getByText('按科室统计').first().waitFor({timeout:8000});await status.filter({hasText:'草稿'}).waitFor();
assert.match(fs.readFileSync(path.join(projectRoot,'stage2/contact-form.md'),'utf8'),/按科室统计/);
pass('按意见修改：写回文件、正文刷新，之前的确认自动失效回到草稿');
holdRevise=true;await page.getByRole('button',{name:'按意见修改'}).first().click();await page.locator('.revise-bar textarea').fill('再改一处');await page.locator('.revise-bar').getByRole('button',{name:'按意见修改'}).click();
const bar=page.locator('.ai-run-bar');await bar.waitFor();await page.screenshot({path:'/tmp/fde-run-bar.png'});assert.match(await bar.innerText(),/对接确认表|交付物/);
await bar.getByRole('button',{name:'停止'}).click();await bar.waitFor({state:'detached',timeout:8000});holdRevise=false;
assert.ok(await page.getByRole('button',{name:'按意见修改'}).first().isEnabled());
pass('修改进行中顶部显示运行条，点停止后恢复可操作');
// 场景 B：打开文档后能用顶部返回条和左侧「步骤工作台」回去
await page.locator('.stage1-back').click();await page.locator('.step-card:visible').first().waitFor();assert.equal(await page.locator('.stage1-back').count(),0);
pass('从对接确认表点顶部返回条回到阶段二步骤工作台');
await sidebar.getByRole('button',{name:/对接确认表/}).first().click();await status.waitFor();
await sidebar.getByRole('button',{name:'步骤工作台'}).first().click();await page.locator('.step-card:visible').first().waitFor();
pass('从左侧「步骤工作台」也能回去');
// 场景 IME：自动保存时输入框不能被禁用（禁用会打断正在组字的中文输入法，留下拼音字母）
const notesBox=page.locator('.step-card:visible textarea').first();await notesBox.click();
await notesBox.evaluate(el=>{window.__disabledHits=0;new MutationObserver(()=>{if(el.disabled)window.__disabledHits++;}).observe(el,{attributes:true,attributeFilter:['disabled']});});
const statePath=path.join(projectRoot,'.fde-flow/state.json');
await notesBox.pressSequentially('你好按科室统计',{delay:40});await page.waitForTimeout(2200);
assert.match(fs.readFileSync(statePath,'utf8'),/你好按科室统计/,'停顿后没有自动保存');
assert.equal(await page.evaluate(()=>window.__disabledHits),0,'自动保存期间输入框被禁用');
await notesBox.dispatchEvent('compositionstart');await notesBox.pressSequentially('abc',{delay:40});await page.waitForTimeout(2200);
assert.doesNotMatch(fs.readFileSync(statePath,'utf8'),/统计abc/,'组字中触发了保存');await notesBox.dispatchEvent('compositionend');
pass('自动保存不禁用输入框；输入法组字中不保存');
// 场景 C：阶段二承接卡打开阶段一文档
const carryDoc=page.locator('.carry-doc').filter({hasText:'调研准备要点'});await carryDoc.waitFor();await carryDoc.click();
await page.locator('nav.rail[aria-label="阶段一流程"]:visible').waitFor();await page.locator('.doc-tab.on').filter({hasText:'调研准备要点'}).waitFor();
assert.equal(await page.getByRole('button',{name:'确认这份文档'}).count(),0);
pass('承接卡点阶段一文档：切到阶段一工作台第 4 步并选中该文档，不出现阶段二的确认按钮');
// 场景 E：AI 运行中——阶段一启动一次生成，挂起 prompt
await page.locator('.extras').getByText('可选：辅助材料').click();
await page.locator('.rows li').first().getByRole('button',{name:/生成/}).click();
await page.locator('.job').waitFor();for(let i=0;i<50&&!releasePrompt;i++)await page.waitForTimeout(100);assert.ok(releasePrompt,'prompt 未发出');
pass('阶段一生成中显示运行面板（含停止）');
await sidebar.getByRole('button',{name:'步骤工作台'}).first().click();await toast('完成或停止后才能切换阶段');assert.ok(await page.locator('nav.rail[aria-label="阶段一流程"]:visible').count());
pass('运行中点阶段二：被拦下并提示原因');
await sidebar.getByRole('button',{name:/对接确认表/}).first().click();await toast('完成或停止后才能切换阶段');
pass('运行中点阶段二的文档：同样拦下并提示');
await page.locator('nav.rail[aria-label="阶段一流程"]:visible').getByText('项目资料').click();await page.locator('.research-continue').waitFor();
const back=page.locator('.stage1-back');assert.equal(await back.isDisabled(),false);await back.click();await page.locator('.job').waitFor();
pass('运行中进入阶段一资料页，用顶部返回条回工作台，运行面板仍在');
await sidebar.getByRole('button',{name:'项目资料'}).click();await page.waitForTimeout(300);await page.locator('.stage1-back, .research-continue button').first().waitFor().catch(()=>{});
await sidebar.getByRole('button',{name:'调研工作台'}).first().click();await page.locator('.job').waitFor();
pass('运行中切到项目资料再回来，运行面板仍在');
await page.locator('.job').getByRole('button',{name:'停止'}).click();await page.locator('.job').waitFor({state:'detached',timeout:8000});
await sidebar.getByRole('button',{name:'步骤工作台'}).first().click();await page.locator('.step-card:visible').first().waitFor();
pass('停止后面板消失，可以切到阶段二');
assert.deepEqual(errors,[]);pass('页面无运行时异常');
}catch(e){console.error("FAIL",e.message.split("\n").slice(0,4).join(" | "));await browser.contexts()[0]?.pages()[0]?.screenshot({path:'/tmp/fde-interaction-fail.png'}).catch(()=>{});process.exitCode=1;}
finally{await browser.close();fs.rmSync(root,{recursive:true,force:true});console.log(`${results.length} passed`);}
})();
