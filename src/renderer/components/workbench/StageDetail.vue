<template>
  <div class="flex flex-col h-full min-h-0 bg-transparent">
    <!-- 顶部:返回 + 阶段标题 -->
    <div class="flex items-center gap-3 px-6 py-4 glass-card border-b border-slate-200/80 shrink-0">
      <button
        :disabled="documentEditing"
        @click="$emit('back')"
        class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
        title="返回工作台"
      >
        <i class="fa-solid fa-arrow-left text-sm"></i>
      </button>
      <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-[13px] font-semibold flex items-center justify-center">{{ stage.id }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 class="text-[15px] font-semibold text-slate-800 truncate">{{ stage.name }}</h2>
          <span v-if="stage.isCore" class="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium shrink-0">核心阶段</span>
        </div>
        <p class="text-[12px] text-slate-500 truncate">{{ stage.goal }}</p>
      </div>
      <button
        v-if="stage.id === 1"
        @click="$emit('coach')"
        class="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium bg-gradient-to-br from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 transition-all cursor-pointer shadow-sm shrink-0"
      >
        <i class="fa-solid fa-headset text-[12px]"></i>
        <span>进入教练陪练</span>
      </button>
    </div>

    <!-- 主体:左文件列表 + 右预览 -->
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <!-- 左侧:要素 + 文件清单 -->
      <div class="w-[340px] shrink-0 border-r border-slate-200/80 overflow-y-auto glass-card">
        <!-- 要素卡 -->
        <div class="p-4 space-y-3 border-b border-slate-100">
          <div class="bg-slate-50 rounded-xl p-3">
            <div class="text-[11px] text-slate-400 mb-1"><i class="fa-solid fa-arrow-right-to-bracket mr-1"></i>输入</div>
            <div class="flex flex-wrap gap-1">
              <span v-for="inp in stage.inputs" :key="inp" class="text-[11px] px-1.5 py-0.5 rounded glass-card text-slate-600 border border-slate-200/60">{{ inp }}</span>
            </div>
          </div>
          <div class="bg-slate-50 rounded-xl p-3">
            <div class="text-[11px] text-slate-400 mb-1"><i class="fa-solid fa-user-gear mr-1"></i>负责人 / 节奏</div>
            <div class="text-[12px] text-slate-700">{{ stage.owner }}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">{{ stage.rhythm || stage.duration }}</div>
          </div>
          <div v-if="stage.successCriteria" class="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100/70">
            <div class="text-[11px] text-emerald-600/80 mb-1"><i class="fa-solid fa-circle-check mr-1"></i>过关标准</div>
            <div class="text-[12px] text-slate-600 leading-relaxed">{{ stage.successCriteria }}</div>
          </div>
        </div>

        <!-- 分组独立展开；同一文档的不同格式合并成一个入口。 -->
        <div v-for="group in navigationGroups" :key="group.key" class="px-4 pt-3 pb-1">
          <button type="button" class="flex min-h-9 w-full items-center gap-2 rounded-lg px-1 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50" :aria-expanded="!collapsedGroups.has(group.key)" @click="toggleGroup(group.key)">
            <i class="fa-solid w-3 text-[10px] text-slate-400" :class="collapsedGroups.has(group.key) ? 'fa-chevron-right' : 'fa-chevron-down'" aria-hidden="true"></i>
            <i :class="[group.icon, knColor(group.color).icon, 'text-[11px]']" aria-hidden="true"></i>
            <span>{{ group.label }}</span><span class="text-[10px] font-normal text-slate-400">{{ group.items.length }} 份</span>
          </button>
          <div v-if="!collapsedGroups.has(group.key)" class="ml-3 mt-1">
            <button v-for="item in group.items" :key="item.file" type="button" :disabled="documentEditing" @click="select(item)" class="mb-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-60" :class="isActive(item) ? knColor(group.color).active : 'hover:bg-slate-50'">
              <i class="fa-solid fa-file-lines shrink-0 text-[12px]" :class="knColor(group.color).icon" aria-hidden="true"></i><span class="min-w-0 flex-1 truncate text-[12px] text-slate-700">{{ item.title }}</span>
            </button>
          </div>
        </div>

        <div v-if="!items.length" class="p-8 text-center text-slate-400">
          <i class="fa-solid fa-graduation-cap text-xl mb-2"></i>
          <p class="text-[12px]">本阶段暂无内置文档</p>
        </div>
      </div>

      <!-- 右侧:预览 -->
      <div class="flex-1 min-w-0 min-h-0">
        <DocViewer v-if="activeItem" :stage="stage.dir" :item="activeItem" :key="activeItem.file" @editing-change="documentEditing = $event" @close="activeItem = null" />
        <div v-else class="h-full flex flex-col items-center justify-center text-slate-300">
          <i class="fa-solid fa-hand-pointer text-3xl mb-3"></i>
          <p class="text-[13px] text-slate-400">从左侧选择一份文档查看</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import DocViewer from './DocViewer.vue';
