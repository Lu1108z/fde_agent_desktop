import { FDE_STAGES, DEFAULT_STAGE } from './fde-stages';
import { deliverablesForStage } from './project-deliverables';

export function projectStage(project) {
  const n = Number(project?.stage);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : DEFAULT_STAGE;
}

export function isActiveProject(project) {
  return !['completed', 'archived'].includes(project.status) && project.stageStatus?.[5] !== 'done';
}

export function projectTodos(projects) {
  return projects.filter(isActiveProject).flatMap(project => {
    const stage = projectStage(project);
    const expected = deliverablesForStage(stage);
    const actual = project.deliverables || project.outputs?.deliverables || [];
    const missing = expected.filter(doc => {
      if (doc.file === 'spec.md') return !(project.hasSpec || project.outputs?.hasSpec);
      const base = doc.file.split('/').pop().replace(/\.[^.]+$/, '');
      return !actual.some(item => Number(item.stage) === stage && item.base === base);
    });
    const projectPath = `/projects/${project.slug}`;
    if (missing.length) return missing.map(doc => ({
      id: `${project.slug}:${stage}:${doc.key}`,
      title: `生成${doc.short || doc.name}`,
      projectName: project.name,
      stage,
      label: '待生成',
      detail: doc.hint,
      to: { path: projectPath, query: { stage: String(stage), deliverable: doc.key } },
    }));
    const first = expected[0];
    return [{
      id: `${project.slug}:${stage}:continue`,
      title: expected.length ? `核对${FDE_STAGES.find(s => s.id === stage)?.label}交付物` : `推进${FDE_STAGES.find(s => s.id === stage)?.label}`,
      projectName: project.name,
      stage,
      label: expected.length ? '待核对' : '待推进',
      detail: FDE_STAGES.find(s => s.id === stage)?.nextStep,
      to: first ? { path: projectPath, query: { stage: String(stage), deliverable: first.key } } : projectPath,
    }];
  });
}
