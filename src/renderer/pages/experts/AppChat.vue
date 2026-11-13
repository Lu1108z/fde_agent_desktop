<template>
  <div class="ac-page h-full min-h-0 flex flex-col">
    <!-- 首页按窗口高度等比缩放并上下居中；进入对话后这两层不参与布局 -->
    <div ref="landingEl" :class="inChat ? 'contents' : 'ac-landing'">
    <div :class="inChat ? 'contents' : 'ac-stage'" :style="inChat ? null : stageStyle">
    <!-- ── 顶部：数字人 + 应用切换 ────────────────────────── -->
    <header class="ac-head" :class="{ 'ac-head--compact': inChat }">
      <button class="ac-back" aria-label="返回应用广场" title="返回应用广场" @click="router.push('/apps')"><i class="fa-solid fa-arrow-left"></i></button>
      <AppAvatar :app="app" :size="inChat ? 44 : 88" />
      <div class="min-w-0 flex-1">
        <div class="relative inline-block" ref="switcherRef">
          <button class="ac-name" :aria-expanded="switcherOpen" aria-haspopup="listbox" @click="switcherOpen = !switcherOpen">
            {{ app?.name || '加载中…' }}<i class="fa-solid fa-chevron-down" :class="{ 'rotate-180': switcherOpen }"></i>
          </button>
          <div v-if="switcherOpen" class="ac-switcher" role="listbox" aria-label="切换应用">
            <div class="ac-switcher__head">
              <span>工作伙伴</span>
              <button title="去应用广场" aria-label="去应用广场" @click="router.push('/apps')"><i class="fa-solid fa-store"></i></button>
            </div>
            <div class="ac-switcher__list">
              <button
                v-for="item in apps"
                :key="item.id"
                role="option"
                :aria-selected="item.id === app?.id"
                class="ac-switcher__item"
                :class="{ 'ac-switcher__item--on': item.id === app?.id }"
                @click="switchApp(item)"
              >
                <AppAvatar :app="item" :size="30" />
                <span class="flex-1 text-left truncate">{{ item.name }}</span>
                <i v-if="item.id === app?.id" class="fa-solid fa-check"></i>
              </button>
            </div>
          </div>
        </div>
        <p class="ac-intro" :class="{ truncate: inChat }">
          <button v-if="inChat && currentMeta.linkedProject" class="ac-linked" :title="'打开项目：' + linkedProjectName(currentMeta.linkedProject)" @click="router.push(`/projects/${currentMeta.linkedProject}`)"><i class="fa-solid fa-folder-tree"></i>{{ linkedProjectName(currentMeta.linkedProject) }}</button>
          {{ app?.summary || app?.tagline }}
        </p>
      </div>
      <div class="ac-head__actions">
        <span v-if="isStreaming" class="ac-busy"><span></span>正在回复</span>
        <button v-if="inChat" class="ac-link" @click="newChat"><i class="fa-solid fa-plus"></i>新对话</button>
        <button class="ac-link" @click="detailOpen = true">伙伴详情<i class="fa-solid fa-chevron-right text-[11px]"></i></button>
      </div>
    </header>

    <!-- ── 首页：输入框 + 历史任务 ────────────────────────── -->
    <div v-if="!inChat" class="ac-home">
      <div>
        <form class="ac-composer" @submit.prevent="submitDraft">
          <textarea
            ref="draftRef"
            v-model="draft"
            rows="3"
            :placeholder="`输入你的任务，${app?.name || '伙伴'}会帮你完成`"
            v-enter-send="submitDraft"
          ></textarea>
          <div class="ac-composer__bar">
            <div class="flex items-center gap-2 min-w-0">
              <ModelSelector :models="availableModels" :current="currentModel" minimal @change="changeModel" />
              <label class="ac-project" :class="{ 'ac-project--on': linkedProject }" title="关联 FDE 项目后，专家会读取项目需求、交付物和资料，成果自动归档到项目「专家交付」">
                <i class="fa-solid fa-folder-tree"></i>
                <select v-model="linkedProject" aria-label="关联项目">
                  <option value="">不关联项目</option>
                  <option v-for="p in fdeProjects" :key="p.slug" :value="p.slug">{{ p.name || p.slug }}</option>
                </select>
              </label>
            </div>
            <button type="submit" class="ac-send" :disabled="!draft.trim() || !app" aria-label="发送"><i class="fa-solid fa-arrow-up"></i></button>
          </div>
        </form>

        <div v-if="(app?.starters || []).length" class="ac-starters">
          <button v-for="q in app.starters" :key="q" class="ac-starter" @click="send(q)">{{ q }}<i class="fa-solid fa-arrow-right"></i></button>
        </div>

        <section class="ac-tasks">
          <div class="ac-tasks__bar">
            <h2>任务 <span>{{ appSessions.length }}</span></h2>
            <label class="ac-search"><i class="fa-solid fa-magnifying-glass"></i><input v-model="taskKeyword" placeholder="搜索" /></label>
          </div>
          <div class="ac-tasks__list">
          <button v-for="s in visibleSessions" :key="s.slug" class="ac-task" @click="openSession(s)">
            <i class="fa-regular fa-message"></i>
            <span class="flex-1 min-w-0 truncate text-left">{{ s.conversationName || s.name }}</span>
            <span class="ac-task__time">{{ timeLabel(s.lastMessageAt || s.updatedAt || s.createdAt) }}</span>
          </button>
          <div v-if="!visibleSessions.length" class="ac-empty">
            <i class="fa-regular fa-folder-open"></i>
            <p>{{ taskKeyword.trim() ? '没有匹配的任务' : '还没有任务，在上面输入你要做的事开始吧' }}</p>
          </div>
          </div>
        </section>
      </div>
    </div>
    </div>
    </div>

    <!-- ── 对话中 ────────────────────────── -->
    <ChatPanel
      v-if="inChat"
      ref="chatPanelRef"
      reading-mode
      class="flex-1 min-h-0"
      :slug="currentSlug"
      :project-name="app?.name || ''"
      :project-meta="currentMeta"
      :messages="messages"
      :is-streaming="isStreaming"
      :elapsed-sec="elapsedSec"
      :is-loading="messagesLoading"
      :available-models="availableModels"
      :current-model="currentModel"
      @send="(text) => send(text)"
      @send-quick="(text) => send(text)"
      @send-with-attachments="(text, atts) => send(text, atts)"
      @cancel="cancel"
      @change-model="changeModel"
    >
      <template #assistant-avatar><AppAvatar :app="app" :size="40" /></template>
      <template #assistant-footer="{ message }"><KnowledgeReferences v-if="!message.streamId || message.responseFinalized" :message="message" /></template>
    </ChatPanel>

    <!-- ── 伙伴详情 ────────────────────────── -->
    <transition name="ac-fade">
      <div v-if="detailOpen && app" class="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div class="ac-mask absolute inset-0" @click="detailOpen = false"></div>
        <section class="ac-modal" role="dialog" aria-modal="true" :aria-label="app.name">
          <button class="ac-close" aria-label="关闭" @click="detailOpen = false"><i class="fa-solid fa-xmark"></i></button>
          <AppAvatar :app="app" :size="72" />
          <h2 class="text-[22px] font-semibold text-slate-900 mt-4">{{ app.name }}</h2>
          <p class="text-[14px] text-slate-400 mt-1.5 leading-relaxed">{{ app.summary || app.tagline }}</p>
          <template v-if="(app.bestFor || []).length">
            <h4 class="ac-h">擅长领域</h4>
            <div class="flex flex-wrap gap-2"><span v-for="t in app.bestFor" :key="t" class="ac-chip">{{ t }}</span></div>
          </template>
          <template v-if="capabilityLines.length">
            <h4 class="ac-h">能帮你做</h4>
            <ul class="space-y-1.5">
              <li v-for="(line, i) in capabilityLines" :key="i" class="text-[13px] text-slate-600 flex gap-2"><i class="fa-solid fa-check text-[10px] text-blue-500 mt-1.5"></i>{{ line }}</li>
            </ul>
          </template>
          <template v-if="(app.skills || []).length">
            <h4 class="ac-h">内置技能 <span class="font-normal text-slate-400">{{ app.skills.length }}</span></h4>
            <div class="flex flex-wrap gap-2"><span v-for="s in app.skills" :key="s" class="ac-chip"><i class="fa-solid fa-puzzle-piece mr-1.5 text-orange-400"></i>{{ s }}</span></div>
          </template>
        </section>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChatPanel from '@/components/agent/ChatPanel.vue';
