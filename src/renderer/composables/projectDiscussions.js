import { computed, ref, watch, onBeforeUnmount } from 'vue';

// A project owns its discussion archive; opening another window never deletes it.
export function createProjectDiscussions(options) {
  const windows = ref([]);
  const selected = ref({});
  const ready = ref(false);
  const file = '.fde-discussions/history.json';
  const storageKey = () => `fde-project-discussions:${options.slug()}`;
  const scope = computed(options.scope);
  const slot = (scope, id) => `${scope}::${id}`;
  const active = computed(() => windows.value.find(w => w.scope === scope.value && w.id === selected.value[scope.value]) || null);
  const activeMessages = computed(() => {
    if (!active.value) return null;
    return options.buckets.value[slot(scope.value, active.value.id)] ||= [];
  });
  const histories = computed(() => {
    const defaults = Object.entries(options.buckets.value)
      .filter(([key, messages]) => !key.includes('::') && messages.length)
      .map(([scope, messages]) => ({ id: '', scope, title: messages.find(m => m.role === 'user')?.content?.slice(0, 28) || '历史讨论', count: messages.filter(m => m.role === 'user').length }));
    if (options.knowledge.value.length) defaults.unshift({ id: '', scope: '1:__stage__', title: '资料讨论', count: options.knowledge.value.filter(m => m.role === 'user').length });
    return [...windows.value.map(w => {
      const messages = options.buckets.value[slot(w.scope, w.id)] || [];
      return { ...w, title: messages.find(m => m.role === 'user')?.content?.slice(0, 28) || w.title, count: messages.filter(m => m.role === 'user').length };
    }).reverse(), ...defaults];
  });
  let timer, saving = Promise.resolve(), warned = false;
  const plain = value => JSON.parse(JSON.stringify(value));
  function snapshot() {
    return plain({ version: 1, updatedAt: Date.now(), windows: windows.value, selected: selected.value, buckets: options.buckets.value, knowledge: options.knowledge.value });
  }
  function persist() {
    if (!ready.value) return saving;
    clearTimeout(timer);
    const slug = options.slug(), payload = JSON.stringify(snapshot());
    try { localStorage.setItem(storageKey(), payload); } catch (_) { /* disk remains primary */ }
    saving = saving.catch(() => {}).then(async () => {
      const result = await window.api.hermes.writeFile(slug, file, payload);
      if (!result?.success) throw Error(result?.error || '讨论记录保存失败');
    }).catch(error => {
      if (!warned) { warned = true; options.error(`讨论记录保存失败：${error.message}，本机恢复副本已保留`); }
    });
    return saving;
  }
  async function restore() {
    ready.value = false;
    const candidates = [];
    try { const value = JSON.parse(localStorage.getItem(storageKey()) || 'null'); if (value?.version === 1) candidates.push(value); } catch (_) {}
    try {
      const result = await window.api.hermes.readFile(options.slug(), file);
      if (result?.success && result.content) { const value = JSON.parse(result.content); if (value.version === 1) candidates.push(value); }
    } catch (_) {}
    const saved = candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (saved) {
      windows.value = [...new Map([...(Array.isArray(saved.windows) ? saved.windows : []), ...windows.value].map(w => [w.scope + ":" + w.id, w])).values()];
      selected.value = saved.selected || {};
      for (const [key, cached] of Object.entries(saved.buckets || {})) {
        if (!Array.isArray(cached)) continue;
        const disk = options.buckets.value[key] || [];
        if (key.includes('::') || cached.length > disk.length || (cached.length === disk.length && (cached.at(-1)?.content?.length || 0) >= (disk.at(-1)?.content?.length || 0))) options.buckets.value[key] = cached;
      }
      if (Array.isArray(saved.knowledge) && saved.knowledge.length > options.knowledge.value.length) options.knowledge.value = saved.knowledge;
    }
    ready.value = true;
    await persist();
  }
  watch([options.buckets, options.knowledge, windows, selected], () => {
    if (!ready.value) return;
    try { localStorage.setItem(storageKey(), JSON.stringify(snapshot())); } catch (_) {}
    clearTimeout(timer); timer = setTimeout(persist, 800);
  }, { deep: true });
  async function newWindow() {
    if (options.busy()) return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    windows.value.push({ id, scope: scope.value, title: `新对话 ${windows.value.length + 1}`, createdAt: new Date().toISOString() });
    options.buckets.value[slot(scope.value, id)] = [];
    selected.value[scope.value] = id;
    options.show();
    await persist();
  }
  async function openWindow(window) {
    if (options.busy()) return;
    if (await options.open(window.scope) === false) return;
    selected.value[window.scope] = window.id;
    options.show();
    await persist();
  }
  function useDefault() {
    delete selected.value[scope.value];
    return persist();
  }
  function messageTab(base) { return active.value ? `discussion:${scope.value}:${active.value.id}` : base; }
  function restoreMessage(message, buckets) {
    const match = /^discussion:([1-5]):([^:]+):([^:]+)$/.exec(message.tab || '');
    if (!match) return false;
    const scope = `${match[1]}:${match[2]}`, id = match[3];
    (buckets[slot(scope, id)] ||= []).push(message);
    if (!windows.value.some(w => w.scope === scope && w.id === id)) windows.value.push({ scope, id, title: '历史对话' });
    return true;
  }
  onBeforeUnmount(() => { clearTimeout(timer); persist(); });
  return { active, activeMessages, histories, restore, persist, useDefault, newWindow, openWindow, messageTab, restoreMessage };
}
