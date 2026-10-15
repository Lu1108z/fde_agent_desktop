<template>
  <div class="workbench-root flex-1 min-h-0 overflow-y-auto">
    <StageDetail v-if="activeStage" :stage="activeStage" :initial-file="activityFile" @back="leaveStage" @coach="goCoach" />

    <div v-else class="dashboard">
      <div class="dashboard-grid">
        <main class="dashboard-main">
          <section class="panel project-panel">
            <div class="section-heading">
              <div class="project-heading-title"><h2>进行中的项目</h2><UiSelect v-if="activeProjects.length > 1" v-model="selectedProjectSlug" class="project-select" :max-visible="6" aria-label="切换进行中的项目" :options="activeProjects.map(project => ({ value: project.slug, label: project.name }))" /></div>
              <div class="project-heading-actions"><button type="button" class="section-link" :disabled="loadingProjects" @click="refreshProjects"><i class="fa-solid fa-rotate" :class="{ 'fa-spin': loadingProjects }"></i>刷新</button><router-link to="/projects" class="section-link">查看全部 <i class="fa-solid fa-chevron-right"></i></router-link></div>
            </div>
            <div v-if="loadingProjects" class="project-empty">正在加载项目…</div>
            <div v-else-if="projectError" class="project-empty"><div><strong>项目暂时未能加载</strong><p>{{ projectError }}</p></div><button class="continue-button" @click="refreshProjects">重新加载</button></div>
            <div v-else-if="featuredProject" class="featured-project">
              <div class="project-summary">
                <div class="project-artwork"><div class="project-symbol"><img v-if="currentCover?.url" :key="currentCover.url" :src="currentCover.url" :alt="featuredProject.name + '的项目封面'" @error="coverImageFailed" /><i v-else-if="currentCover?.loading" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-building-columns"></i></div></div>
                <div class="project-info">
                  <div class="project-title-line">
                    <span class="status-pill">进行中</span>
                    <h3>{{ featuredProject.name }}</h3>
                  </div>
                  <p><i class="fa-solid fa-flag"></i>当前阶段 · {{ stageLabel(stageOf(featuredProject)) }}</p>
                  <p v-if="featuredProject.updatedAt || featuredProject.createdAt"><i class="fa-regular fa-clock"></i>最近更新 · {{ formatDate(featuredProject.updatedAt || featuredProject.createdAt) }}</p>
                </div>
                <router-link :to="`/projects/${featuredProject.slug}`" class="continue-button">继续处理 <i class="fa-solid fa-arrow-right"></i></router-link>
              </div>
              <div class="project-progress" :aria-label="`当前第 ${stageOf(featuredProject)} 阶段`">
                <div v-for="s in stages" :key="s.id" class="progress-step" :class="progressState(featuredProject, s.id)">
                  <div class="progress-track"><span class="progress-dot"><i v-if="progressState(featuredProject, s.id) === 'done'" class="fa-solid fa-check"></i><template v-else>{{ s.id }}</template></span></div>
                  <strong>{{ s.label }}</strong>
                  <small>{{ progressState(featuredProject, s.id) === 'active' ? '当前阶段' : progressState(featuredProject, s.id) === 'done' ? '已完成' : '待开始' }}</small>
                </div>
              </div>
            </div>
            <div v-else class="project-empty">
              <span class="empty-icon"><i class="fa-solid fa-folder-plus"></i></span>
              <div><strong>还没有进行中的项目</strong><p>创建第一个项目，按五阶段流程开始推进。</p></div>
              <router-link to="/projects/new" class="continue-button">新建项目 <i class="fa-solid fa-arrow-right"></i></router-link>
            </div>
          </section>

          <section class="panel stage-panel">
            <div class="section-heading">
              <h2>五阶段流程</h2>
              <router-link to="/project-spec" class="section-link">查看完整流程 <i class="fa-solid fa-chevron-right"></i></router-link>
            </div>
            <div class="stage-grid">
              <template v-for="(s, index) in stages" :key="s.id">
                <button type="button" class="process-card" :class="[s.ui?.accent, { 'process-card--active': featuredProject && stageOf(featuredProject) === s.id }]" @click="activeStage = s">
                  <div class="process-top"><span class="process-icon"><i :class="s.ui?.icon"></i></span><span class="process-number">{{ String(s.id).padStart(2, '0') }}</span></div>
                  <h3>{{ s.label }}</h3>
                  <p>{{ s.name }}</p>
                  <span class="process-foot">查看阶段内容 <i class="fa-solid fa-arrow-right"></i></span>
                </button>
                <i v-if="index < stages.length - 1" class="fa-solid fa-arrow-right process-arrow" aria-hidden="true"></i>
              </template>
            </div>
          </section>

          <section class="panel resource-panel">
            <div class="section-heading">
              <h2>常用资源</h2>
              <router-link to="/knowledge" class="section-link">进入资源中心 <i class="fa-solid fa-chevron-right"></i></router-link>
            </div>
            <div class="resource-grid">
              <router-link v-for="resource in resourceLinks" :key="resource.title" :to="resource.to" class="resource-card" :class="resource.tone">
                <span class="resource-icon"><i :class="resource.icon"></i></span>
                <span class="resource-copy"><strong>{{ resource.title }}</strong><small>{{ resource.description }}</small></span>
                <i class="fa-solid fa-arrow-right resource-arrow"></i>
              </router-link>
            </div>
          </section>

          <section class="panel baseline-panel">
            <div class="section-heading">
              <h2>实施基线</h2>
              <router-link to="/project-spec" class="section-link">查看详情 <i class="fa-solid fa-chevron-right"></i></router-link>
            </div>
            <div class="baseline-flow">
              <template v-for="(node, index) in envLine" :key="node.label">
                <div class="baseline-node"><i :class="node.icon"></i><span>{{ node.label }}</span></div>
                <i v-if="index < envLine.length - 1" class="fa-solid fa-chevron-right baseline-arrow" aria-hidden="true"></i>
              </template>
            </div>
          </section>
        </main>

        <aside class="dashboard-side">
          <section class="panel side-panel todo-panel">
            <div class="section-heading"><h2>我的待办 <span v-if="todos.length" class="todo-count">{{ todos.length }}</span></h2><button type="button" class="panel-delete" :disabled="!todos.some(todo => todo.id === selectedTodoId)" aria-label="删除选中的待办" :title="selectedTodoId ? '删除选中的待办' : '先选中一条待办'" @click="deleteSelectedTodo"><i class="fa-regular fa-trash-can"></i></button></div>
            <div v-if="loadingProjects" class="side-empty"><p>正在同步项目待办…</p></div>
            <div v-else-if="projectError" class="side-empty"><strong>待办暂未同步</strong><p>重新加载项目后会自动同步。</p></div>
            <div v-else-if="todos.length" class="todo-list" role="region" aria-label="待办列表，可上下滚动" tabindex="0">
              <div v-for="todo in todos" :key="todo.id" class="todo-item" :class="{ 'is-selected': selectedTodoId === todo.id }">
                <button type="button" class="todo-link" :aria-pressed="selectedTodoId === todo.id" :title="todo.detail + ' · 双击进入'" @click="selectedTodoId = todo.id" @dblclick="router.push(todo.to)" @keydown.enter.prevent="router.push(todo.to)"><span class="todo-indicator"><i class="fa-solid fa-arrow-right"></i></span><span class="todo-copy"><strong>{{ todo.title }}</strong><small>{{ todo.projectName }} · 阶段 {{ todo.stage }}</small></span></button>
                <UiSelect :model-value="todoPriorities[todo.id] || ''" class="todo-priority" :class="todoPriorities[todo.id] ? 'priority-' + todoPriorities[todo.id].toLowerCase() : 'priority-unset'" :aria-label="`${todo.projectName} · ${todo.title}的优先级`" :options="priorityOptions" compact placeholder="—" @change="setTodoPriority(todo.id, $event)" />
              </div>
            </div>
            <div v-else class="side-empty"><span class="side-empty-icon"><i class="fa-regular fa-circle-check"></i></span><strong>暂无待办事项</strong><p>创建项目后，会根据当前阶段显示下一步。</p><router-link to="/projects/new">新建项目 <i class="fa-solid fa-arrow-right"></i></router-link></div>
            <p v-if="prioritySaveError" class="priority-save-error" role="alert">{{ prioritySaveError }}</p>
          </section>
          <section class="panel side-panel activity-panel">
            <div class="section-heading"><h2>最近动态</h2><button type="button" class="panel-delete" :disabled="!recentActivities.some(entry => entry.id === selectedActivityId)" aria-label="删除选中的动态" :title="selectedActivityId ? '删除选中的动态' : '先选中一条动态'" @click="deleteSelectedActivity"><i class="fa-regular fa-trash-can"></i></button></div>
            <div v-if="recentActivities.length" class="activity-list" role="region" aria-label="最近动态列表，可上下滚动" tabindex="0">
              <div v-for="entry in recentActivities" :key="entry.id" class="activity-item" :class="{ 'is-selected': selectedActivityId === entry.id }">
                <button type="button" class="activity-link" :aria-pressed="selectedActivityId === entry.id" title="单击选择，双击进入" @click="selectedActivityId = entry.id" @dblclick="openActivity(entry)" @keydown.enter.prevent="openActivity(entry)">
                  <span class="activity-icon"><i :class="entry.file ? 'fa-solid fa-file-pen' : 'fa-solid fa-folder-open'"></i></span>
                  <span class="activity-copy"><strong>{{ entry.title }}</strong><small>{{ entry.action }} · {{ entry.projectName || ('阶段 ' + Number(entry.stage) + ' · ' + stageLabel(Number(entry.stage))) }}</small></span>
                  <time :title="new Date(entry.updatedAt).toLocaleString('zh-CN')">{{ formatActivityTime(entry.updatedAt) }}</time>
                </button>
              </div>
            </div>
            <div v-else class="side-empty activity-empty"><span class="side-empty-icon"><i class="fa-regular fa-clock"></i></span><strong>暂无动态</strong><p>文档保存和资料上传后，会显示在这里。</p></div>
          </section>

        </aside>
      </div>

      <div v-if="deleteNotice" class="dashboard-notice" role="status"><span>{{ deleteNotice }}</span><button v-if="undoDelete" type="button" @click="undoLastDelete">撤销</button></div>
      <button ref="launcherRef" type="button" class="coach-launcher" :class="{'is-dragging': dragging, 'is-running': running, 'is-running-left': runDirection < 0}" :style="{...launcherStyle, '--coach-run-duration': runDuration + 'ms'}" aria-label="找 FDE 教练陪练聊需求，可拖动移动位置" title="拖动移动位置，点击进入陪练；Shift + 方向键也可移动" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag" @keydown="moveWithKeyboard" @click="clickLauncher" @dragstart.prevent>
        <span class="coach-launcher__bubble" aria-hidden="true"><span>你好，我是 FDE 教练<br />需要我帮你做什么？</span><i class="fa-solid fa-arrow-right"></i></span>
        <span class="coach-launcher__mascot" aria-hidden="true">
          <img class="coach-stand" src="../../assets/fde-coach-mascot.png" alt="" draggable="false" />
          <span class="coach-run" aria-hidden="true"><span class="coach-run__frames"></span></span>
        </span>
      </button>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDraggableLauncher } from '@/composables/useDraggableLauncher';
