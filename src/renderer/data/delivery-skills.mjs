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
