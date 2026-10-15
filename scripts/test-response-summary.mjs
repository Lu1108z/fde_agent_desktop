import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { splitResponseSummary, finalizeResponseSummary, publicResponseSteps, publicToolStep, plainMessage } from '../src/renderer/data/response-summary.mjs';
import { spokenText } from '../src/renderer/components/agent/voice-conversation.mjs';
const require = createRequire(import.meta.url);
const { registerCoachReply, streamCoachReply } = require('../src/main/coach-reply');
const text = '<response_summary>先确认本次练习的行业和客户角色。\n依据五阶段资料检查需求确认要点。</response_summary>你好，你想练习哪个行业？';
for (let i = 1; i < text.indexOf('</response_summary>') + '</response_summary>'.length; i++) assert.equal(splitResponseSummary(text.slice(0, i)).content, '');
assert.equal(splitResponseSummary(text).content, '你好，你想练习哪个行业？');
assert.ok(splitResponseSummary(text).summary.includes('五阶段资料'));
assert.equal(splitResponseSummary('<response_summary>This is English only.</response_summary>正文').summary, '');
assert.equal(splitResponseSummary('代码示例：<response_summary>保留原文').content, '代码示例：<response_summary>保留原文');
assert.equal(spokenText(text), '你好，你想练习哪个行业？');
assert.equal(spokenText(text.slice(0, 45)), '');
const legacy = finalizeResponseSummary({content:'先确认客户角色和当前业务痛点，再追问影响范围。',knowledgeSources:[{id:'spec3'}]});
assert.ok(legacy.thinkingSummary.includes('1 份相关资料'));
assert.ok(legacy.thinkingSummary.includes('未返回额外的分析说明'));
assert.ok(!legacy.thinkingSummary.includes('确认客户角色'));
const message = finalizeResponseSummary({content:text, thinkingSteps:[{icon:'fa-solid fa-brain',text:'private raw reasoning'},{kind:'public-progress',text:'正在读取资料'}]});
assert.equal(message.content, '你好，你想练习哪个行业？');
assert.deepEqual(publicResponseSteps(message, false), ['正在读取资料']);
assert.equal(publicToolStep('read_file', 'completed'), '读取资料已完成');
assert.equal(publicToolStep('execute_command', 'failed'), '执行任务检查未成功，需要重试或调整');

// Electron IPC must receive plain data even when summaries/sources are Vue proxies.
let api, saved;
vm.runInNewContext(fs.readFileSync(new URL('../src/preload/index.js',import.meta.url),'utf8'), {
  require: name => { assert.equal(name,'electron'); return {contextBridge:{exposeInMainWorld(_name,value){api=value;}},ipcRenderer:{invoke(channel,payload){saved=structuredClone(payload);return Promise.resolve({success:true});},on(){},removeListener(){}},webUtils:{}}; }, process,
});
const {reactive}=require('vue');
assert.doesNotThrow(()=>structuredClone(plainMessage(reactive({...message,knowledgeSources:[{reference:1,title:'规范'}]}))));
await api.hermes.saveMessage('fixture',reactive({...message, knowledgeSources:[{title:'规范',reference:1}]}));
assert.equal(saved.message.thinkingSummary,message.thinkingSummary);
assert.equal(saved.message.knowledgeSources[0].title,'规范');

const finalizeSource = fs.readFileSync(new URL('../src/renderer/pages/projects/AgentHome.vue',import.meta.url),'utf8');
const finalizer = finalizeSource.slice(finalizeSource.indexOf('const finalizeLastAssistantMessage ='), finalizeSource.indexOf('const scheduleStreamEnd ='));
const finalizeScope = {console,finalizeResponseSummary,plainMessage,stopElapsed(){},formatTimestamp:()=>'',props:{coachMode:true},currentSlug:{value:'fixture'},messages:{value:reactive([{role:'assistant',content:text,thinkingSteps:[],knowledgeSources:[{id:'spec',title:'阶段三'}]}])},loadProjects(){},window:{api:{hermes:{saveMessage(_slug,payload){saved=structuredClone(payload);return Promise.resolve({success:true});}}}}};
vm.createContext(finalizeScope);vm.runInContext(finalizer+'\nthis.finalize=finalizeLastAssistantMessage;',finalizeScope);finalizeScope.finalize();
assert.equal(saved.content,'你好，你想练习哪个行业？');assert.equal(saved.knowledgeSources[0].id,'spec');assert.ok(saved.thinkingSummary.includes('五阶段'));

