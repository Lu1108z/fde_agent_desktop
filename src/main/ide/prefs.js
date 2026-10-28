'use strict';

/**
 * IDE 后端偏好的持久化。
 *
 * 两种后端定位不同：
 * - `code-server`（默认）：随应用走。开箱即用、扩展装在应用自己的目录里、
 *   升级/卸载 VS Code 都不影响；扩展市场是 Open VSX（含 Claude 等 AI 扩展）。
 * - `local-vscode`：复用用户本机装的 VS Code（`code serve-web`），零下载，
 *   但用户升级/卸载 VS Code 后可能失效，且扩展落在 VS Code 自己的用户目录里。
 *
 * 默认 code-server，用户可以在 IDE 工具栏显式切到本机 VS Code，选择会被记住。
 */

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const BACKENDS = ['code-server', 'local-vscode'];
const DEFAULT_BACKEND = 'code-server';

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(paths.prefsFile(), 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writePrefs(next) {
  try {
    fs.mkdirSync(path.dirname(paths.prefsFile()), { recursive: true });
    fs.writeFileSync(paths.prefsFile(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[ide] 写入偏好失败:', err.message);
  }
}

/**
 * 解析要用的后端：显式参数 > 环境变量 > 持久化偏好 > 默认。
 * @returns {'code-server'|'local-vscode'}
 */
function resolveBackend(explicit) {
  if (BACKENDS.includes(explicit)) return explicit;
  const fromEnv = process.env.FDE_IDE_BACKEND;
  if (BACKENDS.includes(fromEnv)) return fromEnv;
  const saved = readPrefs().backend;
  if (BACKENDS.includes(saved)) return saved;
  return DEFAULT_BACKEND;
}

/** 记住用户显式选择的（只有显式选择才落盘，回退不算）。 */
function rememberBackend(backend) {
  if (!BACKENDS.includes(backend)) return;
  const prefs = readPrefs();
  if (prefs.backend === backend) return;
  writePrefs({ ...prefs, backend });
}

/** 记录语言包装过一次（之前装内容有变化才落盘）。 */
function markLocaleAttempt(at = Date.now()) {
  writePrefs({ ...readPrefs(), localeAttemptAt: at });
}

/**
 * 上次用过的端口（按后端分开记）。
 *
 * 为什么要在意端口：浏览器的 localStorage / IndexedDB 是按 origin 隔离的，
 * 而 origin 含端口。每次启动都换随机端口，等于每次给 IDE 换一个新 origin——
 * 布局、打开的编辑器、扩展自己的登录态（如 Claude 扩展的 token）全都读不回来，
 * 分区里还会越积越多历史 origin 的存储。复用端口才能让这些状态跨重启存活。
 */
function savedPort(backend) {
  const ports = readPrefs().ports;
  const port = ports && Number(ports[backend]);
  return port > 0 && port < 65536 ? port : null;
}

function rememberPort(backend, port) {
  if (!BACKENDS.includes(backend) || !(port > 0)) return;
  const prefs = readPrefs();
  const ports = { ...(prefs.ports || {}) };
  if (ports[backend] === port) return;
  ports[backend] = port;
  writePrefs({ ...prefs, ports });
}

/**
 * 上次装语言包是否刚刚失败过。安装失败通常是离线/市场不可达，
 * 每次启动都等一轮网络超时没必要；冷却一天再试。
 */
function localeAttemptFresh(ttlMs = 24 * 60 * 60 * 1000) {
  const at = Number(readPrefs().localeAttemptAt) || 0;
  return at > 0 && Date.now() - at < ttlMs;
}

module.exports = {
  BACKENDS,
  DEFAULT_BACKEND,
  resolveBackend,
  rememberBackend,
  markLocaleAttempt,
  localeAttemptFresh,
  savedPort,
  rememberPort,
};
