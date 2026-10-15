// Hermes can report a provider failure as a completed assistant message.
// Recognize only error-shaped responses so quoted troubleshooting text stays intact.
export function modelFailureMessage(value) {
  const text = String(value || '').trim();
  if (!/^(?:API call failed(?: after \d+ retries)?\s*:|Hermes can't reach the model provider|模型服务(?:连接|请求)失败[：，])/i.test(text)) return '';
  if (text.startsWith('模型服务')) return text;
  if (/can't reach|offline|Connection error|nodename nor servname|ENOTFOUND|EAI_AGAIN/i.test(text)) {
    return '模型服务连接失败：无法连接模型服务。请检查网络或代理，恢复后重试。已有资料和生成文件已保留。';
  }
  return `模型服务请求失败，请稍后重试。${text.replace(/^API call failed(?: after \d+ retries)?\s*:/i, '').trim()}`;
}
