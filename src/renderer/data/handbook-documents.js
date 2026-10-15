// 同名同类文档共用一个入口；由 Markdown 转换的完整 Word 版本优先。
export function uniqueHandbookDocuments(items = []) {
  const groups = new Map();
  for (const item of items) {
    const name = String(item.title || item.file).normalize('NFKC').replace(/\s/g, '').toLowerCase();
    const key = `${item.category || 'other'}:${name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const rank = (item) => item.sourceMarkdown ? 0 : item.type === 'docx' ? 1 : item.previewable ? 2 : 3;
  return Array.from(groups.values(), (versions) => {
    const primary = [...versions].sort((a, b) => rank(a) - rank(b))[0];
    return {...primary, originalFiles:versions.map((item) => ({file:item.file, type:item.type}))};
  });
}
