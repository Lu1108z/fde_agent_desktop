<template>
  <section class="s1" aria-label="阶段一 行业调研">
    <!-- 项目头：只放身份信息和流程进度 -->
    <header class="head">
      <div class="head-main">
        <t-space align="center" size="small"><h1>{{ ctx.customer.name || projectName }}</h1><t-tag theme="primary" variant="light">阶段一 · 行业调研</t-tag><t-tag v-if="progressStage > 1" theme="success" variant="light">已进入阶段{{ progressStage }}，可补充调研</t-tag></t-space>
        <p class="head-meta">{{ [ctx.customer.industry, ctx.customer.direction, ctx.goal.counterpart].filter(Boolean).join(' · ') || '在第 1 步填写客户和方向' }}</p>
      </div>
      <div class="head-progress"><strong>第 {{ flow.current + 1 }} 步</strong><span> / 共 {{ flow.steps.length }} 步</span></div>
    </header>

    <t-loading v-if="loading" text="正在读取项目上下文…" size="small" class="s1-loading" />
    <div v-else class="body">
      <!-- 左侧：五步流程，已完成和跳过的步骤可以点回去修改 -->
      <nav class="rail" aria-label="阶段一流程">
        <ol>
          <li v-for="(s, i) in flow.steps" :key="s.id" :class="[s.status, { on: view === i }]">
            <button @click="view = i">
              <span class="dot"><i v-if="s.status === 'done'" class="fa-solid fa-check"></i><i v-else-if="s.status === 'skipped' || s.status === 'partial'" class="fa-solid fa-forward"></i><template v-else>{{ i + 1 }}</template></span>
              <span class="rail-txt"><strong>{{ s.title }}</strong><small>{{ STEP_STATE[s.status] }}{{ i === flow.current && s.status !== 'done' ? ' · 当前' : '' }}</small></span>
            </button>
          </li>
        </ol>
        <div class="rail-foot">
          <button class="rail-link" @click="emit('materials')"><i class="fa-regular fa-folder-open"></i>项目资料 {{ materials.length }}</button>
          <button class="rail-link" @click="archiveOpen = true"><i class="fa-solid fa-box-archive"></i>全部成果与记录</button>
        </div>
      </nav>

      <!-- 右侧：只显示当前这一步 -->
      <main class="stage">
        <t-alert v-if="error" theme="error" :message="error" close @close="error = ''" class="mb" />
        <!-- 阶段一没有右侧对话栏，运行进度和停止入口都放在这里 -->
        <section v-if="running || jobProgress" class="job mb" role="status">
          <div class="job-h">
            <t-loading size="16px" />
            <strong>正在执行：{{ running || jobProgress.title }}</strong>
            <span v-if="jobProgress" class="job-time">已用时 {{ jobElapsed }}</span>
            <t-button v-if="jobProgress" size="small" variant="outline" theme="danger" class="job-stop" @click="stopJob">停止</t-button>
          </div>
          <ul v-if="jobProgress?.steps.length" class="job-steps"><li v-for="s in jobProgress.steps" :key="s">{{ s }}</li></ul>
          <p class="job-note">运行时不能发起其他 AI 操作或修改文档，可以切换步骤、查看和下载内容。结果会保存到当前步骤，停止后已完成的文件会保留。</p>
        </section>
        <t-alert v-if="view > 0 && !flow.goalReady" theme="warning" message="还没有写本阶段目标。后面的步骤可以先看，但建议先回第 1 步写几句。" class="mb"><template #operation><t-link theme="primary" @click="view = 0">去填写</t-link></template></t-alert>

        <t-card :bordered="false" class="step-card">
          <div class="step-head">
            <p class="eyebrow">第 {{ view + 1 }} 步 · {{ step.title }}<t-tag v-if="step.status !== 'todo'" size="small" variant="light" :theme="STEP_THEME[step.status]">{{ STEP_STATE[step.status] }}</t-tag></p>
            <h2>{{ step.heading }}</h2>
            <p class="desc">{{ step.desc }}</p>
          </div>

          <!-- 1 明确目标 -->
          <t-form v-if="step.id === 'goal'" label-align="top" :colon="false">
            <t-form-item label="本阶段目标" requiredMark help="至少写一句，例如：了解医院人事管理业务，准备首轮客户访谈"><t-textarea v-model="ctx.goal.text" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="这次想了解什么" @blur="persist" /></t-form-item>
            <t-row :gutter="16">
              <t-col :span="6"><t-form-item label="客户名称"><t-input v-model="ctx.customer.name" placeholder="例如：XX 市第一人民医院" @blur="persist" /></t-form-item></t-col>
              <t-col :span="6"><t-form-item label="对接对象"><t-input v-model="ctx.goal.counterpart" placeholder="例如：人事处处长、信息科" @blur="persist" /></t-form-item></t-col>
              <t-col :span="6"><t-form-item label="所属行业"><t-input v-model="ctx.customer.industry" placeholder="例如：医疗" @blur="persist" /></t-form-item></t-col>
              <t-col :span="6"><t-form-item label="业务方向"><t-input v-model="ctx.customer.direction" placeholder="例如：人事管理" @blur="persist" /></t-form-item></t-col>
              <t-col :span="6"><t-form-item label="计划访谈时间"><t-date-picker v-model="ctx.goal.plannedAt" clearable style="width:100%" @change="persist" /></t-form-item></t-col>
            </t-row>
          </t-form>

          <!-- 2 收集资料 -->
          <template v-if="step.id === 'materials'">
            <div class="drop" :class="{ over: dropOver, disabled: locked }" role="button" tabindex="0" @click="!locked && upload()" @keydown.enter="!locked && upload()" @dragover.prevent="dropOver = true" @dragleave.prevent="dropOver = false" @drop.prevent="drop">
              <i class="fa-solid fa-arrow-up-from-bracket"></i><strong>点击或拖入文件上传</strong><small>支持 PDF、Word、PPT、Excel、图片、文本</small>
            </div>
            <ul v-if="materials.length" class="rows">
              <li v-for="f in materials" :key="f.path"><span class="fbadge" :style="{ background: fileBadge(f.type)[1] }">{{ fileBadge(f.type)[0] }}</span><div class="row-main"><div class="row-title" :title="f.name">{{ f.name }}</div><div class="row-desc">{{ f.category }}<template v-if="f.updatedAt"> · {{ fmt(f.updatedAt) }}</template></div></div></li>
            </ul>
          </template>

          <!-- 3 AI 解析 -->
          <template v-if="step.id === 'analysis'">
            <t-empty v-if="!ctx.analyzedAt" :description="materials.length ? `已有 ${materials.length} 份资料，点下方按钮开始解析` : '没有资料也能解析，AI 会依据项目方向和行业经验给出初步判断'" class="pad" />
            <template v-else>
              <p class="muted mb">上次分析：{{ fmt(ctx.analyzedAt) }}</p>
              <!-- 已知、推测为空时收成一行提示，待确认问题占满宽度，不留大片空白 -->
              <div class="facts mb">
                <div v-if="ctx.facts.known.length" class="col success"><div class="col-h">已经知道<small>资料明确说明 · {{ ctx.facts.known.length }} 条</small></div><ul><li v-for="f in ctx.facts.known" :key="f.text">{{ f.text }}<small v-if="f.source">来源：{{ f.source }}</small></li></ul></div>
                <div v-if="ctx.facts.possible.length" class="col primary"><div class="col-h">可能需要了解<small>AI 推测 · {{ ctx.facts.possible.length }} 条</small></div><ul><li v-for="f in ctx.facts.possible" :key="f.text">{{ f.text }}<small v-if="f.basis">依据：{{ f.basis }}</small></li></ul></div>
                <!-- 待确认问题：单列清单，按维度分段；每行 问题 | 找谁确认 | 操作 -->
                <div class="qbox wide">
                  <div class="qbox-h">
                    <strong>尚未确认</strong><span class="muted">{{ openQuestions.length }} 项，会带入首轮访谈</span>
                    <t-link v-if="resolvedQuestions.length" theme="primary" hover="color" class="resolved-toggle" @click="showResolved = !showResolved">{{ showResolved ? '收起' : '查看' }}已解决（{{ resolvedQuestions.length }}）</t-link>
                  </div>
                  <p v-if="!openQuestions.length" class="qbox-empty">暂无待确认问题</p>
                  <div v-if="questionGroups.length" class="qcols">
                    <section v-for="g in questionGroups" :key="g.id" class="qgrp">
                      <div class="qsec"><i :class="g.icon"></i>{{ g.title }}<span>{{ g.items.length }}</span></div>
                      <div v-for="q in g.items" :key="q.question" class="qrow" :title="q.source ? `来自：${q.source}` : ''">
                        <span class="qt">{{ q.question }}</span>
                        <span v-if="ownerLabel(q.owner)" :class="['qo', ownerTheme(q.owner)]">{{ ownerLabel(q.owner) }}</span>
                        <button class="qbtn" title="问清楚后点这里，可在「查看已解决」里恢复" @click="resolveQuestion(q)">标为已解决</button>
                      </div>
                    </section>
                  </div>
                  <template v-if="showResolved && resolvedQuestions.length">
                    <div class="qsec"><i class="fa-solid fa-circle-check"></i>已解决<span>{{ resolvedQuestions.length }}</span></div>
                    <div v-for="q in resolvedQuestions" :key="q.question" class="qrow done">
                      <span class="qt">{{ q.question }}</span>
                      <button class="qbtn" @click="reopenQuestion(q)"><i class="fa-solid fa-rotate-left"></i>恢复</button>
                    </div>
                  </template>
                  <div class="qadd">
                    <t-select v-model="newQuestionDim" size="small" style="width:120px;flex:none" :options="[{ label: '未归类', value: '' }, ...DIMENSIONS.map(d => ({ label: d.title, value: d.id }))]" />
                    <t-select v-model="newQuestionOwner" size="small" style="width:110px;flex:none" :options="[{ label: '问客户', value: '客户' }, { label: 'FDE 自查', value: 'FDE' }]" />
                    <t-input v-model="newQuestion" size="small" placeholder="输入待确认问题，回车添加" style="flex:1;min-width:0" @enter="newQuestion.trim() && addQuestion()" />
                  </div>
                </div>
                <p v-if="!ctx.facts.known.length || !ctx.facts.possible.length" class="muted facts-note">{{ [!ctx.facts.known.length && '资料中没有可直接确认的事实', !ctx.facts.possible.length && 'AI 暂无推测'].filter(Boolean).join('；') }}。</p>
              </div>
              <div class="sub-h">六个调研维度<span class="muted">点击补充你了解的信息，缺的维度会在访谈中确认</span></div>
              <t-row :gutter="[10, 10]">
                <t-col v-for="d in dims" :key="d.id" :span="4">
                  <button class="dim" @click="openDim(d)">
                    <span class="dim-top"><i :class="[d.icon, 'dim-ic', statusOf(d.id).tone]"></i><strong>{{ d.title }}</strong><t-tag size="small" variant="light" :theme="TAG_THEME[statusOf(d.id).tone]">{{ statusOf(d.id).label }}</t-tag></span>
                    <span class="dim-desc">{{ ctx.dimensions[d.id]?.summary || ctx.dimensions[d.id]?.notes || d.hint }}</span>
                  </button>
                </t-col>
              </t-row>
            </template>
          </template>

          <!-- 4 准备访谈 -->
          <template v-if="step.id === 'interview'">
            <!-- 五份文档按生成顺序排成标签，一次只看一份，不用上下滚动查找 -->
            <div class="doc-tabs" role="tablist" aria-label="第 4 步文档">
              <button v-for="(d, i) in coreDocs" :key="d.file" type="button" role="tab" class="doc-tab" :class="[{ on: activeDoc.file === d.file }, docTone(d.file)]" :aria-selected="activeDoc.file === d.file" @click="docPick = d.file">
                <span class="n">{{ i + 1 }}</span><span class="t">{{ d.name }}</span><span class="st">{{ docState(d.file).label }}</span>
              </button>
            </div>
            <div class="doc-wrap"><DocCard :key="activeDoc.file" :d="activeDoc" /></div>
            <t-collapse borderless class="extras">
              <t-collapse-panel value="extra" header="可选：辅助材料（行业预研、客户背景、探索原型）">
                <ul class="rows">
                  <li v-for="job in extraJobs" :key="job.id">
                    <span class="rec-ic" :class="job.id"><i :class="REC_ICON[job.id]"></i></span>
                    <div class="row-main"><div class="row-title">{{ job.title }}</div><div class="row-desc">{{ EXTRA_DESC[job.id] }} · {{ docState(job.files.at(-1)).label }}</div></div>
                    <t-button size="small" variant="outline" :disabled="locked" @click="run(job.id)">{{ docState(job.files.at(-1)).versions.length ? '重新生成' : '生成' }}</t-button>
                    <t-button v-if="docState(job.files.at(-1)).versions.length" size="small" variant="text" theme="primary" @click="archiveOpen = true">查看</t-button>
                  </li>
                </ul>
              </t-collapse-panel>
            </t-collapse>
          </template>

          <!-- 5 进入阶段二 -->
          <template v-if="step.id === 'handoff'">
            <t-alert v-if="flow.gaps.length" theme="warning" class="mb" :message="`以下步骤跳过或未完成：${flow.gaps.map(s => s.title).join('、')}。${flow.goalReady ? '负责人可携带这些缺口进入阶段二。' : '请先填写本阶段目标，再由负责人确认交接。'}`" />
            <t-alert v-else theme="success" class="mb" message="四项准备步骤已完成，请由负责人确认交接。" />
            <t-descriptions bordered :column="1" :label-style="{ width: '110px' }" class="mb">
              <t-descriptions-item label="客户信息">{{ [ctx.customer.name, ctx.customer.industry, ctx.customer.direction, ctx.goal.counterpart].filter(Boolean).join(' · ') || '未填写' }}</t-descriptions-item>
              <t-descriptions-item label="本阶段目标">{{ ctx.goal.text || '未填写' }}</t-descriptions-item>
              <t-descriptions-item label="调研结论">{{ hints }}</t-descriptions-item>
              <t-descriptions-item label="访谈成果">{{ coreDocs.map(d => `${d.name}：${docState(d.file).label}`).join('；') }}</t-descriptions-item>
              <t-descriptions-item label="待确认事项">{{ openQuestions.length ? `${openQuestions.length} 项，将带入首轮访谈` : '无' }}</t-descriptions-item>
              <t-descriptions-item label="资料来源">{{ materials.length ? `${materials.length} 份` : '暂无' }}</t-descriptions-item>
            </t-descriptions>
            <t-form label-align="top" :colon="false">
              <t-form-item label="项目负责人" requiredMark><t-input v-model="ownerName" placeholder="填写负责人姓名" /></t-form-item>
              <t-form-item label="未确认假设（可选）"><t-textarea v-model="assumptions" :autosize="{ minRows: 2 }" placeholder="例如：假设医院 HIS 可开放人员数据接口" /></t-form-item>
            </t-form>
          </template>

          <!-- 每一步只有一个主操作 -->
          <footer class="step-foot">
            <t-button v-if="view > 0" variant="text" @click="view--">上一步</t-button>
            <span class="grow"></span>
            <t-button v-if="step.skippable && step.status !== 'done' && step.status !== 'skipped' && step.status !== 'partial'" variant="outline" :disabled="locked" @click="skipStep">{{ SKIP_LABEL[step.id] }}</t-button>
            <t-button v-if="primary" theme="primary" :disabled="primary.disabled" :loading="busy && primary.busy" @click="primary.run">{{ primary.label }}</t-button>
          </footer>
        </t-card>
      </main>
    </div>

    <!-- 补充维度 -->
    <t-dialog :visible="!!dimEdit" :header="dimEdit ? `补充「${dimEdit.title}」` : ''" width="640px" @close="dimEdit = null">
      <template v-if="dimEdit">
        <!-- 维度详情：把 AI 结论拆成 资料写明 / AI 推断 / 还要确认 三块，每条带出处 -->
        <div class="dd">
          <div class="dd-sum">
            <div class="dd-sum-h"><t-tag size="small" variant="light" :theme="TAG_THEME[statusOf(dimEdit.id).tone]">{{ statusOf(dimEdit.id).label }}</t-tag><span class="muted">{{ dimEdit.hint }}</span></div>
            <p>{{ ctx.dimensions[dimEdit.id]?.summary || '还没有 AI 结论，可以点「让 AI 提取」或直接在下面补充。' }}</p>
            <small v-if="ctx.dimensions[dimEdit.id]?.reason">判定依据：{{ ctx.dimensions[dimEdit.id].reason }}</small>
          </div>
          <div class="dd-sec"><div class="dd-h ok"><i class="fa-solid fa-file-lines"></i>资料里写明的<span>{{ dimDetail.known.length }}</span></div>
            <ul v-if="dimDetail.known.length"><li v-for="f in dimDetail.known" :key="f.text">{{ f.text }}<small v-if="f.source">{{ f.source }}</small></li></ul>
            <p v-else class="dd-none">资料中没有找到这个维度的明确说法{{ (ctx.dimensions[dimEdit.id]?.sources || []).length ? `（AI 参考了 ${ctx.dimensions[dimEdit.id].sources.join('、')}）` : '' }}</p></div>
          <div v-if="dimDetail.possible.length" class="dd-sec"><div class="dd-h ai"><i class="fa-solid fa-wand-magic-sparkles"></i>AI 推断（未经客户证实）<span>{{ dimDetail.possible.length }}</span></div>
            <ul><li v-for="f in dimDetail.possible" :key="f.text">{{ f.text }}<small v-if="f.basis">依据：{{ f.basis }}</small></li></ul></div>
          <div class="dd-sec"><div class="dd-h warn"><i class="fa-solid fa-circle-question"></i>还要确认<span>{{ dimDetail.open.length }}</span></div>
            <ul v-if="dimDetail.open.length"><li v-for="q in dimDetail.open" :key="q.question">{{ q.question }}<small v-if="ownerLabel(q.owner)">{{ ownerLabel(q.owner) }}</small></li></ul>
            <p v-else class="dd-none">没有待确认问题</p></div>
          <div class="dd-sec"><div class="dd-h"><i class="fa-solid fa-pen"></i>我的补充</div>
            <t-textarea v-model="dimDraft" :autosize="{ minRows: 3 }" placeholder="写下你了解到、资料里没有的信息，例如：信息科说考勤机是中控的，能导 Excel" /></div>
        </div>
      </template>
      <template #footer><t-button variant="outline" :disabled="locked" @click="extractDim">让 AI 提取</t-button><t-button variant="outline" @click="dimEdit = null">取消</t-button><t-button theme="primary" @click="saveDimDraft">保存</t-button></template>
    </t-dialog>

    <!-- 放大查看 -->
    <t-dialog :visible="!!zoomDoc" :header="zoomDoc?.name || ''" width="min(1200px, 94vw)" top="3vh" :footer="false" class="s1-zoom" @close="zoomDoc = null">
      <template v-if="zoomDoc">
        <div class="s1-zoom-bar">
          <t-button size="small" variant="outline" :disabled="zoomScale === ZOOM_STEPS[0]" @click="stepZoom(-1)">A−</t-button>
          <span class="muted">{{ Math.round(zoomScale * 100) }}%</span>
          <t-button size="small" variant="outline" :disabled="zoomScale === ZOOM_STEPS[ZOOM_STEPS.length - 1]" @click="stepZoom(1)">A+</t-button>
          <span class="grow" />
          <t-button size="small" variant="outline" @click="downloadDoc(zoomDoc, 'md')">下载 Markdown</t-button>
          <t-button size="small" variant="outline" @click="downloadDoc(zoomDoc, 'docx')">下载 Word</t-button>
        </div>
        <div class="s1 s1-zoom-body" :style="{ '--zoom': zoomScale }"><div class="doc"><MdView :text="docText[zoomDoc.file] || ''" /></div></div>
      </template>
    </t-dialog>

    <!-- 全部成果与执行记录 -->
    <t-drawer v-model:visible="archiveOpen" header="全部成果与记录" size="760px" :footer="false">
      <div v-for="d in DELIVERABLES" :key="d.file" class="doc-wrap"><DocCard :d="d" /></div>
      <div class="sub-h">Skill 执行记录</div>
      <t-table row-key="at" size="small" :data="[...ctx.skillRuns].reverse().slice(0, 20)" :columns="RUN_COLUMNS" empty="暂无">
        <template #at="{ row }">{{ fmt(row.at) }}</template>
        <template #status="{ row }"><t-tag size="small" variant="light" :theme="row.status === 'done' ? 'success' : row.status === 'failed' ? 'danger' : 'primary'">{{ ({ done: '完成', failed: '失败', running: '进行中' })[row.status] }}</t-tag></template>
      </t-table>
    </t-drawer>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUpdated, watch, h, defineComponent, resolveComponent } from 'vue';
