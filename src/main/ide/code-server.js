'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { downloadFile } = require('./download');
const { codeServerRoot, downloadsDir } = require('./paths');

// 固定版本：升级时同步更新 VERSION / 各平台 SHA-256。
const VERSION = '4.143.1';

const RELEASES = {
  'macos-arm64': {
    sha256: '940bb5ecd567187336ed3608c2404e21e37528465aaddb4d6f5b514d930bd7db',
  },
  'macos-amd64': {
    sha256: '0c77b28570d67c729bf75e57dc92bb51af0b4c683f89e1e756c168d30dcc0d63',
  },
  'windows-amd64': {
    sha256: 'a480ccbc368336370baaa16336143e1d8bb9868e66edb2ea3f076ebf0527080a',
  },
  // 以下平台暂未在发布流程中固定校验值；仅用于开发机，生产构建不会走到这里。
  'linux-amd64': { sha256: null },
  'linux-arm64': { sha256: null },
};

function platformKey() {
  const platform = process.platform === 'darwin'
    ? 'macos'
    : process.platform === 'win32'
      ? 'windows'
      : 'linux';
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  return `${platform}-${arch}`;
}

function nodeBinary(dir) {
  return path.join(dir, 'lib', process.platform === 'win32' ? 'node.exe' : 'node');
}

function isInstalled(dir) {
  try {
    return fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(nodeBinary(dir));
  } catch (_) {
    return false;
  }
}

function cacheDir() {
  return path.join(codeServerRoot(), `${VERSION}-${platformKey()}`);
}

function fromEnv() {
  const dir = process.env.FDE_CODE_SERVER_DIR;
  if (!dir) return null;
  const resolved = path.resolve(dir);
  if (isInstalled(resolved)) return resolved;
  console.warn('[ide] FDE_CODE_SERVER_DIR 无效（缺少 package.json 或 lib/node）:', resolved);
  return null;
}

function fromBundle() {
  // 打包后由 scripts/fetch-ide-server.js 预置到 resources/code-server。
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'code-server'));
  // 开发态：<repo>/.cache/ide/code-server/<version>-<平台>
  candidates.push(path.join(__dirname, '..', '..', '..', '.cache', 'ide', 'installed', `${VERSION}-${platformKey()}`));
  for (const dir of candidates) {
    if (isInstalled(dir)) return dir;
  }
  return null;
}

/** 同步查找已有的 code-server（不触发下载）。 */
function locateCodeServer() {
  return fromEnv() || fromBundle() || (isInstalled(cacheDir()) ? cacheDir() : null);
}

function assetUrl() {
  return `https://github.com/coder/code-server/releases/download/v${VERSION}/code-server-${VERSION}-${platformKey()}.tar.gz`;
}

async function extract(archive, destDir) {
  await fsp.mkdir(destDir, { recursive: true });
  const tarBin = process.platform === 'win32' && process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'tar.exe')
    : 'tar';
  await new Promise((resolve, reject) => {
    const child = spawn(tarBin, ['-xzf', archive, '-C', destDir], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`解压失败（tar 退出码 ${code}）: ${stderr.slice(-400)}`));
    });
  });
}

let ensurePromise = null;

/**
 * 确保 code-server 可用：优先复用，否则下载 + 校验 + 解压。
 * @param {{ onProgress?: Function, signal?: AbortSignal }} opts
 * @returns {Promise<{ dir: string, node: string, version: string, source: 'env'|'bundle'|'cache'|'downloaded' }>}
 */
function ensureCodeServer(opts = {}) {
  const envDir = fromEnv();
  if (envDir) return Promise.resolve({ dir: envDir, node: nodeBinary(envDir), version: VERSION, source: 'env' });
  const bundled = fromBundle();
  if (bundled) return Promise.resolve({ dir: bundled, node: nodeBinary(bundled), version: VERSION, source: 'bundle' });
  if (isInstalled(cacheDir())) {
    return Promise.resolve({ dir: cacheDir(), node: nodeBinary(cacheDir()), version: VERSION, source: 'cache' });
  }
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const key = platformKey();
    const release = RELEASES[key];
    if (!release) throw new Error(`当前平台暂不支持内置 IDE: ${key}`);

    const url = assetUrl();
    const archive = path.join(downloadsDir(), `code-server-${VERSION}-${key}.tar.gz`);
    const extractDir = path.join(downloadsDir(), `extract-${process.pid}-${Date.now()}`);

    try {
      if (!fs.existsSync(archive)) {
        await downloadFile(url, archive, {
          expectedSha256: release.sha256 || undefined,
          onProgress: opts.onProgress,
          signal: opts.signal,
        });
      }
      if (opts.signal && opts.signal.aborted) throw new Error('下载已取消');

      if (opts.onInstalling) opts.onInstalling();
      await extract(archive, extractDir);
      const inner = path.join(extractDir, `code-server-${VERSION}-${key}`);
      if (!isInstalled(inner)) throw new Error('解压后的目录结构不符合预期');

      const target = cacheDir();
      await fsp.rm(target, { recursive: true, force: true });
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.rename(inner, target);
      await fsp.writeFile(
        path.join(target, '.fde-installed.json'),
        JSON.stringify({ version: VERSION, platform: key, url, installedAt: new Date().toISOString() }, null, 2),
      );
      return { dir: target, node: nodeBinary(target), version: VERSION, source: 'downloaded' };
    } catch (err) {
      // 安装包可能只下了一半或已损坏：删掉，下一次重试重新下载。
      await fsp.rm(archive, { force: true }).catch(() => {});
      throw err;
    } finally {
      await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      // 下载失败/取消时清掉半截压缩包，避免下次误用。
      if (opts.signal && opts.signal.aborted) {
        await fsp.rm(archive, { force: true }).catch(() => {});
      }
    }
  })().finally(() => { ensurePromise = null; });

  return ensurePromise;
}

module.exports = {
  VERSION,
  platformKey,
  locateCodeServer,
  ensureCodeServer,
  nodeBinary,
  isInstalled,
};
