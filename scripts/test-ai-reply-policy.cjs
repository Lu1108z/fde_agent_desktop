const assert = require('node:assert/strict');
const policy = require('../src/shared/ai-reply-policy.json');
const { appReplyInstructions, replyInstructionsForMeta, APP_SUMMARY_INSTRUCTION } = require('../src/main/ai-reply-policy');

for (const [id, guidance] of Object.entries(policy.roles)) {
  const meta = { projectType: 'ai-app', aiApp: { id } };
  const prompt = replyInstructionsForMeta(meta);
  assert.ok(prompt.includes(guidance), `${id} 应使用自己的表达重点`);
  assert.ok(prompt.includes('以本轮用户意图决定回答结构'));
  assert.ok(prompt.includes('用户要求完整文档、问卷或指定模板时遵循其格式'));
  assert.ok(prompt.includes('不能虚构客户事实'));
  assert.equal(replyInstructionsForMeta(meta, 'knowledge'), '', '独立项目资料问答不被覆盖');
}
assert.equal(replyInstructionsForMeta({ projectType: 'fde-coach', aiApp: { id: 'medical-expert' } }), '');
assert.equal(replyInstructionsForMeta({ coachScenario: { id: 'hospital-ai-pilot' } }), '');
assert.equal(replyInstructionsForMeta({ projectType: 'fde-project' }), '');
assert.equal(replyInstructionsForMeta({ projectType: 'ai-app' }), appReplyInstructions());
assert.equal(replyInstructionsForMeta({ expert: { id: 'ppt-maker' } }), appReplyInstructions({ id: 'ppt-maker' }));
assert.ok(replyInstructionsForMeta({ aiApp: { id: 'local-custom-app' } }).includes('角色工作流程是内部执行方法'));
assert.ok(APP_SUMMARY_INSTRUCTION.includes('不为问候、简单回答生成分析说明'));
assert.ok(!APP_SUMMARY_INSTRUCTION.includes('每一轮都先'));
console.log('PASS 九类角色、旧专家与自定义数字人统一表达，完整交付与证据要求保留，项目/陪练隔离');
