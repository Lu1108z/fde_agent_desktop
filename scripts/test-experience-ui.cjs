// 隔离接口与临时资料库，验证体验修复；不使用用户 Key、项目或资料。
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {chromium}=require(process.env.FDE_PLAYWRIGHT||'/Users/luzhenpeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createMaterialLibrary}=require('../src/main/material-library');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fde-experience-ui-')),lib=createMaterialLibrary(root);
 const a=await lib.create({spaceId:'promo',title:'门诊运营助手',kind:'folder'}),b=await lib.create({spaceId:'promo',title:'智能排班助手',kind:'folder'});
 await lib.create({spaceId:'promo',parentId:b.id,title:'排班方案',kind:'text',content:'测试资料'});
 const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.setDefaultTimeout(10000);let mode='normal',holdTest=false;const pending=[],calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('testBridge',async(ns,m,args)=>{
  calls.push({ns,m,args});
  if(ns==='app')return m==='getPlatform'?'darwin':'test';
  if(ns==='license')return {success:true,ok:true};
  if(ns==='env'&&m==='check')return {success:true,engine:{ok:true},apiKey:{configured:true},acp:{ok:true}};
  if(ns==='env'&&m==='testConnection'){if(holdTest)return new Promise(resolve=>pending.push(resolve));return {ok:true,latencyMs:20};}
  if(ns==='gateway'&&m==='listProfiles')return {success:true,profiles:[]};
  if(ns==='hermes'){
   if(m==='listProjects'){if(mode==='list-error')throw Error('项目服务离线');return [];}
   if(m==='createProject')return {success:false,error:'磁盘无法写入'};
   if(m==='loadProject')return {name:'阶段一测试',stage:1,requirement:'',messages:[]};
   if(m==='readFile')return {success:false,error:'不存在'};
   if(m==='listFiles')return {success:true,files:[]};
   if(m==='listModels')return {models:[],current:''};
  }
  if(ns==='library'){
   if(m==='list')return {success:true,...lib.state()};
   if(m==='thumbnail')return {success:true,url:''};
   if(m==='linked')return {success:true,entries:[]};
   if(m==='trash'){lib.trash(args[0]);return {success:true};}
   if(m==='restore'){lib.restore(args[0]);return {success:true};}
  }
  return {success:true};
 });
 await page.addInitScript(()=>{const ns=n=>new Proxy({},{get:(_,m)=>String(m).startsWith('on')?()=>()=>{}:(...args)=>window.testBridge(n,m,args)});window.api=new Proxy({},{get:(_,n)=>ns(n)});});
 try{
  await page.goto('http://127.0.0.1:43917/#/settings');
  const key=page.getByPlaceholder('请输入 360 API Key');await key.fill('test-A');await page.getByRole('button',{name:'测试连接'}).click();
  await page.getByText(/DeepSeek V4.1 Flash：连接正常.*Claude Opus 5.5：连接正常/).waitFor();
  assert.deepEqual(calls.filter(c=>c.m==='testConnection').map(c=>c.args[0].model).sort(),['anthropic/claude-opus-5-5','deepseek/deepseek-v4.1-flash']);
  await key.fill('test-B');assert.equal(await page.getByText(/：连接正常/).count(),0);
  holdTest=true;await page.getByRole('button',{name:'测试连接'}).click();await page.waitForFunction(()=>document.body.innerText.includes('测试中'));
  await key.fill('test-C');await page.waitForFunction(()=>document.querySelector('input[type=password]').value==='test-C');
  // 两个请求已由 Playwright bridge 发出后释放，旧响应不能污染新 Key。
  assert.equal(pending.length,2);pending.forEach(resolve=>resolve({ok:true,latencyMs:10}));
  await page.getByRole('button',{name:'测试连接',exact:true}).waitFor();assert.equal(await page.getByText(/：连接正常/).count(),0);
  console.log('PASS 固定两模型分别测试，换 Key 和旧响应都不会保留成功提示');
  mode='list-error';await page.goto('http://127.0.0.1:43917/#/projects');await page.getByText('项目加载失败',{exact:true}).waitFor();assert.equal(await page.getByText('还没有 FDE 项目',{exact:true}).count(),0);
  mode='normal';await page.getByRole('button',{name:'重新加载',exact:true}).click();await page.getByText('还没有 FDE 项目',{exact:true}).waitFor();
  await page.goto('http://127.0.0.1:43917/#/projects/new');await page.locator('textarea').fill('医院需求');await page.getByRole('button',{name:'创建 FDE 项目',exact:true}).click();await page.getByRole('alert').filter({hasText:'磁盘无法写入'}).waitFor();assert.ok(await page.getByRole('button',{name:'创建 FDE 项目',exact:true}).isEnabled());assert.equal(await page.locator('textarea').inputValue(),'医院需求');
  console.log('PASS 项目读取失败可重试，创建失败保留输入并恢复按钮');
  await page.goto('http://127.0.0.1:43917/#/projects/test');const rail=page.locator('nav[aria-label="阶段一流程"]:visible');await rail.waitFor();await rail.getByRole('button',{name:/进入阶段二/}).click();await page.getByPlaceholder('填写负责人姓名').fill('测试负责人');assert.ok(await page.getByRole('button',{name:'确认并进入阶段二',exact:true}).isDisabled());assert.equal(await page.getByText('五个步骤都已完成，可以进入阶段二。').count(),0);
  console.log('PASS 阶段一空目标无法交接，未开始步骤不会误报完成');
  await page.goto('http://127.0.0.1:43917/#/library/promo');await page.locator('.main-h h1').filter({hasText:'全部物料'}).waitFor();await page.getByPlaceholder('搜索智能体或物料').fill('排班方案');await page.locator('.card-agent').filter({hasText:'智能排班助手'}).first().waitFor();await page.locator('.agent').filter({hasText:'智能排班助手'}).click();await page.locator('.main-h h1').filter({hasText:'智能排班助手'}).waitFor();await page.locator('.card-title').filter({hasText:'排班方案'}).waitFor();
  await page.getByPlaceholder('搜索智能体或物料').fill('无匹配内容');await page.getByText('没有搜索结果，点击清除搜索').click();
  await page.locator('.agent').filter({hasText:'智能排班助手'}).click();await page.getByRole('button',{name:'删除智能体',exact:true}).click();await page.locator('.t-dialog__footer').getByRole('button',{name:'删除',exact:true}).click();await page.locator('.agent').filter({hasText:'智能排班助手'}).waitFor({state:'detached'});
  await page.getByRole('button',{name:/物料回收站/}).click();await page.locator('.trash-row').filter({hasText:'智能排班助手'}).getByRole('button',{name:'恢复'}).click();await page.locator('.agent').filter({hasText:'智能排班助手'}).waitFor();assert.ok(!lib.state().entries.find(e=>e.id===b.id).deletedAt);
  console.log('PASS 搜索同步上下文，用户可通过回收站恢复资料夹');assert.deepEqual(errors,[]);
 }finally{await browser.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