import { FDE_STAGES } from '@/data/fde-stages';
import StageDetail from '@/components/workbench/StageDetail.vue';
import UiSelect from '@/components/common/UiSelect.vue';
import bundledHandbookManifest from '../../../../fde-handbook/manifest.json';
import { projectStage, isActiveProject, projectTodos } from '@/data/workbench-projects';

const router = useRouter();
const activeStage = ref(null);
const activityFile = ref('');
const activities = ref([]);
let stopActivityListener;
const projects = ref([]);
const loadingProjects = ref(true);
const projectError = ref('');
const priorityStorageKey = 'fde.workbench.todo-priorities';
const priorityRank = { P0: 0, P1: 1, P2: 2 };
const priorityOptions = [{ value: '', label: '不设优先级' }, { value: 'P0', label: 'P0' }, { value: 'P1', label: 'P1' }, { value: 'P2', label: 'P2' }];
const prioritySaveError = ref('');
const selectedTodoId = ref(''), selectedActivityId = ref('');
const dismissedTodoKey = 'fde.workbench.dismissed-todos', dismissedActivityKey = 'fde.workbench.dismissed-activities';
function readDismissed(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch (_) { return {}; }
}
const dismissedTodos = ref(readDismissed(dismissedTodoKey)), dismissedActivities = ref(readDismissed(dismissedActivityKey));
const deleteNotice = ref(''), undoDelete = ref(null);
let deleteNoticeTimer;
function persistDismissed(key, records) {
  try { localStorage.setItem(key, JSON.stringify(records)); return true; }
  catch (_) { return false; }
}
function dismissEntry(records, key, id, value, label) {
  const previous = records.value[id];
  records.value = { ...records.value, [id]: value };
  const persisted = persistDismissed(key, records.value);
  deleteNotice.value = persisted ? `已删除${label}` : `已删除${label}，但未能保存，请稍后重试`;
  undoDelete.value = () => {
    const restored = { ...records.value };
    if (previous === undefined) delete restored[id]; else restored[id] = previous;
    records.value = restored;persistDismissed(key, restored);
  };
  clearTimeout(deleteNoticeTimer);
  deleteNoticeTimer = setTimeout(() => { deleteNotice.value = ''; undoDelete.value = null; }, 6000);
}
function deleteTodo(todo) { dismissEntry(dismissedTodos, dismissedTodoKey, todo.id, true, '待办'); if (selectedTodoId.value === todo.id) selectedTodoId.value = ''; }
function deleteActivity(entry) { dismissEntry(dismissedActivities, dismissedActivityKey, entry.id, entry.updatedAt, '动态'); if (selectedActivityId.value === entry.id) selectedActivityId.value = ''; }
function deleteSelectedTodo() { const todo = todos.value.find(item => item.id === selectedTodoId.value); if (todo) deleteTodo(todo); }
function deleteSelectedActivity() { const entry = recentActivities.value.find(item => item.id === selectedActivityId.value); if (entry) deleteActivity(entry); }
function undoLastDelete() { undoDelete.value?.(); undoDelete.value = null; deleteNotice.value = ''; clearTimeout(deleteNoticeTimer); }
onBeforeUnmount(() => clearTimeout(deleteNoticeTimer));

