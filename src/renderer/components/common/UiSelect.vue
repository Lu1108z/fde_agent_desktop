<template>
  <div v-bind="rootAttrs" class="ui-select" :class="{ 'is-compact': compact, 'is-field': field }">
    <button ref="trigger" type="button" class="ui-select-trigger" :disabled="disabled"
      :id="attrs.id" :title="attrs.title" :aria-label="ariaLabel || attrs['aria-label'] || attrs.title || selected?.label || placeholder" aria-haspopup="listbox" :aria-expanded="open"
      @pointerdown="forwardPointer" @focus="forwardFocus" @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show(true)">
      <span>{{ compact && modelValue === '' ? placeholder : selected?.label || placeholder }}</span>
      <i v-if="!compact" class="fa-solid fa-chevron-down" aria-hidden="true"></i>
    </button>
    <Teleport to="body">
      <div v-if="open" ref="menu" class="ui-select-menu" :style="position" role="listbox" :aria-label="ariaLabel || attrs['aria-label'] || attrs.title || '选项'"
        @keydown.esc.prevent.stop="close(true)" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)"
        @keydown.home.prevent="focusOption(0)" @keydown.end.prevent="focusOption(options.length - 1)" @keydown.tab="close()">
        <button v-for="option in options" :key="option.value" type="button" role="option" :disabled="option.disabled"
          :aria-selected="option.value === modelValue" :class="{ 'is-selected': option.value === modelValue }"
          @click="choose(option.value)">
          <span class="ui-option-label">{{ option.label }}</span>
          <i v-if="option.value === modelValue" class="fa-solid fa-check" aria-hidden="true"></i>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount, useAttrs } from 'vue';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  modelValue: [String, Number], options: { type: Array, default: () => [] },
  ariaLabel: String, field: Boolean, maxVisible: { type: Number, default: 8 }, placeholder: { type: String, default: '请选择' }, compact: Boolean, disabled: Boolean,
});
const emit = defineEmits(['update:modelValue', 'change', 'pointerdown', 'focus']);
const attrs = useAttrs();
const rootAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([key]) => !['id', 'title', 'aria-label', 'modelModifiers'].includes(key))));
function forwardPointer(event) { emit('pointerdown', event); }
function forwardFocus(event) { emit('focus', event); }
const trigger = ref(null), menu = ref(null), open = ref(false), position = ref({});
const selected = computed(() => props.options.find(option => option.value === props.modelValue));
function locate() {
  if (!open.value || !trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, props.compact ? 132 : 260), window.innerWidth - 24);
  const below = window.innerHeight - rect.bottom - 16;
  const above = below < Math.min(props.options.length * 36 + 10, props.maxVisible * 36 + 10) && rect.top > below;
  position.value = {
    width: `${width}px`, left: `${Math.max(12, Math.min(props.compact ? rect.right - width : rect.left, window.innerWidth - width - 12))}px`,
    ...(above ? { bottom: `${window.innerHeight - rect.top + 6}px` } : { top: `${rect.bottom + 6}px` }),
    maxHeight: `${Math.min(props.maxVisible * 36 + 10, Math.max(48, above ? rect.top - 20 : below))}px`,
  };
}
function close(restore = false) { open.value = false; if (restore) trigger.value?.focus(); }
async function show(last = false) {
  if (props.disabled) return;
  open.value = true; locate(); await nextTick();
  const index = props.options.findIndex(option => option.value === props.modelValue);
  focusOption(index >= 0 ? index : last ? props.options.length - 1 : 0);
}
function focusOption(index) {
  const buttons = [...(menu.value?.querySelectorAll('[role="option"]') || [])];
  const selectedButton = buttons[index]?.disabled ? buttons.find(button => !button.disabled) : buttons[index];
  selectedButton?.focus();
}
function move(direction) {
  const buttons = [...(menu.value?.querySelectorAll('[role="option"]:not(:disabled)') || [])];
  const index = buttons.indexOf(document.activeElement);
  if (buttons.length) buttons[(index + direction + buttons.length) % buttons.length]?.focus();
}
function choose(value) { close(true); emit('update:modelValue', value); emit('change', value); }
function outside(event) {
  if (!trigger.value?.contains(event.target) && !menu.value?.contains(event.target)) close();
}
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  document.addEventListener('focusin', outside);
  window.addEventListener('resize', locate);
  window.addEventListener('scroll', locate, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('focusin', outside);
  window.removeEventListener('resize', locate);
  window.removeEventListener('scroll', locate, true);
});
</script>

<style scoped>
.ui-select { display:inline-flex; min-width:0; color:#60718b; }
.ui-select-trigger { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-width:0; padding:7px 10px; border:1px solid var(--color-border,#e4e9f2); border-radius:9px; color:inherit; background:transparent; font:inherit; cursor:pointer; }
.ui-select-trigger span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ui-select-trigger i { flex:none; font-size:9px; opacity:.65; }
.ui-select-trigger:disabled { opacity:.45; cursor:default; }
.is-field { padding:0!important; border:0!important; background:transparent!important; box-shadow:none!important; font-size:12px; }
.is-field .ui-select-trigger { background:var(--color-surface,#fff); }
.ui-select-trigger:hover { background:var(--ui-brand-soft,#eff4ff); }
.ui-select-trigger:focus-visible { outline:2px solid var(--ui-brand,#2563eb); outline-offset:2px; }
.is-compact .ui-select-trigger { justify-content:center; height:100%; padding:0 5px; border:0; border-radius:inherit; }
.ui-select-menu { position:fixed; z-index:10000; box-sizing:border-box; padding:5px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#ccd9ee transparent; border:1px solid var(--color-border,#e4e9f2); border-radius:12px; background:var(--color-surface,#fff); box-shadow:0 8px 28px #20365516; }
.ui-select-menu::-webkit-scrollbar { width:5px; }
.ui-select-menu::-webkit-scrollbar-thumb { background:#ccd9ee; border-radius:5px; }
.ui-select-menu button { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; height:36px; min-height:36px; box-sizing:border-box; padding:8px 10px; border:0; border-radius:7px; background:transparent; color:#52627b; font-size:12px; text-align:left; cursor:pointer; }
.ui-select-menu button:hover, .ui-select-menu button:focus-visible { background:var(--ui-brand-soft,#eff4ff); outline:none; }
.ui-select-menu button.is-selected { color:var(--ui-brand,#2563eb); background:var(--ui-brand-soft,#eff4ff); }
.ui-select-menu button:disabled { opacity:.45; cursor:default; }
.ui-option-label { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; line-height:1.5; }
.ui-select-menu i { flex:none; font-size:10px; }
</style>
