<template>
  <div class="resource-browser kb-bg">
    <aside class="resource-sidebar flex flex-col">
      <div class="resource-sidebar-heading">知识体系</div>
      <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <!-- 全部 -->
        <button
          class="tree-node"
          :class="active === 'all' ? 'tree-node--active' : ''"
          @click="active = 'all'"
        >
          <span class="tree-badge tree-badge--all"><i class="fa-solid fa-layer-group text-[10px]"></i></span>
          <span class="flex-1 text-left truncate">全部知识</span>
          <span class="tree-count">{{ allItems.length }}</span>
        </button>

        <!-- 项目产物(扫描各项目目录里 agent 生成的文档,可一键归档) -->
        <button
          class="tree-node"
          :class="active === 'projects' ? 'tree-node--active' : ''"
          @click="selectProjects"
        >
          <span class="tree-badge" style="background:var(--ui-cyan)"><i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i></span>
          <span class="flex-1 text-left truncate">项目产物</span>
          <span class="tree-count">{{ projectItemCount }}</span>
        </button>

        <!-- 五阶段 -->
        <button
          v-for="(st, i) in stages"
          :key="st.dir"
          class="tree-node"
          :class="active === st.dir ? 'tree-node--active' : ''"
          @click="active = st.dir"
        >
          <span class="tree-badge" :style="{ background: STAGE_COLORS[i] }">{{ CN_NUM[i] }}</span>
          <span class="flex-1 text-left truncate">{{ st.name }}</span>
          <span class="tree-count">{{ st.items.filter(it => it.category !== 'spec').length }}</span>
        </button>
      </div>

      <div class="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400">
        <i class="fa-solid fa-circle-info mr-1"></i>共 <b class="text-slate-600">{{ allItems.length }}</b> 份交付物 / 知识文档
      </div>
    </aside>

    <div class="resource-workspace">
      <div class="resource-toolbar">
        <label class="resource-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="keyword" aria-label="搜索知识文档" placeholder="搜索文档、知识或文件名…" /></label>
        <div class="resource-toolbar-actions"><button @click="active === 'projects' ? loadProjects() : loadManifest()" :disabled="scanningProjects" class="btn-sm" title="刷新知识"><i class="fa-solid fa-rotate" :class="{ 'fa-spin': scanningProjects }"></i></button><button v-if="active !== 'projects'" @click="openUpload" class="btn-sm-pri"><i class="fa-solid fa-plus"></i>上传归档</button><button v-else @click="openUpload" class="btn-sm-pri"><i class="fa-solid fa-cloud-arrow-up"></i>上传知识</button></div>
      </div>
      <div class="resource-body">
        <main class="resource-center">
          <div class="resource-title"><span class="resource-title-icon"><i class="fa-solid fa-book-open"></i></span><div><h1>{{ active === 'projects' ? '项目产物' : activeName }}<span>共 {{ browserItems.length }} 份</span></h1><p>按 FDE 五阶段沉淀交付物、知识模板与项目资料</p></div></div>
          <div class="resource-filters">
            <template v-if="active !== 'projects'"><button v-for="c in categories" :key="c.key" class="resource-filter" :class="{ 'is-active': catFilter === c.key }" @click="catFilter = c.key">{{ c.label }}<span>{{ categoryCount(c.key) }}</span></button></template>
            <div class="resource-view-controls"><UiSelect field v-model="sortOrder" aria-label="文档排序" :options="[{ value: 'name', label: '名称排序' }, { value: 'category', label: '分类排序' }, { value: 'stage', label: '阶段排序' }]" /><div class="resource-view-toggle"><button :class="{ 'is-active': viewMode === 'list' }" @click="viewMode = 'list'"><i class="fa-solid fa-list mr-1"></i>列表</button><button :class="{ 'is-active': viewMode === 'group' }" @click="viewMode = 'group'"><i class="fa-solid fa-layer-group mr-1"></i>分组</button></div></div>
          </div>
          <div v-if="showKnowledgeTypeFilter && catFilter !== 'deliverable' && catFilter !== 'spec'" class="mb-4 flex flex-wrap gap-2"><button v-for="c in knowledgeTypeFilters" :key="c.key" class="resource-filter" :class="{ 'is-active': knowledgeTypeFilter === c.key }" @click="knowledgeTypeFilter = c.key">{{ c.label }}</button></div>
          <div v-if="scanningProjects && active === 'projects'" class="resource-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><p>正在扫描项目产物…</p></div>
          <ResourceList v-else :items="knowledgeRows" :selected-key="selectedDocumentKey" :grouped="viewMode === 'group'" name-label="文档名称" meta-label="格式" @select="chooseDocument" @action="openDocumentActions" />
          <div v-if="totalPages > 1" class="resource-pagination"><button class="pgn" :disabled="currentPage <= 1" @click="currentPage--"><i class="fa-solid fa-chevron-left"></i></button><button v-for="p in totalPages" :key="p" class="pgn" :class="{ 'pgn--cur': currentPage === p }" @click="currentPage = p">{{ p }}</button><button class="pgn" :disabled="currentPage >= totalPages" @click="currentPage++"><i class="fa-solid fa-chevron-right"></i></button></div>
        </main>
        <aside class="resource-detail" aria-label="知识文档详情">
          <div v-if="selected" class="resource-detail-scroll" :class="{ 'resource-document-preview': detailTab === 'preview' }">
            <div class="resource-detail-heading"><span class="resource-icon" :style="{ background: fmtColor(selected.type) }"><i :class="documentIcon(selected.type)"></i></span><div class="min-w-0"><h2>{{ selected.title }}</h2><span class="resource-tag mt-1">{{ catLabel(selected.category) }}</span></div></div>
            <p class="resource-detail-description">{{ selected.description || selected.summary || (selectedProjectSlug ? '来自 ' + (selected._project?.name || '当前项目') + ' 的交付资料' : stageShort(selected.stageIndex) + ' · ' + (selected.knowledgeType ? selected.knowledgeType + '知识' : catLabel(selected.category))) }}</p>
            <div class="resource-detail-actions"><button class="btn-sm-pri" @click="previewOpen = true"><i class="fa-regular fa-file-lines"></i>查看完整文档</button><div class="resource-detail-menu"><button class="btn-sm" aria-label="更多文档操作" :aria-expanded="detailMenuOpen" @click="detailMenuOpen = !detailMenuOpen"><i class="fa-solid fa-ellipsis"></i></button><div v-if="detailMenuOpen" class="resource-detail-menu-popover"><button @click="detailMenuOpen = false; detailTab = 'preview'">文档预览</button><button v-if="selectedProjectSlug && selected._project" @click="detailMenuOpen = false; openArchive(selected._project, selected)">归档到知识库</button><button v-else @click="detailMenuOpen = false; deleteDoc(selected)" class="text-red-600">删除文档</button></div></div></div>
            <div class="resource-detail-tabs" role="tablist" aria-label="知识详情分类"><button v-for="tab in knowledgeDetailTabs" :key="tab.key" role="tab" :aria-selected="detailTab === tab.key" :class="{ 'is-active': detailTab === tab.key }" @click="detailTab = tab.key">{{ tab.label }}</button></div>
            <template v-if="detailTab === 'info'">
              <dl class="resource-detail-info"><dt><i class="fa-regular fa-file"></i>文件名称</dt><dd>{{ selected.file }}</dd><dt><i class="fa-regular fa-folder"></i>分类</dt><dd><span class="resource-tag">{{ catLabel(selected.category) }}</span></dd><dt><i class="fa-solid fa-layer-group"></i>所属阶段</dt><dd>{{ selectedProjectSlug ? selected.dir || '项目目录' : stageShort(selected.stageIndex) }}</dd><dt><i class="fa-solid fa-box"></i>来源</dt><dd>{{ selectedProjectSlug ? '项目生成' : selected.uploaded ? '上传归档' : '内置知识' }}</dd><dt><i class="fa-solid fa-file-code"></i>格式</dt><dd>{{ selected.type.toUpperCase() }}</dd><template v-if="selected.mtime"><dt><i class="fa-regular fa-clock"></i>更新时间</dt><dd>{{ formatResourceDate(selected.mtime) }}</dd></template></dl>
              <div class="resource-detail-section"><h3>分类标签</h3><div class="resource-detail-tags"><span class="resource-tag">{{ catLabel(selected.category) }}</span><span v-if="selected.knowledgeType" class="resource-tag">{{ selected.knowledgeType }}</span><span class="resource-tag">{{ selected.type.toUpperCase() }}</span></div></div>
              <div class="resource-detail-section"><h3>相关资料</h3><button class="resource-detail-file" @click="detailTab = 'preview'"><i class="fa-regular fa-file-lines text-blue-600"></i><span class="min-w-0 truncate">{{ selected.title }}</span><i class="fa-solid fa-chevron-right ml-auto text-[10px]"></i></button></div>
            </template>
            <div v-else-if="detailTab === 'related'" class="mt-5 space-y-2"><button v-for="doc in relatedDocuments" :key="documentKey(doc)" class="resource-detail-file" @click="chooseDocument(doc)"><i :class="documentIcon(doc.type)" class="text-blue-600"></i><span class="min-w-0 truncate">{{ doc.title }}</span></button><p v-if="!relatedDocuments.length" class="resource-empty">暂无同分类资料</p></div>
            <div v-else class="resource-inline-preview"><DocViewer :stage="selected.stageDir || ''" :item="selected" :project-slug="selectedProjectSlug" @close="detailTab = 'info'" @navigate="navigateToDoc" /></div>
          </div>
          <div v-else class="resource-empty"><i class="fa-regular fa-file-lines"></i><p>选择一份文档查看详情</p></div>
        </aside>
      </div>
    </div>

    <!-- ── 文档预览抽屉(复用 DocViewer) ────────── -->
    <transition name="drawer">
      <div v-if="selected && previewOpen" class="fixed inset-0 z-50" @keydown.esc="previewOpen = false">
        <div class="absolute inset-0 bg-slate-900/40" @click="previewOpen = false"></div>
        <aside
          class="drawer-resizable absolute right-0 top-0 bottom-0 glass-card shadow-2xl flex flex-col"
          :class="{ 'is-resizing': resizing }"
          :style="{ width: drawerWidth + 'px' }"
        >
          <div class="drawer-resizer" @mousedown.prevent="startResize" title="拖动调整宽度"></div>
          <DocViewer :stage="selected.stageDir || ''" :item="selected" :project-slug="selectedProjectSlug" @close="previewOpen = false" @navigate="navigateToDoc" />
        </aside>
      </div>
    </transition>

    <!-- ── 上传归档弹框 ────────────────────────── -->
    <transition name="fade">
      <div v-if="showUpload" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/40" @click="showUpload = false"></div>
        <div class="relative w-[440px] max-w-[92vw] glass-card rounded-2xl shadow-2xl p-6">
          <div class="flex items-center gap-2 mb-4">
            <i class="fa-solid fa-cloud-arrow-up text-blue-600"></i>
            <span class="text-[15px] font-bold text-slate-800">上传文档归档</span>
            <button @click="showUpload = false" class="ml-auto w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <p class="text-[12px] text-slate-400 mb-4 leading-relaxed">
            选择本地文档,归档到指定作战阶段的知识库目录。支持 md / docx / pdf / pptx / xlsx / html。
          </p>
          <label class="block text-[12.5px] font-medium text-slate-600 mb-1.5">归档到阶段</label>
          <UiSelect field v-model="uploadStage" class="w-full mb-4 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400" :options="[...(stages).map((st, i) => ({ value: st.dir, label: '阶段' + String(CN_NUM[i]) + ' · ' + String(st.name) }))]" />
          <label class="block text-[12.5px] font-medium text-slate-600 mb-1.5">文档类型</label>
          <div class="flex gap-2 mb-6">
            <button
              v-for="c in [{k:'deliverable',l:'交付物'},{k:'knowledge',l:'知识'}]" :key="c.k"
              @click="uploadCat = c.k"
              class="flex-1 py-2 rounded-lg text-[13px] border transition"
              :class="uploadCat === c.k ? 'bg-blue-600 text-white border-blue-600' : 'glass-card text-slate-600 border-slate-200 hover:border-blue-400'"
            >{{ c.l }}</button>
          </div>
          <button
            @click="doUpload"
            :disabled="uploading || !uploadStage"
            class="w-full py-2.5 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i :class="uploading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-folder-open'" class="mr-1.5 text-[12px]"></i>
            {{ uploading ? '归档中…' : '选择文件并归档' }}
          </button>
        </div>
      </div>
    </transition>

    <!-- ── 项目产物归档弹框 ────────────────────────── -->
    <transition name="fade">
      <div v-if="showArchive" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/40" @click="showArchive = false"></div>
        <div class="relative w-[440px] max-w-[92vw] glass-card rounded-2xl shadow-2xl p-6">
          <div class="flex items-center gap-2 mb-4">
            <i class="fa-solid fa-inbox text-blue-600"></i>
            <span class="text-[15px] font-bold text-slate-800">归档到知识库</span>
            <button @click="showArchive = false" class="ml-auto w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <p class="text-[12px] text-slate-400 mb-4 leading-relaxed">
            将 <b class="text-slate-600">{{ archiveTarget?.item?.file }}</b>
            (来自项目「{{ archiveTarget?.pj?.name }}」)复制归档到指定作战阶段的知识库。
          </p>
          <label class="block text-[12.5px] font-medium text-slate-600 mb-1.5">归档到阶段</label>
          <UiSelect field v-model="archiveStage" class="w-full mb-4 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400" :options="[...(stages).map((st, i) => ({ value: st.dir, label: '阶段' + String(CN_NUM[i]) + ' · ' + String(st.name) }))]" />
          <label class="block text-[12.5px] font-medium text-slate-600 mb-1.5">文档类型</label>
          <div class="flex gap-2 mb-6">
            <button
              v-for="c in [{k:'deliverable',l:'交付物'},{k:'knowledge',l:'知识'}]" :key="c.k"
              @click="archiveCat = c.k"
              class="flex-1 py-2 rounded-lg text-[13px] border transition"
              :class="archiveCat === c.k ? 'bg-blue-600 text-white border-blue-600' : 'glass-card text-slate-600 border-slate-200 hover:border-blue-400'"
            >{{ c.l }}</button>
          </div>
          <button
            @click="doArchive"
            :disabled="archiving || !archiveStage"
            class="w-full py-2.5 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i :class="archiving ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-inbox'" class="mr-1.5 text-[12px]"></i>
            {{ archiving ? '归档中…' : '确认归档' }}
          </button>
        </div>
      </div>
    </transition>

    <!-- Toast -->
    <transition name="fade">
      <div v-if="toast" class="fixed top-4 right-4 z-[60] bg-slate-800 text-white text-[13px] px-3.5 py-2 rounded-lg shadow-lg flex items-center gap-2">
        <i class="fa-solid fa-circle-check text-blue-400"></i>{{ toast }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import DocViewer from '@/components/workbench/DocViewer.vue';
import { uniqueHandbookDocuments } from '@/data/handbook-documents';
import ResourceList from '@/components/common/ResourceList.vue';
import { useDrawerResize } from '@/composables/useDrawerResize.js';
const { width: drawerWidth, resizing, startResize } = useDrawerResize('kb.drawerWidth');

const CN_NUM = ['一', '二', '三', '四', '五'];
const STAGE_COLORS = ['var(--ui-brand)', 'var(--ui-brand-dark)', 'var(--ui-brand-light)', 'var(--ui-cyan)', 'var(--ui-brand-deep)'];

const stages = ref([]);       // manifest.stages,并给每个 item 注入 stageDir/stageIndex
const active = ref('all');    // 'all' | stage.dir
const keyword = ref('');
const sortOrder = ref('name');
const viewMode = ref('list');
const detailTab = ref('info');
const detailMenuOpen = ref(false);
const previewOpen = ref(false);
const knowledgeDetailTabs = [{ key: 'info', label: '基础信息' }, { key: 'preview', label: '文档预览' }, { key: 'related', label: '相关资料' }];
const catFilter = ref('all'); // all | deliverable | knowledge | spec
const knowledgeTypeFilter = ref('all'); // all | 调研 | 技术 | 产品
const currentPage = ref(1);
const pageSize = ref(12);
const selected = ref(null);   // 当前预览的 item(含 stageDir)
const selectedProjectSlug = ref(''); // 非空=预览的是「本项目产物」,DocViewer 走项目文件读取

const showUpload = ref(false);
const uploadStage = ref('');
const uploadCat = ref('deliverable');
const uploading = ref(false);
const toast = ref('');

// 本项目产物视图
const projects = ref([]);            // [{slug, name, items:[{file, relPath, title, type, dir, mtime}]}]
const scanningProjects = ref(false);
const projectsLoaded = ref(false);
// 归档弹框
const showArchive = ref(false);
const archiveTarget = ref(null);     // {pj, item}
const archiveStage = ref('');
const archiveCat = ref('deliverable');
const archiving = ref(false);

const categories = [
  { key: 'all', label: '全部' },
  { key: 'deliverable', label: '交付物' },
  { key: 'knowledge', label: '知识' },
  { key: 'spec', label: '规范' },
];

const KNOWLEDGE_TYPE_ORDER = ['调研', '技术', '产品'];
const KNOWLEDGE_TYPE_META = {
  调研: { label: '调研知识', icon: 'fa-solid fa-magnifying-glass' },
  技术: { label: '技术知识', icon: 'fa-solid fa-microchip' },
  产品: { label: '产品知识', icon: 'fa-solid fa-cube' },
};
const knowledgeTypeFilters = [
  { key: 'all', label: '全部知识' },
  ...KNOWLEDGE_TYPE_ORDER.map((type) => ({ key: type, label: KNOWLEDGE_TYPE_META[type].label.replace('知识', '') })),
];
const firstStageDir = computed(() => stages.value[0]?.dir || '');
const showKnowledgeTypeFilter = computed(() => active.value === firstStageDir.value);

async function loadManifest() {
  try {
    const res = await window.api.handbook.getManifest();
    if (res && res.success && res.data?.stages) {
      stages.value = res.data.stages.map((st, i) => ({
        ...st,
        items: uniqueHandbookDocuments(st.items || []).map((it) => ({ ...it, stageDir: st.dir, stageIndex: i })),
      }));
    }
  } catch (e) {
    console.error('[knowledge] load manifest failed', e);
  }
}

onMounted(loadManifest);

function showToast(msg) {
  toast.value = msg;
  setTimeout(() => { toast.value = ''; }, 2600);
}

function openUpload() {
  uploadStage.value = !['all', 'projects'].includes(active.value) ? active.value : (stages.value[0]?.dir || '');
  uploadCat.value = 'deliverable';
  showUpload.value = true;
}

async function doUpload() {
  if (!uploadStage.value || uploading.value) return;
  uploading.value = true;
  try {
    const res = await window.api.handbook.upload(uploadStage.value, uploadCat.value);
    if (res && res.success) {
      await loadManifest();
      active.value = res.stage;
      showUpload.value = false;
      showToast(`已归档 ${res.files.length} 份文档到阶段目录`);
    } else if (res && !res.canceled) {
      showToast('上传失败:' + (res.error || '未知错误'));
    }
  } catch (e) {
    showToast('上传失败:' + (e.message || e));
  } finally {
    uploading.value = false;
  }
}

// ── 本项目产物:扫描 / 归档 / 删除 ──
const projectItemCount = computed(() => projects.value.reduce((n, p) => n + p.items.length, 0));

async function loadProjects() {
  if (scanningProjects.value) return;
  scanningProjects.value = true;
  try {
    const res = await window.api.handbook.scanProjects();
    projects.value = (res && res.success && res.projects) ? res.projects : [];
    projectsLoaded.value = true;
  } catch (e) {
    console.error('[knowledge] scan projects failed', e);
    projects.value = [];
  } finally {
    scanningProjects.value = false;
  }
}

function selectProjects() {
  active.value = 'projects';
  if (!projectsLoaded.value) loadProjects();
}

function openArchive(pj, item) {
  archiveTarget.value = { pj, item };
  archiveStage.value = stages.value[0]?.dir || '';
  archiveCat.value = 'deliverable';
  showArchive.value = true;
}

async function doArchive() {
  if (!archiveTarget.value || !archiveStage.value || archiving.value) return;
  archiving.value = true;
  try {
    const { pj, item } = archiveTarget.value;
    const res = await window.api.handbook.archiveFromProject({
      slug: pj.slug,
      relPath: item.relPath,
      stage: archiveStage.value,
      category: archiveCat.value,
    });
    if (res && res.success) {
      await loadManifest();
      showArchive.value = false;
      showToast(`已归档「${item.title}」到阶段${CN_NUM[Number(res.stage) - 1] || ''}`);
    } else {
      showToast('归档失败:' + (res?.error || '未知错误'));
    }
  } catch (e) {
    showToast('归档失败:' + (e.message || e));
  } finally {
    archiving.value = false;
  }
}

async function deleteDoc(item) {
  const builtin = !item.uploaded;
  const tip = builtin
    ? `「${item.title}」是内置知识文档,删除后下次启动会自动恢复。确认删除?`
    : `确认删除「${item.title}」?此操作会移除该文档,不可撤销。`;
  if (!window.confirm(tip)) return;
  try {
    const res = await window.api.handbook.delete(item.stageDir, item.file);
    if (res && res.success) {
      if (selected.value && selected.value.file === item.file && selected.value.stageDir === item.stageDir) {
        selected.value = null;
      }
      await loadManifest();
      showToast(`已删除「${item.title}」`);
    } else {
      showToast('删除失败:' + (res?.error || '未知错误'));
    }
  } catch (e) {
    showToast('删除失败:' + (e.message || e));
  }
}

const allItems = computed(() => stages.value.flatMap((st) => st.items));

const activeName = computed(() => {
  if (active.value === 'all') return '全部知识';
  const st = stages.value.find((s) => s.dir === active.value);
  return st ? st.name : '全部知识';
});

const filtered = computed(() => {
  let list = active.value === 'all'
    ? allItems.value
    : (stages.value.find((s) => s.dir === active.value)?.items || []);
  if (catFilter.value !== 'all') list = list.filter((it) => it.category === catFilter.value);
  if (showKnowledgeTypeFilter.value && knowledgeTypeFilter.value !== 'all') {
    list = list.filter((it) => it.knowledgeType === knowledgeTypeFilter.value);
  }
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase();
    list = list.filter((it) => (it.title + ' ' + it.file).toLowerCase().includes(kw));
  }
  return list;
});