import KnowledgeReferences from '@/components/apps/KnowledgeReferences.vue';
import ModelSelector from '@/components/agent/ModelSelector.vue';
import AppAvatar from '@/components/apps/AppAvatar.vue';
import { loadPublishedAiApps, buildAiAppOpeningPrompt, AI_APP_REPLY_STYLE } from '@/data/ai-apps';
import { finalizeResponseSummary, publicToolStep, plainMessage } from '@/data/response-summary.mjs';
import { MessagePlugin } from 'tdesign-vue-next';

const props = defineProps({ appId: { type: String, required: true } });

// 首页画布：高度决定缩放比例，正好一屏；顶部和输入框位置固定，任务多了只在任务列表里滚动
const STAGE_H = 740, MIN_W = 900, MAX_W = 1104, MIN_SCALE = 0.7, MAX_SCALE = 1.35;
const landingEl = ref(null), landingBox = ref({ w: 0, h: 0 });
const stageStyle = computed(() => {
  const { w, h } = landingBox.value;
  if (!w || !h) return {};
  const scale = Math.floor(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(h / STAGE_H, w / MIN_W))) * 100) / 100;
  return { zoom: scale, width: `${Math.min(MAX_W, w / scale)}px`, height: `${h / scale}px` };
});
let landingObserver = null;
const route = useRoute();
const router = useRouter();

