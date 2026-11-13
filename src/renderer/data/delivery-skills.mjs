const PROTOTYPE_REFERENCES = ['vben-visual-reference.html', 'references/agent-tools.html', 'references/loop-tray.html', 'references/annotator.html'];
export async function deliverySkillContext(api, skill, { prototype = false } = {}) {
  if (!skill) throw Error('交付物未配置 skill，请先修复映射');
  async function read(id, file) {
    const result = await api.skills.read(id, file);
    if (!result?.success || !String(result.content || '').trim()) throw Error(`交付技能校验失败：${id}/${file}（${result?.error || '内容为空'}）`);
    return { content: result.content, block: `--- 技能文件 ${id}/${file}${result.path ? `；本机路径 ${result.path}` : ''} ---\n${result.content}` };
  }
  const main = await read(skill, 'SKILL.md');
  const links = [...main.content.matchAll(/\]\(((?:references|assets)\/[\w\-/\.]+\.(?:md|json|html))\)/g)].map(match => match[1]);
  const extra = await Promise.all([...new Set(links)].map(file => read(skill, file)));
  const blocks = [main.block, ...extra.map(value => value.block)];
  if (prototype) {
    const design = await read('prototype-generator', 'SKILL.md');
    const refs = await Promise.all(PROTOTYPE_REFERENCES.map(file => read('prototype-generator', file)));
    blocks.push(design.block, ...refs.map(value => value.block),
      '【原型设计执行要求】必须按 prototype-generator 的完整设计规则、技术栈和组件制作真实多页面原型；先使用其参考组件，再按本项目需求修改，不用普通管理后台或说明文档代替。使用技能目录 images/ 中的真实 logo 和头像，复制到原型 image/；保留 LOOP、智能体工具页、可点击业务流程与真实 mock 数据。用户明确排除 AI 功能时才按原技能例外处理。生成前先读取这些实际文件。');
  }
  return `\n【已校验并加载的交付技能】${skill}${prototype ? ' + prototype-generator' : ''}\n${blocks.join('\n\n')}\n`;
}

export async function verifyPrototypeSkillOutputs(api, slug, directory = 'prototype') {
  for (const file of ['index.html', 'agent-tools.html']) {
    const result = await api.hermes.readFile(slug, `${directory}/${file}`);
    if (!result?.success || !/<(?:html|body|main)\b/i.test(result.content || '')) throw Error(`原型未按 prototype-generator 完整生成：缺少 ${directory}/${file}`);
  }
  const listing = await api.hermes.listFiles(slug, directory, true);
  if (!listing?.success) throw Error(listing?.error || '无法检查原型资源');
  const names = new Set((listing.files || []).filter(file => !file.isDirectory).map(file => String(file.relPath || file.name).replace(/\\/g, '/')));
  for (const file of ['image/icon.png', 'image/bot.png']) if (!names.has(file)) throw Error(`原型未包含技能指定图片：${directory}/${file}`);
}

// 原型版面检查 + 自动补内容：生成后按 1440×900 实际渲染，页面只铺半屏/横向溢出/脚本报错时，
// 把具体问题交给 AI 修一轮再复检；仍不合格就报错，不把半成品当完成。
export function layoutRepairPrompt(directory, issues) {
  return `【原型版面自动检查未通过】在 ${directory}/ 下按 1440×900 实际渲染后发现：\n${issues.map(i => '- ' + i).join('\n')}\n`
    + '请只修改上面列出的页面，按 prototype-generator 的「首屏铺满」铁律补足内容：首页/总览页至少三行内容区块（KPI 行 + 两行图表/列表/智能体卡片）；列表页至少 10 条真实感 mock 数据并带分页，表格下方可补统计/图表卡片；配置/权限页补说明、统计或日志区块。'
    + '新增数据写进 data/*.json，用真实业务字段，不写"示例""占位"。不要用加大 padding、min-height 或空白卡片撑高度。改完保持其余页面不变。';
}
export async function ensurePrototypeLayout(api, slug, directory, repair) {
  if (!api?.hermes?.checkPrototypeLayout) return { skipped: true, issues: [] };
  let result = await api.hermes.checkPrototypeLayout(slug, directory);
  if (!result?.success) return { skipped: true, issues: [], error: result?.error };
  if (!result.issues.length || !repair) return result;
  await repair(layoutRepairPrompt(directory, result.issues));
  result = await api.hermes.checkPrototypeLayout(slug, directory);
  if (result?.success && result.issues.length) throw Error(`原型版面检查仍未通过（已自动修复一轮）：${result.issues.slice(0, 3).join('；')}。已生成内容已保留，可在原型 tab 里查看后继续修改。`);
  return result;
}
