'use strict';

/**
 * 调 code-server / 本机 VS Code 的命令行（装扩展用）。
 *
 * 两个后端的调用方式不同：
 * - code-server：`<运行时>/lib/node <运行时目录> …`
 * - 本机 VS Code：直接执行 `code` 这个 CLI
 * 其余参数（--install-extension / --extensions-dir / --user-data-dir）是一样的。
 */

const { spawn } = require('child_process');

const DEFAULT_TIMEOUT = 120_000;

/**
 * @param {{ executable?: string, node?: string, dir?: string }} runtime
 * @param {string[]} args
 * @returns {Promise<{ ok: boolean, out: string }>}
 */
function runCli(runtime, args, { timeout = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    const [file, argv] = runtime.executable
      ? [runtime.executable, args]
      : [runtime.node, [runtime.dir, ...args]];
    try {
      child = spawn(file, argv, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
    } catch (err) {
      resolve({ ok: false, out: err.message });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) { /* 已退出 */ }
    }, timeout);
    child.stdout?.on('data', (d) => { out += d.toString(); });
    child.stderr?.on('data', (d) => { out += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, out: `${out}${err.message}` }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out }); });
  });
}

/**
 * 装一个扩展。source 可以是扩展 id（走扩展市场）或本地 vsix 路径。
 * `--force` 让重复安装变成覆盖，避免"已存在但版本不对"时报错退出。
 */
function installExtension(runtime, { source, extensionsDir, userDataDir, timeout }) {
  return runCli(runtime, [
    '--install-extension', source,
    '--force',
    '--extensions-dir', extensionsDir,
    '--user-data-dir', userDataDir,
  ], { timeout }).then((res) => ({ ok: res.ok, source, output: res.out }));
}

module.exports = { runCli, installExtension };
