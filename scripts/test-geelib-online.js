const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { registerGeelibOnline: registerFeishuOnline, isGeelibUrl: isFeishuUrl, isLibraryRoute, START_URL, REPO_URL } = require('../src/main/geelib-online');
const { clampBounds } = require('../src/main/feishu-online');
const TABLES = {original: START_URL, progress: START_URL};

async function run() {
  assert.equal(isLibraryRoute('http://127.0.0.1/#/code'), false);
  assert.equal(isLibraryRoute('http://127.0.0.1/#/code/workspace-one'), false);
  assert.equal(isLibraryRoute('http://127.0.0.1/#/library/repository'), true);
  assert.equal(isFeishuUrl(TABLES.original), true);
  assert.equal(isFeishuUrl('https://login.ops.qihoo.net:4436/sec/login'), true);
  assert.equal(isFeishuUrl('https://sec.corp.qihoo.net/'), true);
  for (const value of ['https://geelib.qihoo.net.evil.com/', 'https://login.ops.qihoo.net:444/', 'https://user:pass@geelib.qihoo.net/', 'https://other.qihoo.net/', 'http://geelib.qihoo.net/']) assert.equal(isFeishuUrl(value), false);
  for (const url of ['http://feishu.cn', 'https://feishu.cn.evil.com', 'https://evil.com/feishu.cn', 'file:///tmp/a', 'https://user@feishu.cn', 'https://feishu.cn:8000']) assert.equal(isFeishuUrl(url), false);
  assert.deepEqual(clampBounds({ x: -10, y: 0, width: 4000, height: 4000 }, { width: 1000, height: 800 }), { x: 0, y: 28, width: 1000, height: 772 });
  assert.deepEqual(clampBounds({ x: 10, y: 100, width: 200, height: 100 }, { width: 1000, height: 800 }, 1.5), { x: 15, y: 150, width: 300, height: 150 });
  assert.throws(() => clampBounds({ x: NaN }, { width: 1000, height: 800 }));
  const handlers = new Map(), views = [], external = [], events = [];
  const app = new EventEmitter(), session = new EventEmitter(); app.getPath = () => '/tmp/Downloads';
  session.setPermissionRequestHandler = handler => { session.permission = handler; };
  session.setPermissionCheckHandler = handler => { session.check = handler; };
  class Contents extends EventEmitter {
    constructor(url = '') { super(); this.url = url; this.mainFrame = {}; this.navigationHistory = { canGoBack: () => false, canGoForward: () => false }; this.session = session; }
    isDestroyed() { return !!this.closed; } getURL() { return this.url; } getTitle() { return ''; }
    getUserAgent() { return 'Browser Electron/41.1.1'; } setUserAgent(value) { this.userAgent = value; }
    isLoading() { return false; } getZoomFactor() { return 1; }
    setWindowOpenHandler(handler) { this.popup = handler; }
    send(channel, payload) { events.push({ channel, payload }); } close() { this.closed = true; } reload() { this.reloaded = true; }
    async capturePage() { return { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,frame' }; }
    async loadURL(url) { this.url = url; }
  }
  class View {
    constructor(options) { this.options = options; this.webContents = new Contents(); views.push(this); }
    setVisible(value) { this.visible = value; } setBounds(value) { this.bounds = value; }
  }
  const win = new EventEmitter(); win.webContents = new Contents('http://127.0.0.1:43918/#/library/team');
  win.isDestroyed = () => false; win.getContentBounds = () => ({ width: 1200, height: 900 });
  win.contentView = { addChildView() {}, removeChildView() {} };
  let allowed = true;
  registerFeishuOnline({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, WebContentsView: View, BrowserWindow: {}, app, getWindow: () => win, isAllowed: () => allowed, shell: { openExternal: async url => external.push(url) }, dialog: {} });
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  const invoke = (name, payload, caller = event) => handlers.get(`geelib-online:${name}`)(caller, payload);
  const bounds = { x: 0, y: 160, width: 1200, height: 740 };
  const first = { token: 'page-one-token', bounds };
  assert.equal((await invoke('attach', first, { ...event, senderFrame: {} })).success, false);
  allowed = false; assert.equal((await invoke('attach', first)).success, false); allowed = true;
  assert.equal((await invoke('attach', first)).success, true);
  const view = views[0]; assert.equal(view.visible, true);
  assert.equal(view.options.webPreferences.partition, 'persist:geelib-online');
  let loginBlocked = false;
  view.webContents.emit('will-redirect', {url:'https://login.ops.qihoo.net:4436/sec/login', isMainFrame:true, preventDefault(){ loginBlocked=true; }});
  assert.equal(loginBlocked, false);
  assert.equal((await invoke('action', {token:first.token, action:'progress'})).success,false);
  assert.equal(view.options.webPreferences.webSecurity, true);
  assert.equal(view.options.webPreferences.sandbox, true);
  assert.equal(view.options.webPreferences.nodeIntegration, false);
  assert.equal(view.options.webPreferences.preload, undefined);
  assert.equal((await invoke('action', { token: first.token, action: 'original' })).success, true);
  assert.equal(view.webContents.url, TABLES.progress);
  await invoke('obscured', { reason: 'navigation', value: true }); assert.equal(view.visible, true);
  const menuFrame = events.find(event => event.channel === 'geelib-online:preview').payload;
  assert.equal(menuFrame.token, first.token);
  await invoke('preview-ready', { token: first.token, id: menuFrame.id - 1 }); assert.equal(view.visible, true);
  await invoke('preview-ready', { token: first.token, id: menuFrame.id }); assert.equal(view.visible, false);
  await invoke('obscured', { reason: 'license', value: true });
  await invoke('obscured', { reason: 'navigation', value: false }); assert.equal(view.visible, false);
  await invoke('obscured', { reason: 'license', value: false }); assert.equal(view.visible, true);
  await invoke('preview-ready', { token: first.token, id: menuFrame.id }); assert.equal(view.visible, true);
  assert.equal(events.filter(event => event.channel === 'geelib-online:preview').at(-1).payload.image, '');
  let releaseCapture;
  view.webContents.capturePage = () => new Promise(resolve => { releaseCapture = resolve; });
  await invoke('obscured', { reason: 'navigation', value: true });
  await invoke('obscured', { reason: 'navigation', value: false });
  const eventCount = events.length;
  releaseCapture({ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,stale' });
  await Promise.resolve(); assert.equal(events.length, eventCount); assert.equal(view.visible, true);
  const second = { token: 'page-two-token', bounds };
  await invoke('attach', second); await invoke('detach', first); assert.equal(view.visible, true);
  assert.equal((await invoke('bounds', first)).success, false);
  let blocked = false;
  view.webContents.emit('will-navigate', { url: 'file:///tmp/private', preventDefault() { blocked = true; } }); assert.equal(blocked, true);
  assert.equal(view.webContents.popup({ url: 'https://evil.com' }).action, 'deny');
  assert.equal(view.webContents.popup({ url: 'https://login.ops.qihoo.net:4436/sec/login' }).overrideBrowserWindowOptions.webPreferences.sandbox, true);
  const download = new EventEmitter(); download.getFilename = () => '../../export.xlsx'; download.setSaveDialogOptions = options => { download.options = options; };
  session.emit('will-download', {}, download, view.webContents); assert.equal(download.options.defaultPath, '/tmp/Downloads/export.xlsx');
  const invalidDownload = { cancel() { this.cancelled = true; } };
  session.emit('will-download', {}, invalidDownload, {}); assert.equal(invalidDownload.cancelled, true);
  await invoke('action', { token: second.token, action: 'external' }); assert.equal(external[0], TABLES.progress);
  win.webContents.url = 'http://127.0.0.1:43918/#/library/repository';
  win.webContents.emit('did-navigate-in-page', {}, win.webContents.url, true);
  assert.equal(view.visible, false);
  assert.equal((await invoke('action', {token:second.token,action:'reload'})).success,false);
  const repoPage = {token:'repository-page-token',bounds};
  await invoke('attach',repoPage);
  assert.equal(view.visible,true);
  assert.equal(views.length,1);
  assert.equal(view.webContents.url,REPO_URL);
  await invoke('action',{token:repoPage.token,action:'original'});
  assert.equal(view.webContents.url,REPO_URL);
  win.webContents.url = 'http://127.0.0.1:43918/#/library/team';
  win.webContents.emit('did-navigate-in-page', {}, win.webContents.url, true);
  assert.equal(view.visible,false);
  await invoke('attach',second);
  assert.equal(view.webContents.url,START_URL);
  assert.equal(views.length,1);
  win.webContents.url = 'http://127.0.0.1:43918/#/projects';
  win.webContents.emit('did-navigate-in-page', {}, win.webContents.url, true); assert.equal(view.visible, false);
  assert.equal((await invoke('action', { token: second.token, action: 'reload' })).success, false);
  win.webContents.url = 'http://127.0.0.1:43918/#/library/team'; await invoke('attach', second);
  win.webContents.emit('did-start-navigation', { isMainFrame: true }); assert.equal(view.visible, false);
  app.emit('before-quit'); assert.equal(view.webContents.closed, true); assert.equal(session.listenerCount('will-download'), 0);
  console.log('✓ 极库云在线页面：来源与域名限制、隔离、布局、遮挡、路由退出及清理通过');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
