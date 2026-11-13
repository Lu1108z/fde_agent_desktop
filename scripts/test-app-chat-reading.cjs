const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.FDE_PLAYWRIGHT || '/Users/luzhenpeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.FDE_SCREENSHOT_DIR || '/private/var/folders/jt/dkh0kv0524l0bc9xnjl32c9w79p_02/T/opencode/app-chat-reading';
const answer = `我可以帮你设计图片的构图、风格和生图提示词。当前支持输出提示词方案。

**你准备做什么图？** 比如商品主图、活动海报，或者公众号配图。也可以先发一张参考图。

### 参考方向
1. **商品主图**：突出产品主体与质感。
2. **活动海报**：突出主题、时间与行动入口。

- 已有品牌色或参考图，可以一起提供。
- 尺寸尚未确定也没关系，我们可以逐步确认。

| 类型 | 主体 | 构图 |
| --- | --- | --- |
| 商品主图 | 产品 | 居中留白 |

\`\`\`text
${'example-long-code-'.repeat(80)}
\`\`\``;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let finishPrompt; const prompts = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('testBridge', async (ns, method, args) => {
    if (ns === 'app') return method === 'getPlatform' ? 'darwin' : 'test';
    if (ns === 'license') return { success: true, ok: true };
    if (ns === 'env') return { success: true, engine: { ok: true }, apiKey: { configured: true }, acp: { ok: true } };
    if (ns === 'aiApps') return { success: true, apps: [], overrides: {}, deleted: [] };
    if (ns === 'hermes') {
      if (method === 'listProjects') return [];
      if (method === 'listModels') return { models: [], current: 'test-model' };
      if (method === 'createProject') return args[0];
      if (method === 'prompt') { prompts.push(args[1]); return new Promise(resolve => { finishPrompt = resolve; }); }
      if (method === 'resolveFileRef') return { success: false };
    }
    return { success: true };
  });
  await page.addInitScript(() => {
    window.testListeners = {};
    window.api = new Proxy({}, { get: (_, ns) => new Proxy({}, { get: (_, method) => String(method).startsWith('on') ? fn => { window.testListeners[method] = fn; return () => delete window.testListeners[method]; } : (...args) => window.testBridge(ns, method, args) }) });
  });
  try {
    await page.goto('http://127.0.0.1:43917/#/apps/image-generation');
    await page.locator('.ac-composer textarea').fill('你好');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByRole('button', { name: '正在分析', exact: true }).waitFor();
    assert.equal(await page.locator('.summary-body').count(), 0);
    await page.evaluate(content => window.testListeners.onSessionUpdate({ update: { type: 'agent_message_chunk', content } }), `<response_summary>用户尚未给出具体图片任务，先确认用途。</response_summary>\n${answer}`);
    await page.getByRole('button', { name: '正在分析', exact: true }).click();
    await page.locator('.summary-body').waitFor();
    finishPrompt({ success: true });
    await page.getByRole('button', { name: '分析说明', exact: true }).waitFor();
    assert.ok(await page.locator('.summary-body').isVisible(), '用户主动展开后完成回复不强制收起');
    await page.getByRole('button', { name: '分析说明', exact: true }).click();
    await page.getByRole('button', { name: '查看分析说明', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.assistant-answer')?.getAttribute('aria-busy') === 'false');
    const metrics = await page.locator('.assistant-answer').evaluate(el => ({ width: el.getBoundingClientRect().width, font: getComputedStyle(el).fontSize, line: getComputedStyle(el).lineHeight, ul: getComputedStyle(el.querySelector('ul')).listStyleType, ol: getComputedStyle(el.querySelector('ol')).listStyleType }));
    assert.ok(metrics.width <= 730); assert.equal(metrics.font, '15px'); assert.equal(metrics.line, '27px'); assert.equal(metrics.ul, 'disc'); assert.equal(metrics.ol, 'decimal');
    const layout = await page.locator('.chat-transcript').evaluate(el => {
      const heading = el.querySelector('.assistant-message-heading'), body = el.querySelector('.assistant-answer'), summary = el.querySelector('.thinking-summary button');
      const th = body.querySelector('th');
      return { nameSize: getComputedStyle(heading).fontSize, avatar: heading.querySelector('.app-avatar').getBoundingClientRect().width, gap: body.getBoundingClientRect().top - heading.getBoundingClientRect().bottom, summaryBelow: summary.getBoundingClientRect().top >= body.getBoundingClientRect().bottom, verticalBorder: getComputedStyle(th).borderLeftWidth, tableBackground: getComputedStyle(th).backgroundColor, titleSize: getComputedStyle(body.querySelector('h3')).fontSize };
    });
    assert.equal(layout.nameSize, '16px'); assert.equal(layout.avatar, 40);
    assert.ok(layout.gap >= 12 && layout.gap <= 20, '身份区后直接进入正文');
    assert.ok(layout.summaryBelow, '分析入口位于正文下方');
    assert.equal(layout.verticalBorder, '0px'); assert.equal(layout.tableBackground, 'rgba(0, 0, 0, 0)'); assert.equal(layout.titleSize, '18px');
    assert.ok(prompts[0].includes('再追问最关键的1至2项'));
    const policyChecks = await page.evaluate(async () => {
      const apps = await import('/data/ai-apps.js');
      const experts = await import('/data/ai-experts.js');
      const local = { id: 'local-fixture', prompt: '你是采购顾问。报价只能依据用户提供的供应商资料。', constraints: '不得虚构报价' };
      return {
        appPrompts: apps.builtinAiApps.map(app => apps.buildAiAppOpeningPrompt(app)),
        expertPrompts: experts.aiExperts.map(expert => experts.buildExpertOpeningPrompt(expert)),
        custom: apps.buildAiAppOpeningPrompt(local),
        medical: apps.buildAiAppOpeningPrompt(apps.builtinAiApps.find(app => app.id === 'medical-expert')),
      };
    });
    for (const prompt of [...policyChecks.appPrompts, ...policyChecks.expertPrompts]) {
      assert.ok(prompt.includes('以本轮用户意图决定回答结构'));
      assert.ok(!prompt.includes('先提出 3-5 个关键问题'));
    }
    assert.ok(policyChecks.custom.includes('报价只能依据用户提供的供应商资料'));
    assert.ok(policyChecks.custom.includes('用户要求完整文档、问卷或指定模板时遵循其格式'));
    assert.ok(policyChecks.medical.includes('事实性内容只以这些资料为准'));
    await page.locator('.chat-scroll').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${output}/desktop.png` });
    await page.setViewportSize({ width: 760, height: 900 });
    assert.equal(await page.locator('.chat-scroll').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, '长代码局部滚动，不撑开消息栏');
    await page.screenshot({ path: `${output}/compact.png` });
    assert.deepEqual(errors, []);
    console.log('PASS 数字人阅读宽度、正文排版、列表标记、分析说明手动展开、流式完成、长代码窄屏');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
