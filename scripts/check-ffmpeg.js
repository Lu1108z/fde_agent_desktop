#!/usr/bin/env node
// 打包前置校验：宣传视频专家（product-demo-film）需要 ffmpeg 剪辑/合成视频。
// ffmpeg-static 的二进制按「安装时的系统」下载，必须在目标系统上 npm install 后再打包。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.resolve(__dirname, '..', 'node_modules', 'ffmpeg-static');
const bin = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
if (!fs.existsSync(bin)) {
  console.error(`[check-ffmpeg] 找不到 ${bin}`);
  console.error('请在当前系统执行 npm install（ffmpeg-static 会下载本系统的 ffmpeg）后再打包。');
  process.exit(1);
}
try {
  const out = execFileSync(bin, ['-version'], { encoding: 'utf8' }).split('\n')[0];
  console.log(`[check-ffmpeg] OK: ${out}`);
} catch (e) {
  console.error(`[check-ffmpeg] ffmpeg 无法运行（可能是其他系统的二进制）：${e.message}`);
  process.exit(1);
}
