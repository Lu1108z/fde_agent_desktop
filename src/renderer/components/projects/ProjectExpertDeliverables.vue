<template>
  <section class="ped">
    <header class="ped-head">
      <div>
        <h2>专家交付</h2>
        <p>用 AI 专家为本项目制作宣发物料和交付文档。专家会自动读取项目需求、已生成的交付物和项目资料，成果归档到这里。</p>
      </div>
      <button type="button" :disabled="loading" @click="refresh"><i class="fa-solid fa-arrows-rotate"></i>{{ loading ? '读取中…' : '刷新' }}</button>
    </header>
    <div v-if="error" class="ped-error" role="alert">{{ error }}<button type="button" @click="refresh">重试</button></div>

    <h3 class="ped-title">交给专家做</h3>
    <div class="ped-experts">
      <button v-for="e in experts" :key="e.id" type="button" class="ped-expert" @click="startExpert(e)">
        <AppAvatar :app="e" :size="40" />
        <span class="min-w-0 flex-1 text-left">
          <strong>{{ e.name }}</strong>
          <small>{{ e.hint }}</small>
        </span>
        <span v-if="countFor(e.id)" class="ped-count" :title="`已有 ${countFor(e.id)} 份成果`">{{ countFor(e.id) }}</span>
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>

    <h3 class="ped-title">成果文件 <span>{{ files.length }}</span></h3>
    <div v-if="files.length" class="ped-files">
      <div v-for="f in files" :key="f.relPath" class="ped-file">
        <i :class="iconOf(f.name)"></i>
        <span class="min-w-0 flex-1">
          <strong>{{ f.name }}</strong>
          <small>{{ expertName(f.expertId) }} · {{ sizeOf(f.size) }} · {{ dateOf(f.mtimeMs) }}</small>
        </span>
        <button type="button" @click="act(f, 'open')">打开</button>
        <button type="button" @click="act(f, 'reveal')">在文件夹中显示</button>
      </div>
    </div>
    <p v-else-if="!loading" class="ped-empty">还没有专家成果。点上面的专家开始，成果文件会自动保存到项目的 deliverables 目录并显示在这里。</p>

    <h3 v-if="sessions.length" class="ped-title">专家对话 <span>{{ sessions.length }}</span></h3>
    <div v-if="sessions.length" class="ped-sessions">
      <button v-for="s in sessions" :key="s.slug" type="button" @click="openSession(s)">
        <i class="fa-regular fa-message"></i>
        <span class="min-w-0 flex-1 truncate text-left">{{ s.name }}</span>
        <small>{{ s.expertName }} · {{ dateOf(s.updatedAt) }}</small>
      </button>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppAvatar from '@/components/apps/AppAvatar.vue';
import { builtinAiApps } from '@/data/ai-apps';

const props = defineProps({ slug: { type: String, required: true } });
const router = useRouter();

// 项目里常用的交付型专家（顺序即推荐顺序）；知识问答类专家不放这里
const HINTS = {
  'prototype-maker': '按需求做可点击的多页面原型',
  'whitepaper-writer': '产品白皮书 Word',
  'product-intro': '产品介绍 Word',
  'manual-writer': '操作手册 Word',
  'ppt-maker': '汇报 / 方案 PPT',
  'promo-film': '产品宣传视频',
  'image-generation': '海报、配图、架构图',
};
const experts = computed(() => Object.keys(HINTS).map((id) => builtinAiApps.find((a) => a.id === id)).filter(Boolean).map((a) => ({ ...a, hint: HINTS[a.id] })));
const expertName = (id) => builtinAiApps.find((a) => a.id === id)?.name || id || '专家';

