<template>
  <!-- 宣传物料：每个智能体一个文件夹，放 PPT / 视频 / Word；在线预览，下载到本地 -->
  <div class="promo">
    <aside class="promo-side">
      <div class="side-h"><strong>智能体</strong><t-button size="small" variant="text" theme="primary" :disabled="busy" @click="openCreate"><template #icon><i class="fa-solid fa-plus"></i></template>新建</t-button></div>
      <t-input v-model="keyword" size="small" clearable placeholder="搜索智能体或物料" class="side-search"><template #prefix-icon><i class="fa-solid fa-magnifying-glass"></i></template></t-input>
      <nav class="agent-list" aria-label="智能体">
        <template v-for="group in agentGroups" :key="group.id">
           <button v-if="group.id === 'offline'" class="group-h" :aria-expanded="showOffline" @click="showOffline = !showOffline"><i class="fa-solid" :class="showOffline ? 'fa-chevron-down' : 'fa-chevron-right'"></i>推广结束<span>{{ group.agents.length }}</span></button>
          <template v-if="group.id !== 'offline' || showOffline">
            <button v-for="agent in group.agents" :key="agent.id" class="agent" :class="{ on: agent.id === agentId, offline: group.id === 'offline' }" @click="selectAgent(agent.id)">
              <span class="agent-cover"><img v-if="coverOf(agent.id)" :src="coverOf(agent.id)" alt="" /><i v-else class="fa-solid fa-robot"></i></span>
              <span class="agent-txt"><strong :title="agent.title">{{ agent.title }}</strong><small>{{ summary(agent.id) }}</small><em v-if="life(agent).status !== 'none'" class="life-pill" :class="life(agent).status">{{ life(agent).label }}</em></span>
            </button>
          </template>
        </template>
        <p v-if="!loading && !agents.length" class="side-empty">还没有智能体，点「新建」添加第一个</p>
        <p v-else-if="!loading && !visibleAgents.length" class="side-empty">没有匹配的智能体</p>
      </nav>
      <t-button variant="text" @click="trashOpen = true"><i class="fa-regular fa-trash-can"></i>物料回收站（{{ trashItems.length }}）</t-button>
    </aside>

    <main class="promo-main">
      <t-alert v-if="error" theme="error" :message="error" close class="mb" @close="error = ''" />
      <t-loading v-if="loading" text="正在读取宣传物料…" size="small" class="pad" />
      <!-- 预览单个物料：复用资料库阅读器（PPT/Word/视频/PDF 都能在线看），顶部给下载 -->
      <section v-else-if="previewing" class="viewer">
        <header class="viewer-h">
          <t-button variant="text" @click="previewing = null"><template #icon><i class="fa-solid fa-arrow-left"></i></template>返回{{ currentAgent?.title }}</t-button>
          <span class="viewer-title" :title="previewing.title"><span class="kind" :class="kindOf(previewing)">{{ KIND_LABEL[kindOf(previewing)] }}</span>{{ previewing.title }}</span>
          <t-button variant="outline" theme="danger" @click="removeItem(previewing)"><template #icon><i class="fa-regular fa-trash-can"></i></template>删除</t-button>
          <t-button theme="primary" @click="download(previewing)"><template #icon><i class="fa-solid fa-download"></i></template>下载到本地</t-button>
        </header>
        <LibraryDocument :key="previewing.id" :item="previewing" readonly class="viewer-body" />
      </section>
      <template v-else-if="currentAgent">
        <header class="main-h">
          <div class="main-h-txt"><span class="eyebrow">智能体宣传物料</span><h1>{{ currentAgent.title }}</h1><p>{{ counts(currentAgent.id).total ? `共 ${counts(currentAgent.id).total} 份 · 点封面在线预览，可下载到本地` : '还没有物料，上传 PPT、视频或 Word' }}</p></div>
          <div class="main-actions">
            <t-button variant="text" :disabled="busy" @click="renameAgent"><template #icon><i class="fa-regular fa-pen-to-square"></i></template>重命名</t-button>
            <t-button variant="text" theme="danger" :disabled="busy" @click="removeAgent"><template #icon><i class="fa-regular fa-trash-can"></i></template>删除智能体</t-button>
            <t-button theme="primary" :loading="busy" @click="upload"><template #icon><i class="fa-solid fa-arrow-up-from-bracket"></i></template>上传物料</t-button>
          </div>
        </header>
        <section class="life" :class="currentLife.status" aria-label="生命周期">
          <template v-if="currentLife.status === 'none'">
            <div class="life-txt"><strong>还没设置推广周期</strong><small>周期内（默认 {{ DEFAULT_MONTHS }} 个月）没有客户购买会移入「推广结束」，不影响实际服务运行。</small></div>
            <t-button theme="primary" variant="outline" @click="openLifecycle"><template #icon><i class="fa-regular fa-calendar"></i></template>设置生命周期</t-button>
          </template>
          <template v-else>
            <div class="life-txt">
              <strong><span class="life-pill" :class="currentLife.status">{{ STATUS_TEXT[currentLife.status] }}</span>{{ lifeHeadline }}</strong>
              <div class="life-track"><span :style="{ width: (currentLife.status === 'sold' ? 100 : currentLife.progress * 100) + '%' }"></span></div>
              <small>{{ fmt(currentLife.launchAt) }} 开始推广 · 周期 {{ currentLife.months }} 个月 · {{ currentLife.status === 'sold' ? '已有客户购买，长期推广' : `${fmt(currentLife.expiresAt)} 前没人购买则结束推广` }}（仅管理宣传物料）</small>
              <ul v-if="currentLife.purchases.length" class="buyers">
                <li v-for="p in currentLife.purchases" :key="p.id"><i class="fa-solid fa-hospital"></i>{{ p.customer }}<span>{{ fmt(p.date) }}</span><button aria-label="删除这条购买记录" title="删除这条购买记录" @click="removePurchase(p)"><i class="fa-solid fa-xmark"></i></button></li>
              </ul>
            </div>
            <div class="life-actions">
              <t-button v-if="currentLife.status === 'offline'" theme="primary" variant="outline" :disabled="busy" @click="relaunch"><template #icon><i class="fa-solid fa-rotate-right"></i></template>重新推广</t-button>
              <t-button variant="text" :disabled="busy" @click="openLifecycle">修改周期</t-button>
              <t-button theme="primary" :disabled="busy" @click="openPurchase"><template #icon><i class="fa-solid fa-plus"></i></template>登记购买</t-button>
            </div>
          </template>
        </section>
        <div class="filters" role="tablist">
          <button v-for="f in FILTERS" :key="f.id" role="tab" :aria-selected="filter === f.id" :class="{ on: filter === f.id }" @click="filter = f.id">{{ f.label }}<span>{{ f.id === 'all' ? counts(agentId).total : counts(agentId)[f.id] }}</span></button>
        </div>
        <div v-if="!visibleItems.length" class="drop-empty" role="button" tabindex="0" @click="q ? keyword = '' : upload()" @keydown.enter="q ? keyword = '' : upload()">
          <i class="fa-solid fa-photo-film"></i><strong>{{ q ? '没有匹配的物料，请调整搜索或筛选' : filter === 'all' ? '上传这个智能体的宣传物料' : `还没有${FILTERS.find(f => f.id === filter).label}` }}</strong><small>支持 PPT（pptx/ppt）、视频（mp4/mov/webm）、Word（docx/doc），也可放 PDF</small>
        </div>
        <div v-else class="grid">
          <article v-for="item in visibleItems" :key="item.id" class="card" :class="kindOf(item)">
            <button class="card-main" :title="`预览 ${item.title}`" @click="previewing = item">
              <span class="thumb" :class="{ loaded: thumbs[item.id] }">
                <img v-if="thumbs[item.id]" :src="thumbs[item.id]" alt="" loading="lazy" />
                <span v-else class="thumb-ph"><i :class="KIND_ICON[kindOf(item)]"></i></span>
                <span class="badge"><i :class="KIND_ICON[kindOf(item)]"></i>{{ KIND_LABEL[kindOf(item)] }}</span>
                <span v-if="kindOf(item) === 'video'" class="play"><i class="fa-solid fa-play"></i></span>
                <span class="hover-tip">{{ kindOf(item) === 'video' ? '播放' : kindOf(item) === 'ppt' ? '预览 · 可放映' : '在线预览' }}</span>
              </span>
              <span class="card-title">{{ baseName(item) }}</span>
            </button>
            <footer class="card-foot">
              <span class="card-meta">{{ (item.ext || '').toUpperCase() }} · {{ size(item.size) }}</span>
              <t-button size="small" variant="text" shape="square" aria-label="下载" title="下载到本地" @click="download(item)"><i class="fa-solid fa-download"></i></t-button>
              <t-dropdown :options="[{ content: '重命名', value: 'rename' }, { content: '删除', value: 'trash', theme: 'error' }]" @click="itemAction(item, $event.value)"><t-button size="small" variant="text" shape="square" aria-label="更多操作"><i class="fa-solid fa-ellipsis"></i></t-button></t-dropdown>
            </footer>
          </article>
        </div>
      </template>
      <div v-else-if="!loading" class="drop-empty big" role="button" tabindex="0" @click="q ? keyword = '' : openCreate()" @keydown.enter="q ? keyword = '' : openCreate()"><i class="fa-solid fa-robot"></i><strong>{{ q ? '没有搜索结果，点击清除搜索' : '先新建一个智能体' }}</strong><small>每个智能体单独存放自己的 PPT、视频和 Word</small></div>
    </main>

    <t-dialog v-model:visible="nameDialog.open" :header="nameDialog.id ? '重命名' : '新建智能体'" :confirm-btn="{ content: '保存', loading: busy }" @confirm="submitName">
      <t-input v-model="nameDialog.value" autofocus :placeholder="nameDialog.id ? '输入新名称' : '例如：智能排班助手'" @enter="submitName" />
    </t-dialog>
    <t-dialog v-model:visible="lifeDialog.open" header="设置生命周期" :confirm-btn="{ content: '保存', loading: busy }" @confirm="submitLifecycle">
      <t-form label-align="top" class="life-form">
        <t-form-item label="开始推广日期"><t-date-picker v-model="lifeDialog.launchAt" value-type="YYYY-MM-DD" style="width:100%" /></t-form-item>
        <t-form-item label="周期（月）"><t-input-number v-model="lifeDialog.months" :min="1" :max="60" theme="column" style="width:100%" /></t-form-item>
        <p v-if="lifeDialog.launchAt" class="life-hint">到 <b>{{ fmt(addMonths(lifeDialog.launchAt, lifeDialog.months || DEFAULT_MONTHS)) }}</b> 还没有客户购买，就移到「推广结束」，不影响实际服务。</p>
      </t-form>
    </t-dialog>
    <t-dialog v-model:visible="buyDialog.open" header="登记购买" :confirm-btn="{ content: '登记', loading: busy }" @confirm="submitPurchase">
      <t-form label-align="top" class="life-form">
        <t-form-item label="购买客户"><t-input v-model="buyDialog.customer" autofocus placeholder="例如：上海市第一人民医院" @enter="submitPurchase" /></t-form-item>
        <t-form-item label="购买日期"><t-date-picker v-model="buyDialog.date" value-type="YYYY-MM-DD" :disable-date="date => date > new Date()" style="width:100%" /></t-form-item>
      </t-form>
    </t-dialog>
    <t-dialog v-model:visible="trashOpen" header="物料回收站" :footer="false">
      <p v-if="!trashItems.length">回收站为空</p>
      <div v-for="item in trashItems" :key="item.id" class="trash-row">
        <span>{{ item.title }}{{ item.kind === 'folder' ? '（资料夹及其中物料）' : '' }}</span>
        <t-button size="small" :disabled="busy" @click="restoreItem(item)">恢复</t-button>
      </div>
    </t-dialog>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next';
