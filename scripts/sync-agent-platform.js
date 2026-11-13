// 把「医院智能体安全协作平台」演示站（med-ai-demo 代码仓）同步进来，作为 FDE 的「智能体平台」模块。
// 用法：npm run sync:agent-platform [-- [--pull] [--if-changed] [<med-ai-demo 代码仓路径>]]；默认读 FDE_AGENT_PLATFORM_SRC 或本机代码仓位置。
//   --pull        同步前先在平台代码仓 git pull --ff-only（有未提交改动时不拉）
//   --if-changed  平台版本没变就跳过；找不到平台代码仓时保留现有副本（打包前自动调用，用这个模式）
// 拷贝哪些目录以平台自己的 .electron-build/assemble.sh 为准（平台新增/删除智能体后自动跟上），并带上它的悬浮「返回」导航脚本。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const src = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.FDE_AGENT_PLATFORM_SRC || '/Users/luzhenpeng/Documents/360/360实习/FDE医疗项目代码仓/med-ai-demo';
const out = path.join(__dirname, '..', 'med-ai-demo');
const git = (...args) => execFileSync('git', ['-C', src, ...args], { encoding: 'utf8' }).trim();
if (!fs.existsSync(path.join(src, 'index.html'))) {
  if (flags.includes('--if-changed') && fs.existsSync(path.join(out, 'index.html'))) {
    console.warn(`[sync-agent-platform] 找不到 med-ai-demo 代码仓（${src}），沿用现有副本 ${readVersion() || '（版本未知）'}`);
    process.exit(0);
  }
  console.error('找不到 med-ai-demo 代码仓：' + src); process.exit(1);
}
function readVersion() { try { return fs.readFileSync(path.join(out, '.source-version'), 'utf8').trim(); } catch (_) { return ''; } }
if (flags.includes('--pull')) {
  if (git('status', '--porcelain')) console.warn('[sync-agent-platform] 平台代码仓有未提交的改动，跳过 git pull，按本地代码同步');
  else { console.log('[sync-agent-platform] git pull …'); execFileSync('git', ['-C', src, 'pull', '--ff-only'], { stdio: 'inherit' }); }
}
// 版本 = 提交号；有未提交改动时加上改动摘要，保证本地改了也会重新同步
let version = '';
try {
  version = git('rev-parse', '--short', 'HEAD');
  const dirty = git('status', '--porcelain');
  if (dirty) version += '-dirty-' + crypto.createHash('sha1').update(dirty + git('diff')).digest('hex').slice(0, 8);
} catch (_) {}
if (flags.includes('--if-changed') && version && !version.includes('-dirty-') && version === readVersion()) {
  console.log(`[sync-agent-platform] 智能体平台已是最新（${version}）`);
  process.exit(0);
}
// 平台打包脚本里「for item in … ; do」那一行就是要发布的站点目录清单；README 不需要
const assemble = fs.readFileSync(path.join(src, '.electron-build', 'assemble.sh'), 'utf8');
const listed = assemble.match(/^for item in (.+); do$/m);
if (!listed) throw new Error('平台打包脚本（.electron-build/assemble.sh）里没找到站点目录清单，格式可能改了，需要更新同步脚本');
const ITEMS = listed[1].trim().split(/\s+/).filter(item => item !== 'README.md');
const missing = ITEMS.filter(item => !fs.existsSync(path.join(src, item)));
if (missing.length) console.warn('[sync-agent-platform] 平台打包清单里有、但代码仓里不存在：' + missing.join('、'));
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const skip = name => name === '.DS_Store' || name.startsWith('._') || name.endsWith('.command') || name === 'node_modules' || name === '.git';
function copy(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const name of fs.readdirSync(from)) if (!skip(name)) copy(path.join(from, name), path.join(to, name)); }
  else fs.copyFileSync(from, to);
}
for (const item of ITEMS) if (fs.existsSync(path.join(src, item))) copy(path.join(src, item), path.join(out, item));
// 运营大屏的开机动画保留，只缩短时长：进度 3.5 秒 → 1.5 秒（每步 50ms，70 → 30 步），到 100% 后停留 0.6 → 0.3 秒，淡出 0.8 → 0.5 秒
const assets = path.join(out, 'dashboard', 'assets');
const BOOT_TIMING = [
  [/Math\.floor\((\w)\/70\*100\)/, 'Math.floor($1/30*100)'],
  [/(\w)>=70&&\(clearInterval\((\w)\),setTimeout\((\w),600\)\)/, '$1>=30&&(clearInterval($2),setTimeout($3,300))'],
  [/(exit:\{opacity:0,scale:1\.1,filter:"blur\(10px\)"\},transition:\{duration:)\.8(,ease:"easeInOut"\}[^}]{0,120}LoadingScreen\.tsx)/, '$1.5$2'],
];
const bundles = fs.existsSync(assets) ? fs.readdirSync(assets).filter(n => /^index-.*\.js$/.test(n)) : [];
const bootFile = bundles.map(n => path.join(assets, n)).find(f => fs.readFileSync(f, 'utf8').includes('SYSTEM_BOOT'));
if (!bootFile) throw new Error('没找到运营大屏开机动画的代码，源码可能改过，需要更新这段替换规则');
let bootCode = fs.readFileSync(bootFile, 'utf8');
for (const [from, to] of BOOT_TIMING) {
  if (!from.test(bootCode)) throw new Error('运营大屏开机动画的时长代码变了，需要更新替换规则：' + from);
  bootCode = bootCode.replace(from, to);
}
fs.writeFileSync(bootFile, bootCode);
// 原导航脚本只在顶层窗口显示；FDE 里平台嵌在 iframe 中，去掉这个限制
const nav = fs.readFileSync(path.join(src, '.electron-build', 'preload.js'), 'utf8').replace("window.top !== window || ", '');
fs.writeFileSync(path.join(out, '__fde_nav.js'), nav);
fs.writeFileSync(path.join(out, '.source-version'), version + '\n');
console.log(`已同步 med-ai-demo ${version}（${ITEMS.length} 项：${ITEMS.join(' ')}）→ ${out}`);
