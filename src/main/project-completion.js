const { gate } = require('./product-flow-gate');

// 历史验收保留，当前成果发生变更时重新进入待复核状态。
function reconcileCompletion(root, meta) {
  if (meta?.workflowMode !== 'product-flow-v1' || meta.stageStatus?.[5] !== 'done') return false;
  const issues = [2, 3, 4, 5].flatMap(stage => gate(root, stage));
  if (!issues.length) return false;
  meta.stageStatus = { ...meta.stageStatus, 5: 'active' };
  if (meta.status === 'completed') meta.status = 'active';
  meta.completionReview = { status: 'needs-review', detectedAt: new Date().toISOString(), reason: issues[0] };
  return true;
}

module.exports = { reconcileCompletion };
