<template>
  <div class="scenario-room">
    <header class="room-header"><button :disabled="busy" @click="$emit('close')"><i class="fa-solid fa-arrow-left"></i>场景库</button><div><span>{{ scene.category }}</span><h2>{{ scene.title }}</h2></div><span class="room-stage">{{ reviewVisible ? '03 / 证据复盘' : started ? '02 / 客户会谈' : '01 / 会前简报' }}</span></header>
    <p v-if="error" class="room-error" role="alert">{{ error }}<button @click="error = ''" aria-label="关闭错误提示">×</button></p>
    <div v-if="loading" class="room-loading" role="status">正在读取练习记录…</div>
    <main v-else-if="!started" class="briefing-scroll">
      <section class="briefing-hero"><span class="briefing-badge">虚构案例 · {{ scene.difficulty }} · {{ scene.duration }}</span><h1>{{ scene.title }}</h1><p>{{ scene.setting }}</p><div class="briefing-customer"><i :class="scene.icon"></i><span>今天的客户<strong>{{ scene.customer }}</strong></span></div></section>
      <div class="briefing-grid"><section class="briefing-card"><h3>你的身份与任务</h3><p>{{ scene.identity }}</p><blockquote>{{ scene.mission }}</blockquote><h3>本次练习目标</h3><ul><li v-for="item in scene.objectives" :key="item">{{ item }}</li></ul></section><section class="briefing-card"><h3>会前已知信息</h3><ul><li v-for="item in scene.known" :key="item">{{ item }}</li></ul><p class="briefing-note">客户的真实顾虑和细节，需要通过你的提问发现。</p></section></div>
      <section class="briefing-materials"><h3>会前材料 <small>点击展开阅读</small></h3><details v-for="material in scene.materials" :key="material.title"><summary><i class="fa-regular fa-file-lines"></i><span>{{ material.title }}</span><small>{{ material.type }}</small></summary><p>{{ material.content }}</p></details></section>
      <footer class="briefing-footer"><span>先读简报，再进入客户角色。随时可以暂停并查看复盘。</span><button class="room-primary" :disabled="busy" @click="begin">{{ busy ? '正在准备…' : '进入会谈' }}<i class="fa-solid fa-arrow-right"></i></button></footer>
    </main>
    <template v-else-if="reviewVisible && review">
      <main class="review-scroll"><section class="review-overview"><div><span>本次练习复盘</span><h1>{{ outcomes[review.outcome] }}</h1><p>{{ review.summary }}</p><p>{{ review.outcomeReason }}</p></div><div class="review-total"><strong>{{ review.total ?? '—' }}</strong><span>/ 5</span><small>适用维度加权评分</small></div></section>
        <div class="briefing-grid"><section class="briefing-card"><h3>你已经发现</h3><ul><li v-for="item in review.discovered" :key="item">{{ item }}</li></ul><p v-if="!review.discovered.length">暂未确认具体事实。</p></section><section class="briefing-card"><h3>值得继续追问</h3><ul><li v-for="item in review.missed" :key="item">{{ item }}</li></ul></section></div>
        <section class="review-dimensions"><article v-for="score in review.scores" :key="score.dimension"><div><h3>{{ score.dimension }}</h3><span>{{ score.score === null ? '本场未考察 / 证据不足' : `${score.score} / 5` }}</span></div><blockquote v-if="score.evidence">“{{ score.evidence }}”</blockquote><p>{{ score.reason }}</p><p v-if="score.suggestion" class="review-suggestion">可以这样试：{{ score.suggestion }}</p><button v-if="evidenceIndex(score.evidence) >= 0" :disabled="busy" @click="retryAt(evidenceIndex(score.evidence))"><i class="fa-solid fa-code-branch"></i>从这次提问前重练</button></article></section>
        <section class="briefing-card"><h3>下一步</h3><p>{{ review.nextStep }}</p><small>评分仅依据本次对话；未考察项不计入总分，不代表实际项目能力认证。</small></section>
      </main><footer class="review-footer"><button :disabled="busy" @click="reviewVisible = false">返回会谈</button><button class="room-primary" :disabled="busy" @click="retryAt(1)">{{ busy ? '正在创建…' : '重新练习本场景' }}</button></footer>
    </template>
    <template v-else>
      <div class="room-meeting">
        <aside class="meeting-context"><span class="briefing-badge">本次会谈任务</span><h3>{{ scene.customer }}</h3><p>{{ scene.mission }}</p><h4>练习目标</h4><ul><li v-for="item in scene.objectives" :key="item">{{ item }}</li></ul><details><summary>查看会前材料</summary><article v-for="material in scene.materials" :key="material.title"><strong>{{ material.title }}</strong><p>{{ material.content }}</p></article></details><p class="meeting-round">已练习 {{ turns }} 次提问</p></aside>
        <div class="meeting-conversation"><div ref="transcriptEl" class="meeting-transcript" aria-live="polite"><div class="meeting-start">虚构客户演练 · {{ scene.focus }}</div><article v-for="(message, index) in transcript" :key="index" :class="['meeting-message', message.role]" :data-turn="index"><span>{{ message.role === 'user' ? '你 · FDE 项目经理' : scene.customer }}</span><p>{{ message.content || (busy ? '客户正在回应…' : '本轮未完成') }}</p><button v-if="message.role === 'user' && !busy" class="retry-turn" @click="retryAt(index)"><i class="fa-solid fa-code-branch"></i>从这里重练</button></article></div>
          <form class="meeting-composer" @submit.prevent="sendDraft"><textarea ref="draftEl" v-model="draft" :disabled="busy" rows="3" aria-label="你的客户沟通提问" placeholder="承接客户刚才的话，问一个具体问题…" v-enter-send="sendDraft"></textarea><div><ModelSelector minimal :models="availableModels" :current="currentModel" @change="$emit('change-model', $event)" /><button v-if="failedTurn" type="button" :disabled="busy" @click="requestReply">重试本轮回复</button><button v-if="busy" type="button" @click="cancel">停止</button><button v-else type="submit" class="room-primary" :disabled="!draft.trim() || failedTurn">发送<i class="fa-solid fa-arrow-up"></i></button></div></form>
        </div>
      </div>
      <footer class="meeting-footer"><span>{{ review && reviewAt !== transcript.length ? '会谈已有新内容，可重新生成复盘' : '每次提问都会影响客户的回应与信息披露。' }}</span><button v-if="review" :disabled="busy" @click="reviewVisible = true">查看上次复盘</button><button :disabled="busy || !turns || failedTurn" @click="generateReview">{{ busy && reviewing ? '正在复盘…' : '生成证据复盘' }}<i class="fa-solid fa-arrow-right"></i></button></footer>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import ModelSelector from './ModelSelector.vue';
