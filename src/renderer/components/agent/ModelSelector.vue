<template>
  <div class="relative" ref="rootRef">
    <!-- Trigger：与旁边「智能体」胶囊同款样式。用内联 style 强制字号，
         杜绝任何 class 优先级/继承导致的字号偏大。 -->
    <button
      @click.stop="toggleOpen"
      :style="{fontSize: minimal ? '12px' : '10px', lineHeight:1, fontWeight:400}"
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors cursor-pointer max-w-[220px]"
      :class="[minimal && 'model-select-minimal', open
        ? 'bg-blue-100 border-blue-200 text-blue-700'
        : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100']"
      :title="currentLabel"
      :aria-label="'选择模型：' + (currentShort || '未选择')"
      :aria-expanded="open"
    >
      <i v-if="!minimal" class="fa-solid fa-microchip shrink-0" style="font-size:9px"></i>
      <span class="truncate" :style="{fontSize: minimal ? '12px' : '10px'}">{{ currentShort || '选择模型' }}</span>
      <i class="fa-solid fa-chevron-down ml-0.5 shrink-0 transition-transform duration-200" style="font-size:7px"
        :class="open ? 'rotate-180' : ''"></i>
    </button>

    <!-- Dropdown：挂到 body、按按钮实际位置固定定位，不会被任何滚动容器（overflow）裁掉；
         默认向上弹，上方放不下才向下；横向贴按钮，超出窗口就往回收。 -->
    <Teleport to="body">
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="open"
        ref="menuRef"
        :style="menuStyle"
        class="model-options-menu fixed z-[1000] w-[280px] rounded-2xl border border-slate-200/80 glass-card shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col"
      >
        <!-- Search -->
        <div class="p-2.5 border-b border-slate-100">
          <div class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-300"></i>
            <input
              ref="searchRef"
              v-model="query"
              type="text"
              placeholder="搜索模型…"
              class="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-transparent text-[12.5px] placeholder:text-slate-300 focus:outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
          </div>
        </div>

        <!-- List -->
        <div class="overflow-y-auto flex-1 p-1.5 space-y-0.5">
          <div v-if="filtered.length === 0" class="px-3 py-8 text-center text-[12px] text-slate-400">
            <i class="fa-regular fa-face-frown mb-2 block text-lg text-slate-300"></i>
            无匹配模型
          </div>
          <button
            v-for="item in filtered"
            :key="item.id"
            @click="select(item.id)"
            class="model-option w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left transition-colors cursor-pointer"
            :class="isCurrent(item.id) ? 'bg-blue-50' : 'hover:bg-slate-50'"
          >
            <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px]"
              :class="isCurrent(item.id) ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'">
              <i :class="brandIcon(item.id)"></i>
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-[12.5px] truncate"
                :class="isCurrent(item.id) ? 'font-semibold text-blue-700' : 'text-slate-700'">
                {{ item.label }}
              </div>
              <div class="text-[10px] text-slate-400 truncate">{{ item.id }}</div>
            </div>
            <i v-if="isCurrent(item.id)" class="fa-solid fa-check text-[11px] text-blue-500 shrink-0"></i>
          </button>
        </div>
      </div>
    </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { FIXED_MODELS } from '../../constants/models.js';

const props = defineProps({
  minimal: { type: Boolean, default: false },
  // 每项可为字符串，或 { model_id | id, name, description }
  models: { type: Array, default: () => [] },
  current: { type: String, default: '' },
});

const emit = defineEmits(['change']);

const open = ref(false);
const query = ref('');
const rootRef = ref(null);
const searchRef = ref(null);

// 去掉 provider 前缀（openai-api:anthropic/claude-opus-4.8 → anthropic/claude-opus-4.8）
function stripProvider(id) {
  const s = String(id || '');
  const i = s.lastIndexOf(':');
  return i >= 0 ? s.slice(i + 1) : s;
}

// 归一化：统一成 { id, label }，按去前缀名去重。
// 数据源是主进程 hermes:list-models，只返回管理员固定的模型（FIXED_MODELS），名字用中文显示名。
const normalized = computed(() => {
  const all = (props.models || []).map((m) => {
    if (typeof m === 'string') return { id: m };
    const id = m.modelId || m.model_id || m.id || m.model || '';
    return { id, label: m.name };
  }).filter((m) => m.id);

  // 同一模型可能带不同 provider 前缀重复出现，按裸名去重（保留第一个）。
  const byBare = new Map();
  for (const m of all) {
    const bare = stripProvider(m.id);
    if (FIXED_MODELS.some(model => model.id === bare) && !byBare.has(bare)) byBare.set(bare, m);
  }

  const picked = [];
  for (const [bare, m] of byBare) {
    picked.push({ id: m.id, label: m.label || shortName(m.id), description: bare });
  }
  return picked;
});

