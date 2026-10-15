const path = require('path');

const BASE_URL = 'https://wcn3xtaqzk2z.feishu.cn/base/QNnAbN7CKaHAowsD5OvcMlbQnie';
const TABLES = {
  original: `${BASE_URL}?table=tblF4xt2IIgM8Nij&view=vewzcaAeB3`,
  progress: `${BASE_URL}?table=tblRmvOhnaXoKYkL&view=vewqH5dplg`,
};
function isFeishuUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
      ['feishu.cn', 'larksuite.com'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
function isManagementRoute(value) {
  try { return new URL(value).hash.split('?')[0] === '#/project-management'; } catch { return false; }
}
function clampBounds(raw, size, zoom = 1) {
  if (!raw || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(raw[key]))) throw new Error('页面尺寸无效');
  const x = Math.min(size.width, Math.max(0, Math.round(raw.x * zoom)));
  // Keep the native page below the application's window controls.
  const y = Math.min(size.height, Math.max(28, Math.round(raw.y * zoom)));
  return { x, y, width: Math.min(size.width - x, Math.max(0, Math.round(raw.width * zoom))), height: Math.min(size.height - y, Math.max(0, Math.round(raw.height * zoom))) };
}

function registerOnlinePage({ ipcMain, WebContentsView, BrowserWindow, shell, app, getWindow, isAllowed }, { channel, label, urls, getUrls, isUrl, isRoute, partition }) {
  let routeUrls = urls, entryUrl = '';
  let owner = null, view = null, token = '', rectangle = null, attachedRoute = '';
  let error = '', downloadNotice = '';
  let previewId = 0, previewReady = false;
  const obscured = new Set();
  const popups = new Set();
  let downloadSession = null, downloadHandler = null;
  const preferences = { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false };
  const live = () => view && !view.webContents.isDestroyed();
  const routeKey = value => { try { return new URL(value).hash.split('?')[0]; } catch { return ''; } };
  const state = () => ({ success: true, token, url: live() ? view.webContents.getURL() : routeUrls.original, title: live() ? view.webContents.getTitle() : '', loading: !!live() && view.webContents.isLoading(), canGoBack: !!live() && view.webContents.navigationHistory.canGoBack(), canGoForward: !!live() && view.webContents.navigationHistory.canGoForward(), error, downloadNotice });
  function publish() {
    if (owner && !owner.isDestroyed() && !owner.webContents.isDestroyed()) owner.webContents.send(`${channel}:status`, state());
  }
  function layout() {
    if (!live() || !owner || owner.isDestroyed()) return;
    if (rectangle) view.setBounds(clampBounds(rectangle, owner.getContentBounds(), owner.webContents.getZoomFactor()));
    // Keep the live page visible until its replacement frame has painted below the menu.
    const hidden = obscured.has('license') || (obscured.has('navigation') && previewReady);
    view.setVisible(!!token && !!rectangle && rectangle.width > 0 && rectangle.height > 0 && !hidden && !error && isRoute(owner.webContents.getURL()) && routeKey(owner.webContents.getURL()) === attachedRoute);
  }
  async function captureMenuFrame() {
    const id = ++previewId, pageToken = token;
    if (!live() || !pageToken || !obscured.has('navigation') || obscured.has('license') || error) return;
    try {
      const frame = await view.webContents.capturePage();
      if (id !== previewId || token !== pageToken || !obscured.has('navigation') || !owner || owner.isDestroyed() || frame.isEmpty()) return;
      owner.webContents.send(`${channel}:preview`, { token: pageToken, id, image: frame.toDataURL() });
    } catch { /* Keep the live table visible if capturing a menu backdrop fails. */ }
  }
  function detach() { ++previewId; previewReady = false; token = ''; rectangle = null; attachedRoute = ''; if (live()) view.setVisible(false); }
  function dispose() {
    detach();
    for (const popup of popups) if (!popup.isDestroyed()) popup.destroy();
    popups.clear();
    if (downloadSession && downloadHandler) downloadSession.removeListener('will-download', downloadHandler);
    downloadSession = null; downloadHandler = null;
    if (live()) { owner?.contentView.removeChildView(view); view.webContents.close(); }
    view = null; owner = null; entryUrl = ''; obscured.clear();
  }
  function guard(event, requireToken, payload) {
    const win = getWindow();
    if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('非法调用来源');
    if (requireToken && (!token || payload?.token !== token || !isRoute(win.webContents.getURL()) || routeKey(win.webContents.getURL()) !== attachedRoute)) throw new Error('在线页面已关闭');
    return win;
  }
  function secure(contents) {
    contents.on('will-navigate', (event, url) => { if (!isUrl(event.url || url)) event.preventDefault(); });
    contents.on('will-redirect', (event, url, _sameDocument, mainFrame) => { if ((event.isMainFrame ?? mainFrame) && !isUrl(event.url || url)) event.preventDefault(); });
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (!isUrl(url)) return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: { parent: owner, width: 1100, height: 780, autoHideMenuBar: true, webPreferences: { ...preferences, preload: undefined } } };
    });
    contents.on('did-create-window', popup => {
      popups.add(popup); secure(popup.webContents);
      popup.on('closed', () => popups.delete(popup));
    });
  }
  function ensure(win) {
    if (owner && owner !== win) dispose();
    if (!owner) {
      owner = win;
      win.on('resize', layout);
      win.webContents.on('did-start-navigation', (event, _url, _inPlace, mainFrame) => { if (event.isMainFrame ?? mainFrame) detach(); });
      win.webContents.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame && (!isRoute(url) || routeKey(url) !== attachedRoute)) detach(); });
      win.webContents.on('render-process-gone', detach);
      win.on('closed', dispose);
    }
    if (live()) return;
    view = new WebContentsView({ webPreferences: preferences });
    view.setVisible(false);
    win.contentView.addChildView(view);
    secure(view.webContents);
    // A browser-like user agent avoids websites mistaking this for the Feishu desktop client.
    view.webContents.setUserAgent(view.webContents.getUserAgent().replace(/\s(?:Electron|fde-prodesigner)\/[\w.-]+/g, ''));
    const contents = view.webContents;
    contents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && owner && !owner.isDestroyed()) owner.webContents.send(`${channel}:status`, { ...state(), exitFullscreen: true });
    });
    for (const name of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) contents.on(name, () => {
      if (name === 'did-start-loading') { error = ''; layout(); }
      publish();
    });
    contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (!mainFrame || code === -3) return;
      error = `${label}页面未能加载（${description}），请重试或在浏览器打开。`; layout(); publish();
    });
    contents.on('render-process-gone', () => { error = `${label}页面已停止运行，请重新加载。`; layout(); publish(); });
    const session = contents.session;
    session.setPermissionRequestHandler((_wc, permission, callback, details) => callback(permission === 'clipboard-sanitized-write' && isUrl(details.requestingUrl)));
    session.setPermissionCheckHandler((_wc, permission, origin) => permission === 'clipboard-sanitized-write' && isUrl(origin));
    downloadSession = session;
    downloadHandler = (_event, item, source) => {
      if (source !== contents && !Array.from(popups).some(popup => !popup.isDestroyed() && popup.webContents === source)) { item.cancel(); return; }
      // Electron opens its own save dialog after this synchronous callback.
      item.setSaveDialogOptions({ title: `保存${label}文件`, defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
      item.once('done', (_e, status) => { downloadNotice = status === 'completed' ? '文件已保存' : status === 'cancelled' ? '' : '下载未完成，请重试'; publish(); });
    };
    session.on('will-download', downloadHandler);
    entryUrl = routeUrls.original;
    contents.loadURL(entryUrl).catch(() => {});
  }
  const serviceChannel = channel;
  function handle(channel, action) {
    ipcMain.handle(`${serviceChannel}:${channel}`, async (event, payload) => {
      try { return await action(event, payload || {}); }
      catch (err) { return { success: false, error: err.message }; }
    });
  }
  handle('attach', (event, payload) => {
    const win = guard(event, false);
    if (!isRoute(win.webContents.getURL()) || !isAllowed()) throw new Error(`请先激活软件并打开${label}页面`);
    if (typeof payload.token !== 'string' || !/^[\w-]{8,80}$/.test(payload.token)) throw new Error('页面标识无效');
    routeUrls = getUrls ? getUrls(win.webContents.getURL()) : urls;
    if (!isUrl(routeUrls?.original)) throw new Error('在线页面地址无效');
    ensure(win);
    if (entryUrl !== routeUrls.original) {
      error = ''; entryUrl = routeUrls.original;
      view.webContents.loadURL(entryUrl).catch(() => {});
    }
    token = payload.token; rectangle = payload.bounds; attachedRoute = routeKey(win.webContents.getURL()); previewReady = false; layout();
    if (obscured.has('navigation')) captureMenuFrame();
    return state();
  });
  handle('bounds', (event, payload) => { guard(event, true, payload); rectangle = payload.bounds; layout(); return { success: true }; });
  handle('detach', (event, payload) => { guard(event, false); if (payload.token === token) detach(); return { success: true }; });
  handle('obscured', (event, payload) => {
    guard(event, false);
    if (!['navigation', 'license'].includes(payload.reason)) throw new Error('遮挡原因无效');
    const changed = obscured.has(payload.reason) !== !!payload.value;
    if (payload.value) obscured.add(payload.reason); else obscured.delete(payload.reason);
    if (changed && payload.reason === 'navigation') {
      previewReady = false; ++previewId;
      if (payload.value) captureMenuFrame();
      else {
        layout();
        if (owner && !owner.isDestroyed()) owner.webContents.send(`${channel}:preview`, { token, id: previewId, image: '' });
      }
    }
    layout(); return { success: true };
  });
  handle('preview-ready', (event, payload) => {
    guard(event, true, payload);
    if (payload.id === previewId && obscured.has('navigation')) { previewReady = true; layout(); }
    return { success: true };
  });
  handle('action', async (event, payload) => {
    guard(event, true, payload);
    if (!live() || !isAllowed()) throw new Error('在线页面暂不可用');
    const contents = view.webContents;
    switch (payload.action) {
      case 'back': if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); break;
      case 'forward': if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward(); break;
      case 'reload': error = ''; layout(); contents.reload(); break;
      case 'original': case 'progress':
        if (!routeUrls[payload.action]) throw new Error('不支持的页面');
        error = ''; layout(); contents.loadURL(routeUrls[payload.action]).catch(() => {}); break;
      case 'external': await shell.openExternal(isUrl(contents.getURL()) ? contents.getURL() : routeUrls.original); break;
      default: throw new Error('不支持的操作');
    }
    return state();
  });
  app.on('before-quit', dispose);
  return { dispose };
}

function registerFeishuOnline(options) {
  return registerOnlinePage(options, { channel: 'feishu-online', label: '飞书', urls: TABLES, isUrl: isFeishuUrl, isRoute: isManagementRoute, partition: 'persist:feishu-online' });
}

module.exports = { registerOnlinePage, registerFeishuOnline, isFeishuUrl, isManagementRoute, clampBounds, TABLES };
