// 宣传物料：资料库后端真实跑（新建智能体文件夹、上传 PPT/Word/视频、预览、下载），界面用 Playwright + 真实 library 模块做后端。
// 需要 dev server（npm run dev，端口 43917）。样例文件通过环境变量 FDE_PROMO_PPT / FDE_PROMO_MP4 指定，未指定时用仓库内手册 docx 代替。
const assert=require('node:assert/strict');const fs=require('fs');const os=require('os');const path=require('path');const http=require('http');
const {chromium}=require(process.env.FDE_PLAYWRIGHT||'/Users/luzhenpeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createMaterialLibrary}=require('../src/main/material-library');const {previewFile}=require('../src/main/material-preview');
(async()=>{
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fde-promo-'));const lib=createMaterialLibrary(path.join(root,'lib'));
const docx=process.env.FDE_PROMO_DOCX||path.join(__dirname,'..','fde-handbook/01/0-阶段一规范说明.Word.docx');
const ppt=process.env.FDE_PROMO_PPT,mp4=process.env.FDE_PROMO_MP4;
// 本地媒体服务：模拟主进程的 /media，支持 Range
const media=new Map();const server=http.createServer((req,res)=>{const file=media.get(new URL(req.url,'http://x').searchParams.get('t'));if(!file){res.writeHead(404);return res.end();}const total=fs.statSync(file).size;const m=/bytes=(\d*)-(\d*)/.exec(req.headers.range||'');if(m){const start=+m[1]||0,end=m[2]?+m[2]:total-1;res.writeHead(206,{'Content-Type':file.endsWith('.mp4')?'video/mp4':file.endsWith('.png')?'image/png':'application/pdf','Content-Range':`bytes ${start}-${end}/${total}`,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Access-Control-Allow-Origin':'*'});fs.createReadStream(file,{start,end}).pipe(res);}else{res.writeHead(200,{'Content-Type':file.endsWith('.mp4')?'video/mp4':file.endsWith('.png')?'image/png':'application/pdf','Content-Length':total,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'});fs.createReadStream(file).pipe(res);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const mediaUrl=file=>{const t=String(media.size+1);media.set(t,file);return `http://127.0.0.1:${port}/media?t=${t}`;};
let pendingUpload=[];const downloads=[];
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];const pass=m=>{results.push(m);console.log('PASS',m);};
try{
assert.ok(lib.state().spaces.some(s=>s.id==='promo'&&s.title==='宣传物料'),'宣传物料空间未初始化');pass('资料库自动带「宣传物料」空间');
const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.stack);});
await page.exposeFunction('testBridge',async(ns,method,args)=>{try{
 if(ns==='license')return {success:true,ok:true,remainingDays:90};if(ns==='env')return {success:true,engine:{ok:true},apiKey:{configured:true},acp:{ok:true}};
 if(ns==='app')return 'test';if(ns==='window')return false;if(ns==='activity')return {success:true,items:[]};
 if(ns==='library'){
  const p=args[0];
  if(method==='list')return {success:true,...lib.state()};
  if(method==='create')return {success:true,entry:await lib.create(p)};
  if(method==='rename')return {success:true,entry:lib.rename(args[0],args[1])};
  if(method==='trash'){lib.trash(args[0]);return {success:true};}
  if(method==='upload'){assert.ok(p.filters?.[0]?.extensions.includes('pptx')&&p.filters[0].extensions.includes('mp4'));const entries=await lib.upload({spaceId:p.spaceId,parentId:p.parentId,paths:pendingUpload});return {success:true,entries};}
  if(method==='read'){const d=await lib.read(args[0]);if(d.format==='file'||d.format==='slides'&&d.path)d.url=mediaUrl(d.path);if(d.originalPath){d.originalUrl=mediaUrl(d.originalPath);delete d.originalPath;}return {success:true,document:d};}
  if(method==='export'){const target=path.join(root,'downloads',path.basename(await lib.locate(args[0])));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(await lib.locate(args[0]),target);downloads.push(target);return {success:true};}
  if(method==='thumbnail'){const file=await lib.locate(args[0]);const out=path.join(root,'thumbs',args[0]);fs.mkdirSync(out,{recursive:true});try{require('child_process').execFileSync('qlmanage',['-t','-s','720','-o',out,file],{stdio:'ignore',timeout:20000});}catch(_){}const png=fs.readdirSync(out).find(f=>f.endsWith('.png'));return {success:true,url:png?mediaUrl(path.join(out,png)):''};}
  if(method==='lifecycle')return {success:true,entry:lib.setLifecycle(args[0],args[1])};
  if(method==='history')return {success:true,versions:[]};
 }
 if(ns==='hermes'&&method==='listProjects')return [];
 return {success:true};
}catch(e){return {success:false,error:e.message};}});
await page.addInitScript(()=>{const ns=names=>new Proxy({}, {get:(_,name)=>typeof name==='string'&&name.startsWith('on')?()=>()=>{}:(...args)=>window.testBridge(names,name,structuredClone(args))});window.api=new Proxy({}, {get:(_,name)=>ns(name)});});
await page.goto('http://127.0.0.1:43917/#/library/promo');
await page.getByText('先新建一个智能体').waitFor();
// 资源菜单里有入口
assert.ok(await page.getByText('宣传物料').count()>=1);
await page.locator('.side-h').getByRole('button',{name:'新建'}).click();await page.getByPlaceholder('例如：智能排班助手').fill('智能排班助手');await page.locator('.t-dialog__ctx:visible').getByRole('button',{name:'保存'}).click();
await page.locator('.main-h h1').filter({hasText:'智能排班助手'}).waitFor();pass('新建智能体');
pendingUpload=[docx,...(ppt?[ppt]:[]),...(mp4?[mp4]:[])];
await page.locator('.main-h').getByRole('button',{name:'上传物料'}).click();await page.locator('.card').nth(pendingUpload.length-1).waitFor();
assert.equal(await page.locator('.card').count(),pendingUpload.length);pass(`上传 ${pendingUpload.length} 份物料，按卡片展示`);
await page.locator('.filters button').filter({hasText:'Word'}).click();assert.equal(await page.locator('.card').count(),1);
await page.locator('.filters button').filter({hasText:'全部'}).click();pass('按类型筛选');
// 全部物料：另一个智能体也放一份，总览里两边的物料都在，并标出所属智能体；刷新后默认进总览
{const other=await lib.create({spaceId:'promo',parentId:null,title:'另一个智能体',kind:'folder'});await lib.upload({spaceId:'promo',parentId:other.id,paths:[docx],title:'另一份介绍.docx'});
await page.reload();await page.locator('.main-h h1').filter({hasText:'全部物料'}).waitFor();
assert.equal(await page.locator('.card').count(),pendingUpload.length+1,'总览没有包含所有智能体的物料');
assert.ok((await page.locator('.card-agent').allInnerTexts()).some(t=>t.includes('另一个智能体')),'总览卡片未标出所属智能体');
assert.equal(await page.locator('.main-h').getByRole('button',{name:'上传物料'}).count(),0);
lib.trash(other.id);await page.reload();await page.locator('.agent').filter({hasText:'智能排班助手'}).click();await page.locator('.main-h h1').filter({hasText:'智能排班助手'}).waitFor();pass('全部物料：所有智能体的物料一起展示并标出所属');}
await page.waitForFunction(()=>document.querySelectorAll('.card .thumb img').length>=2,null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(600);await page.screenshot({path:'/tmp/fde-promo-grid.png'});
// Word 在线预览
await page.locator('.card').filter({hasText:path.basename(docx,'.docx').replace(/\.Word$/,'')}).locator('.card-main').click();
await page.locator('.viewer .docx-host section.docx').first().waitFor({timeout:20000});await page.waitForTimeout(500);
assert.equal(await page.locator('.viewer .document-paper').count(),0,'回退到了简化排版');assert.ok((await page.locator('.viewer section.docx').first().innerText()).length>50);
const pageBox=await page.locator('.viewer section.docx').first().evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight}));assert.ok(pageBox.w>=700&&pageBox.w<=900&&pageBox.h>=1000,'不是按纸张尺寸分页：'+JSON.stringify(pageBox));await page.screenshot({path:'/tmp/fde-promo-word.png'});await page.screenshot({path:'/tmp/fde-promo-word.png'});pass('Word 按原件纸张和排版预览');
await page.locator('.viewer-h').getByRole('button',{name:'下载到本地'}).click();await page.waitForTimeout(300);
assert.equal(downloads.length,1);assert.equal(fs.readFileSync(downloads[0]).length,fs.statSync(docx).size);pass('下载到本地：文件与原件一致');
await page.locator('.viewer-h').getByRole('button',{name:/返回/}).click();await page.locator('.grid').waitFor();
if(ppt){await page.locator('.card').filter({hasText:path.basename(ppt,path.extname(ppt))}).locator('.card-main').click();await page.locator('.viewer .pdf-preview, .viewer .pptx-host .pptx-preview-slide-wrapper').first().waitFor({timeout:60000});await page.waitForTimeout(1500);
 const slideCount=await page.locator('.viewer .pptx-preview-slide-wrapper').count();assert.equal(await page.locator('.viewer .slides-preview').count(),0,'回退到了文字预览');
 await page.screenshot({path:'/tmp/fde-promo-ppt.png'});const s6=page.locator('.viewer .pptx-preview-slide-wrapper').nth(5);if(await s6.count()){await s6.scrollIntoViewIfNeeded();await s6.screenshot({path:'/tmp/fde-promo-ppt-s6.png'});}
 pass(`PPT 按原版式在线预览（${slideCount} 页）`);
 // 放映：从头放映 → 方向键翻页 → 点击翻页 → Esc 退出并停在当前页
 await page.locator('.pptx-bar').getByRole('button',{name:'从头放映'}).click();const hud=page.locator('.show-hud span');await hud.filter({hasText:`1 / ${slideCount}`}).waitFor();
 const box=async()=>page.locator('.pptx-preview-slide-wrapper.show-current').evaluate(el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height,l:r.left,t:r.top};});
 const b=await box();assert.ok((Math.abs(b.w-1440)<2||Math.abs(b.h-960)<2)&&Math.abs(b.l+b.w/2-720)<2&&Math.abs(b.t+b.h/2-480)<2,'放映页没有居中铺满屏幕：'+JSON.stringify(b));assert.equal(await page.locator('.pptx-preview-slide-wrapper:visible').count(),1);
 for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');await hud.filter({hasText:`6 / ${slideCount}`}).waitFor();await page.screenshot({path:'/tmp/fde-promo-show.png'});
 await page.mouse.click(1200,400);await hud.filter({hasText:`7 / ${slideCount}`}).waitFor();await page.mouse.click(100,400);await hud.filter({hasText:`6 / ${slideCount}`}).waitFor();
 await page.keyboard.press('End');await hud.filter({hasText:`${slideCount} / ${slideCount}`}).waitFor();await page.keyboard.press('ArrowRight');await hud.filter({hasText:`${slideCount} / ${slideCount}`}).waitFor();
 await page.keyboard.press('Escape');await page.locator('.show-hud').waitFor({state:'detached'});assert.equal(await page.locator('.pptx-preview-slide-wrapper:visible').count(),slideCount);
 pass('幻灯片放映：全屏单页、键盘/点击翻页、Esc 退出');await page.locator('.viewer-h').getByRole('button',{name:/返回/}).click();}
