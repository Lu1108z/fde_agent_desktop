<template>
  <div class="flex flex-col h-full min-h-0" @keydown.ctrl.s.prevent="editing && saveEditing()" @keydown.meta.s.prevent="editing && saveEditing()">
    <!-- 头部:文件名 + 操作 -->
    <div class="doc-viewer-toolbar flex items-center justify-between px-5 py-3 border-b border-slate-200/80 shrink-0">
      <div class="doc-viewer-file flex items-center gap-2 min-w-0">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="iconBg">
          <i :class="fileIcon"></i>
        </span>
        <div class="min-w-0">
          <div class="text-[13px] font-semibold text-slate-800 truncate">{{ item.title }}</div>
          <div class="text-[11px] text-slate-400">
            <span :class="item.category === 'knowledge' ? 'text-emerald-600' : item.category === 'deliverable' ? 'text-blue-600' : item.category === 'tech' ? 'text-indigo-600' : 'text-slate-400'">
              {{ categoryLabel }}
            </span>
            · {{ !isProject && ['md','docx'].includes(item.type) ? 'Word 文档' : item.type.toUpperCase() }}
          </div>
        </div>
      </div>
      <div class="doc-viewer-actions flex items-center gap-1.5 shrink-0">
        <template v-if="editing">
          <button type="button" class="editor-save" :disabled="saving" @click="saveEditing"><i class="fa-solid fa-check"></i>{{ saving ? '保存中…' : '保存' }}</button>
          <button type="button" class="editor-action" :disabled="saving" @click="cancelEditing">取消</button>
        </template>
        <template v-else>
          <span v-if="edited" class="mr-2 text-[11px] text-emerald-600">修改已保存</span>
          <button v-if="canEdit" type="button" class="editor-save" @click="startEditing"><i class="fa-solid fa-pen"></i>直接编辑</button>
          <button v-if="canEdit && !isProject" type="button" class="editor-action" @click="exportEdited"><i class="fa-solid fa-file-word"></i>导出 Word</button>
        </template>
        <UiSelect field v-if="!editing && originalVersions.length > 1" v-model="originalFile" class="original-format" aria-label="选择原件格式" :options="[...(originalVersions).map((version) => ({ value: version.file, label: String(version.type === 'docx' ? 'Word 原件' : version.type.toUpperCase() + ' 原件') }))]" />
        <button
          :disabled="editing"
          @click="openFile"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="用系统程序打开"
        >
          <i class="fa-solid fa-arrow-up-right-from-square text-[11px]"></i>
          <span>打开原件</span>
        </button>
        <button
          :disabled="editing"
          @click="downloadFile"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="下载到本地"
        >
          <i class="fa-solid fa-download text-[11px]"></i>
          <span>下载原件</span>
        </button>
        <button
          :disabled="editing"
          @click="$emit('close')"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="关闭预览"
        >
          <i class="fa-solid fa-xmark text-[12px]"></i>
          <span>关闭</span>
        </button>
      </div>
    </div>

    <p v-if="editorError || editorNotice" class="editor-notice" :class="{'is-error': editorError}" role="status">{{ editorError || editorNotice }}</p>
    <div v-if="editing" class="inline-editor">
      <div class="editor-toolbar">
        <template v-if="editFormat === 'html'">
          <label class="editor-font-size">字号
            <UiSelect field v-model.number="fontSize" aria-label="文字字号" @pointerdown="rememberEditorSelection" @focus="rememberEditorSelection" @change="applyFontSize" :options="[...(fontSizes).map((size) => ({ value: size, label: String(size) + ' pt' }))]" />
          </label>
          <button type="button" aria-label="加粗" @mousedown.prevent="formatRichText('bold')"><i class="fa-solid fa-bold"></i></button>
          <button type="button" aria-label="斜体" @mousedown.prevent="formatRichText('italic')"><i class="fa-solid fa-italic"></i></button>
          <button type="button" aria-label="下划线" @mousedown.prevent="formatRichText('underline')"><i class="fa-solid fa-underline"></i></button>
          <button type="button" aria-label="标题" @mousedown.prevent="formatRichText('formatBlock', 'h2')">标题</button>
          <button type="button" aria-label="正文" @mousedown.prevent="formatRichText('formatBlock', 'p')">正文</button>
          <button type="button" aria-label="项目列表" @mousedown.prevent="formatRichText('insertUnorderedList')"><i class="fa-solid fa-list-ul"></i></button>
          <button type="button" aria-label="编号列表" @mousedown.prevent="formatRichText('insertOrderedList')"><i class="fa-solid fa-list-ol"></i></button>
          <span>Word 可视化编辑 · 正文和表格直接修改</span>
        </template>
        <template v-else><span>Markdown 编辑 · Ctrl / ⌘ + S 保存</span><button type="button" @click="editPreview = !editPreview">{{ editPreview ? '返回编辑' : '预览排版' }}</button></template>
      </div>
      <div v-if="editFormat === 'html'" ref="richEditorRef" contenteditable="true" role="textbox" aria-label="编辑文档正文" aria-multiline="true" class="rich-editor handbook-md" v-html="initialHtml" @mouseup="rememberEditorSelection" @keyup="rememberEditorSelection" @input="rememberEditorSelection"></div>
      <div v-else-if="editPreview" class="edit-preview handbook-md" v-html="renderMarkdown(editContent)"></div>
      <textarea v-else v-model="editContent" class="markdown-editor" aria-label="编辑 Markdown 文档" spellcheck="false"></textarea>
    </div>

    <!-- 内容区 -->
    <!-- html 原型:铺满 iframe,内边距归零(走本地静态服务,fetch data 可正常加载) -->
    <div v-else-if="isHtmlPreview" class="flex-1 min-h-0 glass-card">
      <div v-if="loading" class="flex flex-col items-center justify-center h-full text-slate-400">
        <div class="w-8 h-8 rounded-full border-2 border-blue-100 border-t-blue-500 animate-spin mb-3"></div>
        <span class="text-[12px]">加载中...</span>
      </div>
      <div v-else-if="error" class="flex flex-col items-center justify-center h-full text-slate-400">
        <i class="fa-solid fa-triangle-exclamation text-xl mb-2 text-amber-400"></i>
        <span class="text-[12px]">{{ error }}</span>
      </div>
      <iframe
        v-else
        :src="htmlSrc"
        class="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto p-6 glass-card">
      <!-- md / docx(html快照) 内嵌渲染 -->
      <div v-if="canPreview">
        <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-slate-400">
          <div class="w-8 h-8 rounded-full border-2 border-blue-100 border-t-blue-500 animate-spin mb-3"></div>
          <span class="text-[12px]">加载中...</span>
        </div>
        <div v-else-if="error" class="flex flex-col items-center justify-center py-20 text-slate-400">
          <i class="fa-solid fa-triangle-exclamation text-xl mb-2 text-amber-400"></i>
          <span class="text-[12px]">{{ error }}</span>
        </div>
        <template v-else>
          <!-- Office 预览是由原文档转换而来的快照,给个轻提示 -->
          <div v-if="item.previewHtml && ['docx','xlsx'].includes(item.type)" class="mb-4 flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
            <i class="fa-solid fa-circle-info text-slate-300"></i>
            <span>可点击「直接编辑」修改正文与表格；修改版独立保存，原件可另行下载。</span>
          </div>
          <div class="prose prose-sm prose-slate max-w-none handbook-md" v-html="rendered" @click="onContentClick"></div>
        </template>
      </div>

      <!-- 项目产物里的源码类文件(js/json/css…):深色只读源码视图 -->
      <div v-else-if="isSourcePreview">
        <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-slate-400">
          <div class="w-8 h-8 rounded-full border-2 border-blue-100 border-t-blue-500 animate-spin mb-3"></div>
          <span class="text-[12px]">加载中...</span>
        </div>
        <div v-else-if="error" class="flex flex-col items-center justify-center py-20 text-slate-400">
          <i class="fa-solid fa-triangle-exclamation text-xl mb-2 text-amber-400"></i>
          <span class="text-[12px]">{{ error }}</span>
        </div>
        <pre v-else class="doc-source"><code>{{ fileSource || '（空文件）' }}</code></pre>
      </div>

      <!-- 无快照的 docx:回退引导 -->
      <div v-else class="flex flex-col items-center justify-center py-20 text-center">
        <span class="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
          <i class="fa-solid fa-file-word text-blue-400 text-2xl"></i>
        </span>
        <p class="text-[14px] font-medium text-slate-700 mb-1">{{ item.title }}</p>
        <p class="text-[12px] text-slate-400 mb-5 max-w-sm leading-relaxed">
          该 Word 文档暂无法在应用内预览。点击下方按钮用系统 Word 打开,或下载到本地。
        </p>
        <div class="flex items-center gap-3">
          <button
            @click="openFile"
            class="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer shadow-sm"
          >
            <i class="fa-solid fa-arrow-up-right-from-square text-[12px]"></i>
            <span>用 Word 打开</span>
          </button>
          <button
            @click="downloadFile"
            class="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium glass-card border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <i class="fa-solid fa-download text-[12px]"></i>
            <span>下载</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { marked } from 'marked';
