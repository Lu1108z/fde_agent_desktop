/**
 * AI 应用广场 —— 统一应用数据模型 + prompt 构建
 *
 * 内置应用复用 ai-experts.js 定义，加 source/status 标记。
 * 本地开发者应用通过 window.api.aiApps 从主进程加载。
 */

import { aiExperts, expertCategories, buildExpertOpeningPrompt } from './ai-experts';
import replyPolicy from '../../shared/ai-reply-policy.json';

// ── 应用分类(在专家分类基础上追加虚拟分类) ──

export const aiAppCategories = [
  { id: 'all',        name: '全部应用',   icon: 'layer-group',         color: '#64748b' },
  ...expertCategories.filter((c) => c.id !== 'all'),
  { id: 'my-published', name: '我的发布', icon: 'rocket',              color: '#059669' },
  { id: 'my-drafts',    name: '开发草稿', icon: 'pen-ruler',           color: '#d97706' },
];

// ── 内置应用:从 aiExperts 映射 ──

export const builtinAiApps = aiExperts.map((ex) => ({
  ...ex,
  slugPrefix: ex.slugPrefix.replace(/^expert-/, 'app-'),
  source: 'builtin',
  status: 'published',
  developer: { author: '系统内置', version: '1.0.0' },
}));

// ── helpers ──

export function findBuiltinAiAppById(id) {
  return builtinAiApps.find((a) => a.id === id) || null;
}

export function getAiAppCategoryName(categoryId) {
  const cat = aiAppCategories.find((c) => c.id === categoryId);
  return cat ? cat.name : categoryId;
}

export const AI_APP_REPLY_STYLE = `统一回答方式（v${replyPolicy.version}）：\n${replyPolicy.principles.map(line => `- ${line}`).join('\n')}`;

export function buildAiAppOpeningPrompt(app) {
  const style = `${AI_APP_REPLY_STYLE}${replyPolicy.roles[app.id] ? `\n\n当前角色的表达重点：\n${replyPolicy.roles[app.id]}` : ''}`;

  const caps = app.capabilities || '';
  const workflow = app.workflow ? `\n\n工作流程：\n${app.workflow}` : '';
  const constraints = app.constraints ? `\n\n使用约束：\n${app.constraints}` : '';
  const riskLine = app.riskNotice ? `\n\n重要提醒：${app.riskNotice}` : '';
  if (app.prompt) return `${app.prompt}${caps ? `\n\n当前应用能力：\n${caps}` : ''}${workflow}${constraints}${riskLine}\n\n${style}`;

  return `你现在进入「${app.name}」模式。

定位：
- 你是面向企业业务人员的 AI 应用助手，不是通用闲聊助手。
- 你的目标是帮助用户把业务问题快速转成可执行方案、提示词、清单、表格或下一步行动。

工作方式：
1. 只有用户尚未给出任务时，简短介绍能提供的帮助。
2. 如果缺少关键上下文，每轮只问最影响推进的1至2个问题。
3. 如果用户已经给出明确需求，直接提供所需结果，按任务决定是否分段、列点或制表。
4. 根据任务选择合适结构，优先提供可用结果，不强制套用模板。
5. 全程使用中文，语气专业、简洁、业务化。

当前应用能力：
${caps}${workflow}${constraints}${riskLine}

推荐开场：
简短问候后，只询问用户当前要处理的具体场景。

${style}`;
}

// 广场里能召唤的全部应用：内置（叠加覆盖层、剔除软删）+ 本地已发布
export async function loadPublishedAiApps() {
  let overrides = {}, deleted = [], local = [];
  try {
    const res = await window.api?.aiApps?.builtinOverrides?.();
    if (res?.success) { overrides = res.overrides || {}; deleted = Array.isArray(res.deleted) ? res.deleted : []; }
  } catch { /* 覆盖层读取失败时用原始定义 */ }
  try {
    const res = await window.api?.aiApps?.list?.();
    if (res?.success && Array.isArray(res.apps)) local = res.apps.filter((a) => a.status === 'published');
  } catch { /* 本地应用读取失败时只显示内置 */ }
  const builtins = builtinAiApps
    .filter((a) => !deleted.includes(a.id))
    .map((a) => (overrides[a.id] ? { ...a, ...overrides[a.id], _edited: true } : a));
  // 旧版本里建立的本地应用可能还带着已下线的分类（如 growth / enterprise），归到「产品交付文档」，避免在分类页消失。
  const validCats = new Set(aiAppCategories.map((c) => c.id));
  return [...builtins, ...local.map((a) => ({ ...a, source: 'local', category: validCats.has(a.category) ? a.category : 'docs' }))];
}

// ── 兼容旧接口 ──

export { expertCategories, aiExperts, buildExpertOpeningPrompt };
export { findAiExpertById, getExpertCategoryName } from './ai-experts';
