<template>
  <section v-if="state.active" class="coach-voice" :class="{ 'is-collapsed': collapsed }" aria-label="FDE 教练语音对话" @keydown.esc.stop.prevent="endCall">
    <header>
      <span><i class="fa-solid fa-headset" aria-hidden="true"></i> FDE 教练 · 语音对话</span>
      <button type="button" @click="collapsed = !collapsed" :aria-label="collapsed ? '展开语音对话' : '收起语音对话'" :title="collapsed ? '展开' : '收起'"><i class="fa-solid" :class="collapsed ? 'fa-expand' : 'fa-minus'" aria-hidden="true"></i></button>
    </header>
    <div v-if="!collapsed" class="voice-body">
      <div class="voice-orb" :class="`voice-orb--${state.phase}`" :style="{ '--voice-level': state.level || 0 }" aria-hidden="true"><img :src="coachAvatar" alt="" /></div>
      <p class="voice-provider">MiniMax · 自然语音</p>
      <h2 role="status" aria-live="polite">{{ status }}</h2>
      <p v-if="state.error" class="voice-error">{{ state.error }}</p>
      <p v-else class="voice-hint">{{ state.phase === 'listening' ? '直接说话，停顿后自动发送' : state.phase === 'speaking' ? '可以直接插话，打断教练' : '对话会保存在陪练记录中' }}</p>
      <div class="voice-caption"><span>{{ state.phase === 'speaking' || state.phase === 'thinking' ? '教练' : '你' }}</span><p>{{ caption || '告诉我你想练习的行业、客户角色和场景。' }}</p></div>
      <ThinkingSummary v-if="lastAnswer" class="voice-summary" :message="lastAnswer" :busy="streaming" />
      <div v-if="state.error" class="voice-recovery"><button type="button" class="voice-retry" @click="retry" :disabled="previewing">重新连接</button><button type="button" class="voice-retry" @click="previewVoice" :disabled="previewing">{{ previewing ? '正在试听…' : '试听教练声音' }}</button></div>
      <button v-else-if="state.phase === 'listening'" type="button" class="voice-submit" @click="conversation.sendTurn()">说完了，发送</button>
      <button v-else-if="state.phase === 'speaking'" type="button" class="voice-submit" @click="conversation.skipSpeech()">打断教练</button>
    </div>
    <footer>
      <span v-if="collapsed" class="voice-mini-status" role="status">{{ status }}</span>
      <button type="button" :aria-pressed="state.muted" :aria-label="state.muted ? '取消静音' : '麦克风静音'" :title="state.muted ? '取消静音' : '静音'" @click="conversation.toggleMute()"><i class="fa-solid" :class="state.muted ? 'fa-microphone-slash' : 'fa-microphone'" aria-hidden="true"></i><span v-if="!collapsed">{{ state.muted ? '已静音' : '静音' }}</span></button>
      <button type="button" class="voice-end" aria-label="结束语音对话" @click="endCall"><i class="fa-solid fa-phone-slash" aria-hidden="true"></i><span v-if="!collapsed">结束</span></button>
    </footer>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import coachAvatar from '@/assets/fde-coach-avatar.png';
import ThinkingSummary from './ThinkingSummary.vue';
import { createCoachSpeechPlayer } from './coach-speech-player.mjs';
import { createVoiceConversation, spokenText } from './voice-conversation.mjs';
const props = defineProps({ messages: { type: Array, default: () => [] }, streaming: Boolean, slug: String, send: { type: Function, required: true }, interrupt: Function });
const emit = defineEmits(['active']);
const state = ref({ active: false, muted: false, phase: 'idle', level: 0 });
const collapsed = ref(false), lastTranscript = ref(''), spokenCaption = ref('');
const statuses = { connecting: '正在连接语音…', listening: '我在听', transcribing: '正在识别你说的话…', thinking: '教练正在回应…', speaking: '教练正在说话', muted: '麦克风已静音', error: '语音连接需要重试', waiting: '准备听你说' };
const previewing = ref(false);
const status = computed(() => previewing.value ? '正在试听教练声音' : statuses[state.value.phase] || '语音对话');
const lastAnswer = computed(() => { const last = props.messages.at(-1); return last?.role === 'assistant' && !last.systemNotice ? last : null; });
const caption = computed(() => state.value.phase === 'thinking' && !spokenCaption.value ? lastTranscript.value : ['speaking', 'thinking'].includes(state.value.phase) ? (spokenCaption.value || spokenText(lastAnswer.value?.content).slice(-240)) : lastTranscript.value);
const speechOutput = createCoachSpeechPlayer({ api: window.api.hermes, onText: text => { spokenCaption.value = text; } });
const conversation = createVoiceConversation({
  speechOutput,
  onInterrupt: () => props.interrupt?.(),
  onState: update => { state.value = { ...state.value, ...update }; emit('active', update.active); },
  onTranscript: text => { lastTranscript.value = text; spokenCaption.value = ''; },
  onSend: text => props.send(text),
  transcribe: (data, mime) => window.api.hermes.transcribe(data, mime),
});
watch(() => [lastAnswer.value?.streamId, lastAnswer.value?.content, props.streaming, lastAnswer.value?.cancelled], () => {
  conversation.updateReply({ key: lastAnswer.value?.streamId || '', content: lastAnswer.value?.content || '', streaming: props.streaming, cancelled: lastAnswer.value?.cancelled });
});
// Switching pages leaves the call running; selecting another conversation ends it.
watch(() => props.slug, (slug, old) => { if (old && slug !== old) endCall(); });
function start() { collapsed.value = false; lastTranscript.value = ''; spokenCaption.value = ''; return conversation.start({ replying: props.streaming }); }
function endCall() { previewing.value = false; conversation.stop(); }
function retry() { return conversation.retry(); }
async function previewVoice() {
  previewing.value = true;
  try {
    await speechOutput.prepare();
    if (!previewing.value) return;
    await speechOutput.speak({ text: '你好，我是你的 FDE 教练。今天我们练习需求沟通，你可以随时打断我。', onend: () => { previewing.value = false; }, onerror: event => { previewing.value = false; state.value.error = event.message; } });
  } catch (err) { previewing.value = false; state.value.error = err.message; }
}
onBeforeUnmount(endCall);
defineExpose({ start, stop: endCall });
</script>

