// 对话页切到别的页面不打断：AI 专家正在回复时去「资源」，回复继续收；再点「AI 应用广场」回到原对话。
const assert = require('node:assert/strict');
const { chromium } = require(process.env.FDE_PLAYWRIGHT || '/Users/luzhenpeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let finishPrompt; const cancels = [], errors = [];
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
      if (method === 'prompt') return new Promise(resolve => { finishPrompt = resolve; });
      if (method === 'cancel') { cancels.push(args[0]); return { success: true }; }
    }
    return { success: true, items: [], files: [] };
  });
  await page.addInitScript(() => {
    window.testListeners = {};
    window.api = new Proxy({}, { get: (_, ns) => new Proxy({}, { get: (_, method) => String(method).startsWith('on') ? fn => { (window.testListeners[method] ||= []).push(fn); return () => { window.testListeners[method] = window.testListeners[method].filter(f => f !== fn); }; } : (...args) => window.testBridge(ns, method, args) }) });
    window.emit = (method, data) => (window.testListeners[method] || []).forEach(fn => fn(data));
  });
  try {
    await page.goto('http://127.0.0.1:43917/#/apps/image-generation');
    await page.locator('.ac-composer textarea').fill('做一张海报');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.locator('.ac-busy').waitFor();
    await page.evaluate(() => window.emit('onSessionUpdate', { update: { type: 'agent_message_chunk', content: '第一段。' } }));

    // 切到资源 → 宣传物料
    await page.evaluate(() => { location.hash = '#/library/promo'; });
    await page.waitForFunction(() => location.hash === '#/library/promo');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.ac-page').isVisible().catch(() => false), false);
    // 不在页面上时回复继续流进来
    await page.evaluate(() => window.emit('onSessionUpdate', { update: { type: 'agent_message_chunk', content: '第二段（后台收到）。' } }));

    // 菜单里「AI 应用广场」应直接回到这个对话
    const href = await page.locator('.header-subnav-link', { hasText: 'AI 应用广场' }).getAttribute('href');
    assert.equal(href, '#/apps/image-generation');
    await page.evaluate(() => { location.hash = '#/apps/image-generation'; });
    await page.locator('.ac-busy').waitFor();
    await page.waitForFunction(() => document.querySelector('.chat-transcript')?.innerText.includes('第二段（后台收到）'), null, { timeout: 8000 }).catch(() => {});
    const text = await page.locator('.chat-transcript').innerText();
    assert.ok(text.includes('做一张海报') && text.includes('第一段') && text.includes('第二段（后台收到）'), text.slice(0, 400));
    finishPrompt({ success: true });
    await page.locator('.ac-busy').waitFor({ state: 'detached' });
    assert.deepEqual(cancels, [], '切页面不应取消回复');

    // 左上角返回广场后，菜单恢复指向广场
    await page.getByRole('button', { name: '返回应用广场' }).click();
    await page.waitForFunction(() => location.hash === '#/apps');
    assert.equal(await page.locator('.header-subnav-link', { hasText: 'AI 应用广场' }).getAttribute('href'), '#/apps');
    assert.deepEqual(errors, []);
    console.log('background chat: ok');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