import { marked } from 'marked';
import { MessagePlugin } from 'tdesign-vue-next';
import { fingerprint, readableArtifact } from '../../data/project-flow.mjs';
import { listProjectKnowledge } from '../../composables/projectKnowledge';
import { DIMENSIONS, DIMENSION_STATUS, RESEARCH_JOBS, DELIVERABLES, ANALYSIS_FILE, HANDOFF_FILE, CONTEXT_FILE, createContextService, freshContext, visibleDimensions, completion, dimensionHints, recommendations, advanceAdvice, buildResearchPrompt, mergeAnalysis, addQuestions, deliverableState, markdownSections, handoffMarkdown, stage1Steps, CORE_DOCS, TEMPLATES, checkDocument } from '../../data/stage1-research.mjs';

const props = defineProps({ slug: String, projectName: String, meta: Object, progressStage: Number, streaming: Boolean, runJob: Function, askAssistant: Function, advance: Function, workflowBusy: Boolean, jobProgress: Object, stopJob: Function, setBusy: Function, focusDoc: Object });
const emit = defineEmits(['materials', 'view-stage', 'open-file']);
const api = window.api.hermes;
const service = createContextService(api, props.slug);
const ctx = ref(freshContext(props.meta || {}));
const loading = ref(true), busy = ref(false), error = ref(''), running = ref('');
const materials = ref([]), newQuestion = ref(''), dropOver = ref(false), view = ref(0), archiveOpen = ref(false);
const dimEdit = ref(null), dimDraft = ref(''), ownerName = ref(''), assumptions = ref('');
const docText = ref({}), editing = ref(''), editBuffer = ref(''), sectionPick = ref({});
// 文档卡片的面板状态：revise 修改意见、history 版本、check 规范检查、overwrite 覆盖人工版本前确认。
const panel = ref({}), reviseText = ref({}), checks = ref({}), notice = ref({});
const setPanel = (file, name) => { panel.value = { ...panel.value, [file]: panel.value[file] === name ? '' : name }; };
const VERSION_DIR = '.fde-flow/history/stage1/versions';
const snapshotPath = (file, n) => `${VERSION_DIR}/${file}.v${n}`;

