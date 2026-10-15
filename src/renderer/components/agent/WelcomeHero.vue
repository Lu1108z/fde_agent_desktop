<template>
  <div class="chat-welcome flex flex-col h-full min-h-0" :class="{ 'chat-welcome--branded': branded }">
    <svg v-if="branded" width="0" height="0" class="welcome-logo-filter" aria-hidden="true"><defs><filter :id="logoFilterId" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 0 0 0 1" /><feComposite in2="SourceAlpha" operator="in" /></filter></defs></svg>
    <div class="welcome-scroll flex-1 min-h-0 overflow-y-auto">
      <div class="welcome-content">
        <div class="welcome-hero">
          <div v-if="branded" class="welcome-decoration" aria-hidden="true"><span class="welcome-orbit"></span><span class="welcome-glass-panel panel-back"></span><span class="welcome-glass-panel panel-middle"></span><span class="welcome-glass-panel panel-front"><img :src="cloudLogo" class="welcome-cloud-logo" :style="{ filter: `url(#${logoFilterId})` }" alt="极库云" /></span></div>
          <div class="welcome-character"><img :src="coachMascot" alt="FDE 助手" /></div>
          <div class="welcome-copy">
            <span class="welcome-label">{{ coachMode ? '你的需求沟通陪练' : '你的项目协作助手' }}</span>
            <h2>{{ coachMode ? '你好，我是 FDE 教练' : '你好，我是 FDE 助手' }}</h2>
            <p>{{ coachMode ? '我扮演客户，你来挖需求。可以随时说“复盘”，一起改进沟通方式。' : '一起梳理需求、完善方案，把想法变成清晰的交付物。' }}</p>
            <div v-if="branded" class="welcome-tags">
              <span><i class="fa-solid fa-shield-halved"></i>专业可靠</span>
              <span><i class="fa-regular fa-lightbulb"></i>{{ coachMode ? '懂需求沟通' : '懂产品设计' }}</span>
              <span><i class="fa-regular fa-folder"></i>支持多种文件</span>
            </div>
          </div>
        </div>
        <section class="welcome-task-panel">
        <div class="welcome-section-heading"><span>从一个问题开始</span></div>
        <div class="welcome-suggestions">
          <button v-for="card in visibleCards" :key="card.key" @click="fillInput(card.prompt)" class="welcome-suggestion">
            <span class="welcome-task-icon" :class="'task-' + card.key"><i :class="card.icon"></i></span>
            <span class="welcome-task-copy"><strong>{{ card.label }}</strong><span>{{ card.description }}</span></span>
            <i class="fa-solid fa-arrow-right welcome-task-arrow"></i>
          </button>
        </div>
        </section>
      </div>
    </div>

    <!-- Fixed bottom input area -->
    <div class="welcome-input-dock shrink-0 px-6 pb-3 pt-2">
      <div class="welcome-input-width mx-auto">

        <div class="fde-composer">
          <textarea
            ref="inputRef"
            v-model="inputText"
            :placeholder="coachMode ? '说说你想练习的场景…' : '向我提问…'"
            :aria-label="coachMode ? '发送给 FDE 教练的消息' : '发送给 AI 助手的消息'"
            rows="1"
            @input="resizeInput"
            class="welcome-textarea"
            @keydown.ctrl.enter.prevent="handleSend"
            @keydown.meta.enter.prevent="handleSend"
          ></textarea>
          <!-- Attachment preview (images + files) -->
          <div v-if="attachments.length > 0" class="fde-composer-attachments flex items-center gap-2 px-4 py-1.5 flex-wrap">
            <div v-for="(att, ai) in attachments" :key="ai" class="relative group/att">
              <img v-if="att.type === 'image'" :src="'data:' + att.media_type + ';base64,' + att.data" class="w-12 h-12 object-cover rounded-lg border border-slate-200" />
              <div v-else class="flex items-center gap-1.5 h-12 px-2.5 rounded-lg border border-slate-200 glass-card max-w-[160px]">
                <i class="fa-solid fa-file-lines text-blue-500 text-sm shrink-0"></i>
                <span class="text-[11px] text-slate-600 truncate">{{ att.name }}</span>
              </div>
              <button @click="attachments.splice(ai, 1)" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[8px] flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity cursor-pointer">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
          <div class="fde-composer-toolbar">
            <div class="fde-composer-left">
              <AttachmentMenu :recording="isRecording" :voice-supported="recordingSupported" @image="pickImage" @file="pickFile" @voice="toggleRecording" />
              <span v-if="isRecording" class="fde-composer-status">录音中 {{ recordSeconds }}s</span>
              <span v-else-if="isTranscribing" class="fde-composer-status">识别中…</span>
            </div>
            <div class="fde-composer-right">
              <ModelSelector minimal :models="availableModels" :current="currentModel" @change="(id) => $emit('change-model', id)" />
              <button type="button" class="fde-voice-button" :class="{ 'is-recording': isRecording }" :disabled="!recordingSupported || isTranscribing" @click="toggleRecording" :aria-label="isRecording ? '停止录音' : '语音输入'" :title="isRecording ? '停止录音' : '语音输入'"><i class="fa-solid" :class="isRecording ? 'fa-stop' : 'fa-microphone'" aria-hidden="true"></i></button>
              <button type="button" class="fde-send-button" @click="handleSend" aria-label="发送消息" :disabled="!inputText.trim() && attachments.length === 0"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            </div>
          </div>
        </div>
        <div v-if="branded" class="welcome-tools">
          <button v-if="coachMode" type="button" @click="$emit('start-voice')" class="welcome-voice-entry"><i class="fa-solid fa-headset"></i>语音对话</button>
          <button type="button" @click="pickFile"><i class="fa-solid fa-paperclip"></i>上传文档</button>
          <button type="button" @click="pickImage"><i class="fa-regular fa-image"></i>上传图片</button>
          <button type="button" :aria-pressed="searchEnabled" @click="searchEnabled = !searchEnabled"><i class="fa-solid fa-globe"></i>联网搜索</button>
          <button type="button" :aria-pressed="codeEnabled" @click="codeEnabled = !codeEnabled"><i class="fa-solid fa-code"></i>代码模式</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount, useId } from 'vue';
