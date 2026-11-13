<template>
  <div class="sq-page h-full min-h-0 flex">
    <!-- ── 左侧：分类导航 + 最近使用 ────────────────────────── -->
    <aside class="sq-side shrink-0 flex flex-col">
      <div class="sq-side__head">
        <span class="sq-side__logo"><i class="fa-solid fa-store"></i></span>
        <div class="min-w-0">
          <div class="text-[15px] font-semibold text-slate-800">AI 应用广场</div>
          <div class="text-[11.5px] text-slate-400">{{ visibleApps.length }} 个应用可召唤</div>
        </div>
      </div>

      <nav class="flex-1 min-h-0 overflow-y-auto px-3 pb-3" aria-label="应用分类">
        <div class="sq-side__label">分类</div>
        <button
          v-for="cat in visibleCategories"
          :key="cat.id"
          class="sq-nav"
          :class="active === cat.id ? 'sq-nav--on' : ''"
          :aria-current="active === cat.id ? 'page' : undefined"
          @click="active = cat.id"
        >
          <span class="sq-nav__icon" :style="{ color: accent(cat.color) }"><i :class="'fa-solid fa-' + cat.icon"></i></span>
          <span class="flex-1 text-left truncate">{{ cat.id === 'all' ? '全部应用' : cat.name }}</span>
          <span class="sq-nav__count">{{ catCount(cat.id) }}</span>
        </button>

        <template v-if="recentApps.length">
          <div class="sq-side__label mt-5">最近召唤</div>
          <button v-for="app in recentApps" :key="app.id" class="sq-nav" @click="openDetail(app)">
            <AppAvatar :app="app" :size="24" />
            <span class="flex-1 text-left truncate">{{ app.name }}</span>
          </button>
        </template>
      </nav>

      <div class="sq-side__foot">
        <button class="sq-nav" :class="devMode ? 'sq-nav--on' : ''" :aria-pressed="devMode" @click="toggleDevMode">
          <span class="sq-nav__icon"><i class="fa-solid fa-code"></i></span>
          <span class="flex-1 text-left">开发者模式</span>
          <span class="sq-switch" :class="devMode ? 'sq-switch--on' : ''"></span>
        </button>
        <button v-if="devMode" class="sq-create" @click="openEditor(null)"><i class="fa-solid fa-plus"></i>创建应用</button>
      </div>
    </aside>

    <!-- ── 右侧 ────────────────────────── -->
    <div class="flex-1 min-w-0 overflow-y-auto">
      <div class="sq-body">
        <header class="sq-head">
          <div class="min-w-0">
            <h1 class="text-[22px] font-semibold text-slate-900">{{ activeTitle }}</h1>
            <p class="text-[13px] text-slate-400 mt-1">{{ activeHint }}</p>
          </div>
          <label class="sq-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input v-model="keyword" type="text" placeholder="搜索应用、场景、能力" />
          </label>
        </header>

        <!-- 精选：全部 + 无搜索时展示 -->
        <section v-if="showFeatured" class="sq-featured" aria-label="精选应用">
          <button
            v-for="app in featuredApps"
            :key="app.id"
            class="sq-feat"
            :style="featStyle(app)"
            @click="openDetail(app)"
          >
            <AppAvatar class="sq-feat__avatar" :app="app" :size="96" />
            <span class="sq-feat__kicker">{{ categoryName(app.category) }}</span>
            <span class="sq-feat__name">{{ app.name }}</span>
            <span class="sq-feat__line">{{ app.tagline || app.summary }}</span>
            <span class="sq-feat__go" @click.stop="launchApp(app)">召唤 <i class="fa-solid fa-arrow-right text-[11px]"></i></span>
          </button>
        </section>

        <!-- 已移除的内置专家（回收站，仅开发者模式） -->
        <div v-if="devMode && deletedBuiltins.length" class="sq-trash">
          <span class="text-[12px] text-slate-500"><i class="fa-solid fa-trash-can-arrow-up mr-1.5 text-slate-400"></i>已移除 {{ deletedBuiltins.length }} 个内置应用：</span>
          <button v-for="d in deletedBuiltins" :key="d.id" class="sq-trash__item" title="恢复" @click="restoreBuiltin(d)">
            {{ d.name }}<i class="fa-solid fa-rotate-left text-[10px] ml-1.5"></i>
          </button>
        </div>

        <h2 v-if="showFeatured && filtered.length" class="sq-sub">全部应用 <span>{{ filtered.length }}</span></h2>
        <div v-if="filtered.length" class="sq-grid">
          <div
            v-for="app in filtered"
            :key="app.id"
            class="sq-item"
            role="button"
            tabindex="0"
            @click="openDetail(app)"
            @keydown.enter="openDetail(app)"
          >
            <AppAvatar :app="app" :size="64" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 min-w-0">
                <h3 class="sq-name truncate">{{ app.name }}</h3>
                <span v-if="app.source === 'local' || app._edited" class="src-badge shrink-0" :class="sourceBadge(app).cls">{{ sourceBadge(app).text }}</span>
              </div>
              <p class="sq-desc truncate">{{ app.summary || app.tagline }}</p>
              <div class="sq-tags">
                <span v-for="tag in (app.bestFor || []).slice(0, 3)" :key="tag" class="sq-tag">{{ tag }}</span>
              </div>
            </div>
            <button
              v-if="app.status === 'published'"
              class="sq-call"
              @click.stop="launchApp(app)"
            >召唤</button>
            <button v-else class="sq-call sq-call--draft" @click.stop="openEditor(app)">编辑</button>
          </div>
        </div>
        <div v-else class="text-center py-24 text-slate-300">
          <i class="fa-solid fa-inbox text-5xl mb-3"></i>
          <p class="text-[13px]">{{ keyword.trim() ? '没有找到匹配的应用' : '该分类下暂无应用' }}</p>
        </div>
      </div>
    </div>

    <!-- ── 应用详情弹窗 ────────────────────────── -->
    <transition name="modal">
      <div v-if="selected" class="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div class="sq-mask absolute inset-0" @click="selected = null"></div>
        <section class="sq-modal" role="dialog" aria-modal="true" :aria-label="selected.name">
          <button class="sq-close" aria-label="关闭" @click="selected = null"><i class="fa-solid fa-xmark"></i></button>

          <div class="sq-modal__body">
            <AppAvatar :app="selected" :size="72" />
            <div class="flex items-center gap-2 mt-4">
              <h2 class="text-[22px] font-semibold text-slate-900">{{ selected.name }}</h2>
              <span class="src-badge" :class="sourceBadge(selected).cls">{{ sourceBadge(selected).text }}</span>
            </div>
            <p class="text-[14px] text-slate-400 mt-1.5 leading-relaxed">{{ selected.summary || selected.tagline }}</p>

            <div v-if="selected.riskNotice" class="mt-4 p-3 rounded-xl bg-amber-50 text-[12.5px] text-amber-700 flex items-start gap-2">
              <i class="fa-solid fa-triangle-exclamation mt-0.5 shrink-0"></i><span>{{ selected.riskNotice }}</span>
            </div>

            <template v-if="(selected.bestFor || []).length">
              <h4 class="sq-h">擅长领域</h4>
              <div class="flex flex-wrap gap-2">
                <span v-for="tag in selected.bestFor" :key="tag" class="sq-chip">{{ tag }}</span>
              </div>
            </template>

            <template v-if="capabilityLines.length">
              <h4 class="sq-h">能帮你做</h4>
              <ul class="space-y-1.5">
                <li v-for="(line, i) in capabilityLines" :key="i" class="text-[13px] text-slate-600 flex items-start gap-2">
                  <i class="fa-solid fa-check text-[10px] text-blue-500 mt-1.5 shrink-0"></i><span>{{ line }}</span>
                </li>
              </ul>
            </template>

            <template v-if="(selected.starters || []).length">
              <h4 class="sq-h">试试这样问我</h4>
              <div class="space-y-2.5">
                <button v-for="(q, i) in selected.starters" :key="i" class="sq-starter" @click="launchApp(selected, q)">
                  <span class="flex-1 text-left">{{ q }}</span><i class="fa-solid fa-arrow-right text-[13px]"></i>
                </button>
              </div>
            </template>

            <template v-if="(selected.skills || []).length">
              <h4 class="sq-h">内置技能 <span class="font-normal text-slate-400">{{ selected.skills.length }}</span></h4>
              <div class="space-y-1">
                <div v-for="s in selected.skills" :key="s" class="sq-skill">
                  <span class="sq-skill__icon"><i class="fa-solid fa-puzzle-piece"></i></span>
                  <span class="text-[14px] font-medium text-slate-800">{{ skillName(s) }}</span>
                </div>
              </div>
            </template>

            <template v-if="hasBuiltinKnowledge && builtinKnowledge">
              <h4 class="sq-h">内置知识库 <span class="font-normal text-slate-400">{{ builtinKnowledge.documents.length }} 份资料</span></h4>
              <p class="text-[12.5px] text-slate-500 leading-relaxed">
                <template v-if="selected.knowledge === 'clinical'">随应用提供，回答时自动检索疾病百科与卫健委临床路径并标注出处。共收录疾病 {{ (builtinKnowledge.stats.diseases || 0).toLocaleString() }} 条、临床路径 {{ (builtinKnowledge.stats.pathways || 0).toLocaleString() }} 份，内容仅供内部学习参考，不能用于诊断和用药。</template>
                <template v-else>随应用提供，回答时自动检索并标注出处。另可按编码精确查询：DRG 编码 {{ (builtinKnowledge.stats.drgCodes || 0).toLocaleString() }} 条、DIP 病种 {{ (builtinKnowledge.stats.dipDiseases || 0).toLocaleString() }} 个、医疗服务项目 {{ (builtinKnowledge.stats.serviceItems || 0).toLocaleString() }} 项。</template>
              </p>
              <details v-for="group in builtinKnowledgeGroups" :key="group.topic" class="sq-kb">
                <summary><i class="fa-solid fa-book-medical text-teal-600"></i><span class="flex-1">{{ group.topic }}</span><span class="text-slate-400">{{ group.documents.length }} 份</span></summary>
                <ul>
                  <li v-for="doc in group.documents" :key="doc.id">{{ doc.title }}</li>
                </ul>
              </details>
            </template>

            <!-- 专家资产（仅开发者模式） -->
            <template v-if="devMode">
              <h4 class="sq-h">专家资产</h4>
              <div class="grid grid-cols-2 gap-2.5">
                <button class="sq-asset" @click="openAssetDrawer('memory')">
                  <span class="text-[11.5px] text-slate-400"><i class="fa-solid fa-brain mr-1.5 text-blue-500"></i>长期记忆</span>
                  <span class="text-[15px] font-semibold text-slate-700">{{ assetMemoryChars }} <small class="font-normal text-slate-400">字</small></span>
                </button>
                <button class="sq-asset" @click="openAssetDrawer('knowledge')">
                  <span class="text-[11.5px] text-slate-400"><i class="fa-solid fa-folder-open mr-1.5 text-blue-500"></i>知识库</span>
                  <span class="text-[15px] font-semibold text-slate-700">{{ assetKnowledgeCount }} <small class="font-normal text-slate-400">个文件</small></span>
                </button>
              </div>
              <p class="text-[11.5px] text-slate-400 mt-3">
                {{ (selected.developer && selected.developer.author) || '未知作者' }} · v{{ (selected.developer && selected.developer.version) || '1.0.0' }}
              </p>
            </template>
          </div>

          <footer class="sq-modal__foot">
            <div v-if="devMode && (selected.source === 'local' || selected.source === 'builtin')" class="relative">
              <button class="sq-more" aria-label="更多操作" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen"><i class="fa-solid fa-ellipsis"></i></button>
              <div v-if="moreOpen" class="sq-menu" @click="moreOpen = false">
                <button @click="openEditor(selected)"><i class="fa-solid fa-pen"></i>编辑</button>
                <button v-if="selected.source === 'local'" @click="togglePublish(selected)">
                  <i class="fa-solid" :class="selected.status === 'published' ? 'fa-arrow-down' : 'fa-rocket'"></i>{{ selected.status === 'published' ? '下架' : '发布' }}
                </button>
                <button v-if="selected._edited" @click="resetBuiltin(selected)"><i class="fa-solid fa-rotate-left"></i>恢复默认</button>
                <button class="sq-menu__danger" @click="removeApp(selected)">
                  <i class="fa-solid" :class="selected.source === 'builtin' ? 'fa-eye-slash' : 'fa-trash'"></i>{{ selected.source === 'builtin' ? '从广场移除' : '删除' }}
                </button>
              </div>
            </div>
            <button v-if="selected.status === 'published'" class="sq-primary" @click="launchApp(selected)">对话</button>
            <button v-else class="sq-primary" @click="openEditor(selected)">编辑应用</button>
          </footer>
        </section>
      </div>
    </transition>
    <!-- ── 应用编辑抽屉 ────────────────────────── -->
    <transition name="drawer">
      <div v-if="editing" class="fixed inset-0 z-[60]">
        <div class="absolute inset-0 bg-slate-900/40" @click="closeEditor"></div>
        <aside class="absolute right-0 top-0 bottom-0 w-[680px] max-w-[94vw] glass-card shadow-2xl flex flex-col">
          <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200/80 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" :style="{ background: form.color || '#2563eb' }">
                <i :class="'fa-solid fa-' + (form.icon || 'rocket')"></i>
              </span>
              <div class="min-w-0">
                <div class="text-[13px] font-semibold text-slate-800 truncate">{{ editingBuiltinId ? '编辑内置专家' : (form.id ? '编辑应用' : '创建应用') }}</div>
                <div class="text-[11px] text-slate-400">{{ editingBuiltinId ? '修改将保存为覆盖，可随时恢复默认' : '配置并发布你的 AI 应用' }}</div>
              </div>
            </div>
            <button @click="closeEditor" class="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 transition">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="ed-label">应用名称 <span class="text-danger">*</span></label>
                <input v-model="form.name" type="text" class="ed-input" placeholder="例如：营销文案生成器" />
              </div>
              <div>
                <label class="ed-label">分类</label>
                <UiSelect field v-model="form.category" class="ed-input" :options="[...(businessCategories).map((c) => ({ value: c.id, label: String(c.name) }))]" />
              </div>
              <div>
                <label class="ed-label">图标名（fa 图标，无 fa- 前缀）</label>
                <input v-model="form.icon" type="text" class="ed-input" placeholder="rocket" />
              </div>
              <div>
                <label class="ed-label">主题色</label>
                <div class="flex items-center gap-2">
                  <input v-model="form.color" type="color" class="ed-color" />
                  <input v-model="form.color" type="text" class="ed-input flex-1" placeholder="#2563eb" />
                </div>
              </div>
              <div>
                <label class="ed-label">一句话卖点</label>
                <input v-model="form.tagline" type="text" class="ed-input" placeholder="用一句话说明这个应用能干什么" />
              </div>
            </div>

            <div>
              <label class="ed-label">简介</label>
              <textarea v-model="form.summary" rows="3" class="ed-input" placeholder="应用的详细介绍"></textarea>
            </div>

            <div>
              <label class="ed-label">适用场景（每行一个）</label>
              <textarea v-model="form.bestForText" rows="3" class="ed-input" placeholder="营销海报&#10;商品主图&#10;公众号配图"></textarea>
            </div>

            <div>
              <label class="ed-label">推荐开场问题（每行一个）</label>
              <textarea v-model="form.startersText" rows="3" class="ed-input" placeholder="帮我设计一张海报的提示词&#10;把这个卖点转成主图方案"></textarea>
            </div>

            <div>
              <label class="ed-label">核心能力（每行一条，可用 - 前缀）</label>
              <textarea v-model="form.capabilities" rows="4" class="ed-input" placeholder="- 将业务需求转为提示词&#10;- 推荐构图与风格"></textarea>
            </div>

            <div>
              <label class="ed-label">工作流程</label>
              <textarea v-model="form.workflow" rows="3" class="ed-input" placeholder="描述应用的工作步骤"></textarea>
            </div>

            <div>
              <label class="ed-label">使用约束</label>
              <textarea v-model="form.constraints" rows="3" class="ed-input" placeholder="使用时的限制与注意事项"></textarea>
            </div>

            <div>
              <label class="ed-label">风险提醒</label>
              <input v-model="form.riskNotice" type="text" class="ed-input" placeholder="需要提醒用户注意的风险" />
            </div>

            <div>
              <label class="ed-label">
                绑定技能 <span class="font-normal text-slate-400">(勾选后引导专家优先使用，已选 {{ form.skills.length }})</span>
              </label>
              <div v-if="allSkills.length" class="skill-picker">
                <label
                  v-for="sk in allSkills"
                  :key="sk.id"
                  class="skill-chip"
                  :class="form.skills.includes(sk.name) ? 'skill-chip--on' : ''"
                >
                  <input type="checkbox" class="hidden" :value="sk.name" v-model="form.skills" />
                  <i class="fa-solid fa-check text-[9px]" v-if="form.skills.includes(sk.name)"></i>
                  <span class="truncate">{{ sk.name }}</span>
                </label>
              </div>
              <p v-else class="text-[11px] text-slate-400 py-2">暂无可用技能，可先到「技能」页导入</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="ed-label">作者</label>
                <input v-model="form.author" type="text" class="ed-input" placeholder="本地开发者" />
              </div>
              <div>
                <label class="ed-label">版本</label>
                <input v-model="form.version" type="text" class="ed-input" placeholder="1.0.0" />
              </div>
              <div>
                <label class="ed-label">绑定模型 <span class="font-normal text-slate-400">(可选)</span></label>
                <UiSelect field v-model="form.preferredModel" class="ed-input" :options="[{ value: '', label: '使用默认模型' }, ...FIXED_MODELS.map((m) => ({ value: m.id, label: m.label }))]" />
              </div>
            </div>
          </div>

          <div class="px-5 py-4 border-t border-slate-200/80 shrink-0 flex items-center gap-2">
            <template v-if="editingBuiltinId">
              <button
                @click="saveApp(false)"
                :disabled="saving"
                class="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm shadow-blue-500/25 disabled:opacity-50"
              >
                <i class="fa-solid fa-floppy-disk text-[11px]"></i>保存修改
              </button>
              <button
                @click="closeEditor"
                class="px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-slate-600 transition"
              >取消</button>
            </template>
            <template v-else>
              <button
                @click="saveApp(false)"
                :disabled="saving"
                class="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold glass-card border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition disabled:opacity-50"
              >
                <i class="fa-solid fa-floppy-disk text-[11px]"></i>保存草稿
              </button>
              <button
                @click="saveApp(true)"
                :disabled="saving"
                class="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm shadow-blue-500/25 disabled:opacity-50"
              >
                <i class="fa-solid fa-rocket text-[11px]"></i>发布到广场
              </button>
              <button
                @click="closeEditor"
                class="px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-slate-600 transition"
              >取消</button>
            </template>
          </div>
        </aside>
      </div>
    </transition>

    <!-- ── 专家资产管理抽屉 ────────────────────────── -->
    <transition name="drawer">
      <div v-if="assetDrawerOpen" class="fixed inset-0 z-[65]">
        <div class="absolute inset-0 bg-slate-900/40" @click="assetDrawerOpen = false"></div>
        <aside class="absolute right-0 top-0 bottom-0 w-[640px] max-w-[92vw] glass-card shadow-2xl flex flex-col">
          <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200/80 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-blue-500 to-blue-700">
                <i class="fa-solid fa-database"></i>
              </span>
              <div class="min-w-0">
                <div class="text-[13px] font-semibold text-slate-800 truncate">专家资产</div>
                <div class="text-[11px] text-slate-400 truncate">长期记忆与知识库</div>
              </div>
            </div>
            <button @click="assetDrawerOpen = false" class="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 transition">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Tab 切换 -->
          <div class="flex items-center gap-1 px-5 pt-3 shrink-0">
            <button
              @click="assetTab = 'memory'"
              class="asset-tab"
              :class="assetTab === 'memory' ? 'asset-tab--active' : ''"
            >
              <i class="fa-solid fa-brain text-[10px]"></i>长期记忆
            </button>
            <button
              @click="assetTab = 'knowledge'"
              class="asset-tab"
              :class="assetTab === 'knowledge' ? 'asset-tab--active' : ''"
            >
              <i class="fa-solid fa-folder-open text-[10px]"></i>知识库
            </button>
          </div>

          <!-- Tab: 长期记忆 -->
          <div v-if="assetTab === 'memory'" class="flex-1 min-h-0 flex flex-col p-5">
            <p class="text-[12px] text-slate-400 mb-2.5 flex items-start gap-1.5">
              <i class="fa-solid fa-circle-info text-blue-400 mt-0.5 shrink-0"></i>
              <span>这些内容会在每次启动该专家时写入会话上下文。</span>
            </p>
            <textarea
              v-model="assetMemoryContent"
              class="flex-1 min-h-0 w-full text-[12.5px] leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3.5 focus:outline-none focus:bg-white focus:border-blue-400 transition resize-none font-mono"
              placeholder="# 长期记忆&#10;&#10;记录该专家需要长期记住的偏好、背景、约定…"
            ></textarea>
            <div class="flex items-center gap-2 pt-3 shrink-0">
              <button
                @click="saveAssetMemory"
                :disabled="assetSaving"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm shadow-blue-500/25 disabled:opacity-50"
              >
                <i class="fa-solid fa-floppy-disk text-[10px]"></i>保存
              </button>
              <button
                @click="openAssetDir('memory')"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition"
              >
                <i class="fa-solid fa-folder-open text-[10px] text-blue-500"></i>打开目录
              </button>
              <span class="ml-auto text-[11px] text-slate-400">{{ assetMemoryChars }} 字</span>
            </div>
          </div>

          <!-- Tab: 知识库 -->
          <div v-else class="flex-1 min-h-0 flex flex-col p-5">
            <p class="text-[12px] text-slate-400 mb-2.5 flex items-start gap-1.5">
              <i class="fa-solid fa-circle-info text-blue-400 mt-0.5 shrink-0"></i>
              <span>这些文件会在启动专家会话时复制到当前会话项目的 knowledge/app/。</span>
            </p>
            <div class="flex items-center gap-2 mb-3 shrink-0">
              <button
                @click="uploadAssetKnowledge"
                :disabled="assetSaving"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm shadow-blue-500/25 disabled:opacity-50"
              >
                <i class="fa-solid fa-upload text-[10px]"></i>上传文档
              </button>
              <button
                @click="openAssetDir('knowledge')"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition"
              >
                <i class="fa-solid fa-folder-open text-[10px] text-blue-500"></i>打开目录
              </button>
              <span class="ml-auto text-[11px] text-slate-400">{{ assetKnowledgeCount }} 个文件</span>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto space-y-1.5">
              <div
                v-for="f in assetKnowledgeFiles"
                :key="f.name"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-transparent border border-slate-200/70 hover:border-blue-200 transition group"
              >
                <span class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <i class="fa-solid fa-file-lines text-[13px] text-blue-500"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="text-[12.5px] text-slate-700 truncate">{{ f.name }}</div>
                  <div class="text-[10.5px] text-slate-400">{{ formatFileSize(f.size) }}</div>
                </div>
                <button
                  @click="deleteAssetKnowledge(f)"
                  class="w-7 h-7 rounded-md text-slate-300 hover:text-danger-deep hover:bg-danger-soft transition shrink-0"
                  title="删除"
                >
                  <i class="fa-solid fa-trash text-[10px]"></i>
                </button>
              </div>
              <div v-if="!assetKnowledgeFiles.length" class="text-center py-16 text-slate-300">
                <i class="fa-solid fa-folder-open text-4xl mb-2.5"></i>
                <p class="text-[12.5px]">知识库暂无文件</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </transition>

    <!-- ── Toast ────────────────────────── -->
    <transition name="toast">
      <div
        v-if="toast.show"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-3.5 py-2 rounded-xl text-[12.5px] font-medium text-white shadow-lg"
        :class="toast.type === 'error' ? 'bg-danger-deep' : 'bg-slate-800'"
      >
        <i class="fa-solid mr-1.5" :class="toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'"></i>{{ toast.msg }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { useAccentColor } from '@/composables/useAccentColor.js';
const { accent } = useAccentColor();
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { FIXED_MODELS } from '@/constants/models.js';
import AppAvatar from '@/components/apps/AppAvatar.vue';
import { useRouter } from 'vue-router';
import {
  aiAppCategories,
  builtinAiApps,
  buildAiAppOpeningPrompt,
} from '@/data/ai-apps';

const router = useRouter();

const categories = aiAppCategories;
const active = ref('all');
const keyword = ref('');
const selected = ref(null);
const devMode = ref(false);

// eslint-disable-next-line no-unused-vars
const _opening = buildAiAppOpeningPrompt;


// 业务分类(排除虚拟分类 + all)
const virtualCatIds = ['all', 'my-published', 'my-drafts'];
const businessCategories = categories.filter((c) => !virtualCatIds.includes(c.id));

// ── 本地应用 ──
const localApps = ref([]);
const allSkills = ref([]);

// ── 内置专家覆盖层（用户对内置专家的修改 / 软删）──
const builtinOverrides = ref({}); // { [builtinId]: {…被改字段} }
const builtinDeleted = ref([]);   // [builtinId…] 已软删

async function refreshBuiltinOverrides() {
  try {
    const res = await window.api?.aiApps?.builtinOverrides();
    if (res && res.success) {
      builtinOverrides.value = res.overrides || {};
      builtinDeleted.value = Array.isArray(res.deleted) ? res.deleted : [];
    } else {
      builtinOverrides.value = {};
      builtinDeleted.value = [];
    }
  } catch (e) {
    builtinOverrides.value = {};
    builtinDeleted.value = [];
  }
}

async function refreshSkills() {
  try {
    const res = await window.api?.skills?.getManifest();
    if (res && res.success && res.data && Array.isArray(res.data.skills)) {
      allSkills.value = res.data.skills.map((s) => ({ id: s.id, name: s.name, group: s.group, summary: s.summary || s.description || '' }));
    } else {
      allSkills.value = [];
    }
  } catch (e) {
    allSkills.value = [];
  }
}

async function refreshLocalApps() {
  try {
    const res = await window.api?.aiApps?.list();
    if (res && res.success && Array.isArray(res.apps)) {
      localApps.value = res.apps;
    } else {
      localApps.value = [];
    }
  } catch (e) {
    localApps.value = [];
  }
}

onMounted(() => {
  refreshLocalApps();
  refreshSkills();
  refreshBuiltinOverrides();
});

// 内置专家应用覆盖层：合并被改字段、剔除软删、标记 edited
const effectiveBuiltins = computed(() =>
  builtinAiApps
    .filter((a) => !builtinDeleted.value.includes(a.id))
    .map((a) => {
      const ov = builtinOverrides.value[a.id];
      return ov ? { ...a, ...ov, _edited: true } : a;
    })
);

// 合并的完整应用列表
const allApps = computed(() => [...effectiveBuiltins.value, ...localApps.value]);

// 已软删的内置专家（用于"回收站"恢复）
const deletedBuiltins = computed(() =>
  builtinAiApps.filter((a) => builtinDeleted.value.includes(a.id))
);

// devMode 关闭时草稿不可见
const visibleApps = computed(() => {
  if (devMode.value) return allApps.value;
  return allApps.value.filter((a) => a.status === 'published');
});

// 左侧分类:开发草稿仅在 devMode 时显示
const visibleCategories = computed(() =>
  categories.filter((c) => c.id !== 'my-drafts' || devMode.value)
);

function toggleDevMode() {
  devMode.value = !devMode.value;
  // 关闭开发者模式时,若停留在仅开发可见的分类则回到全部
  if (!devMode.value && active.value === 'my-drafts') active.value = 'all';
}

function sourceBadge(app) {
  if (app.source === 'local' && app.status === 'draft') {
    return { text: '草稿', cls: 'src-badge--draft' };
  }
  if (app.source === 'local') {
    return { text: '本地发布', cls: 'src-badge--local' };
  }
  if (app._edited) {
    return { text: '内置·已改', cls: 'src-badge--edited' };
  }
  return { text: '内置', cls: 'src-badge--builtin' };
}

function filterByCategory(list, catId) {
  if (catId === 'all') return list;
  if (catId === 'my-published') return list.filter((a) => a.source === 'local' && a.status === 'published');
  if (catId === 'my-drafts') return list.filter((a) => a.source === 'local' && a.status === 'draft');
  return list.filter((a) => a.category === catId);
}

const filtered = computed(() => {
  let list = filterByCategory(visibleApps.value, active.value);
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase();
    list = list.filter((a) =>
      (a.name || '').toLowerCase().includes(kw)
      || (a.summary || '').toLowerCase().includes(kw)
      || (a.tagline || '').toLowerCase().includes(kw)
      || (a.bestFor || []).some((t) => String(t).toLowerCase().includes(kw))
      || (a.starters || []).some((s) => String(s).toLowerCase().includes(kw))
    );
  }
  return list;
});

