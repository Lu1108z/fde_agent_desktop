// Keep navigation state only for this running app. A fresh launch starts a new chat.
const selectedConversations = new Map();

export function getActiveConversation(mode) {
  return selectedConversations.get(mode) || '';
}

export function setActiveConversation(mode, slug) {
  selectedConversations.set(mode, slug || '');
}