const knowledgeGroups = computed(() => {
  if (!showKnowledgeTypeFilter.value || knowledgeTypeFilter.value !== 'all') return [];
  const typed = filtered.value.filter((it) => it.knowledgeType);
  if (!typed.length) return [];
  return KNOWLEDGE_TYPE_ORDER
    .map((t) => ({
      type: t,
      label: KNOWLEDGE_TYPE_META[t]?.label || t,
      icon: KNOWLEDGE_TYPE_META[t]?.icon || 'fa-solid fa-lightbulb',
      items: typed.filter((it) => it.knowledgeType === t),
    }))
    .filter((g) => g.items.length);
});
const ungroupedItems = computed(() => {
  if (showKnowledgeTypeFilter.value && knowledgeTypeFilter.value !== 'all') return filtered.value;
  return filtered.value.filter((it) => !it.knowledgeType);
});

function documentKey(item) { return item ? `${item._project?.slug || item.stageDir || ''}/${item.relPath || item.file}` : ''; }
const selectedDocumentKey = computed(() => documentKey(selected.value));
const projectDocuments = computed(() => projects.value.flatMap(pj => pj.items.map(item => ({ ...item, _project: pj, category: item.category || 'deliverable' }))));
const browserItems = computed(() => {
  let list = active.value === 'projects' ? projectDocuments.value : filtered.value;
  if (active.value === 'projects' && keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase();
    list = list.filter(item => `${item.title} ${item.file} ${item._project.name}`.toLowerCase().includes(kw));
  }
  return [...list].sort((a, b) => (viewMode.value === 'group' || sortOrder.value === 'category' ? catLabel(a.category).localeCompare(catLabel(b.category), 'zh-CN') : sortOrder.value === 'stage' ? (a.stageIndex ?? 0) - (b.stageIndex ?? 0) : 0) || a.title.localeCompare(b.title, 'zh-CN'));
});
function documentIcon(type) { return ({ md: 'fa-solid fa-file-lines', docx: 'fa-solid fa-file-word', doc: 'fa-solid fa-file-word', html: 'fa-solid fa-code', pdf: 'fa-solid fa-file-pdf', xlsx: 'fa-solid fa-file-excel', pptx: 'fa-solid fa-file-powerpoint' })[type] || 'fa-regular fa-file'; }
const knowledgeRows = computed(() => pagedItems.value.map(item => ({ key: documentKey(item), name: item.title, category: catLabel(item.category), summary: item.description || item.summary || (item._project ? item._project.name : stageShort(item.stageIndex)) + (item.knowledgeType ? ' · ' + item.knowledgeType + '知识' : ''), meta: item.type.toUpperCase(), icon: documentIcon(item.type), color: fmtColor(item.type), raw: item })));
function chooseDocument(item) { detailMenuOpen.value = false; if (item._project) openProjectDoc(item._project, item); else openDoc(item); }
function openDocumentActions(item) { chooseDocument(item); detailMenuOpen.value = true; }
function categoryCount(category) {
  const list = active.value === 'all' ? allItems.value : stages.value.find(st => st.dir === active.value)?.items || [];
  return category === 'all' ? list.length : list.filter(item => item.category === category).length;
}
function formatResourceDate(value) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
const relatedDocuments = computed(() => {
  if (!selected.value) return [];
  return (selectedProjectSlug.value ? projectDocuments.value.filter(item => item._project.slug === selectedProjectSlug.value) : allItems.value.filter(item => item.stageDir === selected.value.stageDir && item.category === selected.value.category)).filter(item => documentKey(item) !== selectedDocumentKey.value).slice(0, 8);
});
watch(browserItems, (list) => {
  if (!list.length) { selected.value = null; return; }
  if (!list.some(item => documentKey(item) === selectedDocumentKey.value)) chooseDocument(list[0]);
});
watch(active, () => { detailMenuOpen.value = false; detailTab.value = 'info'; });