// ── 应用 ──
const apps = ref([]);
const app = computed(() => apps.value.find((a) => a.id === props.appId) || null);
const capabilityLines = computed(() => String(app.value?.capabilities || '').split('\n').map((l) => l.replace(/^[-·•]\s*/, '').trim()).filter(Boolean));

const switcherOpen = ref(false);
const switcherRef = ref(null);
const detailOpen = ref(false);
function onDocClick(e) { if (switcherOpen.value && !switcherRef.value?.contains(e.target)) switcherOpen.value = false; }
function onEsc(e) { if (e.key === 'Escape') { switcherOpen.value = false; detailOpen.value = false; } }
function switchApp(item) {
  switcherOpen.value = false;
  if (item.id === props.appId) return;
  if (isStreaming.value) return;
  router.push(`/apps/${item.id}`);
}

// ── 该应用的历史任务 ──
const sessions = ref([]);
const taskKeyword = ref('');
const appSessions = computed(() => sessions.value
  .filter((s) => s.projectType === 'ai-app' && s.aiApp?.id === props.appId && !s.conversationDeletedAt)
  .sort((a, b) => String(b.lastMessageAt || b.updatedAt || b.createdAt || '').localeCompare(String(a.lastMessageAt || a.updatedAt || a.createdAt || ''))));
const visibleSessions = computed(() => {
  const kw = taskKeyword.value.trim().toLowerCase();
  return kw ? appSessions.value.filter((s) => String(s.conversationName || s.name || '').toLowerCase().includes(kw)) : appSessions.value;
});
async function loadSessions() {
  try { sessions.value = await window.api.hermes.listProjects({ kind: 'all' }); } catch { sessions.value = []; }
}
// ── 关联 FDE 项目：专家读取项目上下文，成果归档到项目 deliverables/<专家id>/ ──
const linkedProject = ref('');
const fdeProjects = computed(() => sessions.value.filter((s) => s.projectType === 'fde-project' && !s.conversationDeletedAt));
const linkedProjectName = (slug) => fdeProjects.value.find((p) => p.slug === slug)?.name || '关联项目';
function timeLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  return d.toDateString() === today.toDateString() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ── 模型 ──
const availableModels = ref([]);
const currentModel = ref('');
async function loadModels() {
  try {
    const res = await window.api?.hermes?.listModels?.();
    availableModels.value = res?.models || [];
    if (res?.current && !currentModel.value) currentModel.value = res.current;
  } catch { /* 模型列表拿不到时下拉为空，不影响对话 */ }
}
async function changeModel(id) {
  currentModel.value = id;
  try {
    if (currentSlug.value) await window.api.hermes.setModel(currentSlug.value, id);
    else await window.api.hermes.setConfigModel(id);
  } catch (e) { console.error('Change model failed:', e); }
}

// ── 对话 ──
const chatPanelRef = ref(null);
const draftRef = ref(null);
const draft = ref('');
const currentSlug = ref('');
const currentMeta = ref({});
const messages = ref([]);
const messagesLoading = ref(false);
const isStreaming = ref(false);
const elapsedSec = ref(0);
const inChat = computed(() => !!currentSlug.value || messages.value.length > 0);
let elapsedTimer = null, streamId = null, unsubscribe = null, disposed = false;

const msg = (role, content, extra = {}) => ({ role, content, thinkingSteps: [], thinkingDone: true, expanded: false, typingContent: '', timestamp: '', ...extra });
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function newChat() {
  if (isStreaming.value) return;
  currentSlug.value = '';
  currentMeta.value = {};
  messages.value = [];
  nextTick(() => draftRef.value?.focus());
}

async function openSession(s) {
  if (isStreaming.value) return;
  currentSlug.value = s.slug;
  currentMeta.value = s;
  messages.value = [];
  messagesLoading.value = true;
  try {
    const data = await window.api.hermes.loadProject(s.slug);
    if (disposed || currentSlug.value !== s.slug) return;
    currentMeta.value = data || s;
    // 第一条是隐藏的应用开场提示词，只显示「启动 xx」
    messages.value = (data?.messages || []).map((m) => msg(m.role || 'assistant', m.content || '', {
      timestamp: m.timestamp ? hhmm(new Date(m.timestamp)) : '',
      thinkingSummary: m.thinkingSummary || '',
      thinkingSteps: m.thinkingSteps || [],
      knowledgeSources: m.knowledgeSources || [],
      knowledgeCodes: m.knowledgeCodes || [],
      knowledgeMode: m.knowledgeMode || '',
    }));
  } catch (e) {
    console.error('Load app session failed:', e);
  } finally {
    messagesLoading.value = false;
  }
}