<style scoped>
.coach-voice { position:absolute; inset:16px; z-index:40; display:flex; flex-direction:column; max-width:760px; margin:auto; border:1px solid #dce6f5; border-radius:24px; background:#fff; box-shadow:0 20px 70px #18386420; color:#1e293b; }
.coach-voice header { display:flex; align-items:center; justify-content:space-between; padding:16px 24px; border-bottom:1px solid #edf2f7; font-size:14px; font-weight:600; }
.coach-voice header i { color:#2563eb; }
.coach-voice button { cursor:pointer; }
.coach-voice button:focus-visible { outline:2px solid #2563eb; outline-offset:3px; }
.coach-voice header button { display:grid; place-items:center; width:36px; height:36px; border-radius:10px; background:#f4f7fc; }
.voice-body { display:flex; flex:1; min-height:0; flex-direction:column; align-items:center; justify-content:center; padding:24px; overflow:auto; }
.voice-orb { display:grid; place-items:center; width:clamp(100px,20vh,160px); aspect-ratio:1; flex:none; border-radius:50%; background:#eaf3ff; box-shadow:0 0 0 14px #f1f6ff; transition:box-shadow .2s; }
.voice-orb img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
.voice-orb--listening { box-shadow:0 0 0 calc(10px + var(--voice-level) * 25px) #e1edff; }
.voice-orb--speaking { animation:voice-breathe 1.6s ease-in-out infinite; }
.voice-provider { margin-top:24px; font-size:12px; color:#64748b; }
.voice-body h2 { margin-top:8px; font-size:22px; font-weight:600; }
.voice-hint { margin-top:8px; font-size:13px; color:#64748b; }
.voice-error { margin-top:12px; max-width:420px; font-size:14px; color:#b91c1c; text-align:center; }
.voice-caption { width:min(100%,500px); min-height:76px; max-height:130px; overflow:auto; margin-top:24px; padding:14px 18px; border-radius:16px; background:#f8fafc; }
.voice-caption span { font-size:11px; color:#64748b; }
.voice-caption p { margin-top:4px; font-size:15px; line-height:1.65; }
.voice-summary{width:min(100%,500px);margin-top:8px;}
.voice-recovery { display:flex; gap:12px; }
.voice-retry:disabled { opacity:.5; cursor:default; }
.voice-submit,.voice-retry { padding:10px 18px; margin-top:16px; font-size:13px; border:1px solid #dce6f5; border-radius:20px; color:#2563eb; }
.coach-voice footer { display:flex; align-items:center; justify-content:center; gap:24px; padding:20px; }
.coach-voice footer button { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; width:64px; min-height:64px; border-radius:18px; background:#f1f5f9; font-size:12px; }
.coach-voice footer button i { font-size:19px; }
.coach-voice footer button[aria-pressed=true] { background:#fff1f2; color:#be123c; }
.coach-voice footer .voice-end { background:#fef2f2; color:#dc2626; }
.coach-voice.is-collapsed { inset:auto 18px 18px auto; width:340px; border-radius:18px; }
.is-collapsed header { padding:10px 14px; }
.is-collapsed footer { padding:10px 14px; gap:10px; }
.is-collapsed footer button { width:40px; min-height:40px; border-radius:50%; }
.voice-mini-status { margin-right:auto; font-size:12px; color:#64748b; }
@keyframes voice-breathe { 50% { box-shadow:0 0 0 22px #eaf3ff; } }
@media(prefers-reduced-motion:reduce) { .voice-orb--speaking { animation:none; } }
@media(max-height:650px) { .voice-body { padding:16px; }.voice-orb { width:90px; }.voice-body h2 { margin-top:20px; }.voice-caption { margin-top:12px; } }
</style>