const activeCat = computed(() => categories.find((c) => c.id === active.value));
const activeTitle = computed(() => (keyword.value.trim() ? `搜索「${keyword.value.trim()}」` : (active.value === 'all' ? '全部应用' : activeCat.value?.name || '全部应用')));
const CAT_HINTS = {
  all: '选一个专家，把产品资料变成宣传视频、PPT、产品介绍、白皮书、操作手册和 Demo',
  marketing: '宣传视频、海报配图、方案 PPT、产品介绍，对外宣发一套齐',
  docs: '白皮书、操作手册、可点击 Demo，产品交付文档一站完成',
  industry: '医疗信息化标准与医保政策，有出处的行业知识',
  'my-published': '你自己开发并发布到广场的应用',
  'my-drafts': '还没发布的应用草稿，只在开发者模式可见',
};
const activeHint = computed(() => (keyword.value.trim() ? `找到 ${filtered.value.length} 个应用` : CAT_HINTS[active.value] || ''));
const categoryName = (id) => categories.find((c) => c.id === id)?.name || '';
function catCount(catId) { return filterByCategory(visibleApps.value, catId).length; }

// 精选：每个业务分类取第一个，最多 3 个
const featuredApps = computed(() => {
  const seen = new Set();
  return visibleApps.value.filter((a) => a.status === 'published' && a.category && !seen.has(a.category) && seen.add(a.category)).slice(0, 3);
});
const showFeatured = computed(() => active.value === 'all' && !keyword.value.trim() && featuredApps.value.length >= 2);
function featStyle(app) {
  const c = accent(app?.color || '#2563eb');
  return { '--feat': c };
}

