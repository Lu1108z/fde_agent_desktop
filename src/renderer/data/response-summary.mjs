const OPEN = '<response_summary>', CLOSE = '</response_summary>';
// Flatten Vue proxies before crossing Electron's contextBridge (before preload).
export const plainMessage = value => JSON.parse(JSON.stringify(value));
export function splitResponseSummary(value) {
  const text = String(value || ''), start = text.trimStart();
  // Hide partial format markers while streaming; ordinary prose/code stays intact.
  if (start && OPEN.startsWith(start)) return { summary: '', content: '' };
  if (!start.startsWith(OPEN)) return { summary: '', content: text };
  const end = start.indexOf(CLOSE, OPEN.length);
  if (end < 0) {
    let summary = start.slice(OPEN.length);
    const partial = summary.lastIndexOf('<');
    if (partial >= 0 && CLOSE.startsWith(summary.slice(partial))) summary = summary.slice(0, partial);
    return { summary: chineseSummary(summary), content: '' };
  }
  return { summary: chineseSummary(start.slice(OPEN.length, end)), content: start.slice(end + CLOSE.length).trimStart() };
}
export function chineseSummary(value) {
  return String(value || '').split('\n').map(line => line.trim().replace(/^[-*•\d.、\s]+/, ''))
    .filter(line => /[\u4e00-\u9fff]/.test(line) && !/[A-Za-z][A-Za-z ,;:'"!?-]{55,}/.test(line))
    .slice(0, 4).map(line => line.slice(0, 160)).join('\n').slice(0, 480);
}
export function finalizeResponseSummary(message) {
  const parsed = splitResponseSummary(message.content);
  message.content = parsed.content;
  message.thinkingSummary = parsed.summary || chineseSummary(message.thinkingSummary) || answerExplanation(message);
  return message;
}
// Fallback uses observable execution facts and the public answer, never raw reasoning.
export function answerExplanation(message) {
  if (message.cancelled || !message.content) return '';
  const points = [];
  const documents = new Set((message.knowledgeSources || []).map(source => source.id));
  if (documents.size) points.push(`资料依据：本轮提供了 ${documents.size} 份相关资料作为参考。`);
  points.push(...(message.thinkingSteps || []).filter(step => step.kind === 'public-progress').map(step => step.text).slice(-3));
  points.push('模型本轮未返回额外的分析说明。');
  return chineseSummary(points.join('\n'));
}
export function publicToolStep(name, status = 'running') {
  const value = String(name || '').toLowerCase();
  const action = /read|open|查看|读取/.test(value) ? '读取资料' : /search|检索|搜索/.test(value) ? '检索相关内容' : /write|edit|apply|写入|编辑/.test(value) ? '整理并更新文件' : /exec|command|运行/.test(value) ? '执行任务检查' : '处理辅助任务';
  return status === 'failed' ? `${action}未成功，需要重试或调整` : status === 'completed' ? `${action}已完成` : `正在${action}`;
}
export function publicResponseSteps(message, busy) {
  const steps = (message.thinkingSteps || []).filter(step => !/fa-brain/.test(step.icon || '') && step.kind === 'public-progress').map(step => step.text);
  if (!steps.length) steps.push(busy ? '正在处理你的问题，整理回答。' : message.cancelled ? '本轮已停止，可以继续提问。' : message.content ? '本轮回答已完成。' : '本轮未收到回答，可以重试。');
  return [...new Set(steps)].slice(-5);
}
