<template>
  <div class="resource-browser sk-bg">
    <aside class="resource-sidebar flex flex-col">
      <div class="resource-sidebar-heading">技能体系</div>
      <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <button
          class="tree-node"
          :class="active === 'all' ? 'tree-node--active' : ''"
          @click="active = 'all'"
        >
          <span class="tree-badge" style="background:var(--ui-text-2)"><i class="fa-solid fa-layer-group text-[10px]"></i></span>
          <span class="flex-1 text-left truncate">全部技能</span>
          <span class="tree-count">{{ skills.length }}</span>
        </button>

        <button class="tree-node tree-node--create" @click="openCreateGroup">
          <span class="tree-badge"><i class="fa-solid fa-plus text-[10px]"></i></span>
          <span class="flex-1 text-left truncate">新建分组</span>
        </button>
        <button
          v-for="g in groups"
          :key="g.id"
          class="tree-node"
          :class="active === g.id ? 'tree-node--active' : ''"
          @click="active = g.id; groupContextMenu = null"
          @contextmenu.prevent.stop="openGroupContextMenu($event, g)"
          @keydown.shift.f10.prevent="openGroupContextMenu($event, g)"
        >
          <span class="tree-badge" :style="{ background: accent(g.color || groupColor(g.id)) }">
            <i :class="faIcon(g.icon, 'toolbox') + ' text-[10px]'" />
          </span>
          <span class="flex-1 text-left truncate">{{ g.name }}</span>
          <span class="tree-count">{{ g.count }}</span>
        </button>
      </div>

      <div class="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400">
        <i class="fa-solid fa-circle-info mr-1"></i>共 <b class="text-slate-600">{{ skills.length }}</b> 项可调用技能
      </div>
    </aside>

    <div class="resource-workspace">
      <div class="resource-toolbar">
        <label class="resource-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="keyword" aria-label="搜索技能" placeholder="搜索技能、描述或标识…" /></label>
        <div class="resource-toolbar-actions">
          <button @click="refresh" :disabled="refreshing || importing" class="btn-sm" title="刷新技能"><i class="fa-solid fa-rotate" :class="{ 'fa-spin': refreshing }"></i></button>
          <button @click="startImport" :disabled="importing" class="btn-sm-pri"><i class="fa-solid fa-plus"></i>导入技能包</button>
          <button @click="openHub" class="btn-sm"><i class="fa-solid fa-store"></i>技能中心</button>
        </div>
      </div>
      <div class="resource-body">
        <main class="resource-center">
          <div class="resource-title"><span class="resource-title-icon"><i class="fa-solid fa-brain"></i></span><div><h1>{{ activeName }}<span>共 {{ filtered.length }} 个</span></h1><p>AI 内置的真实技能包 · 覆盖产品文档 / 原型 / 出图 / 陪练全链路</p></div></div>
          <div class="resource-filters">
            <button class="resource-filter" :class="{ 'is-active': active === 'all' && skillFilter === 'all' }" @click="active = 'all'; skillFilter = 'all'">全部 <span>{{ skills.length }}</span></button>
            <button class="resource-filter" :class="{ 'is-active': viewMode === 'group' }" @click="active = 'all'; skillFilter = 'all'; viewMode = 'group'">能力分组 <span>{{ groups.length }}</span></button>
            <button class="resource-filter" :class="{ 'is-active': active === 'product-doc' }" @click="active = 'product-doc'; skillFilter = 'all'">产品文档 <span>{{ skills.filter(s => s.group === 'product-doc').length }}</span></button>
            <button class="resource-filter" :class="{ 'is-active': skillFilter === 'visual' }" @click="active = 'all'; skillFilter = 'visual'">出图 / 可视化 <span>{{ skills.filter(s => ['report-image', 'dataviz'].includes(s.group)).length }}</span></button>
            <div class="resource-view-controls"><UiSelect field v-model="sortOrder" aria-label="技能排序" :options="[{ value: 'default', label: '默认排序' }, { value: 'name', label: '名称排序' }, { value: 'category', label: '分类排序' }]" /><div class="resource-view-toggle"><button :class="{ 'is-active': viewMode === 'list' }" @click="viewMode = 'list'"><i class="fa-solid fa-list mr-1"></i>列表</button><button :class="{ 'is-active': viewMode === 'group' }" @click="viewMode = 'group'"><i class="fa-solid fa-layer-group mr-1"></i>分组</button></div></div>
          </div>
          <ResourceList class="skills-readable-list" :show-selection-mark="false" summary-label="能做什么" :items="skillRows" :selected-key="selected?.id || ''" :grouped="viewMode === 'group'" name-label="技能名称" meta-label="版本" @select="openSkill" @action="openSkillActions" />
          <div v-if="totalPages > 1" class="resource-pagination"><button class="pgn" :disabled="currentPage <= 1" @click="currentPage--"><i class="fa-solid fa-chevron-left"></i></button><button v-for="p in totalPages" :key="p" class="pgn" :class="{ 'pgn--cur': currentPage === p }" @click="currentPage = p">{{ p }}</button><button class="pgn" :disabled="currentPage >= totalPages" @click="currentPage++"><i class="fa-solid fa-chevron-right"></i></button></div>
        </main>
        <aside class="resource-detail" aria-label="技能详情">
          <div v-if="selected" class="resource-detail-scroll">
            <div class="resource-detail-heading"><span class="resource-icon" :style="{ background: accent(selected.color) }"><i :class="faIcon(selected.icon, 'cube')"></i></span><div class="min-w-0"><h2>{{ selectedPresentation.name }}</h2><span class="resource-tag mt-1">{{ groupName(selected.group) }}</span></div></div>
            <p class="resource-detail-description">{{ selectedPresentation.purpose }}</p>
            <dl class="skill-outcomes"><dt>你提供</dt><dd>{{ selectedPresentation.input }}</dd><dt>你得到</dt><dd>{{ selectedPresentation.output }}</dd></dl>
            <div class="resource-detail-actions"><button class="btn-sm-pri" @click="useSkill"><i class="fa-solid fa-play"></i>立即使用</button><div class="resource-detail-menu"><button class="btn-sm" aria-label="更多技能操作" :aria-expanded="detailMenuOpen" @click="detailMenuOpen = !detailMenuOpen"><i class="fa-solid fa-ellipsis"></i></button><div v-if="detailMenuOpen" class="resource-detail-menu-popover"><button @click="detailMenuOpen = false; startEdit()"><i class="fa-solid fa-pen mr-2"></i>编辑技能</button><button @click="detailMenuOpen = false; openDir(selected)"><i class="fa-solid fa-folder-open mr-2"></i>打开目录</button><button @click="detailMenuOpen = false; deleteSkill(selected)" :disabled="deleting" class="text-red-600"><i class="fa-solid fa-trash mr-2"></i>删除技能</button></div></div></div>
            <div class="resource-detail-tabs" role="tablist" aria-label="技能详情分类"><button v-for="tab in skillDetailTabs" :key="tab.key" role="tab" :aria-selected="detailTab === tab.key" :class="{ 'is-active': detailTab === tab.key }" @click="detailTab = tab.key">{{ tab.label }}</button></div>
            <template v-if="detailTab === 'info'">
              <dl class="resource-detail-info"><dt><i class="fa-solid fa-fingerprint"></i>技能 ID</dt><dd>{{ selected.id }}</dd><dt><i class="fa-regular fa-folder"></i>分类</dt><dd><span class="resource-tag">{{ groupName(selected.group) }}</span></dd><dt><i class="fa-solid fa-box"></i>来源</dt><dd>{{ selected.builtin ? '内置技能' : selected.generated ? '自动生成' : '本地导入' }}</dd><dt><i class="fa-solid fa-code-branch"></i>版本</dt><dd>{{ selected.version ? 'v' + selected.version : '未标注' }}</dd></dl>
              <div class="resource-detail-section"><h3>分类标签</h3><div class="resource-detail-tags"><span class="resource-tag">{{ groupName(selected.group) }}</span><span class="resource-tag">{{ selected.builtin ? '内置' : '自定义' }}</span></div></div>
              <div class="resource-detail-section"><h3>相关文档</h3><button class="resource-detail-file" @click="detailTab = 'document'"><i class="fa-regular fa-file-lines text-blue-600"></i>{{ selected.file || 'SKILL.md' }}<i class="fa-solid fa-chevron-right ml-auto text-[10px]"></i></button></div>
              <div class="resource-detail-section"><h3>调用方式</h3><p>{{ selected.id === 'fde-coach' ? '点击“立即使用”，启动 FDE 教练陪练。' : '点击“立即使用”，在 AI 助手中启动这个技能。' }}</p><code class="mt-2 block rounded-lg bg-blue-50 p-3 text-[11px] text-blue-700">/{{ selected.id }}</code></div>
            </template>
            <div v-else-if="loading" class="resource-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><p>正在读取技能…</p></div>
            <div v-else-if="error" class="resource-empty"><p>{{ error }}</p></div>
            <div v-else-if="detailTab === 'document'" class="resource-detail-markdown" v-html="rendered"></div>
            <div v-else-if="skillExamples" class="resource-detail-markdown" v-html="skillExamples"></div>
            <div v-else class="resource-empty"><p>这份技能暂未单独提供使用示例。<br />可以在“相关文档”中查看完整说明。</p></div>
          </div>
          <div v-else class="resource-empty"><i class="fa-solid fa-brain"></i><p>选择一个技能查看详情</p></div>
        </aside>
      </div>
    </div>

    <div v-if="groupContextMenu" class="fixed inset-0 z-[60]" @click.self="groupContextMenu = null" @contextmenu.prevent.self="groupContextMenu = null" @keydown.esc="groupContextMenu = null">
      <div role="menu" aria-label="分组操作" class="skill-group-context" :style="{ left: groupContextMenu.x + 'px', top: groupContextMenu.y + 'px' }">
        <button role="menuitem" autofocus @click="requestDeleteGroup(groupContextMenu.group)"><i class="fa-regular fa-trash-can" aria-hidden="true"></i>删除分组</button>
      </div>
    </div>
    <div v-if="deleteGroupTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" @click.self="!deletingGroup && (deleteGroupTarget = null)">
      <section role="dialog" aria-modal="true" aria-label="删除技能分组" class="w-[360px] rounded-2xl bg-white p-5 shadow-xl">
        <h2 class="text-[15px] font-semibold text-slate-800">删除分组「{{ deleteGroupTarget.name }}」？</h2>
        <p class="mt-3 text-[13px] leading-6 text-slate-600">只移除分组。组内技能会回到原分类或“通用工具”，技能文件会保留。</p>
        <p v-if="deleteGroupError" role="alert" class="mt-3 text-[12px] text-red-600">{{ deleteGroupError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-sm" :disabled="deletingGroup" @click="deleteGroupTarget = null">取消</button>
          <button class="btn-sm-pri" :disabled="deletingGroup" @click="confirmDeleteGroup">{{ deletingGroup ? '删除中…' : '删除分组' }}</button>
        </div>
      </section>
    </div>
    <div v-if="lastDeletedGroup" class="skill-group-undo" role="status">
      <span>已删除分组「{{ lastDeletedGroup.name }}」</span>
      <button :disabled="deletingGroup" @click="undoDeleteGroup">撤销</button>
      <button aria-label="关闭分组删除提示" :disabled="deletingGroup" @click="lastDeletedGroup = null">×</button>
    </div>

    <!-- ── 技能说明抽屉 ────────────────────────── -->
    <transition name="drawer">
      <div v-if="selected && editing" class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-slate-900/40" @click="!editing && (selected = null)"></div>
        <aside
          class="drawer-resizable absolute right-0 top-0 bottom-0 glass-card shadow-2xl flex flex-col"
          :class="{ 'is-resizing': resizing }"
          :style="{ width: drawerWidth + 'px' }"
        >
          <div class="drawer-resizer" @mousedown.prevent="startResize" title="拖动调整宽度"></div>
          <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200/80 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" :style="{ background: accent(selected.color) }">
                <i :class="faIcon(selected.icon, 'cube')"></i>
              </span>
              <div class="min-w-0">
                <div class="text-[13px] font-semibold text-slate-800 truncate">{{ selected.name }}</div>
                <div class="text-[11px] text-slate-400">{{ groupName(selected.group) }}<span v-if="selected.version"> · v{{ selected.version }}</span></div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <template v-if="!editing">
                <button @click="startEdit()" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-blue-600 hover:bg-blue-50 transition" title="编辑技能">
                  <i class="fa-solid fa-pen text-[11px]"></i><span>编辑</span>
                </button>
                <button @click="openDir(selected)" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 hover:bg-slate-100 transition" title="打开技能目录">
                  <i class="fa-solid fa-folder-open text-[11px]"></i><span>打开目录</span>
                </button>
                <button @click="deleteSkill(selected)" :disabled="deleting" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-danger hover:bg-danger-soft transition disabled:opacity-50" title="删除技能">
                  <i class="fa-solid fa-trash text-[11px]"></i><span>删除</span>
                </button>
                <button @click="selected = null" class="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 transition"><i class="fa-solid fa-xmark"></i></button>
              </template>
              <template v-else>
                <button @click="saveEdit()" :disabled="saving" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50" title="保存">
                  <i class="fa-solid text-[11px]" :class="saving ? 'fa-spinner fa-spin' : 'fa-check'"></i><span>{{ saving ? '保存中…' : '保存' }}</span>
                </button>
                <button @click="cancelEdit()" :disabled="saving" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 hover:bg-slate-100 transition disabled:opacity-50" title="取消">
                  <i class="fa-solid fa-xmark text-[11px]"></i><span>取消</span>
                </button>
              </template>
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-6 glass-card">
            <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-slate-400">
              <div class="w-8 h-8 rounded-full border-2 border-blue-100 border-t-blue-500 animate-spin mb-3"></div>
              <span class="text-[12px]">加载中…</span>
            </div>
            <div v-else-if="error" class="flex flex-col items-center justify-center py-20 text-slate-400">
              <i class="fa-solid fa-triangle-exclamation text-xl mb-2 text-amber-400"></i>
              <span class="text-[12px]">{{ error }}</span>
            </div>
            <div v-else-if="!editing" class="prose prose-sm prose-slate max-w-none skill-md" v-html="rendered"></div>
            <!-- 编辑表单 -->
            <div v-else class="space-y-4">
              <div>
                <label class="block text-[12px] font-medium text-slate-600 mb-1.5">名称</label>
                <input v-model="form.name" type="text" placeholder="技能显示名称"
                  class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[12px] font-medium text-slate-600 mb-1.5">分类</label>
                  <UiSelect field v-model="form.category" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 glass-card focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" :options="[...(skillGroupOptions).map((g) => ({ value: g.id, label: String(g.name) }))]" />
                </div>
                <div>
                  <label class="block text-[12px] font-medium text-slate-600 mb-1.5">图标 <span class="text-slate-400 font-normal">(Font Awesome 名)</span></label>
                  <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" :style="{ background: accent(selected.color) }">
                      <i :class="faIcon(form.icon, 'cube')"></i>
                    </span>
                    <input v-model="form.icon" type="text" placeholder="如 star / wand-magic-sparkles"
                      class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
              </div>
              <div>
                <label class="block text-[12px] font-medium text-slate-600 mb-1.5">描述</label>
                <textarea v-model="form.description" rows="3" placeholder="技能触发描述(agent 据此判断何时调用)"
                  class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 leading-relaxed resize-y focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"></textarea>
              </div>
              <div>
                <label class="block text-[12px] font-medium text-slate-600 mb-1.5">正文 <span class="text-slate-400 font-normal">(Markdown)</span></label>
                <textarea v-model="form.body" rows="18" spellcheck="false" placeholder="技能正文(Markdown)"
                  class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[12.5px] font-mono text-slate-800 leading-relaxed resize-y focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"></textarea>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </transition>

    <!-- ── 技能中心(SkillHub)抽屉 ────────────────────────── -->
    <transition name="drawer">
      <div v-if="hubOpen" class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-slate-900/40" @click="hubOpen = false"></div>
        <aside class="absolute right-0 top-0 bottom-0 w-[1100px] max-w-[95vw] glass-card shadow-2xl flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200/80 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-blue-500 to-blue-700">
                <i class="fa-solid fa-cloud-arrow-down"></i>
              </span>
              <div class="min-w-0">
                <div class="text-[13px] font-semibold text-slate-800 truncate">技能中心</div>
                <div class="text-[11px] text-slate-400">从 360 SkillHub 搜索并安装技能</div>
              </div>
            </div>
            <button @click="hubOpen = false" class="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 transition cursor-pointer active:scale-95 shrink-0"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <!-- 两栏布局 -->
          <div class="flex-1 min-h-0 flex">
            <!-- 左侧:搜索 + 分类树 -->
            <aside class="w-[200px] shrink-0 flex flex-col border-r border-slate-200/70 glass-card">
              <div class="px-3 pt-3 pb-2.5 border-b border-slate-100 shrink-0">
                <div class="relative">
                  <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]"></i>
                  <input
                    v-model="hubKeyword"
                    type="text"
                    placeholder="搜索技能…"
                    class="w-full text-[12px] bg-slate-50 border border-transparent focus:bg-white focus:border-blue-400 rounded-md pl-7 pr-2.5 py-1.5 focus:outline-none transition"
                  />
                </div>
              </div>
              <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                <button
                  v-for="cat in hubVisibleCategories"
                  :key="cat.id"
                  class="tree-node"
                  :class="hubActiveCat === cat.id ? 'tree-node--active' : ''"
                  @click="hubActiveCat = cat.id"
                >
                  <span class="tree-badge" :style="{ background: accent(cat.color) }">
                    <i :class="'fa-solid fa-' + cat.icon + ' text-[10px]'"></i>
                  </span>
                  <span class="flex-1 text-left truncate">{{ cat.name }}</span>
                </button>
              </div>
            </aside>

            <!-- 右侧:卡片网格 + 分页 -->
            <div class="flex-1 min-w-0 overflow-y-auto bg-transparent/40">
              <div class="px-5 py-4">
                <!-- 结果头 -->
                <div class="flex items-center gap-2 mb-3">
                  <h2 class="text-[14px] font-bold text-slate-800">{{ hubCatName(hubActiveCat) }}</h2>
                  <span class="text-[11.5px] text-slate-400">第 {{ hubPageNum }} 页 · 本页 {{ hubItems.length }} 项</span>
                </div>

                <!-- 加载中 -->
                <div v-if="hubLoading && !hubItems.length" class="flex flex-col items-center justify-center py-24 text-slate-400">
                  <div class="w-8 h-8 rounded-full border-2 border-blue-100 border-t-blue-500 animate-spin mb-3"></div>
                  <span class="text-[12px]">搜索中…</span>
                </div>

                <!-- 空态 -->
                <div v-else-if="hubError" role="alert" class="flex flex-col items-center justify-center py-20 text-slate-500"><p class="text-[12.5px]">{{ hubError }}</p><button class="btn-sm mt-3" @click="hubResetAndSearch">重新加载</button></div>
                <div v-else-if="!hubItems.length" class="flex flex-col items-center justify-center py-24 text-slate-300">
                  <i class="fa-solid fa-inbox text-4xl mb-3"></i>
                  <p class="text-[12.5px]">没有找到匹配的技能</p>
                </div>

                <!-- 卡片网格 -->
                <div v-else class="hub-grid" :class="hubLoading ? 'opacity-50 pointer-events-none' : ''">
                  <div v-for="item in hubItems" :key="item.slug" class="sk-card cursor-default">
                    <div class="sk-card__accent" style="background:var(--ui-brand)"></div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-[13px] font-semibold text-slate-800 truncate flex-1 min-w-0">{{ item.displayName || item.name }}</h3>
                      <span v-if="item.version" class="text-[10px] text-slate-400 shrink-0">v{{ item.version }}</span>
                    </div>
                    <p class="text-[11.5px] text-slate-500 mt-2 leading-relaxed line-clamp-2">{{ item.summary || '——' }}</p>
                    <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-slate-400">
                      <span><i class="fa-solid fa-download mr-1"></i>{{ formatCount(item.downloads) }}</span>
                      <span><i class="fa-solid fa-star mr-1 text-amber-400"></i>{{ item.stars ?? 0 }}</span>
                      <span v-if="item.owner" class="truncate max-w-[90px]"><i class="fa-solid fa-user mr-1"></i>{{ item.owner }}</span>
                      <span v-if="item.securityStatus === 'safe'" class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">
                        <i class="fa-solid fa-shield-halved mr-0.5"></i>安全
                      </span>
                    </div>
                    <div class="mt-3">
                      <span
                        v-if="isInstalled(item)"
                        class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-100 text-slate-400 cursor-default"
                      >
                        <i class="fa-solid fa-check text-[11px]"></i>已安装
                      </span>
                      <button
                        v-else
                        @click="installFromHub(item)"
                        :disabled="!!hubInstalling"
                        class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
                      >
                        <i class="fa-solid text-[11px]" :class="hubInstalling === item.slug ? 'fa-spinner fa-spin' : 'fa-download'"></i>安装
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 分页条:游标式上一页/下一页 -->
                <div v-if="hubItems.length && (hubPrevCursors.length > 0 || hubNextCursor)" class="flex items-center justify-center gap-3 mt-6">
                  <button
                    class="pgn cursor-pointer active:scale-95"
                    :disabled="hubPrevCursors.length === 0 || hubLoading"
                    @click="hubPrevPage"
                  >
                    <i class="fa-solid fa-chevron-left text-[10px] mr-1"></i>上一页
                  </button>
                  <span class="text-[12px] text-slate-400">第 {{ hubPageNum }} 页</span>
                  <button
                    class="pgn cursor-pointer active:scale-95"
                    :disabled="!hubNextCursor || hubLoading"
                    @click="hubNextPage"
                  >
                    下一页<i class="fa-solid fa-chevron-right text-[10px] ml-1"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </transition>
    <transition name="fade">
      <div v-if="importing || importResult" class="fixed inset-0 z-[55] flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/40"></div>
        <div class="relative w-[420px] max-w-[92vw] glass-card rounded-2xl shadow-2xl p-6">
          <div class="flex items-center gap-2 mb-5">
            <i class="fa-solid fa-file-zipper text-blue-600"></i>
            <span class="text-[15px] font-bold text-slate-800">导入技能包</span>
            <button v-if="importResult" @click="closeImport" class="ml-auto w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <!-- 进行中 / 成功:进度条 -->
          <template v-if="!importError">
            <div class="flex items-center justify-between text-[12px] mb-1.5">
              <span class="text-slate-500">{{ progressMsg }}</span>
              <span class="font-mono text-slate-400">{{ progressPct }}%</span>
            </div>
            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300" :style="{ width: progressPct + '%' }"></div>
            </div>
            <div v-if="importResult && !importError" class="mt-5 flex items-center gap-2 text-[13px] text-blue-600">
              <i class="fa-solid fa-circle-check"></i>技能「{{ importResult.skillId }}」导入成功
            </div>
          </template>

          <!-- 失败:校验不通过 -->
          <div v-else class="flex flex-col items-center text-center py-3">
            <i class="fa-solid fa-triangle-exclamation text-2xl text-amber-500 mb-3"></i>
            <p class="text-[13px] font-medium text-slate-700 mb-1">导入失败</p>
            <p class="text-[12px] text-slate-400 leading-relaxed">{{ importError }}</p>
          </div>

          <button
            v-if="importResult"
            @click="closeImport"
            class="w-full mt-6 py-2.5 rounded-lg text-[13px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >完成</button>
        </div>
      </div>
    </transition>

    <!-- Toast -->
    <transition name="fade">
      <div v-if="createGroupOpen" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/40" @click="!creatingGroup && (createGroupOpen = false)"></div>
        <div class="relative w-[380px] max-w-[92vw] glass-card rounded-2xl shadow-2xl p-6">
          <div class="flex items-center gap-2 mb-4"><i class="fa-solid fa-folder-plus text-primary"></i><b>新建技能分组</b></div>
          <label class="block text-[12px] text-slate-600 mb-1.5">分组名称</label>
          <input v-model="newGroup.name" autofocus class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] mb-4" placeholder="例如：客户交付" @keyup.enter="createGroup" />
          <div class="grid grid-cols-2 gap-3 mb-5">
            <div><label class="block text-[12px] text-slate-600 mb-1.5">图标</label><input v-model="newGroup.icon" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px]" placeholder="folder" /></div>
            <div><label class="block text-[12px] text-slate-600 mb-1.5">颜色</label><input v-model="newGroup.color" type="color" class="w-full h-9 rounded-lg border border-slate-200" /></div>
          </div>
          <p v-if="groupError" role="alert" class="mb-3 text-[12px] text-red-600">{{ groupError }}</p>
          <div class="flex justify-end gap-2"><button class="btn-sm" :disabled="creatingGroup" @click="createGroupOpen = false">取消</button><button class="btn-sm-pri" :disabled="creatingGroup" @click="createGroup">{{ creatingGroup ? '创建中…' : '创建分组' }}</button></div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="toast" class="fixed top-4 right-4 z-[60] bg-slate-800 text-white text-[13px] px-3.5 py-2 rounded-lg shadow-lg flex items-center gap-2">
        <i class="fa-solid fa-circle-check text-blue-400"></i>{{ toast }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { useAccentColor } from '@/composables/useAccentColor.js';
const { accent } = useAccentColor();
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { skillPresentation, skillDestination } from '@/data/skill-launch';
import { marked } from 'marked';
import ResourceList from '@/components/common/ResourceList.vue';
import { useRouter } from 'vue-router';
const router = useRouter();
import { useDrawerResize } from '@/composables/useDrawerResize.js';
const { width: drawerWidth, resizing, startResize } = useDrawerResize('sk.drawerWidth');

const groups = ref([]);
const skills = ref([]);
const active = ref('all');
const keyword = ref('');
const skillFilter = ref('all');
const sortOrder = ref('default');
const viewMode = ref('list');
const detailTab = ref('info');
const detailMenuOpen = ref(false);
const skillSource = ref('');
const skillDetailTabs = [{ key: 'info', label: '基础信息' }, { key: 'document', label: '相关文档' }, { key: 'examples', label: '使用示例' }];
const selected = ref(null);
const loading = ref(false);
const error = ref('');
const rendered = ref('');
const refreshing = ref(false);
const deleting = ref(false);
const toast = ref('');

// 技能编辑态。form 收集结构化字段,YAML 合并全在主进程做(skills:write)。
const editing = ref(false);
const saving = ref(false);
const form = ref({ name: '', description: '', body: '', category: 'general', icon: '' });

// 编辑时的分类下拉选项 —— 与主进程 SKILLS_GROUPS 同 id/中文名(不可复用 hubCategories
// 那是 SkillHub 的 API tag;也不可用 groups ref 它只含 count>0 的组)。
const createGroupOpen = ref(false);
const creatingGroup = ref(false);
const groupError = ref('');
const newGroup = ref({ name: '', icon: 'folder', color: '#64748b' });

function openCreateGroup() {
  newGroup.value = { name: '', icon: 'folder', color: '#64748b' };
  groupError.value = '';
  createGroupOpen.value = true;
}
async function createGroup() {
  if (creatingGroup.value) return;
  const name = newGroup.value.name.trim();
  groupError.value = '';
  if (!name) { groupError.value = '请输入分组名称'; return; }
  if (groups.value.some(g => g.name === name)) { groupError.value = '分组名称已存在'; return; }
  creatingGroup.value = true;
  try {
    // IPC 只接收普通对象，不能直接发送 Vue 的响应式 Proxy。
    const payload = { name, icon: String(newGroup.value.icon || 'folder'), color: String(newGroup.value.color || '#64748b') };
    const res = await window.api.skills.createGroup(payload);
    if (!res?.success) throw new Error(res?.error || '创建失败');
    if (!await loadManifest()) throw new Error('分组已保存，但清单读取失败，请刷新技能库');
    active.value = res.group.id;
    keyword.value = '';
    skillFilter.value = 'all';
    createGroupOpen.value = false;
    showToast('分组已创建');
  } catch (e) { groupError.value = e.message || '创建失败，请重试'; }
  finally { creatingGroup.value = false; }
}
const groupContextMenu = ref(null);
function openGroupContextMenu(event, group) {
  groupContextMenu.value = null;
  if (!group?.custom || deletingGroup.value || editing.value || saving.value) return;
  const rect = event.currentTarget?.getBoundingClientRect();
  const x = event.type === 'keydown' ? rect?.left : event.clientX;
  const y = event.type === 'keydown' ? rect?.bottom : event.clientY;
  groupContextMenu.value = {
    group,
    x: Math.max(8, Math.min(Number(x) || 8, window.innerWidth - 160)),
    y: Math.max(8, Math.min(Number(y) || 8, window.innerHeight - 56)),
  };
}
const deletingGroup = ref(false);
const deleteGroupTarget = ref(null);
const deleteGroupError = ref('');
const lastDeletedGroup = ref(null);
function requestDeleteGroup(group) {
  if (!group?.custom || deletingGroup.value || editing.value || saving.value) return;
  groupContextMenu.value = null;
  deleteGroupTarget.value = { id: group.id, name: group.name, icon: group.icon, color: group.color };
  deleteGroupError.value = '';
}
async function confirmDeleteGroup() {
  if (!deleteGroupTarget.value || deletingGroup.value) return;
  deletingGroup.value = true;
  const group = { ...deleteGroupTarget.value };
  try {
    const res = await window.api.skills.deleteGroup(group.id);
    if (!res?.success) throw new Error(res?.error || '删除分组失败');
    lastDeletedGroup.value = group;
    deleteGroupTarget.value = null;
    if (active.value === group.id) active.value = 'all';
    if (!await loadManifest()) showToast('分组已删除，请刷新技能库');
  } catch (error) { deleteGroupError.value = error.message || '删除分组失败'; }
  finally { deletingGroup.value = false; }
}
async function undoDeleteGroup() {
  if (!lastDeletedGroup.value || deletingGroup.value) return;
  deletingGroup.value = true;
  try {
    const res = await window.api.skills.createGroup({ ...lastDeletedGroup.value });
    if (!res?.success) throw new Error(res?.error || '恢复分组失败');
    lastDeletedGroup.value = null;
    if (await loadManifest()) active.value = res.group.id;
    showToast('分组已恢复');
  } catch (error) { showToast('恢复分组失败：' + (error.message || error)); }
  finally { deletingGroup.value = false; }
}

const SKILL_GROUP_OPTIONS = [
  { id: 'product-doc',  name: '产品文档' },
  { id: 'prototype',    name: '原型设计' },
  { id: 'report-image', name: '汇报出图' },
  { id: 'dataviz',      name: '数据可视化' },
  { id: 'coach',        name: '教练陪练' },
  { id: 'thinking',     name: '思考协作' },
  { id: 'general',      name: '通用工具' },
];

const skillGroupOptions = computed(() => [
  ...SKILL_GROUP_OPTIONS,
  ...groups.value.filter(group => !SKILL_GROUP_OPTIONS.some(item => item.id === group.id)),
]);

function showToast(msg) {
  toast.value = msg;
  setTimeout(() => { toast.value = ''; }, 2600);
}

// 导入技能包状态
const importing = ref(false);
const importResult = ref(null);
const importError = ref('');
const progressPct = ref(0);
const progressMsg = ref('');
let offProgress = null;

// 技能中心(SkillHub)状态 —— 服务端搜索/分类过滤 + 游标翻页
const hubOpen = ref(false);
const hubKeyword = ref('');
const hubActiveCat = ref('all'); // 当前选中分类(走服务端 tag 过滤)
const hubItems = ref([]);        // 当前页技能(翻页替换,不累积)
const hubPrevCursors = ref([]);  // 游标栈:每页起始游标,用于"上一页"回退
const hubNextCursor = ref(null); // 下一页游标(本页返回的 nextCursor)
const hubPageNum = ref(1);       // 当前页码(仅显示用)
const hubLoading = ref(false);
const hubError = ref('');
let hubRequestSeq = 0;
const hubInstalling = ref(''); // 正在安装的 slug
let hubDebounce = null;

// 分类映射(API tag → 中文名 + 图标 + 颜色)。分类过滤走服务端 tag 参数
const hubCategories = [
  { id: 'all', name: '全部分类', icon: 'layer-group', color: 'var(--ui-text-2)' },
  { id: 'efficiency', name: '效率', icon: 'gauge-high', color: 'var(--ui-brand)' },
  { id: 'creativity', name: '创作', icon: 'wand-magic-sparkles', color: 'var(--ui-violet)' },
  { id: 'knowledge', name: '知识', icon: 'book', color: 'var(--ui-cyan)' },
  { id: 'search', name: '搜索', icon: 'magnifying-glass', color: 'var(--ui-cyan)' },
  { id: 'marketing', name: '营销', icon: 'bullhorn', color: '#db2777' },
  { id: 'development', name: '开发', icon: 'code', color: 'var(--ui-brand-dark)' },
  { id: 'data', name: '数据', icon: 'chart-column', color: '#059669' },
  { id: 'collaboration', name: '协作', icon: 'users', color: '#d97706' },
  { id: 'automation', name: '自动化', icon: 'robot', color: 'var(--ui-accent)' },
  { id: 'security', name: '安全', icon: 'shield-halved', color: '#dc2626' },
  { id: 'lifestyle', name: '生活', icon: 'mug-hot', color: '#ea580c' },
];
function hubCatName(id) {
  return hubCategories.find((c) => c.id === id)?.name || id;
}

async function loadManifest() {
  try {
    const res = await window.api.skills.getManifest();
    if (res && res.success && res.data) {
      skills.value = (res.data.skills || []).map(skill => ({ ...skill, group: skillPresentation(skill).group }));
      groups.value = (res.data.groups || []).map(group => ({ ...group, count: skills.value.filter(skill => skill.group === group.id).length })).filter(group => group.count || group.custom);
      error.value = '';
      return true;
    } else {
      error.value = res?.error || '技能清单读取失败';
      return false;
    }
  } catch (e) {
    error.value = e.message || '技能清单读取失败';
    return false;
  }
}

onMounted(() => {
  loadManifest();
  // 订阅主进程的导入进度事件
  offProgress = window.api.skills.onImportProgress((p) => {
    progressPct.value = p.percent ?? progressPct.value;
    progressMsg.value = p.message || '';
  });
});

onUnmounted(() => { if (offProgress) offProgress(); });

async function startImport() {
  if (importing.value) return;
  importing.value = true;
  importResult.value = null;
  importError.value = '';
  progressPct.value = 0;
  progressMsg.value = '等待选择文件…';
  try {
    const res = await window.api.skills.importZip();
    if (res && res.success) {
      progressPct.value = 100;
      importResult.value = res;
      if (!await loadManifest() || !skills.value.some(skill => skill.id === res.skillId)) throw new Error('技能包已写入，但未能读取安装结果，请刷新技能库');
      keyword.value = '';
      skillFilter.value = 'all';
      if (res.skillId) {
        const g = skills.value.find((s) => s.id === res.skillId)?.group;
        if (g) active.value = g;
      }
    } else if (res && res.canceled) {
      // 用户取消:静默关闭
      importing.value = false;
      return;
    } else {
      importError.value = res?.error || '导入失败';
      importResult.value = { skillId: '' };
    }
  } catch (e) {
    importError.value = e.message || String(e);
    importResult.value = { skillId: '' };
  } finally {
    importing.value = false;
  }
}

function closeImport() {
  importResult.value = null;
  importError.value = '';
  progressPct.value = 0;
}

// ── 技能中心(SkillHub)──
function openHub() {
  hubOpen.value = true;
  if (!hubItems.value.length) hubResetAndSearch();
}

// 加载一页(cursor 为 null 即第一页)。结果替换 hubItems,并记录 nextCursor 供翻页
async function hubLoadPage(cursor) {
  const requestId = ++hubRequestSeq;
  hubLoading.value = true;
  hubError.value = '';
  const q = hubKeyword.value.trim();
  try {
    const res = await window.api.skills.hubSearch(q, hubActiveCat.value, 24, cursor);
    if (requestId !== hubRequestSeq) return;
    if (!res?.success) throw new Error(res?.error || '技能中心加载失败');
    hubItems.value = res.items || [];
    hubNextCursor.value = res.nextCursor || null;
  } catch (e) {
    if (requestId !== hubRequestSeq) return;
    hubItems.value = [];
    hubNextCursor.value = null;
    hubError.value = e.message || '技能中心加载失败，请重试';
  } finally { if (requestId === hubRequestSeq) hubLoading.value = false; }
}

// 重新搜索:清空游标栈,回到第一页(关键词变化 / 切分类时调用)
function hubResetAndSearch() {
  hubPrevCursors.value = [];
  hubPageNum.value = 1;
  hubLoadPage(null);
}

// 下一页:把"进入下一页所用的游标"压栈,便于回退
function hubNextPage() {
  if (!hubNextCursor.value || hubLoading.value) return;
  hubPrevCursors.value.push(hubNextCursor.value);
  hubPageNum.value += 1;
  hubLoadPage(hubNextCursor.value);
}

// 上一页:弹出当前页游标,用上一页的游标重新加载
function hubPrevPage() {
  if (hubPrevCursors.value.length === 0 || hubLoading.value) return;
  hubPrevCursors.value.pop();           // 移除当前页游标
  const prevCursor = hubPrevCursors.value.length
    ? hubPrevCursors.value[hubPrevCursors.value.length - 1]
    : null;                             // 栈空 → 回第一页
  hubPageNum.value = Math.max(1, hubPageNum.value - 1);
  hubLoadPage(prevCursor);
}

watch(hubKeyword, () => {
  if (hubDebounce) clearTimeout(hubDebounce);
  hubDebounce = setTimeout(() => { hubResetAndSearch(); }, 300);
});
watch(hubActiveCat, () => { hubResetAndSearch(); });

// 展示全部预设分类(服务端过滤,前端无法预判哪个分类有货)
const hubVisibleCategories = computed(() => hubCategories);

function isInstalled(item) {
  return skills.value.some((s) =>
    s.id === item.slug ||
    s.id === item.name ||
    s.name === item.displayName ||
    s.name === item.name
  );
}

function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 10000) return (v / 10000).toFixed(1) + '万';
  return String(v);
}