// 最近召唤：只存在本机，方便回到常用应用
const RECENT_KEY = 'fde-apps-recent';
const recentIds = ref([]);
try { recentIds.value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { recentIds.value = []; }
const recentApps = computed(() => recentIds.value.map((id) => visibleApps.value.find((a) => a.id === id)).filter(Boolean).slice(0, 5));
function rememberRecent(app) {
  recentIds.value = [app.id, ...recentIds.value.filter((id) => id !== app.id)].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value)); } catch { /* 本地存储不可用时忽略 */ }
}

// 技能 id → 显示名（技能清单里没有就显示 id）
function skillName(id) {
  return allSkills.value.find((s) => s.id === id || s.name === id)?.name || id;
}

const moreOpen = ref(false);
watch(selected, () => { moreOpen.value = false; });
function onEsc(e) { if (e.key === 'Escape' && selected.value && !editing.value && !assetDrawerOpen.value) selected.value = null; }
onMounted(() => window.addEventListener('keydown', onEsc));
onBeforeUnmount(() => window.removeEventListener('keydown', onEsc));

const capabilityLines = computed(() => {
  if (!selected.value?.capabilities) return [];
  return selected.value.capabilities
    .split('\n')
    .map((l) => l.replace(/^[-·•]\s*/, '').trim())
    .filter(Boolean);
});

