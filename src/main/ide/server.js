'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { BrowserWindow } = require('electron');
const { ensureCodeServer, locateCodeServer } = require('./code-server');
const { discoverLocalVscode, spawnLocalVscode } = require('./local-vscode');
const { prepareLocale } = require('./locale');
const { ensureBundledExtensions } = require('./extensions');
const { seedUserSettings } = require('./seed');
const claudeBridge = require('./claude-bridge');
const prefs = require('./prefs');
const paths = require('./paths');

// 状态机：idle → checking → downloading → installing → preparing → starting → ready
//         失败 → error / unavailable
const state = {
  state: 'idle',
  backend: null,       // 'code-server' | 'local-vscode'
  url: null,
  port: null,
  version: null,
  locale: null,        // 'zh-cn' | 'en'：IDE 实际使用的界面语言
  warning: null,       // 不影响启动的提示（如中文包安装失败）
  localAvailable: null,// 是否检测到本机 VS Code（null = 还没探测过）
  error: null,
  logPath: paths.logFile(),
  download: null,
  workspacePath: null,
};

let child = null;
let childExitReason = null;
let ensurePromise = null;
let downloadAbort = null;
let stopping = false;

function emit(patch = {}) {
  Object.assign(state, patch);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('ide:status', { ...state });
  }
}

