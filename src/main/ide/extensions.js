'use strict';

/**
 * 预置扩展：默认给用户装好 Claude Code，作为内置 AI coding 之外的补充开发工具。
 *
 * 为什么预装而不是让用户自己去市场点：
 * - 默认 IDE 是内置 code-server，扩展市场是 Open VSX，用户不一定知道该装哪个；
 * - 预置后打开扩展栏就能看到 Claude，登录一下即可用。
 *
 * 安装是「缺了才装」：用户卸载了、或已经装过别的版本，都不强行覆盖。
 * 失败不阻断 IDE 启动（离线/市场不可达时只给一条提示）。
 */

const fs = require('fs');
const path = require('path');
const { installExtension } = require('./cli');

// 预置清单。targetPlatform 用来挑随包分发的 vsix（各平台二进制不同）。
const BUNDLED = [
  {
    id: 'Anthropic.claude-code',
    name: 'Claude Code',
    vsixBase: 'claude-code',
  },
];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

/** 扩展是否已装（读 extensions.json 索引，大小写不敏感）。 */
function isInstalled(extensionsDir, id) {
  const list = readJson(path.join(extensionsDir, 'extensions.json'));
  if (!Array.isArray(list)) return false;
  const key = String(id).toLowerCase();
  return list.some((item) => String(item?.identifier?.id || '').toLowerCase() === key);
}

/** 随安装包/开发缓存预置的 vsix（离线首启用；没有就联网从 Open VSX 装）。 */
function bundledVsix(ext) {
  const platform = process.platform === 'darwin'
    ? `darwin-${process.arch}`
    : process.platform === 'win32'
      ? 'win32-x64'
      : `linux-${process.arch}`;
  const fileName = `${ext.vsixBase}-${platform}.vsix`;
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'extensions', fileName));
  candidates.push(path.join(__dirname, '..', '..', '..', '.cache', 'ide', fileName));
  for (const file of candidates) {
    try { if (fs.statSync(file).size > 100 * 1024) return file; } catch (_) { /* 不存在 */ }
  }
  return null;
}

/**
 * 装齐预置扩展。
 * @returns {Promise<{ installed: string[], skipped: string[], failed: string[], warning: string|null }>}
 */
async function ensureBundledExtensions(runtime, { extensionsDir, userDataDir }) {
  const installed = [];
  const skipped = [];
  const failed = [];
  const notes = [];

  for (const ext of BUNDLED) {
    if (isInstalled(extensionsDir, ext.id)) {
      skipped.push(ext.id);
      continue;
    }
    const vsix = bundledVsix(ext);
    const res = await installExtension(runtime, {
      source: vsix || ext.id, // 有随包 vsix 就离线装，否则走市场
      extensionsDir,
      userDataDir,
      // 内网/离线时市场请求可能挂很久；已装好的用户不会走到这里。
      timeout: 90_000,
    });
    if (res.ok && isInstalled(extensionsDir, ext.id)) {
      installed.push(ext.id);
    } else {
      failed.push(ext.id);
      const why = vsix ? '随包安装包不可用' : '需要联网访问 Open VSX';
      notes.push(`${ext.name} 预装失败（${why}）`);
      console.warn(`[ide] 预置扩展 ${ext.id} 安装失败:`, res.output.slice(-500));
    }
  }

  return {
    installed,
    skipped,
    failed,
    warning: notes.length ? `${notes.join('；')}，可在扩展栏手动安装。` : null,
  };
}

module.exports = { BUNDLED, ensureBundledExtensions, isInstalled };