// 内置知识库目录（只读）：加载失败时详情页不显示这一节
const builtinKnowledge = ref(null);
const hasBuiltinKnowledge = computed(() => selected.value?.knowledge === 'med' || selected.value?.knowledge === 'clinical');
const builtinKnowledgeGroups = computed(() => {
  const groups = new Map();
  for (const doc of builtinKnowledge.value?.documents || []) {
    if (!groups.has(doc.topic)) groups.set(doc.topic, []);
    groups.get(doc.topic).push(doc);
  }
  return [...groups].map(([topic, documents]) => ({ topic, documents }));
});
async function loadBuiltinKnowledge(kind) {
  if (builtinKnowledge.value) return;
  try {
    const api = window.api?.hermes;
    const res = kind === 'clinical' ? await api?.clinicalKnowledgeCatalog?.() : await api?.medKnowledgeCatalog();
    if (res?.success) builtinKnowledge.value = res;
  } catch (e) {
    builtinKnowledge.value = null;
  }
}

function openDetail(app) {
  selected.value = app;
  if (app?.knowledge === 'med' || app?.knowledge === 'clinical') { builtinKnowledge.value = null; loadBuiltinKnowledge(app.knowledge); }
  assetMemoryContent.value = '';
  assetKnowledgeFiles.value = [];
  if (devMode.value && app?.id) {
    assetAppId.value = app.id;
    loadAssetMemory(app.id);
    loadAssetKnowledge(app.id);
  }
}

