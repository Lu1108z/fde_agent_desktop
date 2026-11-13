const assert = require('node:assert/strict');
const { getScenario, scenarioInstructions, validateReview } = require('../src/main/coach-scenarios');
const briefs = require('../src/shared/coach-scenarios.json');
const { streamCoachReply, registerCoachReply } = require('../src/main/coach-reply');

async function main() {
  const history = [{ role: 'assistant', content: briefs[0].opening }];
  for (let i = 0; i < 14; i++) history.push({ role: 'user', content: i === 0 ? '之前系统使用和维护情况怎么样？' : `第${i}次具体提问` }, { role: 'assistant', content: `已确认信息${i}` });
  history.push({ role: 'user', content: '那么下一次调研找谁参与？' });
  const captured = [];
  const fetchImpl = async (_url, options) => { captured.push(JSON.parse(options.body)); return new Response(JSON.stringify({ choices: [{ message: { content: '王主任：可以先联系护理部李主任。' } }] }), { headers: { 'content-type': 'application/json' } }); };
  for (const brief of briefs) {
    const scenario = getScenario(brief.id);
    await streamCoachReply({ config: { apiKey: 'test', baseUrl: 'https://example.test/v1' }, model: 'test', messages: history, mode: 'text', scenario, fetchImpl, knowledge: { retrieve() { throw Error('不得将外部案例混入固定客户事实'); } } });
    const request = captured.at(-1);
    assert.equal(request.messages.length, history.length + 1, '保留20条之外的历史');
    assert.equal(request.messages[1].content, briefs[0].opening);
    assert.ok(request.messages[0].content.includes(scenario.facts[0][2]));
    assert.ok(!request.messages.at(-1).content.includes('分析说明'));
    assert.ok(!('facts' in brief), '前端简报无隐藏档案');
    assert.equal(brief.materials.length, 3);
  }
  assert.notEqual(captured[0].messages[0].content, captured[1].messages[0].content);
  const scene = getScenario(briefs[0].id);
  const review = validateReview({ outcome: 'progress', scores: [
    { dimension: '需求挖掘深度', score: 5, evidence: history[1].content, reason: '具体追问历史' },
    { dimension: '信息确认', score: 5, evidence: '我从来没有说过这句话' },
    { dimension: '破冰自然度', score: 100, evidence: history[1].content }
  ] }, history, scene);
  assert.equal(review.total, 5);
  assert.equal(review.scores.find(s => s.dimension === '信息确认').score, null);
  assert.equal(review.scores.find(s => s.dimension === '破冰自然度').score, null);
  let emitted = '';
  const reviewResult = await streamCoachReply({ config: { apiKey: 'test' }, messages: history, scenario: scene, review: true, onText: chunk => emitted += chunk, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scores: [], outcome: 'partial', summary: '证据不足' }) } }] }), { headers: { 'content-type': 'application/json' } }) });
  assert.equal(emitted, '', '复盘JSON不混入客户发言');
  assert.equal(reviewResult.review.total, null);
  await assert.rejects(() => streamCoachReply({ config: { apiKey: 'test' }, messages: history, scenario: scene, review: true, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '不是JSON' } }] }), { headers: { 'content-type': 'application/json' } }) }), /复盘格式/);
  assert.ok(scenarioInstructions(scene, true).includes('没有证据填空'));
  const handlers = {};
  registerCoachReply({ ipcMain: { handle(name, fn) { handlers[name] = fn; } }, app: { whenReady: () => ({ then: () => ({ catch() {} }) }), on() {} }, getConfig: () => ({ apiKey: 'test' }), readMeta: () => ({ coachScenario: { id: 'missing', version: 1 } }), readHistory: () => history });
  const sender = { id: 1, once() {}, removeListener() {}, isDestroyed: () => false, send() {} };
  const result = await handlers['coach:reply']({ sender }, { id: 'missing-test', slug: 'coach-test' });
  assert.equal(result.success, false); assert.match(result.error, /场景版本/);
  const originalFetch = global.fetch;
  try {
    global.fetch = fetchImpl;
    registerCoachReply({ ipcMain: { handle(name, fn) { handlers[name] = fn; } }, app: { whenReady: () => ({ then: () => ({ catch() {} }) }), on() {} }, getConfig: () => ({ apiKey: 'test', baseUrl: 'https://example.test/v1' }), readMeta: () => ({ coachScenario: { id: scene.id, version: scene.version } }), readHistory: () => history });
    const valid = await handlers['coach:reply']({ sender }, { id: 'history-test', slug: 'coach-test', messages: [{ role: 'user', content: '来自过时前端的错误内容' }], mode: 'text' });
    assert.equal(valid.success, true);
    assert.equal(captured.at(-1).messages.at(-1).content, history.at(-1).content, 'IPC使用磁盘记录而非客户端历史');
    assert.ok(!captured.at(-1).messages.some(m => m.content.includes('来自过时前端的错误内容')));
  } finally { global.fetch = originalFetch; }
  console.log('PASS 四场景固定档案、完整历史、知识隔离、复盘证据与加权分数、损坏响应和版本错误');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
