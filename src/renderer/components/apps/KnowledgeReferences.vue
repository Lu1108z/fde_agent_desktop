<template>
  <div v-if="sources.length || codes.length" class="kr">
    <button type="button" class="kr-toggle" :aria-expanded="open" @click="open = !open">
      <i class="fa-solid fa-book-medical" aria-hidden="true"></i>
      <span>参考 {{ documentCount }} 份资料<template v-if="codes.length">，{{ codes.length }} 条编码</template></span>
      <span v-if="mode === 'keyword'" class="kr-mode" title="向量检索暂不可用，本轮按关键词检索">关键词检索</span>
      <i class="fa-solid fa-chevron-down kr-chevron" :class="{ 'kr-chevron--open': open }" aria-hidden="true"></i>
    </button>
    <div v-if="open" class="kr-body">
      <div v-if="codes.length" class="kr-codes">
        <div v-for="(c, i) in codes" :key="i" class="kr-code">
          <span class="kr-tag">{{ c.type }}</span>
          <span class="kr-code__main">{{ codeLine(c) }}</span>
          <span v-if="c.page" class="kr-page">第 {{ c.page }} 页</span>
        </div>
      </div>
      <details v-for="s in sources" :key="s.reference" class="kr-item">
        <summary><b>[{{ s.reference }}]</b> {{ s.title }}<span v-if="s.section" class="kr-page">{{ s.section }}</span></summary>
        <p class="kr-excerpt">{{ s.excerpt }}</p>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({ message: { type: Object, required: true } });
const open = ref(false);
const sources = computed(() => props.message?.knowledgeSources || []);
const codes = computed(() => props.message?.knowledgeCodes || []);
const mode = computed(() => props.message?.knowledgeMode || '');
const documentCount = computed(() => new Set(sources.value.map((s) => s.title)).size);

function codeLine(c) {
  if (c.type === 'DRG编码') return `${c.code} ${c.name} → ${c.groups.map((g) => `${g.adrg} ${g.adrgName}（${g.role}）`).join('、')}`;
  if (c.type === 'DIP病种') return `${c.category}-${c.no} ${c.diagnosis || ''} ${c.diagnosisName || ''}`.trim();
  if (c.type === 'DRG细分组') return `${c.code} ${c.name}（属于 ${c.adrg} ${c.adrgName}）`;
  if (c.type === '医疗服务项目') return `${c.code} ${c.name}`;
  if (c.type === 'ADRG核心病组') return `${c.code} ${c.name}${c.subgroups?.length ? `：${c.subgroups.join('、')}` : ''}`;
  return c.code || '';
}
</script>

<style scoped>
.kr { margin-top: 10px; width: 100%; font-size: 12px; color: #64748b; }
.kr-toggle { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border: 1px solid #e2e8f0; border-radius: 999px; background: #fff; cursor: pointer; color: #475569; }
.kr-toggle:hover { border-color: #cbd5e1; background: #f8fafc; }
.kr-toggle:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.kr-toggle > i:first-child { color: #0d9488; }
.kr-mode { padding: 1px 6px; border-radius: 6px; background: #fef3c7; color: #92400e; font-size: 11px; }
.kr-chevron { font-size: 10px; transition: transform .15s; }
.kr-chevron--open { transform: rotate(180deg); }
.kr-body { margin-top: 8px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; max-height: 320px; overflow: auto; line-height: 1.7; }
.kr-codes { display: grid; gap: 4px; padding-bottom: 8px; margin-bottom: 6px; border-bottom: 1px dashed #e2e8f0; }
.kr-code { display: flex; align-items: baseline; gap: 8px; color: #334155; }
.kr-code__main { flex: 1; min-width: 0; }
.kr-tag { flex: none; padding: 0 6px; border-radius: 6px; background: #ccfbf1; color: #115e59; font-size: 11px; }
.kr-page { margin-left: 6px; color: #94a3b8; font-size: 11px; flex: none; }
.kr-item { margin-top: 4px; }
.kr-item summary { cursor: pointer; color: #334155; }
.kr-excerpt { white-space: pre-wrap; margin: 6px 0 4px; padding: 8px 10px; border-radius: 8px; background: #f8fafc; color: #475569; max-height: 180px; overflow: auto; }
</style>
