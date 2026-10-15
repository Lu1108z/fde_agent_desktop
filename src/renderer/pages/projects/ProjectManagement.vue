<template>
  <div class="management-page">
    <header class="page-heading">
      <div><div class="eyebrow">项目 / 项目管理 <span>导入试用版</span></div><h1>团队项目进度</h1><p>把飞书的项目进度带进工作台，关联到本地项目继续处理。</p></div>
      <div class="heading-actions"><button @click="openSource"><i class="fa-solid fa-arrow-up-right-from-square"></i>打开飞书</button><button class="primary" :disabled="busy" @click="chooseFile"><i class="fa-solid fa-plus"></i>{{ busy ? '读取中…' : '导入表格' }}</button></div>
    </header>
    <div v-if="error" class="notice error" role="alert">{{ error }} <button @click="load">重新加载</button></div>
    <div v-if="message" class="notice" role="status">{{ message }}</div>
    <div class="summary-grid">
      <div><span>导入项目</span><strong>{{ records.length }}</strong></div>
      <div><span>正在推进</span><strong>{{ activeCount }}</strong></div>
      <div><span>超过截止日期</span><strong class="orange">{{ overdueCount }}</strong></div>
      <div><span>已关联本地项目</span><strong class="green">{{ records.filter(r => r.linkedSlug && localBySlug[r.linkedSlug]).length }}</strong></div>
    </div>
    <section class="records-panel">
      <div class="records-heading"><div><h2>项目清单</h2><p v-if="snapshot.importedAt">{{ snapshot.source?.filename }} · {{ snapshot.source?.sheet }} · {{ formatTime(snapshot.importedAt) }} 导入</p><p v-else>支持 Excel (.xlsx)、CSV 和 TSV</p></div><button class="text-button" @click="saveTemplate">下载字段模板</button></div>
      <div class="filter-bar">
        <label class="search"><i class="fa-solid fa-magnifying-glass"></i><input v-model="search" placeholder="搜索项目、智能体、负责人…" aria-label="搜索项目" /></label>
        <UiSelect field v-model="stageFilter" aria-label="筛选阶段" :options="[{ value: '', label: '全部阶段' }, ...(MANAGEMENT_STAGES).map((name, i) => ({ value: String(i), label: String(name) })), { value: 'unknown', label: '未填写 / 未识别' }]" />
        <UiSelect field v-model="ownerFilter" aria-label="筛选负责人" :options="[{ value: '', label: '全部负责人' }, ...(owners).map((owner) => ({ value: String(owner), label: String(owner) }))]" />
        <button class="filter-toggle" :class="{ selected: overdueOnly }" @click="overdueOnly = !overdueOnly">只看逾期</button>
        <span class="result-count">{{ filtered.length }} 个项目</span>
      </div>
      <div v-if="loading" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><h3>正在加载项目进度…</h3></div>
      <div v-else-if="!records.length" class="empty-state"><div class="empty-symbol"><i class="fa-solid fa-table-list"></i></div><h3>先导入你的飞书项目进度表</h3><p>在飞书「医疗项目进度表」中导出 Excel，<br />在这里选择文件，确认字段后即可查看。</p><button class="primary" :disabled="busy" @click="chooseFile">选择 Excel / CSV 文件</button><small>数据保存在本机；更新进度时重新导入最新表格。</small></div>
      <div v-else-if="!filtered.length" class="empty-state"><h3>没有符合条件的项目</h3><button @click="clearFilters">清除筛选</button></div>
      <div v-else class="table-scroll"><table><thead><tr><th>项目 / 智能体</th><th>当前阶段</th><th>阶段进度</th><th>负责人</th><th>排期</th><th>本地项目</th></tr></thead><tbody>
        <tr v-for="record in filtered" :key="record.id" :class="{ 'row-selected': selected?.id === record.id }">
          <td><button class="project-name" @click="selectRecord(record)">{{ record.project }}<small>{{ record.agent || '未填写智能体' }}</small></button><span v-if="record.industry" class="industry">{{ record.industry }}</span></td>
          <td><span class="stage-badge" :class="{ muted: !record.stage }">{{ managementStageLabel(record) }}</span><small v-if="record.status" class="status-text">{{ record.status }}</small></td>
          <td><div class="progress-label">{{ record.progress === null ? '未填写' : `${record.progress}%` }}</div><div class="progress-track"><span :style="{ width: `${record.progress || 0}%` }"></span></div></td>
          <td>{{ record.owner || '未分配' }}</td>
          <td><div class="dates">{{ record.startDate || '开始未定' }}<span>至 {{ record.endDate || '结束未定' }}</span></div><small v-if="managementOverdue(record)" class="orange">已逾期</small></td>
          <td><router-link v-if="localBySlug[record.linkedSlug]" class="local-link" :to="`/projects/${record.linkedSlug}`">{{ localBySlug[record.linkedSlug].name }} <i class="fa-solid fa-arrow-up-right-from-square"></i></router-link><span v-else-if="record.linkedSlug" class="orange">关联项目已不存在</span><button class="text-button link-button" @click="selectRecord(record)">{{ record.linkedSlug ? '调整关联' : '关联项目' }}</button></td>
        </tr>
      </tbody></table></div>
      <footer v-if="records.length" class="table-footer">阶段进度来自导入表格；阶段进度 100% 不代表整个项目完成。关联后可打开本地交付物。</footer>
    </section>
    <details v-if="snapshot.warnings?.length || snapshot.skipped" class="import-warnings"><summary>导入说明 · {{ snapshot.warnings?.length || 0 }} 条提醒<span v-if="snapshot.skipped"> · 跳过 {{ snapshot.skipped }} 行空项目</span></summary><p v-for="(warning, i) in snapshot.warnings" :key="i">{{ warning }}</p></details>

    <div v-if="selected" class="overlay detail-overlay" @click.self="selected = null" @keydown.esc="selected = null">
      <section ref="detailDialog" class="detail-card" role="dialog" aria-modal="true" aria-labelledby="record-title" tabindex="-1">
        <header><div><span class="eyebrow">项目详情</span><h2 id="record-title">{{ selected.project }}</h2><p>{{ selected.agent || '未填写智能体' }}</p></div><button class="icon-button" aria-label="关闭项目详情" @click="selected = null"><i class="fa-solid fa-xmark"></i></button></header>
        <div class="detail-body"><div class="detail-stage"><span class="stage-badge">{{ managementStageLabel(selected) }}</span><strong>{{ selected.progress === null ? '进度未填写' : `${selected.progress}%` }}</strong></div><div class="progress-track"><span :style="{ width: `${selected.progress || 0}%` }"></span></div>
          <dl><dt>负责人</dt><dd>{{ selected.owner || '未分配' }}</dd><dt>开始时间</dt><dd>{{ selected.startDate || '未填写' }}</dd><dt>结束时间</dt><dd>{{ selected.endDate || '未填写' }}</dd><dt>项目状态</dt><dd>{{ selected.status || '未填写' }}</dd></dl>
          <div v-if="selected.action" class="next-action"><h3>下一步</h3><p>{{ selected.action }}</p></div>
          <section class="link-section"><h3>关联本地 FDE 项目</h3><p>将这一条进度关联到对应的本地项目，打开交付物继续处理。</p><label for="local-project">本地项目</label><UiSelect field id="local-project" v-model="linkSlug" :options="[{ value: '', label: '暂不关联' }, ...(localProjects).map((project) => ({ value: project.slug, label: String(project.name) }))]" /><small v-if="localProjectError" class="orange">{{ localProjectError }}</small><router-link v-if="!localProjects.length && !localProjectError" to="/projects/new">还没有本地项目？新建项目</router-link><button class="primary" :disabled="savingLink || !!localProjectError" @click="saveLink">{{ savingLink ? '保存中…' : '保存关联' }}</button><router-link v-if="selected.linkedSlug && localBySlug[selected.linkedSlug]" class="open-local" :to="`/projects/${selected.linkedSlug}`">打开本地项目 <i class="fa-solid fa-arrow-right"></i></router-link><small>飞书管理阶段与本地交付阶段分别保留。</small></section>
          <details class="original-fields"><summary>查看原始表格字段</summary><dl><template v-for="(value, key) in selected.original" :key="key"><dt>{{ key }}</dt><dd>{{ value || '—' }}</dd></template></dl></details>
          <p v-if="dialogError" class="notice error" role="alert">{{ dialogError }}</p>
        </div>
      </section>
    </div>

    <div v-if="preview" class="overlay" @click.self="!importing && (preview = null)" @keydown.esc="!importing && (preview = null)">
      <section ref="importDialog" class="import-card" role="dialog" aria-modal="true" aria-labelledby="import-title" tabindex="-1">
        <header><div><span class="eyebrow">Excel / CSV 导入</span><h2 id="import-title">确认导入字段</h2><p>{{ preview.filename }}</p></div><button class="icon-button" :disabled="importing" aria-label="关闭导入" @click="preview = null"><i class="fa-solid fa-xmark"></i></button></header>
        <div class="import-body"><label class="sheet-label">工作表<UiSelect field v-model="sheetIndex" :disabled="importing" :options="[...(preview.sheets).map((sheet, i) => ({ value: i, label: String(sheet.name) + ' · ' + String(sheet.count) + ' 行' }))]" /></label>
          <div class="mapping-grid"><label v-for="field in preview.fields" :key="field.key">{{ field.label }}<span v-if="field.key === 'project'" class="orange"> *</span><UiSelect field v-model="mapping[field.key]" :disabled="importing" :options="[{ value: -1, label: String(field.key === 'project' ? '请选择项目名称列' : '不导入此字段') }, ...(currentSheet.headers).map((header, i) => ({ value: i, label: String(header) }))]" /></label></div>
          <h3>前 {{ currentSheet.preview.length }} 行预览</h3><div class="preview-table"><table><thead><tr><th>项目</th><th>智能体</th><th>阶段</th><th>进度</th><th>负责人</th></tr></thead><tbody><tr v-for="(row, i) in currentSheet.preview" :key="i"><td v-for="key in ['project', 'agent', 'stage', 'progress', 'owner']" :key="key">{{ row[mapping[key]] || '—' }}</td></tr></tbody></table></div>
          <p class="notice">导入后将替换当前进度清单。唯一记录的本地项目关联会保留；只更新进度数据，不修改本地交付物。已导入内容会保存一份本机备份。</p><p v-if="dialogError" class="notice error" role="alert">{{ dialogError }}</p>
        </div><footer><button :disabled="importing" @click="preview = null">取消</button><button class="primary" :disabled="importing || mapping.project < 0" @click="commitImport">{{ importing ? '导入中…' : `导入 ${currentSheet.count} 行` }}</button></footer>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { MANAGEMENT_STAGES, managementStageLabel, managementCompleted, managementOverdue } from '@/data/managed-projects';