// ── 分页(仅作用于 ungroupedItems) ──
const totalPages = computed(() => Math.max(1, Math.ceil(browserItems.value.length / pageSize.value)));
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return browserItems.value.slice(start, start + pageSize.value);
});
// 筛选条件变化 / 切换分类 / 搜索时,回到第 1 页
watch([active, catFilter, keyword, knowledgeTypeFilter, sortOrder, viewMode], () => { currentPage.value = 1; });
watch(showKnowledgeTypeFilter, (visible) => { if (!visible) knowledgeTypeFilter.value = 'all'; });
// 当前页超出范围(如删除后)自动回退
watch(totalPages, (tp) => { if (currentPage.value > tp) currentPage.value = tp; });

const statCards = computed(() => [
  { label: '文档总数', value: allItems.value.length, icon: 'fa-file-lines', bg: 'var(--ui-brand)' },
  { label: '交付物', value: allItems.value.filter((i) => i.category === 'deliverable').length, icon: 'fa-box-open', bg: 'var(--ui-brand-light)' },
  { label: '知识模板', value: allItems.value.filter((i) => i.category === 'knowledge').length, icon: 'fa-lightbulb', bg: 'var(--ui-cyan)' },
  { label: '作战阶段', value: stages.value.length, icon: 'fa-layer-group', bg: 'var(--ui-brand-dark)' },
]);