const loading = ref(false), error = ref(''), files = ref([]), sessions = ref([]);
const countFor = (id) => files.value.filter((f) => f.expertId === id).length;
let seq = 0;
async function refresh() {
  const n = ++seq; loading.value = true; error.value = '';
  try {
    const r = await window.api.hermes.expertDeliverables(props.slug);
    if (n !== seq) return;
    if (!r?.success) throw Error(r?.error || '读取失败');
    files.value = r.files || []; sessions.value = r.sessions || [];
  } catch (e) { if (n === seq) error.value = e.message === 'No handler registered for \'hermes:expert-deliverables\'' ? '请完全退出应用后重新打开' : (e.message || '读取失败'); }
  finally { if (n === seq) loading.value = false; }
}
function startExpert(e) { router.push({ path: `/apps/${e.id}`, query: { project: props.slug } }); }
function openSession(s) { router.push({ path: `/apps/${s.expertId}`, query: { session: s.slug } }); }
async function act(f, action) {
  const r = await window.api.hermes.projectFileAction(props.slug, f.relPath, action);
  if (!r?.success) error.value = r?.error || '无法打开文件';
}
function iconOf(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  if (ext === 'docx' || ext === 'doc') return 'fa-solid fa-file-word text-blue-600';
  if (ext === 'pptx' || ext === 'ppt') return 'fa-solid fa-file-powerpoint text-orange-500';
  if (ext === 'pdf') return 'fa-solid fa-file-pdf text-red-500';
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'fa-solid fa-file-video text-violet-500';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) return 'fa-solid fa-file-image text-emerald-600';
  if (ext === 'html') return 'fa-solid fa-file-code text-sky-600';
  return 'fa-regular fa-file text-slate-500';
}
const sizeOf = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
function dateOf(v) {
  const d = new Date(typeof v === 'number' ? v : Date.parse(v));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
onMounted(refresh);
watch(() => props.slug, refresh);
</script>

<style scoped>
.ped { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 24px 28px; color: #334155; background: #fff; font-size: 13px; line-height: 1.6; }
.ped-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
.ped-head h2 { font-size: 20px; font-weight: 600; color: #172036; }
.ped-head p { font-size: 13px; color: #64748b; margin-top: 4px; max-width: 640px; }
.ped button { font-size: 12px; line-height: 1.5; border: 1px solid #dbe4f0; border-radius: 8px; background: #fff; padding: 7px 12px; color: #475569; cursor: pointer; flex-shrink: 0; }
.ped button:hover:not(:disabled) { border-color: #93b4fb; background: #f5f8ff; color: #2563eb; }
.ped button:disabled { opacity: .55; cursor: not-allowed; }
.ped-head button i { margin-right: 6px; }
.ped-error { padding: 10px 14px; margin-bottom: 16px; border-radius: 8px; background: #fff1f2; color: #b91c1c; }
.ped-error button { margin-left: 12px; }
.ped-title { font-size: 14px; font-weight: 600; margin: 22px 0 12px; color: #172036; }
.ped-title span { font-weight: 400; color: #94a3b8; margin-left: 4px; }
.ped-experts { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.ped .ped-expert { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; }
.ped-expert strong { display: block; font-size: 13.5px; font-weight: 600; color: #1e293b; }
.ped-expert small { display: block; font-size: 12px; color: #64748b; }
.ped-expert > i { font-size: 11px; color: #94a3b8; }
.ped-count { min-width: 20px; padding: 0 6px; border-radius: 999px; background: #e8f0ff; color: #2563eb; font-size: 11px; text-align: center; }
.ped-files, .ped-sessions { display: grid; gap: 8px; }
.ped-file { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; }
.ped-file > i { font-size: 20px; width: 22px; text-align: center; }
.ped-file strong { display: block; font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
.ped-file small, .ped-sessions small { display: block; font-size: 11.5px; color: #94a3b8; }
.ped .ped-sessions button { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
.ped-sessions i { color: #2563eb; }
.ped-empty { padding: 20px; border: 1px dashed #dbe4f0; border-radius: 10px; color: #64748b; text-align: center; }
</style>