const route = useRoute();
const sourceUrl = 'https://wcn3xtaqzk2z.feishu.cn/base/QNnAbN7CKaHAowsD5OvcMlbQnie?table=tblRmvOhnaXoKYkL&view=vewqH5dplg';
const snapshot = ref({ records: [] });
const records = computed(() => snapshot.value.records || []);
const localProjects = ref([]), localProjectError = ref('');
const localBySlug = computed(() => Object.fromEntries(localProjects.value.map(p => [p.slug, p])));
const loading = ref(true), busy = ref(false), importing = ref(false), savingLink = ref(false);
const error = ref(''), message = ref(''), dialogError = ref('');
const search = ref(''), stageFilter = ref(''), ownerFilter = ref(''), overdueOnly = ref(false);
const selected = ref(null), linkSlug = ref(''), detailDialog = ref(null), importDialog = ref(null);
const preview = ref(null), sheetIndex = ref(0), mapping = ref({});
const currentSheet = computed(() => preview.value?.sheets[sheetIndex.value]);
const owners = computed(() => [...new Set(records.value.map(r => r.owner).filter(Boolean))].sort());
const activeCount = computed(() => records.value.filter(r => !managementCompleted(r) && r.stage > 0).length);
const overdueCount = computed(() => records.value.filter(managementOverdue).length);
const filtered = computed(() => records.value.filter(r =>
  (!search.value.trim() || [r.project, r.agent, r.owner, r.industry].join(' ').toLowerCase().includes(search.value.trim().toLowerCase())) &&
  (!stageFilter.value || (stageFilter.value === 'unknown' ? r.stage === null : r.stage === Number(stageFilter.value))) &&
  (!ownerFilter.value || r.owner === ownerFilter.value) && (!overdueOnly.value || managementOverdue(r))));
