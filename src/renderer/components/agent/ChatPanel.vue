<template>
  <!-- min-h-0：本身也是 flex 子项，不加会被消息列表撑高超出视口，
       导致内部 overflow-y-auto 失效、absolute bottom-0 的输入框被顶到屏幕外。 -->
  <div class="flex-1 flex flex-col min-w-0 min-h-0 relative chat-surface" :class="{ 'chat-surface--welcome': messages.length === 0 && !isLoading, 'chat-surface--branded': branded }">
    <!-- Messages area -->
    <div ref="chatContainerRef" class="chat-scroll flex-1 min-h-0 overflow-y-auto px-4 pt-5" :class="messages.length > 0 ? (chatAttachments.length ? 'pb-[250px]' : 'pb-[180px]') : ''">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-24">
        <div class="relative w-12 h-12 mb-5">
          <div class="absolute inset-0 rounded-full border-2 border-blue-100"></div>
          <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin"></div>
          <div class="absolute inset-2 rounded-full glass-card flex items-center justify-center">
            <i class="fa-solid fa-comments text-blue-400 text-sm"></i>
          </div>
        </div>
        <p class="text-sm text-slate-500 font-medium">正在加载对话记录...</p>
        <p class="text-[11px] text-slate-400 mt-1">请稍候</p>
      </div>

      <!-- Empty state: Welcome hero (full height) -->
      <WelcomeHero
        v-else-if="messages.length === 0"
        class="h-full"
        :coach-mode="coachMode"
        :branded="branded"
        :available-models="availableModels"
        :current-model="currentModel"
        @start-voice="$emit('start-voice')"
        @send-quick="(text) => $emit('send-quick', text)"
        @send-with-attachments="(text, atts) => $emit('send-with-attachments', text, atts)"
        @navigate="(tab) => $emit('navigate', tab)"
        @change-model="(id) => $emit('change-model', id)"
      />

      <!-- Message list -->
      <div v-else class="chat-transcript w-full max-w-4xl mx-auto space-y-7">

        <!-- Message list -->
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          :data-msg-index="idx"
          class="flex flex-col w-full group transition-all duration-300 relative"
          :class="msg.role === 'user' ? 'items-end' : 'items-start'"
        >
          <!-- 来源分隔：对话线发生切换时插一条。
               切回本页主线(sourceLabel 为空)也要插，否则后面的消息看着像还归属上一条交付物。 -->
          <div
            v-if="idx > 0 && (msg.sourceLabel || '') !== (messages[idx - 1]?.sourceLabel || '')"
            class="w-full flex items-center gap-2 my-3 select-none"
          >
            <span class="h-px flex-1 bg-slate-200/70"></span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-[11px] font-medium text-slate-500">
              <i class="fa-solid text-[9px] text-slate-400" :class="msg.sourceLabel ? 'fa-diagram-project' : 'fa-comments'"></i>
              {{ msg.sourceLabel || '智能对话' }}
            </span>
            <span class="h-px flex-1 bg-slate-200/70"></span>
          </div>
          <!-- 首条就来自其他对话线：也要标出来源 -->
          <div v-else-if="idx === 0 && msg.sourceLabel" class="w-full flex items-center gap-2 mb-3 select-none">
            <span class="h-px flex-1 bg-slate-200/70"></span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-[11px] font-medium text-slate-500">
              <i class="fa-solid fa-diagram-project text-[9px] text-slate-400"></i>
              {{ msg.sourceLabel }}
            </span>
            <span class="h-px flex-1 bg-slate-200/70"></span>
          </div>

          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="relative max-w-[80%] flex flex-col items-end">
            <!-- User attachments (images + files) -->
            <div v-if="msg.attachments && msg.attachments.length > 0" class="flex flex-wrap gap-2 mb-2 justify-end">
              <template v-for="(att, ai) in msg.attachments" :key="ai">
                <img
                  v-if="att.type === 'image' || (!att.type && att.data)"
                  :src="'data:' + (att.media_type || 'image/png') + ';base64,' + att.data"
                  class="max-w-[200px] max-h-[150px] object-cover rounded-xl border border-slate-200 shadow-sm cursor-zoom-in hover:brightness-95 transition"
                  @click="openLightbox('data:' + (att.media_type || 'image/png') + ';base64,' + att.data)"
                />
                <AttachmentChip v-else :att="att" @preview-image="openLightbox" />
              </template>
            </div>
            <div class="rounded-[18px] px-3.5 py-2 leading-relaxed text-[14px] bg-[var(--ui-brand-soft)] text-slate-800 whitespace-pre-wrap break-words inline-block text-left">
              {{ msg.displayContent || msg.content }}
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else class="w-full flex flex-col items-start">
            <div v-if="!msg.systemNotice" class="assistant-message-heading">
              <img :src="coachAvatar" alt="FDE 助手" />
              <span>{{ projectMeta?.projectType === 'fde-coach' || slug.startsWith('coach-') ? 'FDE 教练' : projectMeta?.aiApp?.name || 'FDE 智能助手' }}</span>
              <span v-if="isStreaming && idx === messages.length - 1" class="assistant-message-status">正在回复</span>
            </div>
            <!-- Thinking Steps -->
            <ThinkingSummary v-if="!msg.systemNotice" :message="msg" :busy="isStreaming && idx === messages.length - 1 && !msg.thinkingDone" />

            <!-- System notice: 引擎回执(如已并入/已排队)，非 AI 回答，浅灰提示条 -->
            <div v-if="msg.systemNotice && (msg.displayContent || msg.content)" class="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-500">
              <i class="fa-solid fa-circle-info text-slate-400 text-[12px] shrink-0"></i>
              <span>{{ msg.displayContent || msg.content }}</span>
            </div>

            <!-- Message content: Doubao-style, no bubble, plain text on background -->
            <StreamingAnswer v-if="msg.content && !msg.systemNotice" :key="`${slug}:${msg.streamId || 'history'}:${idx}`"
              class="assistant-answer w-full leading-[1.85] text-[14px] text-slate-800 prose prose-slate max-w-none"
              :content="msg.content" :animate="Boolean(msg.streamId)" :streaming="isStreaming && idx === messages.length - 1"
              :stopped="msg.cancelled" :render="renderAssistantContent" @progress="followStreamingAnswer" @click="handleContentImgClick" />

            <!-- Action bar (always visible) -->
            <div v-if="msg.content && !msg.systemNotice" class="flex items-center gap-0.5 mt-2">
              <button @click="copyMessage(msg.content, idx)" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer" :title="copiedIdx === idx ? '已复制' : '复制'">
                <i class="text-[13px]" :class="copiedIdx === idx ? 'fa-solid fa-check text-emerald-500' : 'fa-regular fa-copy'"></i>
              </button>
              <button @click="msg.feedback = msg.feedback === 'up' ? null : 'up'" class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer" :class="msg.feedback === 'up' ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'" title="赞">
                <i class="text-[13px]" :class="msg.feedback === 'up' ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up'"></i>
              </button>
              <button @click="msg.feedback = msg.feedback === 'down' ? null : 'down'" class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer" :class="msg.feedback === 'down' ? 'text-danger bg-danger-soft' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'" title="踩">
                <i class="text-[13px]" :class="msg.feedback === 'down' ? 'fa-solid fa-thumbs-down' : 'fa-regular fa-thumbs-down'"></i>
              </button>
              <button @click="$emit('regenerate', idx)" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer" title="重新生成">
                <i class="fa-solid fa-rotate-right text-[13px]"></i>
              </button>

              <!-- More menu: 反馈 + 删除 -->
              <div class="relative">
                <button @click.stop="menuIdx = menuIdx === idx ? null : idx" class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer" :class="menuIdx === idx ? 'text-slate-700 bg-slate-100' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'" title="更多">
                  <i class="fa-solid fa-ellipsis text-[13px]"></i>
                </button>
                <div v-if="menuIdx === idx" class="absolute left-0 top-full mt-1 w-32 glass-card border border-slate-200/80 rounded-xl shadow-lg shadow-slate-900/10 py-1 z-30 overflow-hidden">
                  <button @click="$emit('feedback', idx); menuIdx = null" class="w-full px-3 py-2 flex items-center gap-2.5 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer">
                    <i class="fa-regular fa-comment-dots text-[12px] text-slate-400 w-4"></i>反馈
                  </button>
                  <button @click="$emit('delete', idx); menuIdx = null" class="w-full px-3 py-2 flex items-center gap-2.5 text-[13px] text-danger hover:bg-danger-soft transition-colors cursor-pointer">
                    <i class="fa-regular fa-trash-can text-[12px] w-4"></i>删除
                  </button>
                </div>
              </div>

              <span v-if="msg.timestamp" class="text-[12px] text-slate-400 ml-2 self-center">{{ msg.timestamp }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating input area (hidden when welcome hero is shown - it has its own input) -->
    <div v-if="messages.length > 0" class="chat-composer-dock absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-6 pb-4 px-4">
      <div class="w-full max-w-4xl mx-auto relative">
        <!-- Slash command palette -->
        <div v-if="showSlashMenu" class="absolute bottom-full mb-2 left-2 right-2 glass-card border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-900/5 overflow-hidden z-20 max-h-[220px] overflow-y-auto">
          <div
            v-for="(cmd, ci) in filteredCommands"
            :key="cmd.name || ci"
            @click="selectCommand(cmd)"
            class="px-3.5 py-2 hover:bg-blue-50/70 cursor-pointer flex items-center gap-3 text-[12px] transition-colors"
          >
            <span class="text-blue-600 font-mono font-semibold shrink-0">/{{ cmd.name }}</span>
            <span class="text-slate-500 truncate">{{ cmd.hint || cmd.description || '' }}</span>
          </div>
          <div v-if="filteredCommands.length === 0" class="px-4 py-3 text-[11px] text-slate-400 text-center">无匹配命令</div>
        </div>

        <!-- 简约输入框 -->
        <div class="fde-composer">
          <!-- Attachment preview (images + files) -->
          <div v-if="chatAttachments.length > 0" class="fde-composer-attachments flex items-center gap-2 px-5 pt-4 flex-wrap">
            <div v-for="(att, ai) in chatAttachments" :key="ai" class="relative group/att">
              <img v-if="att.type === 'image'" :src="'data:' + att.media_type + ';base64,' + att.data" class="w-14 h-14 object-cover rounded-xl border border-slate-200" />
              <div v-else class="flex items-center gap-2 h-14 px-3 rounded-xl border border-slate-200 glass-card max-w-[200px]">
                <i class="fa-solid fa-file-lines text-blue-500 text-base shrink-0"></i>
                <div class="min-w-0">
                  <div class="text-[12px] text-slate-700 truncate">{{ att.name }}</div>
                  <div class="text-[10px] text-slate-400">{{ att.text != null ? '文本' : '文件' }}</div>
                </div>
              </div>
              <button @click="chatAttachments.splice(ai, 1)" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700/90 hover:bg-danger text-white text-[9px] flex items-center justify-center transition-colors cursor-pointer shadow-sm">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          <textarea
            ref="inputRef"
            :aria-label="coachMode ? '发送给 FDE 教练的消息' : '发送给 AI 助手的消息'"
            v-model="inputText"
            :placeholder="isStreaming ? '正在回复…' : '向我提问…'"
            rows="1"
            :disabled="isStreaming"
            @input="autoGrow"
            @focus="isFocused = true"
            @blur="isFocused = false"
            class="scrollbar-hide disabled:opacity-60"
            @keydown.ctrl.enter.prevent="sendMessage"
            @keydown.meta.enter.prevent="sendMessage"
          ></textarea>

          <div class="fde-composer-toolbar">
            <div class="fde-composer-left">
              <AttachmentMenu :disabled="isStreaming" :recording="isRecording" :voice-supported="recordingSupported" commands
                @image="pickImage" @file="pickFile" @voice="toggleRecording" @command="triggerSlash" />
              <span v-if="isRecording" class="fde-composer-status">录音中 {{ recordSeconds }}s</span>
              <span v-else-if="isTranscribing" class="fde-composer-status">识别中…</span>
            </div>
            <div class="fde-composer-right">
              <ModelSelector minimal :models="availableModels" :current="currentModel" @change="(id) => $emit('change-model', id)" />
              <button type="button" class="fde-voice-button" :class="{ 'is-recording': isRecording }" :disabled="isStreaming || !recordingSupported || isTranscribing" @click="toggleRecording" :aria-label="isRecording ? '停止录音' : '语音输入'" :title="isRecording ? '停止录音' : '语音输入'"><i class="fa-solid" :class="isRecording ? 'fa-stop' : 'fa-microphone'" aria-hidden="true"></i></button>
              <button v-if="isStreaming" type="button" class="fde-send-button" @click="$emit('cancel')" title="停止生成" aria-label="停止生成"><i class="fa-solid fa-stop" style="font-size:12px" aria-hidden="true"></i></button>
              <button v-else type="button" class="fde-send-button" @click="sendMessage" aria-label="发送消息" :disabled="!inputText.trim() && chatAttachments.length === 0"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ImageLightbox :src="lightboxSrc" :visible="lightboxVisible" @close="lightboxVisible = false" />
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { marked } from 'marked';
import WelcomeHero from './WelcomeHero.vue';
import coachAvatar from '@/assets/fde-coach-avatar.png';
import ModelSelector from './ModelSelector.vue';
import AttachmentMenu from './AttachmentMenu.vue';
import './chat-composer.css';
import ImageLightbox from '@/components/common/ImageLightbox.vue';
import AttachmentChip from '@/components/common/AttachmentChip.vue';
import { prepareImage } from '@/composables/imagePrep';
import StreamingAnswer from './StreamingAnswer.vue';
import ThinkingSummary from './ThinkingSummary.vue';
import { cleanAssistantContent } from '@/data/assistant-content';

const props = defineProps({
  coachMode: { type: Boolean, default: false },
  branded: { type: Boolean, default: false },
  slug: { type: String, required: true },
  projectName: { type: String, default: '' },
  projectMeta: { type: Object, default: () => ({}) },
  messages: { type: Array, default: () => [] },
  isStreaming: { type: Boolean, default: false },
  elapsedSec: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  availableCommands: { type: Array, default: () => [] },
  availableModels: { type: Array, default: () => [] },
  currentModel: { type: String, default: '' },
});

const emit = defineEmits(['start-voice', 'send', 'send-quick', 'send-with-attachments', 'cancel', 'navigate', 'fork', 'regenerate', 'feedback', 'delete', 'change-model', 'preview-file']);

const inputText = ref('');
const inputRef = ref(null);
const chatContainerRef = ref(null);
const chatAttachments = ref([]);
const isFocused = ref(false);
const copiedIdx = ref(null);
const menuIdx = ref(null);

// 图片放大预览
const lightboxSrc = ref('');
const lightboxVisible = ref(false);
const openLightbox = (src) => {
  lightboxSrc.value = src;
  lightboxVisible.value = true;
};
const handleContentImgClick = (e) => {
  const dlBtn = e.target.closest('.chat-file-download');
  if (dlBtn) {
    e.stopPropagation();
    const fp = dlBtn.dataset.filepath;
    if (fp) window.api.fs.saveLocalFile(fp);
    return;
  }
  const openBtn = e.target.closest('.chat-file-open');
  if (openBtn) {
    e.stopPropagation();
    const fp = openBtn.dataset.filepath;
    if (fp) window.api.shell.openPath(fp);
    return;
  }
  const card = e.target.closest('.chat-delivery-card');
  if (card) {
    const fp = card.dataset.filepath;
    emit('preview-file', {
      filePath: fp,
      name: card.dataset.name,
      ext: card.dataset.ext,
      previewKind: card.dataset.previewkind,
      sizeLabel: card.dataset.sizelabel,
      ...(resolvedFiles.has(fp) ? resolvedFiles.get(fp) : {}),
    });
    return;
  }
  const img = e.target.closest('img.chat-inline-img');
  if (img) openLightbox(img.src);
};

// Auto-grow textarea like Doubao (single line -> expands up to max-h)
const autoGrow = () => {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = props.branded ? '34px' : 'auto';
  if (!props.branded) el.style.height = Math.min(el.scrollHeight, 132) + 'px';
};

const triggerSlash = () => {
  if (!inputText.value.startsWith('/')) {
    inputText.value = '/' + inputText.value;
  }
  showSlashMenu.value = true;
  inputRef.value?.focus();
};

const copyMessage = async (content, idx) => {
  try {
    await navigator.clipboard.writeText(content || '');
    copiedIdx.value = idx;
    setTimeout(() => { if (copiedIdx.value === idx) copiedIdx.value = null; }, 1500);
  } catch {
    // ignore clipboard failures
  }
};

// Close the "more" menu when clicking anywhere outside it
const closeMenu = () => { menuIdx.value = null; };
onMounted(() => document.addEventListener('click', closeMenu));
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenu);
  if (fileResolveTimer) clearTimeout(fileResolveTimer);
  fileResolverDisposed = true;
  try { if (mediaRecorder && isRecording.value) mediaRecorder.stop(); } catch { /* ignore */ }
  stopTracks();
});

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
        chatAttachments.value.push({ type: 'image', data, media_type, name: file.name });
      } catch (err) {
        console.error('[ChatPanel] pickImage failed for', file.name, err);
        alert(`「${file.name}」读取失败，已跳过`);
      }
    }
  };
  input.click();
};

