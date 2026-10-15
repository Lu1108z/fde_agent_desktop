import { splitResponseSummary } from '../../data/response-summary.mjs';
// Voice turns share the existing coach session; playback remains interruptible.
export function spokenText(text) {
  return splitResponseSummary(text).content.replace(/```[\s\S]*?```/g, '代码已显示在对话中。')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[#>|*-]+\s*/gm, '').replace(/[`*_~|]/g, '').trim();
}

export function createVoiceActivityDetector() {
  let noise = .004, started = 0, lastSound = 0, voicedMs = 0, previous = 0;
  return {
    reset() { noise = .004; started = lastSound = voicedMs = previous = 0; },
    sample(rms, now) {
      const dt = previous ? Math.min(100, now - previous) : 50;
      previous = now;
      const audible = rms > Math.max(.012, Math.min(.08, noise * 3));
      if (audible) {
        if (!started) started = now;
        lastSound = now; voicedMs += dt;
      } else if (!started) noise = noise * .97 + Math.min(rms, .025) * .03;
      return { audible, hasSpeech: voicedMs >= 250, finished: voicedMs >= 250 && (now - lastSound >= 1100 || now - started >= 60000) };
    },
  };
}

export function createVoiceConversation({ onState, onTranscript, onSend, onInterrupt, transcribe, speechOutput, timeouts = {}, environment = globalThis }) {
  const env = environment, synth = speechOutput || env.speechSynthesis;
  let active = false, muted = false, phase = 'idle', error = '', generation = 0;
  let stream, context, source, analyser, recorder, monitor, speechTimer, utterance;
  let detector = createVoiceActivityDetector(), recordedAt = 0;
  let queue = [], speaking = false, replying = false, responseKey = '', consumed = 0, suppressed = false;
  let pendingSend, turnSequence = 0, interruptPending = Promise.resolve();
  const pendingWaits = new Set();
  async function bounded(promise, ms, message) {
    let timer, cancel;
    try { return await Promise.race([promise, new Promise((_, reject) => { cancel = () => reject(Error('语音已结束')); pendingWaits.add(cancel); timer = setTimeout(() => reject(Error(message)), ms); })]); }
    finally { clearTimeout(timer); pendingWaits.delete(cancel); }
  }
  const publish = (extra = {}) => onState?.({ active, muted, phase, error, ...extra });
  const setPhase = value => { phase = value; publish(); };
  const discardRecording = () => {
    const current = recorder; recorder = null;
    if (current) { current.onstop = null; if (current.state !== 'inactive') current.stop(); }
  };
  const stopPlayback = () => { clearTimeout(speechTimer); utterance = null; synth?.cancel(); queue = []; speaking = false; };
  const fail = message => {
    error = message; ++turnSequence; discardRecording(); stopPlayback();
    stream?.getAudioTracks().forEach(track => { track.enabled = false; }); setPhase('error');
  };
  function settled() {
    if (!active || phase === 'error' || phase === 'transcribing') return;
    if (speaking) return;
    if (queue.length) { playNext(); return; }
    setPhase(replying ? 'thinking' : muted ? 'muted' : 'listening');
    listen();
  }
  function listen() {
    if (!active || !stream || muted || phase === 'transcribing' || phase === 'error' || recorder) return;
    stream.getAudioTracks().forEach(track => { track.enabled = true; });
    const mine = generation;
    try {
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => env.MediaRecorder.isTypeSupported(type));
      const current = new env.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = []; recorder = current; recordedAt = env.performance.now(); detector.reset();
      current.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      current.onerror = () => { if (active && mine === generation) fail('麦克风录音中断，请重试。'); };
      current.onstop = async () => {
        if (recorder === current) recorder = null;
        if (!active || mine !== generation) return;
        const turn = ++turnSequence;
        const blob = new env.Blob(chunks, { type: current.mimeType || 'audio/webm' });
        setPhase('transcribing');
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new env.FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(Error('录音读取失败')); reader.readAsDataURL(blob);
          });
          if (!active || mine !== generation) return;
          const result = await bounded(transcribe(base64, blob.type), timeouts.recognitionMs || 20000, '语音识别超时，请重试');
          if (!active || mine !== generation) return;
          if (!result?.success || !result.text?.trim()) throw Error(result?.error || '没有听清，请再说一遍。');
          // Finish cancellation of the interrupted text turn before submitting another.
          await bounded(interruptPending, timeouts.interruptionMs || 6000, '上一轮回复未能停止，请重试');
          if (pendingSend) await bounded(pendingSend.catch(() => {}), timeouts.interruptionMs || 6000, '上一轮回复还未结束，请重试');
          if (!active || mine !== generation) return;
          const text = result.text.trim(); onTranscript?.(text); suppressed = false; responseKey = ''; consumed = 0;
          replying = true; setPhase('thinking'); listen();
          const sending = Promise.resolve().then(() => onSend(text)); pendingSend = sending;
          await bounded(sending, timeouts.replyMs || 55000, '教练回复超时，请重试');
          if (pendingSend === sending) pendingSend = null;
          if (active && mine === generation && turn === turnSequence && !suppressed) { replying = false; settled(); }
        } catch (err) {
          if (active && mine === generation && turn === turnSequence && (phase === 'transcribing' || !suppressed)) fail(err.message || '语音识别失败，请重试。');
        }
      };
      current.start(250);
    } catch { fail('当前环境无法录音，请检查麦克风。'); }
  }
  function interrupt() {
    if (!active) return;
    suppressed = true; replying = false; stopPlayback();
    interruptPending = Promise.resolve().then(() => onInterrupt?.()).catch(() => {});
    setPhase(muted ? 'muted' : 'listening'); listen();
  }
  function sendTurn() {
    if (!active || muted || !recorder || recorder.state === 'inactive') return;
    if (speaking || replying || queue.length) interrupt();
    stream?.getAudioTracks().forEach(track => { track.enabled = false; });
    setPhase('transcribing'); recorder.stop();
  }
  function prefetch() { for (const text of queue.slice(0, 2)) synth?.prefetch?.(text); }
  function playNext() {
    if (!active || speaking || phase === 'error' || phase === 'transcribing') return;
    const text = queue.shift();
    if (!text) { settled(); return; }
    speaking = true; setPhase('thinking');
    const mine = generation;
    const speech = speechOutput ? { text } : new env.SpeechSynthesisUtterance(text); utterance = speech;
    speech.lang = 'zh-CN'; speech.rate = 1.05;
    if (!speechOutput) { speech.voice = synth.getVoices().find(voice => /^zh/i.test(voice.lang)) || null; setPhase('speaking'); }
    speech.onstart = () => { if (active && mine === generation && utterance === speech) setPhase('speaking'); };
    speech.onend = () => {
      if (!active || mine !== generation || utterance !== speech) return;
      clearTimeout(speechTimer); utterance = null; speaking = false; playNext();
    };
    speech.onerror = event => {
      if (active && mine === generation && utterance === speech) fail(event.message || '教练语音播放失败，请重试。');
    };
    speechTimer = setTimeout(() => { if (utterance === speech) fail('语音服务响应超时，请重试。'); }, Math.max(45000, text.length * 700));
    synth.speak(speech); prefetch(); listen();
  }
  function enqueue(text) {
    const clean = spokenText(text);
    if (!clean) return;
    // Bound latency and memory even if a model emits a long unpunctuated paragraph.
    for (let i = 0; i < clean.length; i += 100) queue.push(clean.slice(i, i + 100));
    prefetch();
  }
  return {
    async start({ replying: busy = false } = {}) {
      if (active) return;
      active = true; muted = false; replying = busy; suppressed = false; error = ''; responseKey = ''; consumed = 0;
      const mine = ++generation; setPhase('connecting');
      try {
        if (!env.navigator?.mediaDevices?.getUserMedia || !env.MediaRecorder || !synth) throw Error('当前环境不支持语音对话。');
        await synth.prepare?.(); if (!active || mine !== generation) return;
        let expired = false, permissionTimer;
        let acquired;
        try {
          acquired = await Promise.race([
            env.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(value => {
              if (expired || !active || mine !== generation) { value.getTracks().forEach(track => track.stop()); return null; }
              return value;
            }),
            new Promise((_, reject) => { permissionTimer = setTimeout(() => { expired = true; reject(Error('麦克风未响应，请确认已连接麦克风并允许使用')); }, 12000); }),
          ]);
        } finally { clearTimeout(permissionTimer); }
        if (!acquired) return;
        if (!active || mine !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        stream.getAudioTracks().forEach(track => { track.onended = () => { if (active) fail('麦克风已断开，请重新连接。'); }; });
        context = new (env.AudioContext || env.webkitAudioContext)(); await context.resume();
        if (!active || mine !== generation) return;
        analyser = context.createAnalyser(); analyser.fftSize = 1024;
        source = context.createMediaStreamSource(stream); source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        monitor = setInterval(() => {
          if (!active || muted || ['transcribing', 'error', 'connecting'].includes(phase)) return;
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          const vad = detector.sample(rms, env.performance.now()); publish({ level: Math.min(1, rms * 10), hasSpeech: vad.hasSpeech });
          // Barge-in cancels an audible reply only. Background noise while the model
          // is thinking must not cancel the turn before the first spoken word.
          if (vad.hasSpeech && !suppressed && phase === 'speaking') interrupt();
          if (vad.finished && !replying && !(speaking && phase === 'thinking')) sendTurn();
          else if (vad.finished) detector.reset();
          else if (!vad.hasSpeech && env.performance.now() - recordedAt > 20000) { discardRecording(); listen(); }
        }, 50);
        if (replying) { setPhase('thinking'); listen(); }
        else { enqueue('你好，我是你的 FDE 教练。今天想练习什么行业、什么客户角色？'); playNext(); }
      } catch (err) { if (active && mine === generation) fail(err.name === 'NotAllowedError' ? '无法访问麦克风，请在系统设置中允许本应用使用麦克风。' : err.name === 'NotFoundError' ? '未找到麦克风，请连接麦克风或带麦克风的耳机后重试。' : err.name === 'NotReadableError' ? '麦克风暂时无法使用，请检查是否被其他应用占用。' : err.message); }
    },
    updateReply({ key, content = '', streaming = false, cancelled = false }) {
      if (!active || suppressed || phase === 'error') return;
      replying = streaming;
      // Skip saved history; only the current live turn is sent for speech synthesis.
      if (key && key !== responseKey) { responseKey = key; consumed = 0; }
      if (key && !cancelled) {
        const pending = content.slice(consumed); let end = 0;
        for (const match of pending.matchAll(/[。！？!?；;\n]+/g)) end = match.index + match[0].length;
        if (!streaming) end = pending.length;
        if (!end && pending.length >= 100) end = 100;
        if (end) { enqueue(pending.slice(0, end)); consumed += end; }
      }
      if (!['connecting', 'error', 'transcribing'].includes(phase)) playNext();
    },
    toggleMute() {
      muted = !muted;
      if (muted) { discardRecording(); stream?.getAudioTracks().forEach(track => { track.enabled = false; }); }
      else listen();
      if (!speaking && !replying && phase !== 'error' && phase !== 'transcribing') setPhase(muted ? 'muted' : 'listening'); else publish();
    },
    skipSpeech() { interrupt(); },
    retry() { if (active) { this.stop(); return this.start(); } },
    sendTurn,
    stop() {
      active = false; ++generation; for (const cancel of pendingWaits) cancel(); pendingWaits.clear(); clearInterval(monitor); discardRecording(); stopPlayback(); synth?.close?.();
      replying = false; suppressed = true;
      source?.disconnect(); source = null; stream?.getTracks().forEach(track => track.stop()); stream = null;
      context?.close().catch(() => {}); context = null; error = ''; muted = false; setPhase('idle');
    },
  };
}