async function installFromHub(item) {
  if (importing.value || hubInstalling.value) return;
  importing.value = true;
  importResult.value = null;
  importError.value = '';
  progressPct.value = 0;
  progressMsg.value = '准备下载…';
  hubInstalling.value = item.slug;
  try {
    // item 来自 hubItems(ref)，是 Vue reactive Proxy，直接过 IPC 会触发
    // structured-clone 失败(An object could not be cloned)。传前摊平成纯 JSON。
    const plain = JSON.parse(JSON.stringify(item));
    const res = await window.api.skills.hubInstall(plain);
    if (res && res.success) {
      progressPct.value = 100;
      importResult.value = { skillId: res.skillId || item.displayName || item.name };
      if (!await loadManifest() || !skills.value.some(skill => skill.id === res.skillId)) throw new Error('技能包已写入，但未能读取安装结果，请刷新技能库');
      showToast(`技能「${item.displayName || item.name}」安装成功`);
    } else {
      importError.value = res?.error || '安装失败';
      importResult.value = { skillId: '' };
      showToast('安装失败:' + (res?.error || '未知错误'));
    }
  } catch (e) {
    importError.value = e.message || String(e);
    importResult.value = { skillId: '' };
    showToast('安装失败:' + (e.message || e));
  } finally {
    importing.value = false;
    hubInstalling.value = '';
  }
}

