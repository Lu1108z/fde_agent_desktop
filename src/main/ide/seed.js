'use strict';

/**
 * 首次启动写入 VS Code 用户设置默认值（只补我们关心的几个键，不覆盖用户已有配置）。
 *
 * 为什么要写：VS Code 1.143 默认把自带「聊天」辅助栏展开，占掉 380px 左右。
 * 桌面端右侧已经有我们自己的 AI coding 面板，再并一个聊天栏会挤成三列 AI，
 * 编辑区只剩一半宽。默认收起辅助栏，需要的人用右上角按钮或 ⌃⌥B 打开即可。
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// 键名 → 默认值。已存在的键一律不动（用户/上游改过就尊重现状）。
const DEFAULTS = {
  // 辅助栏（VS Code 自带 Chat 所在栏）默认不展开。
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  // 跳过工作区信任确认（等价于 code-server 的 --disable-workspace-trust）。
  // 本机 serve-web 后端不认那个命令行参数，只能靠这个设置。
  'security.workspace.trust.enabled': false,
  // 关掉 VS Code 自带的 AI 功能（Chat / 内联建议 / Copilot 入口等）。
  // 桌面端右侧已经有自己的 AI coding，IDE 里再挂一套官方 AI 会重复且互相抢焦点；
  // 用户要 AI 就用右侧面板或预装的 Claude Code 扩展。
  'chat.disableAIFeatures': true,
};

function stripJsonComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** settings.json 允许尾逗号与注释，标准 JSON.parse 会失败；这里做最小清理。 */
function parseLenient(text) {
  try { return JSON.parse(stripJsonComments(text)); } catch (_) { /* 再试一次去尾逗号 */ }
  try {
    return JSON.parse(stripJsonComments(text).replace(/,(\s*[}\]])/g, '$1'));
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} userDataDir VS Code 的 userData 目录（其中 User/settings.json）
 * @returns {Promise<string[]>} 本次补写的键
 */
async function seedUserSettings(userDataDir, defaults = DEFAULTS) {
  const userDir = path.join(userDataDir, 'User');
  const file = path.join(userDir, 'settings.json');
  const raw = await fsp.readFile(file, 'utf8').catch(() => null);

  let current = {};
  if (raw != null) {
    const parsed = parseLenient(raw);
    // 解析不了就完全不动：宁可留一个展开的聊天栏，也不能把用户设置写坏。
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    current = parsed;
  }

  const added = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (Object.prototype.hasOwnProperty.call(current, key)) continue;
    current[key] = value;
    added.push(key);
  }
  if (!added.length) return added;

  await fsp.mkdir(userDir, { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(current, null, '\t')}\n`, 'utf8');
  return added;
}

module.exports = { seedUserSettings, parseLenient, stripJsonComments };
