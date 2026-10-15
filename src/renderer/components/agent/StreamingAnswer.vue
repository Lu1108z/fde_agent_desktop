<template>
  <div :aria-busy="streaming || revealing" v-html="html"></div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { createTextReveal } from './text-reveal';
import { cleanAssistantContent } from '@/data/assistant-content';

const props = defineProps({
  content: { type: String, default: '' },
  animate: Boolean,
  streaming: Boolean,
  stopped: Boolean,
  render: { type: Function, required: true },
});
const emit = defineEmits(['progress']);
const visible = ref('');
const revealing = ref(false);
// Parent activity/state changes must not reparse unchanged Markdown.
const html = computed(() => props.render(visible.value));
const reveal = createTextReveal((text, pending) => {
  visible.value = text;
  revealing.value = pending;
  emit('progress');
});
watch(() => [props.content, props.animate, props.stopped], () => {
  reveal.update(cleanAssistantContent(props.content), props.animate && !props.stopped);
}, { immediate: true });
onBeforeUnmount(() => reveal.dispose());
</script>
