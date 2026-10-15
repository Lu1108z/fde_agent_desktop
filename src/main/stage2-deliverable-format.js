const norm=text=>String(text).normalize('NFKC').replace(/\s+/g,'').replace(/AI专项/g,'AI专项');
const tableHeaders=text=>String(text).split(/\r?\n/).filter(line=>/^\s*\|/.test(line)).map(line=>line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(norm));
const CONTACT_HEADERS=[['项目','内容'],['姓名','职务','项目角色','关注点'],['序号','需求描述','优先级','本期是否实施','备注（来源/约束）','是否涉及AI'],['步骤','节点/环节','执行角色','输入','处理动作','输出','涉及系统','异常/例外处理','AI嵌入'],['序号','数据项','源系统/厂商','数据内容','对接方式','可否提供','更新频率','责任人','就绪度AI影响'],['验收指标','目标值','验收方','AI专项验收口径']];
const AI_HEADERS=[['序号','AI能力','做什么','关联需求','效果指标','优先级','数据依赖度'],['定义项','内容'],['需求ID','需求描述','对应AI能力','是否本期实施'],['AI能力','验收口径','测试数据集','判定方']];
function stage2FormatIssues(text,file){
  const issues=[],content=String(text||'');let headers=[];const has=value=>norm(content).includes(norm(value));
  if(file==='stage2/contact-form.md'){
    headers=CONTACT_HEADERS;for(const title of ['一、基本信息','二、组织关系','三、本次结论与确认','四、业务场景','4.1 场景概述','4.2 业务流程','4.3 需求清单','4.4 业务流程','4.5 数据对接','4.6 验收标准初稿'])if(!has(title))issues.push(`缺少模板章节：${title}`);
    for(const row of ['客户/单位','所属沟通轮次','遗留未定事项','AI能力确认结论','业务目标','现状基线（As-Is）','业务痛点','期望效果（To-Be）','AI介入价值'])if(!has(row))issues.push(`缺少模板填写行：${row}`);
  }else if(file==='stage2/ai-capability.md'){
    headers=AI_HEADERS;for(const title of ['一、AI能力总览','二、AI能力详细定义','三、AI能力与需求映射关系','四、AI验收口径汇总'])if(!has(title))issues.push(`缺少模板章节：${title}`);
    for(const row of ['能力描述','关联需求','AI承担角色','输入','输出','数据依赖','验收口径','异常处理'])if(!has(row))issues.push(`缺少能力定义行：${row}`);
  }else if(file==='prototype/index.html'){
    if(!/<(?:html|body|main)\b/i.test(content))issues.push('原型本体不是 HTML');
    if(!/<(?:button|input|select|a)\b/i.test(content)||!/(?:addEventListener|onclick|onchange|onsubmit|@click|v-on:click|onClick|href\s*=\s*["'][^#"'])/i.test(content))issues.push('未读到可操作的原型入口与交互');
  }else if(file==='spec.md'){
    headers=[['功能名称','所属页面','功能描述','优先级','关联智能体','数据依赖']];
  }else if(file==='stage2/prd.md'){
    for(const title of ['目标层','功能层','交互层'])if(!has(title))issues.push(`Demo 配套 PRD 缺少${title}`);
  }else if(file==='stage2/prototype-handoff.md'){
    for(const title of ['页面清单','需求覆盖','演示','版本'])if(!has(title))issues.push(`Demo 说明缺少${title}`);
  }
  const lines=content.split(/\r?\n/);
  for(const cols of headers){
    const index=lines.findIndex(line=>/^\s*\|/.test(line)&&cols.every((col,i)=>tableHeaders(line)[0]?.[i]===norm(col)));
    if(index<0){issues.push(`表格列未按知识中心模板排列：${cols.join(' / ')}`);continue;}
    let hasBody=false;for(let i=index+1;i<lines.length&&/^\s*\|/.test(lines[i]);i++){if(!/^\s*\|[\s:|\-]+$/.test(lines[i])&&tableHeaders(lines[i])[0]?.some(Boolean))hasBody=true;}
    if(!hasBody)issues.push(`表格只有表头，未填写实际内容：${cols.join(' / ')}`);
  }
  return issues;
}

module.exports={stage2FormatIssues};
