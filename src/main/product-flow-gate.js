const {stage2FormatIssues}=require('./stage2-deliverable-format');
const fs = require('fs');
const path = require('path');
const REQUIRED = {
  1: {prepare:['.fde-flow/preparation.md']},
  2: {contact:['stage2/contact-form.md'],capabilities:['stage2/ai-capability.md'],prototype:['prototype/index.html'],feedback:['.fde-flow/feedback.md']},
  3: {scope:['stage3/final-req.md'],design:['stage3/data-metric.md','stage3/agent-design.md','stage3/impl-plan.md'],final:['stage3/prd.md','stage3/prototype-final.md','stage3/prototype/index.html'],handoff:['.fde-flow/handoff.md']},
  4: {schedule:['stage4/progress.md'],demo:['stage4/demo-review.md'],launch:['stage4/deploy-doc.md']},
  5: {tracker:['stage5/feedback-tracker.md'],iteration:['stage5/iteration.md'],usage:['stage5/usage-watch.md'],signoff:['stage5/delivery-sign.md']},
};
// 需要客户实际确认的任务：核对时必须登记确认人和依据
const CUSTOMER={3:['scope'],4:['launch'],5:['signoff']};
function fingerprint(text) { let hash=2166136261; for(const char of String(text)) hash=Math.imul(hash^char.charCodeAt(0),16777619); return (hash>>>0).toString(16); }
// 阶段一由项目负责人确认完成：资料不全也可携带待确认问题进入阶段二，交接文件须与确认时一致。
function stage1Gate(root) {
  let ctx; try {ctx=JSON.parse(fs.readFileSync(path.join(root,'.fde-flow/context.json'),'utf8'));} catch {return null;}
  const done=ctx?.stage1?.completion;
  if(!done) return null;
  const issues=[];
  if(String(ctx.goal?.text || '').trim().length < 4) issues.push('请先填写本阶段目标（至少 4 个字）');
  if(!String(done.by||'').trim()||!done.at) issues.push('请由项目负责人登记阶段一完成确认');
  const file=path.join(root,'.fde-flow/stage1-handoff.md');
  if(!fs.existsSync(file)) issues.push('缺少阶段一交接记录');
  else if(fingerprint(fs.readFileSync(file,'utf8'))!==done.signature) issues.push('阶段一交接记录已变化，请重新确认');
  return issues;
}
function gate(root,stage) {
  if(stage===1){const issues=stage1Gate(root); if(issues) return issues;}
  if(!REQUIRED[stage]) return ['未知的项目阶段'];
  let state; try {state=JSON.parse(fs.readFileSync(path.join(root,'.fde-flow/state.json'),'utf8'));} catch {return ['请先完成并保存当前产品任务'];}
  if(state.schemaVersion!==1 || !state.tasks) return ['产品流程记录无效，请重新读取'];
  const issues=[];
  for(const [task,files] of Object.entries(REQUIRED[stage])) {
    const record=state.tasks[`${stage}:${task}`];
    if(record?.status!=='confirmed' || !record.confirmation?.at) {issues.push(`任务 ${task} 尚未核对`);continue;}
    for(const file of files) {
      const target=path.join(root,file);
      if(!fs.existsSync(target)) {issues.push(`缺少成果 ${file}`);continue;}
      const content=fs.readFileSync(target,'utf8');
      const formatIssues=stage2FormatIssues(content,file);
      if(formatIssues.length)issues.push(`成果 ${file} 未按知识中心模板对齐：${formatIssues.slice(0,2).join('；')}`);
      if(content.trim().length<80 || fingerprint(content)!==record.confirmation.signatures?.[file]) issues.push(`成果 ${file} 已变化或不完整，请重新核对`);
    }
    if(task==='feedback' && (!record.notes?.trim()||!record.confirmedBy?.trim()||!record.evidence?.trim())) issues.push('请登记实际客户反馈、确认人和认可依据');
    if(CUSTOMER[stage]?.includes(task) && (!String(record.confirmation.by||'').trim()||!String(record.confirmation.evidence||'').trim())) issues.push(`任务 ${task} 缺少客户确认人和依据`);
  }
  return issues;
}
module.exports={gate,REQUIRED,stage1Gate};
