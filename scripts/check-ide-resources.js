#!/usr/bin/env node
/**
 * 打包前置校验：确认 IDE 运行时与预置扩展已经放进 extraResources 的来源目录。
 *
 * 为什么需要：electron-builder 对缺失的 extraResources `from` 只打警告不报错，
 * 会静默产出一个"没有 IDE 的安装包"——用户点开代码工作区才开始下载 195MB，
 * 甚至在内网环境直接不可用。和 check-engine.js 是同一个套路。
 *
 * 用法：
 *   node scripts/check-ide-resources.js                 # 按当前平台检查
 *   node scripts/check-ide-resources.js --platform=windows-amd64
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const platformArg = (args.find((a) => a.startsWith('--platform=')) || '').split('=')[1];

function currentPlatform() {
  const p = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const a = process.arch === 'x64' ? 'amd64' : process.arch;
  return `${p}-${a}`;
}

const platform = platformArg || currentPlatform();
const resources = path.join(ROOT, 'build', 'ide-resources');

function targetPlatform(p) {
  if (p.startsWith('macos-')) return `darwin-${p.slice('macos-'.length)}`;
  if (p === 'windows-amd64') return 'win32-x64';
  return p;
}

const runtimeDir = path.join(resources, 'code-server');
// 看目标平台而不是宿主平台：在 mac 上校验 Windows 资源是常规操作（交叉打包/预检）。
const nodeBin = path.join(runtimeDir, 'lib', platform.startsWith('windows-') ? 'node.exe' : 'node');
const langPack = path.join(resources, 'language-pack-zh-hans.vsix');
const extDir = path.join(resources, 'extensions');
const claudeVsix = path.join(extDir, `claude-code-${targetPlatform(platform)}.vsix`);

const manifestFile = path.join(resources, '.platform.json');
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (_) { manifest = null; }

const problems = [];
const hints = [];

if (!fs.existsSync(path.join(runtimeDir, 'package.json')) || !fs.existsSync(nodeBin)) {
  problems.push(`IDE 运行时缺失：${runtimeDir}（需要 package.json 与 lib/node）`);
  hints.push(`npm run fetch:ide-server -- --platform=${platform} --package`);
}
if (!fs.existsSync(langPack) || fs.statSync(langPack).size < 100 * 1024) {
  problems.push(`中文语言包缺失：${langPack}`);
  hints.push(`npm run fetch:ide-server -- --platform=${platform} --package`);
}
if (!fs.existsSync(claudeVsix) || fs.statSync(claudeVsix).size < 100 * 1024) {
  problems.push(`预置扩展缺失：${claudeVsix}`);
  hints.push(`npm run fetch:ide-server -- --platform=${platform} --package`);
}
// build/ide-resources 是单一路径：先打了 Windows 包再打 mac 包时，运行时会张冠李戴。
// 宁可直接失败，也不要产出一个「装得上但 IDE 起不来」的安装包。
if (manifest && manifest.platform && manifest.platform !== platform) {
  problems.push(`打包资源平台不匹配：目录里是 ${manifest.platform}，当前要打 ${platform}`);
  hints.push(`npm run fetch:ide-server -- --platform=${platform} --package`);
}

if (problems.length) {
  console.error(`[check-ide] IDE 打包资源不完整（平台 ${platform}），终止打包：`);
  for (const p of problems) console.error('  - ' + p);
  if (hints.length) {
    console.error('[check-ide] 先执行：');
    for (const h of [...new Set(hints)]) console.error('  ' + h);
  }
  process.exit(1);
}

const size = (p) => `${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB`;
const dirSize = (dir) => {
  let total = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else { try { total += fs.statSync(full).size; } catch (_) { /* ignore */ } }
    }
  };
  walk(dir);
  return `${(total / 1024 / 1024).toFixed(0)} MB`;
};

console.log(`[check-ide] ✓ 平台 ${platform}`);
console.log(`[check-ide] ✓ 运行时 ${runtimeDir} (${dirSize(runtimeDir)})`);
console.log(`[check-ide] ✓ 语言包 ${path.basename(langPack)} (${size(langPack)})`);
console.log(`[check-ide] ✓ 预置扩展 ${path.basename(claudeVsix)} (${size(claudeVsix)})`);
