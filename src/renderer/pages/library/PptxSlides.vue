<template>
  <!-- PPT 原样预览：纯前端按幻灯片里的位置、字号、图片排版渲染，不依赖 LibreOffice；渲染失败时交给上层回退到文字预览 -->
  <div ref="root" class="pptx-slides" :class="{ presenting }" @click="presenting && onStageClick($event)" @mousemove="presenting && wake()">
    <div v-if="!loading && count && !presenting" class="pptx-bar">
      <span>共 {{ count }} 页</span>
      <button class="primary" @click.stop="present(0)"><i class="fa-solid fa-play"></i>从头放映</button>
      <button @click.stop="present(visibleIndex())"><i class="fa-solid fa-display"></i>从当前页放映</button>
    </div>
    <p v-if="loading" class="pptx-loading"><i class="fa-solid fa-spinner fa-spin"></i>正在排版幻灯片…</p>
    <div ref="host" class="pptx-host" :style="{ visibility: loading ? 'hidden' : 'visible' }"></div>
    <div v-if="presenting" class="show-hud" :class="{ idle }" @click.stop>
      <button aria-label="上一页" :disabled="index === 0" @click="go(index - 1)"><i class="fa-solid fa-chevron-left"></i></button>
      <span>{{ index + 1 }} / {{ count }}</span>
      <button aria-label="下一页" :disabled="index === count - 1" @click="go(index + 1)"><i class="fa-solid fa-chevron-right"></i></button>
      <button aria-label="退出放映" @click="stop"><i class="fa-solid fa-xmark"></i>退出</button>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { init } from 'pptx-preview';
const props = defineProps({ url: { type: String, required: true } });
const emit = defineEmits(['failed']);
const root = ref(null), host = ref(null), loading = ref(true), count = ref(0), presenting = ref(false), index = ref(0), idle = ref(false);
let previewer = null, disposed = false, idleTimer = null;
const SLIDE = '.pptx-preview-slide-wrapper';
const slides = () => [...(host.value?.querySelectorAll(SLIDE) || [])];
// 读取幻灯片尺寸（EMU），得到宽高比；读不到时按 16:9
async function slideRatio(buffer) {
  try {
    const JSZip = (await import('jszip')).default;
    const xml = await (await JSZip.loadAsync(buffer)).file('ppt/presentation.xml')?.async('string');
    const m = /<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xml || '');
    if (m) return Number(m[2]) / Number(m[1]);
  } catch (_) { /* 用默认比例 */ }
  return 9 / 16;
}
// 放映：沿用已排好的幻灯片，只显示当前页并按屏幕等比放大
function layout() {
  slides().forEach((el, i) => {
    el.classList.toggle('show-current', presenting.value && i === index.value);
    if (!presenting.value || i !== index.value) { el.style.transform = ''; return; }
    const scale = Math.min(window.innerWidth / el.offsetWidth, window.innerHeight / el.offsetHeight);
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  });
}
function go(i) { index.value = Math.max(0, Math.min(count.value - 1, i)); layout(); wake(); }
function visibleIndex() {
  const top = root.value.getBoundingClientRect().top;
  const i = slides().findIndex(el => el.getBoundingClientRect().bottom > top + 80);
  return Math.max(0, i);
}
async function present(i) {
  presenting.value = true; index.value = i;
  try { await root.value.requestFullscreen?.(); } catch (_) { /* 不支持全屏时铺满窗口放映 */ }
  layout(); wake();
}
function stop() {
  if (!presenting.value) return;
  const last = index.value;
  presenting.value = false; layout(); clearTimeout(idleTimer);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  slides()[last]?.scrollIntoView({ block: 'start' });
}
// 鼠标停 2 秒后隐藏控制条，动一下再出现
function wake() { idle.value = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { idle.value = true; }, 2000); }
function onStageClick(e) { go(index.value + (e.clientX < window.innerWidth / 3 ? -1 : 1)); }
function onKey(e) {
  if (!presenting.value) return;
  const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'], prev = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];
  if (next.includes(e.key)) go(index.value + 1);
  else if (prev.includes(e.key)) go(index.value - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(count.value - 1);
  else if (e.key === 'Escape') stop();
  else return;
  e.preventDefault();
}
function onFullscreen() { if (!document.fullscreenElement) stop(); else layout(); }
onMounted(async () => {
  window.addEventListener('keydown', onKey); window.addEventListener('resize', layout); document.addEventListener('fullscreenchange', onFullscreen);
  try {
    const response = await fetch(props.url);
    if (!response.ok) throw new Error('读取 PPT 原件失败');
    const buffer = await response.arrayBuffer();
    if (disposed) return;
    const width = Math.min(1100, Math.max(480, (root.value?.clientWidth || 960) - 48));
    previewer = init(host.value, { width, height: Math.round(width * await slideRatio(buffer)), mode: 'list' });
    await previewer.preview(buffer);
    count.value = slides().length;
    if (!disposed && !count.value) throw new Error('幻灯片为空');
  } catch (e) { if (!disposed) emit('failed', e?.message || String(e)); }
  finally { loading.value = false; }
});
onBeforeUnmount(() => {
  disposed = true; clearTimeout(idleTimer);
  window.removeEventListener('keydown', onKey); window.removeEventListener('resize', layout); document.removeEventListener('fullscreenchange', onFullscreen);
  if (presenting.value && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  try { previewer?.destroy(); } catch (_) { /* 已卸载 */ }
});
</script>
<style scoped>
.pptx-slides{position:relative;flex:1;min-height:0;overflow:auto;padding:0 24px 24px;background:#eef2f7}
.pptx-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;margin:0 -24px 20px;padding:10px 24px;background:rgba(238,242,247,.92);backdrop-filter:blur(6px);font-size:12px;color:#7d8fa8}
.pptx-bar span{margin-right:auto}
.pptx-bar button{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid #d6e0ee;background:#fff;color:#4a6285;font-size:12px;cursor:pointer}
.pptx-bar button:hover{border-color:#2965e9;color:#2965e9}
.pptx-bar button.primary{background:#2965e9;border-color:#2965e9;color:#fff}
.pptx-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:60px;font-size:13px;color:#8a9bb3}
.pptx-host{display:flex;justify-content:center}
.pptx-host :deep(.pptx-preview-wrapper){background:transparent!important;height:auto!important;overflow:visible!important}
.pptx-host :deep(.pptx-preview-slide-wrapper){margin:0 auto 20px!important;box-shadow:0 2px 10px -4px rgba(15,23,42,.25);border-radius:4px;overflow:hidden}
/* 放映 */
.pptx-slides.presenting{position:fixed;inset:0;z-index:5000;padding:0;overflow:hidden;background:#000;cursor:pointer}
.pptx-slides.presenting :deep(.pptx-preview-slide-wrapper){display:none}
.pptx-slides.presenting :deep(.pptx-preview-slide-wrapper.show-current){display:block;position:fixed!important;left:50%;top:50%;margin:0!important;border-radius:0;box-shadow:none;transform-origin:center}
.show-hud{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:5001;display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;background:rgba(20,24,32,.72);color:#fff;font-size:13px;font-variant-numeric:tabular-nums;cursor:default;transition:opacity .3s}
.show-hud.idle{opacity:0}
.show-hud span{padding:0 8px}
.show-hud button{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:0;background:transparent;color:#fff;font-size:13px;cursor:pointer}
.show-hud button:hover{background:rgba(255,255,255,.15)}.show-hud button:disabled{opacity:.35;cursor:default}
</style>
