// Short PCM sentences are prefetched, then played in order using Web Audio.
export function createCoachSpeechPlayer({ api, environment = globalThis, onText } = {}) {
  const env = environment, prepared = new Map();
  let context, source, current, serial = 0;
  const getContext = () => context ||= new (env.AudioContext || env.webkitAudioContext)();
  function prefetch(text) {
    if (!text || prepared.has(text) || prepared.size >= 2) return;
    const id = `coach-${Date.now()}-${++serial}`, record = { id, text };
    record.promise = api.speech(id, text).then(result => {
      if (!result?.success) throw Error(result?.error || '教练语音生成失败');
      return result;
    });
    // The consumer observes failures; an aborted prefetched sentence has no consumer.
    record.promise.catch(() => {}); prepared.set(text, record);
  }
  return {
    prefetch,
    getVoices: () => [{ lang: 'zh-CN', name: 'MiniMax Speech 2.8 Turbo' }],
    async prepare() {
      const ctx = getContext();
      let timeout;
      try { await Promise.race([ctx.resume(), new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('音频播放尚未就绪，请重试')), 5000); })]); }
      finally { clearTimeout(timeout); }
    },
    async speak(utterance) {
      prefetch(utterance.text);
      const record = prepared.get(utterance.text);
      if (!record) { utterance.onerror?.({ message: '教练语音队列繁忙' }); return; }
      current = record;
      try {
        const result = await record.promise;
        if (current !== record) return;
        const ctx = getContext(); await ctx.resume();
        if (current !== record) return;
        const binary = env.atob(result.audioBase64), samples = new Float32Array(binary.length / 2);
        for (let i = 0; i < samples.length; i++) {
          let value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
          if (value >= 32768) value -= 65536; samples[i] = value / 32768;
        }
        const buffer = ctx.createBuffer(1, samples.length, result.sampleRate);
        buffer.copyToChannel(samples, 0);
        source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
        source.onended = () => {
          if (current !== record) return;
          source.disconnect(); source = null; current = null; prepared.delete(record.text); utterance.onend?.();
        };
        onText?.(record.text); utterance.onstart?.(); source.start();
      } catch (err) {
        if (current !== record) return;
        current = null; prepared.delete(record.text); utterance.onerror?.({ message: err.message });
      }
    },
    cancel() {
      current = null;
      if (source) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); source = null; }
      for (const record of prepared.values()) api.cancelSpeech(record.id).catch(() => {});
      prepared.clear();
    },
    close() { this.cancel(); context?.close().catch(() => {}); context = null; },
  };
}
