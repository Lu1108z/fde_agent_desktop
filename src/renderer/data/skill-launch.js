import presentations from '../../shared/skill-presentations.json';

export function skillPresentation(skill) {
  const known = presentations[skill.id] || {};
  return {
    name: /[\u3400-\u9fff]/.test(skill.name || '') ? skill.name : known.name || skill.name || skill.id,
    purpose: known.purpose || skill.summary || skill.description || '按技能说明完成任务',
    input: known.input || '任务目标与相关资料',
    output: known.output || '按技能说明提供结果',
    group: skill.categoryExplicit || skill.group?.startsWith('custom-') ? skill.group : known.group || skill.group,
  };
}
export const skillDestination = id => id === 'fde-coach' ? '/coach' : '/chat';
export function skillOpeningPrompt(skill, content) {
  const view = skillPresentation(skill);
  return `用户已点击“立即使用”，启用技能「${view.name}」（${skill.id}）。\n严格按下面的完整技能说明工作；相对文件和脚本路径相对于技能原目录，不是当前对话目录。\n本轮先用简短中文说明能帮助完成什么，然后询问启动所必需的信息（${view.input}）。不要凭空生成客户资料或最终交付物。${skill.id === 'fde-coach' ? '现在进入 FDE 教练陪练，询问行业、客户角色与练习场景。' : '在 AI 助手内执行该技能，不要切换到 FDE 教练。'}\n\n<selected_skill>\n${content}\n</selected_skill>`;
}