import { readEditorDraft, writeEditorDraft, clearEditorDraft } from '@/data/editor-recovery';

const props = defineProps({
  stage: { type: String, default: '' },      // handbook 目录名,如 '03'(项目模式可空)
  item: { type: Object, required: true },     // manifest item
  // 传入时切到「项目产物」模式:从项目目录(而非 handbook)读文件。
  // 此时 item 需带 relPath(相对项目根,如 'stage2/prd.md' 或 'prototype/index.html')。
  projectSlug: { type: String, default: '' },
});

// 点击 [[wikilink]] 时向上抛,由 Knowledge.vue 在全库按标题查找并打开
const emit = defineEmits(['close', 'navigate', 'editing-change']);

// 把 Obsidian 风格 [[标题]] / [[标题|别名]] 预处理成可点击锚点(marked 不认这套语法)。
// 生成 <a data-wikilink="标题">别名</a>,点击由 onContentClick 统一处理。
function renderMarkdown(src) {
  const withLinks = (src || '').replace(/\[\[([^\]]+)\]\]/g, (_m, inner) => {
    const [target, alias] = inner.split('|');
    const t = (target || '').trim();
    const label = (alias || target || '').trim();
    const safeT = t.replace(/"/g, '&quot;');
    return `<a href="#" class="wikilink" data-wikilink="${safeT}">${label}</a>`;
  });
  return marked.parse(withLinks);
}

