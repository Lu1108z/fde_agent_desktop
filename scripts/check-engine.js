#!/usr/bin/env node
// 打包前置校验：确认 hermes-acp 引擎（PyInstaller onedir）在 extraResources 的
// 来源路径就位，且**架构/平台与要打的包一致**。
//
// 为什么要在意平台一致性：electron-builder 能在一台机器上交叉打另一个平台的包，
// 但 PyInstaller 产物不能交叉生成。如果目录里放的是 mac 引擎却打 Windows 包，
// electron-builder 会原样拷进去，产出一个 "装上但智能体起不来" 的 exe，
// 而且要等用户实际用才发现。这里直接读文件头判断，宁可在打包前失败。
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const platformArg = (args.find((a) => a.startsWith('--platform=')) || '').split('=')[1];

function currentPlatform() {
  const p = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const a = process.arch === 'x64' ? 'amd64' : process.arch;
  return `${p}-${a}`;
}

const platform = platformArg || currentPlatform();
const wantsWin = platform.startsWith('windows-');
const exeName = wantsWin ? 'hermes-acp.exe' : 'hermes-acp';
const engineDir = path.resolve(__dirname, '..', '..', 'hermes-agent', 'dist', 'hermes-acp');
const exePath = path.join(engineDir, exeName);
// PyInstaller onedir：可执行文件 + _internal 运行时目录缺一不可。
// 只拷 hermes-acp.exe 不带 _internal 会直接启动失败。
const internalDir = path.join(engineDir, '_internal');

/** 读文件头判断可执行文件属于哪个平台，避免把 mac 引擎塞进 Windows 包。 */
function binaryPlatform(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8);
    const n = fs.readSync(fd, buf, 0, 8, 0);
    if (n < 4) return 'unknown';
    if (buf[0] === 0x4d && buf[1] === 0x5a) return 'windows';           // "MZ"
    if (buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe) return 'macos';
    if (buf[0] === 0xca && buf[1] === 0xfe && buf[2] === 0xba && buf[3] === 0xbe) return 'macos';
    if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return 'linux';
    // 也可能是 #!/bin/sh 形式的启动脚本（部分 PyInstaller 产物）
    const head = buf.toString('utf8');
    if (head.startsWith('#!')) return 'script';
    return 'unknown';
  } catch (_) {
    return 'unknown';
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
  }
}

const problems = [];
if (!fs.existsSync(engineDir)) {
  problems.push(`找不到引擎目录：${engineDir}`);
} else {
  if (!fs.existsSync(exePath)) {
    problems.push(`缺少引擎可执行文件：${exePath}`);
  } else {
    const actual = binaryPlatform(exePath);
    const expect = platform.startsWith('windows-') ? 'windows' : platform.startsWith('macos-') ? 'macos' : 'linux';
    if (actual !== 'unknown' && actual !== 'script' && actual !== expect) {
      problems.push(`引擎平台不匹配：文件是 ${actual}，要打的是 ${platform}`);
    }
  }
  if (!fs.existsSync(internalDir)) {
    problems.push(`缺少引擎运行时目录：${internalDir}（PyInstaller onedir 需要 exe 与 _internal 一起拷贝）`);
  }
}

if (problems.length) {
  console.error(`[check-engine] 引擎缺失或平台不符（目标 ${platform}），终止打包：`);
  for (const p of problems) console.error('  - ' + p);
  console.error('');
  console.error('引擎是平台相关二进制，PyInstaller 不能交叉编译，必须在「目标系统」上构建：');
  console.error('  npm run build:hermes   （在 hermes-agent 下建好 .venv 并 pip install pyinstaller）');
  console.error('产物会落在 hermes-agent/dist/hermes-acp/，然后重新打包即可。');
  console.error(`打 Windows 包需要 Windows 版的「hermes-acp.exe + _internal/」，放在：${engineDir}`);
  process.exit(1);
}

console.log(`[check-engine] OK: ${exePath} + _internal/ 已就位（${platform}）`);
