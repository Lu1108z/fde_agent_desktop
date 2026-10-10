#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const keysDir = path.join(__dirname, '..', 'src', 'main', 'license', 'keys');
const aesPath = path.join(keysDir, 'aes.key');
const publicPath = path.join(keysDir, 'public_key.pem');
const heartbeatPath = path.join(keysDir, 'heartbeat_public.pem');

if (!fs.existsSync(aesPath)) {
  console.error(`[license-keys] 缺少 ${aesPath}`);
  process.exit(1);
}
if (!fs.existsSync(publicPath)) {
  console.error(`[license-keys] 缺少 ${publicPath}`);
  process.exit(1);
}
if (!fs.existsSync(heartbeatPath)) {
  console.error(`[license-keys] 缺少 ${heartbeatPath} (心跳信封加密公钥)`);
  process.exit(1);
}
const aesSize = fs.statSync(aesPath).size;
if (aesSize !== 32) {
  console.error(`[license-keys] aes.key 应为 32 字节，实际 ${aesSize} 字节`);
  process.exit(1);
}

// 与签发端(claw-sec-platform / license-toolkit)的密钥一致性校验:
// 一旦两边密钥漂移,签出来的 .lic 客户端必然「授权文件无效或已损坏(TAMPERED)」。
// 这两个指纹是当前唯一真值的钉死值,泄露/换钥后必须同步更新这里的期望值。
const EXPECTED = {
  aesSha256: 'b25ff53348b612e151036004725a97a6391e7a331175430d7b355d1ed09fae6b',
  pubSha256: 'c2693e2bcaa35848cceaec059e3071c84009a3ecadd132c7406f1519d55a4b3f',
};
function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

const aesSha = sha256(aesPath);
const pubSha = sha256(publicPath);
if (aesSha !== EXPECTED.aesSha256) {
  console.error(`[license-keys] aes.key 指纹不匹配:\n  期望 ${EXPECTED.aesSha256}\n  实际 ${aesSha}\n  打包密钥 ≠ 签发密钥,签出的授权文件客户端会报 TAMPERED。`);
  process.exit(1);
}
if (pubSha !== EXPECTED.pubSha256) {
  console.error(`[license-keys] public_key.pem 指纹不匹配:\n  期望 ${EXPECTED.pubSha256}\n  实际 ${pubSha}\n  打包公钥 ≠ 签发私钥对应的公钥,授权文件验签必失败。`);
  process.exit(1);
}

console.log(`[license-keys] OK: aes.key=${aesSize} bytes, public_key.pem=${fs.statSync(publicPath).size} bytes; 指纹与签发端一致`);