import ModelSelector from './ModelSelector.vue';
import AttachmentMenu from './AttachmentMenu.vue';
import './chat-composer.css';
import coachMascot from '@/assets/fde-coach-mascot.png';
import cloudLogo from '@/assets/logo.png';
import { prepareImage } from '@/composables/imagePrep';

const props = defineProps({
  coachMode: { type: Boolean, default: false },
  branded: { type: Boolean, default: false },
  availableModels: { type: Array, default: () => [] },
  currentModel: { type: String, default: '' },
});

const emit = defineEmits(['start-voice', 'send-quick', 'navigate', 'fill-input', 'send-with-attachments', 'change-model']);

const logoFilterId = useId();
const inputText = ref('');
const searchEnabled = ref(false), codeEnabled = ref(false);
const inputRef = ref(null);
const attachments = ref([]);

const pickImage = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async (e) => {
    for (const file of e.target.files) {
      try {
        const { data, media_type } = await prepareImage(file);
        if (!data) continue;
        attachments.value.push({ type: 'image', data, media_type, name: file.name });
      } catch (err) {
        console.error('[WelcomeHero] pickImage failed for', file.name, err);
        alert(`「${file.name}」读取失败，已跳过`);
      }
    }
  };
  input.click();
};

// Plain text/code files are inlined whole by the server; documents (PDF/Word/
// Excel/PPT) get a larger cap because the server extracts their text.
const MAX_FILE_BYTES = 512 * 1024;
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'log', 'yaml', 'yml', 'xml', 'html', 'htm',
  'css', 'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go',
  'rs', 'rb', 'php', 'sh', 'sql', 'ini', 'conf', 'toml', 'env',
]);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const fileExt = (file) => {
  const idx = file.name.lastIndexOf('.');
  return idx >= 0 ? file.name.slice(idx + 1).toLowerCase() : '';
};
const isTextFile = (file) => TEXT_EXT.has(fileExt(file)) || (file.type || '').startsWith('text/');
const isDocFile = (file) => DOC_EXT.has(fileExt(file));