const locked = computed(() => busy.value || loading.value || props.streaming || props.workflowBusy);
const jobElapsed = computed(() => { const t = props.jobProgress?.seconds || 0; return t < 60 ? `${t} 秒` : `${Math.floor(t / 60)} 分 ${t % 60} 秒`; });
const dims = computed(() => visibleDimensions(ctx.value));
const done = computed(() => completion(ctx.value));
const hints = computed(() => dimensionHints(ctx.value));
const advice = computed(() => advanceAdvice(ctx.value, materials.value));
const openQuestions = computed(() => ctx.value.openQuestions.filter(q => q.status !== 'resolved'));
// 五步流程：左侧显示每步状态，右侧只渲染当前查看的一步。
const flow = computed(() => stage1Steps(ctx.value, materials.value));
const step = computed(() => flow.value.steps[view.value]);
const coreDocs = computed(() => CORE_DOCS.map(file => DELIVERABLES.find(d => d.file === file)));
// 第 4 步当前查看的文档：默认第一份还没确认的，用户点标签后以用户选择为准。
const docPick = ref('');
const activeDoc = computed(() => coreDocs.value.find(d => d.file === docPick.value)
  || coreDocs.value.find(d => !['confirmed', 'uploaded'].includes(docState(d.file).status)) || coreDocs.value[0]);
const docTone = file => ({ confirmed: 'ok', uploaded: 'ok', stale: 'warn', draft: 'draft' })[docState(file).status] || 'none';
const extraJobs = ['industry', 'background', 'prototype'].map(id => RESEARCH_JOBS[id]).filter(Boolean);
const EXTRA_DESC = { industry: '行业政策、术语、常见痛点和对标做法', background: '客户组织、现状、系统与已知诉求', prototype: '想先给客户看样子时使用，会标注未确认假设' };
const STEP_STATE = { done: '已完成', skipped: '已跳过', partial: '未全部确认', doing: '进行中', todo: '未开始' };
const STEP_THEME = { done: 'success', skipped: 'warning', partial: 'warning', doing: 'primary', todo: 'default' };
const SKIP_LABEL = { materials: '暂无资料，跳过', analysis: '跳过解析', interview: '暂不确认，继续' };
const FILE_ICON = { pdf: ['PDF', '#e5484d'], doc: ['W', '#2b6cee'], docx: ['W', '#2b6cee'], ppt: ['P', '#f08c00'], pptx: ['P', '#f08c00'], xls: ['X', '#18a058'], xlsx: ['X', '#18a058'], md: ['MD', '#334155'], txt: ['TXT', '#64748b'], png: ['IMG', '#8b5cf6'], jpg: ['IMG', '#8b5cf6'], jpeg: ['IMG', '#8b5cf6'] };
const fileBadge = type => FILE_ICON[type] || [String(type || '?').slice(0, 3).toUpperCase(), '#94a3b8'];
const REC_ICON = { industry: 'fa-solid fa-book-open', background: 'fa-solid fa-building', prototype: 'fa-solid fa-pen-ruler' };
const TAG_THEME = { grey: 'default', blue: 'primary', amber: 'warning', green: 'success', red: 'danger' };
const RUN_COLUMNS = [{ colKey: 'at', title: '时间', width: 130 }, { colKey: 'skill', title: 'Skill' }, { colKey: 'title', title: '成果' }, { colKey: 'status', title: '状态', width: 90 }];
const isPassed = s => s.status === 'done' || s.status === 'skipped' || s.status === 'partial';
const goNext = () => { view.value = Math.min(view.value + 1, flow.value.steps.length - 1); };

