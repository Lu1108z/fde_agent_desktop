// v-enter-send="fn"：聊天输入框统一按键——Enter 发送，Shift+Enter 换行；
// Ctrl/⌘+Enter 也发送（兼容老习惯）。中文输入法选词时的回车（isComposing / keyCode 229）不触发发送。
function handler(el) {
  return (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const fn = el.__enterSend;
    if (typeof fn === 'function') fn(e);
  };
}
export default {
  mounted(el, binding) {
    el.__enterSend = binding.value;
    el.__enterSendHandler = handler(el);
    el.addEventListener('keydown', el.__enterSendHandler);
  },
  updated(el, binding) { el.__enterSend = binding.value; },
  unmounted(el) { el.removeEventListener('keydown', el.__enterSendHandler); },
};