const pickFile = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.md,.markdown,.json,.csv,.log,.yaml,.yml,.xml,.html,.htm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.epub';
  input.multiple = true;
  input.onchange = async (e) => {
    for (const file of e.target.files) {
      const cap = isDocFile(file) ? MAX_DOC_BYTES : MAX_FILE_BYTES;
      if (file.size > cap) {
        alert(`「${file.name}」超过 ${Math.round(cap / 1024 / 1024 * 10) / 10}MB，已跳过`);
        continue;
      }
      if (isTextFile(file)) {
        const text = await file.text();
        attachments.value.push({ type: 'file', text, media_type: file.type || 'text/plain', name: file.name });
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target.result.split(',')[1];
          attachments.value.push({ type: 'file', data: base64, media_type: file.type || 'application/octet-stream', name: file.name });
        };
        reader.readAsDataURL(file);
      }
    }
  };
  input.click();
};

// ===== Voice input: record → 360 ASR → fill input box =====
const recordingSupported = typeof window !== 'undefined'
  && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  && typeof window.MediaRecorder !== 'undefined';
const isRecording = ref(false);
const isTranscribing = ref(false);
const recordSeconds = ref(0);
let mediaRecorder = null;
let mediaStream = null;
let recordChunks = [];
let recordTimer = null;
let recordStartAt = 0;
const MIN_RECORD_MS = 800;

const stopTracks = () => {
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
};

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// 识别失败时把录音落盘兜底（欢迎页无项目 slug，存到全局录音目录）；提示并可打开文件夹。
const saveRecordingOnFailure = async (base64, mime, errMsg) => {
  const reason = errMsg || '语音识别失败';
  if (!base64) { alert(reason); return; }
  const ext = (mime.split('/')[1] || 'webm').split(';')[0];
  let saved = null;
  try {
    saved = await window.api.hermes.saveRecording('', base64, ext);
  } catch { /* ignore */ }
  if (saved?.success) {
    const open = confirm(`${reason}\n\n录音已保存到：\n${saved.filePath}\n\n点击“确定”打开所在文件夹。`);
    if (open) {
      try { await window.api.shell.openPath(saved.dirPath); } catch { /* ignore */ }
    }
  } else {
    alert(`${reason}（录音保存失败：${saved?.error || '未知错误'}）`);
  }
};

const toggleRecording = async () => {
  if (!recordingSupported) return;
  if (isRecording.value) { mediaRecorder?.stop(); return; }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert('无法访问麦克风，请检查权限设置');
    return;
  }
  recordChunks = [];
  try {
    mediaRecorder = new MediaRecorder(mediaStream);
  } catch {
    alert('当前环境不支持录音');
    stopTracks();
    return;
  }
  recordStartAt = performance.now();
  mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recordChunks.push(ev.data); };
  mediaRecorder.onstop = async () => {
    const durationMs = performance.now() - recordStartAt;
    const mime = mediaRecorder?.mimeType || 'audio/webm';
    stopTracks();
    isRecording.value = false;
    const blob = new Blob(recordChunks, { type: mime });
    if (durationMs < MIN_RECORD_MS || blob.size === 0) { return; }
    isTranscribing.value = true;
    let base64 = '';
    try {
      base64 = await blobToBase64(blob);
      const res = await window.api.hermes.transcribe(base64, mime);
      if (res?.success && res.text) {
        inputText.value = (inputText.value ? inputText.value + ' ' : '') + res.text;
        nextTick(() => inputRef.value?.focus());
      } else {
        await saveRecordingOnFailure(base64, mime, res?.error);
      }
    } catch (err) {
      await saveRecordingOnFailure(base64, mime, err?.message);
    } finally {
      isTranscribing.value = false;
    }
  };
  mediaRecorder.start();
  isRecording.value = true;
  recordSeconds.value = 0;
  // 不限录音时长：只更新计时显示，由用户手动点停。
  recordTimer = setInterval(() => {
    recordSeconds.value = Math.floor((performance.now() - recordStartAt) / 1000);
  }, 250);
};