function stageShort(i) {
  const st = stages.value[i];
  return st ? `阶段${CN_NUM[i]} · ${st.short || st.name}` : '';
}
function catLabel(c) {
  return { knowledge: '知识', deliverable: '交付物', spec: '规范' }[c] || '文档';
}
function catChipCls(c) {
  return {
    knowledge: 'cat-chip--kn',
    deliverable: 'cat-chip--dl',
    spec: 'cat-chip--sp',
  }[c] || 'cat-chip--sp';
}
function fmtColor(t) {
  return { md: 'var(--ui-cyan)', docx: 'var(--ui-brand)', doc: 'var(--ui-brand)', html: 'var(--ui-brand-light)', pdf: 'var(--ui-brand-deep)', pptx: 'var(--ui-brand-dark)' }[t] || 'var(--ui-text-2)';
}
function openDoc(item) {
  selectedProjectSlug.value = '';   // handbook 模式
  selected.value = item;
}

// [[wikilink]] 跳转:按标题在全库(handbook)查找目标文档并在抽屉里打开。
// 兼容带扩展名/文件名前缀数字的写法,匹配不到给出提示。
function navigateToDoc(title) {
  const norm = (s) => (s || '')
    .replace(/\.(md|docx?|html?|pdf|pptx|xlsx)$/i, '')   // 去扩展名
    .replace(/^\d+[-.\s]*/, '')                           // 去文件名前缀序号
    .replace(/【[^】]*】/g, '')                            // 去【知识·技术】类标注
    .replace(/\s+/g, '')
    .trim();
  const key = norm(title);
  // 先精确匹配标题,再退化为文件名匹配
  let hit = allItems.value.find((it) => norm(it.title) === key);
  if (!hit) hit = allItems.value.find((it) => norm(it.file) === key);
  if (!hit) hit = allItems.value.find((it) => norm(it.title).includes(key) || norm(it.file).includes(key));
  if (hit) {
    openDoc(hit);
  } else {
    showToast(`未找到「${title}」对应的知识文档`);
  }
}
// 「本项目产物」预览:复用同一抽屉,但走项目目录读取(relPath 相对项目根)
function openProjectDoc(pj, item) {
  selectedProjectSlug.value = pj.slug;
  selected.value = {
    ...item,
    // DocViewer 需要:relPath(相对项目根)+ title + type + category
    relPath: item.relPath,
    category: item.category || 'deliverable',
  };
}
</script>

