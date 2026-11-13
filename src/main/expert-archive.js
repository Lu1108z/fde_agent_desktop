// 专家成果归档兜底：专家回复结束后，把「回复里提到的成果文件」和「本轮在专家工作目录
// 新生成的文档/视频」复制到关联项目的 deliverables/<专家id>/。
// 不依赖 AI 一定按 CLAUDE.md 把文件存对位置；已在成果目录的、项目自身文件、技能模板都不搬。
const fs = require('fs');
const os = require('os');
const path = require('path');

const MENTIONED_EXT = /\.(docx?|pptx?|xlsx?|pdf|mp4|mov|webm|png|jpe?g|webp|svg|gif|html?|zip)$/i;
const SCANNED_EXT = /\.(docx?|pptx?|xlsx?|pdf|mp4|mov|webm)$/i;
const MAX_BYTES = 1024 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'site-packages', 'tmp', 'temp', '.cache']);
// 安装包资源 / 知识包 / 依赖目录里的文件是模板或素材，不是成果
const RESOURCE_DIR = /[\\/](skills|config-templates|med-knowledge|clinical-knowledge|doc-python|fde-handbook|med-ai-demo)[\\/]/;

function mentionedFilePaths(text, baseDir) {
  const found = new Set();
  const src = String(text || '');
  const push = (raw) => {
    let p = String(raw || '').trim().replace(/^file:\/\//, '').replace(/[),.;:，。；：）」』]+$/, '');
    if (!p || !MENTIONED_EXT.test(p)) return;
    if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2));
    if (!path.isAbsolute(p)) p = path.resolve(baseDir, p);
    found.add(path.normalize(p));
  };
  for (const m of src.matchAll(/`([^`\n]+)`/g)) push(m[1]);
  for (const m of src.matchAll(/\]\((?:file:\/\/)?([^)\s]+)\)/g)) { try { push(decodeURI(m[1])); } catch { push(m[1]); } }
  for (const m of src.matchAll(/(?:^|[\s(（「『"'：:])((?:~\/|\/|[A-Za-z]:[\\/])[^\s`'"<>|*?()（）「」『』，。；]+)/g)) push(m[1]);
  return [...found];
}

function recentWorkFiles(dir, sinceMs, depth = 0, out = []) {
  if (depth > 3 || out.length > 50) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name.toLowerCase())) recentWorkFiles(abs, sinceMs, depth + 1, out); continue; }
    if (!e.isFile() || !SCANNED_EXT.test(e.name) || e.name.startsWith('~$')) continue;
    try { if (fs.statSync(abs).mtimeMs >= sinceMs) out.push(abs); } catch { /* 读不到就跳过 */ }
  }
  return out;
}

const realOrSelf = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);

// 返回归档后的相对路径（相对 projectRoot）
function archiveFiles({ replyText, sessionDir, projectRoot, outSubdir, sinceMs }) {
  const outDir = path.join(projectRoot, outSubdir);
  const deliverRoot = realOrSelf(path.join(projectRoot, path.dirname(outSubdir)));
  const realProject = realOrSelf(projectRoot);
  const realSession = realOrSelf(sessionDir);
  const candidates = new Set([...mentionedFilePaths(replyText, sessionDir), ...recentWorkFiles(sessionDir, sinceMs)]);
  const archived = [];
  for (const src of candidates) {
    try {
      const st = fs.statSync(src);
      if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) continue;
      const real = realOrSelf(src);
      if (inside(real, deliverRoot)) continue; // 已经在成果目录
      if (inside(real, realProject)) continue; // 项目自身文件（stage*/prototype/knowledge）不搬
      if (!inside(real, realSession) && RESOURCE_DIR.test(real)) continue;
      fs.mkdirSync(outDir, { recursive: true });
      const ext = path.extname(src), stem = path.basename(src, ext);
      let dest = path.join(outDir, path.basename(src)), n = 2, dup = false;
      while (fs.existsSync(dest)) {
        const ds = fs.statSync(dest);
        if (ds.size === st.size && ds.mtimeMs >= st.mtimeMs - 1000) { dup = true; break; } // 同一份已归档过
        dest = path.join(outDir, `${stem}-${n++}${ext}`);
      }
      if (dup) continue;
      fs.copyFileSync(src, dest);
      archived.push(path.relative(projectRoot, dest).split(path.sep).join('/'));
    } catch { /* 不存在或无权限，忽略 */ }
  }
  return archived;
}

module.exports = { mentionedFilePaths, recentWorkFiles, archiveFiles };
