<template>
  <section class="fde-flow" aria-label="当前产品任务">
    <div class="flow-top"><span>阶段 {{ stage }} · {{ stageName }}</span><span v-if="stage === 2">第 {{ state.round }} 轮沟通</span><button :disabled="locked" @click="reload">刷新记录</button></div>
    <div v-if="loading" class="flow-loading">正在读取项目流程…</div>
    <template v-else>
      <nav class="flow-steps" aria-label="本阶段任务">
        <button v-for="(item, index) in tasks" :key="item.id" :class="{ selected: selectedId === item.id, done: entryFor(item).status === 'confirmed' }" :disabled="locked || !available(index)" @click="selectTask(item.id)">
          <span>{{ entryFor(item).status === 'confirmed' ? '✓' : index + 1 }}</span>{{ item.title }}
        </button>
      </nav>
      <div v-if="error" class="flow-error" role="alert">{{ error }}<button :disabled="locked" @click="reload">重新读取</button></div>
      <article v-if="task" class="flow-card">
        <div class="flow-card-head"><div><p class="flow-eyebrow">{{ entry.status === 'confirmed' ? '已核对的任务' : '当前任务' }}</p><h2>{{ task.title }}</h2></div><span class="flow-status" :class="entry.status">{{ statusText }}</span></div>
        <p class="flow-goal">{{ task.goal }}</p>
        <p v-if="entry.notice" class="flow-notice">{{ entry.notice }}</p>
        <label class="flow-label" :for="`flow-notes-${stage}`">{{ task.kind === 'feedback' ? '客户反馈与认可依据' : '本轮补充' }} <span>已有项目资料会一起使用</span></label>
        <textarea :id="`flow-notes-${stage}`" v-model="notes" :disabled="locked" :placeholder="task.hint || '补充评审意见、资料或需要关注的问题。'" rows="3"></textarea>
        <div class="flow-input-actions"><button :disabled="locked" @click="openMaterials"><i class="fa-solid fa-paperclip"></i>添加 / 查看资料</button><button :disabled="locked || !notesDirty" @click="saveNotes">{{ saving ? '保存中…' : '保存补充' }}</button><span v-if="savedNotice" role="status">{{ savedNotice }}</span></div>
        <div v-if="task.customer || task.kind === 'feedback'" class="flow-confirm-fields">
          <label>确认人<input v-model="confirmedBy" :disabled="locked" placeholder="实际参与确认的客户 / 业务负责人" /></label>
          <label>确认依据<input v-model="evidence" :disabled="locked" placeholder="会议日期、记录位置或客户实际确认内容" /></label>
        </div>
        <div v-if="entry.summary" class="flow-result"><h3>本轮成果</h3><p>{{ entry.summary.summary }}</p><ul v-if="entry.summary.changes?.length"><li v-for="change in entry.summary.changes" :key="change">{{ change }}</li></ul></div>
        <div v-if="entry.summary?.questions?.length" class="flow-questions"><h3>接下来要确认</h3><div v-for="question in entry.summary.questions" :key="question.question"><span>{{ question.owner || 'FDE' }}{{ question.blocking ? ' · 阻塞' : '' }}</span><p>{{ question.question }}</p></div><p class="flow-help">把确认结果写在本轮补充中，再更新成果；有明确阻塞的问题先处理。</p></div>
        <div v-if="files.length" class="flow-files"><h3>{{ task.kind === 'feedback' ? '反馈记录' : '成果归档' }}</h3><button v-for="file in files" :key="file" :disabled="locked || !existing[file]" @click="openFile(file)"><i class="fa-regular fa-file-lines"></i><span>{{ fileLabel(file) }}</span><small>{{ existing[file] ? '查看' : '尚未形成' }}</small></button></div>
        <div v-if="previewContent" class="flow-preview"><div><h3>{{ fileLabel(previewFile) }}</h3><button @click="previewContent = ''">收起</button></div><pre>{{ previewContent }}</pre></div>
        <div v-if="entry.status === 'running'" class="flow-running" role="status"><i class="fa-solid fa-circle-notch fa-spin"></i>{{ entry.runningTitle || '正在形成成果' }}<span>完成 {{ Object.keys(entry.jobs || {}).length }} / {{ task.jobs?.length || 1 }}</span></div>
        <p v-if="hasBlocking" class="flow-notice">仍有阻塞问题，请补充确认结果并更新成果后继续。</p>
        <div class="flow-footer">
          <template v-if="task.kind === 'feedback'">
            <button class="flow-secondary" :disabled="locked || !notes.trim()" @click="newRound">有调整，继续下一轮</button>
            <button class="flow-primary" :disabled="locked || !notes.trim() || !confirmedBy.trim() || !evidence.trim()" @click="confirmFeedback">{{ progressStage > stage ? '保存反馈并回到当前阶段' : task.action }} <i class="fa-solid fa-arrow-right"></i></button>
          </template>
          <template v-else>
            <button v-if="entry.status !== 'confirmed'" class="flow-primary" :disabled="locked" @click="runTask(false)"><i class="fa-solid fa-wand-magic-sparkles"></i>{{ entry.status === 'failed' ? '从中断处继续' : entry.status === 'ready-review' ? '继续完善成果' : task.action }}</button>
            <button v-if="existingComplete && entry.status !== 'confirmed'" class="flow-secondary" :disabled="locked || ((task.customer) && (!confirmedBy.trim() || !evidence.trim())) || hasBlocking" @click="confirmTask">{{ task.handoff ? '资料已核对，登记待研发接收' : stage === 1 ? '准备就绪，开始需求沟通' : '核对完成，继续下一步' }} <i class="fa-solid fa-arrow-right"></i></button>
            <button v-if="entry.status === 'confirmed'" class="flow-primary" :disabled="locked" @click="continueConfirmed">{{ task.handoff ? '查看交接状态' : '继续下一步' }} <i class="fa-solid fa-arrow-right"></i></button>
            <button v-if="existingComplete" class="flow-text" :disabled="locked" @click="runTask(true)">重新整理</button>
          </template>
        </div>
        <p v-if="existingComplete && !entry.confirmation && !task.kind" class="flow-help">已有成果可以直接打开核对。生成成功后仍需人工核对，才会推进下一步。</p>
        <div v-if="task.handoff" ref="handoffRef" class="flow-handoff"><h3>交接状态</h3><div class="flow-handoff-status"><span>产品资料 <b>{{ entry.status === 'confirmed' ? '已核对' : '待核对' }}</b></span><span>研发接收 <b>{{ state.handoff.status === 'accepted' ? '已登记接收' : state.handoff.status === 'waiting' ? '待接收' : state.handoff.status === 'needs-review' ? '需重新核对' : '待交接' }}</b></span><span>技术验证 <b>按实际验证记录另行确认</b></span></div><template v-if="entry.status === 'confirmed'"><label class="flow-label">研发接收人<input v-model="recipient" :disabled="locked" placeholder="填写实际接收人" /></label><label class="flow-label">接收依据<input v-model="receipt" :disabled="locked" placeholder="填写实际接收记录、日期或评审结论" /></label><button class="flow-secondary" :disabled="locked || !recipient.trim() || !receipt.trim()" @click="acceptHandoff">登记研发已接收</button><p class="flow-help">这里记录实际交接结果；登记接收不会将 SQL、数据接入或 Eval 标为已通过。</p></template></div>
      </article>
    </template>
  </section>