onBeforeUnmount(() => {
  try { if (mediaRecorder && isRecording.value) mediaRecorder.stop(); } catch { /* ignore */ }
  stopTracks();
});

function resizeInput() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = props.branded ? '34px' : 'auto';
  if (!props.branded) el.style.height = Math.min(el.scrollHeight, 132) + 'px';
}

const fillInput = (text) => {
  inputText.value = text;
  nextTick(() => {
    const el = inputRef.value;
    if (!el) return;
    resizeInput();
    el.focus();
  });
};

const handleSend = () => {
  const draft = inputText.value.trim();
  if (!draft && attachments.value.length === 0) return;
  const text = [searchEnabled.value ? '请联网搜索并提供来源。' : '', codeEnabled.value ? '请以代码任务方式处理，给出可运行的实现。' : '', draft].filter(Boolean).join('\n\n');
  if (attachments.value.length > 0) {
    emit('send-with-attachments', text || '请分析这个附件', [...attachments.value]);
  } else {
    emit('send-quick', text);
  }
  inputText.value = '';
  attachments.value = [];
};

const coachCards = [
  { key:'requirements', label:'医疗客户沟通', description:'练习向科室负责人挖掘需求', icon:'fa-solid fa-stethoscope', prompt:'我想练习医疗行业的需求沟通，请扮演科室负责人，与我进行 SPIN 需求挖掘陪练。' },
  { key:'document', label:'企业客户沟通', description:'练习业务场景与痛点提问', icon:'fa-solid fa-building', prompt:'我想练习企业客户需求沟通，请扮演业务负责人，让我逐步挖掘你的问题与真实需求。' },
  { key:'agent', label:'方案沟通演练', description:'练习表达方案、回应客户质疑', icon:'fa-solid fa-comments', prompt:'我想练习方案沟通，请扮演甲方客户，对我的方案提出真实的疑问和顾虑。' },
  { key:'review', label:'沟通复盘', description:'分析提问方式与改进建议', icon:'fa-solid fa-magnifying-glass', prompt:'帮我复盘一段客户沟通，我会提供对话记录，请按 FDE 教练的六维评分给出建议。' },
];
const visibleCards = computed(() => props.coachMode ? coachCards : featureCards);
const featureCards = [
  { key:'requirements', label:'梳理需求', description:'把业务问题整理成需求清单', icon:'fa-solid fa-list-check', prompt:'帮我梳理核心需求和业务场景，我会先介绍项目背景。' },
  { key:'document', label:'生成文档', description:'完善 PRD、方案与汇报材料', icon:'fa-solid fa-file-lines', prompt:'帮我写一份 PRD 初稿，请先确认需要哪些项目资料。' },
  { key:'agent', label:'设计智能体', description:'拆解能力、数据与业务流程', icon:'fa-solid fa-diagram-project', prompt:'帮我把业务链路拆成智能体方案，我会提供业务流程。' },
  { key:'review', label:'优化方案', description:'检查遗漏，给出可执行建议', icon:'fa-solid fa-wand-magic-sparkles', prompt:'帮我评审现有方案，检查遗漏、风险和可以改进的地方。' },
];
</script>

