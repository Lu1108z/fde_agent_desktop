<template>
  <div class="session-list w-[224px] shrink-0 border-r border-slate-200/60 flex flex-col">
    <div class="shrink-0 px-4 py-3 border-b border-slate-100">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-medium text-slate-500">{{ projectMode ? '项目对话' : coachMode ? '教练陪练' : '智能对话' }}</span>
        <button aria-label="收起对话列表" class="session-close" @click="$emit('close')"><i class="fa-solid fa-chevron-left"></i></button>
      </div>
      <button :disabled="!!busySlug" @click="$emit('new-chat')" class="session-new-chat"><i class="fa-solid fa-plus"></i>{{ coachMode ? '开始新陪练' : '开启新对话' }}</button>
    </div>
    <div class="px-3 py-2">
      <div class="session-search"><i class="fa-solid fa-magnifying-glass"></i><input v-model="searchQuery" :placeholder="coachMode ? '搜索陪练记录' : '搜索对话'" :aria-label="coachMode ? '搜索陪练记录' : '搜索对话'" /></div>
    </div>
    <div class="flex-1 overflow-y-auto px-2 pb-2">
      <div v-for="project in filteredProjects" :key="project.slug" class="session-row" :class="{ 'session-selected': project.slug === currentSlug, 'session-menu-open': menuProject?.slug === project.slug }" @contextmenu.prevent="openMenu(project, $event)">
        <button class="session-row-main" :disabled="!!busySlug && busySlug !== project.slug" @click="$emit('select', project.slug)" :title="project.name">
          <i :class="coachMode ? 'fa-solid fa-headset' : project.aiApp ? 'fa-solid fa-' + (project.aiApp.icon || 'robot') : project.conversationKind === 'project' ? 'fa-solid fa-diagram-project' : 'fa-regular fa-comment'"></i>
          <span class="session-row-copy"><span>{{ project.name }}</span><small v-if="project.parentProjectSlug"><i class="fa-regular fa-folder"></i>{{ projectName(project.parentProjectSlug) }}</small></span>
          <i v-if="project.conversationPinnedAt" class="session-pin fa-solid fa-thumbtack" aria-label="已置顶"></i>
          <small v-else class="session-date">{{ formatDate(project.lastMessageAt || project.updatedAt || project.createdAt) }}</small>
        </button>
        <button class="session-more" :aria-label="`更多操作：${project.name}`" aria-haspopup="menu" :aria-expanded="menuProject?.slug === project.slug" @click.stop="openMenu(project, $event)"><i class="fa-solid fa-ellipsis"></i></button>
      </div>
      <p v-if="filteredProjects.length === 0 && searchQuery" class="session-empty">没有找到相关对话</p>
    </div>

    <Teleport to="body">
      <div v-if="menuProject" ref="menuElement" class="session-menu" :style="menuStyle" role="menu" aria-label="对话操作" @keydown="menuKeys" @keydown.esc.stop.prevent="closeMenu(true)">
        <button role="menuitem" :disabled="rowBusy" @click="openDialog('rename')"><i class="fa-regular fa-pen-to-square"></i>重命名</button>
        <button role="menuitem" @click="togglePin"><i class="fa-solid fa-thumbtack"></i>{{ menuProject.conversationPinnedAt ? '取消置顶' : '置顶' }}</button>
        <div class="session-menu-divider"></div>
        <button role="menuitem" @click="openDialog('share')"><i class="fa-solid fa-arrow-up-from-bracket"></i>分享</button>
        <div class="session-menu-divider"></div>
        <button role="menuitem" class="session-delete" :disabled="rowBusy" @click="deleteConversation"><i class="fa-regular fa-trash-can"></i>删除</button>
        <p v-if="rowBusy" class="session-menu-hint">停止回复后可重命名或删除</p>
      </div>

      <div v-if="dialogKind" class="session-dialog-overlay" @click.self="closeDialog" @keydown.esc.stop.prevent="closeDialog" @keydown.tab="trapDialogFocus">
        <form class="session-dialog" role="dialog" aria-modal="true" aria-labelledby="session-dialog-title" @submit.prevent="submitDialog">
          <div class="session-dialog-heading"><h2 id="session-dialog-title">{{ dialogKind === 'rename' ? '重命名对话' : dialogKind === 'move' ? '移至项目' : '分享对话' }}</h2><button type="button" aria-label="关闭" :disabled="working" @click="closeDialog"><i class="fa-solid fa-xmark"></i></button></div>
          <template v-if="dialogKind === 'rename'">
            <label for="session-name">对话名称</label>
            <input id="session-name" ref="nameInput" v-model="renameValue" maxlength="100" autocomplete="off" :disabled="working" />
          </template>
          <template v-else-if="dialogKind === 'move'">
            <p class="session-dialog-description">{{ dialogProject?.name }}</p>
            <label for="session-project">选择项目</label>
            <UiSelect id="session-project" field v-model="moveValue" :options="moveOptions" :max-visible="6" :disabled="working" />
            <p class="session-dialog-description">移入后，可从项目的“项目对话”中继续打开。</p>
          </template>
          <template v-else>
            <p class="session-dialog-description">复制或导出当前对话，包含提问与回答。</p>
            <div v-if="working && !shareContent" class="session-empty">正在读取对话…</div>
            <textarea v-else readonly :value="shareContent" aria-label="对话分享内容" class="session-share-preview"></textarea>
          </template>
          <p v-if="dialogError" class="session-dialog-error" role="alert">{{ dialogError }}</p>
          <div class="session-dialog-actions">
            <template v-if="dialogKind === 'share'">
              <button type="button" :disabled="working || !shareContent" @click="downloadShare">导出 Markdown</button>
              <button type="button" class="session-primary" :disabled="working || !shareContent" @click="copyShare">{{ copied ? '已复制' : '复制全文' }}</button>
            </template>
            <template v-else>
              <button type="button" :disabled="working" @click="closeDialog">取消</button>
              <button type="submit" class="session-primary" :disabled="working || (dialogKind === 'rename' && !renameValue.trim())">{{ working ? '保存中…' : '确定' }}</button>
            </template>
          </div>
        </form>
      </div>
      <div v-if="notice" class="session-notice" role="status"><span>{{ notice }}</span><button v-if="undoSlug" :disabled="working" @click="undoDelete">撤销</button><button aria-label="关闭提示" @click="clearNotice"><i class="fa-solid fa-xmark"></i></button></div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { createConversationActions } from '../../data/conversation-actions';
