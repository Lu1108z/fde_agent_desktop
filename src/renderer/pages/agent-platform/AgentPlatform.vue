<template>
  <!-- 智能体平台：嵌入「医院智能体安全协作平台」演示站（med-ai-demo）。平台自带顶部导航（智能体总览 / 运营大屏）和悬浮「返回」，这里不再另加一层导航 -->
  <div class="agent-platform">
    <p v-if="error" class="ap-msg error"><i class="fa-solid fa-triangle-exclamation"></i>{{ error }}</p>
    <p v-else-if="!src" class="ap-msg"><i class="fa-solid fa-spinner fa-spin"></i>正在打开智能体平台…</p>
    <iframe v-if="src" :src="src" title="医院智能体安全协作平台" class="ap-frame" allow="fullscreen; autoplay"></iframe>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
// 切走再回来时保留页面（AppShellLayout 的 KeepAlive 按组件名缓存），平台不再重新加载、不再重播开机动画
defineOptions({ name: 'AgentPlatform' });
const src = ref(''), error = ref('');
onMounted(async () => {
  try {
    const r = await window.api.agentPlatform.url('dashboard/index.html');
    if (!r?.success) throw new Error(r?.error || '智能体平台打不开');
    src.value = r.url;
  } catch (e) { error.value = window.api?.agentPlatform ? e.message : '请在 FDE 桌面窗口中使用智能体平台。'; }
});
</script>
<style scoped>
.agent-platform{flex:1;min-height:0;height:100%;display:flex;background:#0b1a3a}
.ap-frame{flex:1;width:100%;height:100%;border:0;background:#0b1a3a}
.ap-msg{margin:auto;display:flex;align-items:center;gap:8px;color:#a9b8d6;font-size:13px}
.ap-msg.error{color:#ffb4a8}
</style>