<style scoped>
.chat-welcome { container-type:inline-size; }
.welcome-scroll { display:flex; flex-direction:column; }
.welcome-content { width:100%; max-width:740px; margin:auto; padding:28px 24px; }
.welcome-hero { position:relative; display:flex; align-items:center; min-height:210px; gap:24px; border-radius:20px; background:#edf4ff; padding:0 20px; overflow:hidden; }
.welcome-character { position:relative; width:150px; height:210px; flex-shrink:0; overflow:hidden; }
.welcome-character img { position:absolute; width:340px; height:340px; max-width:none; left:-95px; top:4px; object-fit:contain; }
.welcome-copy { min-width:0; padding:24px 0; position:relative; z-index:1; }
.welcome-label { color:#2563eb; font-size:11px; }
.welcome-copy h2 { margin:8px 0; font-size:22px; font-weight:600; color:#172033; line-height:1.5; }
.welcome-copy p { font-size:13px; line-height:1.8; color:#64748b; max-width:420px; }
.welcome-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 10px; font-size:12px; color:#334155; font-weight:500; }
.welcome-section-heading span:last-child { font-size:11px; color:#94a3b8; font-weight:400; }
.welcome-suggestions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:14px; }
.welcome-suggestion { display:flex; align-items:center; gap:12px; text-align:left; border:1px solid #e5ebf5; border-radius:12px; padding:10px 12px; background:#fff; cursor:pointer; transition:border-color .15s,background .15s; }
.welcome-suggestion:hover { border-color:#a7c4ff; background:#f8fbff; }
.welcome-task-icon { display:grid; place-items:center; width:36px; height:36px; border-radius:10px; color:#2563eb; background:#edf3ff; flex-shrink:0; font-size:14px; }
.task-document { color:#059669; background:#eafaf3; }
.task-agent { color:#7c3aed; background:#f3edff; }
.task-review { color:#ea580c; background:#fff3e8; }
.welcome-task-copy { min-width:0; flex:1; display:flex; flex-direction:column; gap:5px; }
.welcome-task-copy strong { font-size:13px; font-weight:500; color:#334155; }
.welcome-task-copy > span { font-size:11px; color:#64748b; line-height:1.6; }
.welcome-task-arrow { color:#94a3b8; font-size:10px; }
.welcome-input-dock { background:transparent; }
.welcome-input-width { max-width:788px; }
.welcome-composer { background:#fff; border-color:#dce5f3; box-shadow:0 4px 20px rgba(39,71,119,.06); transition:border-color .15s; }
.welcome-composer:focus-within { border-color:#8aafff; }
.welcome-toolbar, .welcome-model-tools { flex-wrap:wrap; gap:8px; }
.chat-welcome button:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }
@container (max-width:540px) {
 .welcome-content { padding:20px 12px; }
 .welcome-hero { gap:12px; padding-right:12px; }
 .welcome-character { width:90px; }
 .welcome-character img { left:-125px; }
 .welcome-copy h2 { font-size:18px; }
 .welcome-suggestion { gap:8px; padding:9px; }
 .welcome-task-copy > span { display:none; }
 .welcome-section-heading span:last-child { display:none; }
}

.chat-welcome--branded { padding:38px 42px 14px; overflow-y:auto; scrollbar-width:none; }
.chat-welcome--branded::-webkit-scrollbar { display:none; }
.chat-welcome--branded .welcome-scroll { flex:0 0 auto; overflow:visible; }
.chat-welcome--branded .welcome-content { max-width:none; padding:0; }
.chat-welcome--branded .welcome-hero { height:clamp(240px, 24vw, 307px); min-height:0; padding:0; border:1px solid #fff; border-radius:22px; background:rgba(255,255,255,.28) url('@/assets/chat-welcome-background.png') center / cover; box-shadow:0 3px 12px #406ac40a; }
.chat-welcome--branded .welcome-character { position:absolute; inset:0; width:auto; height:auto; }
.chat-welcome--branded .welcome-character img { width:46%; height:auto; left:-2.5%; top:10%; }
.chat-welcome--branded .welcome-copy { margin-left:33.7%; padding:20px 18% 20px 0; }
.chat-welcome--branded .welcome-label { font-size:14px; color:#1762ff; }
.chat-welcome--branded .welcome-copy h2 { margin:12px 0 10px; font-size:clamp(25px, 2.45vw, 34px); font-weight:600; color:#081932; }
.chat-welcome--branded .welcome-copy p { font-size:16px; max-width:600px; line-height:1.7; color:#617696; }
.welcome-logo-filter { position:absolute; pointer-events:none; }
.welcome-decoration { position:absolute; inset:0; pointer-events:none; }
.welcome-orbit { position:absolute; width:24%; aspect-ratio:1; border:1px solid #fff; border-radius:50%; left:7.6%; top:12%; background:linear-gradient(145deg,#d4e6ffb3,#adcfff4d); }
.welcome-glass-panel { position:absolute; width:12.5%; height:73%; border:1px solid #ffffffd9; border-right:5px solid #fff; border-radius:14px; transform:skewY(27deg); background:linear-gradient(130deg,#d1e5ffbf,#a5c8ff82); box-shadow:1px 4px 12px #c9dcfa55; }
.panel-back { right:6%; top:18%; }
.panel-middle { right:13%; top:22%; }
.panel-front { right:9.5%; top:38%; width:11.4%; height:55%; background:linear-gradient(130deg,#e8f2ffbb,#bdd7ffb0); }
.welcome-tags { display:flex; gap:18px; margin-top:20px; white-space:nowrap; }
.welcome-tags span { display:flex; align-items:center; gap:9px; padding:12px 16px; border:1px solid #e7efff; border-radius:12px; background:#ffffffa8; font-size:13px; color:#566c8e; }
.welcome-tags i { color:#203c68; font-size:15px; }
.welcome-cloud-logo { position:absolute; left:50%; top:50%; width:42%; max-width:52px; aspect-ratio:1; height:auto; object-fit:contain; transform:translate(-50%,-50%);  }
.chat-welcome--branded .welcome-input-dock { padding:20px 0 0; }
.chat-welcome--branded .welcome-input-width { max-width:none; }
.chat-welcome--branded .welcome-task-panel { background:#ffffffed; border-radius:20px; padding:20px 24px; margin-bottom:20px; }
.chat-welcome--branded .welcome-section-heading { font-size:17px; font-weight:600; color:#0b1833; margin-bottom:12px; }
.chat-welcome--branded .welcome-section-heading span { font-size:inherit; color:inherit; font-weight:inherit; }
.chat-welcome--branded .welcome-suggestions { grid-template-columns:repeat(4,minmax(0,1fr)); gap:11px; margin-bottom:0; }
.chat-welcome--branded .welcome-suggestion { display:flex; flex-direction:column; align-items:flex-start; position:relative; min-height:140px; padding:14px 20px; gap:10px; border-color:#e0eafe; border-radius:13px; background:linear-gradient(148deg,#f9fbff 30%,#eaf2ff91 30%,#fff); }
.chat-welcome--branded .welcome-suggestion:nth-child(2) { background:linear-gradient(148deg,#f8fffd 30%,#eafaf691 30%,#fff); border-color:#dff3f0; }
.chat-welcome--branded .welcome-suggestion:nth-child(3) { background:linear-gradient(148deg,#fcfaff 30%,#f2edff91 30%,#fff); border-color:#ebe4ff; }
.chat-welcome--branded .welcome-suggestion:nth-child(4) { background:linear-gradient(148deg,#fffdfb 30%,#fff2e891 30%,#fff); border-color:#f8eadf; }
.chat-welcome--branded .welcome-task-icon { width:52px; height:52px; border-radius:14px; font-size:22px; }
.chat-welcome--branded .welcome-task-copy { gap:5px; }
.chat-welcome--branded .welcome-task-copy strong { font-size:17px; font-weight:600; color:#0b1833; }
.chat-welcome--branded .welcome-task-copy > span { font-size:12px; padding-right:24px; color:#647aa0; }
.chat-welcome--branded .welcome-task-arrow { position:absolute; right:14px; bottom:13px; width:36px; height:36px; display:grid; place-items:center; border:1px solid #e0eafe; border-radius:50%; background:#f3f7ff; color:#357cff; font-size:13px; }
.chat-welcome--branded .fde-composer { width:calc(100% - 32px); max-width:990px; margin:0 auto; min-height:52px; border-radius:28px; padding:8px 10px; grid-template-columns:36px minmax(0,1fr) auto; column-gap:10px; row-gap:0; border-color:#dbe5f5; box-shadow:0 10px 24px #1f386812; }
.chat-welcome--branded .fde-composer textarea { font-size:14px; height:34px!important; min-height:34px; max-height:34px; padding:6px 2px; }
.chat-welcome--branded :deep(.attachment-trigger) { width:34px; height:34px; border:0; font-size:19px; }
.chat-welcome--branded .fde-send-button { width:32px; height:32px; font-size:15px; background:linear-gradient(135deg,#80c3ff,#246aff); color:white; }
.chat-welcome--branded .fde-send-button:disabled { opacity:.85; }
.chat-welcome--branded .fde-voice-button { width:32px; font-size:17px; border-left:1px solid #e2e8f0; border-radius:0; margin-left:12px; }
.welcome-tools { display:flex; justify-content:center; gap:10px; padding-top:9px; }
.welcome-tools button { display:flex; gap:10px; align-items:center; padding:10px 17px; border:1px solid #e5edf9; border-radius:22px; color:#5a7196; font-size:12px; background:#ffffffbf; cursor:pointer; }
.welcome-tools button:hover, .welcome-tools button[aria-pressed=true] { background:#e9f2ff; color:#2563eb; border-color:#a9caff; }
.welcome-tools i { font-size:14px; }
@container (max-width:850px) {
 .chat-welcome--branded { padding:24px 24px 14px; }
 .chat-welcome--branded .welcome-hero { height:240px; }
 .chat-welcome--branded .welcome-copy { padding-right:16px; }
 .chat-welcome--branded .welcome-copy p { font-size:13px; }
 .welcome-tags { gap:8px; margin-top:12px; }
 .welcome-tags span { padding:8px; font-size:11px; }
 .chat-welcome--branded .welcome-suggestion { padding:12px; }
 .chat-welcome--branded .welcome-task-copy strong { font-size:14px; }
 .chat-welcome--branded .welcome-cloud-logo { display:none; }
 .welcome-tools { flex-wrap:wrap; }
}
@container (max-width:600px) {
 .chat-welcome--branded .welcome-suggestions { grid-template-columns:repeat(2,minmax(0,1fr)); }
 .chat-welcome--branded .welcome-hero { height:210px; }
 .chat-welcome--branded .welcome-copy { margin-left:31%; }
 .chat-welcome--branded .welcome-copy h2 { font-size:20px; }
 .welcome-tags { flex-wrap:wrap; }
 .welcome-tags span:last-child { display:none; }
 .chat-welcome--branded .fde-composer { margin:0; column-gap:8px; row-gap:0; grid-template-columns:34px minmax(0,1fr) auto; }
 .chat-welcome--branded :deep(.attachment-trigger) { width:34px; height:34px; }
 .chat-welcome--branded .fde-composer textarea { font-size:14px; height:34px!important; min-height:34px; max-height:34px; padding:6px 2px; }
}

/* Compact quick questions shared by coaching and AI conversations. */
.chat-welcome.chat-welcome--branded .welcome-task-panel{padding:14px 18px;border-radius:14px;margin-bottom:14px}
.chat-welcome.chat-welcome--branded .welcome-section-heading{font-size:13px;font-weight:500;margin-bottom:10px;line-height:20px}
.chat-welcome.chat-welcome--branded .welcome-suggestions{gap:10px}
.chat-welcome.chat-welcome--branded .welcome-suggestion{flex-direction:row;align-items:center;min-height:82px;padding:12px;gap:10px;border-radius:10px}
.chat-welcome.chat-welcome--branded .welcome-task-icon{width:32px;height:32px;border-radius:9px;font-size:16px}
.chat-welcome.chat-welcome--branded .welcome-task-copy{gap:4px}
.chat-welcome.chat-welcome--branded .welcome-task-copy strong{font-size:14px;font-weight:500;line-height:20px}
.chat-welcome.chat-welcome--branded .welcome-task-copy>span{font-size:12px;line-height:18px;padding-right:0}
.chat-welcome.chat-welcome--branded .welcome-task-arrow{position:static;width:16px;height:20px;flex-shrink:0;border:0;border-radius:0;background:transparent;font-size:11px;color:#6c8fca}

/* Keep welcome content scrollable and anchor the composer to the bottom. */
.chat-welcome.chat-welcome--branded{overflow:hidden}
.chat-welcome.chat-welcome--branded .welcome-scroll{flex:1 1 0%;min-height:0;overflow-y:auto;overflow-x:hidden}
.chat-welcome.chat-welcome--branded .welcome-content{margin:0; padding-bottom:8px}
.chat-welcome.chat-welcome--branded .welcome-task-panel{margin-top:20px;margin-bottom:0}
.chat-welcome.chat-welcome--branded .welcome-input-dock{flex:0 0 auto;margin-top:auto;padding-top:14px;padding-bottom:0}

</style>
