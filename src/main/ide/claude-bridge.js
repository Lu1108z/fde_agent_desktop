'use strict';

/**
 * 让 FDE Code 里的 Claude 插件复用平台的 AI 网关配置。
 *
 * 为什么需要：Claude Code 插件没有配置时会直接报「Not logged in · Please run /login」，
 * 用户装完却用不了，会以为插件坏了。平台上已经有配好的网关和 key，能复用就不该让用户
 * 再登一次 Anthropic 账号。
 *
 * 关键限制（已实测，见 docs/claude插件复用平台配置-方案.md）：
 * Claude Code 只说 Anthropic Messages 协议，没有 OpenAI 兼容模式。所以平台网关协议是
 * chat_completions / codex_responses 时，直连必然失败——这种情况我们**不写任何配置**，
 * 明确告诉用户不兼容，而不是写一份连不上又看不出原因的配置。
 *
 * 注入方式：写 IDE 自己的 User/settings.json 里的 claudeCode.environmentVariables。
 * 扩展会把这些变量合并进 claude 子进程（extension.js: Q={...process.env} 后逐个赋值），
 * 且只拦 CLAUDE_CONFIG_DIR 一个名字，ANTHROPIC_* 全部放行。
 * 这样不碰用户的 ~/.claude/settings.json，也就不存在"污染用户全局 Claude"的问题。
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { parseLenient } = require('./seed');
const prefs = require('./prefs');

/**
 * 协议判断复用主进程的 normalizeGatewayMode，避免「设置页说 Anthropic、搬运时当 OpenAI」。
 * 主进程在启动时通过 setModeResolver 注入；拿不到时退回纯 URL 判断（保守：只有明确
 * 是 Anthropic 形态才算兼容，宁可提示不兼容，也不瞎写配置）。
 */
let modeResolver = null;
function setModeResolver(fn) {
  if (typeof fn === 'function') modeResolver = fn;
}

// 平台配置所在目录，与主进程 index.js 的 PRODUCT_LOBSTER_HOME 保持一致。
function platformHome() {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), '.product-lobster');
}

function readGatewayProfiles() {
  const file = path.join(platformHome(), 'gateway-profiles.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const profiles = Array.isArray(raw?.profiles) ? raw.profiles.filter((p) => p && p.id) : [];
    return { activeId: String(raw?.activeId || ''), profiles };
  } catch (_) {
    return { activeId: '', profiles: [] };
  }
}

/** 与主进程 normalizeGatewayMode 同规则：auto 时按 URL 猜，避免两处判断不一致。 */
function normalizeMode(mode, baseUrl) {
  if (modeResolver) {
    try { return modeResolver(mode, baseUrl); } catch (_) { /* 退回下面的保守判断 */ }
  }
  if (mode && mode !== 'auto') return mode;
  const lower = String(baseUrl || '').toLowerCase();
  if (/\/anthropic(?:\/v1)?\/?$/.test(lower)) return 'anthropic_messages';
  if (lower.includes('api.openai.com')) return 'codex_responses';
  return 'chat_completions';
}

/**
 * Claude Code 在 base 后自己拼 `/v1/messages`，所以 base 里不能再有 `/v1`，
 * 否则会变成 `/v1/v1/messages`（已实测）。这里把常见的尾缀一并剥掉。
 */
function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
    .replace(/\/+$/, '');
}

/** 网关认不认「厂商/模型」前缀名；剥不剥由平台档案的 stripVendorPrefix 决定。 */
function modelForClaude(model, stripVendorPrefix) {
  const m = String(model || '').trim();
  if (!m) return '';
  if (!stripVendorPrefix) return m;
  const i = m.indexOf('/');
  return i >= 0 ? m.slice(i + 1).trim() : m;
}

/** 我们负责写入/清理的键，关闭开关时只删这些，其余用户设置一概不动。 */
const ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  // 新版 Claude 用这个变量决定后台小任务（标题、摘要等）用哪个模型；
  // 不写会让它去调内置 haiku 名，在第三方网关上必然 404。
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
];
const LOGIN_PROMPT_KEY = 'claudeCode.disableLoginPrompt';
const ENV_SETTING_KEY = 'claudeCode.environmentVariables';