const props = defineProps({ scene: { type: Object, required: true }, sessionSlug: { type: String, default: '' }, availableModels: { type: Array, default: () => [] }, currentModel: { type: String, default: '' } });
const emit = defineEmits(['close', 'created', 'updated', 'busy', 'change-model']);
const api = window.api.hermes;
const slug = ref(props.sessionSlug), transcript = ref([]), draft = ref(''), started = ref(false), loading = ref(false), busy = ref(false), error = ref(''), review = ref(null), reviewAt = ref(0), reviewVisible = ref(false), reviewing = ref(false), failedTurn = ref(false);
const transcriptEl = ref(null), draftEl = ref(null);
const turns = computed(() => transcript.value.filter(m => m.role === 'user').length);
const outcomes = { progress: '取得推进', partial: '部分推进', stalled: '暂时停滞' };
let requestId = '', disposed = false, unsubscribe;
const setBusy = value => { busy.value = value; emit('busy', value); };
const checked = (result, fallback) => { if (!result || result.success === false) throw Error(result?.error || fallback); return result; };
const message = (role, content) => ({ role, content, tab: 'requirement', timestamp: new Date().toISOString() });
const persist = async m => checked(await api.saveMessage(slug.value, { ...m }), '保存练习记录失败');
const scroll = async () => { await nextTick(); if (transcriptEl.value) transcriptEl.value.scrollTop = transcriptEl.value.scrollHeight; };

