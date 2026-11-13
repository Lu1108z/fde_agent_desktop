// 智能体平台：把 med-ai-demo（医院智能体安全协作平台）这个纯静态站点用本机 HTTP 服务托管，
// 渲染层用 iframe 嵌进来。不能走 file://，否则站内 fetch('data/*.json') 会被拦截。
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};
// 每个页面注入平台自带的悬浮「返回」导航（来自 med-ai-demo/.electron-build/preload.js）
const NAV_TAG = '<script src="/__fde_nav.js"></script>';

function createAgentPlatform(candidates) {
  let server = null, port = 0, ready = null;
  const root = () => candidates.find(dir => dir && fs.existsSync(path.join(dir, 'index.html')));
  function resolve(base, urlPath) {
    let clean;
    try { clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch (_) { return null; }
    if (clean === '/' || clean === '') clean = '/index.html';
    const target = path.normalize(path.join(base, clean));
    return target === base || target.startsWith(base + path.sep) ? target : null;
  }
  function handle(req, res) {
    const base = root();
    if (!base) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('智能体平台资源缺失'); return; }
    let target = resolve(base, req.url);
    if (!target) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.stat(target, (err, stat) => {
      if (!err && stat.isDirectory()) target = path.join(target, 'index.html');
      const ext = path.extname(target).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      if (ext === '.html' || ext === '.htm') {
        fs.readFile(target, 'utf8', (rErr, html) => {
          if (rErr) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); return; }
          const body = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, NAV_TAG + '</body>') : html + NAV_TAG;
          res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body);
        });
        return;
      }
      fs.stat(target, (sErr, info) => {
        if (sErr || !info.isFile()) { res.writeHead(404); res.end(); return; }
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        if (range) {
          const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
          if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
          res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
          fs.createReadStream(target, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
          fs.createReadStream(target).pipe(res);
        }
      });
    });
  }
  function start() {
    if (ready) return ready;
    ready = new Promise((done, fail) => {
      server = http.createServer(handle);
      server.once('error', error => { ready = null; fail(error); });
      server.listen(0, '127.0.0.1', () => { port = server.address().port; done(port); });
    });
    return ready;
  }
  // page：站内相对路径，默认进运营大屏（与原桌面版一致）
  async function url(page = 'dashboard/index.html') {
    if (!root()) throw new Error('没有找到智能体平台资源（med-ai-demo）');
    await start();
    const clean = String(page || '').replace(/^\/+/, '');
    return `http://127.0.0.1:${port}/${clean}`;
  }
  return { url, root, isPlatformUrl: link => !!port && link.startsWith(`http://127.0.0.1:${port}/`) };
}
module.exports = { createAgentPlatform };
