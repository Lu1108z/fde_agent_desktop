const dns = require('node:dns').promises;
const net = require('node:net');

// Fail before Hermes starts its long retry loop when the provider has no DNS
// address. A proxy may resolve the remote host itself, so don't preflight it.
async function checkProviderDns(baseUrl, options = {}) {
  const env = options.env || process.env;
  if (Object.keys(env).some(key => /^(?:http|https|all)_proxy$/i.test(key) && env[key])) return;
  let hostname;
  try { hostname = new URL(baseUrl).hostname; } catch { return; }
  if (!hostname || net.isIP(hostname.replace(/^\[|\]$/g, '')) || hostname === 'localhost') return;
  let timer;
  try {
    await Promise.race([
      (options.lookup || dns.lookup)(hostname),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), options.timeoutMs || 5000);
      }),
    ]);
  } catch (error) {
    throw new Error(`模型服务连接失败：${hostname} ${error.code === 'ETIMEOUT' ? '域名解析超时' : '域名解析失败'}。请检查网络或代理，恢复后重试。已有资料和生成文件已保留。`);
  } finally { clearTimeout(timer); }
}

module.exports = { checkProviderDns };
