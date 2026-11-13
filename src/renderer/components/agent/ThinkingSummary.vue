<template>
  <section class="thinking-summary">
    <button type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <i class="fa-solid" :class="busy ? 'fa-circle-notch fa-spin' : 'fa-lightbulb'" aria-hidden="true"></i>
      <span>{{ busy ? '正在分析' : expanded ? '分析说明' : '查看分析说明' }}</span>
      <i class="fa-solid" :class="expanded ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true"></i>
    </button>
    <div v-if="expanded" class="summary-body">
      <ul v-if="summary"><li v-for="(line, index) in summary.split('\n')" :key="index">{{ line }}</li></ul>
      <ul v-else class="summary-progress"><li v-for="step in steps" :key="step">{{ step }}</li></ul>
    </div>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue';
import { splitResponseSummary, chineseSummary, publicResponseSteps, answerExplanation } from '@/data/response-summary.mjs';
const props = defineProps({ message: { type: Object, required: true }, busy: Boolean });
// Keep the answer primary; streaming and completion must not override the user's toggle.
const expanded = ref(false);
const summary = computed(() => splitResponseSummary(props.message.content).summary || chineseSummary(props.message.thinkingSummary) || (!props.busy ? answerExplanation(props.message) : ''));
const steps = computed(() => publicResponseSteps(props.message, props.busy));
</script>
<style scoped>
.thinking-summary{width:100%;margin:0 0 14px;color:var(--ui-text-2,#64748b);font-size:12px;}
.thinking-summary button{display:flex;align-items:center;gap:7px;min-height:30px;padding:4px 0;cursor:pointer;font-weight:400;}
.thinking-summary button:focus-visible{outline:2px solid var(--ui-brand,#2563eb);outline-offset:3px;border-radius:4px;}
.thinking-summary button>i:first-child{color:var(--ui-text-2,#64748b);font-size:13px;}.thinking-summary button>i:last-child{font-size:10px;color:var(--ui-text-2,#64748b);margin-left:4px;}
.summary-body{margin:8px 0 6px;padding:10px 16px;border-left:2px solid var(--ui-brand-soft-2,#dbe7f8);background:var(--ui-bg-2,#f8fafc);border-radius:0 8px 8px 0;max-height:220px;overflow:auto;}
.summary-body ul{list-style:disc;padding-left:16px;margin:0;}.summary-body li{line-height:1.8;margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere;}.summary-progress{color:var(--ui-text-2,#64748b);}
@media(prefers-reduced-motion:reduce){.fa-spin{animation:none;}}
@media(max-width:640px){.thinking-summary button{min-height:40px;}}
</style>
