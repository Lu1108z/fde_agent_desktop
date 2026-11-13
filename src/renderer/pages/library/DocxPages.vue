<template>
  <!-- Word 原样预览：按 docx 自带的样式、字体、页边距和分页渲染成 A4 页面，和 WPS / Word 打开基本一致；失败时交给上层回退 -->
  <div ref="root" class="docx-pages">
    <p v-if="loading" class="docx-loading"><i class="fa-solid fa-spinner fa-spin"></i>正在排版文档…</p>
    <div ref="styles"></div>
    <div ref="host" class="docx-host" :style="{ zoom: fit, visibility: loading ? 'hidden' : 'visible' }"></div>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { renderAsync } from 'docx-preview';
const props = defineProps({ url: { type: String, required: true } });
const emit = defineEmits(['failed']);
const root = ref(null), styles = ref(null), host = ref(null), loading = ref(true), fit = ref(1);
let disposed = false, observer = null;
// 页面比可视区宽时整体缩小，不出现横向滚动
function measure() {
  const page = host.value?.querySelector('section.docx');
  if (!page || !root.value) return;
  const width = page.offsetWidth + 48;
  fit.value = Math.min(1, (root.value.clientWidth - 8) / width);
}
onMounted(async () => {
  try {
    const response = await fetch(props.url);
    if (!response.ok) throw new Error('读取 Word 原件失败');
    const blob = await response.blob();
    if (disposed) return;
    await renderAsync(blob, host.value, styles.value, { className: 'docx', inWrapper: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, useBase64URL: true, experimental: true });
    if (!host.value?.querySelector('section.docx')) throw new Error('文档为空');
    measure(); observer = new ResizeObserver(measure); observer.observe(root.value);
  } catch (e) { if (!disposed) emit('failed', e?.message || String(e)); }
  finally { loading.value = false; }
});
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); });
</script>
<style scoped>
.docx-pages{flex:1;min-height:0;overflow:auto;background:#e9edf3}
.docx-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:60px;font-size:13px;color:#8a9bb3}
.docx-host :deep(.docx-wrapper){background:transparent;padding:28px 24px 40px;display:flex;flex-direction:column;align-items:center}
.docx-host :deep(.docx-wrapper>section.docx){box-shadow:0 1px 3px rgba(15,23,42,.08),0 8px 24px -12px rgba(15,23,42,.18);margin-bottom:24px}
</style>
