#!/usr/bin/env node
/**
 * 打 Windows 绿色版（解压即用、免安装）：electron-builder 打 win dir 目标（不出安装器，
 * 所以不需要 wine），再用 JSZip 压成 zip。
 *
 * 前提：Windows 版 Electron / 引擎 / 便携 Git 必须是现成的 Windows 二进制 ——
 * Mac 上生成不了。默认复用 3.3.11 留下的 .build，可用环境变量覆盖：
 *   FDE_WIN_KIT_DIR   .build 目录（含 electron-win / windows-engine / windows-git）
 *   FDE_WIN_ENGINE    Windows 引擎目录（python.exe + fde_acp_entry.py）
 *   FDE_WIN_GIT       便携 Git 目录（bin/bash.exe）
 *   FDE_WIN_SIGN_KEYS license-keys 目录（aes.key / public_key.pem / heartbeat_public.pem）
 *
 * 用法：node scripts/build-windows-portable.js [--skip-renderer]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { build, Platform, Arch } = require('electron-builder');
const ResEdit = require('resedit');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const KIT = process.env.FDE_WIN_KIT_DIR || '/Users/luzhenpeng/Documents/360/360实习/产设大师FDE/.local-release/output-intermediates/.build';
const ELECTRON = process.env.FDE_WIN_ELECTRON || path.join(KIT, 'electron-win');
const ENGINE = process.env.FDE_WIN_ENGINE || path.join(KIT, 'windows-engine');
const GIT = process.env.FDE_WIN_GIT || path.join(KIT, 'windows-git');
// aes.key 按设计不进 git，本机源码里没有；优先用已安装的 Mac 应用里那份（与 build-mac-distribution 同源）
const SIGN_KEYS = process.env.FDE_WIN_SIGN_KEYS
  || ['/Applications/FDE产设大师.app/Contents/Resources/license-keys', path.join(root, 'src', 'main', 'license', 'keys')]
    .find((d) => fs.existsSync(path.join(d, 'aes.key'))) || path.join(root, 'src', 'main', 'license', 'keys');
const releaseDir = path.resolve(process.env.FDE_WIN_RELEASE_DIR || path.join(root, 'dist', 'windows', pkg.version));
const appName = pkg.build.productName;
const artifactBase = `${appName}-${pkg.version}-Windows-x64-绿色版`;

const need = (p, what) => { if (!fs.existsSync(p)) throw Error(`缺少${what}：${p}`); };
need(path.join(ELECTRON, 'electron.exe'), 'Windows Electron（含 electron.exe）');
need(path.join(ENGINE, 'python.exe'), 'Windows 引擎（含 python.exe）');
need(path.join(ENGINE, 'fde_acp_entry.py'), 'Windows 引擎（含 fde_acp_entry.py）');
need(path.join(GIT, 'bin', 'bash.exe'), '便携 Git（含 bin/bash.exe）');
for (const f of ['aes.key', 'public_key.pem']) need(path.join(SIGN_KEYS, f), '授权密钥');

if (!process.argv.includes('--skip-renderer')) {
  const run = (args) => execFileSync('npm', ['run', ...args], { cwd: root, stdio: 'inherit' });
  run(['sync:agent-platform', '--', '--if-changed']);
  run(['export:promo-materials']);
  run(['build:renderer']);
}
for (const p of ['dist/renderer/index.html', 'med-ai-demo/index.html', 'med-knowledge/manifest.json', 'clinical-knowledge/manifest.json']) {
  need(path.join(root, p), '构建产物（先跑 npm run build:renderer / sync:agent-platform / export:promo-materials）');
}

// exe 图标与版本号：electron-builder 在非 Windows 上不写 exe 资源段（signAndEditExecutable:false），
// 这里用 resedit 直接改 PE 资源。
async function patchExe(appOutDir) {
  const exePath = path.join(appOutDir, `${appName}.exe`);
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const resource = ResEdit.NtExecutableResource.from(exe);
  const ico = path.join(root, 'src', 'image', 'icon.ico');
  if (fs.existsSync(ico)) {
    const icons = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
    const groups = resource.entries.filter((e) => e.type === 14).map((e) => ({ id: e.id, lang: e.lang }));
    for (const g of groups.length ? groups : [{ id: 101, lang: 1033 }]) {
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resource.entries, g.id, g.lang, icons.icons.map((i) => i.data));
    }
  }
  const [maj, min, pat] = String(pkg.version).split('.').map((n) => parseInt(n, 10) || 0);
  for (const vi of ResEdit.Resource.VersionInfo.fromEntries(resource.entries)) {
    vi.setFileVersion(maj, min, pat, 0, 1033);
    vi.setProductVersion(maj, min, pat, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      ProductName: appName, FileDescription: appName, OriginalFilename: `${appName}.exe`,
      InternalName: pkg.name, CompanyName: 'FDE',
    });
    vi.outputToResourceEntries(resource.entries);
  }
  resource.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

function writeReadme(dir) {
  fs.writeFileSync(path.join(dir, '使用说明.txt'), [
    `${appName} ${pkg.version} Windows 绿色版`,
    '',
    '1. 先把整个文件夹解压出来（不要在压缩包里直接双击运行）。',
    `2. 双击「${appName}.exe」启动。免安装，不用另外装 Python / Git / ffmpeg。`,
    '3. 首次启动会进初始化向导，填入对话网关的 API Key。',
    '4. 「设置」页可另填「检索与语音 Key」（选填），用于知识库语义检索和语音播报。',
    '',
    '说明：',
    '- 数据保存在 %USERPROFILE%\\.product-lobster\\，删掉它等于重置全部数据。',
    '- 若提示「已保护你的电脑」，点「更多信息」→「仍要运行」。',
    '- 引擎目录里有中文路径也能跑；但建议解压到英文路径下更稳。',
    '',
  ].join('\r\n'));
}

async function main() {
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  const config = {
    appId: pkg.build.appId,
    productName: appName,
    electronVersion: fs.readFileSync(path.join(ELECTRON, 'version'), 'utf8').trim(),
    electronDist: ELECTRON,
    npmRebuild: false,
    compression: 'normal',
    directories: { output: releaseDir, buildResources: path.join(root, 'src', 'image') },
    files: ['src/**/*', 'dist/renderer/**/*', 'package.json', '!src/main/license/keys/**/*', '!**/*.test.*', '!**/.DS_Store'],
    asarUnpack: ['node_modules/node-pty/**/*', 'node_modules/@napi-rs/**/*'],
    extraResources: [
      { from: path.join(root, 'skills'), to: 'skills', filter: ['**/*', '!**/__pycache__/**', '!**/.DS_Store'] },
      { from: path.join(root, 'config-templates'), to: 'config-templates' },
      { from: path.join(root, 'fde-handbook'), to: 'fde-handbook', filter: ['**/*', '!**/.DS_Store'] },
      { from: path.join(root, 'med-knowledge'), to: 'med-knowledge' },
      { from: path.join(root, 'clinical-knowledge'), to: 'clinical-knowledge' },
      { from: path.join(root, 'med-ai-demo'), to: 'med-ai-demo', filter: ['**/*', '!**/.DS_Store'] },
      { from: path.join(root, 'sample-projects'), to: 'sample-projects', filter: ['**/*', '!**/.DS_Store'] },
      { from: path.join(root, 'promo-materials'), to: 'promo-materials' },
      { from: SIGN_KEYS, to: 'license-keys', filter: ['aes.key', 'public_key.pem', 'heartbeat_public.pem'] },
      // Windows 版 ffmpeg 二进制本机没有（3.3.11 的 Windows 包也没带），有才打进去
      ...(fs.existsSync(path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'))
        ? [{ from: path.join(root, 'node_modules', 'ffmpeg-static'), to: 'ffmpeg', filter: ['ffmpeg.exe', 'ffmpeg.LICENSE'] }]
        : []),
      { from: ENGINE, to: 'hermes-acp' },
      { from: GIT, to: 'git' },
    ],
    win: { target: ['dir'], icon: path.join(root, 'src', 'image', 'icon.ico'), signAndEditExecutable: false },
  };
  const configPath = path.join(releaseDir, 'build-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const stage = path.join(releaseDir, 'win-unpacked');
  try {
    await build({ projectDir: root, targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64), config: configPath });
  } finally { fs.rmSync(configPath, { force: true }); }

  // exe 图标/版本必须在 build 全部结束后再写：electron-builder 会在 afterPack 之后重写 exe 的 asar 完整性资源
  await patchExe(stage);
  writeReadme(stage);

  // 压成 zip（文件名用 UTF-8 标志，Windows 资源管理器解压中文不乱码）
  const JSZip = require('jszip');
  const z = new JSZip();
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name), r = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(full, r);
      else z.file(`${artifactBase}/${r}`, fs.readFileSync(full), { binary: true, date: new Date() });
    }
  };
  walk(stage);
  const target = path.join(releaseDir, `${artifactBase}.zip`);
  fs.writeFileSync(target, await z.generateAsync({
    type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'win32',
  }));
  console.log(`[build-windows-portable] 目录：${stage}`);
  console.log(`[build-windows-portable] ✓ ${target}（${(fs.statSync(target).size / 1e6).toFixed(0)}MB）`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