<style scoped>
.kb-bg {
  background: var(--color-content-bg);
}
.kb-tree { width: 240px; background: color-mix(in srgb, hsl(var(--background)) 92%, hsl(var(--primary)) 4%) !important; border-color: var(--color-sidebar-border) !important; }

.kb-bg :deep(.btn-sm),
.kb-bg :deep(.btn-sm-pri) {
  height: 32px;
  padding: 0 13px;
  border-radius: 9px;
  font-size: 12.5px;
  gap: 6px;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}
.kb-bg :deep(.btn-sm:hover),
.kb-bg :deep(.btn-sm-pri:hover) {
  transform: translateY(-1px);
}
.kb-bg :deep(.btn-sm-pri) {
  box-shadow: 0 8px 18px hsl(var(--primary) / 18%);
}
.kb-bg :deep(.btn-sm-pri:hover) {
  box-shadow: 0 10px 24px hsl(var(--primary) / 24%);
}

/* 自适应卡片网格:列数随宽度自动增减(最小 260px 一列),窄屏 2 列宽屏可到 4-5 列 */
.kb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

/* 筛选按钮 */
.filter-chip {
  height: 31px;
  padding: 0 13px;
  border: 1px solid var(--ui-brand-soft-2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--ui-ink-3);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}
.filter-chip:hover {
  transform: translateY(-1px);
  border-color: var(--ui-brand-light);
  color: var(--ui-brand);
  background: var(--ui-brand-soft);
  box-shadow: 0 6px 16px hsl(var(--primary) / 8%);
}
.filter-chip--active {
  color: #fff;
  border-color: var(--ui-brand);
  background: linear-gradient(135deg, var(--ui-brand), var(--ui-brand-dark));
  box-shadow: 0 8px 18px hsl(var(--primary) / 20%);
}
.filter-chip--active:hover {
  color: #fff;
  background: linear-gradient(135deg, var(--ui-brand-dark), var(--ui-brand-deep));
}
.filter-chip--soft {
  height: 29px;
  padding: 0 11px;
  font-size: 12px;
}
.filter-divider {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--ui-brand-soft-2);
}