function getState() {
  return { ...state };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

/** 端口能否在 127.0.0.1 上绑定（占用中的端口不能复用）。 */
function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/**
 * 优先复用上次该后端用过的端口，占用或首次启动时再取随机空闲端口。
 * 复用端口 = 复用 origin，IDE 的 localStorage/IndexedDB 状态才能跨重启留存。
 */
async function pickPort(backend) {
  const saved = prefs.savedPort(backend);
  if (saved && await portAvailable(saved)) return saved;
  return getFreePort();
}

function httpProbe(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        // 只需要判断页面是不是 VS Code workbench，读前 16KB 足够。
        if (body.length < 16 * 1024) body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      res.on('error', () => resolve({ status: 0, body: '' }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.on('error', () => resolve({ status: 0, body: '' }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(url, childRef, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastStatus = 0;
  while (Date.now() - startedAt < timeoutMs) {
    if (childExitReason) throw new Error(`IDE 服务启动后立即退出：${childExitReason}`);
    const res = await httpProbe(url);
    lastStatus = res.status;
    if (res.status === 200 && /vscode|workbench/i.test(res.body)) return;
    await sleep(500);
  }
  throw new Error(`IDE 服务在 ${Math.round(timeoutMs / 1000)} 秒内未就绪（最后一次 HTTP 状态：${lastStatus || '无响应'}）`);
}

function rotateLog() {
  try {
    const file = paths.logFile();
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch (_) { /* 日志问题不能阻断启动 */ }
}

function pipeLog(childProcess) {
  fs.mkdirSync(paths.logsDir(), { recursive: true });
  const stream = fs.createWriteStream(paths.logFile(), { flags: 'a' });
  stream.write(`\n===== ${new Date().toISOString()} =====\n`);
  childProcess.stdout?.on('data', (d) => stream.write(d));
  childProcess.stderr?.on('data', (d) => stream.write(d));
  return stream;
}

function killChild() {
  const proc = child;
  child = null;
  if (!proc || proc.killed) return;
  stopping = true;
  try {
    if (process.platform === 'win32') {
      // 同步执行：应用退出时也要保证 taskkill 来得及跑完。
      try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch (_) { /* ignore */ }
    } else {
      // 以进程组方式启动（detached），负 PID 才能连子进程一起清理。
      process.kill(-proc.pid, 'SIGTERM');
      setTimeout(() => {
        try { process.kill(-proc.pid, 'SIGKILL'); } catch (_) { /* 已经退出 */ }
      }, 3000).unref?.();
    }
  } catch (err) {
    try { proc.kill('SIGKILL'); } catch (_) { /* 已经退出 */ }
  }
}

async function startCodeServer(workspacePath, onProgress) {
  emit({ state: 'checking', backend: 'code-server', error: null, download: null });
  if (locateCodeServer()) {
    emit({ state: 'starting' });
  } else {
    emit({ state: 'downloading', download: { percent: 0, received: 0, total: 0 } });
    downloadAbort = new AbortController();
    onProgress = (p) => {
      const nextState = p.percent >= 100 ? 'installing' : 'downloading';
      emit({ state: nextState, download: p });
    };
  }

  let runtime;
  try {
    runtime = await ensureCodeServer({
      onProgress,
      onInstalling: () => emit({ state: 'installing' }),
      signal: downloadAbort?.signal,
    });
  } finally {
    downloadAbort = null;
  }

  // 中文界面：装语言包 + 生成 languagepacks.json + 写 argv.json 的 locale。
  // 放在启动前，因为服务端渲染页面时就按这套配置拼 NLS 脚本地址；装不上只降级，不阻断。
  emit({ state: 'preparing', version: runtime.version, download: null });
  const i18n = await prepareLocale(runtime, {
    extensionsDir: paths.extensionsDir(),
    userDataDir: paths.serverDataDir(),
    // 上次装失败（多半是离线）就别每次启动都白等一轮网络超时，隔天再试。
    skipInstall: prefs.localeAttemptFresh(),
  });
  if (i18n.failed) prefs.markLocaleAttempt();

  // 预置扩展（Claude Code）：同样只降级不阻断，失败信息与语言包的提示合并展示。
  const ext = await ensureBundledExtensions(runtime, {
    extensionsDir: paths.extensionsDir(),
    userDataDir: paths.serverDataDir(),
  });

  await seedUserSettings(paths.serverDataDir()).catch(() => {});
  // 启动时按开关对账一次：用户改过网关地址/模型后不至于还用着旧配置。
  await claudeBridge.syncOnStart(paths.serverDataDir());
  emit({ locale: i18n.locale, warning: [i18n.warning, ext.warning].filter(Boolean).join(' ') || null });

  const port = await pickPort('code-server');
  const args = [
    runtime.dir,
    '--bind-addr', `127.0.0.1:${port}`,
    '--auth', 'none',
    '--disable-telemetry',
    '--disable-update-check',
    // 桌面端打开的是用户自己登记的本地目录，不需要再走一遍工作区信任确认；
    // 不关的话 IDE 顶部会常驻一条「受限模式」黄条，占地方且容易让人误以为不能用。
    '--disable-workspace-trust',
    '--user-data-dir', paths.serverDataDir(),
    '--extensions-dir', paths.extensionsDir(),
  ];
  // argv.json 写不进去（格式坏/只读）时才用命令行兜底；正常情况下让用户在
  // VS Code 里「配置显示语言」改过的选择生效，我们不再强行覆盖。
  if (i18n.forceLocale) args.push('--locale', i18n.locale);
  args.push(workspacePath);
  const env = { ...process.env };
  if (process.env.FDE_EXTENSIONS_GALLERY) {
    // 企业内网 Open VSX 镜像；不设置时 code-server 默认走 https://open-vsx.org。
    env.EXTENSIONS_GALLERY = process.env.FDE_EXTENSIONS_GALLERY;
  }

  rotateLog();
  childExitReason = null;
  stopping = false;
  const proc = spawn(runtime.node, args, {
    cwd: workspacePath,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  child = proc;
  const logStream = pipeLog(proc);
  proc.on('error', (err) => { childExitReason = err.message; logStream.end(); });
  proc.on('exit', (code, signal) => {
    logStream.end();
    childExitReason = signal ? `信号 ${signal}` : `退出码 ${code}`;
    if (child === proc) child = null;
    if (!stopping && ['ready', 'preparing', 'starting'].includes(state.state)) {
      emit({ state: 'error', error: `IDE 服务已退出（${childExitReason}），可点击重试。` });
    }
  });

  const url = `http://127.0.0.1:${port}/?folder=${encodeURIComponent(workspacePath)}`;
  await waitReady(url, proc);
  prefs.rememberPort('code-server', port);
  emit({ state: 'ready', backend: 'code-server', url, port, version: runtime.version, workspacePath, error: null });
  return url;
}

async function startLocalVscode(cli, workspacePath) {
  emit({ state: 'preparing', backend: 'local-vscode', error: null, download: null });

  // serve-web 的目录布局：<server-data-dir>/data/User 与 <server-data-dir>/extensions。
  // 语言包与预置扩展跟 code-server 走同一套安装逻辑，只是根目录不同。
  const dataRoot = paths.localServerDataDir();
  const extensionsDir = path.join(dataRoot, 'extensions');
  const userDataDir = path.join(dataRoot, 'data');
  const i18n = await prepareLocale({ executable: cli.executable }, {
    extensionsDir,
    userDataDir,
    skipInstall: prefs.localeAttemptFresh(),
  });
  if (i18n.failed) prefs.markLocaleAttempt();
  const ext = await ensureBundledExtensions({ executable: cli.executable }, {
    extensionsDir,
    userDataDir,
  });
  await seedUserSettings(userDataDir).catch(() => {});
  await claudeBridge.syncOnStart(userDataDir);
  emit({ locale: i18n.locale, warning: [i18n.warning, ext.warning].filter(Boolean).join(' ') || null });

  const port = await pickPort('local-vscode');
  const args = [
    'serve-web',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--without-connection-token',
    '--default-folder', workspacePath,
    '--server-data-dir', dataRoot,
    '--disable-telemetry',
    // 注意：serve-web 不认识 --disable-workspace-trust（会当成未知参数直接退出），
    // 所以这个后端只能靠设置里关掉受限模式提示，不能加命令行参数。
    // 许可：先不带 --accept-server-license-terms 启动；若 CLI 阻塞等待，
    // 返回错误里会体现，再由 UI 展示许可说明与“同意并继续”。
  ];

  rotateLog();
  childExitReason = null;
  stopping = false;
  const proc = spawnLocalVscode(cli.executable, args, {
    cwd: workspacePath,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = proc;
  const logStream = pipeLog(proc);
  proc.on('error', (err) => { childExitReason = err.message; logStream.end(); });
  proc.on('exit', (code, signal) => {
    logStream.end();
    childExitReason = signal ? `信号 ${signal}` : `退出码 ${code}`;
    if (child === proc) child = null;
    if (!stopping && ['ready', 'preparing', 'starting'].includes(state.state)) {
      emit({ state: 'error', error: `本机 VS Code 服务已退出（${childExitReason}），可点击重试。` });
    }
  });

  const url = `http://127.0.0.1:${port}/?folder=${encodeURIComponent(workspacePath)}`;
  await waitReady(url, proc, 90_000);
  prefs.rememberPort('local-vscode', port);
  emit({ state: 'ready', backend: 'local-vscode', url, port, version: null, workspacePath, error: null });
  return url;
}

async function assertWorkspace(workspacePath) {
  if (!workspacePath || typeof workspacePath !== 'string') throw new Error('缺少工作区路径');
  const stat = await fsp.stat(workspacePath).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error(`工作区目录不存在：${workspacePath}`);
}

async function doEnsure({ workspacePath, backend } = {}) {
  await assertWorkspace(workspacePath);

  // 服务已就绪：同一个服务进程，仅换 URL 里的 folder 参数。
  if (child && state.state === 'ready' && state.port) {
    const url = `http://127.0.0.1:${state.port}/?folder=${encodeURIComponent(workspacePath)}`;
    emit({ url, workspacePath });
    return { success: true, ...getState() };
  }

  const preferred = prefs.resolveBackend(backend);
  const errors = [];

  const tryCodeServer = async () => startCodeServer(workspacePath);
  const tryLocal = async () => {
    const cli = await discoverLocalVscode();
    emit({ localAvailable: !!cli });
    if (!cli) throw new Error('未检测到可用的本机 VS Code CLI（需要支持 serve-web）');
    return startLocalVscode(cli, workspacePath);
  };

  const attempts = preferred === 'local-vscode' ? [tryLocal, tryCodeServer] : [tryCodeServer, tryLocal];
  for (const attempt of attempts) {
    try {
      const url = await attempt();
      // 只有用户显式指定时才记住选择；回退到另一个后端不算用户意愿。
      if (backend) prefs.rememberBackend(backend);
      return { success: true, ...getState(), url };
    } catch (err) {
      errors.push(err.message);
      console.error('[ide] 后端启动失败:', err.message);
      killChild();
      emit({ state: 'error', error: err.message });
      // 用户主动取消下载：不再尝试回退。
      if (/取消/.test(err.message)) break;
    }
  }

  const both = errors.join(' / ');
  const unavailable = !errors.some((e) => /取消/.test(e));
  emit({
    state: unavailable ? 'unavailable' : 'error',
    error: both || '没有可用的 IDE 运行时',
    backend: null,
    url: null,
    port: null,
  });
  return { success: false, ...getState(), error: both };
}

/**
 * 确保 IDE 服务可用并返回可加载的 URL。
 * 并发调用会复用同一个启动过程。
 */
function ensure(options = {}) {
  if (ensurePromise) {
    return ensurePromise.then(async (res) => {
      if (options.workspacePath && res && res.success && state.port) {
        return doEnsure(options);
      }
      return res;
    });
  }
  ensurePromise = doEnsure(options).finally(() => { ensurePromise = null; });
  return ensurePromise;
}

function cancelDownload() {
  if (downloadAbort) downloadAbort.abort();
}

function restart(options = {}) {
  killChild();
  emit({ state: 'idle', url: null, port: null, error: null });
  return ensure(options);
}

function stop() {
  killChild();
  stopping = false;
  emit({ state: 'idle', url: null, port: null, backend: null, error: null });
}

function shutdown() {
  stopping = true;
  killChild();
}

module.exports = {
  ensure,
  restart,
  stop,
  shutdown,
  cancelDownload,
  getState,
  // 供测试/诊断
  _state: state,
};
