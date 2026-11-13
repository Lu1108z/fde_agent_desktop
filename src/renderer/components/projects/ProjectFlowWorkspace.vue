<template>
  <!-- 与阶段一同一套布局：顶部项目头 + 左侧步骤栏 + 右侧当前步骤卡片 -->
  <section class="fde-flow" :aria-label="`阶段${STAGE_CN[stage]} ${stageName}`">
    <header class="head">
      <div class="head-main">
        <t-space align="center" size="small"><h1>{{ projectName || '当前项目' }}</h1><t-tag theme="primary" variant="light">阶段{{ STAGE_CN[stage] }} · {{ stageName }}</t-tag><t-tag v-if="stage === 2" variant="light">第 {{ state.round }} 轮沟通</t-tag><t-tag v-if="progressStage > stage" theme="success" variant="light">已进入阶段{{ STAGE_CN[progressStage] }}，可回来补充</t-tag></t-space>
        <p class="head-meta">{{ stageGoal }}</p>
      </div>
      <div class="head-progress"><strong>第 {{ taskIndex + 1 }} 步</strong><span> / 共 {{ tasks.length }} 步</span></div>
    </header>

    <t-loading v-if="loading" text="正在读取项目流程…" size="small" class="flow-loading" />
    <div v-else class="body">
      <nav class="rail" :aria-label="`阶段${STAGE_CN[stage]}流程`">
        <ol>
          <li v-for="(item, index) in tasks" :key="item.id" :class="[railState(item, index), { on: selectedId === item.id }]">
            <button :disabled="locked || !available(index)" @click="selectTask(item.id)">
              <span class="dot"><i v-if="entryFor(item).status === 'confirmed'" class="fa-solid fa-check"></i><i v-else-if="entryFor(item).status === 'needs-review'" class="fa-solid fa-rotate"></i><template v-else>{{ index + 1 }}</template></span>
              <span class="rail-txt"><strong>{{ item.title }}</strong><small>{{ railLabel(item, index) }}</small></span>
            </button>
          </li>
        </ol>
        <div class="rail-foot">
          <button class="rail-link" :disabled="locked" @click="openMaterials"><i class="fa-regular fa-folder-open"></i><span>项目资料</span></button>
          <button class="rail-link" :disabled="locked" @click="reload"><i class="fa-solid fa-rotate-right"></i><span>刷新记录</span></button>
        </div>
      </nav>

      <main class="stage">
        <t-alert v-if="error" theme="error" :message="error" class="mb"><template #operation><t-link theme="primary" :disabled="locked" @click="reload">重新读取</t-link></template></t-alert>
        <t-alert v-if="entry.status === 'running'" theme="info" :message="`正在执行：${entry.runningTitle || '形成成果'}（完成 ${Object.keys(entry.jobs || {}).length} / ${task?.jobs?.length || 1}）。进度和停止按钮在顶部。`" class="mb"><template #icon><t-loading size="16px" /></template></t-alert>

        <!-- 承接阶段一：阶段一成果和遗留问题直接带进阶段二，生成时按编号沿用 -->
        <t-card v-if="stage === 2 && carry.ctx" :bordered="false" class="carry-card">
          <div class="carry-h">
            <i class="fa-solid fa-link"></i><strong>承接阶段一</strong>
            <span class="muted">{{ carry.docs.filter(d => d.exists).length }} 份成果 · {{ carry.open.length }} 个问题待本轮回答{{ carry.answered.length ? ` · 已回答 ${carry.answered.length}` : '' }}</span>
            <t-link theme="default" hover="color" class="carry-toggle" @click="carryOpen = !carryOpen">{{ carryOpen ? '收起' : '展开' }}<i :class="carryOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"></i></t-link>
          </div>
          <div v-if="carryOpen" class="carry-body">
            <div class="carry-docs">
              <button v-for="d in carry.docs" :key="d.file" class="carry-doc" :class="{ missing: !d.exists }" :disabled="!d.exists" :title="d.exists ? '打开查看' : '阶段一没有这份成果'" @click="emit('open-file', { file: d.file, stage: 1, name: d.name })">
                <span class="cd-name"><span class="cd-title">{{ d.name }}</span><em>{{ d.exists ? d.label : '未生成' }}</em></span>
                <span class="cd-to" :title="d.to">→ {{ d.to }}</span>
              </button>
            </div>
            <div v-if="carry.open.length || carry.answered.length" class="carry-qs">
              <div v-for="(q, i) in carry.open" :key="q.question" class="carry-q"><b>Q{{ i + 1 }}</b><span :title="q.question">{{ q.question }}</span><em v-if="q.owner">{{ /客户/.test(q.owner) ? '问客户' : /FDE/i.test(q.owner) ? 'FDE 自查' : q.owner }}</em></div>
              <div v-for="q in carry.answered" :key="'a' + q.question" class="carry-q done"><i class="fa-solid fa-check"></i><span>{{ q.question }}<small>{{ q.resolvedIn }}：{{ q.answer }}</small></span></div>
            </div>
            <p class="carry-note">生成对接确认表、AI 能力清单时会自动读取以上成果，P/S/D 编号原样沿用；本轮材料回答了的问题会自动勾掉。</p>
          </div>
        </t-card>

        <t-alert v-if="stageComplete && progressStage === stage && !(stage === 5 && projectDone)" theme="success" :message="stage < 5 ? `本阶段 ${tasks.length} 步都已核对，可以进入阶段${STAGE_CN[stage + 1]}。之后仍能回来补充。` : '四份交付表都已核对，可以验收并完成项目。'" class="mb stage-done"><template #operation><t-link theme="primary" :disabled="locked" @click="moveOn">{{ stage < 5 ? `进入阶段${STAGE_CN[stage + 1]}` : '验收并完成项目' }}</t-link></template></t-alert>
        <t-alert v-if="stage === 5 && projectDone" theme="success" message="项目已验收完成。各表仍可打开查看，修改后需要重新核对。" class="mb stage-done" />
        <t-card v-if="task" :bordered="false" class="step-card" @compositionstart.capture="onCompositionStart" @compositionend.capture="onCompositionEnd">
          <div class="step-head">
            <p class="eyebrow">第 {{ taskIndex + 1 }} 步 · {{ task.title }}<t-tag size="small" variant="light" :theme="STATUS_THEME[entry.status] || 'default'">{{ statusText }}</t-tag></p>
            <h2>{{ task.title }}</h2>
            <p class="desc">{{ task.goal }}</p>
          </div>
          <t-alert v-if="entry.notice" theme="warning" :message="entry.notice" class="mb" />
          <t-alert v-if="hasBlocking" theme="warning" :message="`有 ${blockingCount} 个关键问题还没确认（见下方「接下来要确认」）。可以先核对通过，这些问题会作为待确认带到后续步骤；拿到答案后写进本轮补充，再点「继续完善成果」更新。`" class="mb" />

          <div class="sec">
            <div class="sec-h">{{ task.kind === 'feedback' ? '客户反馈与认可依据' : '本轮补充' }}<span class="muted">已有项目资料会一起使用</span><span v-if="savedNotice" class="saved" role="status"><i class="fa-solid fa-check"></i>{{ savedNotice }}</span></div>
            <t-textarea v-model="notes" :disabled="inputLocked" :placeholder="task.hint || '补充评审意见、资料或需要关注的问题。'" :autosize="{ minRows: 3, maxRows: 10 }" />
            <t-space size="small" class="sec-actions">
              <t-button size="small" variant="outline" :disabled="locked" @click="openMaterials"><template #icon><i class="fa-solid fa-paperclip"></i></template>添加 / 查看资料</t-button>
              <t-button size="small" variant="text" :disabled="locked || !notesDirty" :loading="saving" @click="saveNotes">保存补充</t-button>
            </t-space>
          </div>

          <div v-if="task.customer || task.kind === 'feedback'" class="sec confirm-fields">
            <div><div class="sec-h">确认人</div><t-input v-model="confirmedBy" :disabled="inputLocked" placeholder="实际参与确认的客户 / 业务负责人" /></div>
            <div><div class="sec-h">确认依据</div><t-input v-model="evidence" :disabled="inputLocked" placeholder="会议日期、记录位置或客户实际确认内容" /></div>
          </div>

          <div v-if="files.length" class="sec">
            <div class="sec-h">{{ task.kind === 'feedback' ? '反馈记录' : '本步成果' }}</div>
            <ul class="rows">
              <li v-for="file in files" :key="file">
                <span class="fbadge" :class="file.endsWith('.html') ? 'html' : 'md'">{{ file.endsWith('.html') ? 'HTML' : 'MD' }}</span>
                <div class="row-main"><div class="row-title">{{ fileLabel(file) }}</div><div class="row-desc">{{ file }}</div></div>
                <t-tag size="small" variant="light" :theme="existing[file] ? 'success' : 'default'">{{ existing[file] ? '已形成' : '尚未形成' }}</t-tag>
                <t-button size="small" variant="outline" :disabled="locked || !existing[file]" @click="openFile(file)">查看</t-button>
              </li>
            </ul>
          </div>
          <div v-if="previewContent" class="sec preview"><div class="sec-h">{{ fileLabel(previewFile) }}<t-link theme="default" class="ml-auto" @click="previewContent = ''">收起</t-link></div><pre>{{ previewContent }}</pre></div>

          <div v-if="entry.summary" class="sec">
            <div class="sec-h">本轮成果</div>
            <div class="result"><p>{{ entry.summary.summary }}</p><ul v-if="entry.summary.changes?.length"><li v-for="change in entry.summary.changes" :key="change">{{ change }}</li></ul></div>
          </div>
          <div v-if="entry.summary?.questions?.length" class="sec">
            <div class="sec-h">接下来要确认<span class="muted">把确认结果写进本轮补充，再更新成果</span></div>
            <div v-for="question in entry.summary.questions" :key="question.question" class="qrow"><span class="qt">{{ question.question }}</span><t-tag size="small" variant="light" :theme="question.blocking ? 'danger' : 'warning'">{{ question.owner || 'FDE' }}{{ question.blocking ? ' · 阻塞' : '' }}</t-tag></div>
          </div>

          <div v-if="task.handoff" ref="handoffRef" class="sec">
            <div class="sec-h">交接状态</div>
            <t-descriptions :column="3" size="small" bordered>
              <t-descriptions-item label="产品资料">{{ entry.status === 'confirmed' ? '已核对' : '待核对' }}</t-descriptions-item>
              <t-descriptions-item label="研发接收">{{ state.handoff.status === 'accepted' ? '已登记接收' : state.handoff.status === 'waiting' ? '待接收' : state.handoff.status === 'needs-review' ? '需重新核对' : '待交接' }}</t-descriptions-item>
              <t-descriptions-item label="技术验证">按实际验证记录另行确认</t-descriptions-item>
            </t-descriptions>
            <div v-if="entry.status === 'confirmed'" class="confirm-fields handoff-fields">
              <div><div class="sec-h">研发接收人</div><t-input v-model="recipient" :disabled="inputLocked" placeholder="填写实际接收人" /></div>
              <div><div class="sec-h">接收依据</div><t-input v-model="receipt" :disabled="inputLocked" placeholder="填写实际接收记录、日期或评审结论" /></div>
              <div class="span2"><t-button variant="outline" :disabled="locked || !recipient.trim() || !receipt.trim()" @click="acceptHandoff">登记研发已接收</t-button><span class="muted">登记接收不会将 SQL、数据接入或 Eval 标为已通过。</span></div>
            </div>
          </div>

          <p v-if="existingComplete && !entry.confirmation && !task.kind" class="muted help">已有成果可以直接打开核对。生成成功后仍需人工核对，才会推进下一步。</p>

          <footer class="step-foot">
            <t-button v-if="taskIndex > 0" variant="text" :disabled="locked" @click="selectTask(tasks[taskIndex - 1].id)">上一步</t-button>
            <span class="grow"></span>
            <template v-if="task.kind === 'feedback'">
              <t-button variant="outline" :disabled="locked || !notes.trim()" @click="newRound">有调整，继续下一轮</t-button>
              <t-button theme="primary" :disabled="locked || !notes.trim() || !confirmedBy.trim() || !evidence.trim()" @click="confirmFeedback">{{ progressStage > stage ? '保存反馈并回到当前阶段' : task.action }}</t-button>
            </template>
            <template v-else>
              <t-button v-if="existingComplete" variant="text" :disabled="locked" @click="runTask(true)">重新整理</t-button>
              <t-button v-if="entry.status !== 'confirmed'" :theme="existingComplete ? 'default' : 'primary'" :variant="existingComplete ? 'outline' : 'base'" :disabled="locked" :loading="busy && entry.status === 'running'" @click="runTask(false)"><template #icon><i class="fa-solid fa-wand-magic-sparkles"></i></template>{{ entry.status === 'failed' ? '从中断处继续' : entry.status === 'ready-review' ? '继续完善成果' : task.action }}</t-button>
              <t-button v-if="existingComplete && entry.status !== 'confirmed'" theme="primary" :disabled="locked || ((task.customer) && (!confirmedBy.trim() || !evidence.trim())) " @click="confirmTask">{{ task.handoff ? '资料已核对，登记待研发接收' : '核对完成，下一步' }}</t-button>
              <t-button v-if="entry.status === 'confirmed' && !(canMoveOn && taskIndex === tasks.length - 1)" :theme="canMoveOn ? 'default' : 'primary'" :variant="canMoveOn ? 'outline' : 'base'" :disabled="locked || (taskIndex === tasks.length - 1 && !task.handoff)" @click="continueConfirmed">{{ task.handoff ? '查看交接状态' : taskIndex === tasks.length - 1 ? '本阶段已全部核对' : '下一步' }}</t-button>
              <t-button v-if="canMoveOn" theme="primary" :disabled="locked" @click="moveOn">{{ stage < 5 ? `进入阶段${STAGE_CN[stage + 1]}` : '验收并完成项目' }}</t-button>
            </template>
          </footer>
        </t-card>
      </main>
    </div>
  </section>
