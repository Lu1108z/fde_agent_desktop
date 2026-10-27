/**
 * 心跳上报:向 claw 管控中心 POST /api/v1/heartbeat 定时上报设备存活。
 *
 * 与 /fde/activate(明文 JSON)不同,/heartbeat 要求 RSA+AES 信封加密:
 *   请求体 = { encrypted_key, encrypted_data, nonce }
 *     encrypted_key  = base64( RSA-OAEP(SHA-256, activate_public.pem, aes_key) )
 *     encrypted_data = base64( AES-256-GCM(aes_key, nonce, 业务JSON) )
 *     nonce          = base64( 12 字节随机数 )
 *   响应  = { code, message, encrypted_data, nonce },用同一个 aes_key 解出业务 JSON。
 *
 * 设备标识依赖激活阶段写入 meta 的 device_id + machine_code;
 * 离线导入 .lic(无 device_id)的设备不参与心跳,继续靠本地过期判定兜底。
 *
 * 响应里的 license_expired=true 会触发 license:heartbeat-expired 事件,
 * 渲染层据此弹授权失效提示并踢回 /setup。
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const TIMEOUT_MS = 15000;
const BASE_INTERVAL_MS = 5 * 60 * 1000;   // 默认 5 分钟
const JITTER_MS = 60 * 1000;              // ±60s 随机抖动
const HEARTBEAT_PATH = '/api/v1/heartbeat';

// 服务端 RSA 公钥(config/activate_public.pem),与加密信封接口配套
const KEYS_DIR = path.join(__dirname, 'keys');

function loadHeartbeatPublicKey() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'license-keys', 'heartbeat_public.pem') : null,
    path.join(KEYS_DIR, 'heartbeat_public.pem'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

function hasPublicKey() {
  return loadHeartbeatPublicKey() !== null;
}

/**
 * 信封加密请求 → 解密响应(复用请求 AES 密钥)。
 * @param {string} endpoint 完整 URL
 * @param {object} payload  业务 JSON(明文)
 * @param {Buffer} publicKeyPem 服务端 RSA 公钥 PEM
 * @returns {Promise<{code:number, message:string, data:object}>}
 */
function postEncrypted(endpoint, payload, publicKeyPem) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      reject(new Error('心跳服务地址格式不正确'));
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      reject(new Error('心跳服务地址必须是 http 或 https'));
      return;
    }

    const pub = crypto.createPublicKey(publicKeyPem);
    const aesKey = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, nonce);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
    const encryptedData = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    const encryptedKey = crypto.publicEncrypt(
      { key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      aesKey,
    );

    const body = Buffer.from(JSON.stringify({
      encrypted_key: encryptedKey.toString('base64'),
      encrypted_data: encryptedData.toString('base64'),
      nonce: nonce.toString('base64'),
    }), 'utf-8');

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            reject(new Error(`心跳服务返回异常 (HTTP ${res.statusCode})`));
            return;
          }
          // 业务失败(code != 0)时无 encrypted_data,直接抛给上层
          if (parsed && typeof parsed.code === 'number' && parsed.code !== 0) {
            reject(new Error(parsed.message || `心跳失败 (code ${parsed.code})`));
            return;
          }
          if (!parsed || typeof parsed.encrypted_data !== 'string' || typeof parsed.nonce !== 'string') {
            reject(new Error(`心跳服务响应缺少加密数据 (HTTP ${res.statusCode})`));
            return;
          }
          try {
            // 响应加密格式与 Go 端 AESGCMEncrypt 一致:base64(ct ‖ tag),nonce 单独字段
            const respNonce = Buffer.from(parsed.nonce, 'base64');
            const raw = Buffer.from(parsed.encrypted_data, 'base64');
            const tag = raw.subarray(raw.length - 16);
            const ct = raw.subarray(0, raw.length - 16);
            const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, respNonce);
            decipher.setAuthTag(tag);
            const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
            resolve(JSON.parse(pt.toString('utf-8')));
          } catch (err) {
            reject(new Error('心跳响应解密失败: ' + err.message));
            return;
          }
        });
      },
    );

    req.on('timeout', () => req.destroy(new Error('心跳请求超时')));
    req.on('error', (err) => reject(new Error(err.message || '心跳发送失败')));
    req.end(body);
  });
}

function osUsername() {
  try {
    return os.userInfo().username;
  } catch {
    return '';
  }
}