// Plain text/code files are inlined whole by the server, so keep them modest.
// Rich documents (PDF/Word/Excel/PPT) get a larger cap — the server extracts
// their text, so the raw file (a few MB) just needs to arrive.
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
        chatAttachments.value.push({ type: 'file', text, media_type: file.type || 'text/plain', name: file.name });
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target.result.split(',')[1];
          chatAttachments.value.push({ type: 'file', data: base64, media_type: file.type || 'application/octet-stream', name: file.name });
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

// 识别失败时把录音落盘兜底，避免录音丢失；提示用户并可打开所在文件夹。
const saveRecordingOnFailure = async (base64, mime, errMsg) => {
  const reason = errMsg || '语音识别失败';
  if (!base64) { alert(reason); return; }
  const ext = (mime.split('/')[1] || 'webm').split(';')[0];
  let saved = null;
  try {
    saved = await window.api.hermes.saveRecording(props.slug || '', base64, ext);
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
        nextTick(() => { autoGrow(); inputRef.value?.focus(); });
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

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// Slash command menu
const showSlashMenu = ref(false);
const filteredCommands = computed(() => {
  const text = inputText.value;
  if (!text.startsWith('/')) return [];
  const query = text.slice(1).toLowerCase();
  const defaultCmds = [
    { name: 'compact', hint: '压缩上下文窗口' },
    { name: 'steer', hint: '给 AI 临时指令（如: /steer 用中文回答）' },
    { name: 'model', hint: '切换模型' },
    { name: 'tools', hint: '查看可用工具列表' },
    { name: 'context', hint: '查看上下文使用量' },
    { name: 'help', hint: '帮助' },
  ];
  const all = [...defaultCmds];
  if (!query) return all;
  return all.filter(c => c.name.includes(query));
});

const selectCommand = (cmd) => {
  inputText.value = `/${cmd.name} `;
  showSlashMenu.value = false;
  inputRef.value?.focus();
};

// Watch input for slash trigger
watch(inputText, (val) => {
  showSlashMenu.value = val.startsWith('/') && !val.includes(' ');
});

const sendMessage = () => {
  const text = inputText.value.trim();
  if (!text && chatAttachments.value.length === 0) return;
  if (chatAttachments.value.length > 0) {
    emit('send-with-attachments', text || '请分析这张图片', [...chatAttachments.value]);
  } else {
    emit('send', text);
  }
  inputText.value = '';
  chatAttachments.value = [];
  nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto';
  });
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
    }
  });
};