</template>
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { FLOW_TASKS, freshState, taskKey, taskFiles, nextTaskId, createFlowService, buildTaskPrompt } from '../../data/project-flow.mjs';
import { CONTEXT_FILE, HANDOFF_FILE, STAGE1_CARRY, deliverableState, stage1CarryPrompt, applyAnswered } from '../../data/stage1-research.mjs';
const props = defineProps({ slug: String, projectName: String, stage: Number, progressStage: Number, streaming: Boolean, runJob: Function, advanceStage: Function, setBusy: Function, completeProject: Function, projectDone: Boolean });
const STAGE_CN = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五' };
const STATUS_THEME = { running: 'primary', 'ready-review': 'primary', confirmed: 'success', failed: 'danger', 'needs-review': 'warning' };
const emit = defineEmits(['open-file', 'materials', 'state']);
const service = createFlowService(window.api.hermes, props.slug);
const previewContent=ref(''), previewFile=ref('');
const state = ref(freshState()), loading = ref(true), busy = ref(false), saving = ref(false), error = ref(''), selectedId = ref('');
const notes = ref(''), confirmedBy = ref(''), evidence = ref(''), recipient = ref(''), receipt = ref(''), savedNotice = ref(''), existing = ref({}), handoffRef = ref(null);
const tasks = computed(() => FLOW_TASKS[props.stage] || []);
// 阶段一上下文（.fde-flow/context.json）与成果是否存在；阶段二生成和展示都以此为准
const stage1 = ref({ ctx: null, existing: {} }), carryOpen = ref(true);
const carry = computed(() => {
  const { ctx, existing: has } = stage1.value;
  const qs = ctx?.openQuestions || [];
  return {
    ctx,
    docs: STAGE1_CARRY.map(d => ({ ...d, exists: !!has[d.file], label: ctx ? deliverableState(ctx, d.file).label : '' })),
    open: qs.filter(q => q.status !== 'resolved'),
    answered: qs.filter(q => q.status === 'resolved' && q.resolvedIn),
  };
});
async function loadStage1() {
  if (props.stage !== 2) return;
  try {
    const raw = await service.read(CONTEXT_FILE);
    const existing = {};
    for (const file of [...STAGE1_CARRY.map(d => d.file), HANDOFF_FILE]) existing[file] = !!(await service.read(file).catch(() => null))?.trim();
    stage1.value = { ctx: raw ? JSON.parse(raw) : null, existing };
  } catch { stage1.value = { ctx: null, existing: {} }; }
}
// 本轮回答了阶段一的问题：写回 context.json，阶段一页面同步显示为已解决
async function saveAnswered(answered) {
  if (!answered?.length) return;
  const previous = await service.read(CONTEXT_FILE); if (!previous) return;
  const ctx = JSON.parse(previous);
  if (!applyAnswered(ctx, answered, state.value.round)) return;
  ctx.revision = (ctx.revision || 0) + 1; ctx.updatedAt = new Date().toISOString();
  await service.write(CONTEXT_FILE, JSON.stringify(ctx, null, 2), previous);
  await loadStage1();
}
const task = computed(() => tasks.value.find(item => item.id === selectedId.value) || tasks.value[0]);
const entryFor = item => state.value.tasks[taskKey(props.stage, item)] || {};
const entry = computed(() => task.value ? entryFor(task.value) : {});
const files = computed(() => task.value ? taskFiles(task.value) : []);
const locked = computed(() => busy.value || saving.value || loading.value || props.streaming);
// 输入框只在 AI 运行或读取时禁用；自动保存期间禁用会打断中文输入法，把拼音字母留在框里
const inputLocked = computed(() => busy.value || loading.value || props.streaming);
const existingComplete = computed(() => files.value.length > 0 && files.value.every(file => existing.value[file]));
const notesDirty = computed(() => notes.value !== (entry.value.notes || '') || confirmedBy.value !== (entry.value.confirmedBy || '') || evidence.value !== (entry.value.evidence || ''));
const blockingCount = computed(() => new Set([...(entry.value.summary?.questions || []), ...Object.values(entry.value.jobs || {}).flatMap(job => job.summary?.questions || [])].filter(q => q.blocking).map(q => q.question)).size);
const hasBlocking = computed(() => entry.value.summary?.questions?.some(q => q.blocking) || Object.values(entry.value.jobs || {}).some(job=>job.summary?.questions?.some(q=>q.blocking)));
const stageName = computed(() => ({ 1:'调研准备', 2:'需求沟通', 3:'需求确认', 4:'工作台上线', 5:'客户试用' })[props.stage]);
const stageGoal = computed(() => ({ 2:'逐轮沟通把需求聊透，整理对接确认表和 AI 能力清单，出原型收敛方向', 3:'签字确定首版范围，完善方案并交接研发', 4:'研发搭建工作台期间，跟进度、走查 demo、核对上线条件', 5:'客户试用三轮定稿，反馈闭环、盯使用率，最后交付签字' })[props.stage] || '');
// 本阶段全部核对完：阶段一到四进入下一阶段，阶段五验收完成项目
const stageComplete = computed(() => tasks.value.length > 0 && tasks.value.every(item => entryFor(item).status === 'confirmed'));
const canMoveOn = computed(() => stageComplete.value && props.progressStage === props.stage && (props.stage < 5 ? true : !props.projectDone));
const taskIndex = computed(() => Math.max(0, tasks.value.findIndex(item => item.id === task.value?.id)));
const railState = (item, index) => { const st = entryFor(item).status; return st === 'confirmed' ? 'done' : st === 'needs-review' || st === 'failed' ? 'partial' : st ? 'doing' : available(index) ? 'doing' : 'todo'; };
const railLabel = (item, index) => { const st = entryFor(item).status; const text = ({ running:'正在生成', failed:'需要重试', 'ready-review':'待核对', confirmed:'已核对', 'needs-review':'需重新核对' })[st] || (available(index) ? '待处理' : '未开始'); return item.id === nextTaskId(state.value, props.stage) && st !== 'confirmed' ? `${text} · 当前` : text; };
const statusText = computed(() => ({ running:'正在生成', failed:'需要重试', 'ready-review':'待核对', confirmed:'已核对', 'needs-review':'需重新核对' })[entry.value.status] || '待处理');
const labels = { 'contact-form.md':'需求与数据对接确认表', 'ai-capability.md':'AI 能力清单', 'prd.md':'产品 PRD', 'spec.md':'功能清单', 'index.html':'可交互原型', 'prototype-handoff.md':'原型演示说明', 'final-req.md':'最终需求确认表', 'data-metric.md':'业务数据口径', 'agent-design.md':'智能体业务设计', 'impl-plan.md':'实施协作计划', 'prototype-final.md':'定稿原型说明', 'preparation.md':'调研准备要点', 'feedback.md':'客户反馈记录', 'handoff.md':'研发交接清单', 'progress.md':'纳米Work项目进度表', 'demo-review.md':'demo 走查记录', 'deploy-doc.md':'部署文档与上线核对', 'feedback-tracker.md':'客户反馈跟踪表', 'iteration.md':'三轮迭代记录表', 'usage-watch.md':'使用率盯防表', 'delivery-sign.md':'项目交付签字表' };
const fileLabel = file => labels[file.split('/').pop()] || file;
function available(index) { return tasks.value.slice(0,index).every(item => entryFor(item).status === 'confirmed'); }
function publish() { emit('state', { ...JSON.parse(JSON.stringify(state.value)), currentTask: task.value?.title, currentTaskId: task.value?.id, stage: props.stage }); }
async function openFile(file) {
  error.value=''; if(!await saveNotes()) return;
  if(!file.startsWith('.fde-flow/')) { emit('open-file',{file,stage:props.stage,name:fileLabel(file)}); return; }
  try {previewFile.value=file; previewContent.value=await service.read(file) || ''; } catch(e){error.value=e.message;}
}
function hydrateInputs() { previewContent.value=''; notes.value = entry.value.notes || ''; confirmedBy.value = entry.value.confirmedBy || ''; evidence.value = entry.value.evidence || ''; savedNotice.value = ''; publish(); }
async function checkFiles() {
  const result = {};
  for (const file of files.value) { try { await service.verify([file]); result[file] = true; } catch { result[file] = false; } }
  existing.value = result;
}
async function reload() {
  loading.value = true; error.value = '';
  try {
    state.value = await service.refresh(await service.load());
    // A process exit during generation is a retryable interruption, never a completion.
    let interrupted = false;
    for (const record of Object.values(state.value.tasks)) if (record.status === 'running' && !props.streaming && !busy.value) { record.status = 'failed'; record.notice = '上次生成中断，已保留已完成成果。'; interrupted = true; }
    if (interrupted) state.value = await service.save(state.value);
    selectedId.value = nextTaskId(state.value, props.stage); hydrateInputs(); await checkFiles(); publish();
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
async function persist() { state.value = await service.save(state.value); publish(); }
function writableEntry() { return state.value.tasks[taskKey(props.stage, task.value)] ||= { status:'pending', jobs:{} }; }
async function saveNotes() {
  if (!notesDirty.value) return true;
  if (busy.value || loading.value || saving.value) return false;
  saving.value = true; savedNotice.value = '';
  try {
    if(entry.value.status === 'confirmed') { writableEntry().status='needs-review'; writableEntry().jobs={}; invalidateFollowing(); }
    Object.assign(writableEntry(), { notes:notes.value, confirmedBy:confirmedBy.value, evidence:evidence.value });
    await persist(); savedNotice.value = '已保存'; return true;
  } catch(e) { error.value = e.message; return false; } finally { saving.value = false; }
}
async function openMaterials() { error.value=''; if(await saveNotes()) emit('materials'); }
async function selectTask(id) { if(locked.value) return; error.value=''; if(!await saveNotes()) return; selectedId.value=id; }
function invalidateFollowing() {
  const currentIndex = tasks.value.findIndex(item => item.id === task.value.id);
  for (const item of tasks.value.slice(currentIndex + 1)) {
    const record = state.value.tasks[taskKey(props.stage,item)];
    if (record) { record.status = 'needs-review'; record.notice = '上游成果已更新，请核对后继续。'; record.jobs = {}; }
  }
  for (let later = props.stage + 1; later <= 5; later++) for (const item of FLOW_TASKS[later] || []) { const record = state.value.tasks[taskKey(later,item)]; if(record?.status === 'confirmed') { record.status='needs-review'; record.jobs={}; record.notice=`阶段${STAGE_CN[props.stage]}成果已有更新，请重新核对。`; } }
  if (state.value.handoff.status !== 'preparing') state.value.handoff.status = 'needs-review';
}
async function runTask(force) {
  if (locked.value) return;
  error.value = ''; if (!await saveNotes()) return;
  busy.value = true; props.setBusy?.(true); error.value = '';
  const stage = props.stage, activeTask = task.value;
  try {
    let record = writableEntry(); invalidateFollowing();
    if (force || record.status === 'confirmed' || record.status === 'needs-review' || record.status === 'ready-review') record.jobs = {};
    record.status = 'running'; record.notice = ''; await persist();
    for (const job of activeTask.jobs || []) {
      record = state.value.tasks[taskKey(stage,activeTask)];
      if (record.jobs?.[job.id]) { try { const hashes=await service.verify(job.files); if(JSON.stringify(hashes)===JSON.stringify(record.jobs[job.id].signatures)) continue; delete record.jobs[job.id]; } catch { delete record.jobs[job.id]; } }
      record.runningTitle = job.title; await persist();
      const stamp = `${Date.now()}-${job.id}`;
      await service.archive(job.files, state.value.round, stamp);
      const summaryFile = `.fde-flow/results/${stamp}.json`;
      if (stage === 2) await loadStage1();
      const carryText = stage === 2 && job.skill ? stage1CarryPrompt(stage1.value.ctx, stage1.value.existing) : '';
      const prompt = buildTaskPrompt({stage,round:state.value.round,task:activeTask,job,notes:notes.value,summaryFile,confirmations:{ by:confirmedBy.value,evidence:evidence.value },carry:carryText});
      await props.runJob({stage,task:activeTask,job,prompt});
      const signatures = await service.verify(job.files);
      const raw = await service.read(summaryFile);
      let summary; try { summary = JSON.parse(raw); } catch { throw new Error('成果摘要未完整写入，请重试核对。'); }
      if (!summary || typeof summary.summary !== 'string' || !summary.summary.trim()) throw new Error('成果摘要缺少实际结果，请重试。');
      if (carryText) await saveAnswered(summary.answered).catch(e => { error.value = `已生成成果，但阶段一问题回写失败：${e.message}`; });
      record = state.value.tasks[taskKey(stage,activeTask)];
      record.jobs ||= {}; record.jobs[job.id] = { completedAt:new Date().toISOString(),signatures, summary };
      const results=Object.values(record.jobs).map(j=>j.summary).filter(Boolean);
      record.summary = {summary:results.map(s=>s.summary).join('；'),changes:results.flatMap(s=>Array.isArray(s.changes)?s.changes.map(String):[]),questions:results.flatMap(s=>Array.isArray(s.questions)?s.questions.filter(q=>q?.question):[]).sort((a,b)=>Number(!!b.blocking)-Number(!!a.blocking)).slice(0,3)};
      await persist();
    }
    record = state.value.tasks[taskKey(stage,activeTask)]; record.status='ready-review'; record.runningTitle=''; await persist();
  } catch(e) {
    error.value = e.message;
    const record = state.value.tasks[taskKey(stage,activeTask)]; if(record) { record.status='failed'; record.notice=e.message; try { await persist(); } catch(saveError) { error.value += `；${saveError.message}`; } }
  } finally { busy.value=false; props.setBusy?.(false); await checkFiles(); }
}
async function confirmTask() {
  if (locked.value) return;
  error.value = ''; if (!await saveNotes()) return;
  busy.value = true; error.value = '';
  try {
    state.value = await service.refresh(state.value);
    if (!available(tasks.value.findIndex(item=>item.id===task.value.id))) throw new Error('前面的成果已有变化，请先回去核对。');
    const signatures = await service.verify(files.value);
    if(task.value.customer && (!confirmedBy.value.trim() || !evidence.value.trim())) throw new Error('请登记实际的客户确认人和依据。');
    const record = writableEntry(); record.status='confirmed'; record.notice=''; record.confirmation={ at:new Date().toISOString(),by:confirmedBy.value || 'FDE 用户核对',evidence:evidence.value,signatures };
    if(task.value.handoff) state.value.handoff={status:'waiting',preparedAt:new Date().toISOString()};
    await persist(); await continueConfirmed();
  } catch(e) { error.value=e.message; } finally { busy.value=false; }
}
async function continueConfirmed() {
  if (props.stage === 1) { await props.advanceStage(2); return; }
  const index = tasks.value.findIndex(item=>item.id===selectedId.value);
  if(index+1<tasks.value.length) { selectedId.value=tasks.value[index+1].id; hydrateInputs(); await checkFiles(); }
  else if(task.value.handoff) handoffRef.value?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function moveOn() {
  if (locked.value || !canMoveOn.value) return;
  error.value = ''; if (!await saveNotes()) return;
  busy.value = true;
  try {
    state.value = await service.refresh(state.value);
    if (!stageComplete.value) throw new Error('有成果已修改，请重新核对后再继续。');
    if (props.stage < 5) await props.advanceStage(props.stage + 1); else await props.completeProject?.();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
function canAdvance(stage) { return (FLOW_TASKS[stage] || []).every(item=>state.value.tasks[taskKey(stage,item)]?.status==='confirmed'); }
async function recordFeedback() {
  if (!available(3)) throw new Error('先核对需求、能力清单和演示原型，再记录本轮结论。');
  const body = `# 第 ${state.value.round} 轮客户反馈\n\n记录时间：${new Date().toISOString()}\n\n## 客户反馈\n${notes.value}\n\n## 方向确认\n确认人：${confirmedBy.value || '本轮尚未确认'}\n依据：${evidence.value || '继续沟通，无方向确认'}\n\n这是用户登记的产品沟通记录，技术验证与研发接收分别登记。\n`;
  await service.write('.fde-flow/feedback.md',body);
  const record=writableEntry(); Object.assign(record,{notes:notes.value,confirmedBy:confirmedBy.value,evidence:evidence.value,status:'confirmed',confirmation:{at:new Date().toISOString(),signatures:await service.verify(['.fde-flow/feedback.md'])}});
}
async function confirmFeedback() {
  if(locked.value || !notes.value.trim() || !confirmedBy.value.trim() || !evidence.value.trim()) return;
  busy.value=true; error.value='';
  try { state.value=await service.refresh(state.value); await recordFeedback(); await persist(); await props.advanceStage(3); } catch(e){ error.value=e.message; } finally {busy.value=false; await checkFiles();}
}
async function newRound() {
  if(locked.value || !notes.value.trim()) return;
  busy.value=true; error.value='';
  try {
    state.value=await service.refresh(state.value); await recordFeedback();
    await service.archive(FLOW_TASKS[2].flatMap(taskFiles),state.value.round,`${Date.now()}-round-end`);
    state.value.history.push({round:state.value.round,at:new Date().toISOString(),tasks:JSON.parse(JSON.stringify(state.value.tasks))});
    invalidateFollowing(); for(const item of FLOW_TASKS[2]) delete state.value.tasks[taskKey(2,item)];
    state.value.round++; state.value.tasks['2:contact']={status:'pending',jobs:{},notes:`上一轮反馈：\n${notes.value}`};
    await persist(); selectedId.value='contact'; hydrateInputs();
  } catch(e){error.value=e.message;} finally {busy.value=false; await checkFiles();}
}
async function acceptHandoff() {
  if(locked.value || !recipient.value.trim() || !receipt.value.trim()) return;
  busy.value=true; error.value='';
  try {
    state.value=await service.refresh(state.value);
    if(entry.value.status!=='confirmed') throw new Error('交接资料已修改，请重新核对后登记接收。');
    state.value.handoff={...state.value.handoff,status:'accepted',recipient:recipient.value.trim(),evidence:receipt.value.trim(),acceptedAt:new Date().toISOString()};
    await persist(); savedNotice.value='已登记实际接收记录';
  } catch(e){error.value=e.message;} finally{busy.value=false;}
}
async function resume(stageChanged=false) {
  if (!stageChanged && !loading.value && !await saveNotes()) return;
  try {
    state.value = await service.refresh(await service.load());
    selectedId.value = nextTaskId(state.value, props.stage); hydrateInputs(); await checkFiles();
  } catch (e) { error.value = e.message; }
}
function context() { return `当前阶段${props.stage}，第${state.value.round}轮，任务：${task.value?.title}；补充：${notes.value}。请围绕当前任务回答，未确认的信息如实说明；不要以对话结束或文档存在代替用户核对。`; }
watch(selectedId,()=>{hydrateInputs(); checkFiles();});
watch(()=>props.stage,()=>{if(!busy.value) resume(true); loadStage1();});
let notesTimer;
let composing = false;
function scheduleNotesSave() { clearTimeout(notesTimer); if (notesDirty.value && !locked.value && !composing) notesTimer = setTimeout(() => { if (!composing) saveNotes(); }, 1200); }
function onCompositionStart() { composing = true; clearTimeout(notesTimer); }
function onCompositionEnd() { composing = false; scheduleNotesSave(); }
watch([notes,confirmedBy,evidence], scheduleNotesSave);
onUnmounted(()=>{clearTimeout(notesTimer); if(!busy.value && notesDirty.value) saveNotes();});
onMounted(() => { reload(); loadStage1(); });
defineExpose({resume,canAdvance,context,reload:async()=>{await reload(); await loadStage1();}});
</script>
<style scoped>
/* 与阶段一 Stage1ResearchWorkspace 同一套布局与 TDesign token */
.fde-flow{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--td-bg-color-page,#f3f5f9);font-size:var(--td-font-size-body-medium);color:var(--td-text-color-primary)}
.fde-flow button{white-space:nowrap}
.muted{color:var(--td-text-color-placeholder);font-size:12px}.mb{margin-bottom:12px}.grow{flex:1}.ml-auto{margin-left:auto}
.head{flex:none;display:flex;align-items:center;gap:16px;padding:14px 24px;background:var(--td-bg-color-container,#fff);border-bottom:1px solid var(--td-component-stroke)}
.head-main{flex:1;min-width:0}.head h1{margin:0;font-size:18px;font-weight:600;color:var(--td-text-color-primary)}
.head-meta{margin:4px 0 0;color:var(--td-text-color-secondary);font-size:12px}
.head-progress{flex:none;color:var(--td-text-color-secondary);font-size:13px}.head-progress strong{color:var(--td-brand-color);font-size:16px}
.flow-loading{padding:32px;justify-content:center;width:100%}
.body{flex:1;min-height:0;display:flex}
.rail{flex:none;width:200px;display:flex;flex-direction:column;padding:16px 12px;background:var(--td-bg-color-container,#fff);border-right:1px solid var(--td-component-stroke);overflow-y:auto}
.rail ol{list-style:none;margin:0;padding:0;position:relative}
.rail li{position:relative}
.rail li:not(:last-child)::after{content:'';position:absolute;left:23px;top:40px;bottom:-4px;width:1px;background:var(--td-component-stroke)}
.rail li.done:not(:last-child)::after{background:var(--td-success-color)}
.rail li button{width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:8px;border:0;border-radius:var(--td-radius-medium);background:transparent;text-align:left;cursor:pointer}
.rail li button:hover:not(:disabled){background:var(--td-bg-color-container-hover)}.rail li button:disabled{cursor:not-allowed;opacity:.6}
.rail li.on button{background:var(--td-brand-color-light)}
.dot{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;border:1px solid var(--td-component-border);color:var(--td-text-color-placeholder);background:#fff;position:relative;z-index:1}
.rail li.done .dot{background:var(--td-success-color);border-color:var(--td-success-color);color:#fff}
.rail li.partial .dot{background:var(--td-warning-color-light);border-color:var(--td-warning-color);color:var(--td-warning-color)}
.rail li.doing .dot,.rail li.on .dot{border-color:var(--td-brand-color);color:var(--td-brand-color)}
.rail li.on.todo .dot,.rail li.on.doing .dot{background:var(--td-brand-color);color:#fff}
.rail-txt{display:flex;flex-direction:column;min-width:0}.rail-txt strong{font-weight:500;color:var(--td-text-color-primary)}.rail-txt small{font-size:12px;color:var(--td-text-color-placeholder);margin-top:2px}
.rail li.on .rail-txt strong{color:var(--td-brand-color);font-weight:600}
.rail-foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--td-component-stroke);display:flex;flex-direction:column;gap:2px}
.rail-link{display:flex;align-items:center;gap:8px;padding:8px 10px;border:0;background:transparent;border-radius:var(--td-radius-medium);color:var(--td-text-color-secondary);font-size:13px;cursor:pointer;text-align:left}
.rail-link:hover:not(:disabled){background:var(--td-bg-color-container-hover);color:var(--td-brand-color)}
.stage{flex:1;min-width:0;overflow-y:auto;padding:20px 24px 0}
.carry-card,.step-card{max-width:960px;margin:0 auto;border-radius:var(--td-radius-large)}
.stage-done{max-width:960px;margin-left:auto;margin-right:auto}
.carry-card{margin-bottom:12px}
.step-head{margin-bottom:20px}
.eyebrow{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px;color:var(--td-text-color-secondary)}
.step-head h2{margin:0;font-size:20px;font-weight:600;color:var(--td-text-color-primary)}
.desc{margin:6px 0 0;color:var(--td-text-color-secondary);line-height:1.7}
.sec{margin-top:20px}.sec:first-of-type{margin-top:0}
.sec-h{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;font-weight:600;color:var(--td-text-color-primary)}.sec-h .muted{font-weight:400}
.saved{margin-left:auto;font-size:12px;font-weight:400;color:var(--td-success-color)}.saved i{margin-right:4px}
.sec-actions{margin-top:8px}
.confirm-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.confirm-fields .span2{grid-column:1/-1;display:flex;align-items:center;gap:10px}.handoff-fields{margin-top:12px}
.rows{list-style:none;margin:0;padding:0;border:1px solid var(--td-component-stroke);border-radius:var(--td-radius-medium)}
.rows li{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--td-component-stroke)}.rows li:last-child{border-bottom:0}
.row-main{flex:1;min-width:0}.row-title{font-weight:500;color:var(--td-text-color-primary)}.row-desc{margin-top:2px;font-size:12px;color:var(--td-text-color-placeholder);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fbadge{flex:none;width:30px;height:32px;border-radius:4px;color:#fff;font-size:9px;font-weight:700;display:grid;place-items:center;background:#64748b}.fbadge.md{background:#1f6bff}.fbadge.html{background:#e8590c}
.preview pre{max-height:420px;overflow:auto;margin:0;padding:12px 14px;border-radius:var(--td-radius-medium);background:var(--td-bg-color-secondarycontainer);font-size:12px;line-height:1.7;white-space:pre-wrap}
.result{padding:12px 14px;border-radius:var(--td-radius-medium);background:var(--td-bg-color-secondarycontainer);line-height:1.8}.result p{margin:0}.result ul{margin:6px 0 0;padding-left:18px}
.qrow{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--td-component-stroke)}.qrow .qt{flex:1;min-width:0;line-height:1.5}
.help{margin:16px 0 0}
.step-foot{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;margin:24px -24px -24px;box-shadow:0 -6px 12px -10px rgba(15,23,42,.18);padding:14px 24px;background:var(--td-bg-color-container,#fff);border-top:1px solid var(--td-component-stroke);border-radius:0 0 var(--td-radius-large) var(--td-radius-large)}
.carry-h{display:flex;align-items:center;gap:8px}.carry-h i{color:#2563eb;font-size:12px}.carry-h strong{font-size:13px;color:#0f172a}.carry-h span{font-size:12px;color:#64748b}
.carry-toggle{margin-left:auto;font-size:12px}.carry-toggle i{margin-left:4px}.carry-toggle i{color:#94a3b8;font-size:10px}
.carry-body{margin-top:10px;padding-top:2px;border-top:1px solid var(--td-component-stroke)}
.carry-body{container-type:inline-size}.carry-docs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}@container (max-width:820px){.carry-docs{grid-template-columns:repeat(3,minmax(0,1fr))}}@container (max-width:520px){.carry-docs{grid-template-columns:repeat(2,minmax(0,1fr))}}
.carry-doc{display:flex;flex-direction:column;gap:4px;min-width:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;text-align:left;cursor:pointer}.carry-doc:hover:not(:disabled){border-color:#93b4ff;background:#f7faff}
.carry-doc.missing{cursor:default;background:#fafbfc}.carry-doc.missing .cd-name{color:#94a3b8}
.cd-name{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;white-space:nowrap;overflow:hidden;font-size:13px;font-weight:500;color:#1e293b}.cd-name em{flex:none;font-style:normal;font-size:11px;font-weight:400;color:#64748b;background:#f1f5f9;border-radius:4px;padding:0 5px}
.cd-title{min-width:0;overflow:hidden;text-overflow:ellipsis}.cd-to{display:block;min-width:0;font-size:11px;color:#94a3b8;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.carry-qs{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:2px 20px;margin-top:12px}
.carry-q{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;column-gap:8px;min-height:32px;padding:4px 0;border-bottom:1px dashed #eef2f7;font-size:13px;line-height:1.5;color:#334155}.carry-q b{font-size:11px;font-weight:600;color:#b45309;font-variant-numeric:tabular-nums}.carry-q span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.carry-q em{justify-self:end;font-style:normal;font-size:11px;line-height:18px;color:#c2410c;background:#fff4ea;border-radius:8px;padding:0 6px;white-space:nowrap}
.carry-q.done{color:#94a3b8;grid-template-columns:28px minmax(0,1fr)}.carry-q.done i{font-size:11px;color:#059669}.carry-q.done span{white-space:normal}.carry-q.done small{display:block;font-size:12px;color:#64748b}
.carry-note{margin:10px 0 0;font-size:12px;color:#94a3b8}
@media (max-width:900px){.rail{width:64px}.rail-txt,.rail-link span{display:none}.rail li:not(:last-child)::after{left:21px}.confirm-fields{grid-template-columns:1fr}}
</style>
