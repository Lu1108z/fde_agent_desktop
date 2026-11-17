'use strict';

/**
 * 中文语言包：安装 + 生成 VS Code 的 languagepacks.json + 写入默认 locale。
 *
 * VS Code 服务端的显示语言解析链（server-main.js）：
 *   args.locale || <serverDataDir>/User/argv.json 的 locale || cookie || Accept-Language || 'en'
 * 命中的语言包来自 <serverDataDir>/languagepacks.json（key 是语言包 manifest 里的
 * languageId，中文简体即 `zh-cn`）。这个文件平时由 workbench 的 LanguagePackService
 * 在“安装/卸载扩展”时写出；服务端渲染页面时只读它、不会自己生成，
 * 所以首次启动必须由我们写好，否则页面里 NLS 脚本地址为空 → 界面仍是英文。
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { installExtension } = require('./cli');

const LANGUAGE_PACK_ID = 'MS-CEINTL.vscode-language-pack-zh-hans';
const LANGUAGE_PACK_KEY = LANGUAGE_PACK_ID.toLowerCase();
const LOCALE = 'zh-cn';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function extensionDirOf(entry, extensionsDir) {
  const loc = entry && entry.location;
  const dir = loc && (loc.fsPath || loc.path);
  if (dir) return dir;
  if (entry && entry.relativeLocation) return path.join(extensionsDir, entry.relativeLocation);
  return null;
}

/** 已安装的语言包（读 extensions.json 索引，不依赖固定目录名）。 */
function installedPack(extensionsDir) {
  const list = readJson(path.join(extensionsDir, 'extensions.json'));
  if (!Array.isArray(list)) return null;
  const entry = list.find((item) => String(item?.identifier?.id || '').toLowerCase() === LANGUAGE_PACK_KEY);
  if (!entry) return null;
  const dir = extensionDirOf(entry, extensionsDir);
  if (!dir) return null;
  const manifest = readJson(path.join(dir, 'package.json'));
  if (!manifest) return null;
  const localizations = manifest?.contributes?.localizations;
  if (!Array.isArray(localizations) || !localizations.length) return null;
  return { dir, manifest, version: manifest.version || entry.version || '0.0.0', localizations };
}

/**
 * 语言包 manifest → languagepacks.json 的条目（按 languageId 分组）。
 * 结构与 workbench 的 LanguagePackCache.createLanguagePacksFromExtension 保持一致：
 * hash 是 clp 缓存目录名，workbench 用 md5(扩展 id + 版本) 生成，这里必须同算法，
 * 否则我们写的 hash 与它日后重算的不一致，会重复生成一份缓存。
 */
function packsFromExtension(pack) {
  const hash = crypto.createHash('md5').update(LANGUAGE_PACK_KEY).update(pack.version).digest('hex');
  const out = {};
  for (const localization of pack.localizations) {
    const languageId = String(localization.languageId || '').toLowerCase();
    if (!languageId) continue;
    const translations = {};
    for (const item of localization.translations || []) {
      if (item && item.id && item.path) translations[item.id] = path.resolve(pack.dir, item.path);
    }
    if (!translations.vscode) continue; // 没有核心包（vscode）的翻译用不了
    out[languageId] = {
      hash,
      extensions: [{ extensionIdentifier: { id: LANGUAGE_PACK_KEY }, version: pack.version }],
      translations,
      label: localization.localizedLanguageName || localization.languageName || languageId,
    };
  }
  return out;
}

/** 合并写回：保留 workbench 自己写过的其它语言，只刷新本次这份。 */
async function writeLanguagePacksFile(userDataDir, packs) {
  const file = path.join(userDataDir, 'languagepacks.json');
  const current = readJson(file) || {};
  const next = JSON.stringify({ ...current, ...packs }, null, '\t');
  await fsp.mkdir(userDataDir, { recursive: true });
  await fsp.writeFile(file, next, 'utf8');
  return file;
}

