#!/usr/bin/env node
'use strict';

/**
 * 预置 code-server 运行时 + 中文语言包 vsix（可选）。
 *
 * 用法：
 *   node scripts/fetch-ide-server.js                    # 当前平台 → .cache/ide/installed/
 *   node scripts/fetch-ide-server.js --platform=windows-amd64
 *   node scripts/fetch-ide-server.js --package          # 额外复制到 build/ide-resources/
 *
 * 不执行这一步时，应用会在首次打开 IDE 时自动下载 runtime 并从 Open VSX 装中文语言包。
 * 预置了 language-pack-zh-hans.vsix 后，离线首启也能直接是中文界面。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERSION = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main/ide/code-server.js'), 'utf8');
  const m = /const VERSION = '([^']+)'/.exec(src);
  if (!m) throw new Error('无法从 code-server.js 读取 VERSION');
  return m[1];
})();

function currentPlatform() {
  const p = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const a = process.arch === 'x64' ? 'amd64' : process.arch;
  return `${p}-${a}`;
}

const args = process.argv.slice(2);
const platform = (args.find((a) => a.startsWith('--platform=')) || '').split('=')[1] || currentPlatform();
const pkg = args.includes('--package');

// 中文语言包（Open VSX）。版本跟着 code-server 内置的 VS Code 走；升级 VS Code 时同步改这里。
const LANG_PACK = {
  publisher: 'MS-CEINTL',
  name: 'vscode-language-pack-zh-hans',
  version: '1.131.0',
};

const asset = `code-server-${VERSION}-${platform}.tar.gz`;
const url = `https://github.com/coder/code-server/releases/download/v${VERSION}/${asset}`;
const cacheRoot = path.join(ROOT, '.cache', 'ide');
const archive = path.join(cacheRoot, asset);
const installedRoot = path.join(cacheRoot, 'installed');
const target = path.join(installedRoot, `${VERSION}-${platform}`);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(`${dest}.part`);
    const hash = crypto.createHash('sha256');
    const go = (current, redirects = 0) => {
      https.get(current, { headers: { 'User-Agent': 'fde-desktop-ide' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects > 6) return reject(new Error('重定向过多'));
          return go(new URL(res.headers.location, current).toString(), redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}: ${current}`));
        }
        res.on('data', (c) => hash.update(c));
        res.pipe(out);
        out.on('finish', () => {
          fs.renameSync(`${dest}.part`, dest);
          resolve(hash.digest('hex'));
        });
      }).on('error', reject);
    };
    go(url);
  });
}

/** 扩展 vsix 的下载地址（Open VSX 按 targetPlatform 分发，各平台二进制不同）。 */
function platformSuffix() {
  if (platform.startsWith('macos-')) return `darwin-${platform.slice('macos-'.length)}`;
  if (platform === 'windows-amd64') return 'win32-x64';
  return platform; // linux-amd64 / linux-arm64 与 Open VSX 命名一致
}

/**
 * 下载中文语言包 vsix 到 .cache/ide/（已存在就跳过）。
 * 存在的意义：断网/企业内网环境首启也能直接是中文界面。
 */
async function fetchLanguagePack() {
  const file = `${LANG_PACK.publisher}.${LANG_PACK.name}-${LANG_PACK.version}.vsix`;
  const url = `https://open-vsx.org/api/${LANG_PACK.publisher}/${LANG_PACK.name}/${LANG_PACK.version}/file/${file}`;
  const dest = path.join(cacheRoot, 'language-pack-zh-hans.vsix');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100 * 1024) {
    console.log('[fetch-ide-server] ✓ 语言包已在缓存:', dest);
  } else {
    console.log(`[fetch-ide-server] 下载中文语言包 ${url}`);
    const sha = await download(url, dest);
    console.log(`[fetch-ide-server] sha256=${sha}`);
  }
  if (pkg) {
    const to = path.join(ROOT, 'build', 'ide-resources', 'language-pack-zh-hans.vsix');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(dest, to);
    console.log('[fetch-ide-server] ✓ 语言包已复制到打包资源:', to);
  }
  return dest;
}

