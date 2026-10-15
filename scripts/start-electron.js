const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Remove the environment variable that forces Electron into Node.js mode
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// 本机开发目录没有相邻的 hermes-agent 或授权密钥时，复用已安装版本的资源。
// 显式环境变量始终优先，避免覆盖开发者自己的引擎和授权配置。
if (process.platform === 'darwin') {
  const installedApp = env.FDE_INSTALLED_APP_PATH || '/Applications/FDE产设大师.app';
  const resources = path.join(installedApp, 'Contents', 'Resources');
  const engine = path.join(resources, 'hermes-acp', 'hermes-acp');
  const licenseKeys = path.join(resources, 'license-keys');
  if (!env.HERMES_ACP_BIN && fs.existsSync(engine)) env.HERMES_ACP_BIN = engine;
  if (!env.FDE_LICENSE_KEYS_DIR && fs.existsSync(path.join(licenseKeys, 'aes.key')) && fs.existsSync(path.join(licenseKeys, 'public_key.pem'))) {
    env.FDE_LICENSE_KEYS_DIR = licenseKeys;
  }
}

// Find the electron executable
const electronPath = require('electron');

console.log('[launcher] Starting Electron with clean environment...');

const child = spawn(electronPath, ['.'], {
  env,
  stdio: 'inherit',
  windowsHide: false
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
