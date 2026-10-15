const fs = require('fs');
const path = require('path');

function filesBelow(root, relative) {
  const files = [];
  const visit = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name), name = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) visit(full, name);
      else if (entry.isFile() && fs.statSync(full).size > 0) files.push(name);
    }
  };
  visit(path.join(root, relative), relative);
  return files;
}

// 旧版把没有任何交付物的新项目直接初始化为阶段二，读取时纠正这个起点。
function normalizeProjectStart(meta, root) {
  if (meta.projectType !== 'fde-project' || meta.stage !== 2 || meta.stageReviews?.[1]?.state === 'confirmed' || meta.researchPreparation?.state === 'ready' || Object.keys(meta.deliverableReviews || {}).length) return meta;
  if (['stage2', 'stage3', 'prototype'].some(dir => filesBelow(root, dir).length)) return meta;
  if (['spec.md', 'prd.md', 'prd2.md', 'index.html'].some(name => fs.existsSync(path.join(root, name)) && fs.statSync(path.join(root, name)).size > 0)) return meta;
  return {...meta, stage: 1, stageStatus: {1:'active', 2:'todo', 3:'todo', 4:'todo', 5:'todo'}};
}

function preparationSources(root, options = {}) {
  const sources = ['knowledge', 'uploads'].flatMap(dir => filesBelow(root, dir));
  const libraryRoot = options.libraryRoot || path.join(path.dirname(path.dirname(root)), 'material-library');
  if (fs.existsSync(path.join(libraryRoot, 'index.json'))) {
    const library = require('./material-library').createMaterialLibrary(libraryRoot);
    for (const item of library.linked(options.slug || path.basename(root))) {
      if (!/^[a-zA-Z0-9_-]+$/.test(item.id) || !/^[a-zA-Z0-9]+$/.test(item.ext || '')) continue;
      const original = path.join(libraryRoot, 'files', item.id + '.' + item.ext);
      if (fs.existsSync(original) && fs.statSync(original).size > 0) sources.push('library/' + item.id);
    }
  }
  return sources;
}

module.exports = {normalizeProjectStart, preparationSources};