function readTodoPriorities() {
  try {
    const saved = JSON.parse(localStorage.getItem(priorityStorageKey) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => Object.hasOwn(priorityRank, value)));
  } catch (_) { return {}; }
}
const todoPriorities = ref(readTodoPriorities());
function setTodoPriority(id, value) {
  if (value && !Object.hasOwn(priorityRank, value)) return;
  const updated = { ...todoPriorities.value };
  if (value) updated[id] = value;
  else delete updated[id];
  todoPriorities.value = updated;
  prioritySaveError.value = '';
  try { localStorage.setItem(priorityStorageKey, JSON.stringify(updated)); }
  catch (_) { prioritySaveError.value = '优先级已调整，但未能保存；重新打开后可能恢复。'; }
}
const stages = ref([]);


const stageUi = {
  1: { icon: 'fa-solid fa-file-lines', accent: 'stage-blue' },
  2: { icon: 'fa-solid fa-comments', accent: 'stage-green' },
  3: { icon: 'fa-solid fa-robot', accent: 'stage-violet' },
  4: { icon: 'fa-solid fa-table-cells-large', accent: 'stage-orange' },
  5: { icon: 'fa-solid fa-rocket', accent: 'stage-purple' },
};
const buildStages = (manifest) => {
  const byId = Object.fromEntries((manifest?.stages || []).map(s => [s.id, s]));
  return FDE_STAGES.map(s => ({
    ...s,
    dir: byId[s.id]?.dir || String(s.id).padStart(2, '0'),
    items: byId[s.id]?.items || [],
    counts: byId[s.id]?.counts || {},
    ui: stageUi[s.id],
  }));
};
// 浏览器预览直接使用随应用打包的手册；桌面端启动后再读取用户当前手册。
stages.value = buildStages(bundledHandbookManifest);