const formatTime = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function check(result) { if (!result?.success) throw new Error(result?.error || '项目管理服务未连接，请使用桌面客户端并重启一次'); return result; }
async function load() {
  loading.value = true; error.value = '';
  try { snapshot.value = check(await window.api?.management?.get?.()).data; }
  catch (e) { error.value = e.message; }
  finally { loading.value = false; }
  if (route.query.record && !selected.value) { const record = records.value.find(r => r.id === route.query.record); if (record) selectRecord(record); }
}
async function loadLocal() {
  try { const result = await window.api?.hermes?.listProjects?.({ kind: 'project' }); if (!Array.isArray(result)) throw new Error('本地项目暂未加载，请重试'); localProjects.value = result; localProjectError.value = ''; }
  catch (e) { localProjectError.value = e.message; }
}
async function chooseFile() {
  busy.value = true; error.value = ''; message.value = '';
  try { const result = check(await window.api?.management?.previewImport?.()); if (!result.canceled) { dialogError.value = ''; const preferred = result.sheets.findIndex(sheet => sheet.mapping.project >= 0 && sheet.mapping.stage >= 0); preview.value = result; sheetIndex.value = preferred >= 0 ? preferred : 0; mapping.value = { ...result.sheets[sheetIndex.value].mapping }; await nextTick(); importDialog.value?.focus(); } }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
watch(sheetIndex, value => { if (preview.value) mapping.value = { ...preview.value.sheets[value].mapping }; });
async function commitImport() {
  importing.value = true; dialogError.value = '';
  try { const result = check(await window.api.management.commitImport({ token: preview.value.token, sheetIndex: sheetIndex.value, mapping: { ...mapping.value } })); snapshot.value = result.data; preview.value = null; selected.value = null; clearFilters(); message.value = `已导入 ${result.data.records.length} 条项目进度${result.data.skipped ? `，跳过 ${result.data.skipped} 行空项目` : ''}。首页进度和待推进事项已更新。`; }
  catch (e) { dialogError.value = e.message; }
  finally { importing.value = false; }
}
async function selectRecord(record) { selected.value = record; linkSlug.value = record.linkedSlug || ''; dialogError.value = ''; await nextTick(); detailDialog.value?.focus(); }
async function saveLink() {
  savingLink.value = true; dialogError.value = '';
  try { const id = selected.value.id; snapshot.value = check(await window.api.management.link({ id, slug: linkSlug.value })).data; selected.value = records.value.find(r => r.id === id); message.value = linkSlug.value ? '已关联本地项目，可直接打开交付物。' : '已取消本地项目关联。'; }
  catch (e) { dialogError.value = e.message; }
  finally { savingLink.value = false; }
}
async function saveTemplate() { try { check(await window.api?.management?.template?.()); } catch (e) { error.value = e.message; } }
async function openSource() { try { await window.api?.shell?.openExternal?.(sourceUrl); } catch (e) { error.value = e.message; } }
function clearFilters() { search.value = ''; stageFilter.value = ''; ownerFilter.value = ''; overdueOnly.value = false; }
let stop;
onMounted(() => { load(); loadLocal(); stop = window.api?.management?.onChanged?.(load); });
onBeforeUnmount(() => stop?.());
watch(() => route.query.record, id => { const record = records.value.find(r => r.id === id); if (record) selectRecord(record); });
</script>

<style scoped>
.management-page{flex:1;min-height:0;overflow:auto;background:#f5f8fd;padding:28px 32px;color:#263653;font-size:13px}.page-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:22px}.eyebrow{color:#8493ad;font-size:12px}.eyebrow span{margin-left:12px;background:#eaf1ff;color:#3975da;padding:3px 8px;border-radius:5px}.page-heading h1{font-size:25px;letter-spacing:-.5px;margin:10px 0 6px;color:#182640}.page-heading p{color:#8391a8;margin:0;font-size:13px}.heading-actions{display:flex;gap:10px;flex-shrink:0}button,.ui-select,input{font:inherit}button{cursor:pointer;background:white;border:1px solid #dde6f4;border-radius:8px;color:#526987;padding:9px 13px;display:inline-flex;align-items:center;justify-content:center;gap:8px}button:hover{border-color:#a4bfee;color:#2465ea}button:disabled{cursor:default;opacity:.5}.primary{background:#2465ea;color:white;border-color:#2465ea}.primary:hover{background:#1d58d5;color:white}button:focus-visible,input:focus-visible,.ui-select:focus-visible,a:focus-visible{outline:2px solid #2465ea;outline-offset:3px}.ui-select,input{border:1px solid #dde6f4;border-radius:7px;background:white;padding:9px 10px;color:#435776;min-width:0}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}.summary-grid>div{border:1px solid #e3ebf7;border-radius:12px;background:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between}.summary-grid span{color:#7f8da4;font-size:12px}.summary-grid strong{font-size:24px;font-weight:600;color:#2465ea}.orange{color:#d68534!important}.green{color:#159b79!important}.records-panel{background:white;border:1px solid #e3ebf7;border-radius:13px;overflow:hidden}.records-heading{display:flex;justify-content:space-between;align-items:center;padding:20px 22px 15px}.records-heading h2{margin:0;font-size:16px}.records-heading p{margin:7px 0 0;font-size:11px;color:#96a3b9}.text-button{border:0;background:none;padding:4px 0;color:#2465ea;font-size:12px}.filter-bar{display:flex;align-items:center;gap:10px;padding:0 22px 18px;flex-wrap:wrap}.search{display:flex;align-items:center;flex:1;gap:10px;background:#f5f8fd;border-radius:8px;padding:0 12px;min-width:220px}.search i{color:#8da0bd}.search input{background:none;border:0;flex:1}.search input::placeholder{color:#a0aec3}.filter-bar .ui-select{font-size:12px}.filter-toggle{font-size:12px}.filter-toggle.selected{background:#fff6ed;border-color:#ffd4a4;color:#cd7a2b}.result-count{color:#98a5b9;font-size:11px}.table-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left;table-layout:fixed}th{background:#f5f8fc;color:#7a8ba5;font-size:11px;font-weight:500;padding:12px 16px}td{padding:17px 16px;border-bottom:1px solid #eef2f8;font-size:12px;vertical-align:middle;overflow-wrap:anywhere}th:first-child{width:28%;padding-left:22px}th:nth-child(2){width:17%}th:nth-child(3){width:12%}th:nth-child(4){width:10%}th:nth-child(5){width:14%}th:last-child{width:19%}tbody tr:hover,tbody tr.row-selected{background:#f8faff}.project-name{background:none;border:0;padding:0;display:block;text-align:left;color:#2e415f;font-size:13px;font-weight:600;line-height:1.6}.project-name small{display:block;font-weight:400;font-size:12px;color:#7c8da9;margin-top:4px}.industry{font-size:10px;color:#8ba0c0;margin-top:5px;display:inline-block}.stage-badge{color:#2465ea;background:#edf3ff;border-radius:6px;display:inline-block;font-size:11px;padding:5px 8px}.stage-badge.muted{color:#8593a9;background:#f0f3f8}.status-text{font-size:10px;color:#97a5b9;display:block;margin-top:6px}.progress-label{color:#69809f;font-size:12px;margin-bottom:8px}.progress-track{height:4px;background:#ebf0f8;border-radius:4px;overflow:hidden}.progress-track span{height:100%;display:block;background:#4380ef;border-radius:4px}.dates{font-size:11px;color:#7f90a9;line-height:1.8}.dates span{display:block}.local-link{color:#5a77a4;text-decoration:none;font-size:11px;line-height:1.7}.local-link i{font-size:9px}.link-button{display:block;margin-top:5px;font-size:11px}.table-footer{padding:14px 22px;font-size:11px;color:#96a4ba}.empty-state{padding:65px 20px;text-align:center;display:flex;align-items:center;flex-direction:column;gap:13px}.empty-symbol{width:58px;height:58px;border-radius:16px;background:#edf4ff;display:grid;place-items:center;color:#4380ef;font-size:25px}.empty-state h3{font-size:17px;margin:0;font-weight:600}.empty-state p{font-size:13px;line-height:1.9;color:#889ab5;margin:0}.empty-state small{font-size:11px;color:#a0aec2;margin-top:8px}.notice{padding:12px 14px;border:1px solid #dce8ff;border-radius:8px;background:#edf4ff;color:#5c7aa8;font-size:12px;line-height:1.8;margin:0 0 16px}.notice.error{background:#fff5f3;border-color:#ffd9d0;color:#b96751}.notice button{margin-left:10px;background:transparent;padding:2px 8px}.import-warnings{margin-top:15px;font-size:12px;color:#8a98ae}.import-warnings summary{cursor:pointer}.import-warnings p{margin:8px 0}.overlay{position:fixed;inset:0;z-index:1500;background:rgba(24,44,77,.25);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:26px}.import-card,.detail-card{background:white;border:1px solid #e5edf9;border-radius:16px;box-shadow:0 22px 80px #233c7033;max-height:90vh;display:flex;flex-direction:column;outline:none;width:min(860px,95vw)}.import-card>header,.detail-card>header{display:flex;justify-content:space-between;align-items:flex-start;padding:23px 26px;border-bottom:1px solid #edf1f8;gap:15px}.import-card h2,.detail-card h2{font-size:20px;color:#253653;margin:7px 0}.import-card header p,.detail-card header p{color:#93a2b7;font-size:12px;margin:0}.icon-button{width:30px;height:30px;border:0;padding:0;color:#8596ae;flex-shrink:0}.import-body,.detail-body{padding:22px 26px;overflow:auto}.sheet-label{display:flex;align-items:center;gap:15px}.sheet-label .ui-select{flex:1}.mapping-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:22px 0}.mapping-grid label{font-size:12px;color:#7b8ba4}.mapping-grid .ui-select{display:block;width:100%;margin-top:7px;font-size:12px}.import-body h3{font-size:13px;font-weight:500;margin:20px 0 10px}.preview-table{border:1px solid #e4ebf7;border-radius:8px;overflow:auto;margin-bottom:18px}.preview-table th,.preview-table td{width:20%!important;padding:10px;font-size:11px}.import-card>footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 26px;border-top:1px solid #edf1f8}.detail-overlay{justify-content:flex-end}.detail-card{width:min(480px,95vw);height:100%;max-height:100%;border-radius:14px}.detail-stage{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.detail-stage strong{font-size:14px;font-weight:500;color:#6281ad}dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:16px 10px;font-size:12px;margin:24px 0}dt{color:#95a2b6}dd{margin:0;color:#556986;overflow-wrap:anywhere}.link-section,.next-action{border-top:1px solid #eef2f8;padding:20px 0}.link-section h3,.next-action h3{font-size:14px;margin:0 0 10px}.link-section p,.next-action p{font-size:12px;color:#8293ae;line-height:1.8}.link-section label{display:block;color:#6c819f;font-size:12px;margin-bottom:8px}.link-section .ui-select{width:100%;margin-bottom:14px}.link-section small{display:block;font-size:11px;color:#96a5ba;margin-top:14px}.link-section .primary{width:100%}.open-local{display:block;text-align:center;padding:13px 0;color:#2465ea;text-decoration:none}.original-fields{color:#7f90ac;font-size:12px;padding:12px 0}.original-fields summary{cursor:pointer}.original-fields dl{line-height:1.7}.link-section>a:not(.open-local){display:block;margin:8px 0;color:#2465ea}
@media(max-width:1100px){.management-page{padding:22px}.summary-grid{gap:10px}.summary-grid>div{padding:14px}.page-heading{align-items:flex-start}.heading-actions{flex-direction:column}table{min-width:800px}.mapping-grid{grid-template-columns:repeat(2,1fr)}}
</style>