// Exercise the real composer handler with IPC failure and cleanup failure.
const pageSource = fs.readFileSync(new URL('../src/renderer/pages/projects/AgentHome.vue',import.meta.url),'utf8');
const handlerSource = pageSource.slice(pageSource.indexOf('let activeVoiceRequest = null;'),pageSource.indexOf('const handleQuickSend ='));
const sandbox = { console:{warn(){},error(){}},Date,isStreaming:{value:false},messages:{value:[]},currentSlug:{value:'fixture'},currentModel:{value:'fixture'},currentMeta:{value:{}},currentProjectName:{value:''},
  createMessage:(role,content,extra={})=>({role,content,...extra}),startElapsed(){},loadProjects:()=>Promise.resolve(),finishResponse(){sandbox.isStreaming.value=false;},currentStreamId:null,
  window:{api:{hermes:{saveMessage:async()=>({success:true}),onCoachReply:()=>()=>{throw Error('cleanup failed');},coachReply:async()=>({success:true,content:'中文回答'}),createProject:async()=>({})}}},
};
vm.createContext(sandbox);vm.runInContext(handlerSource+'\nthis.send = handleCoachSend;',sandbox);
for(let i=0;i<2;i++){await sandbox.send('问题'+i,'text');assert.equal(sandbox.isStreaming.value,false);}
sandbox.window.api.hermes.saveMessage=async()=>{throw Error('save failed');};
await assert.rejects(sandbox.send('保存失败','text'),/save failed/);assert.equal(sandbox.isStreaming.value,false);
sandbox.window.api.hermes.saveMessage=async()=>({success:true});sandbox.currentSlug.value='';sandbox.window.api.hermes.createProject=async()=>{throw Error('create failed');};
await assert.rejects(sandbox.send('创建失败','text'),/create failed/);assert.equal(sandbox.isStreaming.value,false);

let bodyCancelled = 0;
const config={apiKey:'fixture',baseUrl:'https://example.test/v1'};
function hangingResponse(end='done',signal){
  const encoder=new TextEncoder();
  return new Response(new ReadableStream({start(controller){
    controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n'));
    if(end==='done')controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    if(end==='finish')controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\n'));
    signal?.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
    // Deliberately never close: provider keep-alive must not lock the composer.
  },cancel(){bodyCancelled++;}}),{headers:{'Content-Type':'text/event-stream'}});
}
for(const end of ['done','finish']) {
  let timer;
  try {
    const result=await Promise.race([streamCoachReply({config,messages:[{role:'user',content:'你好'}],fetchImpl:async()=>hangingResponse(end)}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('End marker did not release reply')),1000);})]);
    assert.equal(result.content,text);
  } finally {clearTimeout(timer);}
}
assert.equal(bodyCancelled,2);

// Two successive IPC turns and cancellation must clear the backend busy guard.
const home=fs.mkdtempSync(path.join(os.tmpdir(),'fde-reply-lifecycle-'));
const previousHome=process.env.HERMES_HOME,previousFetch=globalThis.fetch;
process.env.HERMES_HOME=home;
try {
  const handlers=new Map(), app=new EventEmitter();app.whenReady=()=>Promise.resolve();
  registerCoachReply({ipcMain:{handle(name,handler){handlers.set(name,handler);}},app,getConfig:()=>config});
  const sender=new EventEmitter();sender.id=17;sender.isDestroyed=()=>false;sender.send=()=>{};
  globalThis.fetch=async(_url,{signal})=>hangingResponse('done',signal);
  for(let i=0;i<2;i++) assert.equal((await handlers.get('coach:reply')({sender},{id:'turn-'+i,messages:[{role:'user',content:'你好'}],mode:'text'})).success,true);
  let requested;const started=new Promise(resolve=>{requested=resolve;});
  globalThis.fetch=async(_url,{signal})=>{requested();return hangingResponse('wait',signal);};
  const pending=handlers.get('coach:reply')({sender},{id:'cancel-me',messages:[{role:'user',content:'你好'}]});
  await started;handlers.get('coach:reply-cancel')({sender},{id:'cancel-me'});
  assert.equal((await pending).cancelled,true);
  globalThis.fetch=async(_url,{signal})=>hangingResponse('finish',signal);
  assert.equal((await handlers.get('coach:reply')({sender},{id:'after-cancel',messages:[{role:'user',content:'继续'}]})).success,true);
  assert.equal(sender.listenerCount('destroyed'),0);
} finally {
  globalThis.fetch=previousFetch;
  if(previousHome===undefined)delete process.env.HERMES_HOME;else process.env.HERMES_HOME=previousHome;
  fs.rmSync(home,{recursive:true,force:true});
}
console.log('Response summary tests passed: Chinese readable summaries, partial-stream parsing, no raw-reasoning display, voice separation, reactive IPC persistence, keep-alive completion, consecutive turns and cancellation recovery.');
