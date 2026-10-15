<template>
  <section class="team-library" :aria-label="title">
    <header class="library-toolbar">
      <div class="library-caption"><strong>{{ title }}</strong><span>极库云</span></div>
      <nav :aria-label="title + '页面操作'">
        <button :disabled="!attached || !status.canGoBack" @click="act('back')" aria-label="返回上一页" title="返回上一页"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
        <button :disabled="!attached" @click="act('reload')" :aria-label="'刷新' + title" title="刷新"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
        <button :disabled="!attached" @click="act('original')" :title="'回到' + entryLabel">{{ entryLabel }}</button>
        <button v-if="attached" @click="act('external')">浏览器打开<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button>
        <a v-else :href="sourceUrl" target="_blank" rel="noopener noreferrer">浏览器打开</a>
      </nav>
    </header>
    <div ref="surface" class="library-surface" :aria-busy="status.loading">
      <div v-if="failure" class="library-message" role="alert">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
        <h2>暂时无法打开极库云</h2><p>{{ failure }}</p>
        <p>请检查网络或公司 VPN，也可以在浏览器打开。</p>
        <button @click="attached ? act('reload') : attach()">重试</button>
      </div>
      <img v-else-if="preview.image" :src="preview.image" class="library-preview" alt="" @load="frameReady" />
      <div v-else-if="status.loading" class="library-message" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><p>正在打开极库云…</p></div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
const props = defineProps({ title: { type: String, required: true }, entryLabel: { type: String, required: true }, sourceUrl: { type: String, required: true } });
const api = window.api?.geelibOnline;
const token = crypto.randomUUID();
const surface = ref(null), attached = ref(false), localError = ref('');
const status = ref({ loading: true, canGoBack: false });
const preview = ref({ image: '', id: 0 });
const failure = computed(() => localError.value || status.value.error);
let observer, stopStatus, stopPreview, frame = 0, disposed = false;
function frameReady() {
  const id = preview.value.id;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!disposed && preview.value.id === id && preview.value.image) api?.previewReady({ token, id });
  }));
}
function resize() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!attached.value || disposed || !surface.value) return;
    const rect = surface.value.getBoundingClientRect();
    api.bounds({ token, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
  });
}
async function attach() {
  if (!api) { localError.value = '请在 FDE 桌面软件里使用在线页面。'; return; }
  localError.value = '';
  const rect = surface.value.getBoundingClientRect();
  const result = await api.attach({ token, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
  if (disposed) { api.detach({ token }); return; }
  if (!result.success) localError.value = result.error;
  else { attached.value = true; status.value = result; }
}
async function act(action) {
  if (!attached.value) return;
  const result = await api.action({ token, action });
  if (disposed) return;
  if (!result.success) localError.value = result.error;
  else { localError.value = ''; status.value = result; }
}
onMounted(async () => {
  stopStatus = api?.onStatus(result => { if (result.token === token && !disposed) status.value = result; });
  stopPreview = api?.onPreview(result => { if (result.token === token && !disposed && result.id >= preview.value.id) preview.value = result; });
  observer = new ResizeObserver(resize); observer.observe(surface.value);
  window.addEventListener('resize', resize);
  await attach();
});
onBeforeUnmount(() => {
  disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); stopStatus?.(); stopPreview?.();
  window.removeEventListener('resize', resize); api?.detach({ token });
});
</script>

<style scoped>
.team-library{flex:1;min-height:0;display:flex;flex-direction:column;background:#fff}
.library-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 18px;border-bottom:1px solid #e4eaf3}
.library-caption{display:flex;align-items:center;gap:12px;white-space:nowrap;font-size:14px;color:#263955}.library-caption span{font-size:12px;color:#697a94}
nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
button,a{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;min-width:36px;padding:0 12px;border:1px solid #e3e9f2;border-radius:7px;background:#fff;color:#52647f;font-size:12px;text-decoration:none;cursor:pointer;transition:background .15s,border-color .15s}
button:hover,a:hover{background:#edf4ff;color:#2563eb;border-color:#b5cfff}button:disabled{opacity:.4;cursor:default}button:focus-visible,a:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
.library-surface{flex:1;min-height:0;position:relative;background:#fff}.library-preview{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.library-message{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:100%;padding:28px;text-align:center;font-size:14px;color:#65758d}.library-message h2{font-size:18px;color:#263955}.library-message p{max-width:560px;line-height:1.6}.library-message i{font-size:24px;color:#5287ef}
@media(max-width:760px){.library-toolbar{align-items:flex-start;flex-direction:column;gap:8px;padding:8px 12px}}
@media(prefers-reduced-motion:reduce){.fa-spin{animation:none}button,a{transition:none}}
</style>
