// A renderer can hot-reload before Electron's main process has restarted.
// Older main processes can persist the same conversation fields via metadata.
export function createConversationActions(api, { isBusy = () => false, isProject = () => false } = {}) {
  let useLegacy = typeof api.conversationAction !== 'function';
  const validSlug = slug => typeof slug === 'string' && /^[a-zA-Z0-9_-]+$/.test(slug);
  const missingHandler = error => /No handler registered for ['"]hermes:conversation-action['"]/.test(error?.message || '');
  const checked = result => {
    if (!result?.success) throw new Error(result?.error || '操作失败，请重试');
    return result;
  };

  async function legacy({ slug, action, name, pinned, projectSlug }) {
    if (!validSlug(slug)) throw new Error('无效的对话');
    if (!['share', 'pin', 'restore'].includes(action) && isBusy(slug)) throw new Error('请先停止当前回复，再操作对话');
    const metaResult = checked(await api.readFile(slug, 'meta.json'));
    const meta = JSON.parse(metaResult.content);
    if (!meta) throw new Error('对话不存在');
    if (action === 'share') {
      const history = checked(await api.readFile(slug, 'messages.jsonl'));
      const messages = history.content.split('\n').filter(line => line.trim()).flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
      }).filter(message => ['user', 'assistant'].includes(message.role) && message.content);
      const title = meta.conversationName || meta.name || '对话';
      return { success: true, title, content: `# ${title}\n\n` + messages.map(message => `## ${message.role === 'user' ? '我' : '助手'}\n\n${message.content}`).join('\n\n---\n\n') };
    }
    let updates;
    if (action === 'rename') {
      name = String(name || '').trim();
      if (!name || name.length > 100) throw new Error('名称需为 1–100 个字');
      updates = { conversationName: name };
    } else if (action === 'pin') {
      updates = { conversationPinnedAt: pinned ? new Date().toISOString() : null };
    } else if (action === 'move') {
      if (projectSlug && (!validSlug(projectSlug) || projectSlug === slug || !isProject(projectSlug))) throw new Error('请选择有效的项目');
      updates = { parentProjectSlug: projectSlug || null };
    } else if (action === 'delete') {
      updates = { conversationDeletedAt: new Date().toISOString() };
    } else if (action === 'restore') {
      updates = { conversationDeletedAt: null };
    } else throw new Error('不支持的操作');
    const result = checked(await api.updateProjectMeta(slug, updates));
    if (!result.meta) throw new Error('对话不存在');
    return result;
  }

  return async payload => {
    try {
      if (!useLegacy) {
        try { return checked(await api.conversationAction(payload)); }
        catch (error) {
          if (!missingHandler(error)) throw error;
          useLegacy = true;
        }
      }
      return await legacy(payload);
    } catch (error) {
      if (/Error invoking remote method|No handler registered|not a function/.test(error?.message || '')) {
        throw new Error('对话操作暂时不可用，请重新打开软件后重试');
      }
      throw error;
    }
  };
}