// argv.json 允许注释，VS Code 用正则剥掉再解析。这里照做。
function stripJsonComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * 写默认显示语言。
 * @returns {Promise<'written'|'existing'|'unparsable'>}
 *   existing → 用户已在 VS Code 里选过语言，尊重它，不要用命令行覆盖。
 *   unparsable → 文件坏了，退回用命令行 --locale 兜底。
 */
async function ensureArgvLocale(userDataDir, locale = LOCALE) {
  const userDir = path.join(userDataDir, 'User');
  const file = path.join(userDir, 'argv.json');
  const raw = await fsp.readFile(file, 'utf8').catch(() => null);

  if (raw == null) {
    await fsp.mkdir(userDir, { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify({ locale }, null, '\t')}\n`, 'utf8');
    return 'written';
  }

  const parsed = (() => {
    try { return JSON.parse(stripJsonComments(raw)); } catch (_) { return null; }
  })();
  if (!parsed || typeof parsed !== 'object') return 'unparsable';
  if (parsed.locale) return 'existing';

  parsed.locale = locale;
  await fsp.writeFile(file, `${JSON.stringify(parsed, null, '\t')}\n`, 'utf8');
  return 'written';
}

/** 随安装包/开发缓存预置的语言包 vsix（离线首启用；没有就联网装）。 */
function bundledVsixPath() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'language-pack-zh-hans.vsix'));
  candidates.push(path.join(__dirname, '..', '..', '..', '.cache', 'ide', 'language-pack-zh-hans.vsix'));
  for (const file of candidates) {
    try { if (fs.statSync(file).isFile()) return file; } catch (_) { /* 不存在 */ }
  }
  return null;
}

function installLanguagePack(runtime, { extensionsDir, userDataDir, vsixPath }) {
  const source = vsixPath && fs.existsSync(vsixPath) ? vsixPath : LANGUAGE_PACK_ID;
  return installExtension(runtime, { source, extensionsDir, userDataDir });
}

/**
 * 准备中文界面：装语言包 → 写 languagepacks.json → 写默认 locale。
 * 失败不阻断 IDE 启动（退回英文并给出一条可展示的提示）。
 * @param {{ extensionsDir: string, userDataDir: string, vsixPath?: string|null, skipInstall?: boolean }} opts
 * @returns {Promise<{ locale: string, forceLocale: boolean, failed: boolean, warning: string|null }>}
 *   failed = 本次尝试装语言包但没装上（调用方据此做重试冷却，避免每次启动白等网络超时）。
 */
async function prepareLocale(runtime, { extensionsDir, userDataDir, vsixPath = bundledVsixPath(), skipInstall = false } = {}) {
  let pack = installedPack(extensionsDir);
  let warning = null;

  if (!pack && !skipInstall) {
    const install = await installLanguagePack(runtime, { extensionsDir, userDataDir, vsixPath });
    pack = installedPack(extensionsDir);
    if (!pack) {
      warning = install.ok
        ? '中文语言包安装后未生效，IDE 界面暂为英文。'
        : `中文语言包安装失败（${install.source === LANGUAGE_PACK_ID ? '需要联网访问 Open VSX' : '预置包不可用'}），IDE 界面暂为英文。`;
      console.warn('[ide] 语言包安装失败:', install.output.slice(-600));
      return { locale: 'en', forceLocale: false, failed: true, warning };
    }
  }
  if (!pack) {
    return { locale: 'en', forceLocale: false, failed: false, warning: '中文语言包尚未安装，IDE 界面暂为英文。' };
  }

  const packs = packsFromExtension(pack);
  if (!packs[LOCALE]) {
    return { locale: 'en', forceLocale: false, failed: false, warning: '语言包里没有中文简体（zh-cn）条目，IDE 界面暂为英文。' };
  }

  await writeLanguagePacksFile(userDataDir, packs);
  const argvState = await ensureArgvLocale(userDataDir, LOCALE);
  return { locale: LOCALE, forceLocale: argvState === 'unparsable', failed: false, warning };
}

module.exports = {
  LOCALE,
  LANGUAGE_PACK_ID,
  prepareLocale,
  installedPack,
  bundledVsixPath,
};
