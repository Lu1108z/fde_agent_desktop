const fs = require('fs');
const path = require('path');

// 只记录操作与文档位置，不把正文、图片或密钥写入动态。
function createActivityStore(filePath) {
  const keyOf = entry => JSON.stringify([entry.kind, entry.slug || entry.stage || '', entry.file || '']);
  function read() {
    if (!fs.existsSync(filePath)) return [];
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('动态记录格式不正确');
    return entries;
  }
  function list(seeds = []) {
    const entries = new Map();
    for (const entry of [...seeds, ...read()]) {
      if (!entry.updatedAt) continue;
      const key = keyOf(entry);
      const previous = entries.get(key);
      if (!previous || entry.updatedAt >= previous.updatedAt) entries.set(key, {...entry, id:key});
    }
    return [...entries.values()].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  function record(entry) {
    const activity = {...entry, updatedAt:entry.updatedAt || new Date().toISOString()};
    const entries = list([activity]);
    fs.mkdirSync(path.dirname(filePath), {recursive:true});
    const temporary = filePath + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(entries, null, 2), 'utf8');
    fs.renameSync(temporary, filePath);
    return activity;
  }
  return {list, record};
}
module.exports = {createActivityStore};
