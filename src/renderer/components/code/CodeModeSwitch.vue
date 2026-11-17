<template>
  <!-- IDE / 经典 模式切换。放在 IDE 工具栏或经典编辑器工具栏里，
       不再占用 AI 对话的标题栏（对话面板在 IDE 模式下可能整个收起）。 -->
  <div class="code-mode-switch" role="group" aria-label="代码模式切换">
    <button
      type="button"
      :class="{ 'code-mode-switch--on': modelValue }"
      title="IDE 模式：内置 FDE Code（扩展 / 终端 / 完整编辑体验）"
      @click="emit('update:modelValue', true)"
    >
      <i class="fa-solid fa-code"></i>IDE
    </button>
    <button
      type="button"
      :class="{ 'code-mode-switch--on': !modelValue }"
      title="经典模式：自研编辑器 + 终端（回滚用，也可在低配机器上用）"
      @click="emit('update:modelValue', false)"
    >
      <i class="fa-solid fa-pen-to-square"></i>经典
    </button>
  </div>
</template>

<script setup>
defineProps({ modelValue: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue']);
</script>

<style scoped>
.code-mode-switch { display: inline-flex; flex: none; padding: 2px; border: 1px solid var(--ui-brand-soft-2); border-radius: 8px; background: var(--ui-bg, #fff); }
.code-mode-switch button { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--ui-text-3); cursor: pointer; font-size: 11px; line-height: 1.4; transition: background .12s, color .12s; }
.code-mode-switch button:hover { color: var(--ui-brand); }
.code-mode-switch button.code-mode-switch--on { background: var(--ui-brand-soft); color: var(--ui-brand-dark); font-weight: 600; }
</style>