function launchApp(app, ask) {
  selected.value = null;
  rememberRecent(app);
  router.push(ask ? { path: `/apps/${app.id}`, query: { ask } } : `/apps/${app.id}`);
}

// ── Toast ──
const toast = reactive({ show: false, msg: '', type: 'ok', timer: null });
function showToast(msg, type = 'ok') {
  toast.msg = msg;
  toast.type = type;
  toast.show = true;
  if (toast.timer) clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toast.show = false; }, 2400);
}

// ── 编辑器 ──
const editing = ref(false);
const saving = ref(false);
const editingBuiltinId = ref(''); // 非空 = 正在编辑内置专家（保存到覆盖层）
const form = reactive({
  id: '',
  name: '',
  category: 'docs',
  icon: 'rocket',
  color: 'var(--ui-brand)',
  tagline: '',
  summary: '',
  bestForText: '',
  startersText: '',
  capabilities: '',
  workflow: '',
  constraints: '',
  riskNotice: '',
  author: '',
  version: '1.0.0',
  preferredModel: '',
  skills: [],
});

function resetForm() {
  form.id = '';
  form.name = '';
  form.category = 'docs';
  form.icon = 'rocket';
  form.color = '#2563eb';
  form.tagline = '';
  form.summary = '';
  form.bestForText = '';
  form.startersText = '';
  form.capabilities = '';
  form.workflow = '';
  form.constraints = '';
  form.riskNotice = '';
  form.author = '';
  form.version = '1.0.0';
  form.preferredModel = '';
  form.skills = [];
}

function openEditor(app) {
  selected.value = null;
  if (app) {
    // 内置专家：直接编辑（保存到覆盖层），id 保留内置 id
    editingBuiltinId.value = app.source === 'builtin' ? app.id : '';
    form.id = app.source === 'local' ? (app.id || '') : '';
    form.name = app.name || '';
    form.category = businessCategories.some((c) => c.id === app.category) ? app.category : 'docs';
    form.icon = app.icon || 'rocket';
    form.color = app.color || '#2563eb';
    form.tagline = app.tagline || '';
    form.summary = app.summary || '';
    form.bestForText = (app.bestFor || []).join('\n');
    form.startersText = (app.starters || []).join('\n');
    form.capabilities = app.capabilities || '';
    form.workflow = app.workflow || '';
    form.constraints = app.constraints || '';
    form.riskNotice = app.riskNotice || '';
    form.author = (app.developer && app.developer.author) || '';
    form.version = (app.developer && app.developer.version) || '1.0.0';
    form.preferredModel = app.preferredModel || '';
    form.skills = Array.isArray(app.skills) ? [...app.skills] : [];
  } else {
    editingBuiltinId.value = '';
    resetForm();
  }
  editing.value = true;
}