</template>
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { FLOW_TASKS, freshState, taskKey, taskFiles, nextTaskId, createFlowService, buildTaskPrompt } from '../../data/project-flow.mjs';
const props = defineProps({ slug: String, stage: Number, progressStage: Number, streaming: Boolean, runJob: Function, advanceStage: Function });
const emit = defineEmits(['open-file', 'materials', 'state', 'busy']);
const service = createFlowService(window.api.hermes, props.slug);
const previewContent=ref(''), previewFile=ref('');
const state = ref(freshState()), loading = ref(true), busy = ref(false), saving = ref(false), error = ref(''), selectedId = ref('');
const notes = ref(''), confirmedBy = ref(''), evidence = ref(''), recipient = ref(''), receipt = ref(''), savedNotice = ref(''), existing = ref({}), handoffRef = ref(null);
const tasks = computed(() => FLOW_TASKS[props.stage] || []);
const task = computed(() => tasks.value.find(item => item.id === selectedId.value) || tasks.value[0]);
const entryFor = item => state.value.tasks[taskKey(props.stage, item)] || {};
const entry = computed(() => task.value ? entryFor(task.value) : {});
const files = computed(() => task.value ? taskFiles(task.value) : []);
const locked = computed(() => busy.value || saving.value || loading.value || props.streaming);
const existingComplete = computed(() => files.value.length > 0 && files.value.every(file => existing.value[file]));
const notesDirty = computed(() => notes.value !== (entry.value.notes || '') || confirmedBy.value !== (entry.value.confirmedBy || '') || evidence.value !== (entry.value.evidence || ''));
const hasBlocking = computed(() => entry.value.summary?.questions?.some(q => q.blocking) || Object.values(entry.value.jobs || {}).some(job=>job.summary?.questions?.some(q=>q.blocking)));
const stageName = computed(() => ({ 1:'调研准备', 2:'需求沟通', 3:'需求确认' })[props.stage]);
const statusText = computed(() => ({ running:'正在生成', failed:'需要重试', 'ready-review':'待核对', confirmed:'已核对', 'needs-review':'需重新核对' })[entry.value.status] || '待处理');
const labels = { 'contact-form.md':'需求与数据对接确认表', 'ai-capability.md':'AI 能力清单', 'prd.md':'产品 PRD', 'spec.md':'功能清单', 'index.html':'可交互原型', 'prototype-handoff.md':'原型演示说明', 'final-req.md':'最终需求确认表', 'data-metric.md':'业务数据口径', 'agent-design.md':'智能体业务设计', 'impl-plan.md':'实施协作计划', 'prototype-final.md':'定稿原型说明', 'preparation.md':'调研准备要点', 'feedback.md':'客户反馈记录', 'handoff.md':'研发交接清单' };
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
  if (props.stage === 2) for (const item of FLOW_TASKS[3]) { const record = state.value.tasks[taskKey(3,item)]; if(record) { record.status='needs-review'; record.jobs={}; record.notice='需求沟通已有更新，请重新核对。'; } }
  if (state.value.handoff.status !== 'preparing') state.value.handoff.status = 'needs-review';
}
async function runTask(force) {
  if (locked.value) return;
  error.value = ''; if (!await saveNotes()) return;
  busy.value = true; emit('busy',true); error.value = '';
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
      const prompt = buildTaskPrompt({stage,round:state.value.round,task:activeTask,job,notes:notes.value,summaryFile,confirmations:{ by:confirmedBy.value,evidence:evidence.value }});
      await props.runJob({stage,task:activeTask,job,prompt});
      const signatures = await service.verify(job.files);
      const raw = await service.read(summaryFile);
      let summary; try { summary = JSON.parse(raw); } catch { throw new Error('成果摘要未完整写入，请重试核对。'); }
      if (!summary || typeof summary.summary !== 'string' || !summary.summary.trim()) throw new Error('成果摘要缺少实际结果，请重试。');
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
  } finally { busy.value=false; emit('busy',false); await checkFiles(); }
}
async function confirmTask() {
  if (locked.value || hasBlocking.value) return;
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
async function resume(stageChanged=false) { if(!stageChanged && !loading.value && !await saveNotes()) return; selectedId.value=nextTaskId(state.value,props.stage); hydrateInputs(); await checkFiles(); }
function context() { return `当前阶段${props.stage}，第${state.value.round}轮，任务：${task.value?.title}；补充：${notes.value}。请围绕当前任务回答，未确认的信息如实说明；不要以对话结束或文档存在代替用户核对。`; }
watch(selectedId,()=>{hydrateInputs(); checkFiles();});
watch(()=>props.stage,()=>{if(!busy.value) resume(true);});
let notesTimer;
watch([notes,confirmedBy,evidence],()=>{clearTimeout(notesTimer); if(notesDirty.value && !locked.value) notesTimer=setTimeout(saveNotes,650);});
onUnmounted(()=>{clearTimeout(notesTimer); if(!busy.value && notesDirty.value) saveNotes();});
onMounted(reload);
defineExpose({resume,canAdvance,context,reload});
</script>
<style scoped>
.fde-flow{flex:1;min-height:0;overflow-y:auto;padding:20px 24px 36px;background:#f7faff;color:#334155;font-size:13px}.flow-top{display:flex;align-items:center;gap:12px;color:#64748b;font-size:12px;margin-bottom:18px}.flow-top button{margin-left:auto;color:#64748b}.flow-steps{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px}.flow-steps button{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#64748b;font-size:12px}.flow-steps button span{display:grid;place-items:center;width:19px;height:19px;background:#f1f5f9;border-radius:50%;font-size:11px}.flow-steps .selected{color:#2563eb;border-color:#93b4ff;background:#eff5ff}.flow-steps .done span{background:#e5f7ee;color:#059669}.flow-card{max-width:960px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;box-shadow:0 2px 7px #0f172a04}.flow-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.flow-eyebrow{font-size:11px;color:#64748b;margin:0 0 6px}.flow-card h2{font-size:21px;font-weight:600;color:#0f172a;margin:0}.flow-status{padding:4px 8px;background:#f1f5f9;border-radius:6px;font-size:11px;white-space:nowrap}.flow-status.confirmed{color:#047857;background:#ecfdf5}.flow-status.running,.flow-status.ready-review{color:#1d4ed8;background:#eff6ff}.flow-status.failed,.flow-status.needs-review{color:#b45309;background:#fffbeb}.flow-goal{line-height:1.8;color:#64748b;margin:12px 0 22px}.flow-label{display:block;font-size:12px;font-weight:500;color:#334155;margin:14px 0 8px}.flow-label span{font-size:11px;font-weight:400;color:#94a3b8;margin-left:8px}.fde-flow textarea,.fde-flow input{width:100%;box-sizing:border-box;border:1px solid #dce5f2;border-radius:8px;background:#fcfdff;padding:10px 12px;color:#334155;font-size:13px;line-height:1.75;outline:none}.fde-flow textarea{resize:vertical;min-height:92px}.fde-flow textarea:focus,.fde-flow input:focus{border-color:#7aa5ff;box-shadow:0 0 0 3px #eff6ff}.fde-flow input{margin-top:6px;font-size:12px}.flow-input-actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:9px;color:#64748b;font-size:11px}.flow-input-actions i{margin-right:5px}.flow-confirm-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;font-size:12px}.flow-result,.flow-questions,.flow-files,.flow-handoff{margin-top:22px;padding-top:19px;border-top:1px solid #eef2f7}.flow-card h3{font-size:13px;font-weight:600;color:#1e293b;margin:0 0 11px}.flow-result p,.flow-result li{font-size:13px;line-height:1.9;overflow-wrap:anywhere}.flow-result ul{padding-left:18px;margin:8px 0}.flow-questions>div{background:#f8fafc;border-radius:8px;padding:10px 12px;margin-bottom:7px}.flow-questions span{font-size:10px;color:#64748b}.flow-questions p{margin:4px 0;line-height:1.75}.flow-files{display:flex;flex-wrap:wrap;gap:8px}.flow-files h3{width:100%}.flow-files button{display:flex;gap:8px;align-items:center;border:1px solid #e2e8f0;border-radius:8px;padding:9px 11px;color:#334155;font-size:12px}.flow-files i{color:#3975ee}.flow-files small{font-size:10px;color:#94a3b8}.flow-footer{position:sticky;bottom:0;z-index:2;background:#fff;padding:14px 0;box-shadow:0 -8px 14px #ffffffeb;display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-top:24px}.flow-primary,.flow-secondary{padding:9px 13px;border-radius:8px;font-size:12px;font-weight:500;min-height:36px}.flow-primary{background:#2563eb;color:white}.flow-primary i{margin-left:5px}.flow-secondary{background:#fff;border:1px solid #dce5f2;color:#2563eb}.flow-text{font-size:11px;color:#64748b;padding:8px}.flow-help{font-size:11px!important;line-height:1.7!important;color:#94a3b8!important;margin:12px 0 0!important}.flow-error,.flow-notice{padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-size:12px;line-height:1.75;margin:12px 0}.flow-error button{margin-left:10px;text-decoration:underline}.flow-running{display:flex;gap:8px;align-items:center;color:#2563eb;font-size:12px;padding:16px 0 0}.flow-running span{margin-left:auto;color:#64748b;font-size:11px}.flow-handoff-status{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:#64748b}.flow-handoff-status b{display:block;margin-top:5px;color:#334155;font-weight:500}.fde-flow button{cursor:pointer;transition:background .15s}.fde-flow button:disabled{cursor:default;opacity:.45}.fde-flow button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}.flow-preview{margin-top:18px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}.flow-preview>div{display:flex;justify-content:space-between;gap:10px}.flow-preview button{font-size:11px;color:#64748b}.flow-preview pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:12px;line-height:1.9;color:#475569}.flow-loading{padding:24px;color:#64748b}@media(max-width:950px){.fde-flow{padding:14px}.flow-card{padding:18px}.flow-card h2{font-size:18px}.flow-confirm-fields{grid-template-columns:1fr}}
</style>