/* 分页按钮 */
.pgn {
  min-width: 31px;
  height: 31px;
  padding: 0 9px;
  border-radius: 9px;
  border: 1px solid var(--ui-brand-soft-2);
  background: rgba(255, 255, 255, 0.9);
  color: var(--ui-text-2);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}
.pgn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--ui-brand-light);
  color: var(--ui-brand);
  background: var(--ui-brand-soft);
  box-shadow: 0 6px 16px hsl(var(--primary) / 8%);
}
.pgn--cur {
  background: linear-gradient(135deg, var(--ui-brand), var(--ui-brand-dark));
  border-color: var(--ui-brand);
  color: #fff;
  font-weight: 650;
  box-shadow: 0 8px 18px hsl(var(--primary) / 18%);
}
.pgn:disabled { opacity: 0.42; cursor: not-allowed; }

.tree-node {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 12.5px;
  color: var(--ui-text);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}
.tree-node:hover {
  background: rgba(255, 255, 255, 0.72);
  color: var(--color-sidebar-text-strong);
  transform: translateX(1px);
  box-shadow: 0 4px 14px hsl(var(--primary) / 6%);
}
.tree-node:hover .tree-badge { transform: scale(1.04); }
.tree-node--active {
  background: linear-gradient(135deg, hsl(var(--primary) / 12%), hsl(var(--primary) / 8%));
  color: var(--color-sidebar-text-strong);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px hsl(var(--primary) / 9%);
}

