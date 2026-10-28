'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const PROBE_TIMEOUT = 4000;

function exists(p) {
  try { return fs.existsSync(p); } catch (_) { return false; }
}

function candidates() {
  const list = [];
  const home = os.homedir();

  if (process.platform === 'darwin') {
    list.push(
      '/opt/homebrew/bin/code',
      '/usr/local/bin/code',
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      path.join(home, 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'),
    );
    // login shell 里的 PATH 可能包含用户自定义安装位置；不依赖 GUI 进程继承的 PATH。
    for (const shell of ['/bin/zsh', '/bin/bash']) {
      if (exists(shell)) {
        list.push({ loginShell: shell });
        break;
      }
    }
  } else if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    if (local) {
      list.push(path.join(local, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
      list.push(path.join(local, 'Programs', 'Microsoft VS Code', 'bin', 'code.exe'));
    }
    list.push(path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'));
    // PATH 由调用方补充（本模块只做常见安装目录探测）。
  } else {
    list.push('/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code');
  }
  return list;
}

function runProbe(executable, args) {
  return new Promise((resolve) => {
    const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
    try {
      const child = isCmd
        ? execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${executable}" ${args.join(' ')}`], { timeout: PROBE_TIMEOUT, windowsHide: true })
        : execFile(executable, args, { timeout: PROBE_TIMEOUT, windowsHide: true });
      let out = '';
      let err = '';
      child.stdout?.on('data', (d) => { out += d.toString(); });
      child.stderr?.on('data', (d) => { err += d.toString(); });
      child.on('error', () => resolve({ ok: false, out: '' }));
      child.on('close', (code) => resolve({ ok: code === 0, out: out + err }));
    } catch (_) {
      resolve({ ok: false, out: '' });
    }
  });
}

async function probeLoginShell(shell) {
  return new Promise((resolve) => {
    try {
      execFile(shell, ['-lic', 'command -v code'], { timeout: PROBE_TIMEOUT }, (err, stdout) => {
        const found = String(stdout || '').trim().split('\n').filter(Boolean).pop();
        resolve(!err && found && exists(found) ? found : null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

let cached = null;

/**
 * 探测本机可用于 `serve-web` 的 VS Code CLI。
 * @returns {Promise<{ executable: string } | null>}
 */
async function discoverLocalVscode() {
  if (cached !== null) return cached || null;

  const list = [];
  for (const item of candidates()) {
    if (typeof item === 'string') {
      if (exists(item)) list.push(item);
    } else if (item.loginShell) {
      const found = await probeLoginShell(item.loginShell);
      if (found) list.push(found);
    }
  }

  for (const executable of list) {
    const probe = await runProbe(executable, ['serve-web', '--help']);
    if (probe.ok && /serve-web/i.test(probe.out)) {
      cached = { executable };
      return cached;
    }
  }

  cached = false;
  return null;
}

function quoteWin(arg) {
  const value = String(arg);
  if (!/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * 启动本机 VS Code 的 serve-web。返回 child_process 实例。
 */
function spawnLocalVscode(executable, args, options = {}) {
  const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
  if (isCmd) {
    const command = `"${executable}" ${args.map(quoteWin).join(' ')}`;
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
      ...options,
      shell: false,
      windowsHide: true,
    });
  }
  return spawn(executable, args, { ...options, shell: false, windowsHide: true });
}

module.exports = { discoverLocalVscode, spawnLocalVscode };
