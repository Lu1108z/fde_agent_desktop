'use strict';

const OPENINGS = new Set(['开始 FDE 教练陪练', '/fde-coach']);

function conversationSummary(messages) {
  const meaningful = messages.filter(message => {
    if (!message || !['user', 'assistant'].includes(message.role)) return false;
    const text = String(message.content || '').trim();
    return (text && !(message.role === 'user' && OPENINGS.has(text))) || message.attachments?.length;
  });
  const lastMessageAt = meaningful.map(message => message.timestamp || '').sort().at(-1) || '';
  return { hasMessages: meaningful.length > 0, lastMessageAt };
}

module.exports = { conversationSummary };