.tree-badge {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.14);
  transition: transform 0.15s;
}
.tree-badge--all { background: var(--ui-text-2); }

.tree-count {
  font-size: 10.5px;
  color: var(--ui-text-3);
  background: var(--ui-bg-2);
  border-radius: 999px;
  padding: 1px 7px;
  flex-shrink: 0;
}
.tree-node--active .tree-count { color: var(--ui-brand); background: rgba(255, 255, 255, 0.76); }

.card-action {
  height: 28px;
  padding: 0 9px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.card-action:hover { transform: translateY(-1px); }
.card-action i { font-size: 10.5px; }
.card-action--primary { color: var(--ui-brand); }
.card-action--primary:hover { background: var(--ui-brand-soft); border-color: var(--ui-brand-soft-2); color: var(--ui-brand-dark); }
.card-action--danger { color: #dc2626; }
.card-action--danger:hover { background: #fef2f2; border-color: #fee2e2; color: #b91c1c; }

/* 统计卡片 */
.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, var(--ui-brand-soft));
  border: 1px solid var(--ui-bg-2);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}
.stat-card:hover {
  box-shadow: 0 10px 26px hsl(var(--primary) / 10%);
  transform: translateY(-2px);
  border-color: var(--ui-brand-soft-2);
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  flex-shrink: 0;
}

.kb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 146px;
  background: #fff;
  border: 1px solid var(--ui-line-2);
  border-radius: 14px;
  padding: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.22s ease, transform 0.22s ease, border-color 0.22s ease;
}
.kb-card__accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  opacity: 0;
  transition: opacity 0.22s ease;
}
.kb-card:hover {
  box-shadow: 0 12px 30px rgba(30, 58, 138, 0.13);
  transform: translateY(-3px);
  border-color: var(--ui-brand-soft-2);
}
.kb-card:hover .kb-card__accent { opacity: 1; }
.kb-card__footer {
  min-height: 41px;
  margin-top: auto;
}
.kb-card__actions { width: 118px; justify-content: flex-end; }
.kb-card__actions .card-action { width: 55px; justify-content: center; }