// 预置扩展：默认给用户装好 Claude Code（见 src/main/ide/extensions.js 的 BUNDLED）。
const BUNDLED_EXTENSIONS = [
  { id: 'Anthropic.claude-code', base: 'claude-code', version: null },
];

/**
 * 下载预置扩展的 vsix（已存在就跳过），--package 时复制到打包资源。
 * 文件名约定要和 extensions.js 的 bundledVsix() 对上：<base>-<targetPlatform>.vsix。
 */
async function fetchBundledExtensions() {
  const target = platformSuffix();
  const toDir = path.join(ROOT, 'build', 'ide-resources', 'extensions');
  for (const ext of BUNDLED_EXTENSIONS) {
    const [publisher, name] = ext.id.split('.');
    // 让 Open VSX 自己挑版本：先查接口拿到该平台的最新版本号。
    const metaUrl = `https://open-vsx.org/api/${publisher}/${name}/${target}/latest`;
    let version = ext.version;
    if (!version) {
      const meta = await getJson(metaUrl);
      version = meta?.version;
      if (!version) throw new Error(`无法获取扩展版本: ${ext.id} (${target})`);
    }
    const file = `${ext.id}-${version}@${target}.vsix`;
    const url = `https://open-vsx.org/api/${publisher}/${name}/${target}/${version}/file/${file}`;
    const dest = path.join(cacheRoot, `${ext.base}-${target}.vsix`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100 * 1024) {
      console.log(`[fetch-ide-server] ✓ 扩展已在缓存: ${dest}`);
    } else {
      console.log(`[fetch-ide-server] 下载预置扩展 ${ext.id}@${version} (${target})`);
      const sha = await download(url, dest);
      console.log(`[fetch-ide-server] sha256=${sha}`);
      // 记下版本，方便排查"装的是哪一版"。
      fs.writeFileSync(`${dest}.json`, JSON.stringify({ id: ext.id, version, targetPlatform: target, url }, null, 2));
    }
    if (pkg) {
      fs.mkdirSync(toDir, { recursive: true });
      fs.copyFileSync(dest, path.join(toDir, path.basename(dest)));
      console.log('[fetch-ide-server] ✓ 扩展已复制到打包资源:', path.join(toDir, path.basename(dest)));
    }
  }
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'fde-desktop-ide', Accept: 'application/json' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(archive)) {
    console.log(`[fetch-ide-server] 下载 ${url}`);
    const sha = await download(url, archive);
    console.log(`[fetch-ide-server] sha256=${sha}`);
  }
  if (!fs.existsSync(path.join(target, 'package.json'))) {
    const tmp = path.join(cacheRoot, `extract-${Date.now()}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    console.log('[fetch-ide-server] 解压…');
    const r = spawnSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('解压失败');
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(installedRoot, { recursive: true });
    fs.renameSync(path.join(tmp, `code-server-${VERSION}-${platform}`), target);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('[fetch-ide-server] ✓ 运行时就绪:', target);

  await fetchLanguagePack();
  await fetchBundledExtensions();

  if (pkg) {
    const dest = path.join(ROOT, 'build', 'ide-resources', 'code-server');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(target, dest, { recursive: true });
    // 记录这批资源的平台：build/ide-resources 是单一路径，交叉打包时容易被上一次覆盖。
    // check-ide-resources.js 读它校验，避免把 Windows 运行时塞进 mac 包。
    fs.writeFileSync(
      path.join(ROOT, 'build', 'ide-resources', '.platform.json'),
      JSON.stringify({ platform, version: VERSION, fetchedAt: new Date().toISOString() }, null, 2),
    );
    console.log('[fetch-ide-server] ✓ 已复制到打包资源:', dest, `(${platform})`);
    console.log('[fetch-ide-server] 记得在 electron-builder 的 extraResources 中加：');
    console.log('  { "from": "build/ide-resources/code-server", "to": "code-server" }');
    console.log('  { "from": "build/ide-resources/language-pack-zh-hans.vsix", "to": "language-pack-zh-hans.vsix" }');
    console.log('  { "from": "build/ide-resources/extensions", "to": "extensions" }');
  }
}

main().catch((err) => {
  console.error('[fetch-ide-server] 失败:', err.message);
  process.exit(1);
});