function submitDraft() {
  const text = draft.value.trim();
  if (!text) return;
  draft.value = '';
  send(text);
}

async function send(text, attachments) {
  if (!app.value || isStreaming.value || (!String(text || '').trim() && !attachments?.length)) return;
  const first = !currentSlug.value;
  const history = messages.value.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-6).map((m) => ({ role: m.role, content: String(m.content || '') }));
  messages.value.push(msg('user', text, attachments?.length ? { attachments } : {}));
  isStreaming.value = true;
  elapsedSec.value = 0;
  elapsedTimer = setInterval(() => { elapsedSec.value += 1; }, 1000);
  streamId = String(Date.now());
  messages.value.push(msg('assistant', '', {
    thinkingSteps: [{ text: `${app.value.name}正在处理…`, icon: 'fa-solid fa-wand-magic-sparkles', visible: true }],
    thinkingDone: false, expanded: true, streamId,
  }));
  await nextTick();
  chatPanelRef.value?.scrollToBottom?.();

  try {
    if (first) {
      const target = app.value;
      if (target.preferredModel && target.preferredModel !== currentModel.value) await changeModel(target.preferredModel);
      const slug = `${target.slugPrefix || `app-${target.id}`}-${Date.now()}`;
      const name = String(text).slice(0, 24).replace(/\n/g, ' ').trim() || target.name;
      const aiApp = JSON.parse(JSON.stringify({ ...target, source: target.source || 'builtin' }));
      currentSlug.value = slug;
      const created = await window.api.hermes.createProject({ name, requirement: text, slug, projectType: 'ai-app', aiApp, ...(linkedProject.value ? { linkedProject: linkedProject.value } : {}) });
      currentMeta.value = { ...created, projectType: 'ai-app', aiApp };
    }
    await window.api.hermes.saveMessage(currentSlug.value, { role: 'user', content: text, tab: 'requirement', timestamp: new Date().toISOString() });
    loadSessions();
    const kind = app.value.knowledge;
    const knowledge = kind === 'med' || kind === 'clinical' ? await retrieveBuiltinKnowledge(text, history, kind) : '';
    // 第一轮把应用设定和用户任务一起发给引擎，用户只看到自己的话
    const base = first ? `${buildAiAppOpeningPrompt(app.value)}\n\n---\n用户的第一个任务：${text}\n（有明确任务就直接处理；只有问候则简短回应并问一个具体场景。）` : `${AI_APP_REPLY_STYLE}\n\n用户本轮消息：${text}`;
    const prompt = knowledge ? `${knowledge}\n\n---\n${base}` : base;
    const plain = Array.isArray(attachments) ? attachments.map((a) => ({ type: a.type, name: a.name, media_type: a.media_type, ...(typeof a.text === 'string' ? { text: a.text } : {}), ...(a.data ? { data: a.data } : {}) })) : undefined;
    await window.api.hermes.prompt(currentSlug.value, prompt, plain);
  } catch (e) {
    console.error('App prompt failed:', e);
    const last = messages.value.at(-1);
    if (last?.role === 'assistant' && !last.content) last.content = `发送失败：${e.message || '请稍后重试'}`;
  }
  finish();
}

// 自带知识包的专家（医疗行业专家 med / 临床医学知识专家 clinical）：每轮先检索，结果作为事实依据拼进提示词，出处挂在本轮回答下面
const KNOWLEDGE_KINDS = {
  med: { label: '医疗标准与医保文件', lookup: 'medKnowledge', empty: '医疗知识包缺失，请重新安装' },
  clinical: { label: '疾病百科与临床路径', lookup: 'clinicalKnowledge', empty: '临床知识包缺失，请重新安装' },
};
async function retrieveBuiltinKnowledge(text, history, kind = 'med') {
  const meta = KNOWLEDGE_KINDS[kind] || KNOWLEDGE_KINDS.med;
  const reply = messages.value.at(-1);
  reply.thinkingSteps = [{ text: `正在查阅${meta.label}…`, icon: 'fa-solid fa-book-medical', visible: true }];
  try {
    // 主进程没重启时预加载里还没有这个接口（只刷新了界面）
    if (typeof window.api?.hermes?.[meta.lookup] !== 'function') throw Error('知识库接口未加载，请完全退出应用后重新打开');
    const res = await window.api.hermes[meta.lookup](text, history);
    if (!res?.success) throw Error(res?.error || '知识库暂时无法读取');
    Object.assign(reply, { knowledgeSources: res.sources.map(({ vectorScore, ...s }) => s), knowledgeCodes: res.codes || [], knowledgeMode: res.mode });
    reply.thinkingSteps = [{ text: `已找到 ${new Set(res.sources.map((s) => s.title)).size} 份相关资料，正在作答…`, icon: 'fa-solid fa-book-medical', visible: true }];
    return `${res.context}\n\n回答要求：事实以上述资料为准并标注 [编号]；资料未覆盖的内容明确说「内置资料未覆盖」，不编造条款、编码或数字。`;
  } catch (e) {
    console.error('Builtin knowledge failed:', e);
    const reason = e?.message || '知识库暂时无法读取';
    reply.thinkingSteps = [{ text: `未能查阅内置资料：${reason}`, icon: 'fa-solid fa-triangle-exclamation', visible: true }];
    // 没有资料时模型凭记忆给的病组、编码、数字多半是错的（曾把 J18.900 答成 ES3），这里直接禁止
    return `注意：本轮医疗知识库检索失败（${reason}），没有可引用的资料。回答开头原样说明「本轮未能查阅内置资料：${reason}」。不要给出任何具体的病组编码、项目编码、数据元标识符、条款号、文号或数字，只能解释概念和思路，并请用户处理上述问题后重新提问。`;
  }
}