function closeEditor() {
  editing.value = false;
  editingBuiltinId.value = '';
}

function linesToArray(text) {
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildPayload() {
  const payload = {
    name: form.name.trim(),
    category: form.category,
    icon: (form.icon || 'rocket').replace(/^fa-/, '').trim(),
    color: form.color || '#2563eb',
    tagline: form.tagline.trim(),
    summary: form.summary.trim(),
    bestFor: linesToArray(form.bestForText),
    starters: linesToArray(form.startersText),
    capabilities: form.capabilities,
    workflow: form.workflow,
    constraints: form.constraints,
    riskNotice: form.riskNotice.trim(),
    developer: {
      author: form.author.trim() || '本地开发者',
      version: form.version.trim() || '1.0.0',
    },
    preferredModel: form.preferredModel.trim(),
    skills: [...form.skills],
  };
  if (form.id) payload.id = form.id;
  return payload;
}

async function saveApp(publish) {
  if (!form.name.trim()) {
    showToast('请填写应用名称', 'error');
    return;
  }
  // 内置专家 → 存到覆盖层
  if (editingBuiltinId.value) {
    saving.value = true;
    try {
      const patch = {
        name: form.name.trim(),
        category: form.category,
        icon: (form.icon || 'rocket').replace(/^fa-/, '').trim(),
        color: form.color || '#2563eb',
        tagline: form.tagline.trim(),
        summary: form.summary.trim(),
        bestFor: linesToArray(form.bestForText),
        starters: linesToArray(form.startersText),
        capabilities: form.capabilities,
        workflow: form.workflow,
        constraints: form.constraints,
        riskNotice: form.riskNotice.trim(),
        preferredModel: form.preferredModel.trim(),
        skills: [...form.skills],
      };
      const res = await window.api?.aiApps?.builtinSave(editingBuiltinId.value, patch);
      if (!res || !res.success) {
        showToast(res?.error || '保存失败', 'error');
        return;
      }
      await refreshBuiltinOverrides();
      showToast('内置专家已更新');
      editing.value = false;
      editingBuiltinId.value = '';
    } catch (e) {
      showToast(e?.message || '保存失败', 'error');
    } finally {
      saving.value = false;
    }
    return;
  }
  saving.value = true;
  try {
    const res = await window.api?.aiApps?.save(buildPayload());
    if (!res || !res.success) {
      showToast(res?.error || '保存失败', 'error');
      return;
    }
    if (publish && res.app?.id) {
      const pub = await window.api?.aiApps?.publish(res.app.id);
      if (!pub || !pub.success) {
        showToast(pub?.error || '发布失败', 'error');
        await refreshLocalApps();
        return;
      }
    }
    await refreshLocalApps();
    showToast(publish ? '已发布到广场' : '草稿已保存');
    editing.value = false;
  } catch (e) {
    showToast(e?.message || '保存失败', 'error');
  } finally {
    saving.value = false;
  }
}

async function togglePublish(app) {
  if (!app || app.source !== 'local') return;
  try {
    const fn = app.status === 'published' ? window.api?.aiApps?.unpublish : window.api?.aiApps?.publish;
    const res = await fn?.(app.id);
    if (!res || !res.success) {
      showToast(res?.error || '操作失败', 'error');
      return;
    }
    await refreshLocalApps();
    selected.value = localApps.value.find((a) => a.id === app.id) || null;
    showToast(app.status === 'published' ? '已下架' : '已发布');
  } catch (e) {
    showToast(e?.message || '操作失败', 'error');
  }
}

async function removeApp(app) {
  if (!app) return;
  // 内置专家：软删（可恢复）
  if (app.source === 'builtin') {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`确定从广场移除内置专家「${app.name}」？可随时"恢复默认"找回。`)) return;
    try {
      const res = await window.api?.aiApps?.builtinDelete(app.id);
      if (!res || !res.success) {
        showToast(res?.error || '移除失败', 'error');
        return;
      }
      await refreshBuiltinOverrides();
      selected.value = null;
      showToast('已移除，可在"恢复默认"找回');
    } catch (e) {
      showToast(e?.message || '移除失败', 'error');
    }
    return;
  }
  if (app.source !== 'local') return;
  // eslint-disable-next-line no-alert
  if (!window.confirm(`确定删除应用「${app.name}」？此操作不可恢复。`)) return;
  try {
    const res = await window.api?.aiApps?.delete(app.id);
    if (!res || !res.success) {
      showToast(res?.error || '删除失败', 'error');
      return;
    }
    await refreshLocalApps();
    selected.value = null;
    showToast('已删除');
  } catch (e) {
    showToast(e?.message || '删除失败', 'error');
  }
}

// 恢复某内置专家到默认（清除覆盖 + 撤销软删）
async function resetBuiltin(app) {
  if (!app || app.source !== 'builtin') return;
  // eslint-disable-next-line no-alert
  if (!window.confirm(`确定把「${app.name}」恢复为默认？你对它的修改将被清除。`)) return;
  try {
    const res = await window.api?.aiApps?.builtinReset(app.id);
    if (!res || !res.success) {
      showToast(res?.error || '恢复失败', 'error');
      return;
    }
    await refreshBuiltinOverrides();
    // 详情抽屉里的对象换成恢复后的
    selected.value = effectiveBuiltins.value.find((a) => a.id === app.id) || null;
    showToast('已恢复默认');
  } catch (e) {
    showToast(e?.message || '恢复失败', 'error');
  }
}

// 从回收站恢复被软删的内置专家
async function restoreBuiltin(app) {
  if (!app) return;
  try {
    const res = await window.api?.aiApps?.builtinReset(app.id);
    if (!res || !res.success) {
      showToast(res?.error || '恢复失败', 'error');
      return;
    }
    await refreshBuiltinOverrides();
    showToast(`已恢复「${app.name}」`);
  } catch (e) {
    showToast(e?.message || '恢复失败', 'error');
  }
}

// ── 专家资产（长期记忆 + 知识库）──
const assetDrawerOpen = ref(false);
const assetTab = ref('memory');
const assetMemoryContent = ref('');
const assetKnowledgeFiles = ref([]);
const assetSaving = ref(false);
const assetAppId = ref('');

const assetMemoryChars = computed(() => assetMemoryContent.value.length);
const assetKnowledgeCount = computed(() => assetKnowledgeFiles.value.length);

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function openAssetDrawer(tab) {
  if (!selected.value?.id) return;
  assetAppId.value = selected.value.id;
  assetTab.value = tab || 'memory';
  assetMemoryContent.value = '';
  assetKnowledgeFiles.value = [];
  assetDrawerOpen.value = true;
  await Promise.all([
    loadAssetMemory(assetAppId.value),
    loadAssetKnowledge(assetAppId.value),
  ]);
}