.fmt-badge {
  width: 40px;
  height: 48px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: 0 3px 8px hsl(var(--primary) / 22%);
}

.cat-chip {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  font-weight: 500;
}
.cat-chip--kn { background: var(--ui-brand-soft-2); color: var(--ui-cyan); }
.cat-chip--dl { background: var(--ui-brand-soft); color: var(--ui-brand); }
.cat-chip--sp { background: var(--ui-bg-2); color: var(--ui-text-2); }

/* 知识子类型分区圆点(蓝色系,深浅区分调研/技术/产品) */
.ktype-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: #fff;
  flex-shrink: 0;
}
.ktype-dot--调研 { background: var(--ui-cyan); }
.ktype-dot--技术 { background: var(--ui-brand); }
.ktype-dot--产品 { background: var(--ui-brand-dark); }

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.2s; }
.drawer-enter-active aside, .drawer-leave-active aside { transition: transform 0.25s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from aside, .drawer-leave-to aside { transform: translateX(100%); }

/* 可拖拽宽度的预览抽屉 */
.drawer-resizable {
  max-width: calc(100vw - 48px);
}
.drawer-resizable.is-resizing { transition: none !important; }
.drawer-resizer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 10px;
  margin-left: -5px;
  cursor: col-resize;
  z-index: 10;
}
.drawer-resizer::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 46px;
  border-radius: 2px;
  background: var(--ui-line-2);
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.drawer-resizer:hover::after,
.drawer-resizable.is-resizing .drawer-resizer::after {
  opacity: 1;
  background: var(--ui-brand);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

<style src="../../styles/resource-browser.css"></style>
<style scoped>
.resource-inline-preview { height: 540px; margin: 16px -12px 0; }
.resource-inline-preview :deep(.handbook-md) { font-size: 12px; }
.resource-inline-preview :deep(.px-5) { padding-left: 8px; padding-right: 8px; }
.resource-inline-preview :deep(.p-6) { padding: 12px 8px; }
.resource-inline-preview :deep(button) { padding-left: 5px; padding-right: 5px; font-size: 10px; }
</style>
