export const MANAGEMENT_STAGES = ['未开始', '调研准备', '需求沟通', '需求确认', '行业工作台', '客户试用'];
export const managementStageLabel = record => MANAGEMENT_STAGES[record.stage] || record.stageText || '未填写阶段';
export const managementCompleted = record => /^(已完成|完成|已结束|已交付|已关闭|completed|done)$/i.test(record.status || '');
export function managementOverdue(record) {
  const today = new Date();
  const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return !!record.endDate && record.endDate < localDay && !managementCompleted(record);
}
export function managementTodos(records) {
  return records.filter(record => !managementCompleted(record)).map(record => ({
    id: `management:${record.id}`,
    title: record.action || (record.stage === null ? '补充当前阶段信息' : record.stage === 0 ? '确认项目启动安排' : record.progress === 100 ? `确认「${managementStageLabel(record)}」是否完成` : `推进${managementStageLabel(record)}`),
    projectName: [record.project, record.agent, record.owner].filter(Boolean).join(' · '),
    stage: record.stage === null ? '未填写' : record.stage || '待启动',
    label: managementOverdue(record) ? '已逾期' : record.action ? '待推进' : '建议下一步',
    detail: record.action || '根据导入阶段生成的推进建议；完成状态以源表为准。',
    to: { path: '/project-management/imported', query: { record: record.id } },
    overdue: managementOverdue(record),
  })).sort((a, b) => Number(b.overdue) - Number(a.overdue));
}
