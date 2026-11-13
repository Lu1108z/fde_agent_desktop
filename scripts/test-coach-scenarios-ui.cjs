const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.FDE_PLAYWRIGHT || '/Users/luzhenpeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { getScenario, validateReview } = require('../src/main/coach-scenarios');
const output = process.env.FDE_SCREENSHOT_DIR || '/private/var/folders/jt/dkh0kv0524l0bc9xnjl32c9w79p_02/T/opencode/fde-coach-implementation';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
  const projects = new Map(), calls = [], errors = []; let failReply = false, failCreate = false;
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('testBridge', async (ns, method, args) => {
    calls.push({ ns, method, args });
    if (ns === 'app') return method === 'getPlatform' ? 'darwin' : 'test';
    if (ns === 'license') return { success: true, ok: true };
    if (ns === 'env' && method === 'check') return { success: true, engine: { ok: true }, apiKey: { configured: true }, acp: { ok: true } };
    if (ns === 'gateway' && method === 'listProfiles') return { success: true, profiles: [] };
    if (ns === 'skills') return { success: true, skills: [], installed: [] };
    if (ns === 'hermes') {
      if (method === 'listProjects') return [...projects.values()].map(p => ({ ...p, hasMessages: !!p.messages.length }));
      if (method === 'listModels') return { models: [{ id: 'test-model', name: 'Test model' }], current: 'test-model' };
      if (method === 'readConfigModel') return { model: 'test-model' };
      if (method === 'createProject') {
        if (failCreate) return { success: false, error: '测试磁盘写入失败' };
        const value = { ...args[0], messages: [] }; projects.set(value.slug, value); return value;
      }
      if (method === 'updateProjectMeta') { Object.assign(projects.get(args[0]), args[1]); return { success: true }; }
      if (method === 'saveMessage') { projects.get(args[0]).messages.push(args[1]); return { success: true }; }
      if (method === 'loadProject') return projects.get(args[0]);
      if (method === 'listFiles') return { success: true, files: [] };
      if (method === 'coachReply') {
        const context = args[4], project = projects.get(context.slug);
        assert.ok(project.coachScenario, '练习通过持久化场景ID请求');
        if (failReply) return { success: false, error: '测试网络中断' };
        if (context.action === 'review') {
          const evidence = project.messages.find(m => m.role === 'user').content;
          const scenario = getScenario(project.coachScenario.id);
          return { success: true, review: validateReview({ summary: '具体追问了维护经历。', outcome: 'partial', outcomeReason: '还未约定下一次调研。', discovered: ['过往项目维护缺少业务牵头'], missed: ['业务参与人'], scores: [{ dimension: '需求挖掘深度', score: 3, evidence, reason: '从过去经历追问', suggestion: '这次哪个科室主动提出了问题？' }], nextStep: '确认业务牵头人。' }, project.messages, scenario) };
        }
        return { success: true, content: '王主任：去年做过一个问答系统，资料更新最后都来找我们，科室没人维护。' };
      }
    }
    return { success: true };
  });
  await page.addInitScript(() => {
    const ns = name => new Proxy({}, { get: (_, method) => String(method).startsWith('on') ? () => () => {} : (...args) => window.testBridge(name, method, args) });
    window.api = new Proxy({}, { get: (_, name) => ns(name) });
  });
  page.setDefaultTimeout(12000);
  try {
    await page.goto('http://127.0.0.1:43917/#/chat');
    await page.getByRole('heading', { name: '今天，想一起完成什么？' }).waitFor();
    await page.locator('.experience-character img').evaluate(img => img.decode());
    assert.equal(await page.locator('.experience-scenario-card').count(), 0);
    await page.getByRole('button', { name: '梳理需求', exact: true }).click();
    assert.match(await page.getByRole('textbox', { name: '发送给 AI 助手的消息' }).inputValue(), /核心需求/);
    await page.getByRole('textbox', { name: '发送给 AI 助手的消息' }).fill('');
    await page.screenshot({ path: path.join(output, 'assistant.png') });
    await page.goto('http://127.0.0.1:43917/#/coach');
    await page.locator('[data-scenario="hospital-ai-pilot"]').waitFor();
    assert.equal(await page.locator('.experience-scenario-card').count(), 4);
    await page.locator('.experience-character img').evaluate(img => img.decode());
    await page.screenshot({ path: path.join(output, 'training.png') });
    for (const id of ['hospital-ai-pilot', 'nursing-workflow', 'manufacturing-delivery', 'solution-review']) {
      await page.locator(`[data-scenario="${id}"]`).click();
      await page.getByRole('button', { name: '进入会谈', exact: true }).waitFor();
      assert.equal(await page.locator('.briefing-materials details').count(), 3);
      const scene = getScenario(id);
      assert.ok((await page.locator('.briefing-scroll').innerText()).includes(scene.mission));
      assert.ok(!(await page.locator('.briefing-scroll').innerText()).includes(scene.facts[0][2]), '会前不得展示隐藏事实');
      await page.getByRole('button', { name: '场景库', exact: true }).click();
    }
    await page.locator('[data-scenario="hospital-ai-pilot"]').click();
    await page.locator('.briefing-materials summary').first().click();
    await page.screenshot({ path: path.join(output, 'briefing.png') });
    failCreate = true;
    await page.getByRole('button', { name: '进入会谈', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '测试磁盘写入失败' }).waitFor();
    assert.ok(await page.getByRole('button', { name: '进入会谈', exact: true }).isEnabled()); failCreate = false;
    await page.getByRole('button', { name: '进入会谈', exact: true }).click();
    await page.getByRole('textbox', { name: '你的客户沟通提问' }).waitFor();
    const opening = await page.locator('.meeting-message.assistant p').first().innerText();
    assert.match(opening, /三个月/);
    await page.getByRole('textbox', { name: '你的客户沟通提问' }).fill('之前系统上线后的使用和维护情况怎么样？');
    failReply = true;
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '测试网络中断' }).waitFor();
    assert.equal(await page.locator('.meeting-message.user').count(), 1);
    failReply = false;
    await page.getByRole('button', { name: '重试本轮回复' }).click();
    await page.getByText('王主任：去年做过一个问答系统，资料更新最后都来找我们，科室没人维护。', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'meeting.png') });
    const original = [...projects.values()].find(p => p.messages.length === 3);
    assert.equal(original.messages.filter(m => m.role === 'user').length, 1, '失败重试不重复写入提问');
    await page.getByRole('button', { name: '生成证据复盘', exact: true }).click();
    await page.getByRole('heading', { name: '部分推进', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'review.png') });
    await page.getByRole('button', { name: '从这次提问前重练', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.meeting-message').length === 1);
    assert.equal(await page.getByRole('textbox', { name: '你的客户沟通提问' }).inputValue(), '之前系统上线后的使用和维护情况怎么样？');
    assert.equal(original.messages.length, 3, '重练保留原对话');
    const branch = [...projects.values()].find(p => p.coachParent?.slug === original.slug);
    assert.ok(branch); assert.equal(branch.messages.length, 1);
    await page.getByRole('button', { name: '场景库', exact: true }).click();
    await page.locator('.session-row-main').filter({ hasText: original.name }).first().click();
    await page.getByRole('textbox', { name: '你的客户沟通提问' }).waitFor();
    assert.ok(await page.locator('.meeting-message').count() > 0);
    await page.getByRole('button', { name: '场景库', exact: true }).click();
    await page.setViewportSize({ width: 900, height: 800 });
    await page.screenshot({ path: path.join(output, 'training-compact.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS 两页视觉、四卡简报、创建失败、回复重试、证据复盘、非破坏性重练、历史恢复和窄屏');
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
