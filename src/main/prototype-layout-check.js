// 原型版面检查：在隐藏窗口里按常见桌面尺寸实际渲染每个页面，量出内容铺到了屏幕多高。
// 治"页面只有半屏、下面一片空白"这类只有打开才看得出的问题——生成后自动跑，不合格就让 AI 补内容。
const fs = require('fs');
const http = require('http');
const path = require('path');

const VIEWPORT = { width: 1440, height: 900 };
const MIN_FILL = 0.8; // 内容底边至少到视口高度的 80%
const SETTLE_MS = 1800; // 等 fetch(data/*.json) + Alpine 渲染 + 图表绘制
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

// 在页面里执行：只统计"真内容"（有文字、图片、图表、表单控件，或有底色/边框/阴影的卡片），
// 跳过 fixed 浮层（LOOP 抽屉、批注按钮、详情抽屉）和 main/body 这类撑高的布局容器。
const MEASURE = `(() => {
  const vh = window.innerHeight, vw = window.innerWidth, fixed = new WeakMap();
  const inFixed = el => { if (!el || el === document.body) return false; if (fixed.has(el)) return fixed.get(el);
    const s = getComputedStyle(el); const v = s.position === 'fixed' || s.position === 'sticky' || inFixed(el.parentElement); fixed.set(el, v); return v; };
  const own = el => { if (/^(IMG|CANVAS|SVG|INPUT|TEXTAREA|SELECT|BUTTON|TABLE|VIDEO|IFRAME)$/i.test(el.tagName)) return true;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    const s = getComputedStyle(el); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0; };
  let bottom = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(MAIN|SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/i.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
    if (inFixed(el) || !own(el)) continue;
    bottom = Math.max(bottom, r.bottom + window.scrollY);
  }
  const doc = document.documentElement;
  return { bottom: Math.round(bottom), viewport: vh, fill: +(bottom / vh).toFixed(2), overflowX: doc.scrollWidth > vw + 2 ? doc.scrollWidth : 0 };
})()`;

function serve(dir) {
  return new Promise((resolve, reject) => {
    const root = path.resolve(dir);
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]); if (rel === '/') rel = '/index.html';
      const file = path.resolve(root, '.' + rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(fs.readFileSync(file));
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// 返回 { pages:[{file, fill, bottom, viewport, overflowX, errors}], issues:[中文问题描述] }
async function checkPrototypeLayout(dir, { BrowserWindow, minFill = MIN_FILL, viewport = VIEWPORT } = {}) {
  if (!fs.existsSync(dir)) return { pages: [], issues: [`原型目录不存在：${dir}`] };
  const files = fs.readdirSync(dir).filter(f => /\.html?$/i.test(f) && !f.startsWith('_')).sort();
  const server = await serve(dir);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const win = new BrowserWindow({ show: false, width: viewport.width, height: viewport.height, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  const pages = [], issues = [];
  try {
    for (const file of files) {
      const errors = [];
      // Electron 35+：控制台信息都在 event 对象上（level 为 'error' 等字符串）
      const onConsole = event => { if (event.level === 'error') errors.push(String(event.message).slice(0, 160)); };
      win.webContents.on('console-message', onConsole);
      try {
        await win.loadURL(base + encodeURI(file));
        await new Promise(r => setTimeout(r, SETTLE_MS));
        const m = await win.webContents.executeJavaScript(MEASURE, true);
        pages.push({ file, ...m, errors });
        if (m.fill < minFill) issues.push(`${file}：内容只铺到屏幕 ${Math.round(m.fill * 100)}%（${viewport.width}×${viewport.height} 下底部空白 ${viewport.height - m.bottom}px），需补足内容区块让首屏铺满`);
        if (m.overflowX) issues.push(`${file}：页面横向溢出（内容宽 ${m.overflowX}px > 视口 ${viewport.width}px）`);
        if (errors.length) issues.push(`${file}：脚本报错 ${errors[0]}`);
      } catch (err) {
        pages.push({ file, fill: 0, errors: [err.message] });
        issues.push(`${file}：页面无法打开（${err.message}）`);
      } finally {
        win.webContents.removeListener('console-message', onConsole);
      }
    }
  } finally {
    if (!win.isDestroyed()) win.destroy();
    server.close();
  }
  return { pages, issues };
}

// 修复指令在渲染层 delivery-skills.mjs 的 layoutRepairPrompt（发给 AI 的那份）。
module.exports = { checkPrototypeLayout, MIN_FILL, VIEWPORT };