import { uniqueHandbookDocuments } from '@/data/handbook-documents';

const props = defineProps({
  initialFile: {type:String, default:''},
  stage: { type: Object, required: true },        // 合并了 fde-stages + manifest 的阶段对象
});
defineEmits(['back', 'coach']);

const items = computed(() => uniqueHandbookDocuments(props.stage.items || []));
const knowledgeItems = computed(() => items.value.filter((i) => i.category === 'knowledge'));
const deliverableItems = computed(() => items.value.filter((i) => i.category === 'deliverable'));
const specItems = computed(() => items.value.filter((i) => i.category === 'spec' || i.category === 'other'));

// 知识按子类型(调研/技术/产品)分区;无 knowledgeType 的归到「通用知识」
const KNOWLEDGE_GROUP_ORDER = ['调研', '技术', '产品', ''];
const KNOWLEDGE_GROUP_META = {
  调研: { label: '调研知识', icon: 'fa-solid fa-magnifying-glass', color: 'emerald' },
  技术: { label: '技术知识', icon: 'fa-solid fa-microchip', color: 'indigo' },
  产品: { label: '产品知识', icon: 'fa-solid fa-cube', color: 'blue' },
  '':   { label: '通用知识', icon: 'fa-solid fa-book', color: 'emerald' },
};
const knowledgeGroups = computed(() => {
  const kn = knowledgeItems.value;
  if (!kn.length) return [];
  return KNOWLEDGE_GROUP_ORDER
    .map((t) => ({
      type: t,
      label: KNOWLEDGE_GROUP_META[t].label,
      icon: KNOWLEDGE_GROUP_META[t].icon,
      color: KNOWLEDGE_GROUP_META[t].color,
      items: kn.filter((i) => (i.knowledgeType || '') === t),
    }))
    .filter((g) => g.items.length);
});

const navigationGroups = computed(() => [
  ...knowledgeGroups.value.map(group => ({...group, key:`knowledge:${group.type}`})),
  {key:'deliverables', label:'交付物', icon:'fa-solid fa-box-open', color:'blue', items:deliverableItems.value},
  {key:'spec', label:'规范说明', icon:'fa-solid fa-scroll', color:'indigo', items:specItems.value},
].filter(group => group.items.length));
const collapsedGroups = ref(new Set());
const documentEditing = ref(false);
function toggleGroup(key) {
  const next = new Set(collapsedGroups.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  collapsedGroups.value = next;
}
const activeItem = ref(null);
const select = (it) => { activeItem.value = it; };
const isActive = (it) => activeItem.value && activeItem.value.file === it.file;

// 知识分区配色(固定 class 字符串,避免 tailwind purge 动态拼接)
const KN_COLOR = {
  emerald: { icon: 'text-emerald-500', active: 'bg-emerald-50 ring-1 ring-emerald-200' },
  indigo:  { icon: 'text-indigo-500',  active: 'bg-indigo-50 ring-1 ring-indigo-200' },
  blue:    { icon: 'text-blue-500',    active: 'bg-blue-50 ring-1 ring-blue-200' },
};
const knColor = (c) => KN_COLOR[c] || KN_COLOR.emerald;

// 默认选中第一个可预览的文档
const pickDefault = () => {
  const first = items.value.find(i => [i.file, i.sourceMarkdown, ...(i.originalFiles || []).map(v => v.file)].includes(props.initialFile)) || items.value.find((i) => i.previewable) || items.value[0] || null;
  activeItem.value = first;
};
watch([() => props.stage, () => props.initialFile], pickDefault, { immediate: true });
</script>