// 点击内容区:拦截 wikilink,阻止默认跳转,抛给父组件
function onContentClick(e) {
  const a = e.target.closest?.('a[data-wikilink]');
  if (!a) return;
  e.preventDefault();
  const title = a.getAttribute('data-wikilink');
  if (title) emit('navigate', title);
}

const loading = ref(false);
const error = ref('');
const rendered = ref('');
const fileSource = ref('');   // 源码类文件(js/json/css…)只读展示
const editableLoaded = ref(false);
const editableContent = ref('');
const editFormat = ref('md');
const edited = ref(false);
const editing = ref(false);
const saving = ref(false);
const editorError = ref('');
const editorNotice = ref('');
const editContent = ref('');
const editPreview = ref(false);
const initialHtml = ref('');
const richEditorRef = ref(null);
const fontSize = ref(12);
const fontSizes = [8,9,10,10.5,11,12,14,16,18,20,22,24,28,32,36,48,72];
let editorSelection = null;
function rememberEditorSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !richEditorRef.value) return;
  const range = selection.getRangeAt(0);
  if (!richEditorRef.value.contains(range.startContainer) || !richEditorRef.value.contains(range.endContainer)) return;
  editorSelection = range.cloneRange();
  const node = selection.focusNode?.nodeType === Node.TEXT_NODE ? selection.focusNode.parentElement : selection.focusNode;
  if (node instanceof Element) {
    const points = Math.round(parseFloat(getComputedStyle(node).fontSize) * 0.75 * 2) / 2;
    if (fontSizes.includes(points)) fontSize.value = points;
  }
}
function applyFontSize() {
  const editor = richEditorRef.value;
  if (!editor || !editorSelection || !editor.contains(editorSelection.startContainer) || !editor.contains(editorSelection.endContainer)) {
    editorNotice.value = '请先选中要调整的文字，再选择字号。';
    return;
  }
  const size = Number(fontSize.value);
  if (!fontSizes.includes(size)) return;
  if (editorSelection.collapsed) {
    editorNotice.value = '请先选中要调整的文字，再选择字号。';
    return;
  }
  editor.focus();
  const selection = window.getSelection();
  selection.removeAllRanges(); selection.addRange(editorSelection);
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontSize', false, '7');
  // 浏览器的 1–7 号字体转为 Word 的精确 pt 值，保存后也保持相同大小。
  editor.querySelectorAll('font[size="7"]').forEach(node => {
    node.removeAttribute('size'); node.style.fontSize = `${size}pt`;
  });
  editorNotice.value = '';
  rememberEditorSelection();
}
const originalVersions = computed(() => props.item.originalFiles || [{file:props.item.file, type:props.item.type}]);
const originalFile = ref(props.item.originalFiles?.find(version => version.type === 'docx')?.file || props.item.file);
function cleanEditorHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form,input,button,link,meta').forEach(node => node.remove());
  doc.querySelectorAll('*').forEach(node => Array.from(node.attributes).forEach(attr => {
    if (attr.name.startsWith('on') || ['contenteditable','autofocus'].includes(attr.name) || (['href','src'].includes(attr.name) && /^\s*(javascript|vbscript):/i.test(attr.value))) node.removeAttribute(attr.name);
  }));
  return doc.body.innerHTML;
}
const canEdit = computed(() => !loading.value && !error.value && (isProject.value ? /^(md|txt|json|csv|js|css)$/.test(props.item.type) : editableLoaded.value));
function startEditing() {
  if (!canEdit.value) return;
  editorError.value = ''; editorNotice.value = ''; editPreview.value = false;
  if (isProject.value) {editFormat.value = 'md'; editableContent.value = props.item.type === 'md' ? editableContent.value : fileSource.value;}
  editContent.value = editableContent.value;
  initialHtml.value = editFormat.value === 'html' ? cleanEditorHtml(editableContent.value) : '';
  editorSelection = null;
  fontSize.value = 12;
  editing.value = true;
  emit('editing-change', true);
}
function cancelEditing() { if (saving.value) return; editing.value = false; editorError.value = ''; emit('editing-change', false); }
function formatRichText(command, value=null) { richEditorRef.value?.focus(); document.execCommand(command, false, value); }
async function saveEditing() {
  if (!editing.value || saving.value) return;
  saving.value = true; editorError.value = '';
  const content = editFormat.value === 'html' ? cleanEditorHtml(richEditorRef.value?.innerHTML || '') : editContent.value;
  try {
    if (!isProject.value) {
      try { await writeEditorDraft({stage:props.stage, file:props.item.file, format:editFormat.value, content}); } catch (_) { /* 暂存不可用仍继续正常保存。 */ }
    }
    const result = isProject.value
      ? await window.api.hermes.writeFile(props.projectSlug, projectRel.value, content)
      : await window.api.handbook.writeEditable(props.stage, props.item.file, editFormat.value, content);
    if (!result?.success) throw new Error(result?.error || '保存失败');
    editableContent.value = content;
    rendered.value = editFormat.value === 'html' ? content : renderMarkdown(content);
    if (isSourcePreview.value) fileSource.value = content;
    edited.value = true; editing.value = false; emit('editing-change', false);
    if (!isProject.value) { try { await clearEditorDraft(); } catch (_) {} }
    editorNotice.value = isProject.value ? '已保存到项目文件' : '已保存修改版，原件保留；重新打开仍显示修改后的内容。';
  } catch (e) { editorError.value = e.message || '保存失败，请重试'; }
  finally { saving.value = false; }
}
async function exportEdited() {
  editorError.value = '';
  try { const result = await window.api.handbook.exportEdited(props.stage, props.item.file); if (!result?.success && !result?.canceled) throw new Error(result?.error || '导出失败'); }
  catch (e) { editorError.value = e.message; }
}
const htmlSrc = ref('');      // html 原型走本地静态服务的预览地址

