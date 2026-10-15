import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createVoiceConversation, createVoiceActivityDetector, spokenText } from '../src/renderer/components/agent/voice-conversation.mjs';
import { createCoachSpeechPlayer } from '../src/renderer/components/agent/coach-speech-player.mjs';
const require = createRequire(import.meta.url);
const { synthesizeCoachSpeech } = require('../src/main/coach-speech.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const flush = () => delay(0);
function fixture({ transcribe, acquire, send, timeouts } = {}) {
  const states = [], speech = [], sends = [], interrupts = [], tracks = [{ enabled: true, stopped: false, stop() { this.stopped = true; } }];
  const stream = { getTracks: () => tracks, getAudioTracks: () => tracks };
  let rms = 0;
  const synth = { getVoices: () => [{ lang: 'zh-CN' }], speak: u => { speech.push(u); u.onstart?.(); }, cancel() {} };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.mimeType = 'audio/webm'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.(); }
  }
  class Context { async resume() {} async close() {} createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: data => data.fill(rms) }; } createMediaStreamSource() { return { connect() {}, disconnect() {} }; } }
  class Reader { readAsDataURL() { this.result = 'data:audio/webm;base64,YQ=='; this.onload(); } }
  const env = { speechSynthesis: synth, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, MediaRecorder: Recorder, AudioContext: Context, Blob, FileReader: Reader, performance, navigator: { mediaDevices: { getUserMedia: acquire || (async () => stream) } } };
  const call = createVoiceConversation({ environment: env, timeouts, onState: state => states.push(state), transcribe: transcribe || (async () => ({ success: true, text: '医疗行业' })), onInterrupt: () => interrupts.push(true), onSend: async text => { sends.push(text); if (send) return send(text); call.updateReply({ key: 'turn-'+sends.length, content: '您好。', streaming: true }); } });
  return { call, states, speech, sends, interrupts, tracks, stream, setRms(value) { rms = value; }, finishSpeech() { speech.at(-1).onend(); } };
}
const vad = createVoiceActivityDetector();
for (let time = 50; time < 5000; time += 50) assert.equal(vad.sample(.001, time).finished, false);
vad.reset(); vad.sample(.1, 50); assert.equal(vad.sample(0, 2000).finished, false);
vad.reset(); for (let t = 50; t <= 400; t += 50) vad.sample(.08, t);
assert.equal(vad.sample(0, 1400).finished, false); assert.equal(vad.sample(0, 1550).finished, true);
assert.equal(spokenText('## 你好\n**可以** [查看](https://example.com)'), '你好\n可以 查看');
const f = fixture();
await f.call.start(); assert.equal(f.states.at(-1).phase, 'speaking'); assert.equal(f.tracks[0].enabled, true);
f.finishSpeech(); assert.equal(f.states.at(-1).phase, 'listening');
f.call.sendTurn(); await flush(); await flush(); assert.deepEqual(f.sends, ['医疗行业']);
assert.equal(f.speech.at(-1).text, '您好。');
f.call.updateReply({ key: 'turn-1', content: '您好。我是客户', streaming: true });
f.finishSpeech(); assert.equal(f.states.at(-1).phase, 'thinking');
f.call.updateReply({ key: 'turn-1', content: '您好。我是客户主任。', streaming: false });
assert.equal(f.speech.at(-1).text, '我是客户主任。');
f.finishSpeech(); assert.equal(f.states.at(-1).phase, 'listening');
f.call.toggleMute(); assert.equal(f.tracks[0].enabled, false); f.call.toggleMute(); assert.equal(f.tracks[0].enabled, true);
f.call.stop(); assert.equal(f.tracks[0].stopped, true);
// Real voice activity during playback interrupts audio and suppresses trailing text.
const j = fixture(); await j.call.start(); j.setRms(.06); await delay(400);
assert.equal(j.interrupts.length, 1); assert.equal(j.states.at(-1).phase, 'listening');
j.call.updateReply({ key: 'old', content: '不应朗读。', streaming: false }); assert.equal(j.speech.length, 1);
j.setRms(0); j.call.sendTurn(); await flush(); await flush(); assert.equal(j.sends.length, 1); assert.equal(j.speech.at(-1).text, '您好。'); j.call.stop();
let resolveAsr; const g = fixture({ transcribe: () => new Promise(resolve => { resolveAsr = resolve; }) });
await g.call.start(); g.finishSpeech(); g.call.sendTurn(); await flush();
g.call.stop(); resolveAsr({ success: true, text: '不应发送' }); await flush(); assert.equal(g.sends.length, 0);
let grant; const h = fixture({ acquire: () => new Promise(resolve => { grant = resolve; }) });
const connecting = h.call.start(); await flush(); h.call.stop(); grant(h.stream); await connecting; assert.equal(h.tracks[0].stopped, true);
const absent = fixture({ acquire: async () => { const e = Error('Requested device not found'); e.name = 'NotFoundError'; throw e; } });
await absent.call.start(); assert.match(absent.states.at(-1).error, /未找到麦克风/); absent.call.stop();
// An ASR failure after an interruption must be visible, not swallowed.
const bad = fixture({ transcribe: async () => ({ success: false, error: '识别服务失败' }) });
await bad.call.start(); bad.call.skipSpeech(); bad.call.sendTurn(); await flush(); await flush();
assert.equal(bad.states.at(-1).phase, 'error'); assert.match(bad.states.at(-1).error, /识别服务失败/); bad.call.stop();
// Ambient noise while the model is thinking must not cancel the pending reply.
let completeModel;
const thinking = fixture({ send: () => new Promise(resolve => { completeModel = resolve; }) });
await thinking.call.start(); thinking.finishSpeech(); thinking.call.sendTurn(); await flush(); await flush();
thinking.setRms(.06); await delay(400); assert.equal(thinking.interrupts.length, 0); assert.equal(thinking.states.at(-1).phase, 'thinking');
thinking.setRms(0); completeModel(); await flush(); thinking.call.stop();
// A stalled model cancellation must time out visibly and stop without timer leaks.
const stuck = fixture({ send: () => new Promise(() => {}), timeouts: { interruptionMs: 15, replyMs: 1000 } });
await stuck.call.start(); stuck.finishSpeech(); stuck.call.sendTurn(); await flush(); await flush();
stuck.call.skipSpeech(); stuck.call.sendTurn(); await delay(30); assert.equal(stuck.states.at(-1).phase, 'error'); assert.match(stuck.states.at(-1).error, /上一轮/); stuck.call.stop();
// Provider response contains a URL; verify separate download, no credential forwarding.
const requests = [], config = { apiKey: 'test-key', baseUrl: 'https://api.360.cn/v1' };
const result = await synthesizeCoachSpeech({ text: '您好', config, request: async (url, opts) => {
  requests.push({ url, opts });
  return requests.length === 1 ? { status: 200, bytes: Buffer.from(JSON.stringify({ data: { url: 'https://audio.example/test', extra_data: JSON.stringify({ base_resp: { status_code: 0 }, extra_info: { audio_format: 'pcm', audio_sample_rate: 24000, audio_channel: 1 } }) } })) } : { status: 200, bytes: Buffer.from([0,0,1,0]) };
} });
assert.equal(result.audioBase64, 'AAABAA=='); assert.equal(requests[1].opts.key, undefined);
assert.equal(JSON.parse(requests[0].opts.body).extra_body.stream, false);
await assert.rejects(synthesizeCoachSpeech({ text: '你好', config, request: async () => ({ status: 403 }) }), /权限/);
// Prefetch two sentences, preserve playback order, and cancel pending synthesis.
const playback = [], calls = [], cancelled = [], contexts = [];
class AudioContext {
  constructor() { contexts.push(this); }
  async resume() {} async close() {}
  createBuffer(channels, length, rate) { assert.equal(rate, 24000); return { copyToChannel(data) { assert.equal(data[1], -1); } }; }
  createBufferSource() { const node = { connect() {}, disconnect() {}, start() { playback.push(node); }, stop() {} }; return node; }
}
let finishLate;
const player = createCoachSpeechPlayer({ environment: { AudioContext, atob }, api: {
  speech: async (id, text) => { calls.push(text); if (text === 'late') return new Promise(resolve => { finishLate = resolve; }); return { success: true, audioBase64: 'AAAAgA==', sampleRate: 24000 }; },
  cancelSpeech: async id => cancelled.push(id),
} });
player.prefetch('one'); player.prefetch('two'); player.prefetch('three'); assert.deepEqual(calls, ['one', 'two']);
let ended = false; await player.speak({ text: 'one', onend() { ended = true; } }); playback.at(-1).onended(); assert.equal(ended, true);
await player.speak({ text: 'two' }); player.cancel(); assert.equal(playback.at(-1).onended, null);
const late = player.speak({ text: 'late' }); await flush(); player.cancel(); finishLate({ success: true, audioBase64: 'AAAAgA==', sampleRate: 24000 }); await late; assert.equal(playback.length, 2);
player.close(); assert.ok(cancelled.length >= 2);
// Dedicated dialogue preserves UTF-8 deltas across arbitrary SSE chunk splits.
const { streamCoachReply } = require('../src/main/coach-reply.js');
const wire = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"您好，"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"刘主任。"}}]}\n\ndata: [DONE]\n');
const deltas = [];
const reply = await streamCoachReply({ config, messages: [{ role: 'user', content: '你好' }], model: 'custom:deepseek/deepseek-v4-flash', onText: text => deltas.push(text), fetchImpl: async (url, options) => {
  assert.equal(JSON.parse(options.body).model, 'deepseek/deepseek-v4-flash');
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < wire.length; i += 7) controller.enqueue(wire.slice(i, i + 7)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
} });
assert.deepEqual(deltas, ['您好，', '刘主任。']); assert.equal(reply.content, '您好，刘主任。');
await assert.rejects(streamCoachReply({ config, messages: [{ role: 'user', content: '你好' }], fetchImpl: async () => new Response('{"choices":[]}', { headers: { 'Content-Type': 'application/json' } }) }), /没有返回/);
console.log('Voice tests passed: continuous microphone, VAD barge-in, stale-reply suppression, mute, hangup races, PCM playback/prefetch, cancellation and provider response decoding.');