const activeName = computed(() => {
  if (skillFilter.value === 'visual') return '出图 / 可视化';
  if (active.value === 'all') return '全部技能';
  return groups.value.find((g) => g.id === active.value)?.name || '全部技能';
});

const filtered = computed(() => {
  let list = active.value === 'all' ? skills.value : skills.value.filter((s) => s.group === active.value);
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase();
    list = list.filter((s) => `${skillPresentation(s).name} ${skillPresentation(s).purpose} ${s.name} ${s.description || s.summary || ''} ${s.id}`.toLowerCase().includes(kw));
  }
  if (skillFilter.value === 'visual') list = list.filter(s => ['report-image', 'dataviz'].includes(s.group));
  return [...list].sort((a, b) => (viewMode.value === 'group' || sortOrder.value === 'category' ? groupName(a.group).localeCompare(groupName(b.group), 'zh-CN') : 0) || (sortOrder.value === 'name' ? skillPresentation(a).name.localeCompare(skillPresentation(b).name, 'zh-CN') : 0));
});

const skillExamples = computed(() => {
  const match = skillSource.value.match(/^#{1,3}[^\n]*(?:示例|Examples?|Usage)[^\n]*\n([\s\S]*?)(?=^#{1,3} |(?![\s\S]))/im);
  return match ? marked.parse(match[0]) : '';
});
const skillRows = computed(() => pagedItems.value.map(sk => ({ key: sk.id, name: skillPresentation(sk).name, subtitle: sk.id, category: groupName(sk.group), summary: skillPresentation(sk).purpose, meta: sk.version ? 'v' + sk.version : '—', icon: faIcon(sk.icon, 'cube'), color: accent(sk.color), raw: sk })));
async function openSkillActions(sk) { await openSkill(sk); if (selected.value?.id === sk.id) detailMenuOpen.value = true; }
const selectedPresentation = computed(() => selected.value ? skillPresentation(selected.value) : {});
function useSkill() { if (selected.value) router.push({ path: skillDestination(selected.value.id), query: { skill: selected.value.id, skillRun: String(Date.now()) } }); }
watch(filtered, (list) => {
  if (editing.value || saving.value) return;
  if (!list.length) { selected.value = null; return; }
  if (!selected.value || !list.some(sk => sk.id === selected.value.id)) openSkill(list[0]);
});
watch(active, () => { if (active.value !== 'all') skillFilter.value = 'all'; detailMenuOpen.value = false; });

// ── 分页 ──
const currentPage = ref(1);
const pageSize = ref(12);
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});
watch([active, keyword, skillFilter, sortOrder, viewMode], () => { currentPage.value = 1; });
watch(totalPages, (tp) => { if (currentPage.value > tp) currentPage.value = tp; });