// 当前步骤唯一的主按钮：完成本步要做的事，做完后变成「下一步」。
const primary = computed(() => {
  const s = step.value;
  switch (s.id) {
    case 'goal': return { label: '保存，下一步', disabled: locked.value || !flow.value.goalReady, run: async () => { if (await persist()) goNext(); } };
    case 'materials': return materials.value.length || isPassed(s) ? { label: '下一步：AI 解析', disabled: locked.value, run: goNext } : null;
    case 'analysis': return ctx.value.analyzedAt || s.status === 'skipped' ? { label: '下一步：准备访谈', disabled: locked.value, run: goNext } : { label: materials.value.length ? `开始解析 ${materials.value.length} 份资料` : '直接解析（无资料）', busy: true, disabled: locked.value, run: () => run('intake') };
    case 'interview': {
      const missing = coreDocs.value.filter(d => !docState(d.file).versions.length);
      if (missing.length && !isPassed(s)) return { label: missing.length > 1 ? `依次生成 ${missing.length} 份文档` : `生成${missing[0].name}`, busy: true, disabled: locked.value, run: () => runSeq(missing.map(d => d.key)) };
      return { label: isPassed(s) ? '下一步：进入阶段二' : '确认全部文档，下一步', disabled: locked.value, run: async () => { if (!isPassed(s)) for (const d of coreDocs.value) if (docState(d.file).versions.length && !['confirmed', 'uploaded'].includes(docState(d.file).status)) await confirmDoc(d); goNext(); } };
    }
    case 'handoff': return { label: props.progressStage > 1 ? '更新交接记录' : '确认并进入阶段二', disabled: locked.value || !flow.value.goalReady || !ownerName.value.trim(), run: confirmAdvance };
  }
  return null;
});
async function skipStep() { (ctx.value.stage1.passed ||= {})[step.value.id] = true; if (await persist()) goNext(); }
async function runSeq(keys) { for (const key of keys) { await run(key); if (error.value) break; } }
const dimDetail = computed(() => {
  const id = dimEdit.value?.id; const of = list => (list || []).filter(x => x.dimension === id);
  return { known: of(ctx.value.facts.known), possible: of(ctx.value.facts.possible), open: of(openQuestions.value) };
});
function openDim(d) { dimEdit.value = d; dimDraft.value = ctx.value.dimensions[d.id]?.notes || ''; }
async function saveDimDraft() { const d = ctx.value.dimensions[dimEdit.value.id]; d.notes = dimDraft.value.trim(); if (d.notes && d.status === 'missing') d.status = 'partial'; dimEdit.value = null; await persist(); }
async function extractDim() { const title = dimEdit.value?.title; dimEdit.value = null; await run('intake', { focus: title }); }
const statusOf = id => DIMENSION_STATUS[ctx.value.dimensions[id]?.status] || DIMENSION_STATUS.missing;
const docState = file => deliverableState(ctx.value, file);
const fmt = at => at ? new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

async function reload() {
  loading.value = true; error.value = '';
    try { ctx.value = await service.load(props.meta || {}); if (!ctx.value.goal.text && !ctx.value.revision && props.meta?.requirement) ctx.value.goal.text = String(props.meta.requirement).slice(0, 300); await refreshMaterials(); await loadDocs(); if (ctx.value.stage1?.completion?.by) ownerName.value = ctx.value.stage1.completion.by; view.value = flow.value.current; }
  catch (e) { error.value = e.message; } finally { loading.value = false; }
  focusRequested();
}
// 外部（阶段二承接卡等）要求打开某份阶段一成果：跳到第 4 步并选中对应文档标签
function focusRequested() {
  const file = props.focusDoc?.file; if (!file || loading.value) return;
  const index = flow.value.steps.findIndex(s => s.id === 'interview');
  if (coreDocs.value.some(d => d.file === file) && index >= 0) { view.value = index; docPick.value = file; } else archiveOpen.value = true;
}
watch(() => props.focusDoc, focusRequested);
// 项目元信息异步到达时，仅给尚未填写的目标补入新建页需求。
watch(() => props.meta?.requirement, requirement => {
  if (requirement && !ctx.value.goal.text && !ctx.value.revision) ctx.value.goal.text = String(requirement).slice(0, 300);
});
async function refreshMaterials() { try { materials.value = await listProjectKnowledge(props.slug); } catch { materials.value = []; } }
async function loadDocs() {
  const next = {};
  for (const d of DELIVERABLES) next[d.file] = await service.read(d.file).catch(() => null);
  docText.value = next;
  // 文件在外部被修改时，把当前版本标为需复核，并提示下游受影响。
  let changed = false;
  for (const d of DELIVERABLES) {
    const latest = docState(d.file).latest; const text = next[d.file];
    if (latest && text !== null && latest.signature && fingerprint(text) !== latest.signature && latest.status !== 'stale') { latest.status = 'stale'; changed = true; }
  }
  if (changed) await persist();
}
async function persist() {
  try { ctx.value = await service.save(ctx.value, props.meta || {}); return true; }
  catch (e) { error.value = e.message; return false; }
}
const newQuestionDim = ref('');
const newQuestionOwner = ref('客户');
// 待确认问题按维度分组，空组不显示，未归类放最后
const questionGroups = computed(() => {
  const groups = [...DIMENSIONS.map(d => ({ id: d.id, title: d.title, icon: d.icon, items: [] })), { id: '', title: '未归类', icon: 'fa-solid fa-circle-question', items: [] }];
  for (const q of openQuestions.value) (groups.find(g => g.id && g.id === q.dimension) || groups[groups.length - 1]).items.push(q);
  return groups.filter(g => g.items.length);
});
const ownerLabel = o => /客户/.test(o || '') ? '问客户' : /FDE/i.test(o || '') ? 'FDE 自查' : '';
const ownerTheme = o => /客户/.test(o || '') ? 'cust' : /FDE/i.test(o || '') ? 'fde' : '';
async function addQuestion() { addQuestions(ctx.value, [{ question: newQuestion.value, owner: newQuestionOwner.value, dimension: newQuestionDim.value }], '手动添加'); newQuestion.value = ''; await persist(); }
const resolvedQuestions = computed(() => ctx.value.openQuestions.filter(q => q.status === 'resolved'));
const showResolved = ref(false);
async function resolveQuestion(q) { q.status = 'resolved'; q.resolvedAt = new Date().toISOString(); await persist(); }
async function reopenQuestion(q) { q.status = 'open'; delete q.resolvedAt; await persist(); if (!resolvedQuestions.value.length) showResolved.value = false; }

async function upload(files) {
  if (locked.value) return; error.value = '';
  try {
    const result = files?.length ? await api.uploadKnowledgeFromDrop(props.slug, files) : await api.uploadKnowledge(props.slug);
    if (result?.canceled) return;
    if (!result?.success) throw new Error(result?.error || '上传失败');
    await refreshMaterials();
    // 后续上传的新资料会提示已生成成果需要复核。
    const affected = DELIVERABLES.filter(d => docState(d.file).versions.length).map(d => d.name);
    if (affected.length) { ctx.value.impacts.push({ at: new Date().toISOString(), reason: `新增资料：${(result.files || []).join('、')}`, affected }); await persist(); }
  } catch (e) { error.value = e.message; }
}
function drop(event) { dropOver.value = false; const files = Array.from(event.dataTransfer?.files || []); if (files.length) upload(files); }

// 每个版本都存一份全文快照，用于查看和恢复。
async function recordVersion(file, entry) {
  const record = ctx.value.deliverables[file] ||= { versions: [] };
  const version = record.versions.length + 1;
  const text = file === ANALYSIS_FILE ? null : await service.read(file).catch(() => null);
  if (text !== null) { try { await service.write(snapshotPath(file, version), text); entry.snapshot = true; } catch { /* 快照失败不影响主流程 */ } }
  record.versions.push({ version, at: new Date().toISOString(), ...entry });
}
let startedHere = false;
async function run(jobId, { focus = '', section = '', revise = '' } = {}) {
  const job = RESEARCH_JOBS[jobId];
  if (!job || locked.value) return;
  startedHere = true; error.value = ''; busy.value = true; props.setBusy?.(true); running.value = job.title + (revise ? ' · 按意见修改' : '') + (section ? ` · ${section}` : '');
  const stamp = `${Date.now()}-${job.id}`, summaryFile = `.fde-flow/results/${stamp}.json`;
  const runRecord = { at: new Date().toISOString(), skill: job.skill, title: job.title, status: 'running', files: job.files };
  try {
    if (!await persist()) throw new Error('项目上下文保存失败');
    ctx.value.skillRuns.push(runRecord); await persist();
    await service.archive(job.files, stamp);
    const prompt = buildResearchPrompt({ job, ctx: ctx.value, materials: materials.value, summaryFile, focus, section, revise });
    await props.runJob({ stage: 1, task: { title: '行业调研' }, job, prompt });
    ctx.value = await service.load(props.meta || {});
    const last = ctx.value.skillRuns.at(-1) || runRecord;
    if (job.kind === 'analysis') {
      let analysis; try { analysis = JSON.parse(await service.read(ANALYSIS_FILE)); } catch { throw new Error('资料解析结果未完整写入，请重试。'); }
      ctx.value = mergeAnalysis(ctx.value, analysis); ctx.value.analyzedAt = new Date().toISOString();
      await recordVersion(ANALYSIS_FILE, { status: 'draft', source: 'skill', skill: job.skill, sources: materials.value.map(f => f.path), summary: analysis.summary || '' });
    } else {
      let summary = {}; try { summary = JSON.parse(await service.read(summaryFile) || '{}'); } catch { /* 摘要可选，成果文件为准 */ }
      for (const file of job.files) {
        const text = await service.read(file);
        if (!readableArtifact(text, file)) throw new Error(`尚未读到完整成果：${file}`);
        await recordVersion(file, { status: 'draft', source: revise ? 'revise' : 'skill', skill: job.skill, signature: fingerprint(text), sources: summary.sources || materials.value.map(f => f.path), summary: revise ? `按意见修改：${revise}` : summary.summary || '', section });
      }
      addQuestions(ctx.value, summary.questions, job.title);
    }
    Object.assign(ctx.value.skillRuns.at(-1) || last, { status: 'done', finishedAt: new Date().toISOString() });
    await persist(); await loadDocs();
  } catch (e) {
    error.value = e.message;
    const last = ctx.value.skillRuns.at(-1); if (last?.status === 'running') { last.status = 'failed'; last.error = e.message; await persist(); }
  } finally { busy.value = false; running.value = ''; props.setBusy?.(false); }
}