function finish() {
  isStreaming.value = false;
  clearInterval(elapsedTimer); elapsedTimer = null;
  const last = messages.value.at(-1);
  if (!last || last.role !== 'assistant' || last.responseFinalized) return;
  last.responseFinalized = true;
  last.thinkingDone = true;
  last.expanded = false;
  last.timestamp = hhmm();
  finalizeResponseSummary(last);
  if (last.content && currentSlug.value) {
    window.api.hermes.saveMessage(currentSlug.value, plainMessage({ role: 'assistant', content: last.content, thinkingSummary: last.thinkingSummary, thinkingSteps: last.thinkingSteps.filter((s) => s.kind === 'public-progress'), ...(last.knowledgeSources?.length || last.knowledgeCodes?.length ? { knowledgeSources: last.knowledgeSources, knowledgeCodes: last.knowledgeCodes, knowledgeMode: last.knowledgeMode } : {}), tab: 'requirement', timestamp: new Date().toISOString() }))
      .then((r) => {
        if (r?.archived?.length && currentMeta.value?.linkedProject) MessagePlugin.success(`已把 ${r.archived.length} 个成果文件归档到项目「专家交付」`);
        return loadSessions();
      }).catch((e) => console.error('Save reply failed:', e));
  }
}

async function cancel() {
  if (!currentSlug.value) return;
  try { await window.api.hermes.cancel(currentSlug.value); } catch (e) { console.error('Cancel failed:', e); }
}

function textOf(content) {
  if (Array.isArray(content)) return content.map((c) => c.text || '').join('');
  if (typeof content === 'string') return content;
  return content?.text || '';
}