const statCards = computed(() => [
  { label: '技能总数', value: skills.value.length, icon: 'fa-cubes', bg: 'var(--ui-brand)' },
  { label: '能力分组', value: groups.value.length, icon: 'fa-layer-group', bg: 'var(--ui-brand-dark)' },
  { label: '产文档类', value: skills.value.filter((s) => s.group === 'product-doc').length, icon: 'fa-file-lines', bg: 'var(--ui-cyan)' },
  { label: '出图/可视化', value: skills.value.filter((s) => ['report-image', 'dataviz'].includes(s.group)).length, icon: 'fa-images', bg: 'var(--ui-brand-light)' },
]);

function groupName(id) {
  return groups.value.find((g) => g.id === id)?.name || id;
}
function groupColor(id) {
  return { 'product-doc': 'var(--ui-brand)', prototype: 'var(--ui-brand-dark)', dataviz: 'var(--ui-cyan)', 'report-image': 'var(--ui-brand-light)', coach: 'var(--ui-brand-deep)', thinking: 'var(--ui-cyan)', general: 'var(--ui-text-2)' }[id] || 'var(--ui-text-2)';
}
// manifest 里的 icon 是不带 fa- 前缀的图标名(如 headset),这里补全 Font Awesome class
function faIcon(name, fallback) {
  const n = (name || fallback || 'cube').trim();
  return n.startsWith('fa-') ? `fa-solid ${n}` : `fa-solid fa-${n}`;
}