const resourceLinks = [
  { title: '调研资料', description: '行业知识 / 调研框架', icon: 'fa-solid fa-file-lines', tone: 'resource-blue', to: '/knowledge' },
  { title: '项目规范', description: '交付流程 / 命名规范', icon: 'fa-solid fa-book-open', tone: 'resource-orange', to: '/project-spec' },
  { title: '智能体设计', description: '技能中心 / AI 工具', icon: 'fa-solid fa-diagram-project', tone: 'resource-violet', to: '/skills' },
  { title: '培训教程', description: '视频课程 / 实战案例', icon: 'fa-solid fa-graduation-cap', tone: 'resource-indigo', to: '/training' },
];
const envLine = [
  { label: '环境准备', icon: 'fa-solid fa-server' },
  { label: '数据确认', icon: 'fa-solid fa-database' },
  { label: 'SDR 设计', icon: 'fa-solid fa-cube' },
  { label: 'SQL 部署', icon: 'fa-solid fa-file-code' },
  { label: '试点验证', icon: 'fa-solid fa-circle-check' },
  { label: 'SaaS 配置', icon: 'fa-solid fa-cloud' },
  { label: '智能体接入', icon: 'fa-solid fa-robot' },
];
const selectedProjectSlug = ref(localStorage.getItem('fde.workbench.selected-project') || '');
const activeProjects = computed(() => projects.value.filter(isActiveProject));
const featuredProject = computed(() => activeProjects.value.find(project => project.slug === selectedProjectSlug.value) || activeProjects.value[0] || null);
const covers = ref({});
const currentCover = computed(() => covers.value[featuredProject.value?.slug]);
let disposed = false;
async function loadCover(project, force = false) {
  if (!project || !window.api?.projectCover || disposed) return;
  const { slug, name } = project;
  const prior = covers.value[slug];
  if (prior?.loading || (!force && prior?.title === name)) return;
  covers.value[slug] = { ...prior, title: name, loading: true, error: '' };
  try {
    let result = force ? null : await window.api.projectCover.get(slug);
    if (!result || (result.success && result.missing)) result = await window.api.projectCover.generate(slug, force);
    if (disposed || covers.value[slug]?.title !== name) return;
    if (!result.success) throw new Error(result.error || '封面生成失败，请重试。');
    covers.value[slug] = { ...result, loading: false };
  } catch (error) {
    if (!disposed && covers.value[slug]?.title === name) covers.value[slug] = { ...covers.value[slug], loading: false, error: error.message };
  }
}
async function coverImageFailed() {
  const slug = featuredProject.value?.slug;
  const cover = covers.value[slug];
  if (!slug || !cover) return;
  covers.value[slug] = { ...cover, url: '', retried: true };
  if (cover.retried) return;
  try {
    // A failed local URL should be refreshed from disk, never trigger paid generation.
    const result = await window.api.projectCover.get(slug);
    if (!disposed && result?.success && result.url && covers.value[slug]?.title === cover.title) {
      covers.value[slug] = { ...result, loading: false, retried: true };
    }
  } catch (_) { /* Keep the built-in icon if the local file cannot be displayed. */ }
}
watch(() => featuredProject.value && `${featuredProject.value.slug}:${featuredProject.value.name}`, () => {
  const project = featuredProject.value;
  if (!project) return;
  selectedProjectSlug.value = project.slug;
  localStorage.setItem('fde.workbench.selected-project', project.slug);
  loadCover(project);
});
onBeforeUnmount(() => { disposed = true; });
const recentActivities = computed(() => {
  const recordedProjects = new Set(activities.value.map(entry => entry.slug).filter(Boolean));
  const projectUpdates = projects.value.filter(project => !recordedProjects.has(project.slug)).map(project => ({id:`project:${project.slug}`, kind:'project', slug:project.slug, title:project.name, projectName:project.name, action:project.updatedAt ? '更新了项目' : '创建了项目', updatedAt:project.updatedAt || project.createdAt}));
  return [...activities.value, ...projectUpdates].filter(entry => entry.updatedAt && dismissedActivities.value[entry.id] !== entry.updatedAt).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
});
function formatActivityTime(value) {
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) return new Intl.DateTimeFormat('zh-CN', {hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  return formatDate(value);
}
async function refreshActivities() {
  try { const result = await window.api?.activity?.list?.(); if (result?.success) activities.value = Array.isArray(result.items) ? result.items : []; }
  catch (error) { console.error('Failed to load activities:', error); }
}
function leaveStage() { activeStage.value = null; activityFile.value = ''; refreshActivities(); }
function openActivity(entry) {
  if (entry.kind === 'library-file') { router.push({path:'/library',query:{space:entry.spaceId,file:entry.file}}); return; }
  if (entry.kind === 'handbook-file') {
    activityFile.value = entry.file;
    activeStage.value = stages.value.find(stage => stage.dir === entry.stage) || null;
  } else if (entry.slug) router.push(`/projects/${entry.slug}`);
}
watch(activeStage, value => { if (!value) activityFile.value = ''; });
onBeforeUnmount(() => { stopActivityListener?.(); });
const todos = computed(() => projectTodos(projects.value).filter(todo => !dismissedTodos.value[todo.id]).sort((a, b) =>
  (priorityRank[todoPriorities.value[a.id]] ?? 3) - (priorityRank[todoPriorities.value[b.id]] ?? 3)
));
const stageOf = projectStage;
const stageLabel = (id) => FDE_STAGES.find(s => s.id === id)?.label || '';
const progressState = (project, id) => {
  const current = stageOf(project);
  if (id === current) return 'active';
  if (id < current || project?.stageStatus?.[id] === 'done') return 'done';
  return 'todo';
};
const formatDate = (value) => {
  if (!value) return '暂无时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无时间';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
};
const goCoach = () => router.push('/coach');
const {launcherRef, launcherStyle, dragging, running, runDuration, runDirection, startDrag, moveDrag, endDrag, clickLauncher, moveWithKeyboard} = useDraggableLauncher('fde.workbench.coach-position', goCoach);

let refreshingProjects = false;
async function refreshProjects() {
  if (refreshingProjects) return;
  refreshingProjects = true;
  loadingProjects.value = true;
  try {
    if (!window.api?.hermes?.listProjects) throw new Error('项目服务未连接');
    const list = await window.api.hermes.listProjects({ kind: 'project' });
    if (!Array.isArray(list)) throw new Error('项目服务返回异常');
    projects.value = list;
    projectError.value = '';
  } catch (e) {
    console.error('Failed to load workbench projects:', e);
    projectError.value = '未能连接项目服务，请重试；浏览器预览请使用已连接的桌面客户端。';
  } finally {
    loadingProjects.value = false;
    refreshingProjects = false;
  }
}
function refreshWhenVisible() { if (!document.hidden) { refreshProjects(); refreshActivities(); } }
onMounted(async () => {
  stopActivityListener = window.api?.activity?.onChanged?.(() => { refreshActivities(); refreshProjects(); });
  await refreshActivities();
  window.addEventListener('focus', refreshWhenVisible);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  await Promise.allSettled([refreshProjects(), (async () => {
    const result = await window.api?.handbook?.getManifest?.();
    if (result?.success) stages.value = buildStages(result.data);
  })()]);
});
onUnmounted(() => {
  window.removeEventListener('focus', refreshWhenVisible);
  document.removeEventListener('visibilitychange', refreshWhenVisible);
});
</script>

<style scoped>


.workbench-root { background:#fff; color: #17213d; }
.dashboard { position: relative; max-width: 1680px; min-height: 100%; margin: 0 auto; padding: 26px 36px 32px; }
.dashboard-grid { display: grid; grid-template-columns: minmax(0, 2.8fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
.dashboard-main, .dashboard-side { display: grid; gap: 17px; min-width: 0; }
.panel { min-width: 0; padding: 17px 20px; border: 1px solid #e7edf8; border-radius: 15px; background: rgba(255,255,255,.96); box-shadow: 0 6px 24px rgba(40,80,150,.035); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.section-heading h2 { margin: 0; color: #17213d; font-size: 17px; font-weight: 700; white-space: nowrap; }
.section-link { display: inline-flex; align-items: center; gap: 9px; flex: none; color: #6680af; font-size: 12px; text-decoration: none; }
.section-link:hover { color: var(--ui-brand); }
.section-link i { font-size: 10px; }
.project-heading-actions { display: flex; align-items: center; gap: 16px; }.project-heading-actions button { background: none; border: 0; padding: 0; cursor: pointer; }.project-heading-actions button:disabled { opacity: .5; }
.todo-count { margin-left: 5px; color: #2465ea; font-size: 12px; font-weight: 500; }
.managed-list { display:grid; }.managed-row { display:flex;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid #edf2f9;text-decoration:none; }.managed-row:last-child { border-bottom:0; }.managed-name { flex:1;min-width:0; }.managed-name strong { display:block;color:#385171;font-size:12px;font-weight:550; }.managed-name small { display:block;margin-top:4px;color:#94a3ba;font-size:10px; }.managed-stage { flex:none;color:#7090c2;font-size:11px; }.managed-progress { display:flex;align-items:center;gap:8px;flex:0 0 130px; }.managed-progress small { color:#8b9eb9;font-size:10px;min-width:36px; }.managed-bar { flex:1;background:#edf2f9;border-radius:4px;height:4px;overflow:hidden; }.managed-bar i { display:block;height:100%;background:#4380ef;border-radius:4px; }.managed-empty { margin:0;font-size:12px;color:#92a2b9;line-height:1.9; }.managed-empty a { display:inline-flex;gap:8px;color:#2465ea;margin-left:15px;text-decoration:none; }
.todo-caption { margin: 0 0 6px; color: #98a6bc; font-size: 11px; line-height: 1.6; }
.todo-list, .activity-list { overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain; scrollbar-gutter: auto; scrollbar-width: none; padding-right: 0; }
.workbench-root::-webkit-scrollbar, .todo-list::-webkit-scrollbar, .activity-list::-webkit-scrollbar { width: 0; }
.workbench-root { scrollbar-width: none; }.todo-list::-webkit-scrollbar-thumb, .activity-list::-webkit-scrollbar-thumb { background: #ccd9ee; border-radius: 5px; }
.todo-list { display: grid; grid-auto-rows: 61px; max-height: 305px; }.todo-item { box-sizing: border-box; display: flex; align-items: center; gap: 8px; min-width: 0; height: 61px; border-bottom: 1px solid #edf1f8; }.todo-item:last-child { border-bottom: 0; }.todo-link { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1; height: 100%; text-decoration: none; }.todo-link:hover strong { color: #2465ea; }
.todo-link:focus-visible, .todo-priority:focus-visible, .todo-list:focus-visible, .activity-list:focus-visible, .activity-item:focus-visible { outline: 2px solid #2465ea; outline-offset: -2px; border-radius: 6px; }
.todo-indicator { display: grid; place-items: center; flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%; color: #6290de; background: #eef4ff; font-size: 10px; }.todo-copy { flex: 1; min-width: 0; }.todo-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #30425e; font-size: 12px; font-weight: 550; line-height: 1.6; }.todo-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px; color: #93a2ba; font-size: 10px; }
.todo-priority { flex: 0 0 30px; width:30px; height:23px; border-radius:6px; font-size:10px; font-weight:500; line-height:1; transition:background .15s; }.priority-unset { color:#a0aec0; background:#f4f7fb; }.priority-p0 { color:#d53750; background:#fff0f2; }.priority-p1 { color:#b96924; background:#fff5e9; }.priority-p2 { color:#3975d7; background:#edf4ff; }.todo-priority :deep(.ui-select-trigger:hover) { background:rgba(0,0,0,.035); }
.priority-save-error { margin: 8px 0 0; color: #b96751; font-size: 11px; }
.featured-project { border: 1px solid #e1eafa; border-radius: 12px; padding: 15px 16px 13px; }
.project-summary { display: flex; align-items: center; gap: 15px; }
.project-heading-title { display:flex; align-items:center; gap:14px; min-width:0; }.project-select { max-width:240px; min-width:100px; font-size:12px; }
.project-artwork { flex:0 0 86px; text-align:center; }.project-symbol img { width:100%;height:100%;object-fit:cover; }.project-symbol { overflow:hidden; }
.project-symbol { display: grid; place-items: center; flex: 0 0 86px; width: 86px; height: 82px; border-radius: 10px; background: linear-gradient(135deg,#cce1ff,#e7f0ff); color: #3973db; font-size: 35px; }
.project-info { min-width: 0; flex: 1; }
.project-title-line { display: flex; align-items: center; gap: 11px; min-width: 0; }
.project-title-line h3 { overflow: hidden; margin: 0; color: #17213d; font-size: 17px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.status-pill { flex: none; border-radius: 7px; padding: 5px 8px; background: #e9f1ff; color: #2168d9; font-size: 12px; font-weight: 650; }
.project-info p { margin: 7px 0 0; color: #7b8ba8; font-size: 12px; }
.project-info p i { width: 17px; color: #8095bd; }
.continue-button { display: inline-flex; align-items: center; justify-content: center; gap: 12px; flex: none; min-height: 38px; padding: 0 16px; border-radius: 9px; background: #2465ea; color: white; font-size: 13px; font-weight: 650; text-decoration: none; box-shadow: 0 5px 12px rgba(36,101,234,.16); }
.continue-button:hover { background: #1c57d4; }
.continue-button i { font-size: 11px; }
.project-progress { display: grid; grid-template-columns: repeat(5,1fr); margin-top: 15px; }
.progress-step { position: relative; min-width: 0; color: #8090aa; }
.progress-step:not(:last-child)::before { position: absolute; top: 12px; left: 26px; right: 5px; height: 4px; border-radius: 3px; background: #e1e7f0; content: ''; }
.progress-step.done:not(:last-child)::before { background: #2a6bed; }
.progress-track { position: relative; z-index: 1; height: 30px; }
.progress-dot { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%; background: #e9edf4; color: #7988a2; font-size: 11px; font-weight: 700; }
.progress-step.done .progress-dot, .progress-step.active .progress-dot { background: #2465ea; color: #fff; }
.progress-step strong { display: block; overflow: hidden; color: #60718e; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.progress-step.active strong { color: #2465ea; }
.progress-step small { display: block; margin-top: 3px; color: #9aa8bf; font-size: 11px; }
.project-empty { display: flex; align-items: center; gap: 14px; min-height: 116px; border: 1px dashed #d7e3f5; border-radius: 12px; padding: 18px; color: #63728e; }
.project-empty .empty-icon { display: grid; place-items: center; width: 54px; height: 54px; border-radius: 13px; background: #ecf3ff; color: #3471e7; font-size: 23px; }
.project-empty strong { color: #263858; font-size: 14px; }
.project-empty p { margin: 5px 0 0; font-size: 12px; }
.project-empty .continue-button { margin-left: auto; }
.stage-grid { display: flex; align-items: stretch; gap: 8px; }
.process-card { display: flex; flex: 1 1 0; flex-direction: column; min-width: 0; min-height: 167px; border: 1px solid #e2e9f5; border-radius: 10px; background: #fff; padding: 13px 12px; color: #1c2945; text-align: left; cursor: pointer; transition: border-color .2s, transform .2s, box-shadow .2s; }
.process-card:hover, .process-card:focus-visible { border-color: #8aafff; box-shadow: 0 8px 24px rgba(43,103,210,.11); transform: translateY(-2px); outline: none; }
.process-card--active { border-color: #3775ff; background: #f8faff; box-shadow: 0 0 0 1px rgba(55,117,255,.13); }
.process-top { display: flex; align-items: center; justify-content: space-between; gap: 7px; }
.process-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: #e7efff; color: #286be9; font-size: 17px; }
.process-number { color: #2c65da; font-size: 15px; font-weight: 750; }
.process-card h3 { margin: 11px 0 0; overflow: hidden; font-size: 13px; font-weight: 700; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.process-card p { min-height: 34px; margin: 9px 0 0; color: #7e8faa; font-size: 12px; line-height: 1.45; }
.process-foot { display: flex; align-items: center; gap: 6px; margin-top: auto; color: #286be9; font-size: 11px; font-weight: 650; }
.process-foot i { font-size: 10px; }
.process-arrow { align-self: center; flex: none; color: #4d83e9; font-size: 11px; }
.stage-green .process-icon { background: #e4f7ee; color: #17a871; } .stage-green .process-number { color: #159b70; }
.stage-violet .process-icon { background: #eae7ff; color: #7767e9; } .stage-violet .process-number { color: #6759df; }
.stage-orange .process-icon { background: #fff0de; color: #ef8c2b; } .stage-orange .process-number { color: #d37120; }
.stage-purple .process-icon { background: #eee9ff; color: #755de6; } .stage-purple .process-number { color: #6b52d9; }
.resource-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
.resource-card { display: flex; align-items: center; gap: 9px; min-width: 0; min-height: 63px; border: 1px solid #e5ecf7; border-radius: 10px; padding: 9px; background: #fff; text-decoration: none; transition: border-color .2s, transform .2s; }
.resource-card:hover { border-color: #a8c2f6; transform: translateY(-2px); }
.resource-icon { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border-radius: 9px; background: #eaf1ff; color: #2871eb; font-size: 16px; }
.resource-copy { min-width: 0; } .resource-copy strong, .resource-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-copy strong { color: #22304c; font-size: 12px; font-weight: 680; } .resource-copy small { margin-top: 3px; color: #96a5bb; font-size: 10px; }
.resource-arrow { display: none; margin-left: auto; color: #8aa6d8; font-size: 10px; }
.resource-orange .resource-icon { background: #fff1e5; color: #ed9131; }.resource-violet .resource-icon { background: #f0eaff; color: #8b64e6; }.resource-indigo .resource-icon { background: #e9efff; color: #416be5; }
.baseline-flow { display: flex; align-items: center; gap: 9px; overflow-x: auto; padding-bottom: 2px; }
.baseline-node { display: inline-flex; align-items: center; gap: 8px; flex: 1 0 auto; min-height: 38px; border: 1px solid #e8edf6; border-radius: 9px; padding: 0 10px; background: #f9fbfe; color: #667b9e; font-size: 11px; font-weight: 600; white-space: nowrap; }
.baseline-node i { color: #5d8bea; font-size: 13px; }.baseline-arrow { color: #5d8bea; font-size: 9px; }
.side-panel { padding: 17px 17px; }.side-panel .section-heading { margin-bottom: 7px; padding-bottom: 10px; border-bottom: 1px solid #edf1f8; }
.side-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; color: #9aabc2; text-align: center; }
.side-empty-icon { display: grid; place-items: center; width: 38px; height: 38px; margin-bottom: 10px; border-radius: 50%; background: #eef4ff; color: #7fa1dd; font-size: 18px; }
.side-empty strong { color: #647693; font-size: 13px; }.side-empty p { max-width: 230px; margin: 7px 0 10px; font-size: 12px; line-height: 1.6; }.side-empty a { color: #286be9; font-size: 12px; font-weight: 600; text-decoration: none; }
.activity-list { display: grid; grid-auto-rows: 62px; max-height: 310px; }.activity-item { box-sizing: border-box; width: 100%; height: 62px; min-width: 0; text-align: left; background: transparent; cursor: pointer; border: 0; padding: 0; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #eef1f7; text-decoration: none; }.activity-item:last-child { border-bottom: 0; }.activity-item:hover strong { color: #2465ea; }
.activity-icon { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border-radius: 10px; background: #eaf2ff; color: #3480ef; font-size: 14px; }
.activity-copy { flex: 1; min-width: 0; }.activity-copy strong, .activity-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.activity-copy strong { color: #253451; font-size: 12px; font-weight: 650; }.activity-copy small { margin-top: 4px; color: #94a3ba; font-size: 11px; }.activity-item time { align-self: flex-start; flex: none; margin-top: 15px; color: #a0aec3; font-size: 10px; }
.activity-empty { min-height: 215px; }
.coach-launcher { position: fixed; z-index: 20; right: 18px; bottom: 8px; width: 100px; height: 166px; padding: 0; border: 0; background: none; color: #17213d; cursor: grab; touch-action: none; user-select: none; -webkit-tap-highlight-color: transparent; }
.coach-launcher__mascot { position: absolute; inset: 0; display: block; animation: coach-idle 3.8s ease-in-out infinite; transform-origin: center bottom; transition: transform .22s cubic-bezier(.2,.8,.2,1); }
.coach-launcher__mascot img { position: absolute; left: -44px; top: -8px; width: 190px; max-width: none; height: auto; pointer-events: none; user-select: none; }
.coach-launcher__bubble { position: absolute; right: calc(100% + 3px); bottom: 17px; min-width: 190px; padding: 11px 37px 11px 13px; border: 1px solid #dce8ff; border-radius: 17px; background: white; box-shadow: 0 8px 28px rgba(64,108,180,.12); color: #304264; font-size: 12px; font-weight: 600; line-height: 1.65; white-space: nowrap; text-align: left; transition: transform .22s ease, box-shadow .22s ease; }
.coach-launcher__bubble i { position: absolute; right: 11px; bottom: 13px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #eef4ff; color: #3b73dc; font-size: 10px; }
.coach-launcher:is(:hover,:focus-visible) .coach-launcher__mascot { animation: none; transform: translateY(-8px) rotate(-5deg); }.coach-launcher:is(:hover,:focus-visible) .coach-launcher__bubble { transform: translateY(-3px); box-shadow: 0 11px 32px rgba(64,108,180,.2); }.coach-launcher:active .coach-launcher__mascot { animation: none; transform: translateY(3px) scale(.95) rotate(4deg); }.coach-launcher:focus-visible { outline: 3px solid #3b73dc; outline-offset: 3px; border-radius: 18px; }
@keyframes coach-idle { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(2deg); } }
.coach-launcher.is-dragging { cursor: grabbing; }.coach-launcher.is-dragging .coach-launcher__mascot { animation: none; transform: none; transition: none; }.coach-launcher.is-dragging .coach-launcher__bubble { transform: none; transition: none; }
.coach-launcher.is-running .coach-stand { visibility: hidden; }
.coach-run { position: absolute; left: -29px; top: 22px; width: 160px; height: 160px; pointer-events: none; visibility: hidden; }
.coach-launcher.is-running .coach-run { visibility: visible; }
.coach-launcher.is-running-left .coach-run { transform: scaleX(-1); }
.coach-run__frames { position: absolute; inset: 0; background-image: url('../../assets/fde-coach-run-cycle-v2.png'); background-size: 400% 400%; background-repeat: no-repeat; animation: coach-full-run var(--coach-run-duration, 1100ms) steps(1, end) infinite; animation-play-state: paused; }
.coach-launcher.is-running .coach-run__frames { animation-play-state: running; }
@keyframes coach-full-run {
  0% { background-position: 0.000000% 0.000000%; }
  6.25% { background-position: 33.333333% 0.000000%; }
  12.5% { background-position: 66.666667% 0.000000%; }
  18.75% { background-position: 100.000000% 0.000000%; }
  25% { background-position: 0.000000% 33.333333%; }
  31.25% { background-position: 33.333333% 33.333333%; }
  37.5% { background-position: 66.666667% 33.333333%; }
  43.75% { background-position: 100.000000% 33.333333%; }
  50% { background-position: 0.000000% 66.666667%; }
  56.25% { background-position: 33.333333% 66.666667%; }
  62.5% { background-position: 66.666667% 66.666667%; }
  68.75% { background-position: 100.000000% 66.666667%; }
  75% { background-position: 0.000000% 100.000000%; }
  81.25% { background-position: 33.333333% 100.000000%; }
  87.5% { background-position: 66.666667% 100.000000%; }
  93.75% { background-position: 100.000000% 100.000000%; }
  100% { background-position: 0% 0%; }
}
@media (prefers-reduced-motion: reduce) { .coach-run__frames { animation: none; }.coach-run { display: none; }.coach-launcher.is-dragging .coach-stand { visibility: visible; }.coach-launcher__mascot { animation: none; transition: none; }.coach-launcher__bubble { transition: none; }.coach-launcher:is(:hover,:focus-visible) .coach-launcher__mascot,.coach-launcher:active .coach-launcher__mascot { transform: none; } }

.todo-link{border:0;background:transparent;cursor:pointer;text-align:left;padding:0}.activity-link{border:0;background:transparent;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;flex:1;min-width:0;height:100%;padding:0}.todo-item.is-selected,.activity-item.is-selected{background:#eef4ff;border-radius:7px}.todo-item,.activity-item{padding:0 5px;transition:background .15s}.panel-delete{display:grid;place-items:center;width:25px;height:28px;flex-shrink:0;border:0;border-radius:6px;color:#99a8bc;background:transparent;cursor:pointer;font-size:11px}.panel-delete:disabled{opacity:.35;cursor:default}.panel-delete:hover:not(:disabled){background:#fff0f2;color:#d53750}.panel-delete:focus-visible,.activity-link:focus-visible{outline:2px solid #2563eb;outline-offset:-2px;border-radius:6px}.dashboard-notice{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #e1e9f5;border-radius:10px;padding:10px 16px;box-shadow:0 5px 24px #20365516;color:#61718b;font-size:12px}.dashboard-notice button{color:#2563eb;cursor:pointer}
</style>
