'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const MAX_REDIRECTS = 6;

function openStream(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          // GitHub Release 会重定向到 objects.githubusercontent.com，带上 UA 更稳。
          'User-Agent': 'fde-desktop-ide',
          Accept: 'application/octet-stream',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error(`下载重定向次数过多: ${url}`));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          openStream(next, redirects + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`下载失败 HTTP ${status}: ${url}`));
          return;
        }
        resolve(res);
      },
    );
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('下载连接超时')));
  });
}

/**
 * 下载文件并校验 SHA-256。
 * @param {string} url
 * @param {string} dest 临时文件路径
 * @param {{ expectedSha256?: string, onProgress?: (p: {received:number,total:number,percent:number}) => void, signal?: AbortSignal }} opts
 * @returns {Promise<{ sha256: string, size: number }>}
 */
async function downloadFile(url, dest, opts = {}) {
  const { expectedSha256, onProgress, signal } = opts;
  if (signal && signal.aborted) throw new Error('下载已取消');

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  // 先写 .part，校验通过后再改名，避免半截文件被当成完整包。
  const part = `${dest}.part`;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(part);

  let received = 0;
  const startedAt = Date.now();
  let lastEmit = 0;

  const cleanup = async () => {
    try { out.destroy(); } catch (_) { /* ignore */ }
    await fsp.rm(part, { force: true }).catch(() => {});
  };

  try {
    const res = await openStream(url);
    const total = Number(res.headers['content-length'] || 0);

    if (signal) {
      const onAbort = () => {
        res.destroy(new Error('下载已取消'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      res.on('close', () => signal.removeEventListener('abort', onAbort));
    }

    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        received += chunk.length;
        hash.update(chunk);
        const now = Date.now();
        // 节流 200ms，避免高频 IPC 把渲染层压满。
        if (onProgress && (now - lastEmit > 200 || (total && received >= total))) {
          lastEmit = now;
          const elapsed = Math.max(0.001, (now - startedAt) / 1000);
          onProgress({
            received,
            total,
            percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0,
            bytesPerSecond: Math.round(received / elapsed),
          });
        }
      });
      res.on('error', reject);
      res.pipe(out);
      out.on('error', reject);
      out.on('finish', resolve);
    });

    const sha256 = hash.digest('hex');
    if (expectedSha256 && sha256 !== expectedSha256) {
      throw new Error(`安装包校验失败（SHA-256 不匹配）：期望 ${expectedSha256}，实际 ${sha256}`);
    }
    await fsp.rename(part, dest);
    return { sha256, size: received };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

module.exports = { downloadFile };