// 取最后一段作为短名（deepseek/deepseek-v4-pro → deepseek-v4-pro）
function shortName(id) {
  if (!id) return '';
  const parts = String(id).split('/');
  return parts[parts.length - 1];
}

// 判断某项是否为「当前模型」。current 可能带不同前缀
// （如 custom:openai-api:anthropic/claude-opus-4.8 vs openai-api:anthropic/...），
// 统一去到最后一段裸名比较，容错。
function bareModel(id) {
  const s = String(id || '');
  const noProv = s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s;
  return noProv; // e.g. anthropic/claude-opus-4.8
}
function isCurrent(id) {
  if (!id || !props.current) return false;
  return bareModel(id) === bareModel(props.current);
}

// 按厂商给个小图标
function brandIcon(id) {
  const s = String(id).toLowerCase();
  if (s.includes('claude') || s.includes('anthropic')) return 'fa-solid fa-star';
  if (s.includes('deepseek')) return 'fa-solid fa-water';
  if (s.includes('gpt') || s.includes('openai')) return 'fa-solid fa-bolt';
  if (s.includes('kimi') || s.includes('moonshot')) return 'fa-solid fa-moon';
  if (s.includes('glm') || s.includes('z-ai')) return 'fa-solid fa-cube';
  if (s.includes('qwen')) return 'fa-solid fa-feather';
  if (s.includes('minimax')) return 'fa-solid fa-wave-square';
  return 'fa-solid fa-microchip';
}

const currentLabel = computed(() => {
  const hit = normalized.value.find((m) => isCurrent(m.id));
  return hit ? hit.label : shortName(bareModel(props.current));
});

const currentShort = computed(() => currentLabel.value);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return normalized.value;
  return normalized.value.filter(
    (m) => m.id.toLowerCase().includes(q) || (m.label || '').toLowerCase().includes(q)
  );
});

const MENU_W = 280, MENU_MAX_H = 340, GAP = 8, EDGE = 12;
const menuRef = ref(null);
const menuStyle = ref({});

// 按按钮在视口中的位置算浮层坐标：优先向上，上方不够且下方更宽裕时向下；
// 横向默认与按钮左对齐（minimal 时右对齐），再夹到窗口内，保证完整可见。
function placeMenu() {
  const btn = rootRef.value?.getBoundingClientRect();
  if (!btn) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const above = btn.top - GAP - EDGE, below = vh - btn.bottom - GAP - EDGE;
  const up = above >= Math.min(MENU_MAX_H, 200) || above >= below;
  const maxHeight = Math.max(120, Math.min(MENU_MAX_H, up ? above : below));
  let left = props.minimal ? btn.right - MENU_W : btn.left;
  left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - MENU_W - EDGE));
  menuStyle.value = up
    ? { left: `${left}px`, bottom: `${vh - btn.top + GAP}px`, maxHeight: `${maxHeight}px` }
    : { left: `${left}px`, top: `${btn.bottom + GAP}px`, maxHeight: `${maxHeight}px` };
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    query.value = '';
    placeMenu();
    nextTick(() => searchRef.value && searchRef.value.focus());
  }
}

function select(id) {
  open.value = false;
  if (id) emit('change', id);
}

function onDocClick(e) {
  if (rootRef.value?.contains(e.target) || menuRef.value?.contains(e.target)) return;
  open.value = false;
}
// 页面滚动或窗口尺寸变化时跟着按钮重新定位
function onReflow() { if (open.value) placeMenu(); }
function onKey(e) { if (e.key === 'Escape') open.value = false; }

onMounted(() => {
  document.addEventListener('click', onDocClick);
  window.addEventListener('resize', onReflow);
  window.addEventListener('scroll', onReflow, true);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  window.removeEventListener('resize', onReflow);
  window.removeEventListener('scroll', onReflow, true);
  document.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.model-select-minimal { height:34px; max-width:190px; border-color:transparent!important; border-radius:8px; background:transparent!important; padding:6px 8px; color:#475569!important; }
.model-select-minimal:hover { background:#f1f5fb!important; }
button:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }
.model-options-menu{background:var(--color-surface,#fff);border-color:var(--color-border,#e4e9f2);border-radius:12px;box-shadow:0 8px 28px #20365516}.model-option{border-radius:7px}.model-option:hover,.model-option:focus-visible{background:var(--ui-brand-soft,#eff4ff)}
</style>