async function createSession(history, parent = null) {
  const nextSlug = `coach-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const name = `${props.scene.title}${parent ? ' · 重练' : ''}`;
  checked(await api.createProject({ slug: nextSlug, name, requirement: props.scene.mission, projectType: 'fde-coach', skillId: 'fde-coach', voiceOnly: true }), '创建练习失败');
  checked(await api.updateProjectMeta(nextSlug, { coachScenario: { id: props.scene.id, version: props.scene.version }, ...(parent ? { coachParent: parent } : {}) }), '保存场景设定失败');
  for (const m of history) checked(await api.saveMessage(nextSlug, { ...m }), '保存练习起点失败');
  slug.value = nextSlug;
  emit('created', { slug: nextSlug, name, coachScenario: { id: props.scene.id, version: props.scene.version } });
}
async function begin() {
  if (busy.value) return;
  error.value = ''; setBusy(true);
  try { const opening = message('assistant', props.scene.opening); await createSession([opening]); transcript.value = [opening]; started.value = true; await scroll(); }
  catch (e) { error.value = e.message; }
  finally { setBusy(false); }
}
async function sendDraft() {
  const value = draft.value.trim();
  if (!value || busy.value || failedTurn.value) return;
  if (/^(复盘|打分|点评|结束练习|生成复盘)[。！!\s]*$/.test(value)) { draft.value = ''; await generateReview(); return; }
  error.value = ''; setBusy(true);
  try { const item = message('user', value); await persist(item); transcript.value.push(item); draft.value = ''; failedTurn.value = true; }
  catch (e) { error.value = e.message; setBusy(false); return; }
  setBusy(false); await requestReply();
}
async function requestReply() {
  if (busy.value || !failedTurn.value) return;
  setBusy(true); error.value = '';
  const id = `scene-${Date.now()}`; requestId = id;
  const index = transcript.value.length;
  transcript.value.push(message('assistant', '')); await scroll();
  const detach = api.onCoachReply(event => { if (requestId !== id || event.id !== id || disposed) return; transcript.value[index].content += event.text; scroll(); });
  unsubscribe = detach;
  try {
    const result = checked(await api.coachReply(id, [], props.currentModel, 'text', { slug: slug.value }), '客户回复失败');
    if (requestId !== id || disposed) return;
    transcript.value[index].content = result.content;
    await persist(transcript.value[index]); failedTurn.value = false; emit('updated');
  } catch (e) {
    if (requestId === id && !disposed) { transcript.value.splice(index); error.value = `${e.message}。你的提问已保存，可重试本轮。`; }
  } finally { detach?.(); if (unsubscribe === detach) unsubscribe = null; if (requestId === id) { requestId = ''; setBusy(false); await scroll(); draftEl.value?.focus(); } }
}
async function generateReview() {
  if (busy.value || !turns.value || failedTurn.value) return;
  error.value = ''; setBusy(true); reviewing.value = true;
  const id = `review-${Date.now()}`; requestId = id;
  try {
    const result = checked(await api.coachReply(id, [], props.currentModel, 'text', { slug: slug.value, action: 'review' }), '复盘失败');
    if (requestId !== id || disposed) return;
    const snapshot = { ...result.review, transcriptLength: transcript.value.length, createdAt: new Date().toISOString() };
    checked(await api.updateProjectMeta(slug.value, { coachReview: snapshot }), '复盘保存失败');
    review.value = snapshot; reviewAt.value = snapshot.transcriptLength; reviewVisible.value = true; emit('updated');
  } catch (e) { if (requestId === id && !disposed) error.value = e.message; }
  finally { if (requestId === id) { requestId = ''; reviewing.value = false; setBusy(false); } }
}
function evidenceIndex(evidence) { return evidence ? transcript.value.findIndex(m => m.role === 'user' && m.content.includes(evidence)) : -1; }
async function retryAt(index) {
  if (busy.value) return;
  error.value = ''; setBusy(true);
  try {
    const parent = { slug: slug.value, beforeMessage: index };
    const history = transcript.value.slice(0, index).map(m => ({ ...m }));
    const retryDraft = transcript.value[index]?.role === 'user' ? transcript.value[index].content : '';
    await createSession(history, parent);
    transcript.value = history; draft.value = retryDraft; failedTurn.value = false; review.value = null; reviewVisible.value = false; reviewAt.value = 0; await scroll();
  } catch (e) { error.value = e.message; }
  finally { setBusy(false); await nextTick(); draftEl.value?.focus(); }
}
async function cancel() {
  const id = requestId; if (!id) return;
  requestId = ''; unsubscribe?.(); unsubscribe = null;
  if (!reviewing.value && transcript.value.at(-1)?.role === 'assistant') transcript.value.pop();
  reviewing.value = false; setBusy(false);
  try { await api.cancelCoachReply(id); } catch (e) { error.value = e.message; }
}
onMounted(async () => {
  if (!slug.value) return;
  loading.value = true;
  try {
    const data = checked(await api.loadProject(slug.value, { readOnly: true }), '读取练习失败');
    if (disposed) return;
    transcript.value = (data.messages || []).filter(m => ['user', 'assistant'].includes(m.role) && !m.systemNotice && !m.coachReview);
    started.value = transcript.value.length > 0; failedTurn.value = transcript.value.at(-1)?.role === 'user';
    review.value = data.coachReview || null; reviewAt.value = review.value?.transcriptLength || 0;
    if (failedTurn.value) error.value = '上次提问尚未完成回复，可以重试本轮。';
    await scroll();
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
});
onBeforeUnmount(() => { disposed = true; unsubscribe?.(); if (requestId) api.cancelCoachReply(requestId).catch(() => {}); emit('busy', false); });
</script>

<style scoped>
.scenario-room{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;background:#f4f6fa;color:#2a3850}.room-header{display:flex;align-items:center;gap:20px;padding:20px 28px;border-bottom:1px solid #e2e8f2;background:#fff;flex-shrink:0}.room-header>div{min-width:0}.room-header h2{font-size:17px;margin:4px 0 0;font-weight:600}.room-header span{font-size:11px;color:#8899b0}.room-header .room-stage{margin-left:auto;white-space:nowrap}.scenario-room button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #dce4f2;background:#fff;border-radius:8px;padding:9px 13px;font-size:12px;color:#617694;cursor:pointer}.scenario-room button:disabled{opacity:.5;cursor:default}.scenario-room button:focus-visible,.scenario-room summary:focus-visible{outline:2px solid #5577e1;outline-offset:3px}.scenario-room .room-primary{background:#4f6fe9;border-color:#4f6fe9;color:#fff;padding:11px 19px}.room-error{display:flex;align-items:center;justify-content:space-between;margin:10px 24px;padding:10px 16px;border:1px solid #ead9c2;background:#fff7ec;color:#906630;border-radius:9px;font-size:12px}.room-error button{border:0;background:none;padding:2px 6px;color:inherit}.room-loading{padding:60px;text-align:center;color:#8899af}.briefing-scroll,.review-scroll{overflow:auto;flex:1;padding:28px;min-height:0}.briefing-scroll>*,.review-scroll>*{max-width:1040px;margin-left:auto;margin-right:auto}.briefing-hero{position:relative;padding:28px;background:linear-gradient(120deg,#e6eefc,#eff2fd);border:1px solid #dfe7f5;border-radius:17px;margin-bottom:20px}.briefing-badge{font-size:11px;color:#7b91b4}.briefing-hero h1{font-size:28px;font-weight:600;margin:12px 0}.briefing-hero p{font-size:13px;color:#6f819a;max-width:720px;line-height:1.9}.briefing-customer{display:flex;align-items:center;gap:12px;margin-top:20px;color:#6b85bb}.briefing-customer>i{font-size:25px}.briefing-customer span{display:flex;flex-direction:column;gap:5px;font-size:10px}.briefing-customer strong{font-size:13px;font-weight:500;color:#4f6688}.briefing-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:18px;margin-bottom:20px}.briefing-card{padding:24px;background:#fff;border:1px solid #e1e7f0;border-radius:13px}.scenario-room h3{font-size:15px;font-weight:600;margin:0 0 12px}.briefing-card p,.briefing-card li{font-size:13px;color:#72829b;line-height:1.9}.briefing-card ul,.meeting-context ul{padding-left:18px;margin:12px 0}.briefing-card li{margin-bottom:8px}.briefing-card blockquote{margin:16px 0 22px;padding:14px;background:#f2f5fc;border-left:3px solid #8da8df;font-size:13px;line-height:1.8;color:#587399}.briefing-card .briefing-note{font-size:11px;color:#9aa6b8;margin-top:25px}.briefing-materials{margin-bottom:24px}.briefing-materials h3 small{font-size:11px;font-weight:400;color:#98a5b8;margin-left:10px}.briefing-materials details{border:1px solid #e2e8f1;background:#fff;border-radius:10px;margin-top:10px}.briefing-materials summary{display:flex;gap:10px;align-items:center;padding:16px;cursor:pointer;font-size:13px;color:#637b9e}.briefing-materials summary small{margin-left:auto;color:#9ba8ba;font-size:11px}.briefing-materials details p{padding:0 20px 20px;white-space:pre-wrap;line-height:1.9;font-size:12px;color:#6d809c}.briefing-footer{display:flex;align-items:center;justify-content:space-between;gap:18px}.briefing-footer>span{font-size:12px;color:#8b9bb0}.room-meeting{display:flex;flex:1;min-height:0}.meeting-context{width:240px;flex-shrink:0;padding:24px 20px;border-right:1px solid #e4e9f1;overflow:auto;background:#f9fafd}.meeting-context h3{margin-top:15px;font-size:14px}.meeting-context h4{font-size:12px;margin-top:23px}.meeting-context p,.meeting-context li{font-size:12px;color:#788ba5;line-height:1.9}.meeting-context li{margin-bottom:9px}.meeting-context summary{font-size:12px;color:#6c86b0;cursor:pointer;margin:24px 0 12px}.meeting-context article{border-bottom:1px solid #e2e8f2;padding:12px 0}.meeting-context article strong{font-size:12px}.meeting-context article p{white-space:pre-wrap}.meeting-context .meeting-round{margin-top:25px;font-size:11px}.meeting-conversation{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column}.meeting-transcript{flex:1;overflow:auto;min-height:0;padding:24px 32px}.meeting-start{text-align:center;font-size:11px;color:#a0adbf;margin-bottom:30px}.meeting-message{max-width:780px;margin:0 auto 24px}.meeting-message>span{font-size:11px;color:#7f91aa}.meeting-message p{white-space:pre-wrap;font-size:14px;line-height:1.95;margin:8px 0;color:#34435c}.meeting-message.user{text-align:right}.meeting-message.user p{display:inline-block;text-align:left;max-width:85%;background:#e9effc;padding:12px 18px;border-radius:13px}.meeting-message.user>span{display:block}.scenario-room .retry-turn{display:flex;margin-left:auto;border:0;background:none;font-size:10px;padding:2px 0;color:#92a2ba}.meeting-composer{margin:0 24px 18px;padding:15px 18px;background:#fff;border:1px solid #d8e2f1;border-radius:14px;box-shadow:0 8px 24px #5875b50a}.meeting-composer textarea{width:100%;resize:vertical;max-height:180px;min-height:64px;border:0;outline:none;background:transparent;color:#415673;font-size:14px;line-height:1.8}.meeting-composer textarea::placeholder{color:#9caabe}.meeting-composer>div{display:flex;align-items:center;gap:10px;justify-content:flex-end}.meeting-composer>div>:first-child{margin-right:auto}.meeting-footer,.review-footer{display:flex;align-items:center;gap:12px;padding:12px 24px;border-top:1px solid #e4e9f1;background:#fafbfd;flex-shrink:0}.meeting-footer>span{font-size:11px;color:#8b9ab1;margin-right:auto}.review-footer{justify-content:flex-end}.review-overview{display:flex;gap:30px;justify-content:space-between;padding:28px;background:linear-gradient(120deg,#e7eefc,#f0f3fb);border-radius:16px;margin-bottom:20px}.review-overview>div:first-child{max-width:740px}.review-overview span{font-size:12px;color:#7a90af}.review-overview h1{font-size:27px;font-weight:600;margin:8px 0 16px}.review-overview p{font-size:13px;color:#6b819e;line-height:1.9}.review-total{flex-shrink:0;align-self:center;text-align:center}.review-total strong{font-size:43px;color:#5577d8}.review-total small{display:block;font-size:10px;color:#97a6bc;margin-top:5px}.review-dimensions{display:grid;gap:14px;margin-bottom:20px}.review-dimensions article{background:#fff;border:1px solid #e0e7f2;padding:22px;border-radius:12px}.review-dimensions article>div{display:flex;justify-content:space-between;gap:15px}.review-dimensions article>div span{font-size:12px;color:#7690b7}.review-dimensions blockquote{padding:12px 16px;border-left:3px solid #a4b9e7;background:#f6f8fc;color:#5f779b;font-size:13px;line-height:1.8}.review-dimensions p{font-size:13px;line-height:1.9;color:#798ca6;margin:12px 0}.review-dimensions .review-suggestion{color:#5977a5}.briefing-card small{display:block;margin-top:12px;font-size:11px;color:#96a5b9}
@media(max-width:1150px){.meeting-context{width:200px;padding:18px 15px}.room-header{padding:16px 20px;gap:12px}.room-header h2{font-size:15px}.meeting-transcript{padding:20px}.briefing-scroll,.review-scroll{padding:20px}}
@media(max-width:850px){.briefing-grid{grid-template-columns:1fr}.room-header .room-stage{display:none}.meeting-context{display:none}.briefing-hero h1{font-size:23px}.meeting-footer{flex-wrap:wrap}.meeting-footer>span{width:100%}.briefing-footer{align-items:flex-start;flex-direction:column}.review-overview{padding:20px;gap:14px}.review-total strong{font-size:30px}.meeting-composer{margin:0 14px 12px}.room-header button{padding:8px;white-space:nowrap}}
</style>
