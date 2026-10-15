import { ref } from 'vue';
import { finalizeResponseSummary, plainMessage, publicToolStep } from '../data/response-summary.mjs';
import { modelFailureMessage } from '../data/model-failure.mjs';
import { cleanAssistantContent } from '../data/assistant-content.js';

// Keep a run alive across page changes; it never owns the Demo stream's lock.
const chats = new Map();
export function projectKnowledgeChat(slug) {
  if (chats.has(slug)) return chats.get(slug);
  const messages = ref([]), busy = ref(false);
  let requestId = '', cancelled = false;
  async function cancel() {
    if (!busy.value) return;
    cancelled = true;
    await window.api.hermes.cancel(slug, { channel: 'knowledge', requestId });
  }
  async function send({ visibleText, buildPrompt, attachments }) {
    if (busy.value) return { success: false, error: '资料问答仍在回答，请稍后再试' };
    busy.value = true; cancelled = false;
    requestId = `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const id = requestId;
    const user = { role: 'user', content: visibleText, timestamp: new Date().toISOString(), thinkingSteps: [] };
    messages.value.push(user, { role: 'assistant', content: '', thinkingSteps: [], thinkingDone: false, expanded: true });
    const reply = messages.value.at(-1);
    const off = window.api.hermes.onSessionUpdate(data => {
      if (data.slug !== slug || data.channel !== 'knowledge' || data.requestId !== id || cancelled) return;
      const update = data.update || data;
      const type = update.type || update.sessionUpdate || data.type || data.sessionUpdate;
      if (type === 'agent_message_chunk' || type === 'content_block_delta') {
        const text = typeof update.content === 'string' ? update.content : update.content?.text;
        if (typeof text === 'string') reply.content += text;
      } else if (type === 'tool_call') {
        reply.thinkingSteps.push({ text: publicToolStep(update.title || update.name || 'read'), kind: 'public-progress', icon: 'fa-solid fa-book-open' });
      }
    });
    let result;
    try {
      const saved = await window.api.hermes.saveMessage(slug, plainMessage({ ...user, tab: 'knowledge' }));
      if (saved?.success === false) throw Error(saved.error || '提问保存失败');
      const prompt = await buildPrompt();
      if (cancelled) return { success: false, cancelled: true };
      result = await window.api.hermes.prompt(slug, prompt, attachments ? plainMessage(attachments) : undefined, { channel: 'knowledge', requestId: id });
      const failure = modelFailureMessage(cleanAssistantContent(reply.content));
      if (failure || result?.success === false) throw Error(failure || result.error || '资料问答失败');
      return result || { success: true };
    } catch (error) {
      if (!cancelled) reply.content += `\n\n本次资料问答失败：${error.message || error}`;
      return { success: false, error: String(error.message || error), cancelled };
    } finally {
      try {
        off();
        if (cancelled || result?.stopReason === 'cancelled') {
          reply.cancelled = true;
          reply.content ||= '本轮资料问答已停止。';
        }
        finalizeResponseSummary(reply);
        reply.thinkingDone = true;
        reply.timestamp = new Date().toISOString();
        if (reply.content) await window.api.hermes.saveMessage(slug, plainMessage({ ...reply, tab: 'knowledge' }));
      } finally { busy.value = false; }
    }
  }
  const chat = { messages, busy, send, cancel };
  chats.set(slug, chat);
  return chat;
}
