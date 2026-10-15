import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {stage2GenerationContext,stage2FormatIssues,templateStructure} from '../src/renderer/data/stage2-contract.mjs';
const require=createRequire(import.meta.url),mammoth=require('mammoth');
const projectRoot=fileURLToPath(new URL('..',import.meta.url)),fixture=path.join(projectRoot,'scripts/fixtures/stage2-format');
const normalize=text=>String(text).normalize('NFKC').replace(/\s+/g,'');
test('stage two exposes exactly three official deliverables; prototype companions stay in one package',async()=>{
 const data=await import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(path.join(projectRoot,'src/renderer/data/project-deliverables.js'),'utf8')));
 assert.deepEqual(data.STAGE2_DELIVERABLES.map(item=>item.name),['需求与数据对接确认表','AI能力清单','产品原型 Demo']);
 assert.deepEqual(data.STAGE2_DELIVERABLES[2].files,['prototype/index.html','stage2/prd.md','spec.md','stage2/prototype-handoff.md']);
});
test('actual skill scripts produce the knowledge-center table columns and labeled rows',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fde-stage2-script-'));
 try{fs.copyFileSync(path.join(fixture,'input.json'),path.join(root,'input.json'));
 execFileSync('python3',[path.join(projectRoot,'skills/fde-contact-form/scripts/build_contact_form.py'),root,'--input',path.join(root,'input.json')]);
 const record=JSON.parse(fs.readFileSync(path.join(root,'project-record.json'),'utf8')),seed=JSON.parse(fs.readFileSync(path.join(fixture,'project-record.json'),'utf8'));record.stage2.aiCapabilities=seed.stage2.aiCapabilities;record.unrelatedPreservation={marker:'preserve-this-field'};fs.writeFileSync(path.join(root,'project-record.json'),JSON.stringify(record));
 execFileSync('python3',[path.join(projectRoot,'skills/fde-ai-capabilities/scripts/build_ai_capabilities.py'),root]);
 for(const [key,file,template]of [['contact-form','stage2/contact-form.md','2-需求与数据对接确认表【交付】（含组织关系）.docx'],['ai-capability','stage2/ai-capability.md','3-AI需求能力清单【交付】.docx']]){
  const content=fs.readFileSync(path.join(root,file),'utf8');assert.deepEqual(stage2FormatIssues(content,file),[]);
  const html=(await mammoth.convertToHtml({path:path.join(projectRoot,'fde-handbook/02',template)})).value;
  for(const line of templateStructure(html).split('\n')){if(line.startsWith('表格列：'))assert.ok(normalize(content).includes(normalize('| '+line.slice(4)+' |')),key+': '+line);if(line.startsWith('填写行：'))for(const label of line.slice(4).split('、'))assert.ok(normalize(content).includes(normalize(label)),key+': '+label);}
 }
 const saved=JSON.parse(fs.readFileSync(path.join(root,'project-record.json'),'utf8'));assert.deepEqual(saved.unrelatedPreservation,{marker:'preserve-this-field'});assert.equal(saved.stage2.contactForm.rounds[0].confirmation.status,'pending');assert.equal(saved.stage2.aiCapabilities.reviewEvidence,'');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('generation loads current templates and all skill references, without a generic fallback or a tail truncation',async()=>{
 const calls=[];const api={skills:{read:async(skill,file)=>{calls.push(skill+'/'+file);return{success:true,content:fs.readFileSync(path.join(projectRoot,'skills',skill,file),'utf8')};}},handbook:{readEditable:async(_,file)=>({success:true,content:(await mammoth.convertToHtml({path:path.join(projectRoot,'fde-handbook/02',file)})).value,edited:true})}};
 const context=await stage2GenerationContext(api,'ai-capability');assert.match(context,/用户修订版/);assert.match(context,/四、AI验收口径汇总/);assert.ok(calls.includes('fde-ai-capabilities/references/record-section.json'));assert.match(context,/不编造签字、演示或验收/);
 const prose=templateStructure('<h2>原型规范</h2><p>九章 PRD、人工流程校验与异常边界必须保留。</p><table><tr><td>项目</td><td>内容</td></tr><tr><td>项目名称</td><td>示例客户事实</td></tr></table>');assert.match(prose,/九章 PRD/);assert.doesNotMatch(prose,/示例客户事实/);
 api.handbook.readEditable=async()=>({success:false,error:'missing template'});await assert.rejects(stage2GenerationContext(api,'contact-form'),/模板无法读取/);
});
test('long but nonconforming content and a static mockup are rejected as completed deliverables',()=>{
 assert.ok(stage2FormatIssues('# 旧版文档\n'+('旧正文'.repeat(200)),'stage2/contact-form.md').length);
 assert.ok(stage2FormatIssues('| 功能名称 | 所属页面 | 功能描述 | 优先级 | 关联智能体 | 数据依赖 |\n| --- | --- | --- | --- | --- | --- |','spec.md').some(issue=>issue.includes('只有表头')));
 assert.ok(stage2FormatIssues('<html><body><main>仅有静态说明</main></body></html>','prototype/index.html').length);
});