/**
 * 当前平台网关能否直接给 Claude 用。
 * @returns {{ compatible: boolean, reason: string, profile: object|null, apiMode: string, claudeBaseUrl: string, model: string }}
 */
function inspectPlatformGateway() {
  const { activeId, profiles } = readGatewayProfiles();
  if (!profiles.length) {
    return {
      compatible: false,
      reason: 'no-gateway',
      profile: null,
      apiMode: '',
      claudeBaseUrl: '',
      model: '',
    };
  }
  const profile = profiles.find((p) => p.id === activeId) || profiles[0];
  const apiMode = normalizeMode(profile.apiMode, profile.baseUrl);
  const compatible = apiMode === 'anthropic_messages';
  const models = Array.isArray(profile.models) ? profile.models : [];
  return {
    compatible,
    // protocol-mismatch：网关是 OpenAI 协议，Claude 插件连不上。
    reason: compatible ? 'ok' : 'protocol-mismatch',
    profile,
    apiMode,
    claudeBaseUrl: normalizeBaseUrl(profile.baseUrl),
    model: modelForClaude(models[0], profile.stripVendorPrefix),
  };
}

function settingsFile(userDataDir) {
  return path.join(userDataDir, 'User', 'settings.json');
}

async function readSettings(userDataDir) {
  const file = settingsFile(userDataDir);
  const raw = await fsp.readFile(file, 'utf8').catch(() => null);
  if (raw == null) return {};
  // 解析不了就不动：宁可不同步，也不能把用户设置写坏。
  const parsed = parseLenient(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

function buildEnvEntries(info) {
  const entries = [
    { name: 'ANTHROPIC_BASE_URL', value: info.claudeBaseUrl },
    // bearer 与 x-api-key 两种头各写一份：不同网关认的不是同一个。
    { name: 'ANTHROPIC_AUTH_TOKEN', value: info.profile.apiKey || '' },
    { name: 'ANTHROPIC_API_KEY', value: info.profile.apiKey || '' },
  ];
  if (info.model) {
    // 主模型与「小模型」用同一个：复用来的网关通常只有一个可用模型，
    // 留空会让 Claude 回落到它内置的 haiku 名，在第三方网关上必然 404。
    entries.push({ name: 'ANTHROPIC_MODEL', value: info.model });
    entries.push({ name: 'ANTHROPIC_SMALL_FAST_MODEL', value: info.model });
    entries.push({ name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: info.model });
  }
  return entries.filter((e) => e.value);
}

/**
 * 把环境变量合并进 settings 的 claudeCode.environmentVariables。
 * 只覆盖 ENV_KEYS 里的名字：用户自己加的环境变量原样保留。
 */
function mergeEnvSetting(existing, entries) {
  const current = Array.isArray(existing) ? existing : [];
  const ours = new Set(ENV_KEYS.map((k) => k.toLowerCase()));
  const kept = current.filter((item) => {
    const name = String(item?.name || '').toLowerCase();
    return name && !ours.has(name);
  });
  return [...kept, ...entries];
}

function removeOurEnvSetting(existing) {
  const current = Array.isArray(existing) ? existing : [];
  const ours = new Set(ENV_KEYS.map((k) => k.toLowerCase()));
  return current.filter((item) => {
    const name = String(item?.name || '').toLowerCase();
    return name && !ours.has(name);
  });
}

/**
 * 判断当前 IDE 设置里是否已经是我们写的那份（用于启动时避免无脑重写）。
 */
function matchesOurEntries(existing, entries) {
  if (!Array.isArray(existing)) return false;
  const byName = new Map();
  for (const item of existing) {
    const name = String(item?.name || '').toUpperCase();
    if (name) byName.set(name, String(item?.value ?? ''));
  }
  return entries.every((e) => byName.get(e.name) === e.value);
}

/**
 * 把平台配置同步进某个 IDE 后端的用户设置。
 *
 * @param {{ userDataDir: string }} target
 * @param {{ enabled: boolean }} opts enabled=false 时清理我们写过的键
 * @returns {Promise<{ ok: boolean, changed: boolean, status: object }>}
 */
async function syncClaudeConfig(target, { enabled } = {}) {
  const info = inspectPlatformGateway();
  const file = settingsFile(target.userDataDir);
  const settings = await readSettings(target.userDataDir);

  const statusBase = {
    enabled: !!enabled,
    compatible: info.compatible,
    reason: info.reason,
    apiMode: info.apiMode,
    baseUrl: info.claudeBaseUrl,
    model: info.model,
    profileName: info.profile?.name || '',
    settingsFile: file,
  };

  // 设置文件存在但解析不了：完全不动，避免把用户配置写坏。
  // 注意这里不能回 info（里面带 apiKey），只回可展示的字段。
  if (settings === null) {
    return {
      ok: false,
      changed: false,
      status: { ...statusBase, applied: false, error: '用户设置文件无法解析，未做任何修改' },
    };
  }

  // 用于判断「这次到底有没有真的改东西」：没变就不落盘，避免无谓重写用户文件。
  const before = JSON.stringify(settings);

  // 开关关闭，或网关不兼容：清理我们写过的键（用户自己加的保留）。
  const shouldWrite = !!enabled && info.compatible;
  if (!shouldWrite) {
    if (!Object.prototype.hasOwnProperty.call(settings, ENV_SETTING_KEY)
      && !Object.prototype.hasOwnProperty.call(settings, LOGIN_PROMPT_KEY)) {
      return { ok: true, changed: false, status: { ...statusBase, applied: false } };
    }
    if (Object.prototype.hasOwnProperty.call(settings, ENV_SETTING_KEY)) {
      const rest = removeOurEnvSetting(settings[ENV_SETTING_KEY]);
      // 清完空了就把键删掉，别留一个空数组让用户困惑。
      if (rest.length) settings[ENV_SETTING_KEY] = rest;
      else delete settings[ENV_SETTING_KEY];
    }
    delete settings[LOGIN_PROMPT_KEY];
  } else {
    const entries = buildEnvEntries(info);
    settings[ENV_SETTING_KEY] = mergeEnvSetting(settings[ENV_SETTING_KEY], entries);
    settings[LOGIN_PROMPT_KEY] = true;
  }

  if (JSON.stringify(settings) === before) {
    return { ok: true, changed: false, status: { ...statusBase, applied: shouldWrite } };
  }
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(settings, null, '\t')}\n`, 'utf8');
  return { ok: true, changed: true, status: { ...statusBase, applied: shouldWrite } };
}

/**
 * 只读查询：给设置页显示状态用，不写任何文件。
 */
async function describe(userDataDir) {
  const info = inspectPlatformGateway();
  const enabled = prefs.claudeBridgeEnabled();
  const settings = enabled && info.compatible ? await readSettings(userDataDir) : null;
  const applied = !!settings
    && matchesOurEntries(settings[ENV_SETTING_KEY], buildEnvEntries(info))
    && settings[LOGIN_PROMPT_KEY] === true;
  return {
    enabled,
    compatible: info.compatible,
    reason: info.reason,
    apiMode: info.apiMode,
    baseUrl: info.claudeBaseUrl,
    model: info.model,
    profileName: info.profile?.name || '',
    applied,
    // 只回变量名，不回值——key 不该出现在渲染层的状态里。
    envNames: ENV_KEYS,
  };
}

/**
 * IDE 启动时对账：跟着开关把当前后端目录里的配置同步一次。
 * 用户切了网关档案 / 改了地址后，靠这一步避免配置漂移。
 */
function syncOnStart(userDataDir) {
  return syncClaudeConfig({ userDataDir }, { enabled: prefs.claudeBridgeEnabled() }).catch((err) => {
    console.warn('[ide] 同步 Claude 配置失败:', err.message);
    return null;
  });
}

module.exports = {
  inspectPlatformGateway,
  syncClaudeConfig,
  describe,
  syncOnStart,
  setModeResolver,
  normalizeBaseUrl,
  normalizeMode,
  modelForClaude,
  ENV_KEYS,
  LOGIN_PROMPT_KEY,
  ENV_SETTING_KEY,
};