import LibraryDocument from './LibraryDocument.vue';
import { lifecycleStatus, addMonths, today, DEFAULT_MONTHS } from '../../data/agent-lifecycle.mjs';
const SPACE = 'promo';
const KIND = { ppt: ['pptx', 'ppt', 'key', 'odp'], video: ['mp4', 'mov', 'webm', 'm4v', 'ogv', 'mkv', 'avi'], word: ['docx', 'doc', 'rtf', 'odt', 'pages'], pdf: ['pdf'] };
const KIND_LABEL = { ppt: 'PPT', video: '视频', word: 'Word', pdf: 'PDF', other: '附件' };
const KIND_ICON = { ppt: 'fa-solid fa-file-powerpoint', video: 'fa-solid fa-film', word: 'fa-solid fa-file-word', pdf: 'fa-solid fa-file-pdf', other: 'fa-regular fa-file' };
const FILTERS = [{ id: 'all', label: '全部' }, { id: 'ppt', label: 'PPT' }, { id: 'video', label: '视频' }, { id: 'word', label: 'Word' }, { id: 'pdf', label: 'PDF' }];
const UPLOAD_FILTERS = [{ name: '宣传物料（PPT / 视频 / Word / PDF）', extensions: [...KIND.ppt, ...KIND.video, ...KIND.word, ...KIND.pdf] }, { name: '所有文件', extensions: ['*'] }];
const api = window.api.library;
const entries = ref([]), loading = ref(true), busy = ref(false), error = ref(''), agentId = ref(''), filter = ref('all'), keyword = ref(''), previewing = ref(null);
const nameDialog = ref({ open: false, id: '', value: '' });
const trashOpen = ref(false);
const trashItems = computed(() => entries.value.filter(e => e.spaceId === SPACE && e.deletedAt && !entries.value.some(parent => parent.id === e.parentId && parent.deletedAt)));
async function restoreItem(item) {
  busy.value = true;
  try { await call(api.restore(item.id)); await refresh(); MessagePlugin.success('已恢复物料'); }
  catch (e) { MessagePlugin.error(e.message); } finally { busy.value = false; }
}
// 封面：主进程用系统缩略图生成并缓存，按需逐个取
const thumbs = ref({}); const requested = new Set();
async function loadThumbs(list) {
  for (const item of list) {
    if (requested.has(item.id) || !api.thumbnail) continue; requested.add(item.id);
    try { const r = await api.thumbnail(item.id); if (r?.success && r.url) thumbs.value = { ...thumbs.value, [item.id]: r.url }; } catch (_) { /* 没有封面就用图标 */ }
  }
}
const COVER_ORDER = ['ppt', 'pdf', 'video', 'word', 'other'];
// 物料列表固定顺序：先按类型（和上方筛选标签一致：PPT → 视频 → Word → PDF → 其他），同类按名称。
// 以前按修改时间排，改了哪个哪个就跑到前面，每个智能体的顺序都不一样。
const LIST_ORDER = ['ppt', 'video', 'word', 'pdf', 'other'];
function byKindThenName(a, b) {
  return (LIST_ORDER.indexOf(kindOf(a)) - LIST_ORDER.indexOf(kindOf(b))) || baseName(a).localeCompare(baseName(b), 'zh', { numeric: true });
}
function coverItem(id) { return [...itemsOf(id)].sort((a, b) => COVER_ORDER.indexOf(kindOf(a)) - COVER_ORDER.indexOf(kindOf(b)))[0]; }
function coverOf(id) { const item = coverItem(id); return item && thumbs.value[item.id]; }
const baseName = item => item.ext && item.title.toLowerCase().endsWith('.' + String(item.ext).toLowerCase()) ? item.title.slice(0, -item.ext.length - 1) : item.title;
const live = computed(() => entries.value.filter(e => e.spaceId === SPACE && !e.deletedAt));
const agents = computed(() => live.value.filter(e => e.kind === 'folder' && !e.parentId).sort((a, b) => a.title.localeCompare(b.title, 'zh')));
const currentAgent = computed(() => agents.value.find(a => a.id === agentId.value));
// 生命周期：已下线的智能体单独放在侧栏底部，默认收起
const STATUS_TEXT = { pending: '待推广', active: '推广中', expiring: '即将到期', sold: '已购买', offline: '推广结束' };
const currentDate = ref(today());
const refreshDate = () => { currentDate.value = today(); };
let dateTimer;
const life = agent => lifecycleStatus(agent?.lifecycle, currentDate.value);
const currentLife = computed(() => life(currentAgent.value));
const lifeHeadline = computed(() => ({ pending: `${fmt(currentLife.value.launchAt)} 开始推广`, active: `还剩 ${currentLife.value.daysLeft} 天`, expiring: `还剩 ${currentLife.value.daysLeft} 天，抓紧推广`, sold: `${currentLife.value.purchases.length} 家客户已购买`, offline: `${fmt(currentLife.value.expiresAt)} 到期，周期内没有客户购买` })[currentLife.value.status]);
const fmt = d => d ? d.replace(/^(\d{4})-0?(\d+)-0?(\d+)$/, '$1年$2月$3日') : '';
const showOffline = ref(false);
const agentGroups = computed(() => {
  const online = visibleAgents.value.filter(a => life(a).status !== 'offline'), offline = visibleAgents.value.filter(a => life(a).status === 'offline');
  return [{ id: 'online', agents: online }, ...(offline.length ? [{ id: 'offline', agents: offline }] : [])];
});
const kindOf = item => Object.keys(KIND).find(k => KIND[k].includes(String(item.ext || '').toLowerCase())) || 'other';
// 智能体文件夹下所有层级的文件都算它的物料
function itemsOf(id) {
  const ids = new Set([id]); let size = 0;
  while (size !== ids.size) { size = ids.size; live.value.filter(e => e.kind === 'folder' && ids.has(e.parentId)).forEach(e => ids.add(e.id)); }
  return live.value.filter(e => e.kind !== 'folder' && ids.has(e.parentId));
}
function counts(id) { const list = itemsOf(id); const c = { total: list.length, ppt: 0, video: 0, word: 0, pdf: 0 }; for (const item of list) { const k = kindOf(item); if (k in c) c[k]++; } return c; }
function summary(id) { const c = counts(id); return c.total ? [c.ppt && `PPT ${c.ppt}`, c.video && `视频 ${c.video}`, c.word && `Word ${c.word}`, c.pdf && `PDF ${c.pdf}`].filter(Boolean).join(' · ') || `${c.total} 份` : '暂无物料'; }
const q = computed(() => keyword.value.trim().toLowerCase());
const visibleAgents = computed(() => q.value ? agents.value.filter(a => a.title.toLowerCase().includes(q.value) || itemsOf(a.id).some(i => i.title.toLowerCase().includes(q.value))) : agents.value);
watch(visibleAgents, list => {
  if (!list.some(agent => agent.id === agentId.value)) selectAgent(list[0]?.id || '');
  if (q.value && list.some(agent => life(agent).status === 'offline')) showOffline.value = true;
});
const visibleItems = computed(() => itemsOf(agentId.value).filter(i => filter.value === 'all' || kindOf(i) === filter.value).filter(i => !q.value || i.title.toLowerCase().includes(q.value) || currentAgent.value?.title.toLowerCase().includes(q.value)).sort(byKindThenName));
const size = v => !v ? '—' : v > 1048576 ? `${(v / 1048576).toFixed(1)} MB` : `${Math.ceil(v / 1024)} KB`;
const date = v => v ? new Date(v).toLocaleDateString('zh-CN') : '';
async function call(promise) { const r = await promise; if (!r?.success) throw new Error(r?.error || '操作失败'); return r; }
const route = useRoute(), router = useRouter();
// 从工作台动态进来：?file=<id> 定位到所属智能体并直接预览这份物料
function openFromQuery() {
  const id = route.query.file ? String(route.query.file) : '';
  if (!id) return;
  router.replace({ path: route.path });
  const hit = live.value.find(e => e.id === id);
  if (!hit) { MessagePlugin.warning('这份物料已被删除或移动'); return; }
  // 动态里也有智能体/文件夹的操作（新建、改名、生命周期），点开就定位到所在智能体
  if (hit.kind === 'folder') {
    let cur = hit; while (cur?.parentId) cur = live.value.find(e => e.id === cur.parentId);
    if (cur && agents.value.some(a => a.id === cur.id)) agentId.value = cur.id;
    previewing.value = null; return;
  }
  const item = hit;
  const top = agents.value.find(a => itemsOf(a.id).some(i => i.id === id));
  if (top) agentId.value = top.id;
  previewing.value = item;
}
async function refresh() {
  try { const data = await call(api.list()); entries.value = data.entries || []; if (!currentAgent.value) agentId.value = agents.value[0]?.id || ''; openFromQuery(); }
  catch (e) { error.value = window.api?.library ? e.message : '请在 FDE 桌面窗口中使用宣传物料。'; }
  finally { loading.value = false; }
}
const lifeDialog = ref({ open: false, launchAt: '', months: DEFAULT_MONTHS }), buyDialog = ref({ open: false, customer: '', date: '' });
async function saveLifecycle(lifecycle, done) {
  busy.value = true;
  // 页面里的数据是 Vue 响应式对象，跨进程传不过去（An object could not be cloned），先转成普通数据
  try { await call(api.lifecycle(agentId.value, JSON.parse(JSON.stringify(lifecycle)))); await refresh(); MessagePlugin.success(done); return true; }
  catch (e) { MessagePlugin.error(e.message); return false; } finally { busy.value = false; }
}
function openLifecycle() { const l = currentAgent.value?.lifecycle; lifeDialog.value = { open: true, launchAt: l?.launchAt || today(), months: l?.months || DEFAULT_MONTHS }; }
async function submitLifecycle() {
  const { launchAt, months } = lifeDialog.value; if (!launchAt || busy.value) return;
  if (await saveLifecycle({ launchAt, months, purchases: currentAgent.value.lifecycle?.purchases || [] }, '生命周期已保存')) lifeDialog.value.open = false;
}
function openPurchase() { buyDialog.value = { open: true, customer: '', date: today() }; }
async function submitPurchase() {
  const { customer, date } = buyDialog.value; if (!customer.trim() || !date || busy.value) return;
  if (date > today()) { MessagePlugin.error('购买日期不能晚于今天'); return; }
  const l = currentAgent.value.lifecycle;
    if (await saveLifecycle({ ...l, purchases: [...(l.purchases || []), { customer: customer.trim(), date }] }, '已登记购买，保留长期推广')) buyDialog.value.open = false;
}
function removePurchase(p) {
  const l = currentAgent.value.lifecycle;
  const dialog = DialogPlugin.confirm({ header: '删除这条购买记录？', body: `「${p.customer}」的购买记录会被删除。没有购买记录后，到期就会结束推广。`, confirmBtn: { content: '删除', theme: 'danger' }, onConfirm: async () => { dialog.destroy(); await saveLifecycle({ ...l, purchases: l.purchases.filter(x => x.id !== p.id) }, '已删除购买记录'); } });
}
// 重新上线：从今天起重新算一个周期
function relaunch() { const l = currentAgent.value.lifecycle; saveLifecycle({ ...l, launchAt: today() }, `已重新推广，周期截至 ${fmt(addMonths(today(), l.months))}`); }
function selectAgent(id) { agentId.value = id; previewing.value = null; filter.value = 'all'; }
function openCreate() { nameDialog.value = { open: true, id: '', value: '' }; }
function renameAgent() { nameDialog.value = { open: true, id: agentId.value, value: currentAgent.value?.title || '' }; }
async function submitName() {
  const { id, value } = nameDialog.value; if (!value.trim() || busy.value) return;
  busy.value = true;
  try {
    if (id) await call(api.rename(id, value.trim()));
    else { const r = await call(api.create({ spaceId: SPACE, parentId: null, title: value.trim(), kind: 'folder', content: `<h1>${value.trim().replace(/[<>&]/g, '')}</h1><p>宣传物料</p>` })); agentId.value = r.entry.id; }
    nameDialog.value.open = false; await refresh();
  } catch (e) { MessagePlugin.error(e.message); } finally { busy.value = false; }
}
async function upload() {
  if (!agentId.value || busy.value) return;
  busy.value = true;
  try { const r = await call(api.upload({ spaceId: SPACE, parentId: agentId.value, filters: UPLOAD_FILTERS, dialogTitle: `上传「${currentAgent.value.title}」的宣传物料` })); if (!r.canceled) { await refresh(); MessagePlugin.success(`已上传 ${r.entries.length} 份物料`); } }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function download(item) {
  try { const r = await api.export(item.id); if (r?.canceled) return; if (!r?.success) throw new Error(r?.error || '下载失败'); MessagePlugin.success('已保存到本地'); }
  catch (e) { MessagePlugin.error(e.message); }
}
function itemAction(item, action) {
  if (action === 'rename') { nameDialog.value = { open: true, id: item.id, value: item.title }; return; }
  removeItem(item);
}
// 删除都进资料库回收站（资源 → 资料库 → 回收站 可恢复）
function confirmTrash(header, body, onDone) {
  const dialog = DialogPlugin.confirm({ header, body, confirmBtn: { content: '删除', theme: 'danger' }, onConfirm: async () => {
    dialog.destroy(); busy.value = true;
    try { await onDone(); await refresh(); MessagePlugin.success('已删除，可从左侧「物料回收站」恢复'); } catch (e) { MessagePlugin.error(e.message); } finally { busy.value = false; }
  } });
}
function removeItem(item) {
  confirmTrash('删除这份物料？', `「${item.title}」会移入资料库回收站，可以恢复。`, async () => { await call(api.trash(item.id)); if (previewing.value?.id === item.id) previewing.value = null; });
}
function removeAgent() {
  const agent = currentAgent.value; if (!agent) return;
  const n = itemsOf(agent.id).length;
  confirmTrash(`删除智能体「${agent.title}」？`, n ? `连同其中 ${n} 份物料一起移入资料库回收站，可以恢复。` : '这个智能体还没有物料，会移入资料库回收站。', async () => { await call(api.trash(agent.id)); agentId.value = ''; previewing.value = null; });
}
onMounted(() => { refresh(); dateTimer = setInterval(refreshDate, 30000); window.addEventListener('focus', refreshDate); });
onBeforeUnmount(() => { clearInterval(dateTimer); window.removeEventListener('focus', refreshDate); });
watch(() => [visibleItems.value.map(i => i.id).join(), agents.value.map(a => a.id).join()], () => { loadThumbs(visibleItems.value); loadThumbs(agents.value.map(a => coverItem(a.id)).filter(Boolean)); });
</script>
<style scoped>
.promo{flex:1;min-height:0;height:100%;display:flex;background:#f4f6fa;color:#1f2a3d;font-size:13px}
.trash-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #e8edf4}
.mb{margin-bottom:12px}.pad{padding:32px;width:100%;justify-content:center}
/* 侧栏 */
.promo-side{flex:none;width:264px;display:flex;flex-direction:column;padding:20px 14px 14px;background:#fff;border-right:1px solid #e8edf4}
.side-h{display:flex;align-items:center;justify-content:space-between;padding:0 6px 12px}.side-h strong{font-size:13px;font-weight:600;color:#56657c;letter-spacing:.04em}
.side-search{margin-bottom:12px}
.agent-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:4px}
.agent{display:flex;align-items:center;gap:11px;width:100%;padding:8px;border:0;border-radius:10px;background:transparent;text-align:left;cursor:pointer;transition:background .15s}
.agent:hover{background:#f3f6fb}.agent.on{background:#eaf1ff}
.agent-cover{flex:none;width:56px;height:35px;border-radius:6px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,#e7eefc,#d7e3fb);color:#7d97c9;font-size:13px;box-shadow:inset 0 0 0 1px rgba(20,40,80,.06)}
.agent-cover img{width:100%;height:100%;object-fit:cover}
.agent.on .agent-cover{box-shadow:0 0 0 2px #2965e9}
.agent-txt{display:flex;flex-direction:column;min-width:0;gap:3px}
.agent-txt strong{font-weight:500;font-size:13px;line-height:1.4;color:#2a3850;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.agent.on .agent-txt strong{color:#1d56d8;font-weight:600}
.agent-txt small{font-size:11px;color:#97a3b6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.group-h{display:flex;align-items:center;gap:7px;margin-top:10px;padding:10px 8px 6px;border:0;border-top:1px solid #eef1f6;background:transparent;font-size:12px;font-weight:600;color:#8792a5;cursor:pointer;text-align:left}
.group-h i{font-size:10px;width:10px}.group-h span{margin-left:auto;font-weight:400;color:#a7b1c1;font-variant-numeric:tabular-nums}
.agent.offline .agent-cover{filter:grayscale(1);opacity:.6}.agent.offline .agent-txt strong{color:#8792a5}
.life-pill{align-self:flex-start;display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-style:normal;font-weight:500;line-height:18px;white-space:nowrap}
.life-pill.pending{background:#eef1f6;color:#64748b}.life-pill.active{background:#e6f4ee;color:#16794a}.life-pill.expiring{background:#fff3e2;color:#b35a00}.life-pill.sold{background:#e9f0ff;color:#1d56d8}.life-pill.offline{background:#f0f1f4;color:#7b8494}
.side-empty{padding:16px 8px;font-size:12px;color:#97a3b6;line-height:1.6}
/* 主区 */
.promo-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow-y:auto;padding:28px 36px 40px}
.main-h{display:flex;align-items:flex-end;gap:16px;margin-bottom:20px}.main-h-txt{flex:1;min-width:0}
.eyebrow{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;color:#2965e9;margin-bottom:6px}
.main-h h1{margin:0;font-size:22px;font-weight:600;line-height:1.35;color:#16213a;text-wrap:balance}
.main-h p{margin:6px 0 0;font-size:12px;color:#8492a8}
.main-actions{display:flex;align-items:center;gap:4px;flex:none}
.main-actions :deep(.t-button--theme-primary){margin-left:8px}
.life{display:flex;align-items:flex-start;gap:20px;margin-bottom:20px;padding:16px 18px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(15,23,42,.06);border-left:3px solid #c9d3e2}
.life.active{border-left-color:#22a06b}.life.expiring{border-left-color:#f59e0b;background:#fffcf6}.life.sold{border-left-color:#2965e9}.life.offline{border-left-color:#9aa3b2;background:#fafbfc}.life.none{align-items:center;border-left-color:#c9d3e2}
.life-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.life-txt strong{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#1f2a3d}
.life-txt small{font-size:12px;color:#8492a8;line-height:1.6}
.life-track{height:6px;max-width:520px;border-radius:999px;background:#edf1f6;overflow:hidden}
.life-track span{display:block;height:100%;border-radius:inherit;background:#22a06b;transition:width .3s}
.life.expiring .life-track span{background:#f59e0b}.life.sold .life-track span{background:#2965e9}.life.offline .life-track span{background:#a8b0bd}.life.pending .life-track span{background:#c9d3e2}
.buyers{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 0;padding:0;list-style:none}
.buyers li{display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 10px;border-radius:999px;background:#eef3ff;color:#1d56d8;font-size:12px}
.buyers li span{color:#7d93c4;font-variant-numeric:tabular-nums}
.buyers button{width:18px;height:18px;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:#7d93c4;font-size:10px;cursor:pointer}.buyers button:hover{background:#dbe5ff;color:#c9302c}
.life-actions{flex:none;display:flex;align-items:center;gap:4px}
.life-form{display:flex;flex-direction:column;gap:4px}.life-hint{margin:4px 0 0;font-size:12px;color:#64748b}
.filters{display:flex;gap:4px;margin-bottom:20px;padding:3px;background:#e9eef5;border-radius:9px;align-self:flex-start}
.filters button{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border:0;border-radius:7px;background:transparent;font-size:13px;color:#5d6b82;cursor:pointer;transition:background .15s,color .15s}
.filters button span{font-size:11px;color:#9aa6b8;font-variant-numeric:tabular-nums}
.filters button:hover{color:#1f2a3d}
.filters button.on{background:#fff;color:#16213a;font-weight:500;box-shadow:0 1px 2px rgba(15,23,42,.08)}.filters button.on span{color:#2965e9}
/* 卡片 */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:20px}
.card{display:flex;flex-direction:column;min-width:0;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.05),0 0 0 1px rgba(15,23,42,.05);transition:box-shadow .2s,transform .2s}
.card:hover{transform:translateY(-2px);box-shadow:0 12px 28px -12px rgba(15,35,80,.28),0 0 0 1px rgba(41,101,233,.18)}
.card-main{flex:1;display:flex;flex-direction:column;padding:0;border:0;background:transparent;text-align:left;cursor:pointer;min-width:0}
.thumb{position:relative;display:block;aspect-ratio:16/10;overflow:hidden;background:#eef2f8}
.thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s}
.card.word .thumb img{object-fit:cover;object-position:top}
.card:hover .thumb img{transform:scale(1.03)}
.thumb-ph{position:absolute;inset:0;display:grid;place-items:center;font-size:36px}
.card.ppt .thumb-ph{background:linear-gradient(135deg,#fff4ec,#ffe3d1);color:#e0662b}
.card.video .thumb-ph{background:linear-gradient(135deg,#eef0ff,#dde1ff);color:#5b5bd6}
.card.word .thumb-ph{background:linear-gradient(135deg,#edf4ff,#d9e7ff);color:#2f6fe0}
.card.pdf .thumb-ph{background:linear-gradient(135deg,#fff0f0,#ffdede);color:#d6453d}
.card.other .thumb-ph{background:linear-gradient(135deg,#f3f5f8,#e5e9ef);color:#7b879a}
.badge{position:absolute;left:10px;top:10px;display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;backdrop-filter:blur(4px)}
.card.ppt .badge{background:rgba(214,84,22,.88)}.card.video .badge{background:rgba(79,70,229,.88)}.card.word .badge{background:rgba(31,95,214,.88)}.card.pdf .badge{background:rgba(201,48,44,.88)}.card.other .badge{background:rgba(100,116,139,.88)}
.play{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;display:grid;place-items:center;background:rgba(15,23,42,.55);color:#fff;font-size:15px;padding-left:3px;box-shadow:0 0 0 4px rgba(255,255,255,.25);transition:transform .2s,background .2s}
.card:hover .play{transform:scale(1.08);background:rgba(41,101,233,.9)}
.hover-tip{position:absolute;inset:auto 0 0;padding:18px 12px 9px;font-size:12px;color:#fff;background:linear-gradient(transparent,rgba(10,20,40,.6));opacity:0;transition:opacity .2s}
.card:hover .hover-tip{opacity:1}
.card-title{padding:12px 14px 0;font-size:14px;font-weight:500;line-height:1.5;color:#1f2a3d;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-foot{display:flex;align-items:center;gap:0;margin-top:auto;padding:4px 6px 8px 14px}
.card-meta{flex:1;min-width:0;font-size:11px;color:#97a3b6;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.card-foot :deep(.t-button){color:#8592a6}.card-foot :deep(.t-button:hover){color:#2965e9}
.drop-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:56px 24px;border:1.5px dashed #d3dbe7;border-radius:14px;background:#fff;color:#56657c;cursor:pointer;text-align:center;transition:border-color .15s,color .15s}
.drop-empty:hover{border-color:#2965e9;color:#2965e9}.drop-empty i{font-size:30px;color:#a9b5c7}.drop-empty small{font-size:12px;color:#97a3b6}
.drop-empty.big{margin:auto;max-width:420px;width:100%}
/* 预览 */
.viewer{flex:1;min-height:0;display:flex;flex-direction:column;margin:-28px -36px -40px;background:#fff}
.viewer-h{flex:none;display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #e8edf4}
.viewer-title{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kind{flex:none;font-size:11px;font-weight:600;padding:2px 7px;border-radius:5px;color:#fff}.kind.ppt{background:#d65416}.kind.video{background:#4f46e5}.kind.word{background:#1f5fd6}.kind.pdf{background:#c9302c}.kind.other{background:#64748b}
.viewer-body{flex:1;min-height:0}
@media (max-width:900px){.promo-side{width:210px}.agent-cover{width:44px;height:28px}.promo-main{padding:20px}}
</style>
