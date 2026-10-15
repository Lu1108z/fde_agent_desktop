const {stage2FormatIssues}=require('./stage2-deliverable-format');
const fs = require('fs');
const path = require('path');
const REQUIRED = {
  1: {prepare:['.fde-flow/preparation.md']},
  2: {contact:['stage2/contact-form.md'],capabilities:['stage2/ai-capability.md'],prototype:['prototype/index.html'],feedback:['.fde-flow/feedback.md']},
};
function fingerprint(text) { let hash=2166136261; for(const char of String(text)) hash=Math.imul(hash^char.charCodeAt(0),16777619); return (hash>>>0).toString(16); }
function gate(root,stage) {
  if(!REQUIRED[stage]) return ['产品流程仅支持从调研准备进入需求沟通、从需求沟通进入需求确认'];
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
  }
  return issues;
}
module.exports={gate,REQUIRED};
