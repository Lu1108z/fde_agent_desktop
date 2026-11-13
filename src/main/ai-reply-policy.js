const policy = require('../shared/ai-reply-policy.json');

function appReplyInstructions(app = {}) {
  const role = policy.roles[app.id];
  return `统一回答方式（v${policy.version}）：\n${policy.principles.map(line => `- ${line}`).join('\n')}${role ? `\n\n当前角色的表达重点：\n${role}` : ''}`;
}

function replyInstructionsForMeta(meta, channel = 'main') {
  if (channel !== 'main' || meta?.projectType === 'fde-coach' || meta?.coachScenario) return '';
  if (meta?.aiApp) return appReplyInstructions(meta.aiApp);
  if (meta?.expert) return appReplyInstructions(meta.expert);
  if (meta?.projectType === 'ai-app') return appReplyInstructions();
  return '';
}

// Public execution information is optional; greetings do not need a fabricated analysis.
const APP_SUMMARY_INSTRUCTION = '直接输出正式回答。只有本轮确有影响理解的资料依据、执行状态或检查结果，才可先用 <response_summary>一至两条简短说明</response_summary> 提供补充，总长不超过100个汉字。不为问候、简单回答生成分析说明，不重复正文，不输出内部推理或未发生的操作。';

module.exports = { appReplyInstructions, replyInstructionsForMeta, APP_SUMMARY_INSTRUCTION };
