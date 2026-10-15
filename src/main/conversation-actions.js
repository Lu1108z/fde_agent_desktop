'use strict';

function registerConversationActions({ ipcMain, readMeta, writeMeta, readMessages, isProject, isBusy }) {
  ipcMain.handle('hermes:conversation-action', async (_event, payload = {}) => {
    try {
      const { slug, action } = payload;
      if (typeof slug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error('无效的对话');
      const meta = readMeta(slug);
      if (!meta) throw new Error('对话不存在');
      if (action === 'share') {
        const title = meta.conversationName || meta.name || '对话';
        const messages = readMessages(slug, Number.MAX_SAFE_INTEGER)
          .filter(message => ['user', 'assistant'].includes(message.role) && message.content);
        const content = `# ${title}\n\n` + messages.map(message => `## ${message.role === 'user' ? '我' : '助手'}\n\n${message.content}`).join('\n\n---\n\n');
        return { success: true, title, content };
      }
      if (action !== 'pin' && action !== 'restore' && isBusy(meta.sessionId)) throw new Error('请先停止当前回复，再操作对话');
      if (action === 'rename') {
        const name = String(payload.name || '').trim();
        if (!name || name.length > 100) throw new Error('名称需为 1–100 个字');
        meta.conversationName = name;
      } else if (action === 'pin') {
        meta.conversationPinnedAt = payload.pinned ? new Date().toISOString() : null;
      } else if (action === 'move') {
        const target = payload.projectSlug || '';
        if (target && (typeof target !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(target) || target === slug || !isProject(target, readMeta(target)))) throw new Error('请选择有效的项目');
        meta.parentProjectSlug = target || null;
      } else if (action === 'delete') {
        // Delete the conversation entry, preserving project deliverables; the UI offers undo.
        meta.conversationDeletedAt = new Date().toISOString();
      } else if (action === 'restore') {
        meta.conversationDeletedAt = null;
      } else throw new Error('不支持的操作');
      writeMeta(slug, meta);
      return { success: true, meta };
    } catch (error) { return { success: false, error: error.message }; }
  });
}

module.exports = { registerConversationActions };