async function loadAssetMemory(appId) {
  if (!appId) return;
  try {
    const res = await window.api?.aiApps?.memoryGet(appId);
    assetMemoryContent.value = (res && res.success && typeof res.content === 'string') ? res.content : '';
  } catch (e) {
    assetMemoryContent.value = '';
  }
}

async function saveAssetMemory() {
  if (!assetAppId.value) return;
  assetSaving.value = true;
  try {
    const res = await window.api?.aiApps?.memorySave(assetAppId.value, assetMemoryContent.value);
    if (!res || !res.success) {
      showToast(res?.error || '保存失败', 'error');
      return;
    }
    showToast('长期记忆已保存');
  } catch (e) {
    showToast(e?.message || '保存失败', 'error');
  } finally {
    assetSaving.value = false;
  }
}

async function loadAssetKnowledge(appId) {
  if (!appId) return;
  try {
    const res = await window.api?.aiApps?.knowledgeList(appId);
    assetKnowledgeFiles.value = (res && res.success && Array.isArray(res.files)) ? res.files : [];
  } catch (e) {
    assetKnowledgeFiles.value = [];
  }
}

async function uploadAssetKnowledge() {
  if (!assetAppId.value) return;
  assetSaving.value = true;
  try {
    const res = await window.api?.aiApps?.knowledgeUpload(assetAppId.value);
    if (res && res.canceled) return;
    if (!res || !res.success) {
      showToast(res?.error || '上传失败', 'error');
      return;
    }
    await loadAssetKnowledge(assetAppId.value);
    const n = Array.isArray(res.added) ? res.added.length : 0;
    showToast(n ? `已添加 ${n} 个文件` : '已上传');
  } catch (e) {
    showToast(e?.message || '上传失败', 'error');
  } finally {
    assetSaving.value = false;
  }
}

async function deleteAssetKnowledge(file) {
  if (!assetAppId.value || !file?.name) return;
  // eslint-disable-next-line no-alert
  if (!window.confirm(`确定从知识库删除「${file.name}」？`)) return;
  try {
    const res = await window.api?.aiApps?.knowledgeDelete(assetAppId.value, file.name);
    if (!res || !res.success) {
      showToast(res?.error || '删除失败', 'error');
      return;
    }
    await loadAssetKnowledge(assetAppId.value);
    showToast('已删除');
  } catch (e) {
    showToast(e?.message || '删除失败', 'error');
  }
}

async function openAssetDir(type) {
  if (!assetAppId.value) return;
  try {
    const fn = type === 'knowledge' ? window.api?.aiApps?.knowledgeOpen : window.api?.aiApps?.memoryOpen;
    const res = await fn?.(assetAppId.value);
    if (res && res.success === false) {
      showToast(res.error || '打开目录失败', 'error');
    }
  } catch (e) {
    showToast(e?.message || '打开目录失败', 'error');
  }
}
</script>

<style scoped>
.sq-page { background: hsl(var(--background)); }

/* 左侧导航 */
.sq-side { width: 232px; border-right: 1px solid var(--ui-line-2); background: color-mix(in srgb, var(--ui-bg-3) 70%, hsl(var(--background))); }
.sq-side__head { display: flex; align-items: center; gap: 10px; padding: 22px 18px 18px; }
.sq-side__logo { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 15px; background: linear-gradient(135deg, var(--ui-brand-light), var(--ui-brand-deep)); flex-shrink: 0; }
.sq-side__label { padding: 8px 10px 6px; font-size: 11.5px; color: var(--ui-text-3); letter-spacing: .04em; }
.sq-nav { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; font-size: 13.5px; color: var(--ui-ink-3); transition: background .15s, color .15s; }
.sq-nav:hover { background: var(--ui-bg-2); color: var(--ui-ink); }
.sq-nav--on { background: hsl(var(--background)); color: var(--ui-ink); font-weight: 600; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); }
.sq-nav__icon { width: 18px; text-align: center; font-size: 13px; color: var(--ui-text-2); flex-shrink: 0; }
.sq-nav__count { font-size: 11.5px; color: var(--ui-text-3); font-weight: 400; }
.sq-side__foot { padding: 10px 12px 14px; border-top: 1px solid var(--ui-line-2); display: flex; flex-direction: column; gap: 6px; }
.sq-switch { position: relative; width: 28px; height: 16px; border-radius: 999px; background: var(--ui-line); transition: background .15s; flex-shrink: 0; }
.sq-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: transform .15s; }
.sq-switch--on { background: var(--ui-brand); }
.sq-switch--on::after { transform: translateX(12px); }
.sq-create { display: flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border-radius: 10px; background: var(--ui-brand); color: #fff; font-size: 13px; }
.sq-create:hover { background: var(--ui-brand-dark); }

/* 右侧头部 */
.sq-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 0 16px; margin-bottom: 20px; }
.sq-search { display: flex; align-items: center; gap: 8px; width: 260px; height: 38px; padding: 0 12px; border: 1px solid var(--ui-line-2); border-radius: 10px; color: var(--ui-text-3); font-size: 12px; flex-shrink: 0; transition: border-color .15s; }
.sq-search:focus-within { border-color: var(--ui-brand-light); }
.sq-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13px; color: var(--ui-ink); }

/* 精选卡 */
.sq-featured { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 0 16px; margin-bottom: 28px; }
.sq-feat { position: relative; display: flex; flex-direction: column; align-items: flex-start; min-height: 168px; padding: 20px 22px; border-radius: 20px; text-align: left; overflow: hidden;
  background: linear-gradient(135deg, color-mix(in srgb, var(--feat) 16%, hsl(var(--background))) 0%, color-mix(in srgb, var(--feat) 5%, hsl(var(--background))) 100%);
  border: 1px solid color-mix(in srgb, var(--feat) 14%, transparent); transition: transform .2s, box-shadow .2s; }