const followStreamingAnswer = () => {
  const el = chatContainerRef.value;
  // Follow growing text only while the reader is already at the bottom.
  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 100) scrollToBottom();
};

const scrollToMessage = (index) => {
  nextTick(() => {
    const el = chatContainerRef.value?.querySelector(`[data-msg-index="${index}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
};

const renderMarkdown = (text) => {
  if (!text) return '';
  try {
    return marked.parseInline(text);
  } catch {
    return text;
  }
};

const ALL_EXTS = 'png|jpg|jpeg|gif|svg|webp|bmp|ico|pdf|html|htm|xlsx|xls|csv|doc|docx|ppt|pptx|zip|rar|7z|gz|tar|mp3|mp4|wav|mov|avi|txt|md|json|js|ts|css|py|java|go|rs|sh|vue';
const IMG_EXTS_SET = new Set(['png','jpg','jpeg','gif','svg','webp','bmp','ico']);

function escAttr(s) { return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function deliveryCardHtml(fp, resolvedMeta) {
  const safePath = fp.replace(/\\/g, '/');
  const name = safePath.split('/').pop();
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const meta = resolvedMeta || {};
  const sizeLabel = meta.sizeLabel || '';
  const TEXT_EXTS = new Set(['md','txt','csv','json','js','ts','py','sh','css','xml','yaml','yml','vue','jsx','tsx','java','go','rs']);
  const VIDEO_EXTS = new Set(['mp4','m4v','mov','webm','ogv']);
  const AUDIO_EXTS = new Set(['mp3','wav','m4a','aac','ogg','oga','flac']);
  const previewKind = meta.previewKind || (IMG_EXTS_SET.has(ext) ? 'image' : ext === 'pdf' ? 'pdf' : VIDEO_EXTS.has(ext) ? 'video' : AUDIO_EXTS.has(ext) ? 'audio' : ['html','htm'].includes(ext) ? 'html' : TEXT_EXTS.has(ext) ? 'text' : 'unsupported');
  const isImg = IMG_EXTS_SET.has(ext);

  // Icon mapping
  const iconMap = {
    pdf: ['fa-file-pdf', '#e11d48', '#fff1f2'],
    doc: ['fa-file-word', 'var(--ui-brand)', 'var(--ui-brand-soft)'], docx: ['fa-file-word', 'var(--ui-brand)', 'var(--ui-brand-soft)'],
    xls: ['fa-file-excel', '#059669', '#ecfdf5'], xlsx: ['fa-file-excel', '#059669', '#ecfdf5'], csv: ['fa-file-excel', '#059669', '#ecfdf5'],
    ppt: ['fa-file-powerpoint', '#ea580c', '#fff7ed'], pptx: ['fa-file-powerpoint', '#ea580c', '#fff7ed'],
    zip: ['fa-file-zipper', '#d97706', '#fffbeb'], rar: ['fa-file-zipper', '#d97706', '#fffbeb'], '7z': ['fa-file-zipper', '#d97706', '#fffbeb'],
    png: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], jpg: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], jpeg: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'],
    gif: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], svg: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], webp: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'],
    mp3: ['fa-file-audio', 'var(--ui-violet)', 'var(--ui-violet-soft)'], wav: ['fa-file-audio', 'var(--ui-violet)', 'var(--ui-violet-soft)'],
    mp4: ['fa-file-video', 'var(--ui-pink)', 'var(--ui-pink-soft)'], mov: ['fa-file-video', 'var(--ui-pink)', 'var(--ui-pink-soft)'],
    html: ['fa-file-code', 'var(--ui-accent)', 'var(--ui-accent-soft)'], htm: ['fa-file-code', 'var(--ui-accent)', 'var(--ui-accent-soft)'],
    js: ['fa-file-code', 'var(--ui-accent)', 'var(--ui-accent-soft)'], json: ['fa-file-code', 'var(--ui-accent)', 'var(--ui-accent-soft)'], py: ['fa-file-code', 'var(--ui-accent)', 'var(--ui-accent-soft)'],
    md: ['fa-file-lines', 'var(--ui-brand)', 'var(--ui-brand-soft)'], txt: ['fa-file-lines', 'var(--ui-brand)', 'var(--ui-brand-soft)'],
  };
  const [icon, color, bg] = iconMap[ext] || ['fa-file', 'var(--ui-text-3)', 'var(--ui-bg-3)'];

  // Type label
  const typeLabels = {
    pdf:'PDF', doc:'Word', docx:'Word', xls:'Excel', xlsx:'Excel', csv:'CSV',
    ppt:'PPT', pptx:'PPT', zip:'ZIP', rar:'RAR', '7z':'7Z',
    png:'PNG', jpg:'JPEG', jpeg:'JPEG', gif:'GIF', svg:'SVG', webp:'WebP',
    mp3:'MP3', wav:'WAV', mp4:'MP4', mov:'MOV',
    html:'HTML', htm:'HTML', js:'JS', json:'JSON', py:'Python', md:'Markdown', txt:'文本',
  };
  const typeLabel = typeLabels[ext] || ext.toUpperCase() || '文件';
  const metaText = sizeLabel ? `${typeLabel} · ${sizeLabel}` : typeLabel;

  // Image thumbnail for image files
  const thumbHtml = isImg
    ? `<img src="file:///${escAttr(safePath.replace(/^\//, ''))}" class="chat-delivery-thumb" onerror="this.style.display='none'" />`
    : '';

  return `<div class="chat-delivery-card" data-filepath="${escAttr(safePath)}" data-name="${escAttr(name)}" data-ext=".${escAttr(ext)}" data-previewkind="${escAttr(previewKind)}" data-sizelabel="${escAttr(sizeLabel)}">`
    + `<div class="chat-delivery-icon" style="background:${bg}"><i class="fa-solid ${icon}" style="color:${color}"></i></div>`
    + `<div class="chat-delivery-main"><div class="chat-delivery-name">${escAttr(name)}</div><div class="chat-delivery-meta">${escAttr(metaText)}</div></div>`
    + thumbHtml
    + `<button class="chat-delivery-action chat-file-download" data-filepath="${escAttr(safePath)}" title="另存为…"><i class="fa-solid fa-download"></i></button>`
    + `<button class="chat-delivery-action chat-file-open" data-filepath="${escAttr(safePath)}" title="用系统程序打开"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`
    + `</div>`;
}

const IMG_EXTS = 'png|jpg|jpeg|gif|svg|webp|bmp|ico';
const FILE_EXTS = 'pdf|html|htm|xlsx|xls|csv|doc|docx|ppt|pptx|zip|rar|7z|gz|tar|mp3|mp4|wav|mov|avi|txt|md|json|js|ts|css|py|java|go|rs|sh|vue';

// 只有"正经交付物"才转成可下载卡片:文档 / 表格 / 演示 / 网页 / 压缩包 / 音视频 / md。
// 代码与参数文件(js/ts/py/json/css/sh/vue…)保持行内代码样式,不转卡片
// —— 它们通常是正文里顺带提到的参数/脚本,做成卡片既鸡肋又占地方。
const CARD_EXTS_SET = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx',
  'html', 'htm', 'md', 'txt',
  'zip', 'rar', '7z', 'gz', 'tar',
  'mp3', 'wav', 'mp4', 'mov', 'avi',
]);

const renderAssistantContent = (content) => {
  content=cleanAssistantContent(content);
  if (!content) return '';
  try {
    const card = (fp) => deliveryCardHtml(fp, resolvedFiles.get(fp));
    const imgTag = (fp) => {
      const resolved = resolvedFiles.get(fp);
      const absPath = (resolved && resolved.filePath) ? resolved.filePath : fp;
      const safePath = absPath.replace(/\\/g, '/').replace(/^\//, '');
      return `<img src="file:///${safePath}" class="max-w-[480px] rounded-lg border border-slate-200 my-2 cursor-zoom-in chat-inline-img" onerror="this.style.display='none'" />`;
    };
    // 非图片文件只有在项目目录里真实解析到(resolvedFiles)时才渲染成可下载卡片。
    // 否则返回 null —— 那只是模型正文里顺口提到的一个文件名(如讲解代码时的
    // run_agent.py / registry.py),本地并不存在,渲染成卡片会得到"打不开、下不了"的死卡片。
    const render = (fp) => {
      const ext = (fp.split('.').pop() || '').toLowerCase();
      if (IMG_EXTS_SET.has(ext)) {
        const isAbsolute = fp.startsWith('/');
        if (!isAbsolute && !resolvedFiles.has(fp)) return null;
        return imgTag(fp);
      }
      // 代码/参数类扩展名不转卡片,交给 marked 渲染成行内代码。
      if (!CARD_EXTS_SET.has(ext)) return null;
      if (!resolvedFiles.has(fp)) return null; // 未解析到的非图片文件 → 不转卡片
      return card(fp);
    };

    // Use placeholders so marked doesn't escape HTML inside table cells.
    // 返回 null 表示不转卡片:调用方应保留原始匹配文本,交给 marked 正常渲染。
    const placeholders = [];
    const ph = (fp) => {
      const html = render(fp);
      if (html == null) return null;
      const id = `XDLVR${placeholders.length}X`;
      placeholders.push(html);
      return id;
    };

    let processed = content;
    // 0. 反引号包裹的路径 `deliverables/中文名.md` —— 优先处理并连反引号一起吃掉,
    //    否则占位符会被 marked 包进 <code>,卡片 HTML 落在 <code> 里就坏了。
    //    这也是"md 只显示成一行代码文本、没转卡片"的主因(中文名 + 反引号)。
    processed = processed.replace(
      new RegExp('`\\s*((?:[\\w.\\-\\u4e00-\\u9fff]+\\/)*[\\w.\\-\\u4e00-\\u9fff]+\\.(' + ALL_EXTS + '))\\s*`', 'gi'),
      (m, fp) => ph(fp) ?? m
    );
    // 1. MEDIA: prefix
    processed = processed.replace(
      new RegExp(`MEDIA:([^\\s\\n]+\\.(${ALL_EXTS}))`, 'gi'),
      (m, fp) => ph(fp) ?? m
    );
    // 2. Bare absolute paths on their own line
    processed = processed.replace(
      new RegExp(`(?:^|\\n)[ \\t]*(?:\`)?(\\/[^\\s\`]+\\.(${ALL_EXTS}))(?:\`)?[ \\t]*(?:\\n|$)`, 'gim'),
      (m, fp) => { const id = ph(fp); return id == null ? m : '\n' + id + '\n'; }
    );
    // 3. Inline absolute paths (e.g. inside table cells)。字符类含 CJK,
    //    否则中文名文件(如 /x/带货方案.md)会漏配 → 不转卡片。
    processed = processed.replace(
      new RegExp(`(?<![\\w/:.])(\\/[^\\s\`<>|]+\\.(${ALL_EXTS}))(?![\\w/])`, 'gi'),
      (m, fp) => ph(fp) ?? m
    );
    // 4. Relative paths like assets/foo.png, output/report.pdf、deliverables/中文名.md
    //    字符类含中文(一-鿿),否则中文文件名会断在汉字处漏配。
    processed = processed.replace(
      new RegExp(`(?<![\\w/:.\\u4e00-\\u9fff])((?:[\\w.\\-\\u4e00-\\u9fff]+\\/)+[\\w.\\-\\u4e00-\\u9fff]+\\.(${ALL_EXTS}))(?![\\w/])`, 'gi'),
      (m, fp) => ph(fp) ?? m
    );
    // 5. Markdown image syntax (only images)
    processed = processed.replace(
      new RegExp(`!\\[[^\\]]*\\]\\((\\/[^)]+\\.(${IMG_EXTS}))\\)`, 'gi'),
      (m, fp) => ph(fp) ?? m
    );
    // 6. Bare Chinese-prose filename
    processed = processed.replace(
      new RegExp(`(?:已生成[：:.]\\s*|生成了\\s*)([^\\s，。、\\n]+\\.(${ALL_EXTS}))`, 'gi'),
      (m, fn) => { const id = ph(fn); return id == null ? m : m.replace(fn, id); }
    );

    // Let marked parse (placeholders are plain text, won't be escaped)
    let html = marked.parse(processed);

    // Replace placeholders with actual HTML
    for (let i = 0; i < placeholders.length; i++) {
      html = html.replace(`XDLVR${i}X`, placeholders[i]);
    }
    return html;
  } catch {
    return content;
  }
};

// Async file metadata resolution cache
const resolvedFiles = reactive(new Map());
const resolveQueue = new Set();
const missingFiles = new Map();
let fileResolveTimer = null;
let fileResolverDisposed = false;

async function resolveFileRefs(content) {
  if (!content) return;
  const allExtsRe = new RegExp(`(?:MEDIA:|(?:^|[\\s|(\`]))([^\\s，。、\\n|)<>\`]*\\.(${ALL_EXTS}))`, 'gim');
  let match;
  const refs = new Set();
  while ((match = allExtsRe.exec(content)) !== null) {
    const fp = match[1];
    if (fp && !resolvedFiles.has(fp) && !resolveQueue.has(fp) && !fp.startsWith('http') && Date.now() - (missingFiles.get(fp) || 0) > 20000) refs.add(fp);
  }
  const slug = props.slug;
  for (const fp of refs) resolveQueue.add(fp);
  for (const fp of refs) {
    if (fileResolverDisposed || props.slug !== slug) { resolveQueue.delete(fp); continue; }
    try {
      const res = await window.api.hermes.resolveFileRef(slug, fp);
      if (fileResolverDisposed || props.slug !== slug) continue;
      if (res && res.success && res.file) {
        resolvedFiles.set(fp, res.file);
      } else missingFiles.set(fp, Date.now());
    } catch { missingFiles.set(fp, Date.now()); }
    finally { resolveQueue.delete(fp); }
  }
}

watch(() => props.slug, () => { resolvedFiles.clear(); missingFiles.clear(); resolveQueue.clear(); });
watch(() => [props.isStreaming, ...props.messages.filter(msg => msg.role === 'assistant').map(msg => msg.content)], () => {
  if (fileResolveTimer) clearTimeout(fileResolveTimer);
  fileResolveTimer = setTimeout(() => {
    if (fileResolverDisposed) return;
    if (!props.isStreaming) missingFiles.clear();
    resolveFileRefs(props.messages.filter(msg => msg.role === 'assistant').map(msg => msg.content || '').join('\n'));
  }, 250);
}, { immediate: true });

function setDraft(text) {
  inputText.value = text;
  nextTick(() => { autoGrow(); inputRef.value?.focus(); });
}
defineExpose({ scrollToBottom, scrollToMessage, setDraft });
</script>

<style scoped>
.chat-surface { isolation:isolate; background:#fff; }
.chat-surface--welcome { background:#fff; }
.chat-surface--branded .fde-composer { min-height:52px; padding:8px 10px; border-radius:28px; }
.chat-surface--branded .fde-composer textarea { min-height:34px; height:34px!important; max-height:34px; padding:6px 2px; }
.chat-surface--branded .fde-send-button { width:32px; height:32px; font-size:15px; }
.chat-surface--branded :deep(.attachment-trigger) { width:34px; height:34px; }
.chat-scroll { position:relative; z-index:1; scrollbar-gutter:stable; }
.chat-composer-dock { z-index:5; pointer-events:auto; }
.chat-transcript { max-width:820px; padding:20px 24px 24px; background:#fff; border:1px solid #edf1f7; border-radius:16px; }
.assistant-message-heading { display:flex; align-items:center; gap:9px; margin-bottom:12px; font-size:12px; color:#475569; font-weight:500; }
.assistant-message-heading img { width:30px; height:30px; object-fit:cover; border-radius:50%; border:1px solid #e3ecf8; }
.assistant-message-status { font-size:11px; color:#2563eb; font-weight:400; }
.assistant-answer { overflow-wrap:anywhere; }
.chat-composer-dock > div { max-width:788px; }
.chat-composer { background:#fff!important; border-color:#dce5f3; box-shadow:0 4px 20px rgba(39,71,119,.06)!important; }
.chat-composer:focus-within { border-color:#8aafff; }
.composer-toolbar { flex-wrap:wrap; gap:8px; }
.composer-tools { min-width:0; flex-wrap:wrap; }
.chat-composer button:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }

/* Ensure markdown content renders correctly inside chat bubbles */
:deep(.prose) {
  font-size: 13.5px;
  line-height: 1.75;
}
:deep(.prose p) {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}
:deep(.prose ul),
:deep(.prose ol) {
  margin-top: 0.4em;
  margin-bottom: 0.4em;
  padding-left: 1.5em;
}
:deep(.prose li) {
  margin-top: 0.15em;
  margin-bottom: 0.15em;
}
:deep(.prose table) {
  font-size: 12px;
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}
:deep(.prose th),
:deep(.prose td) {
  border: 1px solid var(--ui-line-2);
  padding: 0.4em 0.6em;
  text-align: left;
}
:deep(.prose th) {
  background: var(--ui-bg-3);
  font-weight: 600;
}
:deep(.prose strong) {
  font-weight: 700;
  color: var(--ui-ink-2);
}
:deep(.prose code) {
  font-size: 12px;
  background: var(--ui-bg-2);
  padding: 0.15em 0.35em;
  border-radius: 4px;
  color: var(--ui-text);
}
:deep(.prose pre) {
  background: var(--ui-ink-2);
  color: var(--ui-line-2);
  padding: 0.75em 1em;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  margin: 0.5em 0;
}
:deep(.prose pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
:deep(.prose hr) {
  border-color: var(--ui-line-2);
  margin: 0.75em 0;
}
:deep(.prose h1),
:deep(.prose h2),
:deep(.prose h3),
:deep(.prose h4) {
  margin-top: 0.8em;
  margin-bottom: 0.3em;
  font-weight: 700;
  color: var(--ui-ink-2);
}
:deep(.prose h1) { font-size: 1.1em; }
:deep(.prose h2) { font-size: 1.05em; }
:deep(.prose h3) { font-size: 1em; }
:deep(.prose blockquote) {
  border-left: 3px solid var(--ui-brand);
  padding-left: 0.75em;
  color: var(--ui-text);
  margin: 0.5em 0;
}
:deep(.chat-delivery-card) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 340px;
  padding: 6px 8px 6px 7px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e8e8e4;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  margin: 5px 4px 5px 0;
  vertical-align: middle;
}
:deep(.chat-delivery-card:hover) {
  border-color: var(--ui-line);
  box-shadow: 0 1px 4px rgba(15,23,42,0.06);
}
:deep(.chat-delivery-icon) {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
}
:deep(.chat-delivery-main) {
  min-width: 0;
  max-width: 200px;
}
:deep(.chat-delivery-name) {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ui-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
:deep(.chat-delivery-meta) {
  font-size: 10.5px;
  color: var(--ui-text-3);
  margin-top: 1px;
}
:deep(.chat-delivery-thumb) {
  width: 34px;
  height: 34px;
  object-fit: cover;
  border-radius: 7px;
  border: 1px solid var(--ui-line-2);
  flex-shrink: 0;
}
:deep(.chat-delivery-action) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ui-text-3);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
  font-size: 11px;
}
:deep(.chat-delivery-action:hover) {
  background: var(--ui-bg-2);
  color: var(--ui-ink-3);
}
</style>
