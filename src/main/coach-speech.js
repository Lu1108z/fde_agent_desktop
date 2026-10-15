// 360 currently rejects MiniMax stream:true. Synthesize short sentences and
// prefetch the next one; do not silently substitute the system speech voice.
const https = require('https');
const { randomUUID } = require('crypto');
const MODEL = 'minimax/speech-2.8-turbo';

function requestBytes(url, { body, key, signal, limit = 4 * 1024 * 1024, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error('语音已取消'));
    const target = new URL(url);
    if (target.protocol !== 'https:') return reject(Error('语音服务必须使用 HTTPS'));
    const req = https.request(target, {
      method: body ? 'POST' : 'GET', signal,
      headers: body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'Content-Length': Buffer.byteLength(body) } : {},
    }, res => {
      if (!body && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 3) {
        res.resume(); requestBytes(new URL(res.headers.location, target), { signal, limit, redirects: redirects + 1 }).then(resolve, reject); return;
      }
      const buffers = []; let length = 0;
      res.on('data', chunk => {
        length += chunk.length;
        if (length > limit) { req.destroy(Error('语音响应过大')); return; }
        buffers.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, bytes: Buffer.concat(buffers) }));
    });
    req.setTimeout(30000, () => req.destroy(Error('语音服务响应超时，请重试')));
    req.on('error', reject); req.end(body);
  });
}

async function synthesizeCoachSpeech({ text, config, signal, request = requestBytes }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 400) throw Error('请使用较短的语音句子');
  if (!config?.apiKey) throw Error('请先在设置中配置 360 API Key');
  const endpoint = `${(config.baseUrl || 'https://api.360.cn/v1').replace(/\/+$/, '')}/audios/generations`;
  const body = JSON.stringify({ model: MODEL, extra_body: {
    text: text.trim(), stream: false, output_format: 'hex', language_boost: 'Chinese',
    voice_setting: { voice_id: 'male-qn-qingse', speed: 1.05, vol: 1, pitch: 0 },
    audio_setting: { format: 'pcm', sample_rate: 24000, channel: 1 },
  } });
  const response = await request(endpoint, { body, key: config.apiKey, signal });
  if (response.status === 401 || response.status === 403) throw Error('360 Key 没有语音模型权限，请检查设置');
  if (response.status === 429) throw Error('语音请求过于频繁，请稍后重试');
  let parsed; try { parsed = JSON.parse(response.bytes); } catch { throw Error('语音服务返回了无法识别的内容'); }
  if (response.status < 200 || response.status >= 300 || parsed.error) throw Error(`MiniMax 语音生成失败（HTTP ${response.status}），请稍后重试`);
  let native = parsed;
  if (parsed.data?.extra_data) {
    try { native = typeof parsed.data.extra_data === 'string' ? JSON.parse(parsed.data.extra_data) : parsed.data.extra_data; }
    catch { throw Error('语音数据解析失败'); }
  }
  if (native.base_resp?.status_code) throw Error('MiniMax 语音生成未完成，请重试');
  const info = native.extra_info || {};
  if (info.audio_format && info.audio_format !== 'pcm') throw Error('语音服务未返回 PCM 音频');
  if (info.audio_channel && info.audio_channel !== 1) throw Error('语音服务返回了不支持的声道');
  let bytes;
  if (native.data?.audio) {
    if (!/^(?:[0-9a-f]{2})+$/i.test(native.data.audio)) throw Error('语音音频数据损坏');
    bytes = Buffer.from(native.data.audio, 'hex');
  } else if (parsed.data?.url) {
    // No API credentials are sent when downloading the provider's audio URL.
    const result = await request(parsed.data.url, { signal });
    if (result.status !== 200) throw Error('语音下载失败，请重试');
    bytes = result.bytes;
  }
  if (signal?.aborted) throw Error('语音已取消');
  if (!bytes?.length || bytes.length % 2 || bytes.length > 4 * 1024 * 1024) throw Error('语音音频数据不完整');
  return { success: true, audioBase64: bytes.toString('base64'), sampleRate: info.audio_sample_rate || 24000, format: 'pcm', model: MODEL };
}

function registerCoachSpeech({ ipcMain, app, getConfig }) {
  const pending = new Map();
  ipcMain.handle('coach:speech', async (event, { id = randomUUID(), text } = {}) => {
    const owner = event.sender.id, token = `${owner}:${id}`;
    if (typeof id !== 'string' || id.length > 100 || pending.has(token)) return { success: false, error: '无效的语音请求' };
    if ([...pending.values()].filter(v => v.owner === owner).length >= 2) return { success: false, error: '语音正在生成，请稍后再试' };
    const controller = new AbortController(); pending.set(token, { owner, controller });
    const abort = () => controller.abort(); event.sender.once('destroyed', abort);
    try { return await synthesizeCoachSpeech({ text, config: getConfig(), signal: controller.signal }); }
    catch (err) { return { success: false, cancelled: controller.signal.aborted, error: controller.signal.aborted ? '语音已取消' : err.message }; }
    finally { pending.delete(token); if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abort); }
  });
  ipcMain.handle('coach:speech-cancel', (event, { id } = {}) => {
    pending.get(`${event.sender.id}:${id}`)?.controller.abort(); return { success: true };
  });
  app.on('before-quit', () => { for (const value of pending.values()) value.controller.abort(); });
}
module.exports = { MODEL, synthesizeCoachSpeech, registerCoachSpeech };