if(mp4){await page.locator('.card').filter({hasText:path.basename(mp4,path.extname(mp4))}).locator('.card-main').click();const v=page.locator('.viewer video');await v.waitFor({timeout:15000});await page.waitForFunction(()=>document.querySelector('.viewer video')?.readyState>=1,null,{timeout:15000});assert.ok(await v.evaluate(el=>el.duration>0));await page.screenshot({path:'/tmp/fde-promo-video.png'});pass('视频在线播放（已读到时长）');await page.locator('.viewer-h').getByRole('button',{name:/返回/}).click();}
// 下载卡片上的按钮
await page.locator('.card').first().getByRole('button',{name:'下载'}).click();await page.waitForTimeout(300);assert.equal(downloads.length,2);pass('卡片上直接下载');
// 删除：预览页删单个文件 → 回到卡片；删智能体连同物料；都能从回收站恢复
const before=await page.locator('.card').count();const firstTitle=(await page.locator('.card-title').first().innerText()).trim();
await page.locator('.card').first().locator('.card-main').click();await page.locator('.viewer-h').waitFor();await page.locator('.viewer-h').getByRole('button',{name:'删除'}).click();
await page.locator('.t-dialog').filter({hasText:'删除这份物料'}).getByRole('button',{name:'删除'}).click();await page.locator('.viewer-h').waitFor({state:'detached'});
await page.waitForFunction(n=>document.querySelectorAll('.card').length===n||(n===0&&document.querySelector('.drop-empty')),before-1);
const trashedItem=lib.state().entries.find(e=>e.title.replace(/\.[^.]+$/,'')===firstTitle);assert.ok(trashedItem?.deletedAt,'文件未进回收站');pass('预览页可以删除文件，回到卡片列表');
const agentEntry=lib.state().entries.find(e=>e.title==='智能排班助手');
await page.locator('.main-h').getByRole('button',{name:'删除智能体'}).click();await page.locator('.t-dialog').filter({hasText:'删除智能体'}).locator('.t-dialog__footer').getByRole('button',{name:'删除'}).click();
await page.getByText('先新建一个智能体').waitFor();assert.ok(lib.state().entries.filter(e=>e.spaceId==='promo').every(e=>e.deletedAt),'智能体或其物料未全部删除');assert.equal(await page.locator('.agent').count(),0);pass('文件夹（智能体）连同物料一起删除');
lib.restore(agentEntry.id);assert.ok(!lib.state().entries.find(e=>e.id===agentEntry.id).deletedAt);pass('删除的内容可从回收站恢复');
// 生命周期：设置推广日 → 推广中；过期没人买 → 已下线分组；登记购买 → 长期在线；重新上线
const ag=lib.state().entries.find(e=>e.id===agentEntry.id);await page.reload();await page.locator('.agent').first().click();
await page.getByRole('button',{name:'设置生命周期'}).click();await page.locator('.t-dialog__ctx:visible').getByRole('button',{name:'保存'}).click();
await page.locator('.life.active').waitFor();assert.equal(lib.state().entries.find(e=>e.id===ag.id).lifecycle.months,6);assert.match(await page.locator('.agent').first().innerText(),/推广中 · 剩 1\d\d 天/);pass('设置生命周期：默认 6 个月，显示推广中和剩余天数');
lib.setLifecycle(ag.id,{launchAt:'2025-01-01',months:6,purchases:[]});await page.reload();
await page.getByRole('button',{name:/推广结束/}).waitFor();assert.equal(await page.locator('.agent:not(.offline)').count(),0);await page.getByRole('button',{name:/推广结束/}).click();await page.locator('.agent.offline').click();
await page.locator('.life.offline').waitFor();await page.screenshot({path:'/tmp/fde-life-offline.png'});pass('过期没人买：移到「已下线」分组（默认收起）');
await page.getByRole('button',{name:'登记购买'}).click();await page.getByPlaceholder('例如：上海市第一人民医院').fill('上海市第一人民医院');await page.getByRole('button',{name:'登记',exact:true}).click();
await page.locator('.life.sold').waitFor();assert.equal(await page.locator('.agent.offline').count(),0);assert.match(await page.locator('.buyers').innerText(),/上海市第一人民医院/);await page.screenshot({path:'/tmp/fde-life-sold.png'});pass('登记购买后回到在线，长期在线');
await page.locator('.buyers button').click();await page.locator('.t-dialog__ctx:visible').filter({hasText:'删除这条购买记录'}).getByRole('button',{name:'删除'}).click();await page.locator('.life.offline').waitFor();
await page.getByRole('button',{name:'重新推广'}).click();await page.locator('.life.active').waitFor();assert.ok(lib.state().entries.find(e=>e.id===ag.id).lifecycle.launchAt>'2026');pass('删除购买记录后结束推广；「重新推广」从今天起重算周期');
assert.throws(()=>lib.setLifecycle(ag.id,{launchAt:'2026-11-01',months:0}));pass('周期月数校验');
assert.deepEqual(errors,[]);pass('页面无运行时异常');
}catch(e){console.error('FAIL',e.message.split('\n').slice(0,6).join(' | '));await browser.contexts()[0]?.pages()[0]?.screenshot({path:'/tmp/fde-promo-fail.png'}).catch(()=>{});process.exitCode=1;}
finally{await browser.close();server.close();fs.rmSync(root,{recursive:true,force:true});console.log(`${results.length} passed`);}
})();
