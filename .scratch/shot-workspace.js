/**
 * 截图验证脚本（仅开发用，不进产物）：启动真实主进程 → 打开某个代码工作区 → 截图。
 *
 * 用法：
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
 *     .scratch/shot-workspace.js <workspaceId> [out.png] [waitMs]
 *
 * 就是直接跑 src/main/index.js 的完整应用，只是额外挂上 CDP 与截图逻辑。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const workspaceId = process.argv[2] || '';
const outFile = process.argv[3] || '/tmp/fde-ide.png';
const waitMs = Number(process.argv[4] || 22000);

// 复用真实主进程（它会自己建窗口、注册 IPC）。
require(path.resolve(__dirname, '..', 'src', 'main', 'index.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await sleep(2500);
  const win = require('electron').BrowserWindow.getAllWindows()[0];
  if (!win) { console.error('no window'); app.quit(); return; }
  win.setSize(1500, 940);

  if (workspaceId) {
    // 开发机通常没装 hermes-acp，启动门禁会把人踢到 /setup。
    // 第一次导航消耗掉 bootChecked，再跳一次就能进真正的页面。
    await win.webContents.executeJavaScript(`location.hash = '#/code/${workspaceId}'`, true);
    await sleep(1500);
    await win.webContents.executeJavaScript(`location.hash = '#/code/${workspaceId}'`, true);
  }
  await sleep(waitMs);

  try {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(outFile, img.toPNG());
    console.log('saved', outFile);
  } catch (err) {
    console.error('capture failed', err.message);
  }

  // 顺便把 webview 里的 IDE 也截一张（webview 是独立 webContents，主窗口截图里可能空白）。
  try {
    const { webContents } = require('electron');
    const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview');
    if (guest) {
      const g = await guest.capturePage();
      fs.writeFileSync(outFile.replace(/\.png$/, '-guest.png'), g.toPNG());
      console.log('saved guest');
      const title = await guest.executeJavaScript('document.title', true);
      console.log('guest title:', title);
      const lang = await guest.executeJavaScript(
        `(() => { try { return JSON.parse(localStorage.getItem('vscode-language') || 'null'); } catch (e) { return null; } })()`,
        true,
      );
      console.log('guest localStorage vscode-language:', JSON.stringify(lang));
    } else {
      console.log('no webview guest found');
    }
  } catch (err) {
    console.log('guest capture skipped:', err.message);
  }

  app.quit();
});
