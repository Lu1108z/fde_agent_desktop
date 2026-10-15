<template>
  <div class="coach-knowledge">
    <button type="button" class="knowledge-summary" :aria-expanded="expanded" @click="expanded = !expanded">
      <i class="fa-solid fa-book-open" aria-hidden="true"></i>
      <span>{{ busy ? '正在查阅知识库…' : '五阶段知识库' }}</span>
      <span v-if="!busy && sources.length" class="knowledge-count">本轮参考 {{ documents }} 份资料</span>
      <i class="fa-solid fa-chevron-down knowledge-chevron" :class="{ expanded }" aria-hidden="true"></i>
    </button>
    <div v-if="expanded" class="knowledge-references">
      <p v-if="!sources.length">教练会参考知识中心的五阶段规范、知识、交付资料和项目归档。保存的修改会自动用于后续回答。</p>
      <template v-else>
        <p v-if="stats?.documentCount">知识库 {{ stats.documentCount }} 份资料，{{ stats.indexedCount }} 份有可读取正文。</p>
        <details v-for="source in sources" :key="source.reference">
          <summary>[{{ source.reference }}] {{ source.title }} <span>{{ source.project ? '项目归档 · ' + source.project : '阶段' + source.stage }}{{ source.edited ? ' · 已修改' : '' }}</span></summary>
          <p class="knowledge-section">{{ source.section }} · 第 {{ source.line }} 行</p>
          <p class="knowledge-excerpt">{{ source.excerpt }}</p>
        </details>
      </template>
      <p v-if="stats?.unavailable?.length">{{ stats.unavailable.length }} 份资料暂无可读取正文，未作为回答依据。</p>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ messages: { type: Array, default: () => [] }, busy: Boolean });
const expanded = ref(false);
const answer = computed(() => [...props.messages].reverse().find(m => m.role === 'assistant' && m.knowledgeSources));
const sources = computed(() => answer.value?.knowledgeSources || []);
const stats = computed(() => answer.value?.knowledgeStats);
const documents = computed(() => new Set(sources.value.map(s => s.id)).size);
</script>
<style scoped>
.coach-knowledge{color:#64748b;font-size:12px;flex:none;max-width:100%;}
.knowledge-summary{display:flex;align-items:center;gap:8px;padding:9px 20px;cursor:pointer;width:100%;text-align:left;border-bottom:1px solid #e6edf7;background:#ffffffa6;}
.knowledge-summary:focus-visible{outline:2px solid #2563eb;outline-offset:-2px;}
.knowledge-summary>i:first-child{color:#3974db;}.knowledge-count{margin-left:auto;font-size:11px;}.knowledge-chevron{font-size:10px;}.knowledge-chevron.expanded{transform:rotate(180deg);}
.knowledge-references{padding:12px 20px;max-height:220px;overflow:auto;background:#fff;line-height:1.7;border-bottom:1px solid #e6edf7;}
.knowledge-references details{margin-top:7px;}.knowledge-references summary{cursor:pointer;color:#334155;}.knowledge-references summary span{color:#94a3b8;font-size:11px;margin-left:6px;}
.knowledge-section{color:#94a3b8;margin-top:6px;}.knowledge-excerpt{white-space:pre-wrap;color:#475569;padding:8px;background:#f8fafc;border-radius:8px;}
</style>