async function startEdit(d) { editing.value = d.file; editBuffer.value = docText.value[d.file] || ''; }
async function saveEdit(d) {
  error.value = '';
  try {
    await service.write(d.file, editBuffer.value, docText.value[d.file] ?? undefined);
    await recordVersion(d.file, { status: 'draft', source: 'manual', signature: fingerprint(editBuffer.value), summary: '用户手动编辑' });
    checks.value = { ...checks.value, [d.file]: null };
    editing.value = ''; await persist(); await loadDocs();
  } catch (e) { error.value = e.message; }
}
async function confirmDoc(d) {
  const latest = docState(d.file).latest; const text = docText.value[d.file];
  if (!latest || !text) return;
  latest.status = 'confirmed'; latest.confirmedAt = new Date().toISOString(); latest.signature = fingerprint(text);
  await persist();
}
async function unconfirmDoc(d) {
  const latest = docState(d.file).latest;
  if (!latest || latest.status !== 'confirmed') return;
  latest.status = 'draft'; delete latest.confirmedAt; delete latest.signature;
  await persist();
}
async function importDoc(d) {
  if (locked.value) return; error.value = '';
  try {
    const result = await api.uploadKnowledge(props.slug);
    if (result?.canceled || !result?.files?.length) return;
    if (!result.success) throw new Error(result.error || '导入失败');
    const source = `knowledge/${result.files[0]}`;
    const read = await api.readFile(props.slug, source);
    const isText = read?.success && /\.(md|txt|markdown)$/i.test(source);
    const text = isText ? String(read.content) : `# ${d.name}\n\n已导入外部版本：[${result.files[0]}](../${source})\n\n导入文件为非文本格式，原文保存在项目资料中，可在资料库中查看。后续 Skill 会读取该文件作为依据。\n`;
    await service.write(d.file, text, docText.value[d.file] ?? undefined);
    await recordVersion(d.file, { status: 'uploaded', source: 'upload', signature: fingerprint(text), sources: [source], summary: '用户导入已有版本', original: isText ? '' : source });
    await refreshMaterials(); await persist(); await loadDocs();
  } catch (e) { error.value = e.message; }
}

// 人工编辑或导入的版本被 AI 覆盖前，先在卡片上确认；旧版本已有快照，可随时恢复。
const humanMade = file => ['manual', 'upload', 'template', 'restore'].includes(docState(file).latest?.source);
function guardedRun(d, job, opts = {}) {
  if (humanMade(d.file) && panel.value[d.file] !== 'overwrite') { panel.value = { ...panel.value, [d.file]: 'overwrite' }; pendingRun[d.file] = opts; return; }
  panel.value = { ...panel.value, [d.file]: '' }; run(job.id, opts);
}
const pendingRun = {};
async function submitRevise(d, job) {
  const text = (reviseText.value[d.file] || '').trim(); if (!text) return;
  const section = sectionPick.value[d.file] || '';
  panel.value = { ...panel.value, [d.file]: '' }; reviseText.value = { ...reviseText.value, [d.file]: '' };
  await run(job.id, { revise: text, section });
}
async function useTemplate(d) {
  if (locked.value || !TEMPLATES[d.file]) return; error.value = '';
  try {
    const text = TEMPLATES[d.file]();
    await service.write(d.file, text, docText.value[d.file] ?? undefined);
    await recordVersion(d.file, { status: 'draft', source: 'template', signature: fingerprint(text), summary: '空白模板，待填写' });
    await persist(); await loadDocs(); startEdit(d);
  } catch (e) { error.value = e.message; }
}
async function tidyImported(d, job) {
  const original = docState(d.file).latest?.original; if (!original) return;
  await run(job.id, { revise: `以用户导入的原件 ${original} 为唯一依据，按本 Skill 的固定章节和表格整理成规范格式；原件没有的内容写为待确认，不补写推测。` });
}
async function restoreVersion(d, v) {
  if (locked.value) return; error.value = '';
  try {
    const text = await service.read(snapshotPath(d.file, v.version));
    if (text === null) throw new Error(`v${v.version} 没有存档，无法恢复`);
    await service.write(d.file, text, docText.value[d.file] ?? undefined);
    await recordVersion(d.file, { status: 'draft', source: 'restore', signature: fingerprint(text), summary: `从 v${v.version} 恢复` });
    panel.value = { ...panel.value, [d.file]: '' }; await persist(); await loadDocs();
  } catch (e) { error.value = e.message; }
}
function runCheck(d) {
  checks.value = { ...checks.value, [d.file]: checkDocument(d.file, docText.value[d.file]) };
  panel.value = { ...panel.value, [d.file]: 'check' };
}