let skillReadSeq = 0;
async function openSkill(sk) {
  if (!sk || saving.value) return;
  const requestId = ++skillReadSeq;
  detailMenuOpen.value = false;
  skillSource.value = '';
  selected.value = sk;
  editing.value = false;
  loading.value = true;
  error.value = '';
  rendered.value = '';
  try {
    const res = await window.api.skills.read(sk.id, sk.file || 'SKILL.md');
    if (requestId !== skillReadSeq) return;
    if (res && res.success) {
      // 去掉 frontmatter,只渲染正文
      const body = (res.content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      skillSource.value = body;
      rendered.value = marked.parse(body);
    } else {
      error.value = res?.error || '读取失败';
    }
  } catch (e) {
    if (requestId === skillReadSeq) error.value = e.message || '读取失败';
  } finally {
    if (requestId === skillReadSeq) loading.value = false;
  }
}

// 进编辑态:openSkill 只存了渲染后 html,没存源码 body,需重新读原文拆出纯 body。
async function startEdit() {
  const sk = selected.value;
  if (!sk || loading.value || saving.value) return;
  form.value = {
    name: sk.name || '',
    // selected.description 是 manifest 全文(非截断 summary),可直接用
    description: sk.description || '',
    body: '',
    category: sk.group || 'general',
    icon: (sk.icon || '').replace(/^fa-solid\s+fa-|^fa-/, ''),
  };
  loading.value = true;
  try {
    const res = await window.api.skills.read(sk.id, sk.file || 'SKILL.md');
    if (res && res.success) {
      form.value.body = (res.content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      editing.value = true;
    } else throw new Error(res?.error || '读取源码失败');
  } catch (e) {
    showToast('读取源码失败:' + (e.message || e));
  } finally { loading.value = false; }
}

function cancelEdit() {
  editing.value = false;
}

async function saveEdit() {
  const sk = selected.value;
  if (!sk || saving.value || loading.value) return;
  if (!form.value.name.trim()) return showToast('技能名称不能为空');
  if (!form.value.body.trim()) return showToast('技能正文不能为空');
  saving.value = true;
  try {
    const payload = {
      skill: sk.id,
      name: form.value.name,
      description: form.value.description,
      body: form.value.body,
      category: form.value.category,
      icon: (form.value.icon || '').trim(),
    };
    const res = await window.api.skills.write(payload);
    if (res && res.success) {
      await loadManifest();
      // 用新数据刷新当前 selected(loadManifest 换了 skills 数组引用)
      const fresh = skills.value.find((s) => s.id === sk.id);
      if (fresh) { selected.value = fresh; saving.value = false; await openSkill(fresh); }
      editing.value = false;
      showToast('已保存');
    } else {
      showToast('保存失败:' + (res?.error || '未知错误'));
    }
  } catch (e) {
    showToast('保存失败:' + (e.message || e));
  } finally {
    saving.value = false;
  }
}

async function openDir(sk) {
  try {
    const res = await window.api.skills.open(sk.id);
    if (!res?.success) throw new Error(res?.error || '打开目录失败');
  } catch (e) {
    showToast('打开目录失败：' + (e.message || e));
  }
}

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    if (await loadManifest()) showToast('技能库已刷新');
    else showToast(error.value || '刷新失败');
  } finally {
    setTimeout(() => { refreshing.value = false; }, 300);
  }
}