.sq-feat:hover { transform: translateY(-2px); box-shadow: 0 12px 28px color-mix(in srgb, var(--feat) 18%, transparent); }
.sq-feat__avatar { position: absolute; right: 18px; bottom: 18px; box-shadow: 0 8px 22px color-mix(in srgb, var(--feat) 22%, transparent); }
.sq-feat__kicker { font-size: 11.5px; color: var(--feat); font-weight: 600; letter-spacing: .04em; }
.sq-feat__name { margin-top: 8px; font-size: 18px; font-weight: 600; color: var(--ui-ink); }
.sq-feat__line { margin-top: 6px; font-size: 13px; line-height: 1.6; color: var(--ui-text); max-width: calc(100% - 110px); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sq-feat__go { margin-top: auto; padding-top: 14px; font-size: 13px; font-weight: 500; color: var(--feat); }
.sq-feat__go:hover { text-decoration: underline; }
.sq-sub { padding: 0 16px; margin-bottom: 4px; font-size: 15px; font-weight: 600; color: var(--ui-ink); }
.sq-sub span { margin-left: 4px; font-weight: 400; color: var(--ui-text-3); font-size: 13px; }

/* 列表：三列，左头像 / 中文字 / 右召唤 */
.sq-body { padding: 26px 20px 36px; max-width: 1480px; }
.sq-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 4px 12px; }
.sq-item { display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 16px; cursor: pointer; transition: background .15s; }
.sq-item:hover { background: var(--ui-bg-3); }
.sq-item:focus-visible { outline: 2px solid var(--ui-brand-light); outline-offset: -2px; }
.sq-name { font-size: 16px; font-weight: 600; color: var(--ui-ink); }
.sq-desc { font-size: 13px; color: var(--ui-text-2); margin-top: 4px; }
.sq-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; overflow: hidden; height: 22px; }
.sq-tag { flex-shrink: 0; padding: 2px 7px; border-radius: 6px; background: var(--ui-bg-2); font-size: 11.5px; color: var(--ui-text-3); }
.sq-call { flex-shrink: 0; padding: 7px 14px; border: 1px solid var(--ui-line-2); border-radius: 10px; background: hsl(var(--background)); font-size: 13px; color: var(--ui-ink-2); transition: border-color .15s, color .15s, background .15s; }
.sq-call:hover { border-color: var(--ui-brand); color: #fff; background: var(--ui-brand); }
.sq-call--draft { color: #d97706; }
.sq-trash { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 16px 8px; }
.sq-trash__item { padding: 3px 10px; border-radius: 8px; border: 1px dashed var(--ui-line); font-size: 12px; color: var(--ui-text); }
.sq-trash__item:hover { color: var(--ui-brand); border-color: var(--ui-brand-light); }

/* 详情弹窗 */
.sq-mask { background: rgb(15 23 42 / 28%); backdrop-filter: blur(6px); }
.sq-modal { position: relative; width: 560px; max-width: 100%; max-height: min(780px, 100%); display: flex; flex-direction: column; background: hsl(var(--background)); border-radius: 28px; box-shadow: 0 24px 64px rgb(15 23 42 / 18%); overflow: hidden; }
.sq-close { position: absolute; top: 20px; right: 20px; z-index: 1; width: 32px; height: 32px; border-radius: 8px; color: var(--ui-text); font-size: 16px; }
.sq-close:hover { background: var(--ui-bg-2); color: var(--ui-ink); }
.sq-modal__body { flex: 1; min-height: 0; overflow-y: auto; padding: 28px 32px 12px; }
.sq-h { margin: 22px 0 12px; font-size: 15px; font-weight: 600; color: var(--ui-ink); }
.sq-chip { padding: 6px 12px; border-radius: 999px; background: var(--ui-bg-2); font-size: 13px; color: var(--ui-ink-3); }
.sq-starter { width: 100%; display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 14px; background: var(--ui-bg-2); font-size: 13.5px; color: var(--ui-ink-2); transition: background .15s, color .15s; }
.sq-starter:hover { background: var(--ui-brand-soft); color: var(--ui-brand-deep); }
.sq-skill { display: flex; align-items: center; gap: 14px; padding: 8px 0; }
.sq-skill__icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #fff7ed; color: #ea8a3a; font-size: 14px; flex-shrink: 0; }
.sq-kb { margin-top: 8px; border: 1px solid var(--ui-line-2); border-radius: 12px; font-size: 13px; color: #334155; }
.sq-kb summary { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; }
.sq-kb ul { margin: 0; padding: 0 12px 10px 33px; list-style: disc; line-height: 1.8; font-size: 12.5px; color: #64748b; }
.sq-asset { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--ui-line-2); transition: border-color .15s; }
.sq-asset:hover { border-color: var(--ui-brand-light); }
.sq-modal__foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 24px 22px; }
.sq-more { width: 44px; height: 40px; border-radius: 12px; border: 1px solid var(--ui-line-2); color: var(--ui-ink-3); }
.sq-more:hover { border-color: var(--ui-line); }
.sq-menu { position: absolute; bottom: calc(100% + 6px); right: 0; min-width: 150px; padding: 6px; border-radius: 12px; background: hsl(var(--background)); border: 1px solid var(--ui-line-2); box-shadow: 0 12px 32px rgb(15 23 42 / 14%); }
.sq-menu button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 13px; color: var(--ui-ink-3); text-align: left; }
.sq-menu button i { width: 14px; font-size: 12px; color: var(--ui-text-3); }
.sq-menu button:hover { background: var(--ui-bg-2); }
.sq-menu .sq-menu__danger, .sq-menu .sq-menu__danger i { color: #dc2626; }
.sq-primary { min-width: 88px; height: 40px; padding: 0 22px; border-radius: 12px; background: var(--ui-brand); color: #fff; font-size: 14px; font-weight: 500; transition: background .15s; }
.sq-primary:hover { background: var(--ui-brand-dark); }
.modal-enter-active, .modal-leave-active { transition: opacity .18s; }
.modal-enter-active .sq-modal, .modal-leave-active .sq-modal { transition: transform .2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .sq-modal, .modal-leave-to .sq-modal { transform: scale(.96) translateY(8px); }

@media (max-width: 1100px) { .sq-featured { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sq-featured .sq-feat:nth-child(3) { display: none; } }
@media (max-width: 900px) {
  .sq-side { width: 200px; }
  .sq-head { flex-direction: column; align-items: stretch; }
  .sq-search { width: 100%; }
}

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.2s; }
.drawer-enter-active aside, .drawer-leave-active aside { transition: transform 0.25s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from aside, .drawer-leave-to aside { transform: translateX(100%); }

/* ── 来源徽标 ── */
.src-badge {
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
}
.src-badge--builtin { background: var(--ui-brand-soft); color: var(--ui-brand); }
.src-badge--local   { background: #ecfdf5; color: #059669; }
.src-badge--draft   { background: #fffbeb; color: #d97706; }
.src-badge--edited  { background: var(--ui-accent-soft); color: var(--ui-accent); }

/* ── 编辑器表单 ── */
.ed-label {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text-2);
  margin-bottom: 5px;
}
.ed-input {
  width: 100%;
  font-size: 12.5px;
  color: var(--ui-ink-3);
  background: var(--ui-bg-3);
  border: 1px solid var(--ui-line-2);
  border-radius: 9px;
  padding: 8px 10px;
  transition: border-color 0.15s, background 0.15s;
  resize: vertical;
}
.ed-input:focus {
  outline: none;
  background: #fff;
  border-color: var(--ui-brand-light);
}
.ed-color {
  width: 38px;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--ui-line-2);
  border-radius: 9px;
  background: #fff;
  cursor: pointer;
}

/* ── 技能多选 ── */
.skill-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--ui-line-2);
  border-radius: 9px;
  background: var(--ui-bg-3);
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--ui-text-2);
  background: #fff;
  border: 1px solid var(--ui-line-2);
  cursor: pointer;
  transition: all 0.15s;
}
.skill-chip:hover { border-color: var(--ui-brand-light); color: var(--ui-brand); }
.skill-chip:active { transform: scale(0.95); }
.skill-chip--on {
  background: var(--ui-brand-soft);
  border-color: var(--ui-brand);
  color: var(--ui-brand-dark);
  font-weight: 500;
}

/* ── Toast ── */
.toast-enter-active, .toast-leave-active { transition: opacity 0.25s, transform 0.25s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 12px); }

/* ── 专家资产抽屉 Tab ── */
.asset-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 9px 9px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-3);
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.asset-tab:hover { color: var(--ui-brand); }
.asset-tab--active {
  color: var(--ui-brand);
  border-bottom-color: var(--ui-brand);
  background: var(--ui-brand-soft);
}
</style>
