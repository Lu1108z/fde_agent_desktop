// 原型版面检查回归测试：半屏页面必须被拦下，铺满的页面放行，脚本报错要报出来。
// 运行：env -u ELECTRON_RUN_AS_NODE npx electron scripts/test-prototype-layout.cjs
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { checkPrototypeLayout } = require('../src/main/prototype-layout-check');

const shell = body => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px sans-serif}.card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:12px;margin:12px}</style></head><body><nav style="position:sticky;top:0;height:48px;background:#eef">导航</nav><main style="min-height:calc(100vh - 48px)">${body}</main><button style="position:fixed;right:20px;bottom:20px">批注</button></body></html>`;

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fde-layout-'));
  try {
    fs.writeFileSync(path.join(dir, 'half.html'), shell('<div class="card" style="height:300px">KPI</div>'));
    fs.writeFileSync(path.join(dir, 'full.html'), shell('<div class="card" style="height:400px">KPI</div><div class="card" style="height:380px">图表</div>'));
    fs.writeFileSync(path.join(dir, 'padded.html'), shell('<div style="padding-bottom:700px"><div class="card" style="height:100px">只有一块</div></div>'));
    fs.writeFileSync(path.join(dir, 'broken.html'), shell('<div class="card" style="height:800px">x</div><script>throw new Error("boom")</script>'));
    fs.writeFileSync(path.join(dir, 'wide.html'), shell('<div class="card" style="width:2400px;height:800px">宽</div>'));
    fs.writeFileSync(path.join(dir, '_template.html'), shell(''));
    const { pages, issues } = await checkPrototypeLayout(dir, { BrowserWindow });
    const by = Object.fromEntries(pages.map(p => [p.file, p]));
    assert.ok(!by['_template.html'], '模板文件不参与检查');
    assert.ok(by['half.html'].fill < 0.8 && issues.some(i => i.startsWith('half.html：内容只铺到')), '半屏页面必须被拦下');
    assert.ok(by['padded.html'].fill < 0.8, '用 padding 撑高度不算内容');
    assert.ok(by['full.html'].fill >= 0.8 && !issues.some(i => i.startsWith('full.html')), '铺满页面放行；sticky 导航和 fixed 浮层不计入');
    assert.ok(issues.some(i => i.startsWith('broken.html：脚本报错') && i.includes('boom')), '脚本报错要报出来');
    assert.ok(issues.some(i => i.startsWith('wide.html：页面横向溢出')), '横向溢出要报出来');
    console.log('PASS 原型版面检查：半屏/padding 撑高/脚本报错/横向溢出被拦下，铺满页面放行');
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