const isProject = computed(() => !!props.projectSlug);
// 相对项目根的路径:优先 relPath,回退 dir/file
const projectRel = computed(() =>
  props.item.relPath || (props.item.dir ? `${props.item.dir}/${props.item.file}` : props.item.file));

// html 原型:铺满 iframe 预览
const isHtmlPreview = computed(() => isProject.value && /\.html?$/i.test(props.item.file || projectRel.value || ''));
// 源码类:项目产物里非 md、非 html 的文本文件
const isSourcePreview = computed(() =>
  isProject.value && !isHtmlPreview.value && props.item.type !== 'md' && props.item.type !== 'docx');

// 可内嵌 md/docx 预览:handbook 模式看 previewable/previewHtml;项目模式看是否 md
const canPreview = computed(() =>
  isProject.value ? props.item.type === 'md' : (editableLoaded.value || props.item.previewable || !!props.item.previewHtml));

const categoryLabel = computed(() => ({
  knowledge: '知识',
  deliverable: '交付物',
  spec: '规范',
  tech: '平台技术',
  other: '文档',
}[props.item.category] || '文档'));

const fileIcon = computed(() => {
  if (props.item.type === 'docx') return 'fa-solid fa-file-word text-blue-500';
  if (isHtmlPreview.value) return 'fa-solid fa-code text-blue-500';
  if (isSourcePreview.value) return 'fa-solid fa-file-code text-slate-500';
  return 'fa-solid fa-file-lines text-emerald-500';
});
const iconBg = computed(() => props.item.type === 'docx' ? 'bg-blue-50' : isHtmlPreview.value ? 'bg-blue-50' : isSourcePreview.value ? 'bg-slate-100' : 'bg-emerald-50');