class HeartbeatClient {
  /**
   * @param {object} opts
   * @param {() => {device_id:number, machine_code:string}|null} opts.getIdentity 拉取本机设备标识
   * @param {() => string} opts.getServerUrl 管控中心地址
   * @param {() => object|null} [opts.getUsage] 心跳捎带的功能使用统计快照
   * @param {() => void} [opts.onUsageSent] 心跳成功后回调（清零统计窗口）
   * @param {(event:string, payload:object)=>void} opts.emit 事件广播(license:heartbeat-expired 等)
   * @param {string} [opts.clientVersion]
   */
  constructor(opts = {}) {
    this.getIdentity = opts.getIdentity || (() => null);
    this.getServerUrl = opts.getServerUrl || (() => '');
    this.getUsage = opts.getUsage || (() => null);
    this.onUsageSent = opts.onUsageSent || null;
    this.emit = opts.emit || (() => {});
    this.clientVersion = opts.clientVersion || '';
    this.timer = null;
    this.stopped = true;
    this.lastResult = null;   // { at, ok, licenseExpired, updateFlag, error }
    this.consecutiveFailures = 0;
  }

  status() {
    return {
      running: !this.stopped,
      last_result: this.lastResult,
      consecutive_failures: this.consecutiveFailures,
    };
  }

  start() {
    if (!this.stopped) return;
    if (!this.getIdentity()) return; // 无 device_id(离线导入/未激活)→ 不启动
    if (!hasPublicKey()) {
      console.warn('[heartbeat] 缺少 heartbeat_public.pem,心跳未启动');
      return;
    }
    this.stopped = false;
    this.schedule(0);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  restart() {
    this.stop();
    this.start();
  }

  schedule(delayMs) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    // 5分钟 ± 60s 抖动,避免全网设备同一秒打进来
    const jitter = Math.floor(Math.random() * (2 * JITTER_MS + 1)) - JITTER_MS;
    const wait = Math.max(1000, delayMs + jitter);
    this.timer = setTimeout(() => {
      this.tick().catch(() => {});
    }, wait);
  }

  async tick() {
    if (this.stopped) return;
    const identity = this.getIdentity();
    if (!identity) {
      this.stop();
      return;
    }

    let nextDelay = BASE_INTERVAL_MS;
    try {
      const result = await this.send();
      this.consecutiveFailures = 0;
      this.lastResult = { at: Date.now(), ok: true, licenseExpired: !!result.license_expired, updateFlag: result.update_flag || null };
      if (result.license_expired) {
        this.emit('license:heartbeat-expired', { reason: 'LICENSE_EXPIRED', server_time: result.server_time || null });
      }
    } catch (err) {
      this.consecutiveFailures += 1;
      this.lastResult = { at: Date.now(), ok: false, error: err.message };
      // 连续失败时指数退避,但封顶 30 分钟,网络恢复后自动回到正常节奏
      nextDelay = Math.min(BASE_INTERVAL_MS * Math.pow(2, this.consecutiveFailures), 30 * 60 * 1000);
    }

    if (!this.stopped) this.schedule(nextDelay);
  }

  /**
   * 单次上报(不调度)。供定时器和 IPC 手动触发共用。
   * @returns {Promise<object>} 服务端解密后的 data 字段
   */
  async send() {
    const identity = this.getIdentity();
    if (!identity || !identity.device_id || !identity.machine_code) {
      throw new Error('缺少设备标识,请先完成在线激活');
    }
    const base = String(this.getServerUrl() || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('未配置授权服务地址');
    const publicKeyPem = loadHeartbeatPublicKey();
    if (!publicKeyPem) throw new Error('缺少心跳加密公钥 heartbeat_public.pem');

    const payload = {
      device_id: identity.device_id,
      machine_code: identity.machine_code,
      client_version: this.clientVersion || '',
      client_platform: os.platform(),
      client_arch: os.arch(),
      client_time: new Date().toISOString(),
    };
    // 功能使用统计（可选）：无数据（未使用/老版本）则报文不带 usage 字段
    const usage = this.getUsage();
    if (usage) payload.usage = usage;

    const resp = await postEncrypted(base + HEARTBEAT_PATH, payload, publicKeyPem);
    if (usage && this.onUsageSent) {
      try { this.onUsageSent(); } catch { /* 统计清理失败不影响心跳 */ }
    }
    return resp && typeof resp === 'object' ? resp : {};
  }
}

module.exports = {
  HeartbeatClient,
  postEncrypted,
  hasPublicKey,
  loadHeartbeatPublicKey,
  osUsername,
};