function onSessionUpdate(data) {
  if (disposed || !isStreaming.value || !currentSlug.value) return;
  if (data?.slug && data.slug !== currentSlug.value) return;
  const update = data?.update || data;
  const type = update?.type || update?.sessionUpdate;
  const last = messages.value.at(-1);
  if (!last || last.role !== 'assistant' || last.streamId !== streamId) return;
  const content = update.content || update.data || '';
  if (type === 'agent_message_chunk') {
    last.content += textOf(content);
    if (last.content.startsWith('⟦系统通知⟧')) { last.systemNotice = true; last.displayContent = last.content.replace(/^⟦系统通知⟧\s*/, ''); }
  } else if (type === 'agent_thought_chunk' || type === 'agent_reasoning') {
    if (!last.thinkingSteps.some((s) => s.kind === 'public-progress' && s.text === '正在整理问题和相关上下文。')) last.thinkingSteps.push({ text: '正在整理问题和相关上下文。', kind: 'public-progress', icon: 'fa-solid fa-book-open' });
  } else if (type === 'tool_call') {
    last.thinkingSteps.push({ text: publicToolStep(update.title || update.toolName || 'tool'), kind: 'public-progress', icon: 'fa-solid fa-wrench', visible: true });
  } else if (type === 'tool_call_update' && (update.status === 'completed' || update.status === 'failed')) {
    const failed = update.status === 'failed';
    last.thinkingSteps.push({ text: publicToolStep(update.title || update.toolName || 'tool', update.status), kind: 'public-progress', icon: failed ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-check', visible: true });
  }
}

// 切换到别的应用：回到该应用首页
watch(() => props.appId, () => { newChat(); taskKeyword.value = ''; detailOpen.value = false; });

onMounted(async () => {
  landingObserver = new ResizeObserver(([entry]) => {
    const { width: w, height: h } = entry.contentRect;
    if (w && h) landingBox.value = { w, h };
  });
  if (landingEl.value) landingObserver.observe(landingEl.value);
  document.addEventListener('click', onDocClick);
  window.addEventListener('keydown', onEsc);
  if (window.api?.hermes?.onSessionUpdate) unsubscribe = window.api.hermes.onSessionUpdate(onSessionUpdate);
  apps.value = await loadPublishedAiApps();
  loadSessions();
  loadModels();
  // 从项目页进入：?project=<slug> 预选关联项目，?session=<slug> 直接打开历史对话
  if (route.query.project) linkedProject.value = String(route.query.project);
  const first = route.query.ask ? String(route.query.ask) : '';
  const open = route.query.session ? String(route.query.session) : '';
  if (route.query.project || first || open) router.replace({ path: route.path });
  if (open) { await loadSessions(); const s = sessions.value.find((x) => x.slug === open); if (s) openSession(s); }
  else if (first) send(first);
  else nextTick(() => draftRef.value?.focus());
});
onUnmounted(() => {
  disposed = true;
  landingObserver?.disconnect();
  document.removeEventListener('click', onDocClick);
  window.removeEventListener('keydown', onEsc);
  clearInterval(elapsedTimer);
  if (unsubscribe) unsubscribe();
});
</script>

<style scoped>
.ac-page { background: hsl(var(--background)); }

/* 顶部 */
.ac-head { position: relative; display: flex; align-items: center; gap: 20px; width: 100%; max-width: 1040px; margin: 0 auto; padding: 56px 32px 28px; transition: padding .2s; }
.ac-back { position: absolute; left: 32px; top: 16px; width: 32px; height: 32px; border-radius: 9px; color: var(--ui-text-2); font-size: 14px; }
.ac-head--compact .ac-back { position: static; flex-shrink: 0; }
.ac-back:hover { background: var(--ui-bg-2); color: var(--ui-ink); }
.ac-name { display: inline-flex; align-items: center; gap: 10px; padding: 4px 10px; margin-left: -10px; border-radius: 10px; font-size: 28px; font-weight: 600; color: var(--ui-ink); transition: background .15s; }
.ac-head--compact .ac-name { font-size: 16px; gap: 8px; }
.ac-name:hover, .ac-name[aria-expanded="true"] { background: var(--ui-bg-2); }
.ac-name i { font-size: 13px; color: var(--ui-text-2); transition: transform .15s; }
.ac-head--compact .ac-name i { font-size: 10px; }
.ac-intro { margin-top: 4px; font-size: 14px; color: var(--ui-text-2); line-height: 1.6; }
.ac-head--compact .ac-intro { font-size: 12.5px; margin-top: 0; }
.ac-head__actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; align-self: flex-end; }
.ac-head--compact .ac-head__actions { align-self: center; }
.ac-link { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 9px; font-size: 14px; color: var(--ui-ink-3); }
.ac-link:hover { background: var(--ui-bg-2); color: var(--ui-ink); }
.ac-busy { display: inline-flex; align-items: center; gap: 6px; padding-right: 6px; font-size: 12.5px; color: var(--ui-brand); }
.ac-busy span { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: ac-pulse 1.2s infinite; }
@keyframes ac-pulse { 50% { opacity: .3; } }

/* 关联项目 */
.ac-project { position: relative; display: inline-flex; align-items: center; gap: 6px; max-width: 220px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--ui-line-2); font-size: 13px; color: var(--ui-text-2); cursor: pointer; }
.ac-project:hover { border-color: var(--ui-brand); color: var(--ui-ink); }
.ac-project--on { border-color: color-mix(in srgb, var(--ui-brand) 45%, transparent); background: color-mix(in srgb, var(--ui-brand) 8%, transparent); color: var(--ui-brand); }
.ac-project select { min-width: 0; max-width: 180px; border: 0; outline: 0; background: transparent; color: inherit; font-size: 13px; cursor: pointer; text-overflow: ellipsis; }
.ac-linked { display: inline-flex; align-items: center; gap: 5px; margin-right: 8px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--ui-brand) 10%, transparent); color: var(--ui-brand); font-size: 12px; vertical-align: 1px; }
.ac-linked:hover { background: color-mix(in srgb, var(--ui-brand) 18%, transparent); }

/* 应用切换下拉 */
.ac-switcher { position: absolute; z-index: 40; top: calc(100% + 6px); left: -10px; width: 300px; padding: 8px; border-radius: 16px; background: hsl(var(--background)); border: 1px solid var(--ui-line-2); box-shadow: 0 16px 40px rgb(15 23 42 / 14%); }
.ac-switcher__head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 8px; font-size: 13px; color: var(--ui-text-2); }
.ac-switcher__head button { width: 28px; height: 28px; border-radius: 8px; color: var(--ui-text-2); }
.ac-switcher__head button:hover { background: var(--ui-bg-2); color: var(--ui-ink); }
.ac-switcher__list { max-height: 360px; overflow-y: auto; }
.ac-switcher__item { width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px; font-size: 14.5px; color: var(--ui-ink-2); }
.ac-switcher__item:hover { background: var(--ui-bg-2); }
.ac-switcher__item--on { color: var(--ui-brand); }
.ac-switcher__item i { font-size: 13px; }

