/**
 * license 校验:解密 → 验签 → SN 绑定 → 时钟防拨 → 过期判定。
 * 返回 { ok, status, reason, customer, licenseType, expireAt, graceDays, features, sn }
 *
 * 状态:
 *   ACTIVE_PERMANENT / ACTIVE_TEMPORARY   → ok=true(正常)
 *   GRACE_PERIOD(到期后 grace 天内)       → ok=true(仍可用,提示续期)
 *   HARD_EXPIRED(缓冲期已过)              → ok=false
 *   NO_LICENSE / SN_MISMATCH / TAMPERED / CLOCK_ROLLBACK / FINGERPRINT_FAIL → ok=false
 */
const cryptoMod = require('./crypto');
const { computeSN } = require('./fingerprint');
const store = require('./store');

const CLOCK_TOLERANCE_SEC = 3600; // 允许 1h 误差

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 时钟防拨:曾见最大时间锚定 + 倒流检测
function checkClock() {
  const now = Date.now() / 1000;
  const meta = store.readMeta();
  const maxSeen = typeof meta.max_wall_clock_seen === 'number' ? meta.max_wall_clock_seen : now;
  if (now < maxSeen - CLOCK_TOLERANCE_SEC) return 'CLOCK_ROLLBACK';
  meta.max_wall_clock_seen = Math.max(maxSeen, now);
  store.writeMeta(meta);
  return null;
}

function fail(status, payload, sn, message) {
  return {
    ok: false, status, reason: status, message: message || null,
    customer: payload?.customer || null,
    licenseType: payload?.license_type || null,
    expireAt: payload?.expire_at || null,
    graceDays: payload ? Number(payload.grace_days ?? 0) : 0,
    features: payload?.features || [],
    sn: sn || null,
  };
}

function build(status, ok, payload, sn) {
  return {
    ok, status, reason: null,
    customer: payload.customer || null,
    licenseType: payload.license_type || null,
    expireAt: payload.expire_at || null,
    graceDays: Number(payload.grace_days ?? 0),
    features: payload.features || [],
    sn,
  };
}

function loadAndVerify(licBytes) {
  let sn;
  try { sn = computeSN(); }
  catch { return fail('FINGERPRINT_FAIL', null, null); }

  let payload, signature;
  try { ({ payload, signature } = cryptoMod.decryptLicense(licBytes)); }
  catch (e) {
    // AES-GCM 解密失败 = 外层 aes.key 与本包不一致,或 .lic 本身损坏。
    const detail = describeKeyFailure('AES 解密失败', e);
    console.error('[license]', detail);
    return fail('TAMPERED', null, sn, detail);
  }

  // 验签
  try {
    if (!cryptoMod.verifyPayload(payload, signature)) {
      const detail = describeKeyFailure('Ed25519 验签失败');
      console.error('[license]', detail);
      return fail('TAMPERED', payload, sn, detail);
    }
  } catch (e) {
    const detail = describeKeyFailure('Ed25519 验签异常', e);
    console.error('[license]', detail);
    return fail('TAMPERED', payload, sn, detail);
  }

  // SN 绑定
  if (payload.device_sn !== sn) return fail('SN_MISMATCH', payload, sn);

  // 时钟防拨
  const clk = checkClock();
  if (clk) return fail(clk, payload, sn);

  // 过期判定
  const type = payload.license_type || 'temporary';
  if (type === 'permanent') return build('ACTIVE_PERMANENT', true, payload, sn);

  const today = todayStr();
  const exp = payload.expire_at; // 'YYYY-MM-DD'
  if (!exp) return build('ACTIVE_PERMANENT', true, payload, sn); // 无到期视为永久
  const grace = Number(payload.grace_days ?? 0);
  const expDate = new Date(exp + 'T23:59:59');
  const graceEnd = new Date(expDate.getTime() + grace * 86400000);
  const now = new Date(today + 'T00:00:00');

  if (now <= expDate) return build('ACTIVE_TEMPORARY', true, payload, sn);
  if (now <= graceEnd) return build('GRACE_PERIOD', true, payload, sn); // 缓冲期仍可用
  return build('HARD_EXPIRED', false, payload, sn);
}

// TAMPERED 的可读原因:区分「密钥缺失」与「密钥不匹配」。二者修复方式不同
// (缺文件 → 补 aes.key/public_key.pem;不匹配 → 换对的密钥/重新签发),
// 而原始错误被吞掉后用户只看到笼统的「授权文件无效或已损坏」。
function describeKeyFailure(what, err) {
  let diag = null;
  try { diag = cryptoMod.keyDiagnostics(); } catch { /* ignore */ }
  const parts = [what];
  if (err && err.message) parts.push(`(${err.message})`);
  if (diag) {
    parts.push(`密钥目录=${diag.dir}`);
    if (!diag.aesKey.exists) parts.push('缺少 aes.key');
    else if (diag.aesKey.bytes !== 32) parts.push(`aes.key 大小异常=${diag.aesKey.bytes}字节(应为32)`);
    if (!diag.publicKey.exists) parts.push('缺少 public_key.pem');
    if (diag.pubkeyFingerprint) parts.push(`公钥指纹=${diag.pubkeyFingerprint}`);
  }
  return parts.join(' ');
}

// 读已存 license 并校验;无 license → NO_LICENSE
function currentStatus() {
  let sn = null;
  try { sn = computeSN(); } catch { /* ignore */ }
  const bytes = store.readLicense();
  if (!bytes) return { ok: false, status: 'NO_LICENSE', reason: 'NO_LICENSE', sn, features: [] };
  return loadAndVerify(bytes);
}

module.exports = { loadAndVerify, currentStatus, todayStr };
