<template>
  <section class="online-page"><header class="online-context"><div><strong>项目进度</strong><span>{{status.loading?'正在连接…':failure?'连接异常':'云端页面 · 修改保存在飞书'}}</span></div><nav><RouterLink to="/projects">项目与交付物</RouterLink></nav></header>
    <div ref="surface" class="online-surface" :aria-busy="status.loading">
      <div v-if="failure" class="online-message" role="alert"><i class="fa-solid fa-circle-exclamation"></i><h2>暂时无法显示飞书页面</h2><p>{{ failure }}</p><button v-if="attached" @click="act('reload')">重新加载</button><button v-else-if="windowApi" @click="attach">重试</button><a v-else :href="sourceUrl" target="_blank" rel="noopener noreferrer">在浏览器中打开</a></div>
      <img v-else-if="preview.image" :src="preview.image" class="online-preview" alt="" @load="frameReady" />
      <div v-else-if="status.loading" class="online-message"><i class="fa-solid fa-spinner fa-spin"></i><p>正在打开多维表格…</p></div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
const sourceUrl = 'https://wcn3xtaqzk2z.feishu.cn/base/QNnAbN7CKaHAowsD5OvcMlbQnie?table=tblF4xt2IIgM8Nij&view=vewzcaAeB3';
const windowApi = window.api?.feishuOnline;
const token = crypto.randomUUID();
const surface = ref(null), attached = ref(false), localError = ref('');
const status = ref({ loading: true });
const preview = ref({ image: '', id: 0 });
const failure = computed(() => localError.value || status.value.error);
let observer, stopStatus, stopPreview, frame = 0, disposed = false;
function frameReady() {
  // Wait until the image has decoded and painted before hiding the native view.
  const id = preview.value.id;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!disposed && preview.value.id === id && preview.value.image) windowApi?.previewReady({ token, id });
  }));
}
const bounds = () => {
  const rect = surface.value.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
};
function resize() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => { if (attached.value && !disposed && surface.value) windowApi.bounds({ token, bounds: bounds() }); });
}
async function attach() {
  if (!windowApi) { localError.value = '请在 FDE 桌面软件里使用在线项目管理。'; return; }
  localError.value = '';
  const result = await windowApi.attach({ token, bounds: bounds() });
  if (disposed) { windowApi.detach({ token }); return; }
  if (!result.success) localError.value = result.error;
  else { attached.value = true; status.value = result; }
}
async function act(action) {
  if (!attached.value) return;
  const result = await windowApi.action({ token, action });
  if (disposed) return;
  if (!result.success) localError.value = result.error;
  else { localError.value = ''; status.value = result; }
}
onMounted(async () => {
  stopStatus = windowApi?.onStatus(result => { if (result.token === token && !disposed) { status.value = result; } });
  stopPreview = windowApi?.onPreview(result => { if (result.token === token && !disposed && result.id >= preview.value.id) preview.value = result; });
  observer = new ResizeObserver(resize); observer.observe(surface.value);
  window.addEventListener('resize', resize);
  await attach();
});
onBeforeUnmount(() => {
  disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); stopStatus?.(); stopPreview?.();
  window.removeEventListener('resize', resize);
  windowApi?.detach({ token });
});
</script>

<style scoped>
.online-context{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 18px;border-bottom:1px solid #e4eaf3;font-size:12px}.online-context span{color:#8192aa;margin-left:14px;font-size:11px}.online-context nav{display:flex;gap:8px}

.online-page { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #fff; }
button,a { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 34px; padding: 0 12px; border: 1px solid #e3e9f2; border-radius: 7px; background: #fff; color: #52647f; font-size: 12px; cursor: pointer; }
button:hover,a:hover { background: #edf4ff; color: #2563eb; border-color: #b5cfff; }button:disabled { opacity: .4; cursor: default; }
.online-surface { flex: 1; min-height: 0; position: relative; background: #fff; }
.online-preview { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.online-message { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; color: #7b8ba3; font-size: 14px; padding: 32px; text-align: center; }.online-message i { font-size: 24px; color: #5287ef; }.online-message h2 { color: #263955; font-size: 18px; }.online-message p { max-width: 560px; line-height: 1.7; }
@media (prefers-reduced-motion: reduce) { .fa-spin { animation: none; } }
</style>
