'use strict';

// Engine sessions live in one process; disk history outlives that process.
// Restore lazily and never send a separate recovery prompt (which creates an unwanted reply).
function createProjectSessions({ readMeta, writeMeta, readMessages, projectPath, prepareContext, captureModels, replaying }) {
  const engines = new WeakMap();
  function stateFor(client) {
    if (!engines.has(client)) engines.set(client, { loaded: new Set(), pending: new Map(), recovery: new Map() });
    return engines.get(client);
  }
  function markLoaded(client, id) {
    if (client && id) stateFor(client).loaded.add(id);
  }
  async function ensure(client, slug) {
    const state = stateFor(client);
    if (state.pending.has(slug)) return state.pending.get(slug);
    const job = (async () => {
      let meta = readMeta(slug);
      if (!meta) throw new Error(`Project "${slug}" not found`);
      if (meta.sessionId && state.loaded.has(meta.sessionId)) return meta;
      prepareContext(slug, meta);
      if (meta.sessionId) {
        const id = meta.sessionId;
        replaying.add(id);
        try {
          const restored = await client.request('session/load', { sessionId: id, cwd: projectPath(slug), mcpServers: [] });
          if (restored) {
            captureModels(restored);
            await client.request('session/set_mode', { sessionId: id, modeId: 'dont_ask' }).catch(() => {});
            state.loaded.add(id);
            return meta;
          }
        } catch (_) { /* expired session: rebuild from saved history */ }
        finally { replaying.delete(id); }
      }
      const created = await client.request('session/new', { cwd: projectPath(slug), mcpServers: [] });
      if (!created?.sessionId) throw new Error('无法恢复对话，请重试');
      captureModels(created);
      // Merge with the latest metadata so edits made while loading are preserved.
      meta = { ...readMeta(slug), sessionId: created.sessionId };
      writeMeta(slug, meta);
      await client.request('session/set_mode', { sessionId: meta.sessionId, modeId: 'dont_ask' }).catch(() => {});
      state.loaded.add(meta.sessionId);
      const history = readMessages(slug);
      if (history.length || meta.requirement) state.recovery.set(meta.sessionId, { history, requirement: meta.requirement });
      return meta;
    })();
    state.pending.set(slug, job);
    try { return await job; }
    finally { state.pending.delete(slug); }
  }
  function recoveryPrefix(client, id, currentText) {
    const saved = stateFor(client).recovery.get(id);
    if (!saved) return '';
    const history = saved.history.filter(message => ['user', 'assistant'].includes(message.role) && message.content);
    // The UI saves the new user message before prompting; do not include it twice.
    if (history.at(-1)?.role === 'user' && history.at(-1).content === currentText) history.pop();
    let remaining = 60000;
    const parts = [];
    for (const message of history.reverse()) {
      if (remaining <= 0) break;
      const content = String(message.content).slice(-remaining);
      parts.unshift(`${message.role === 'user' ? '用户' : '助手'}：${content}`);
      remaining -= content.length;
    }
    return `继续当前对话。以下是本地保存的历史，仅供恢复上下文；结合项目目录中的已有文件继续回答，不要重复历史或另发恢复说明。\n原始需求：${String(saved.requirement || '').slice(0, 4000)}\n\n${parts.join('\n\n')}\n\n用户这次的新消息：\n`;
  }
  function didRespond(client, id) { stateFor(client).recovery.delete(id); }
  return { ensure, markLoaded, recoveryPrefix, didRespond };
}

module.exports = { createProjectSessions };
