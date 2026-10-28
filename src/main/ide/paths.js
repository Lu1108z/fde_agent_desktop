'use strict';

const path = require('path');
const { app } = require('electron');

// 所有 IDE 运行时数据都放在 userData/ide 下，卸载/升级应用不会丢失扩展与设置。
function ideRoot() {
  return path.join(app.getPath('userData'), 'ide');
}

function codeServerRoot() {
  return path.join(ideRoot(), 'code-server');
}

function downloadsDir() {
  return path.join(ideRoot(), 'downloads');
}

function serverDataDir() {
  return path.join(ideRoot(), 'server-data');
}

// 本机 VS Code 的 serve-web 用另一套目录：它的 --server-data-dir 下会再套 data/ 与
// extensions/，跟 code-server 的 --user-data-dir 布局不兼容，混用会互相踩配置。
function localServerDataDir() {
  return path.join(ideRoot(), 'vscode-server-data');
}

function extensionsDir() {
  return path.join(ideRoot(), 'extensions');
}

function logsDir() {
  return path.join(ideRoot(), 'logs');
}

function logFile() {
  return path.join(logsDir(), 'ide-server.log');
}

// IDE 偏好（当前后端、是否装过中文包等）与 server-data 分开，避免被用户重置设置时清掉。
function prefsFile() {
  return path.join(ideRoot(), 'preferences.json');
}

module.exports = {
  ideRoot,
  codeServerRoot,
  downloadsDir,
  serverDataDir,
  localServerDataDir,
  extensionsDir,
  logsDir,
  logFile,
  prefsFile,
};
