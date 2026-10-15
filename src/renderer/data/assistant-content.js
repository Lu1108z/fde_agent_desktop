// Process bookkeeping belongs in execution logs, not in the answer body.
// Preserve fenced code and substantive prose following the housekeeping sentence.
import { splitResponseSummary } from './response-summary.mjs';
export function cleanAssistantContent(value) {
  let fence = '';
  return splitResponseSummary(value).content.split('\n').map(line => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = '';
      return line;
    }
    if (fence) return line;
    const notice = /^\s*(?:[-*]\s+)?(?:\*\*)?后台(?:执行|运行)(?:验证|检查)(?:通过|成功)(?:\*\*)?\s*[：:]/.exec(line);
    if (!notice) return line;
    // Hide partial streaming notices as soon as their prefix is received.
    const end = line.indexOf('。', notice[0].length);
    return end < 0 ? '' : line.slice(end + 1).trimStart();
  }).filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n').trim();
}