const props = defineProps({ coachMode: Boolean, projectMode: Boolean, projects: { type: Array, default: () => [] }, currentSlug: { type: String, default: '' }, moveTargets: { type: Array, default: () => [] }, busySlug: { type: String, default: '' } });
const emit = defineEmits(['close', 'select', 'new-chat', 'updated', 'deleted']);
const searchQuery = ref('');
const filteredProjects = computed(() => props.projects
  .filter(project => project.slug !== '__chat__' && !project.conversationDeletedAt && project.hasMessages !== false && (project.name || '').toLowerCase().includes(searchQuery.value.trim().toLowerCase()))
  .slice().sort((a, b) => {
    if (!!a.conversationPinnedAt !== !!b.conversationPinnedAt) return a.conversationPinnedAt ? -1 : 1;
    if (a.conversationPinnedAt && b.conversationPinnedAt) return b.conversationPinnedAt.localeCompare(a.conversationPinnedAt);
    return (b.lastMessageAt || b.updatedAt || b.createdAt || '').localeCompare(a.lastMessageAt || a.updatedAt || a.createdAt || '');
  }));
const projectName = slug => props.moveTargets.find(project => project.slug === slug)?.name || '项目';
const menuProject = ref(null), menuElement = ref(null), menuStyle = ref({});
const rowBusy = computed(() => menuProject.value?.slug === props.busySlug);
let menuTrigger = null;
async function openMenu(project, event) {
  if (menuProject.value?.slug === project.slug && event.type !== 'contextmenu') { closeMenu(); return; }
  menuTrigger = event.currentTarget.querySelector?.('.session-more') || event.currentTarget;
  const rect = event.currentTarget.getBoundingClientRect();
  const left = event.type === 'contextmenu' ? event.clientX : rect.right;
  const top = event.type === 'contextmenu' ? event.clientY : rect.top;
  menuStyle.value = { left: `${Math.max(8, Math.min(left, window.innerWidth - 216))}px`, top: `${Math.max(8, Math.min(top, window.innerHeight - 248))}px` };
  menuProject.value = project;
  await nextTick();
  menuElement.value?.querySelector('button:not(:disabled)')?.focus();
}
function closeMenu(focus = false) { menuProject.value = null; if (focus) menuTrigger?.focus(); }
function outsideMenu(event) { if (!menuElement.value?.contains(event.target) && !event.target.closest('.session-more')) closeMenu(); }
function menuKeys(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
  if (event.key === 'Tab') { closeMenu(); return; }
  event.preventDefault();
  const buttons = [...menuElement.value.querySelectorAll('button:not(:disabled)')];
  const current = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
const dialogKind = ref(''), dialogProject = ref(null), renameValue = ref(''), moveValue = ref(''), dialogError = ref(''), working = ref(false), nameInput = ref(null);
const shareContent = ref(''), copied = ref(false);
const moveOptions = computed(() => [{ value: '', label: '不属于项目' }, ...props.moveTargets.filter(project => project.slug !== dialogProject.value?.slug).map(project => ({ value: project.slug, label: project.name }))]);
const runConversationAction = createConversationActions(window.api.hermes, {
  isBusy: slug => props.busySlug === slug,
  isProject: slug => props.moveTargets.some(project => project.slug === slug),
});
async function action(slug, kind, extra = {}) {
  return runConversationAction({ slug, action: kind, ...extra });
}
async function openDialog(kind) {
  dialogProject.value = menuProject.value;
  closeMenu();
  dialogKind.value = kind;
  dialogError.value = '';
  renameValue.value = dialogProject.value.name;
  moveValue.value = dialogProject.value.parentProjectSlug || '';
  copied.value = false;
  shareContent.value = '';
  if (kind === 'share') {
    working.value = true;
    try { shareContent.value = (await action(dialogProject.value.slug, 'share')).content; }
    catch (error) { dialogError.value = error.message; }
    finally { working.value = false; }
  }
  await nextTick();
  if (kind === 'rename') nameInput.value?.focus();
  else document.querySelector('.session-dialog button:not(:disabled)')?.focus();
}
function trapDialogFocus(event) {
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea, [tabindex="0"]')];
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function closeDialog() { if (working.value) return; dialogKind.value = ''; dialogError.value = ''; menuTrigger?.focus(); }
async function submitDialog() {
  if (working.value) return;
  working.value = true;
  try {
    const slug = dialogProject.value.slug;
    const result = await action(slug, dialogKind.value, dialogKind.value === 'rename' ? { name: renameValue.value.trim() } : { projectSlug: moveValue.value });
    emit('updated', { slug, meta: result.meta });
    working.value = false;
    closeDialog();
  } catch (error) { dialogError.value = error.message; }
  finally { working.value = false; }
}
async function togglePin() {
  const project = menuProject.value; closeMenu(true);
  try { const result = await action(project.slug, 'pin', { pinned: !project.conversationPinnedAt }); emit('updated', { slug: project.slug, meta: result.meta }); }
  catch (error) { showNotice(error.message); }
}
const notice = ref(''), undoSlug = ref(''); let noticeTimer = null;
function clearNotice() { clearTimeout(noticeTimer); notice.value = ''; undoSlug.value = ''; }
function showNotice(text, slug = '') { clearNotice(); notice.value = text; undoSlug.value = slug; noticeTimer = setTimeout(clearNotice, 7000); }
async function deleteConversation() {
  const project = menuProject.value; closeMenu(true);
  try { await action(project.slug, 'delete'); emit('deleted', project.slug); showNotice('已删除对话', project.slug); }
  catch (error) { showNotice(error.message); }
}
async function undoDelete() {
  working.value = true;
  try { const slug = undoSlug.value; const result = await action(slug, 'restore'); emit('updated', { slug, meta: result.meta }); clearNotice(); }
  catch (error) { showNotice(error.message); }
  finally { working.value = false; }
}
async function copyShare() {
  try { await navigator.clipboard.writeText(shareContent.value); copied.value = true; }
  catch (_) { dialogError.value = '复制失败，可选中内容复制或导出文件。'; }
}
function downloadShare() {
  const url = URL.createObjectURL(new Blob([shareContent.value], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${(dialogProject.value.name || '对话').replace(/[\\/:*?"<>|]/g, '_')}.md`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? new Intl.DateTimeFormat('zh-CN', { hour:'2-digit', minute:'2-digit', hour12:false }).format(date)
    : `${date.getMonth() + 1}/${date.getDate()}`;
}
const closeOnWindowChange = () => closeMenu();
onMounted(() => { document.addEventListener('pointerdown', outsideMenu); window.addEventListener('resize', closeOnWindowChange); window.addEventListener('blur', closeOnWindowChange); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outsideMenu); window.removeEventListener('resize', closeOnWindowChange); window.removeEventListener('blur', closeOnWindowChange); clearTimeout(noticeTimer); });
</script>

<style scoped>
.session-list { background:#f8fbff; }
.session-close { border:0; background:transparent; color:#94a3b8; cursor:pointer; }
.session-new-chat { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:10px 12px; border:1px solid #dce7fb; border-radius:10px; background:#fff; color:#2563eb; font-size:12px; font-weight:500; cursor:pointer; }
.session-new-chat:hover { background:#edf3ff; }
.session-search { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #e8edf5; border-radius:9px; background:#fff; color:#94a3b8; font-size:11px; }
.session-search input { min-width:0; width:100%; background:transparent; border:0; outline:none; font-size:12px; color:#475569; }
.session-search:focus-within { border-color:#8aafff; }
.session-row { display:flex; align-items:center; width:100%; border-radius:9px; color:#60718a; }
.session-row:hover { background:#edf3fb; }
.session-row-main { display:flex; align-items:center; gap:8px; flex:1; min-width:0; padding:11px 4px 11px 10px; background:transparent; text-align:left; cursor:pointer; }
.session-row-main > i { width:15px; flex:none; font-size:12px; color:#8294b0; text-align:center; }
.session-row-copy { min-width:0; flex:1; display:flex; flex-direction:column; gap:3px; }
.session-row-copy > span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:12px; }
.session-row-copy small { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:10px; color:#94a3b8; }
.session-row-copy small i { margin-right:4px; }
.session-date { flex:none; font-size:10px; color:#9aa7bb; }
.session-row-main > .session-pin { width:10px; font-size:9px; color:#8a9cb6; }
.session-more { opacity:0; flex:none; width:24px; height:28px; border-radius:6px; background:transparent; color:#8294b0; font-size:12px; cursor:pointer; }
.session-row:hover .session-more, .session-row:focus-within .session-more, .session-menu-open .session-more { opacity:1; }
.session-more:hover { color:#2563eb; background:#dde9fd; }
.session-selected { background:#e8f0ff; color:#2563eb; }
.session-selected .session-row-main > i { color:#2563eb; }
.session-empty { padding:20px 6px; font-size:12px; color:#94a3b8; text-align:center; }
.session-menu { position:fixed; z-index:1200; width:208px; padding:6px; background:#fff; border:1px solid #e2e9f4; border-radius:13px; box-shadow:0 12px 36px rgba(30,58,105,.14); }
.session-menu > button { display:flex; align-items:center; gap:12px; width:100%; padding:9px 12px; border-radius:8px; text-align:left; color:#334155; background:transparent; font-size:13px; cursor:pointer; }
.session-menu > button:hover:not(:disabled) { color:#2563eb; background:#eff5ff; }
.session-menu button > i { width:16px; text-align:center; font-size:13px; }
.session-menu .session-delete { color:#e5484d; }
.session-menu .session-delete:hover { color:#dc2626; background:#fff1f2; }
.session-menu .session-menu-chevron { margin-left:auto; font-size:9px; width:8px; }
.session-menu-divider { height:1px; margin:5px 8px; background:#edf1f6; }
.session-menu-hint { padding:6px 10px; color:#94a3b8; font-size:10px; line-height:1.6; }
.session-menu button:disabled { opacity:.4; cursor:default; }
.session-dialog-overlay { position:fixed; inset:0; z-index:1300; display:grid; place-items:center; background:rgba(15,23,42,.24); padding:20px; }
.session-dialog { width:min(480px,100%); padding:22px; border:1px solid #e2e9f4; border-radius:16px; background:#fff; box-shadow:0 20px 60px rgba(30,58,105,.16); }
.session-dialog-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
.session-dialog-heading h2 { font-size:16px; font-weight:600; color:#172033; }
.session-dialog-heading button { width:28px; height:28px; border-radius:7px; color:#94a3b8; cursor:pointer; }
.session-dialog label { display:block; margin-bottom:8px; font-size:12px; color:#475569; }
.session-dialog input { width:100%; padding:10px 12px; font-size:13px; border:1px solid #dce5f3; border-radius:9px; color:#334155; outline:none; }
.session-dialog input:focus { border-color:#8aafff; }
.session-dialog .ui-select { width:100%; }
.session-dialog-description { margin-bottom:12px; font-size:12px; line-height:1.7; color:#64748b; overflow-wrap:anywhere; }
.session-dialog .ui-select + .session-dialog-description { margin-top:12px; }
.session-share-preview { display:block; width:100%; height:280px; resize:none; padding:12px; border:1px solid #e2e9f4; border-radius:9px; color:#475569; font-family:inherit; font-size:12px; line-height:1.8; white-space:pre-wrap; overflow-wrap:anywhere; }
.session-dialog-error { margin-top:12px; font-size:12px; line-height:1.6; color:#dc2626; }
.session-dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
.session-dialog-actions button { border:1px solid #dce5f3; border-radius:8px; padding:8px 14px; color:#475569; font-size:12px; cursor:pointer; }
.session-dialog-actions .session-primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.session-dialog-actions button:disabled { opacity:.5; cursor:default; }
.session-notice { position:fixed; bottom:26px; left:50%; transform:translateX(-50%); z-index:1400; display:flex; align-items:center; gap:14px; padding:12px 16px; max-width:calc(100vw - 32px); background:#fff; border:1px solid #dce5f3; border-radius:12px; box-shadow:0 8px 24px rgba(30,58,105,.12); font-size:12px; color:#475569; }
.session-notice button { color:#2563eb; cursor:pointer; }
.session-notice button:last-child { color:#94a3b8; }
.session-list button:focus-visible, .session-menu button:focus-visible, .session-dialog button:focus-visible { outline:2px solid #2563eb; outline-offset:-2px; }
</style>
