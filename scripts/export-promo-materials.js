#!/usr/bin/env node
// 把本机资料库里的「宣传物料」导出成安装包自带的 promo-materials/（不进 git，体积大）。
// 新装的电脑首次启动时由主进程 installPromoMaterials() 导入到用户资料库。
// 用法：node scripts/export-promo-materials.js [资料库目录]
//   默认读 FDE_MATERIAL_LIBRARY 或 ~/.product-lobster/material-library；
//   找不到本机资料库时保留现有 promo-materials/ 不动（打包前自动调用，不会因此失败）。
const fs = require('fs');
const os = require('os');
const path = require('path');

const src = process.argv[2] || process.env.FDE_MATERIAL_LIBRARY || path.join(os.homedir(), '.product-lobster', 'material-library');
const out = path.join(__dirname, '..', 'promo-materials');
const indexPath = path.join(src, 'index.json');

if (!fs.existsSync(indexPath)) {
  if (fs.existsSync(path.join(out, 'index.json'))) { console.warn(`[export-promo-materials] 找不到本机资料库（${src}），沿用现有 promo-materials/`); process.exit(0); }
  console.warn(`[export-promo-materials] 找不到本机资料库（${src}），安装包将不带宣传物料`); process.exit(0);
}

const db = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const space = db.spaces.find(s => s.id === 'promo');
const live = db.entries.filter(e => e.spaceId === 'promo' && !e.deletedAt);
// 只带还挂在活着的文件夹下的条目（父文件夹被删的孤儿不带）
const ids = new Set(live.map(e => e.id));
const entries = live.filter(e => !e.parentId || ids.has(e.parentId));

const stage = out + '.tmp';
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'files'), { recursive: true });
const all = fs.readdirSync(path.join(src, 'files'));
let bytes = 0;
for (const e of entries) {
  // 原件 <id>.<ext>，以及 Word 的预览缓存 <id>.html
  for (const name of all.filter(n => n.startsWith(e.id + '.') && !n.endsWith('.tmp'))) {
    fs.copyFileSync(path.join(src, 'files', name), path.join(stage, 'files', name));
    bytes += fs.statSync(path.join(src, 'files', name)).size;
  }
}
fs.writeFileSync(path.join(stage, 'index.json'), JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), space, entries }, null, 2));
fs.rmSync(out, { recursive: true, force: true });
fs.renameSync(stage, out);
const folders = entries.filter(e => e.kind === 'folder' && !e.parentId).length;
console.log(`[export-promo-materials] 已导出 ${folders} 个智能体、${entries.length - folders} 份物料（${(bytes / 1e6).toFixed(0)}MB）→ ${out}`);