async function deleteSkill(sk) {
  if (!sk || deleting.value) return;
  const tip = sk.builtin
    ? `「${sk.name}」是内置技能,删除后下次启动会自动恢复。确认删除?`
    : `确认删除技能「${sk.name}」?此操作会移除该技能目录,不可撤销。`;
  if (!window.confirm(tip)) return;
  deleting.value = true;
  try {
    const res = await window.api.skills.delete(sk.id);
    if (res && res.success) {
      selected.value = null;
      await loadManifest();
      showToast(`已删除技能「${sk.name}」`);
    } else {
      showToast('删除失败:' + (res?.error || '未知错误'));
    }
  } catch (e) {
    showToast('删除失败:' + (e.message || e));
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
 .skill-group-context { position: fixed; min-width: 148px; padding: 5px; border: 1px solid #e2e8f0; border-radius: 9px; background: white; box-shadow: 0 8px 24px #0f172a1a; }
.skill-group-context button { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border-radius: 6px; color: #dc2626; font-size: 12px; text-align: left; }
.skill-group-context button:hover, .skill-group-context button:focus-visible { background: #fff1f2; outline: none; }
.skill-group-undo { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid #dbe5f5; border-radius: 12px; background: white; box-shadow: 0 8px 28px #0f172a1a; color: #475569; font-size: 12px; }
.skill-group-undo button { color: #2563eb; font-size: 12px; }

.sk-bg {
  background: var(--color-content-bg);
}
.sk-bg :deep(.btn-sm),
.sk-bg :deep(.btn-sm-pri) {
  height: 32px;
  padding: 0 13px;
  border-radius: 9px;
  font-size: 12.5px;
  gap: 6px;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}
.sk-bg :deep(.btn-sm:hover),
.sk-bg :deep(.btn-sm-pri:hover) {
  transform: translateY(-1px);
}
.sk-bg :deep(.btn-sm-pri) {
  box-shadow: 0 8px 18px hsl(var(--primary) / 18%);
}
.sk-bg :deep(.btn-sm-pri:hover) {
  box-shadow: 0 10px 24px hsl(var(--primary) / 24%);
}

.sk-tree { width: 240px; background: color-mix(in srgb, hsl(var(--background)) 92%, hsl(var(--primary)) 4%) !important; border-color: var(--color-sidebar-border) !important; }

/* 内容区搜索框 */
.sk-search {
  position: relative;
  flex: 1;
  min-width: 0;
  max-width: 420px;
}
.sk-search__icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11.5px;
  color: var(--ui-text-3);
  pointer-events: none;
}
.sk-search__input {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 32px;
  border-radius: 999px;
  border: 1px solid var(--ui-brand-soft-2);
  background: rgba(255, 255, 255, 0.9);
  color: var(--ui-ink-3);
  font-size: 12.5px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}
.sk-search__input::placeholder { color: var(--ui-text-3); }
.sk-search__input:focus {
  outline: none;
  border-color: var(--ui-brand-light);
  background: #fff;
  box-shadow: 0 6px 16px hsl(var(--primary) / 8%);
}
.sk-search__clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--ui-text-3);
  cursor: pointer;
  transition: color 0.15s;
}
.sk-search__clear:hover { color: var(--ui-brand); }

/* 自适应卡片网格:列数随宽度自动增减(最小 280px),窄屏 2 列宽屏可到 4-5 列 */
.sk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

/* 分页按钮 */
.pgn {
  min-width: 32px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-line-2);
  background: #fff;
  color: var(--ui-text-2);
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.pgn:hover:not(:disabled) { border-color: var(--ui-brand-light); color: var(--ui-brand); }
.pgn--cur { background: var(--ui-brand); border-color: var(--ui-brand); color: #fff; font-weight: 600; }
.pgn:disabled { opacity: 0.4; cursor: not-allowed; }

.tree-node {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 9px;
  font-size: 12.5px;
  color: var(--ui-text);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}
.tree-node:hover { background: var(--color-sidebar-elevated); color: var(--color-sidebar-text-strong); }
.tree-node:hover .tree-badge { transform: scale(1.06); }
.tree-node--active {
  background: var(--color-sidebar-elevated);
  color: var(--color-sidebar-text-strong);
  font-weight: 600;
}
.tree-badge {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.14);
  transition: transform 0.15s;
}
.tree-count {
  font-size: 10.5px;
  color: var(--ui-text-3);
  background: var(--ui-bg-2);
  border-radius: 999px;
  padding: 1px 7px;
  flex-shrink: 0;
}
.tree-node--active .tree-count { color: var(--color-sidebar-text-strong); background: var(--color-sidebar-elevated); }

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

.sk-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 170px;
  background: #fff;
  border: 1px solid var(--ui-line-2);
  border-radius: 14px;
  padding: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.22s ease, transform 0.22s ease, border-color 0.22s ease;
}
.sk-card__accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  opacity: 0;
  transition: opacity 0.22s ease;
}
.sk-card:hover {
  box-shadow: 0 12px 30px rgba(30, 58, 138, 0.13);
  transform: translateY(-3px);
  border-color: var(--ui-brand-soft-2);
}
.sk-card:hover .sk-card__accent { opacity: 1; }
.sk-card__footer {
  min-height: 41px;
  margin-top: auto;
}
.sk-card__actions { width: 118px; justify-content: flex-end; }
.sk-card__actions .card-action { width: 55px; justify-content: center; }
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
.card-action:hover:not(:disabled) { transform: translateY(-1px); }
.card-action:disabled { opacity: 0.5; cursor: not-allowed; }
.card-action i { font-size: 10.5px; }
.card-action--primary { color: var(--ui-brand); }
.card-action--primary:hover:not(:disabled) { background: var(--ui-brand-soft); border-color: var(--ui-brand-soft-2); color: var(--ui-brand-dark); }
.card-action--danger { color: #dc2626; }
.card-action--danger:hover:not(:disabled) { background: #fef2f2; border-color: #fee2e2; color: #b91c1c; }

.sk-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  flex-shrink: 0;
}

/* 技能中心卡片网格 */
.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
}

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.2s; }
.drawer-enter-active aside, .drawer-leave-active aside { transition: transform 0.25s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from aside, .drawer-leave-to aside { transform: translateX(100%); }

/* 可拖拽宽度的技能说明抽屉 */
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

/* 技能说明 markdown 排版(对齐 DocViewer 的 handbook-md) */
.skill-md :deep(h1) { font-size: 1.4em; font-weight: 700; color: var(--ui-ink-2); margin: 0.4em 0 0.5em; }
.skill-md :deep(h2) { font-size: 1.18em; font-weight: 700; color: var(--ui-ink-2); margin: 1em 0 0.4em; padding-bottom: 0.2em; border-bottom: 1px solid var(--ui-line-2); }
.skill-md :deep(h3) { font-size: 1.04em; font-weight: 600; color: var(--ui-ink-3); margin: 0.8em 0 0.3em; }
.skill-md :deep(p) { margin: 0.5em 0; line-height: 1.75; color: var(--ui-text); font-size: 13px; }
.skill-md :deep(ul), .skill-md :deep(ol) { margin: 0.4em 0; padding-left: 1.5em; }
.skill-md :deep(li) { margin: 0.2em 0; line-height: 1.7; color: var(--ui-text); font-size: 13px; }
.skill-md :deep(table) { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 12px; }
.skill-md :deep(th), .skill-md :deep(td) { border: 1px solid var(--ui-line-2); padding: 0.5em 0.7em; text-align: left; vertical-align: top; }
.skill-md :deep(th) { background: var(--ui-bg-3); font-weight: 600; color: var(--ui-ink-3); }
.skill-md :deep(strong) { font-weight: 700; color: var(--ui-ink-2); }
.skill-md :deep(code) { font-size: 12px; background: var(--ui-bg-2); padding: 0.15em 0.4em; border-radius: 4px; color: var(--ui-text); }
.skill-md :deep(pre) { background: var(--ui-ink-2); color: var(--ui-line-2); padding: 0.9em 1.1em; border-radius: 8px; overflow-x: auto; font-size: 12px; margin: 0.6em 0; }
.skill-md :deep(pre code) { background: transparent; padding: 0; color: inherit; }
.skill-md :deep(blockquote) { border-left: 3px solid var(--ui-brand); padding: 0.2em 0 0.2em 0.9em; margin: 0.6em 0; color: var(--ui-text); background: var(--ui-bg-3); border-radius: 0 6px 6px 0; }
.skill-md :deep(a) { color: var(--ui-brand); text-decoration: none; }
.skill-outcomes { display:grid; grid-template-columns:54px minmax(0,1fr); gap:8px 10px; margin:0 0 18px; font-size:12px; line-height:1.8; }
.skill-outcomes dt { color:#8b9ab0; }.skill-outcomes dd { color:#425572; }
.skills-readable-list :deep(.resource-row-summary) { white-space:normal; color:#52657f; font-size:12px; line-height:1.6; }
.skills-readable-list :deep(.resource-col-name) { width:29%; }
.skills-readable-list :deep(.resource-row-name strong) { color:#263a57; font-weight:600; }
</style>

<style src="../../styles/resource-browser.css">.skill-outcomes { display:grid; grid-template-columns:54px minmax(0,1fr); gap:8px 10px; margin:0 0 18px; font-size:12px; line-height:1.8; }
.skill-outcomes dt { color:#8b9ab0; }.skill-outcomes dd { color:#425572; }
.skills-readable-list :deep(.resource-row-summary) { white-space:normal; color:#52657f; font-size:12px; line-height:1.6; }
.skills-readable-list :deep(.resource-col-name) { width:29%; }
.skills-readable-list :deep(.resource-row-name strong) { color:#263a57; font-weight:600; }
</style>
