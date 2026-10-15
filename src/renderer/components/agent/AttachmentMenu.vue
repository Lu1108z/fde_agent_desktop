<template>
  <div ref="root" class="attachment-menu" @keydown.esc.stop="close(true)">
    <button ref="trigger" type="button" class="attachment-trigger" :disabled="disabled"
      aria-label="添加附件或使用语音" aria-haspopup="menu" :aria-expanded="open"
      @click.stop="open = !open" @keydown.down.prevent="openMenu">
      <i class="fa-solid" :class="recording ? 'fa-stop' : 'fa-plus'" aria-hidden="true"></i>
    </button>
    <div v-if="open" class="attachment-options" role="menu">
      <button type="button" role="menuitem" @click="choose('image')"><i class="fa-regular fa-image"></i>上传图片</button>
      <button type="button" role="menuitem" @click="choose('file')"><i class="fa-solid fa-paperclip"></i>上传文件</button>
      <button type="button" role="menuitem" :disabled="!voiceSupported" @click="choose('voice')"><i class="fa-solid fa-microphone"></i>{{ recording ? '停止录音' : '语音输入' }}</button>
      <button v-if="commands" type="button" role="menuitem" @click="choose('command')"><i class="fa-solid fa-slash"></i>使用指令</button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
defineProps({ disabled: Boolean, recording: Boolean, commands: Boolean, voiceSupported: Boolean });
const emit = defineEmits(['image', 'file', 'voice', 'command']);
const root = ref(null);
const trigger = ref(null);
const open = ref(false);
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus(); }
function choose(action) { close(true); emit(action); }
async function openMenu() { open.value = true; await nextTick(); root.value?.querySelector('[role="menuitem"]')?.focus(); }
function outside(event) { if (!root.value?.contains(event.target)) close(); }
function leave(event) { if (!root.value?.contains(event.relatedTarget)) close(); }
onMounted(() => { document.addEventListener('pointerdown', outside); root.value?.addEventListener('focusout', leave); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); root.value?.removeEventListener('focusout', leave); });
</script>

<style scoped>
.attachment-menu { position:relative; flex:none; }
.attachment-trigger { display:grid; place-items:center; width:34px; height:34px; border:0; border-radius:50%; background:#fff; color:#1f2937; font-size:19px; cursor:pointer; transition:background .15s,color .15s; }
.attachment-trigger:hover { background:#edf4ff; color:#2563eb; }
.attachment-trigger:disabled { opacity:.45; cursor:default; }
.attachment-options { position:absolute; bottom:calc(100% + 10px); left:0; z-index:40; width:166px; padding:5px; border:1px solid #e1e8f2; border-radius:12px; background:#fff; box-shadow:0 8px 30px #2639581c; }
.attachment-options button { display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; border:0; border-radius:8px; background:transparent; font-size:12px; color:#42526c; text-align:left; cursor:pointer; }
.attachment-options button:hover { background:#f0f5fc; }
.attachment-options button:disabled { opacity:.45; cursor:default; }
.attachment-options i { width:16px; text-align:center; }
button:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }
</style>