async function readHandbookText(stage, file, html) {
  let readError = '读取失败';
  try {
    const res = html
      ? await window.api?.handbook?.readHtml?.(stage, file)
      : await window.api?.handbook?.readMd?.(stage, file);
    if (res?.success) return res.content || '';
    readError = res?.error || readError;
  } catch (e) {
    readError = e.message || readError;
  }

  // Vite browser preview cannot reach Electron IPC. The dev server exposes
  // the checked-in handbook files; production keeps the normal API path.
  if (import.meta.env.DEV) {
    try {
      const url = `/__handbook/${encodeURIComponent(stage)}/${encodeURIComponent(file)}`;
      const response = await fetch(url);
      if (response.ok) return await response.text();
    } catch (_) { /* Show the original read error below. */ }
  }
  throw new Error(readError);
}

const loadContent = async () => {
  loading.value = true;
  error.value = '';
  rendered.value = '';
  fileSource.value = '';
  htmlSrc.value = '';
  editableLoaded.value = false; edited.value = false; editorError.value = ''; editorNotice.value = '';
  try {
    if (isProject.value) {
      // ── 项目产物模式 ──
      if (isHtmlPreview.value) {
        // html:走本地静态服务(否则原型页 fetch('data/*.json') 会被拦截)
        const res = await window.api.hermes.prototypeUrl(props.projectSlug, projectRel.value.replace(/^prototype\//, ''));
        if (res && res.success) {
          htmlSrc.value = res.url;
        } else {
          error.value = res?.error || '预览服务未就绪';
        }
      } else if (props.item.type === 'md') {
        const res = await window.api.hermes.readFile(props.projectSlug, projectRel.value);
        const content = typeof res === 'string' ? res : res?.content;
        if (typeof content === 'string') { editableContent.value = content; rendered.value = renderMarkdown(content); }
        else error.value = res?.error || '读取失败';
      } else {
        // 源码类文本:直接展示
        const res = await window.api.hermes.readFile(props.projectSlug, projectRel.value);
        const content = typeof res === 'string' ? res : res?.content;
        if (typeof content === 'string') fileSource.value = content;
        else error.value = res?.error || '读取失败';
      }
    } else {
      // ── handbook 模式 ──
      if (window.api?.handbook?.readEditable) {
        const result = await window.api.handbook.readEditable(props.stage, props.item.file);
        if (result?.success) {
          editableLoaded.value = true; editFormat.value = result.format; editableContent.value = result.content || ''; edited.value = !!result.edited;
          rendered.value = result.format === 'html' ? cleanEditorHtml(editableContent.value) : renderMarkdown(editableContent.value);
          try {
            const draft = await readEditorDraft();
            if (draft?.stage === props.stage && draft.file === props.item.file && typeof draft.content === 'string') {
              editFormat.value = draft.format;
              editContent.value = draft.content;
              initialHtml.value = draft.format === 'html' ? cleanEditorHtml(draft.content) : '';
              editing.value = true;
              emit('editing-change', true);
              editorNotice.value = '已恢复上次未保存的修改，请点击保存。';
            }
          } catch (_) { /* 暂存不可用不影响文档读取。 */ }
          return;
        }
      }
      if (!canPreview.value) return;
      if (props.item.previewHtml) {
        // docx/xlsx 等二进制文档:渲染构建时生成的 html 快照
        rendered.value = await readHandbookText(props.stage, props.item.previewHtml, true);
      } else {
        // md:读取后用 marked 渲染
        rendered.value = renderMarkdown(await readHandbookText(props.stage, props.item.file, false));
      }
    }
  } catch (e) {
    error.value = e.message || '读取失败';
  } finally {
    loading.value = false;
  }
};

const openFile = async () => {
  try {
    if (isProject.value) {
      const res = await window.api.hermes.openInBrowser(props.projectSlug, projectRel.value);
      if (res && !res.success && res.error) console.error('open failed:', res.error);
      return;
    }
    const res = await window.api.handbook.open(props.stage, originalFile.value);
    if (res && !res.success && res.error) console.error('open failed:', res.error);
  } catch (e) {
    console.error('open failed:', e);
  }
};

const downloadFile = async () => {
  try {
    if (isProject.value) {
      await window.api.hermes.saveFile(props.projectSlug, projectRel.value);
      return;
    }
    await window.api.handbook.saveAs(props.stage, originalFile.value);
  } catch (e) {
    console.error('download failed:', e);
  }
};

watch(() => [props.projectSlug, props.stage, props.item.relPath, props.item.file], loadContent);
onMounted(loadContent);
</script>

<style scoped>
.editor-save,.editor-action{display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap}.editor-save{background:#2563eb;color:white}.editor-save:hover{background:#1d4ed8}.editor-action{color:#64748b;background:#f4f7fb}.editor-save:disabled,.editor-action:disabled{opacity:.5;cursor:default}.original-format{font-size:11px;max-width:110px;border:1px solid #e2e8f0;border-radius:7px;padding:5px;background:#fff;color:#64748b}.editor-notice{padding:8px 24px;background:#eff8f2;color:#33734d;font-size:11px;border-bottom:1px solid #deeee3}.editor-notice.is-error{background:#fff1f2;color:#b91c1c}.inline-editor{flex:1;min-height:0;display:flex;flex-direction:column;background:#fff}.editor-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:9px 24px;border-bottom:1px solid #e2e8f0;background:#f8faff;font-size:11px;color:#64748b}.editor-toolbar button{border:1px solid #dbe4f0;border-radius:6px;padding:5px 9px;background:#fff;cursor:pointer}.rich-editor,.edit-preview{padding:24px;min-height:0;flex:1;overflow:auto;outline:none;font-size:13px;line-height:1.8}.rich-editor:focus{box-shadow:inset 0 0 0 2px #bfdbfe}.markdown-editor{padding:22px 24px;resize:none;width:100%;min-height:0;flex:1;outline:none;font-family:ui-monospace,'SF Mono',monospace;font-size:13px;line-height:1.85;color:#334155;background:#fff;border:0}
.editor-font-size{display:flex;align-items:center;gap:6px;white-space:nowrap}.editor-font-size .ui-select{min-width:75px;padding:5px 7px;border:1px solid #dbe4f0;border-radius:6px;background:#fff;color:#334155;font-size:12px;cursor:pointer}
.handbook-md :deep(h1) { font-size: 1.4em; font-weight: 700; color: var(--ui-ink-2); margin: 0.6em 0 0.4em; }
.handbook-md :deep(h2) { font-size: 1.2em; font-weight: 700; color: var(--ui-ink-2); margin: 1em 0 0.4em; padding-bottom: 0.2em; border-bottom: 1px solid var(--ui-line-2); }
.handbook-md :deep(h3) { font-size: 1.05em; font-weight: 600; color: var(--ui-ink-3); margin: 0.8em 0 0.3em; }
.handbook-md :deep(p) { margin: 0.5em 0; line-height: 1.75; color: var(--ui-text); font-size: 13px; }
.handbook-md :deep(ul), .handbook-md :deep(ol) { margin: 0.4em 0; padding-left: 1.5em; }
.handbook-md :deep(li) { margin: 0.2em 0; line-height: 1.7; color: var(--ui-text); font-size: 13px; }
.handbook-md :deep(table) { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 12px; }
.handbook-md :deep(th), .handbook-md :deep(td) { border: 1px solid var(--ui-line-2); padding: 0.5em 0.7em; text-align: left; vertical-align: top; }
.handbook-md :deep(th) { background: var(--ui-bg-3); font-weight: 600; color: var(--ui-ink-3); }
.handbook-md :deep(tr:nth-child(even) td) { background: var(--ui-bg-3); }
.handbook-md :deep(strong) { font-weight: 700; color: var(--ui-ink-2); }
.handbook-md :deep(blockquote) { border-left: 3px solid var(--ui-brand); padding: 0.2em 0 0.2em 0.9em; margin: 0.6em 0; color: var(--ui-text); background: var(--ui-bg-3); border-radius: 0 6px 6px 0; }
.handbook-md :deep(code) { font-size: 12px; background: var(--ui-bg-2); padding: 0.15em 0.4em; border-radius: 4px; color: var(--ui-text); }
.handbook-md :deep(pre) { background: var(--ui-ink); color: var(--ui-line-2); padding: 0.9em 1.1em; border-radius: 8px; overflow-x: auto; font-size: 12px; margin: 0.6em 0; }
.handbook-md :deep(pre code) { background: transparent; padding: 0; color: inherit; }
.handbook-md :deep(hr) { border: none; border-top: 1px solid var(--ui-line-2); margin: 1em 0; }
.handbook-md :deep(a) { color: var(--ui-brand); text-decoration: none; }
.handbook-md :deep(a.wikilink) {
  color: var(--ui-brand);
  text-decoration: none;
  border-bottom: 1px dashed var(--ui-brand-light);
  padding: 0 1px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.handbook-md :deep(a.wikilink::before) { content: '\1F517'; font-size: 0.82em; margin-right: 2px; opacity: 0.7; }
.handbook-md :deep(a.wikilink:hover) { background: var(--ui-brand-soft); border-bottom-color: var(--ui-brand); }
.handbook-md :deep(img) { max-width: 100%; height: auto; display: block; margin: 0.8em auto; border: 1px solid var(--ui-line-2); border-radius: 8px; }

/* 项目产物里的源码类文件:深色只读视图 */
.doc-source {
  margin: 0;
  padding: 1em 1.1em;
  background: var(--ui-ink);
  color: var(--ui-line-2);
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.7;
  font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
  white-space: pre;
}
</style>
<style>

/* Document preview toolbar: wrap actions instead of squeezing the file label. */
.doc-viewer-toolbar{flex-wrap:wrap;gap:10px;min-width:0}
.doc-viewer-file{flex:1 1 220px;min-width:0;max-width:100%}
.doc-viewer-actions{flex:1 1 320px;min-width:0;max-width:100%;flex-wrap:wrap;justify-content:flex-end;gap:6px}
.doc-viewer-actions>button{flex-shrink:0;white-space:nowrap;max-width:100%}
.resource-inline-preview{min-width:0;max-width:100%;overflow:hidden}
.resource-inline-preview .doc-viewer-toolbar{align-items:stretch;padding:12px;gap:0}
.resource-inline-preview .doc-viewer-file{display:none}
.resource-inline-preview .doc-viewer-actions{flex:1 1 100%;width:100%;justify-content:flex-start}
.resource-inline-preview .doc-viewer-actions>button{min-height:30px;padding:6px 9px;font-size:12px;line-height:18px}
.resource-inline-preview .editor-notice{padding:8px 12px}
.resource-inline-preview .handbook-md{overflow-wrap:anywhere}
</style>