/* 首页 */
.ac-landing { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
.ac-stage { display: flex; flex-direction: column; margin: 0 auto; }
.ac-stage > .ac-head { margin-top: auto; padding-top: 36px; }
.ac-home { width: 100%; max-width: 1040px; margin: 0 auto auto; padding: 0 32px 24px; }
/* 一屏固定：头部和输入框不随任务数量移动，任务列表占满剩余高度并自己滚动 */
.ac-stage { overflow: hidden; }
.ac-stage > .ac-head { margin-top: 0; padding-top: 64px; }
.ac-stage > .ac-home { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-bottom: 0; }
.ac-stage > .ac-home > div { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ac-stage .ac-tasks { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ac-tasks__list { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 24px; scrollbar-width: thin; }

/* 对话中：和首页同一套视觉——白底、无卡片框、同款圆角输入框、内容居中对齐 */
.ac-head--compact { max-width: 808px; gap: 12px; margin: 0 auto; padding: 18px 24px 10px; }
.ac-page :deep(.chat-surface) { background: hsl(var(--background)); }
.ac-page :deep(.chat-transcript) { width:100%; max-width: 760px; padding: 16px 16px 32px; border: 0; border-radius: 0; background: transparent; }
.ac-page :deep(.chat-composer-dock > div) { max-width: 760px; }
.ac-page :deep(.chat-composer-dock .fde-composer) { min-height: 60px; padding: 10px 12px 10px 16px; border: 1px solid var(--ui-line-2); border-radius: 28px; box-shadow: 0 4px 18px rgb(15 23 42 / 6%); }
.ac-page :deep(.chat-composer-dock .fde-composer:focus-within) { border-color: var(--ui-brand-light); box-shadow: 0 6px 24px rgb(37 99 235 / 10%); }
.ac-page :deep(.assistant-message-heading) { gap:12px; margin-bottom:16px; font-size:16px; font-weight:600; color:var(--ui-ink-2); }
.ac-page :deep(.assistant-message-status) { font-size:11px; font-weight:400; color:var(--ui-text-2); margin-left:4px; }
.ac-page :deep(.assistant-answer) { font-size:15px; line-height:1.8; letter-spacing:normal; color:var(--ui-ink-2,#334155); text-align:left; word-break:normal; overflow-wrap:anywhere; }
.ac-page :deep(.assistant-answer p) { margin:0 0 1em; }
.ac-page :deep(.assistant-answer > :last-child) { margin-bottom:0; }
.ac-page :deep(.assistant-answer ul),.ac-page :deep(.assistant-answer ol) { margin:.6em 0 1.1em; padding-left:1.5em; list-style-position:outside; }
.ac-page :deep(.assistant-answer ul) { list-style-type:disc; }
.ac-page :deep(.assistant-answer ol) { list-style-type:decimal; }
.ac-page :deep(.assistant-answer li) { padding-left:.25em; margin:.45em 0; }
.ac-page :deep(.assistant-answer li::marker) { color:var(--ui-text-2,#64748b); }
.ac-page :deep(.assistant-answer li > p) { margin:.35em 0; }
.ac-page :deep(.assistant-answer strong) { font-weight:600; }
.ac-page :deep(.assistant-answer h1),.ac-page :deep(.assistant-answer h2),.ac-page :deep(.assistant-answer h3),.ac-page :deep(.assistant-answer h4) { margin:1.4em 0 .6em; line-height:1.5; font-weight:600; }
.ac-page :deep(.assistant-answer h1) { font-size:24px; }.ac-page :deep(.assistant-answer h2) { font-size:21px; }.ac-page :deep(.assistant-answer h3) { font-size:18px; }.ac-page :deep(.assistant-answer h4) { font-size:16px; }
.ac-page :deep(.assistant-answer > :first-child) { margin-top:0; }
.ac-page :deep(.assistant-answer blockquote) { margin:1em 0; padding:10px 16px; border-left:2px solid var(--ui-line-2); color:var(--ui-text-2); background:var(--ui-bg-2); border-radius:0 6px 6px 0; }
.ac-page :deep(.assistant-answer table) { display:block; width:max-content; max-width:100%; overflow-x:auto; font-size:14px; line-height:1.65; margin:1.2em 0 1.5em; border:0; }
.ac-page :deep(.assistant-answer th),.ac-page :deep(.assistant-answer td) { padding:12px 18px; min-width:90px; border:0; border-bottom:1px solid var(--ui-line-2,#e8edf3); vertical-align:top; }
.ac-page :deep(.assistant-answer th) { background:transparent; font-weight:600; color:var(--ui-ink-2); }
.ac-page :deep(.assistant-answer th:first-child),.ac-page :deep(.assistant-answer td:first-child) { padding-left:0; }
.ac-page :deep(.assistant-answer th:last-child),.ac-page :deep(.assistant-answer td:last-child) { padding-right:0; }
.ac-page :deep(.assistant-answer tbody tr:last-child td) { border-bottom:0; }
.ac-page :deep(.assistant-answer small),.ac-page :deep(.assistant-answer figcaption) { font-size:13px; line-height:1.7; color:var(--ui-text-2,#64748b); }
.ac-page :deep(.assistant-answer hr) { border:0; border-top:1px solid var(--ui-line-2,#e8edf3); margin:28px 0; }
.ac-page :deep(.assistant-answer pre) { max-width:100%; font-size:13px; line-height:1.65; padding:16px; margin:1em 0; }
.ac-page :deep(.assistant-answer code) { font-size:.88em; }
.ac-page :deep(.assistant-answer img) { max-width:100%; height:auto; border-radius:10px; }
.ac-composer { display: flex; flex-direction: column; gap: 8px; padding: 18px 18px 14px 22px; border: 1px solid var(--ui-line-2); border-radius: 28px; background: hsl(var(--background)); box-shadow: 0 4px 18px rgb(15 23 42 / 6%); transition: border-color .15s, box-shadow .15s; }
.ac-composer:focus-within { border-color: var(--ui-brand-light); box-shadow: 0 6px 24px rgb(37 99 235 / 10%); }
.ac-composer textarea { width: 100%; border: 0; outline: 0; resize: none; background: transparent; font-size: 15px; line-height: 1.6; color: var(--ui-ink); }
.ac-composer textarea::placeholder { color: var(--ui-text-3); }
.ac-composer__bar { display: flex; align-items: center; justify-content: space-between; }
.ac-send { width: 40px; height: 40px; border-radius: 50%; background: var(--ui-brand); color: #fff; font-size: 16px; transition: background .15s, opacity .15s; }
.ac-send:hover:not(:disabled) { background: var(--ui-brand-dark); }
.ac-send:disabled { background: var(--ui-text-3); opacity: .6; cursor: not-allowed; }
.ac-starters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.ac-starter { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: var(--ui-bg-2); font-size: 13px; color: var(--ui-ink-3); transition: background .15s, color .15s; }
.ac-starter i { font-size: 11px; color: var(--ui-text-3); }
.ac-starter:hover { background: var(--ui-brand-soft); color: var(--ui-brand-deep); }

.ac-tasks { margin-top: 48px; }
.ac-tasks__bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--ui-line-2); }
.ac-tasks__bar h2 { font-size: 17px; font-weight: 600; color: var(--ui-ink); }
.ac-tasks__bar h2 span { margin-left: 4px; font-size: 13px; font-weight: 400; color: var(--ui-text-3); }
.ac-search { display: flex; align-items: center; gap: 8px; width: 260px; height: 36px; padding: 0 12px; border: 1px solid var(--ui-line-2); border-radius: 10px; color: var(--ui-text-3); font-size: 12px; }
.ac-search:focus-within { border-color: var(--ui-brand-light); }
.ac-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13px; color: var(--ui-ink); }
.ac-task { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 12px; border-bottom: 1px solid var(--ui-bg-2); font-size: 14px; color: var(--ui-ink-2); transition: background .15s; }
.ac-task:hover { background: var(--ui-bg-3); }
.ac-task > i { color: var(--ui-text-3); }
.ac-task__time { flex-shrink: 0; font-size: 12px; color: var(--ui-text-3); }
.ac-empty { padding: 56px 0; text-align: center; color: var(--ui-text-3); font-size: 13px; }
.ac-empty i { font-size: 34px; margin-bottom: 12px; opacity: .6; }

/* 详情弹窗 */
.ac-mask { background: rgb(15 23 42 / 28%); backdrop-filter: blur(6px); }
.ac-modal { position: relative; width: 520px; max-width: 100%; max-height: 100%; overflow-y: auto; padding: 32px; border-radius: 28px; background: hsl(var(--background)); box-shadow: 0 24px 64px rgb(15 23 42 / 18%); }
.ac-close { position: absolute; top: 20px; right: 20px; width: 32px; height: 32px; border-radius: 8px; color: var(--ui-text); font-size: 16px; }
.ac-close:hover { background: var(--ui-bg-2); }
.ac-h { margin: 22px 0 12px; font-size: 15px; font-weight: 600; color: var(--ui-ink); }
.ac-chip { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; background: var(--ui-bg-2); font-size: 13px; color: var(--ui-ink-3); }
.ac-fade-enter-active, .ac-fade-leave-active { transition: opacity .18s; }
.ac-fade-enter-from, .ac-fade-leave-to { opacity: 0; }

@media (max-width: 900px) {
  .ac-head { padding: 48px 16px 20px; gap: 14px; flex-wrap: wrap; }
  .ac-home { padding: 0 16px 40px; }
  .ac-search { width: 160px; }
}
</style>
