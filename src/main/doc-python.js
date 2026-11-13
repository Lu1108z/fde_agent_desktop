// 文档类专家（白皮书 / 产品介绍 / 操作手册 / PPT）共用的 Python 依赖环境。
//
// 这些技能的脚本依赖 python-docx、lxml、Pillow、python-pptx。以前是让 AI 在对话里
// 临时 pip install —— 慢、受网络影响、还可能装到系统 Python 里。现在启动时在后台把
// 依赖装进 ~/.product-lobster/doc-python/site（pip --target），专家会话通过 PYTHONPATH
// 直接可用；CLAUDE.md 里也写明「依赖已就绪，不要再安装」。
//
// - 只在依赖缺失/需求变更时安装；装好后写 stamp（需求哈希），下次启动直接跳过。
// - 先装到临时目录，成功后再整体替换，避免半成品目录被引擎读到。
// - 默认源失败时换国内镜像重试；全部失败只记日志，专家回退到原来的「缺依赖时自行安装」。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');

// playwright（操作手册截图用）体积大且需下载浏览器，不预装，仍由技能按需处理。
const PACKAGES = ['python-docx>=1.1,<2', 'lxml>=5,<7', 'Pillow>=10,<13', 'python-pptx>=1.0.2,<2'];
const IMPORTS = ['docx', 'lxml', 'PIL', 'pptx'];
const MIRRORS = [null, 'https://pypi.tuna.tsinghua.edu.cn/simple', 'https://mirrors.aliyun.com/pypi/simple/'];

function createDocPython({ home, log = console.log }) {
  const root = path.join(home, 'doc-python');
  const site = path.join(root, 'site');
  const stampFile = path.join(root, 'stamp.json');
  const want = crypto.createHash('sha1').update(PACKAGES.join('\n')).digest('hex').slice(0, 12);
  let state = { status: 'idle', python: '', error: '' };
  let running = null;

  function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, ...opts }, (err, stdout, stderr) => {
        if (err) { err.message = `${err.message}\n${String(stderr || '').slice(-800)}`; reject(err); } else resolve(String(stdout || ''));
      });
    });
  }

  // 找一个能用的 python3（>=3.8）。macOS 上 /usr/bin/python3 在没装命令行工具时会弹安装框，先确认。
  function findPython() {
    const list = [];
    if (process.env.FDE_DOC_PYTHON) list.push(process.env.FDE_DOC_PYTHON);
    if (process.platform === 'win32') {
      list.push('py', 'python', 'python3');
    } else {
      list.push('/opt/homebrew/bin/python3', '/usr/local/bin/python3');
      let clt = process.platform !== 'darwin';
      if (!clt) { try { execFileSync('xcode-select', ['-p'], { stdio: 'ignore' }); clt = true; } catch { /* 没有命令行工具 */ } }
      if (clt) list.push('/usr/bin/python3');
      list.push('python3');
    }
    for (const cmd of list) {
      try {
        const args = cmd === 'py' ? ['-3', '-c'] : ['-c'];
        const out = execFileSync(cmd, [...args, 'import sys;print(sys.executable);print(sys.version_info[0]*100+sys.version_info[1])'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim().split(/\r?\n/);
        if (Number(out[1]) >= 308 && out[0]) return out[0];
      } catch { /* 下一个 */ }
    }
    return '';
  }

  function readStamp() { try { return JSON.parse(fs.readFileSync(stampFile, 'utf8')); } catch { return null; } }

  async function verify(python) {
    await run(python, ['-c', `import ${IMPORTS.join(', ')}`], { env: { ...process.env, PYTHONPATH: site, PYTHONNOUSERSITE: '1' } });
  }

  async function install() {
    const python = findPython();
    if (!python) throw Error('没有找到 Python 3.8+，文档类专家会在需要时自行处理依赖');
    state = { status: 'installing', python, error: '' };
    const stamp = readStamp();
    if (stamp?.want === want && stamp.python === python && fs.existsSync(site)) {
      try { await verify(python); state = { status: 'ready', python, error: '' }; return state; } catch { /* 损坏，重装 */ }
    }
    fs.mkdirSync(root, { recursive: true });
    const tmp = path.join(root, `site-tmp-${process.pid}`);
    let lastErr;
    for (const mirror of MIRRORS) {
      fs.rmSync(tmp, { recursive: true, force: true });
      const args = ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--quiet', '--target', tmp, ...PACKAGES];
      if (mirror) args.push('-i', mirror);
      try {
        log(`[doc-python] 安装文档依赖${mirror ? `（镜像 ${mirror}）` : ''}…`);
        await run(python, args, { env: { ...process.env, PIP_REQUIRE_VIRTUALENV: '0', PYTHONNOUSERSITE: '1' } });
        lastErr = null;
        break;
      } catch (e) { lastErr = e; }
    }
    if (lastErr) { fs.rmSync(tmp, { recursive: true, force: true }); throw lastErr; }
    fs.rmSync(site, { recursive: true, force: true });
    fs.renameSync(tmp, site);
    await verify(python);
    fs.writeFileSync(stampFile, JSON.stringify({ want, python, packages: PACKAGES, at: new Date().toISOString() }, null, 2));
    state = { status: 'ready', python, error: '' };
    log(`[doc-python] 文档依赖已就绪：${site}`);
    return state;
  }

  function ensure() {
    if (!running) {
      running = install().catch((e) => {
        state = { status: 'failed', python: state.python, error: String(e.message || e).split('\n')[0] };
        log(`[doc-python] 预装失败：${e.message}`);
        return state;
      }).finally(() => { setTimeout(() => { running = null; }, 0); });
    }
    return running;
  }

  // 同步判断（给 CLAUDE.md / 引擎环境变量用）：stamp 对得上且目录在，就认为可用。
  function readyInfo() {
    if (state.status === 'ready') return { python: state.python, site };
    const stamp = readStamp();
    if (stamp?.want === want && stamp.python && fs.existsSync(stamp.python) && fs.existsSync(site)) return { python: stamp.python, site };
    return null;
  }

  return { ensure, readyInfo, status: () => ({ ...state, site }), site, packages: PACKAGES };
}

module.exports = { createDocPython, DOC_PYTHON_PACKAGES: PACKAGES };