async function confirmAdvance() {
  if (locked.value || !ownerName.value.trim()) return;
  if (!flow.value.goalReady) { error.value = '请先填写本阶段目标（至少 4 个字）。'; return; }
  busy.value = true; error.value = '';
  try {
    const outputs = DELIVERABLES.filter(d => docState(d.file).versions.length).map(d => ({ name: d.name, file: d.file, status: docState(d.file).label }));
    ctx.value.stage1.completion = { by: ownerName.value.trim(), at: new Date().toISOString(), mode: advice.value.mode, modeLabel: advice.value.title, assumptions: assumptions.value.trim(), skipped: flow.value.gaps.map(s => s.title), percent: done.value.percent, openQuestions: openQuestions.value.length };
    const body = handoffMarkdown(ctx.value, materials.value, outputs);
    const previous = await service.read(HANDOFF_FILE);
    await service.write(HANDOFF_FILE, body, previous ?? undefined);
    ctx.value.stage1.completion.signature = fingerprint(body);
    ctx.value.decisions.push({ at: ctx.value.stage1.completion.at, by: ctx.value.stage1.completion.by, decision: `阶段一完成，${advice.value.title}`, evidence: HANDOFF_FILE });
    if (!await persist()) throw new Error('确认未保存');

    await props.advance?.();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

function context() {
  return `当前在阶段一「行业调研」的「${step.value.title}」步骤（第 ${view.value + 1} 步，共 5 步）。项目上下文保存在 ${CONTEXT_FILE}。调研完成度 ${done.value.percent}%；${hints.value}请区分资料事实与行业推断，结论应能归入对应模块。`;
}

// Markdown 预览：```mermaid 代码块渲染成图，语法出错时保留源码。mermaid 按需加载，不进首屏包。
let mermaidReady = null, mermaidSeq = 0;
const loadMermaid = () => (mermaidReady ||= import('mermaid').then(m => { m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' }); return m.default; }));
const MdView = defineComponent({
  props: { text: String },
  setup(p) {
    const el = ref(null);
    async function draw() {
      const blocks = [...(el.value?.querySelectorAll('pre > code.language-mermaid') || [])];
      if (!blocks.length) return;
      const mermaid = await loadMermaid();
      for (const code of blocks) {
        const pre = code.parentElement;
        try { const { svg } = await mermaid.render(`s1-mmd-${++mermaidSeq}`, code.textContent); const fig = document.createElement('div'); fig.className = 'mmd'; fig.innerHTML = svg; pre.replaceWith(fig); }
        catch { pre.classList.add('mmd-error'); pre.title = '图表语法有误，显示源码'; }
      }
    }
    onMounted(draw); onUpdated(draw);
    return () => h('div', { ref: el, class: 'md', key: p.text, innerHTML: marked.parse(p.text) });
  },
});

// 放大查看与下载：放大是只读全屏阅读，可调字号；下载走系统另存为，Word 由 Markdown 转出（Mermaid 图在 Word 里保留为源码）。
const zoomDoc = ref(null), zoomScale = ref(1);
const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];
function openZoom(d) { zoomScale.value = 1; zoomDoc.value = d; }
function stepZoom(dir) { const i = ZOOM_STEPS.indexOf(zoomScale.value) + dir; if (i >= 0 && i < ZOOM_STEPS.length) zoomScale.value = ZOOM_STEPS[i]; }
async function downloadDoc(d, format) {
  error.value = '';
  try {
    let file = d.file;
    if (format === 'docx') {
      const conv = await api.mdToDocx(props.slug, d.file);
      if (!conv?.success) throw new Error(`转换 Word 失败：${conv?.error || '未知错误'}`);
      file = conv.relativePath;
    }
    const res = await api.saveFile(props.slug, file);
    if (res?.success) MessagePlugin.success(`已保存到 ${res.path}`);
    else if (!res?.canceled) throw new Error(res?.error || '保存失败');
  } catch (e) { error.value = e.message; }
}

// 每份成果四种处理方式：AI 生成/按意见修改、手动编辑、导入自己的、空白模板。版本可查看与恢复，可按规范检查。
const SOURCE_LABEL = { skill: 'AI 生成', revise: 'AI 按意见修改', manual: '手动编辑', upload: '用户导入', template: '空白模板', restore: '版本恢复' };
let previewTimer;
const previewBuffer = ref('');
watch(editBuffer, v => { clearTimeout(previewTimer); previewTimer = setTimeout(() => (previewBuffer.value = v), 400); });
const DocCard = defineComponent({
  props: { d: Object },
  setup(p) {
    return () => {
      const d = p.d, st = docState(d.file), text = docText.value[d.file], job = Object.values(RESEARCH_JOBS).find(j => j.files.includes(d.file));
      const sections = d.sections.length ? d.sections : markdownSections(text).slice(1);
      const btn = (label, onClick, extra = {}) => h('button', { onClick, disabled: locked.value, ...extra }, label);
      const open = panel.value[d.file] || '', isEditing = editing.value === d.file, hasDiagram = /```mermaid/.test(isEditing ? editBuffer.value : text || '');
      const sectionSelect = () => h('select', { value: sectionPick.value[d.file] || '', onChange: e => (sectionPick.value = { ...sectionPick.value, [d.file]: e.target.value }) }, [h('option', { value: '' }, '整份文档'), ...sections.map(s => h('option', { value: s }, s))]);

      const body = isEditing
        ? h('div', { class: ['edit-wrap', { split: hasDiagram }] }, [
          h('textarea', { class: 'editor', rows: 18, value: editBuffer.value, onInput: e => (editBuffer.value = e.target.value) }),
          hasDiagram ? h('div', { class: 'live' }, [h('div', { class: 'live-h' }, '实时预览'), h(MdView, { text: previewBuffer.value })]) : null,
        ])
        : text ? h(MdView, { text: text.slice(0, 20000) })
          : h('div', { class: 'empty' }, [
            h('p', { class: 'muted' }, '尚未生成。可以让 AI 先出初稿，也可以用自己做好的材料，或从规范模板开始写。'),
          ]);

      const actions = isEditing
        ? [btn('取消', () => (editing.value = '')), h('button', { class: 'primary sm', onClick: () => saveEdit(d) }, '保存修改')]
        : [
          // 左：生成与修改；右：确认。放大、下载在卡片右上角
          job ? h('button', { class: 'primary sm', disabled: locked.value, onClick: () => guardedRun(d, job) }, text ? '重新生成' : 'AI 生成') : null,
          text && job ? btn('AI 修改', () => setPanel(d.file, 'revise'), { class: { on: open === 'revise' }, title: '写意见，让 AI 只改提到的部分' }) : null,
          text && !d.file.endsWith('.html') ? btn('编辑', () => startEdit(d), { title: '手动修改正文' }) : null,
          btn('导入', () => importDoc(d), { title: text ? '用自己的文件替换当前内容，当前版本保留在历史里' : '用自己已有的文件' }),
          !text && TEMPLATES[d.file] ? btn('模板', () => useTemplate(d), { title: '从规范空白模板开始写' }) : null,
          text && TEMPLATES[d.file] ? btn('检查', () => runCheck(d), { disabled: false, class: { on: open === 'check' }, title: '按规范检查章节、编号和取数路径' }) : null,
          st.versions.length > 1 ? btn(`历史 ${st.versions.length}`, () => setPanel(d.file, 'history'), { disabled: false, class: { on: open === 'history' }, title: '查看或恢复以前的版本' }) : null,
          d.key === 'prototype' && docText.value['stage1/prototype-sketch/index.html'] !== null ? btn('打开草图', () => emit('open-file', { file: 'stage1/prototype-sketch/index.html', stage: 1, name: '探索原型草图' })) : null,
          h('span', { class: 'act-gap' }),
          text && st.status !== 'confirmed' ? h('button', { class: 'confirm', disabled: locked.value, onClick: () => confirmDoc(d) }, '确认') : null,
          st.status === 'confirmed' ? h('button', { class: 'unconfirm', disabled: locked.value, title: '退回草稿，可继续修改', onClick: () => unconfirmDoc(d) }, [h('i', { class: 'fa-solid fa-rotate-left' }), ' 取消确认']) : null,
        ];

      let extra = null;
      if (!isEditing && open === 'revise' && job) extra = h('div', { class: 'sub' }, [
        h('div', { class: 'sub-row' }, [h('b', '修改范围'), sectionSelect()]),
        h('textarea', { class: 'editor', rows: 3, placeholder: '写下要怎么改，例如：护士长排班这一步实际在 Excel 里做，不在 HIS；补上夜班交接节点。', value: reviseText.value[d.file] || '', onInput: e => (reviseText.value = { ...reviseText.value, [d.file]: e.target.value }) }),
        h('div', { class: 'sub-row' }, [h('span', { class: 'muted' }, '只改意见提到的部分，其余内容和编号保持不变；改完生成新版本，可回退。'),
          h('button', { class: 'primary sm', disabled: locked.value || !(reviseText.value[d.file] || '').trim(), onClick: () => submitRevise(d, job) }, '按意见修改')]),
      ]);
      if (!isEditing && open === 'overwrite' && job) extra = h('div', { class: 'sub warn' }, [
        h('p', `当前版本来自「${SOURCE_LABEL[st.latest?.source] || '人工'}」。重新生成会用 AI 结果替换它，当前版本会保存在历史版本里，可以恢复。`),
        h('div', { class: 'sub-row' }, [btn('取消', () => setPanel(d.file, '')), btn('改用「AI 修改」', () => setPanel(d.file, 'revise')), h('button', { class: 'primary sm', disabled: locked.value, onClick: () => guardedRun(d, job, pendingRun[d.file]) }, '仍然重新生成')]),
      ]);
      if (!isEditing && open === 'history') extra = h('div', { class: 'sub' }, [
        h('table', { class: 'vers' }, [h('tbody', [...st.versions].reverse().map(v => h('tr', [
          h('td', `v${v.version}`), h('td', fmt(v.at)), h('td', SOURCE_LABEL[v.source] || v.skill || ''), h('td', { class: 'sum' }, v.summary || ''),
          h('td', v.version === st.versions.length ? h('span', { class: 'muted' }, '当前') : v.snapshot ? btn('恢复此版', () => restoreVersion(d, v)) : h('span', { class: 'muted' }, '无存档')),
        ])))]),
      ]);
      if (!isEditing && open === 'check') {
        const list = checks.value[d.file] || [];
        extra = h('div', { class: ['sub', list.some(i => i.level === 'error') ? 'warn' : 'ok'] }, [
          list.length ? h('ul', { class: 'issues' }, list.map(i => h('li', { class: i.level }, [h('b', i.level === 'error' ? '必须改' : '建议改'), i.text])))
            : h('p', '符合规范：章节齐全，编号、词表和 SDR 取数路径没有发现问题。'),
          h('div', { class: 'sub-row' }, [h('span', { class: 'muted' }, '检查只读，不修改原文。'),
            list.length && job ? btn('让 AI 按检查结果修正', () => run(job.id, { revise: '按以下规范检查结果修正，只改有问题的地方：' + list.map(i => i.text).join('；') })) : null]),
        ]);
      }
      const original = st.latest?.source === 'upload' && st.latest.original;
      const tidy = !isEditing && original && job ? h('div', { class: 'sub ok' }, [
        h('p', `已保存原件 ${original.replace(/^knowledge\//, '')}。可以原样使用，也可以让 AI 依据原件整理成规范格式（不补写原件没有的内容）。`),
        h('div', { class: 'sub-row' }, [btn('按规范整理一份', () => tidyImported(d, job))]),
      ]) : null;

      return h('div', { class: 'doc' }, [
        h('div', { class: 'card-head' }, [h('h2', [h('i', { class: 'fa-regular fa-file-lines' }), d.name]), h('span', { class: ['s1-chip', { 草稿: 'blue', 已确认: 'green', 已导入: 'green', 需复核: 'amber' }[st.label] || 'grey'] }, `${st.label}${st.versions.length ? ` · v${st.versions.length}` : ''}`),
          st.latest ? h('small', { class: 'muted' }, `${fmt(st.latest.at)} · ${SOURCE_LABEL[st.latest.source] || st.latest.skill || ''}`) : null,
          text ? h('div', { class: 'head-tools' }, [
            d.file.endsWith('.md')
              ? h(resolveComponent('t-dropdown'), { options: [{ content: '下载 Markdown（.md）', value: 'md' }, { content: '下载 Word（.docx）', value: 'docx' }], trigger: 'click', onClick: item => downloadDoc(d, item.value) }, { default: () => h('button', { class: 'icon-btn', title: '下载', 'aria-label': '下载' }, [h('i', { class: 'fa-solid fa-download' })]) })
              : h('button', { class: 'icon-btn', title: '下载', 'aria-label': '下载', onClick: () => downloadDoc(d, 'md') }, [h('i', { class: 'fa-solid fa-download' })]),
            !d.file.endsWith('.html') ? h('button', { class: 'icon-btn', title: '放大查看', 'aria-label': '放大查看', onClick: () => openZoom(d) }, [h('i', { class: 'fa-solid fa-up-right-and-down-left-from-center' })]) : null,
          ]) : null]),
        st.latest?.sources?.length ? h('p', { class: 'src' }, `来源：${st.latest.sources.slice(0, 4).join('、')}`) : null,
        h('div', { class: 'row wrap actions' }, actions),
        extra, tidy, body,
      ]);
    };
  },
});

watch(() => props.slug, reload);
// 任务由上一次打开的工作台发起时（中途切走又回来），等它写完结果再重新读取
watch(() => props.workflowBusy, active => { if (active) return; if (!startedHere) reload(); startedHere = false; });
onMounted(reload);
defineExpose({ reload, context, refreshMaterials });
</script>

<style scoped>
/* 组件样式交给 TDesign，这里只负责左侧步骤栏 + 右侧当前步骤的布局。 */
.s1{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--td-bg-color-page,#f3f5f9);font-size:var(--td-font-size-body-medium)}
.muted{color:var(--td-text-color-placeholder);font-size:12px}.mb{margin-bottom:12px}.pad{padding:24px 0}.grow{flex:1}
.head{flex:none;display:flex;align-items:center;gap:16px;padding:14px 24px;background:var(--td-bg-color-container,#fff);border-bottom:1px solid var(--td-component-stroke)}
.head-main{flex:1;min-width:0}.head h1{margin:0;font-size:18px;font-weight:600;color:var(--td-text-color-primary)}
.head-meta{margin:4px 0 0;color:var(--td-text-color-secondary);font-size:12px}
.head-progress{flex:none;color:var(--td-text-color-secondary);font-size:13px}.head-progress strong{color:var(--td-brand-color);font-size:16px}
.s1-loading{padding:32px;justify-content:center;width:100%}
.body{flex:1;min-height:0;display:flex}
.rail{flex:none;width:200px;display:flex;flex-direction:column;padding:16px 12px;background:var(--td-bg-color-container,#fff);border-right:1px solid var(--td-component-stroke);overflow-y:auto}
.rail ol{list-style:none;margin:0;padding:0;position:relative}
.rail li{position:relative}
.rail li:not(:last-child)::after{content:'';position:absolute;left:23px;top:40px;bottom:-4px;width:1px;background:var(--td-component-stroke)}
.rail li.done:not(:last-child)::after{background:var(--td-success-color)}
.rail li button{width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:8px;border:0;border-radius:var(--td-radius-medium);background:transparent;text-align:left;cursor:pointer}
.rail li button:hover{background:var(--td-bg-color-container-hover)}
.rail li.on button{background:var(--td-brand-color-light)}
.dot{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;border:1px solid var(--td-component-border);color:var(--td-text-color-placeholder);background:#fff;position:relative;z-index:1}
.rail li.done .dot{background:var(--td-success-color);border-color:var(--td-success-color);color:#fff}
.rail li.skipped .dot,.rail li.partial .dot{background:var(--td-warning-color-light);border-color:var(--td-warning-color);color:var(--td-warning-color)}
.rail li.doing .dot,.rail li.on .dot{border-color:var(--td-brand-color);color:var(--td-brand-color)}
.rail li.on.todo .dot,.rail li.on.doing .dot{background:var(--td-brand-color);color:#fff}
.rail-txt{display:flex;flex-direction:column;min-width:0}.rail-txt strong{font-weight:500;color:var(--td-text-color-primary)}.rail-txt small{font-size:12px;color:var(--td-text-color-placeholder);margin-top:2px}
.rail li.on .rail-txt strong{color:var(--td-brand-color);font-weight:600}
.rail-foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--td-component-stroke);display:flex;flex-direction:column;gap:2px}
.rail-link{display:flex;align-items:center;gap:8px;padding:8px 10px;border:0;background:transparent;border-radius:var(--td-radius-medium);color:var(--td-text-color-secondary);font-size:13px;cursor:pointer;text-align:left}
.rail-link:hover{background:var(--td-bg-color-container-hover);color:var(--td-brand-color)}
.stage{flex:1;min-width:0;overflow-y:auto;padding:20px 24px 0}
.step-card{max-width:960px;margin:0 auto;border-radius:var(--td-radius-large)}
.job{max-width:960px;margin-left:auto;margin-right:auto;padding:12px 16px;border:1px solid var(--td-brand-color-focus,#bcd0ff);border-radius:var(--td-radius-large);background:var(--td-brand-color-light)}
.job-h{display:flex;align-items:center;gap:8px;color:var(--td-text-color-primary)}.job-h strong{font-weight:600;min-width:0}.job-time{font-size:12px;color:var(--td-text-color-secondary);white-space:nowrap}.job-stop{margin-left:auto;flex:none}
.job-steps{list-style:none;margin:8px 0 0;padding:0 0 0 24px;display:flex;flex-direction:column;gap:2px;font-size:12px;line-height:1.6;color:var(--td-text-color-secondary)}
.job-note{margin:6px 0 0 24px;font-size:12px;line-height:1.6;color:var(--td-text-color-placeholder)}
.step-head{margin-bottom:20px}
.eyebrow{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px;color:var(--td-text-color-secondary)}
.step-head h2{margin:0;font-size:20px;font-weight:600;color:var(--td-text-color-primary)}
.desc{margin:6px 0 0;color:var(--td-text-color-secondary);line-height:1.7}
.step-foot{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;margin:24px -24px -24px;box-shadow:0 -6px 12px -10px rgba(15,23,42,.18);padding:14px 24px;background:var(--td-bg-color-container,#fff);border-top:1px solid var(--td-component-stroke);border-radius:0 0 var(--td-radius-large) var(--td-radius-large)}
.drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:28px 12px;margin-bottom:12px;border:1px dashed var(--td-border-level-2-color);border-radius:var(--td-radius-medium);background:var(--td-bg-color-secondarycontainer);cursor:pointer;text-align:center}
.drop:hover,.drop.over{border-color:var(--td-brand-color)}.drop.disabled{opacity:.6;cursor:not-allowed}.drop i{font-size:22px;color:var(--td-brand-color)}.drop small{font-size:12px;color:var(--td-text-color-placeholder)}
.rows{list-style:none;margin:0;padding:0}.rows li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--td-component-stroke)}.rows li:last-child{border-bottom:0}
.row-main{flex:1;min-width:0}.row-title{font-weight:500;color:var(--td-text-color-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-desc{margin-top:2px;font-size:12px;color:var(--td-text-color-placeholder)}
.fbadge{flex:none;width:28px;height:32px;border-radius:4px;color:#fff;font-size:9px;font-weight:700;display:grid;place-items:center}
.rec-ic{flex:none;width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-size:14px;background:var(--td-brand-color-light);color:var(--td-brand-color)}
.col{height:100%;padding:12px;border-radius:var(--td-radius-medium);background:var(--td-bg-color-secondarycontainer)}
.col-h{display:flex;align-items:baseline;gap:6px;margin-bottom:8px;font-weight:600}.col-h small{font-weight:400;font-size:12px;color:var(--td-text-color-placeholder)}
.col.success .col-h{color:var(--td-success-color)}.col.primary .col-h{color:var(--td-brand-color)}.col.warning .col-h{color:var(--td-warning-color)}
.col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.col li{line-height:1.6;color:var(--td-text-color-primary)}.col li small{display:block;font-size:12px;color:var(--td-text-color-placeholder)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.facts .wide{grid-column:1/-1}.facts .facts-note{grid-column:1/-1;margin:0;font-size:12px}
.dd{display:flex;flex-direction:column;gap:14px;max-height:60vh;overflow:auto}
.dd-sum{padding:12px 14px;border-radius:8px;background:#f5f8ff}.dd-sum-h{display:flex;align-items:center;gap:8px;font-size:12px}.dd-sum p{margin:8px 0 0;font-size:14px;line-height:1.6;color:var(--td-text-color-primary)}.dd-sum small{display:block;margin-top:4px;font-size:12px;color:#64748b}
.dd-h{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:13px;font-weight:600;color:#334155}.dd-h i{font-size:12px;color:#94a3b8}.dd-h span{font-weight:400;color:#94a3b8}.dd-h.ok i{color:var(--td-success-color)}.dd-h.ai i{color:var(--td-brand-color)}.dd-h.warn i{color:var(--td-warning-color)}
.dd ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}.dd li{padding:6px 10px;border-radius:6px;background:#f8fafc;font-size:13px;line-height:1.5;color:var(--td-text-color-primary)}.dd li small{display:block;font-size:12px;color:#94a3b8}
.dd-none{margin:0;font-size:12px;color:#94a3b8}
.qbox{border:1px solid var(--td-component-stroke);border-radius:var(--td-radius-large);background:#fff;overflow:hidden}
.qbox-h{display:flex;align-items:baseline;gap:10px;padding:10px 14px;border-bottom:1px solid var(--td-component-stroke)}.qbox-h strong{font-size:15px;color:var(--td-text-color-primary)}.qbox-h .muted{font-size:12px}
.qbox-empty{margin:0;padding:16px;color:var(--td-text-color-placeholder)}
.qbox>.qsec{padding:4px 14px}.qcols{column-count:2;column-gap:0;padding:4px 0}.qgrp{break-inside:avoid;padding:6px 14px}
.qsec{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #eef2f6;font-size:12px;font-weight:600;color:#64748b}.qsec i{font-size:11px;color:#94a3b8}.qsec span{font-weight:400;color:#94a3b8}
.qrow{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px dashed #eef2f6;font-size:13px;color:var(--td-text-color-primary)}.qrow:hover{background:#fafbfc}
.qrow .qt{flex:1;min-width:0;line-height:1.5}.qrow.done{padding:5px 14px}.qrow.done .qt{color:#94a3b8;text-decoration:line-through}
.qo{flex:none;font-size:12px;padding:0 6px;border-radius:10px}.qo.cust{color:#c2410c;background:#fff4ea}.qo.fde{color:#1d4ed8;background:#eef4ff}
.qbtn{flex:none;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 6px;border:1px solid transparent;border-radius:4px;background:transparent;color:#64748b;font-size:12px;cursor:pointer;white-space:nowrap}.qbtn i{font-size:11px}.qrow:not(.done) .qbtn{opacity:0}.qrow:not(.done):hover .qbtn,.qrow .qbtn:focus-visible{opacity:1;border-color:var(--td-component-stroke)}.qbtn:hover{color:var(--td-success-color);border-color:var(--td-success-color)}.qrow.done .qbtn:hover{color:var(--td-brand-color);border-color:var(--td-brand-color)}
@media (max-width:900px){.qcols{column-count:1}}
.qadd{display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid #eef2f6;background:#fafbfc}
.q-groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px 24px;align-items:start}
.q-group-h{display:flex;align-items:center;gap:6px;padding-bottom:6px;margin-bottom:4px;border-bottom:1px solid var(--td-component-stroke);font-size:13px;font-weight:600;color:var(--td-text-color-primary)}.q-group-h i{font-size:12px;color:var(--td-text-color-placeholder)}.q-group-h span{margin-left:auto;font-weight:400;font-size:12px;color:var(--td-text-color-placeholder)}
.col li.q .qt small{display:block;margin-top:2px}.col li.q .qo{flex:none}.add-q{gap:8px;margin-top:12px}.resolved-toggle{margin-left:auto;font-size:12px;font-weight:400}.resolved-list{margin-top:12px;padding-top:8px;opacity:.75}.resolved-list .qt{text-decoration:line-through}
.col li.q{display:flex;align-items:flex-start;gap:8px}.col li.q .qt{flex:1;min-width:0}.col li.q .qa{flex:none;white-space:nowrap}.col li.none{color:var(--td-text-color-placeholder)}
.add-q{margin-top:10px}
.sub-h{display:flex;align-items:baseline;gap:8px;margin:8px 0 10px;font-weight:600;color:var(--td-text-color-primary)}
.dim{width:100%;height:100%;padding:12px;border:1px solid var(--td-component-stroke);border-radius:var(--td-radius-medium);background:#fff;text-align:left;cursor:pointer}
.dim:hover{border-color:var(--td-brand-color)}
.dim-top{display:flex;align-items:center;gap:6px}.dim-top strong{flex:1;font-weight:600;color:var(--td-text-color-primary)}
.dim-ic{font-size:14px;color:var(--td-text-color-placeholder)}.dim-ic.blue{color:var(--td-brand-color)}.dim-ic.green{color:var(--td-success-color)}.dim-ic.amber{color:var(--td-warning-color)}
.dim-desc{display:-webkit-box;margin-top:6px;font-size:12px;line-height:1.5;color:var(--td-text-color-placeholder);-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.doc-wrap{margin-bottom:16px}
.doc-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:12px}
.doc-tab{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;padding:9px 12px;border:1px solid #e7edf6;border-radius:10px;background:#fff;text-align:left;cursor:pointer;color:#334155}
.doc-tab:hover{border-color:#c9d6ec}.doc-tab.on{border-color:#1f6bff;box-shadow:inset 0 0 0 1px #1f6bff;background:#f5f8ff}
.doc-tab .n{font-size:11px;color:#94a3b8}.doc-tab .t{font-size:13px;font-weight:600;color:#0f172a;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc-tab .st{font-size:11px;padding:0 6px;border-radius:5px;background:#f1f5f9;color:#64748b}
.doc-tab.draft .st{background:#eaf1ff;color:#1f6bff}.doc-tab.ok .st{background:#e8f7ee;color:#16a34a}.doc-tab.warn .st{background:#fff5e5;color:#d97706}
@media (max-width:900px){.doc-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}}.extras{margin-top:4px}
.s1 :deep(.t-col){display:flex;flex-direction:column}
@media (max-width:900px){.rail{width:64px}.rail-txt,.rail-link span{display:none}.rail li:not(:last-child)::after{left:21px}}
</style>
<style>
/* 成果卡片由渲染函数生成，scoped 样式不作用于它，这里用 .s1 前缀限定范围。 */
.s1 .doc .card-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.s1 .doc h2{display:flex;gap:8px;align-items:center;margin:0;font-size:15px;font-weight:650;color:#0f172a}.s1 .doc h2 i{color:#1f6bff}
.s1 .doc .s1-chip{font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#64748b}
.s1 .doc .s1-chip.green{background:#e8f7ee;color:#16a34a}.s1 .doc .s1-chip.blue{background:#eaf1ff;color:#1f6bff}.s1 .doc .s1-chip.amber{background:#fff5e5;color:#d97706}
.s1 .doc .muted{color:#94a3b8;font-size:12px}.s1 .doc .src{font-size:11px;color:#94a3b8;margin:0 0 8px}
.s1 .doc .md{border:1px solid #f0f3f9;background:#fcfdff;border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.75;color:#334155}
.s1 .doc .row.actions{margin:0 0 12px}.s1 .doc .unconfirm{height:30px;padding:0 12px;border:1px solid var(--td-component-stroke);border-radius:8px;background:transparent;color:#64748b;font-size:13px;cursor:pointer}.s1 .doc .unconfirm:hover{color:var(--td-brand-color);border-color:var(--td-brand-color)}.s1 .doc .row .act-gap{flex:1;min-width:8px}.s1 .doc .head-tools{margin-left:auto;display:inline-flex;gap:4px}.s1 .doc .icon-btn{width:30px;height:30px;border:1px solid transparent;border-radius:8px;background:transparent;color:#64748b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.s1 .doc .icon-btn:hover{background:#f3f7ff;border-color:#dbe5f5;color:#1f6bff}.s1 .doc .row button.confirm{border-color:#16a34a;color:#15803d}.s1 .doc .row button.confirm:hover{background:#f0fdf4}
.s1-zoom-bar{display:flex;align-items:center;gap:8px;margin-bottom:10px}.s1-zoom-bar .grow{flex:1}
.s1-zoom-body .doc .md{border:0;background:transparent;font-size:calc(14px * var(--zoom,1));padding:20px 28px}
.s1-zoom-body .doc .md table{font-size:calc(13px * var(--zoom,1))}.s1-zoom-body .doc .md h1{font-size:calc(20px * var(--zoom,1))}.s1-zoom-body .doc .md h2{font-size:calc(16.5px * var(--zoom,1))}
.s1 .doc .md .mmd{overflow-x:auto;margin:8px 0;text-align:center}.s1 .doc .md .mmd svg{max-width:none;height:auto}.s1 .doc .md pre.mmd-error{border-left:3px solid #f59e0b;padding-left:8px}
.s1 .doc .md table{border-collapse:collapse;font-size:12px}.s1 .doc .md td,.s1 .doc .md th{border:1px solid #e7edf6;padding:5px 9px}.s1 .doc .md h1{font-size:17px}.s1 .doc .md h2{font-size:14.5px}
.s1 .doc .editor{width:100%;border:1px solid #e7edf6;border-radius:8px;padding:10px 12px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.s1 .doc .row{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}.s1 .doc .part{display:inline-flex;gap:6px;align-items:center}
.s1 .doc .row button,.s1 .doc select{height:30px;border:1px solid #e7edf6;border-radius:8px;padding:0 12px;font-size:12px;background:#fff;color:#334155}
.s1 .doc .row button:hover:not(:disabled){border-color:#c9d6ec;color:#1f6bff}
.s1 .doc .row button.primary{background:#1f6bff;border-color:#1f6bff;color:#fff;font-weight:600}.s1 .doc .row button:disabled{opacity:.5}
.s1 button{white-space:nowrap}
.s1 .doc .row button.on{border-color:#1f6bff;color:#1f6bff;background:#f3f7ff}
.s1 .doc .edit-wrap.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.s1 .doc .edit-wrap .live{min-width:0}.s1 .doc .live-h{font-size:11px;color:#94a3b8;margin-bottom:4px}.s1 .doc .edit-wrap.split .md{max-height:430px;overflow:auto}
.s1 .doc .sub{margin-top:10px;border:1px solid #e7edf6;border-radius:10px;padding:10px 12px;background:#f8fafd;font-size:12.5px;color:#334155;display:flex;flex-direction:column;gap:8px}
.s1 .doc .sub.warn{background:#fffaf0;border-color:#f5d9a8}.s1 .doc .sub.ok{background:#f4fbf6;border-color:#cdebd6}.s1 .doc .sub p{margin:0;line-height:1.6}
.s1 .doc .sub-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.s1 .doc .sub-row .muted{flex:1;min-width:160px}
.s1 .doc .sub button,.s1 .doc .sub select{height:28px;border:1px solid #e7edf6;border-radius:8px;padding:0 10px;font-size:12px;background:#fff;color:#334155}.s1 .doc .sub button.primary{background:#1f6bff;border-color:#1f6bff;color:#fff;font-weight:600}.s1 .doc .sub button:disabled{opacity:.5}
.s1 .doc .vers{width:100%;border-collapse:collapse}.s1 .doc .vers td{padding:5px 6px;border-bottom:1px solid #eef2f8;white-space:nowrap}.s1 .doc .vers td.sum{white-space:normal;color:#64748b;width:100%}
.s1 .doc .issues{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}.s1 .doc .issues li{display:flex;gap:8px}.s1 .doc .issues b{flex:none;font-size:11px;padding:1px 6px;border-radius:5px;background:#fde8e8;color:#c0392b}.s1 .doc .issues li.warn b{background:#fff1d6;color:#b45309}
</style>
