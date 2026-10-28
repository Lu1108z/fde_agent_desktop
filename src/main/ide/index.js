'use strict';

const { app, ipcMain, session } = require('electron');
const fs = require('fs');
const server = require('./server');
const paths = require('./paths');
const prefs = require('./prefs');
const claudeBridge = require('./claude-bridge');
const { LOCALE } = require('./locale');

const PARTITION = 'persist:fde-vscode';

/**
 * 给 IDE 的 webview 会话补中文请求头。
 *
 * code-server 在服务端按 argv.json / --locale 选语言；但本机 VS Code 的 serve-web
 * 走的是另一套：product.json 里配了 nlsCoreBaseUrl，语言只从请求头里取
 * （cookie `vscode.nls.locale` 或 `Accept-Language`），argv.json 在服务端渲染阶段
 * 不参与。两种后端都补上 Accept-Language，才能都稳定落在中文。
 *
 * 这是语言解析链里优先级最低的一环（args.locale > argv.json > cookie >
 * Accept-Language），所以用户在 VS Code 里「配置显示语言」改过的选择依然生效。
 * 该 partition 只给 IDE 用，不改应用自身页面的请求。
 */
function setLocaleHeaders() {
  const ses = session.fromPartition(PARTITION);
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    delete headers['accept-language'];
    headers['Accept-Language'] = `${LOCALE},zh;q=0.9,en;q=0.8`;
    callback({ requestHeaders: headers });
  });
}

// webview 安全策略：只允许访问本机 IDE 服务；所有外链交给系统浏览器。
function hardenWebviews() {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;

    contents.setWindowOpenHandler(({ url }) => {
      // IDE 内的链接（帮助、文档、扩展主页）不在内嵌窗口里打开。
      if (/^https?:/i.test(url)) require('electron').shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, targetUrl) => {
      try {
        const target = new URL(targetUrl);
        const isLoopback = target.hostname === '127.0.0.1' || target.hostname === 'localhost' || target.hostname === '[::1]';
        if (!isLoopback) {
          event.preventDefault();
          require('electron').shell.openExternal(targetUrl).catch(() => {});
        }
      } catch (_) {
        event.preventDefault();
      }
    });
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (_e, _webPreferences, _params) => {
      // 保证 guest 永远拿不到 Node/预加载能力。
      delete _webPreferences.preload;
      _webPreferences.nodeIntegration = false;
      _webPreferences.contextIsolation = true;
      _webPreferences.sandbox = true;
    });
  });
}

/**
 * IDE 页面空白自救。
 *
 * 偶发现象：webview 的文档加载完了、network 里 workbench.js 也是 200，但页面上
 * 始终没有 .monaco-workbench（黑屏），reload 也不恢复。开发机上定位过两轮：
 * - 只清 HTTP cache / code cache → 无效；
 * - 清掉该 partition 的存储（Local Storage、Session Storage、Service Worker、
 *   IndexedDB）→ 立刻恢复。
 * 根因是历史遗留：以前每次启动都换随机端口，而存储按含端口的 origin 隔离，
 * 分区里堆了十几个历史 origin 的存储，workbench bootstrap 会静默失败。
 * 现在端口复用（prefs.savedPort），不会再新增 origin。这里保留兜底：极端情况下
 * （如用户手动杀了服务、端口被别人抢占换了新端口）仍能自愈一次。
 *
 * 只动 persist:fde-vscode 这个 IDE 专用会话，不影响应用自身页面。
 */
async function recover() {
  const ses = session.fromPartition(PARTITION);
  await ses.clearCache().catch(() => {});
  // clearCodeCaches 旧版 Electron 没有；有就一并清，坏掉的编译产物同样会黑屏。
  if (typeof ses.clearCodeCaches === 'function') await ses.clearCodeCaches({}).catch(() => {});
  // 会丢 IDE 内的布局/面板等客户端状态（扩展装在磁盘、扩展登录态在扩展自己的存储里），
  // 所以只在确认黑屏后才调，不是每次启动都清。
  await ses.clearStorageData({ origin: null }).catch(() => {});
  return { success: true };
}

function registerIdeIpc() {
  setLocaleHeaders();
  ipcMain.handle('ide:status', () => server.getState());
  ipcMain.handle('ide:recover', () => recover());

  ipcMain.handle('ide:ensure', async (_event, { workspacePath, backend } = {}) => {
    return server.ensure({ workspacePath, backend });
  });

  ipcMain.handle('ide:restart', async (_event, { workspacePath, backend } = {}) => {
    return server.restart({ workspacePath, backend });
  });

  ipcMain.handle('ide:stop', () => {
    server.stop();
    return server.getState();
  });

  ipcMain.handle('ide:cancel-download', () => {
    server.cancelDownload();
    return { success: true };
  });

  // Claude 插件复用平台网关配置（可选，默认关闭）。
  ipcMain.handle('ide:claude-config', async () => {
    return claudeBridge.describe(paths.backendUserDataDir(prefs.resolveBackend()));
  });

  ipcMain.handle('ide:apply-claude-config', async (_event, { enabled } = {}) => {
    const on = !!enabled;
    prefs.rememberClaudeBridge(on);
    const active = prefs.resolveBackend();
    try {
      for (const backend of prefs.BACKENDS) {
        const dir = paths.backendUserDataDir(backend);
        // 非当前后端还没初始化过就跳过，不为它凭空建一套没人用的目录。
        if (backend !== active && !fs.existsSync(dir)) continue;
        await claudeBridge.syncClaudeConfig({ userDataDir: dir }, { enabled: on });
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
    const status = await claudeBridge.describe(paths.backendUserDataDir(active));
    return { success: true, status };
  });
}

function shutdownIde() {
  server.shutdown();
}

/** 主进程把 normalizeGatewayMode 注入进来，搬运配置时与设置页用同一套协议判断。 */
function setGatewayModeResolver(fn) {
  claudeBridge.setModeResolver(fn);
}

module.exports = { hardenWebviews, registerIdeIpc, shutdownIde, setGatewayModeResolver };
