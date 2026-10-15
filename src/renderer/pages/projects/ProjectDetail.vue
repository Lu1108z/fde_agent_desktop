<template>
  <div class="flex-1 flex min-h-0 overflow-hidden" @click="followKnowledgeCitation">
      <!-- 收起态：留一条窄轨，任何分类下都能重新展开 -->
      <div
        v-if="leftPanelCollapsed"
        class="shrink-0 w-9 flex flex-col items-center pt-2.5 glass-panel border-r border-slate-200/70"
      >
        <button
          @click="leftPanelCollapsed = false"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-white transition-colors"
          title="显示侧边栏"
          aria-label="显示侧边栏"
        >
          <i class="fa-solid fa-angles-right text-[10px]"></i>
        </button>
      </div>

      <!-- 二级侧边栏：顶部分类入口（工作台/交付物/原型）+ 下方当前分类的内容 -->
      <aside
        v-if="!leftPanelCollapsed"
        class="project-sidebar shrink-0 flex flex-col glass-panel border-r border-slate-200/70 overflow-hidden"
        :style="`flex: 0 0 ${leftPanelWidth || 248}px; width: ${leftPanelWidth || 248}px`"
      >
        <div class="shrink-0 border-b border-slate-200 px-4 pt-5 pb-4">
          <div class="mb-3 flex items-center justify-between text-[12px] font-semibold text-slate-500"><span>项目空间</span><div class="relative shrink-0">
          <button type="button" style="width:24px;height:24px;border:0;background:transparent" class="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700" aria-label="更多项目操作" :aria-expanded="projectMenuOpen" @click="projectMenuOpen = !projectMenuOpen"><i class="fa-solid fa-ellipsis"></i></button>
          <div v-if="projectMenuOpen" class="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button v-if="progressStage > 3 && progressStage < 5" type="button" class="w-full rounded-lg px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-blue-50" :disabled="stageAdvancing || isStreaming || deliverableBusy" @click="projectMenuOpen = false; advanceStage()">{{ stageAdvancing ? '正在推进…' : (progressStage <= 3 ? '回到当前任务' : '完成本阶段，进入下一步') }}</button>
            <button v-if="progressStage > 3" type="button" class="w-full rounded-lg px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-blue-50" @click="projectMenuOpen=false; openAssessment('stage')">阶段验收</button><button type="button" class="w-full rounded-lg px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-blue-50" @click="projectMenuOpen=false; backupProject()">备份整个项目</button><button type="button" class="w-full rounded-lg px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-blue-50" @click="projectMenuOpen=false; restoreProject()">恢复项目备份</button><button v-if="progressStage===5&&stageStatus[5]!=='done'" type="button" class="w-full rounded-lg px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-blue-50" @click="completeProject">验收并完成项目</button>
          </div>
        </div></div>
          <nav class="space-y-1" aria-label="项目空间">

            <button type="button" class="project-nav-btn" :class="activeTab === 'overview' ? 'is-active' : ''" @click="switchNav('overview')"><i class="fa-solid fa-chart-pie"></i>项目概览</button>
            <button type="button" class="project-nav-btn" :class="activeTab === 'workspace' ? 'is-active' : ''" @click="resumeWorkflow"><i class="fa-solid fa-star"></i>当前任务</button>

            <button type="button" class="project-nav-btn" :class="activeTab === 'knowledge' ? 'is-active' : ''" @click="switchNav('knowledge')"><i class="fa-solid fa-folder-open"></i>项目资料</button>
            <button type="button" class="project-nav-btn" :class="activeTab === 'prototype' ? 'is-active' : ''" @click="switchNav('prototype')"><i class="fa-solid fa-window-maximize"></i>项目原型</button>
          </nav>
        </div>
        <div class="shrink-0 border-b border-slate-100 px-4 pt-4 pb-3">
          <div class="mb-2 text-[12px] font-semibold text-slate-500">交付物归档</div>
          <div class="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5">
            <i class="fa-solid fa-magnifying-glass text-[12px] text-slate-400" aria-hidden="true"></i>
            <input v-model="docSearch" type="search" class="min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none" placeholder="搜索文档…" aria-label="搜索交付物" />
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div v-for="stage in FDE_STAGES" :key="stage.id" class="mb-1">
            <button type="button" class="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed" :class="stage.id === currentStage ? 'text-blue-700' : stage.id <= progressStage ? 'text-slate-600 hover:bg-white' : 'text-slate-400'" :disabled="stage.id > progressStage" :aria-current="stage.id === currentStage ? 'step' : undefined" :aria-expanded="expandedStageIds.has(stage.id)" @click="handleStageTreeClick(stage.id)">
              <i class="fa-solid w-3 shrink-0 text-center text-[10px]" :class="expandedStageIds.has(stage.id) ? 'fa-chevron-down' : 'fa-chevron-right'" aria-hidden="true"></i>
              <span class="min-w-0 flex-1 truncate">阶段{{ stage.id }}　{{ stageDisplayName(stage.id) }}</span>
              <span v-if="stage.id === progressStage" class="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"></span>
            </button>
            <div v-if="expandedStageIds.has(stage.id) && stage.id <= progressStage && filteredStageDeliverables(stage.id).length" class="ml-5 space-y-0.5 pb-2">
              <button v-for="d in filteredStageDeliverables(stage.id)" :key="d.key" type="button" class="flex min-h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px] leading-5 transition-colors" :class="currentStage === stage.id && deliverableSelected === d.key && activeTab === 'workspace' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-white'" @click="selectGroupDeliverable(stage.id, d.key)">
                <i :class="d.icon" class="w-3 shrink-0 text-center text-[12px] text-slate-400" aria-hidden="true"></i>
                <span class="min-w-0 flex-1 truncate">{{ d.short || d.name }}</span>
                <span v-if="deliverableState(stage.id, d.key) === 'ready'" class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="已生成"></span>
              </button>
            </div>
            <button v-else-if="expandedStageIds.has(stage.id) && stage.id <= progressStage && !deliverablesForStage(stage.id).length && !docSearch.trim()" type="button" class="ml-5 mb-2 flex min-h-8 w-[calc(100%-20px)] items-center gap-2 rounded-lg px-2 text-left text-[12px]" :class="currentStage === stage.id && activeTab === 'workspace' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white'" @click="viewStage(stage.id)"><i class="fa-regular fa-file-lines w-3 text-center" aria-hidden="true"></i>{{stage.id===1?'资料准备':'阶段说明'}}</button>
            <p v-else-if="docSearch.trim() && expandedStageIds.has(stage.id) && stage.id <= progressStage && (stage.id === 2 || stage.id === 3)" class="ml-7 py-1 text-[12px] text-slate-400">无匹配文档</p>
          </div>
        </div>
      </aside>

      <!-- 侧边栏拖拽把手：视觉 1px，命中区 5px -->
      <div
        v-if="!leftPanelCollapsed"
        class="w-[5px] shrink-0 cursor-col-resize bg-slate-100 hover:bg-blue-300 transition-colors"
        :class="leftPanelDragging ? 'bg-blue-400' : ''"
        title="拖动调整侧边栏宽度"
        @mousedown.prevent="startLeftDrag"
      ></div>

    <div ref="projectMainRef" class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" :class="{ 'panel-resizing': assistantPanelDragging && !documentFullscreen }" :style="activeTab === 'workspace' ? { paddingRight: `${mainAssistantPanelCollapsed ? 44 : mainAssistantPanelWidth + 8}px` } : {}">
    <div v-if="activeTab === 'workspace' && !documentFullscreen && !assistantPanelCollapsed" class="reading-splitter reading-splitter-normal" :class="{ 'is-dragging': assistantPanelDragging }" :style="{ right: `${assistantPanelWidth}px` }" role="separator" aria-label="调整文档与对话宽度" aria-orientation="vertical" tabindex="0" :aria-valuenow="assistantPanelWidth" :aria-valuemin="280" :aria-valuemax="640" title="左右拖动调整宽度，双击恢复" @pointerdown="startAssistantResize" @pointermove="moveAssistantResize" @pointerup="endAssistantResize" @pointercancel="endAssistantResize" @lostpointercapture="assistantPanelDragging = false" @dblclick="setAssistantPanelWidth(360)" @keydown.left.prevent="setAssistantPanelWidth(assistantPanelWidth + 24)" @keydown.right.prevent="setAssistantPanelWidth(assistantPanelWidth - 24)"></div>
    <!-- 项目进度与正在浏览的阶段分开：可回看，推进仍按顺序。 -->
    <!-- 项目内容直接占满中间；项目操作移到左栏。 -->

    <!-- 项目空间始终保持同一侧栏；阶段②③显示文档工作区。 -->
    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- 中间文档、右侧 AI 助手；两者保持同屏。 -->
      <div v-if="activeTab === 'workspace'" class="contents">
        <div v-if="assistantPanelCollapsed" class="assistant-collapsed-rail" :class="{ 'is-fullscreen': documentFullscreen }">
          <button ref="assistantPanelToggleRef" type="button" class="assistant-pane-toggle" aria-label="展开右侧对话" aria-controls="project-reading-assistant" :aria-expanded="false" title="展开对话" @click="toggleAssistantPanel"><i class="fa-solid fa-angles-left" aria-hidden="true"></i></button>
        </div>

        <!-- 文档与对话栏保持原 DOM，避免全屏切换时互相移动。 -->
        <aside v-show="!assistantPanelCollapsed" id="project-reading-assistant" class="assistant-pane absolute inset-y-0 right-0 z-10 flex flex-col overflow-hidden border-l border-slate-200 bg-white" :class="{ 'assistant-reading-chat': documentFullscreen }" :style="{ width: `${assistantPanelWidth}px`, '--fde-reading-assistant-width': `${assistantPanelWidth}px` }">
          <div v-if="documentFullscreen" class="shrink-0 border-b border-slate-200 bg-white px-4 py-4">
            <div class="flex items-center justify-between gap-2"><h3 class="flex items-center gap-2 text-[14px] font-semibold text-slate-900"><i class="fa-regular fa-comments text-blue-600" aria-hidden="true"></i>交付物对话</h3><button ref="assistantPanelToggleRef" type="button" class="assistant-pane-toggle" aria-label="收起右侧对话" aria-controls="project-reading-assistant" :aria-expanded="true" title="收起对话" @click="toggleAssistantPanel"><i class="fa-solid fa-angles-right" aria-hidden="true"></i></button></div>
            <p class="mt-1.5 text-[12px] leading-5 text-slate-500">关于《{{ documentTitle }}》</p>
          </div>
          <div v-else class="flex shrink-0 border-b border-slate-200 px-3 pt-2" role="tablist" aria-label="项目辅助面板">
            <button v-for="tab in assistantPanelTabs" :key="tab.key" type="button" role="tab" class="assistant-panel-tab flex-1 whitespace-nowrap border-b-2 px-1 py-3 text-[12px] font-medium" :class="assistantPanelTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'" :aria-selected="assistantPanelTab === tab.key" @click="assistantPanelTab = tab.key">{{ tab.label }}<span v-if="tab.key === 'discussion' && discussionCount"> ({{ discussionCount }})</span></button><button ref="assistantPanelToggleRef" type="button" class="assistant-pane-toggle" aria-label="收起右侧对话" aria-controls="project-reading-assistant" :aria-expanded="true" title="收起对话" @click="toggleAssistantPanel"><i class="fa-solid fa-angles-right" aria-hidden="true"></i></button>
          </div>
          <div v-if="assistantPanelTab === 'resources'" class="assistant-resource-panel min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <button class="mb-4 flex w-full items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-left text-[12px] text-blue-700" @click="switchNav('knowledge')"><span><i class="fa-solid fa-folder-open mr-2"></i>查看客户资料与沟通记录</span><i class="fa-solid fa-arrow-right"></i></button>
            <h3 class="mb-3 text-[14px] font-semibold text-slate-800">本阶段交付物</h3>
            <button v-for="d in activeDeliverables" :key="d.key" type="button" class="mb-2 flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left text-[13px] text-slate-700 hover:border-blue-200 hover:bg-blue-50" @click="selectDeliverable(d.key); assistantPanelTab = 'assistant'">
              <i :class="d.icon" class="w-4 text-center text-blue-600" aria-hidden="true"></i><span class="min-w-0 flex-1 truncate">{{ d.name }}</span><span class="text-[11px]" :class="deliverableStatus[d.key] === 'ready' ? 'text-emerald-600' : 'text-slate-400'">{{ deliverableStatus[d.key] === 'ready' ? '已生成' : '未生成' }}</span>
            </button>
            <template v-if="!activeDeliverables.length">
              <div v-for="d in activeStageObj.deliverables" :key="d.key" class="mb-2 rounded-lg border border-slate-200 px-3 py-3">
                <p class="text-[12px] text-slate-700">{{ d.name }}</p><p class="mt-1 text-[11px] text-slate-500">{{ d.note || d.sign || '计划交付内容' }}</p>
              </div>
              <p v-if="!activeStageObj.deliverables.length" class="text-[12px] leading-6 text-slate-500">本阶段以调研准备为主，可在中间查看准备要点。</p>
            </template>
          </div>
          <div v-else-if="assistantPanelTab === 'discussion'" class="assistant-history-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <section v-if="linkedConversations.length" class="mb-4 border-b border-slate-100 pb-3" aria-label="历史对话">
            <h3 class="mb-2 px-2 text-[11px] font-medium text-slate-500">历史对话 · {{ linkedConversations.length }}</h3>
            <div class="max-h-32 overflow-y-auto space-y-1">
              <RouterLink v-for="conversation in linkedConversations" :key="conversation.slug" :to="{ path: `/projects/${slug}/conversations`, query: { conversation: conversation.slug } }" class="flex items-center gap-2 rounded-lg px-2 py-2 text-[12px] text-slate-600 hover:bg-blue-50 hover:text-blue-700" :title="conversation.conversationName || conversation.name">
                <i class="fa-regular fa-comment text-blue-400 shrink-0"></i><span class="truncate">{{ conversation.conversationName || conversation.name }}</span>
              </RouterLink>
            </div>
          </section>
            <section v-if="discussionStore.histories.value.length" class="mb-4 space-y-1.5" aria-label="保存的对话窗口">
              <h3 class="mb-2 text-[12px] font-medium text-slate-500">对话窗口 · {{ discussionStore.histories.value.length }}</h3>
              <button v-for="window in discussionStore.histories.value" :key="window.scope + ':' + window.id" type="button" :disabled="assistantReplyBusy || deliverableBusy" class="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[12px] text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50" @click="discussionStore.openWindow(window)">
                <i class="fa-regular fa-comments text-blue-500" aria-hidden="true"></i><span class="min-w-0 flex-1 truncate">{{ window.title }}</span><span class="shrink-0 text-[10px] text-slate-400">{{ window.count }} 轮</span>
              </button>
            </section>
            <div class="mb-4">
              <h3 class="truncate text-[14px] font-semibold text-slate-900">{{ assistantSubject }}的讨论</h3>
              <p class="mt-1 text-[11px] text-slate-500">{{ discussionThreads.length }} 轮讨论 · 点开卡片查看完整对话</p>
            </div>
            <button v-for="(thread, index) in discussionThreads" :key="thread.index" type="button" class="mb-2.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50" @click="assistantPanelTab = 'assistant'; jumpToMessage(thread.index)">
              <span class="flex items-center gap-2 text-[11px] text-slate-400"><span class="flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-blue-600"><i class="fa-solid fa-comments text-[10px]" aria-hidden="true"></i></span>讨论 {{ discussionThreads.length - index }}<span v-if="thread.time" class="ml-auto">{{ thread.time }}</span></span>
              <strong class="discussion-card-title mt-2 block text-[13px] leading-5 text-slate-800">{{ thread.question }}</strong>
              <span v-if="thread.answer" class="discussion-card-preview mt-1.5 block text-[12px] leading-5 text-slate-500">{{ thread.answer }}</span>
              <span v-else class="mt-1.5 block text-[12px] text-slate-400">等待 FDE 助手回复</span>
              <span class="mt-2 flex items-center justify-end gap-1 text-[11px] font-medium text-blue-700">查看完整对话 <i class="fa-solid fa-arrow-right text-[10px]" aria-hidden="true"></i></span>
            </button>
            <p v-if="!discussionThreads.length && !linkedConversations.length" class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] leading-5 text-slate-500">还没有讨论记录。切到“AI 助手”提问后，记录会显示在这里。</p>
          </div>
          <div v-else class="relative flex min-h-0 flex-1 flex-col">
          <button v-if="assistantConversationOpen && !documentFullscreen && !(currentStage===1&&researchDocument)" type="button" class="shrink-0 border-b border-slate-100 px-4 py-2 text-left text-[12px] font-medium text-blue-700 hover:bg-blue-50" @click="assistantConversationOpen = false"><i class="fa-solid fa-arrow-left mr-2" aria-hidden="true"></i>返回助手首页 <span class="ml-2 text-slate-400">· {{ selectedDeliverable?.short || stageDisplayName(currentStage) }}</span></button>
          <div v-if="currentStage===1&&researchDocument" class="material-ai-scope"><i class="fa-regular fa-file-lines" aria-hidden="true"></i><div><span>基于当前文件提问</span><strong :title="researchDocument.name">{{researchDocument.name}}</strong></div></div>
          <div class="assistant-content flex min-h-0 flex-1 flex-col" :class="{ 'assistant-home-content': !assistantConversationOpen && !documentFullscreen }">
          <div v-if="!assistantConversationOpen && !documentFullscreen" class="assistant-intro shrink-0 px-3 pt-3">
            <div class="assistant-hero rounded-xl bg-gradient-to-br from-[#e5f1ff] via-[#f3f8ff] to-[#dceaff]">
              <div class="assistant-hero-figure"><img :src="coachMascot" alt="FDE 助手" class="assistant-intro-mascot" /></div>
              <div class="assistant-hero-copy"><h3>你好，我是 FDE 助手</h3><p>我可以帮你梳理需求、生成文档，提供专业建议，让项目推进更高效。</p></div>
            </div>
            <div v-if="livePreviewContent" class="mt-2 grid grid-cols-3 gap-2">
              <div v-for="stat in documentStats" :key="stat.label" class="rounded-lg px-2.5 py-2.5" :class="stat.tone"><div class="text-[20px] font-bold leading-none">{{ stat.value }}</div><div class="mt-1 text-[11px] text-slate-500">{{ stat.label }}</div></div>
            </div>
            <h4 class="mt-3 mb-2 text-[13px] font-semibold text-slate-900">我可以帮你</h4>
            <div class="space-y-1">
              <button v-for="action in assistantQuickActions" :key="action.label" type="button" class="assistant-quick-action flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-[12px] text-slate-700 hover:border-blue-300 hover:bg-blue-50" @click="dlvInput = action.prompt; dlvSend()">
                <i :class="action.icon" class="w-4 text-center text-blue-600" aria-hidden="true"></i><span class="min-w-0 flex-1 truncate">{{ action.label }}</span><i class="fa-solid fa-chevron-right text-[10px] text-slate-400" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <!-- 消息区 -->
          <div
            v-show="assistantConversationOpen || documentFullscreen"
            ref="chatContainerRef"
            class="assistant-messages min-h-0 flex-1 overflow-y-auto px-4 py-4"
          >
            <!-- Loading -->
            <div v-if="messagesLoading" class="flex flex-col items-center justify-center py-24">
              <div class="relative w-9 h-9 mb-4">
                <div class="absolute inset-0 rounded-full border-2 border-blue-100"></div>
                <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin"></div>
              </div>
              <p class="ws-body text-slate-400">加载对话记录…</p>
            </div>

            <!-- Empty: no deliverable selected -->
            <div v-else-if="isWorkspaceStage && !deliverableSelected && !workflowOpen" class="flex flex-col items-center justify-center h-full text-center px-6">
              <i class="fa-solid fa-hand-pointer text-3xl text-slate-200 mb-3"></i>
              <p class="ws-body text-slate-400">从左侧选择一件交付物开始</p>
            </div>

            <!-- Empty: deliverable selected, no messages yet -->
            <div v-else-if="activeDlvMsgs.length === 0" class="pt-10 text-center text-[12px] leading-6 text-slate-500">可以围绕{{ currentStage===1&&researchDocument ? '当前文件' : selectedDeliverable ? '这份交付物' : '本阶段的工作' }}提问，<br />让 FDE 助手帮你梳理、解释和完善。</div>

            <!-- Message list -->
            <div v-else class="w-full max-w-[760px] mx-auto space-y-9">
              <div
                v-for="(msg, idx) in activeDlvMsgs"
                :key="idx"
                :data-msg-index="idx"
                class="flex flex-col w-full"
                :class="msg.role === 'user' ? 'items-end' : 'items-start'"
              >
                <!-- User -->
                <div v-if="msg.role === 'user'" class="max-w-[80%]">
                  <div v-if="msg.attachments && msg.attachments.length" class="flex flex-wrap gap-2 mb-1.5 justify-end">
                    <template v-for="(att, ai) in msg.attachments" :key="ai">
                      <img v-if="att.type === 'image'" :src="'data:' + (att.media_type || 'image/png') + ';base64,' + att.data" class="max-w-[140px] max-h-[100px] object-cover rounded-xl border border-slate-200" @click="openLightbox('data:' + (att.media_type || 'image/png') + ';base64,' + att.data)" />
                      <AttachmentChip v-else :att="att" @preview-image="openLightbox" />
                    </template>
                  </div>
                  <div v-if="msg.content" class="user-bubble rounded-[16px] px-3 py-2 text-[13px] leading-[1.6] text-slate-800 whitespace-pre-wrap break-words text-left">
                    {{ msg.content }}
                  </div>
                </div>

                <!-- Assistant -->
                <div v-else class="w-full flex flex-col items-start">
                  <div class="flex items-center gap-2 mb-2">
                    <div class="coach-chat-avatar">
                      <img :src="coachAvatar" alt="FDE 智能助手" />
                    </div>
                    <span class="text-[14px] font-semibold text-slate-700">FDE 智能助手</span>
                    <span v-if="assistantReplyBusy && idx === activeDlvMsgs.length - 1" class="inline-flex items-center gap-1 text-[12px] text-blue-600">
                      <span class="w-1.5 h-1.5 rounded-full bg-blue-500 thinking-breathe"></span>工作中
                    </span>
                  </div>
                  <!-- Thinking steps -->
                  <ThinkingSummary :message="msg" :busy="assistantReplyBusy && idx === activeDlvMsgs.length - 1 && !msg.thinkingDone" />
                  <!-- AI 回复：与左侧选中的交付物对应，避免每条消息重复标题和阶段。 -->
                  <div v-if="msg.content || (assistantReplyBusy && idx === activeDlvMsgs.length - 1)"
                    class="w-full">
                    <!-- 正文 -->
                    <div class="py-1">
                      <div class="chat-answer w-full max-w-full text-slate-800 markdown-body"
                        v-html="renderAssistantContent(msg, idx, { noFileCards: true })" @click="handleContentImgClick"></div>
                    </div>
                    <!-- 动作条：仅在回复完成后显示 -->
                    <div v-if="msg.content && !(assistantReplyBusy && idx === activeDlvMsgs.length - 1)" class="flex flex-wrap items-center gap-1 pt-2 text-slate-500">
                      <button @click="copyMessage(msg.content)" class="result-act" title="复制内容">
                        <i class="fa-regular fa-copy"></i>复制
                      </button>
                      <button @click="openPreviewWindow" class="result-act">
                        <i class="fa-solid fa-file-lines"></i>查看文档
                      </button>
                      <button @click="exportDeliverableMd(deliverableSelected)" :disabled="deliverableStatus[selectedDeliverable?.key] !== 'ready'" class="result-act">
                        <i class="fa-solid fa-download"></i>下载
                      </button>
                      <button @click="switchNav('prototype')" class="result-act">
                        <i class="fa-solid fa-window-maximize"></i>查看原型
                      </button>
                    </div>
                  </div>
                  <span v-if="msg.timestamp" class="ws-meta text-slate-400 mt-1.5 ml-0.5">{{ msg.timestamp }}</span>
                </div>
              </div>
            </div>
          </div>


          </div>

          <!-- Composer -->
          <div class="project-assistant-composer shrink-0 bg-white px-3 pb-3 pt-2" :class="{ 'assistant-home-composer': !assistantConversationOpen && !documentFullscreen }">
            <div class="assistant-conversation-actions">
              <span :title="discussionStore.active.value?.title || assistantSubject">{{ discussionStore.active.value?.title || assistantSubject }}</span>
              <button v-if="discussionStore.active.value" type="button" :disabled="assistantReplyBusy || deliverableBusy" @click="discussionStore.useDefault(); assistantConversationOpen = true" title="查看当前任务的对话">当前任务</button>
              <button type="button" :disabled="assistantReplyBusy || deliverableBusy" @click="discussionStore.newWindow" title="新建对话"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i><span>新建对话</span></button>
            </div>
            <div class="w-full max-w-[760px] mx-auto">
              <div class="rounded-[14px] border border-blue-100 bg-white shadow-[0_4px_16px_rgba(49,112,209,0.08)] transition-all duration-200 hover:border-blue-200 focus-within:border-blue-400/70 focus-within:shadow-[0_4px_20px_rgba(49,112,209,0.14)]">
                <div v-if="dlvComposer.attachments.value.length" class="flex items-center gap-2 px-4 pt-3 flex-wrap">
                  <div v-for="(att, ai) in dlvComposer.attachments.value" :key="ai" class="relative">
                    <img v-if="att.type === 'image'" :src="'data:' + att.media_type + ';base64,' + att.data" class="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                    <div v-else class="flex items-center gap-2 h-12 px-2.5 rounded-lg border border-slate-200 glass-card max-w-[180px]">
                      <i class="fa-solid fa-file-lines text-blue-500 text-sm shrink-0"></i>
                      <span class="ws-meta text-slate-700 truncate">{{ att.name }}</span>
                    </div>
                    <button @click="dlvComposer.removeAttachment(ai)" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-700/90 hover:bg-danger text-white text-[8px] flex items-center justify-center">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                </div>
                <div v-if="currentStage===1&&researchExcerpt" class="selected-material-excerpt" aria-label="已选中的文件内容"><div><strong>已选中内容</strong><button type="button" aria-label="取消引用选中内容" @click="researchExcerpt=''" @mousedown.prevent><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><p>{{researchExcerpt}}</p><span>输入问题，AI 会针对这段内容回答</span></div>
                <div class="project-assistant-input-row flex items-center gap-2 px-2">
                  <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700" :aria-expanded="assistantToolsOpen" title="模型与附件" @click="assistantToolsOpen = !assistantToolsOpen"><i class="fa-solid fa-plus"></i></button>
                  <textarea
                    v-model="dlvInput"
                    rows="1"
                    :placeholder="assistantReplyBusy ? 'AI 正在响应中…' : currentStage===1&&researchExcerpt ? '针对选中内容提问…' : currentStage===1&&researchDocument ? '针对当前文件提问…' : documentFullscreen ? '针对这份交付物提问…' : '输入你的问题…'"
                    :disabled="currentStage === 1 ? knowledgeStreaming : assistantReplyBusy"
                    class="min-w-0 flex-1 resize-none bg-transparent py-1 text-[13px] leading-6 text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-60"
                    @keydown.ctrl.enter.prevent="dlvSend"
                    @keydown.meta.enter.prevent="dlvSend"
                  ></textarea>
                  <button v-if="assistantReplyBusy" @click="cancelAssistantReply" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white" title="停止生成"><span class="h-2.5 w-2.5 rounded-[2px] bg-white"></span></button>
                  <button v-else @click="dlvSend" :disabled="!dlvInput.trim() && dlvComposer.attachments.value.length === 0" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-300" title="发送问题"><i class="fa-solid fa-paper-plane text-[13px]"></i></button>
                </div>
                <div v-if="assistantToolsOpen || dlvComposer.attachments.value.length || assistantReplyBusy" class="assistant-composer-tools flex items-center justify-between gap-2 border-t border-slate-100 px-3 pb-1 pt-1">
                  <div class="flex items-center gap-0.5">
                    <ModelSelector
                      class="mr-1.5"
                      :models="availableModels"
                      :current="currentModel"
                      @change="handleChangeModel"
                    />
                    <button @click="dlvComposer.pickImage" :disabled="assistantReplyBusy" class="ws-icon-btn" title="上传图片">
                      <i class="fa-solid fa-image"></i>
                    </button>
                    <button @click="dlvComposer.pickFile" :disabled="assistantReplyBusy" class="ws-icon-btn" title="上传文件">
                      <i class="fa-solid fa-paperclip"></i>
                    </button>
                    <button @click="dlvComposer.toggleRecording" :disabled="assistantReplyBusy || !dlvComposer.recordingSupported" class="ws-icon-btn" :class="dlvComposer.isRecording.value ? 'text-white bg-danger hover:bg-danger-deep' : ''" :title="dlvComposer.isRecording.value ? '停止录音' : '语音输入'">
                      <i class="fa-solid" :class="dlvComposer.isRecording.value ? 'fa-stop' : 'fa-microphone'"></i>
                    </button>
                  </div>
                  <span class="ws-meta shrink-0 select-none text-slate-400">Ctrl+Enter</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </aside>


      </div><!-- end workspace tab -->

      <!-- 中间主阅读区：沿用已有实时预览、编辑、Word 与下载数据流。 -->

      <div
        v-if="activeTab === 'workspace'"
        ref="documentReaderRef"
        class="document-main order-2 flex min-w-0 flex-1 flex-col overflow-hidden bg-white"
        :class="{ 'document-fullscreen': documentFullscreen, 'panel-resizing': assistantPanelDragging }"
        :role="documentFullscreen ? 'dialog' : 'region'"
        :aria-modal="documentFullscreen ? true : undefined"
        :aria-label="currentStage===1?'资料准备':undefined"
        :aria-labelledby="currentStage===1?undefined:'deliverable-reader-title'"
      >
          <ProjectFlowWorkspace ref="workflowRef" :key="slug" v-show="workflowOpen && currentStage <= 3 && !documentFullscreen" :slug="slug" :stage="currentStage" :progress-stage="progressStage" :streaming="isStreaming || (deliverableBusy && !workflowBusy)" :run-job="runWorkflowJob" :advance-stage="advanceWorkflowStage" @open-file="openWorkflowFile" @materials="activeTab = 'knowledge'" @state="workflowSnapshot = $event" @busy="setWorkflowBusy" />
          <ProjectPrototypePackage v-if="selectedDeliverable?.kind === 'prototype-package' && !workflowOpen" :slug="slug" :streaming="isStreaming || deliverableBusy" @generate="generateDeliverable('prototype-demo')" @open-document="openWorkflowFile" />
          <template v-if="(!workflowOpen || currentStage > 3 || documentFullscreen) && selectedDeliverable?.kind !== 'prototype-package'">
          <!-- 顶栏 -->
          <div v-if="selectedDeliverable" :style="documentFullscreen ? { paddingRight: `${assistantPanelCollapsed ? 76 : assistantPanelWidth + 32}px` } : undefined" class="document-toolbar shrink-0 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <i :class="selectedDeliverable?.icon || 'fa-solid fa-file-lines'" class="text-blue-600 text-[16px]"></i>
              </div>
              <div class="min-w-[180px] flex-1">
                <div class="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{{ selectedDeliverable ? '当前交付物' : '当前阶段' }} · 阶段 {{ currentStage }} / {{ stageDisplayName(currentStage) }}</span>
                  <span v-if="livePreviewStreaming" class="inline-flex items-center gap-1 text-blue-600"><span class="h-1.5 w-1.5 rounded-full bg-blue-500 thinking-breathe"></span>写入中</span>
                  <span v-else-if="livePreviewContent" class="review-status" :class="currentReviewState==='confirmed'?'text-emerald-700':'text-slate-500'">{{currentReviewState==='confirmed'?'已确认':currentReviewState==='review'?'待评审':'待审阅'}}</span><span v-else-if="selectedDeliverable" class="text-slate-400">未生成</span>
                </div>
                <h2 id="deliverable-reader-title" class="text-[17px] font-semibold leading-snug text-slate-900">{{ selectedDeliverable ? documentTitle : activeStageObj.name }}</h2>
              </div>
              <button v-if="selectedDeliverable&&livePreviewContent" ref="documentFullscreenButtonRef" type="button" class="document-fullscreen-btn" :aria-label="documentFullscreen ? '退出交付物全屏阅读' : '全屏阅读当前交付物'" :aria-pressed="documentFullscreen" :title="documentFullscreen ? '退出全屏（Esc）' : '全屏阅读'" @click="toggleDocumentFullscreen">
                <i class="fa-solid" :class="documentFullscreen ? 'fa-compress' : 'fa-expand'" aria-hidden="true"></i>
                {{ documentFullscreen ? '退出全屏' : '全屏阅读' }}
              </button>
              <template v-if="selectedDeliverable&&livePreviewContent">
                <button @click="togglePreviewEdit" :disabled="livePreviewStreaming||sectionSaving" class="ws-tool-btn" :class="previewEditing?'is-on':''" title="编辑整份文档"><i class="fa-solid" :class="previewEditing?'fa-eye':'fa-pen'"></i>{{previewEditing?'预览':'编辑'}}</button>
                <button v-if="currentReviewState==='draft'&&!previewEditing" class="document-primary-action" :disabled="isStreaming||deliverableBusy" @click="sendForReview">送审 <i class="fa-solid fa-arrow-right"></i></button>
                <button v-else-if="currentReviewState==='review'&&!previewEditing" class="document-primary-action" :disabled="isStreaming||deliverableBusy" @click="openAssessment('document')">确认</button>
                <button v-else-if="currentReviewState==='confirmed'&&!previewEditing&&(nextWorkflowDeliverable||currentStage===progressStage)" class="document-primary-action" :disabled="isStreaming||deliverableBusy||stageAdvancing" @click="continueDeliverableWorkflow">{{nextWorkflowDeliverable?'下一份交付物':generationStageReviewed?'进入下一阶段':'阶段验收'}} <i class="fa-solid fa-arrow-right"></i></button>
                <div class="document-options" @keydown.esc="documentMenuOpen=false">
                  <button class="ws-tool-btn" type="button" aria-label="更多文档操作" :aria-expanded="documentMenuOpen" @click="documentMenuOpen=!documentMenuOpen"><i class="fa-solid fa-ellipsis"></i></button>
                  <div v-if="documentMenuOpen" class="document-menu-dismiss" @click="documentMenuOpen=false"></div>
                  <div v-if="documentMenuOpen" class="document-options-menu" role="menu">
                    <button role="menuitem" @click="documentMenuOpen=false;setPreviewMode('md')">阅读正文 <i v-if="livePreviewMode==='md'" class="fa-solid fa-check"></i></button>
                    <button role="menuitem" :disabled="docxBusy||livePreviewStreaming" @click="documentMenuOpen=false;switchToDocxView">Word 版式 <i v-if="livePreviewMode==='docx'" class="fa-solid fa-check"></i></button>
                    <button role="menuitem" :disabled="docxBusy||livePreviewStreaming" @click="documentMenuOpen=false;openDeliverableDocx">下载 Word</button>
                    <button role="menuitem" @click="documentMenuOpen=false;openProjectVersions">历史版本</button>
                    <small v-if="documentVersion">版本 {{documentVersion}}</small>
                  </div>
                </div>
              </template>
          </div>

          <!-- 文档正文 -->
          <div class="document-reading-layout flex min-h-0 flex-1">
          <div ref="previewScrollRef" class="document-scroll min-h-0 flex-1 overflow-y-auto bg-[#f5f7fb]" :class="{'research-document-scroll':currentStage===1,'research-file-open':currentStage===1&&researchDocument}">
            <div v-if="currentStage===1" class="research-workspace" :class="{'is-reading-material':researchDocument}">
              <ProjectKnowledgeSpace ref="researchSpaceRef" embedded :source-path="knowledgeSourcePath" :slug="slug" :messages="knowledgeMessages" :streaming="knowledgeStreaming" @view="researchViewChanged" @selection="researchSelectionChanged" @changed="updateResearchSources" @busy="researchFormBusy=$event" @ask="askKnowledge" @cancel="cancelKnowledge" />
              <footer v-if="!researchDocument" class="research-continue">
                <div><strong>{{researchSources===null?'正在读取项目资料…':researchSources.length?`已放入 ${researchSources.length} 份资料`:'先放入至少一份客户资料或对接记录'}}</strong><p>{{researchFormBusy?'当前记录编辑中，请先保存，再继续。':'这些资料会保留在项目中，用于后续需求、设计与交付物生成。'}}</p><p v-if="researchContinueError" role="alert" class="text-red-600">{{researchContinueError}}</p></div>
                <button class="document-primary-action" :disabled="!researchSources?.length||researchFormBusy||researchContinuing||stageAdvancing||isStreaming" @click="finishResearchPreparation">{{researchContinuing?'正在进入…':'资料准备完成，进入需求沟通'}} <i class="fa-solid fa-arrow-right"></i></button>
              </footer>
            </div>
            <div v-else-if="!isWorkspaceStage" class="stage-overview-paper"><StagePanel :stage="activeStageObj" :has-workspace="false" compact /></div>
            <!-- 空态 -->
            <div v-else-if="!livePreviewContent && !livePreviewDocxHtml" class="deliverable-start">
              <span class="start-eyebrow">阶段 {{currentStage}} · {{stageDisplayName(currentStage)}}<template v-if="deliverableOrder"> / 第 {{deliverableOrder}} 份交付物</template></span>
              <h2>{{selectedDeliverable?.name||'选择一份交付物'}}</h2>
              <p class="start-description">{{selectedDeliverable?.hint||'从左侧选择交付物，按以下步骤完成。'}}</p>
              <ol class="generation-steps" aria-label="交付物生成流程">
                <li :class="{'is-current':!generationContextReady,'is-done':generationContextReady}"><span>{{generationContextReady?'✓':'1'}}</span><div><strong>补充项目资料</strong><p>客户需求、对接记录或已有材料</p></div></li>
                <li :class="{'is-current':generationContextReady}"><span>2</span><div><strong>生成交付物</strong><p>根据项目资料生成当前文档</p></div></li>
                <li><span>3</span><div><strong>审阅并确认</strong><p>修改内容，完成评审与确认</p></div></li>
              </ol>
              <p v-if="generationSourceError" class="start-source-note">{{generationSourceError}}</p>
              <p v-else class="start-source-note">{{generationSources===null?'正在检查项目资料…':generationContextReady?`已具备项目依据${generationSources?` · ${generationSources} 份资料`:''}，可以生成当前交付物。`:'先补充项目资料，让生成内容符合客户的实际需求。'}}</p>
              <div class="start-actions">
                <button v-if="generationSourceError" class="document-primary-action" @click="refreshGenerationSources">重新读取资料</button>
                <button v-else-if="!generationContextReady" class="document-primary-action" @click="switchNav('knowledge')">补充项目资料 <i class="fa-solid fa-arrow-right"></i></button>
                <button v-else @click="generateDeliverable(deliverableSelected)" :disabled="isStreaming||deliverableBusy||!deliverableSelected" class="document-primary-action"><i class="fa-solid fa-wand-magic-sparkles"></i>{{deliverableBusy?'生成中…':'生成当前交付物'}}</button>
                <button v-if="generationContextReady&&!generationSourceError" class="ws-tool-btn" @click="switchNav('knowledge')">查看项目资料</button>
              </div>
            </div>

            <!-- Word 成品预览 -->
            <div v-else-if="livePreviewMode === 'docx' && livePreviewDocxHtml"
              class="document-paper document-word mx-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <div class="px-7 py-6 markdown-body docx-preview" v-html="livePreviewDocxHtml"></div>
            </div>

            <!-- Markdown 预览 / 在线编辑 -->
            <div v-else
              class="document-paper mx-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <!-- 编辑态 -->
              <div v-if="previewEditing" class="p-4">
                <textarea
                  v-model="previewDraft"
                  aria-label="编辑当前交付物正文"
                  class="document-editor w-full h-[calc(100vh-340px)] min-h-[320px] px-4 py-3 border border-slate-200 rounded-lg ws-body font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                ></textarea>
                <div class="mt-3 flex items-center justify-end gap-2">
                  <button @click="savePreviewEdit()" class="ws-tool-btn">取消</button>
                  <button @click="savePreviewEdit()" :disabled="previewSaving" class="inline-flex items-center gap-1.5 h-8 px-3.5 ws-label font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                    <i class="fa-solid fa-check text-[10px]"></i>{{previewSaving?'保存中…':'保存并更新 Word'}}
                  </button>
                </div>
              </div>
              <!-- 预览态 -->
              <template v-else>
              <div class="document-masthead">
                <div class="text-[11px] font-medium tracking-wide text-blue-600">阶段 {{ currentStage }} · {{ stageDisplayName(currentStage) }} / 交付物</div>
                <h1 class="mt-2 text-[24px] font-semibold leading-snug text-slate-900">{{ documentTitle }}</h1>
                <p class="mt-2 text-[12px] leading-5 text-slate-500">{{ projectName }}<span v-if="documentVersion"> · {{ documentVersion }}</span></p>
              </div>
              <nav v-if="structuredDocument.sections.length" class="document-outline" aria-label="文档章节">
                <button v-for="section in structuredDocument.sections" :key="section.index" type="button" @click="scrollToDocumentSection(section.index)">{{ section.index }}. {{ section.title }}</button>
              </nav>
              <div v-if="structuredDocument.sections.length" class="structured-document">
                <details v-if="structuredDocument.intro" class="document-intro border-b border-slate-100 px-6 py-3 text-[12px] text-slate-500">
                  <summary class="cursor-pointer font-medium text-slate-600">文档说明</summary>
                  <div class="markdown-body mt-3" v-html="renderDocumentMarkdown(structuredDocument.intro)"></div>
                </details>
                <article v-for="section in structuredDocument.sections" :key="section.index" :data-document-section="section.index" class="document-section border-b border-slate-100 px-6 py-5 last:border-b-0">
                  <div class="mb-4 flex items-center gap-3">
                    <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[13px] font-medium text-blue-600">{{ section.index }}</span>
                    <h2 class="min-w-0 flex-1 text-[17px] font-semibold text-slate-900">{{ section.title }}</h2>
                    <button v-if="sectionEdit?.index !== section.index" type="button" class="rounded-lg px-2 py-1 text-[12px] text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40" :disabled="livePreviewStreaming || isStreaming || sectionSaving" :aria-label="`单独编辑${section.title}`" @click="editDocumentSection(section.index)"><i class="fa-solid fa-pen mr-1" aria-hidden="true"></i>编辑本节</button>
                  </div>
                  <div v-if="sectionEdit?.index === section.index" class="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                    <textarea v-model="sectionDraft" :aria-label="`编辑${section.title}的内容`" :disabled="sectionSaving" rows="10" class="section-editor w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 text-[13px] leading-6 text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"></textarea>
                    <div class="mt-2 flex items-center justify-between gap-2">
                      <span class="text-[11px] text-slate-500">仅修改当前章节</span>
                      <div class="flex gap-2">
                        <button type="button" :disabled="sectionSaving" class="ws-tool-btn" @click="sectionEdit = null">取消</button>
                        <button type="button" :disabled="sectionSaving || livePreviewStreaming || isStreaming" class="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50" @click="saveDocumentSection()">{{ sectionSaving ? '保存中…' : '保存本节' }}</button>
                      </div>
                    </div>
                  </div>
                  <div v-else class="document-section-body markdown-body" v-html="renderDocumentMarkdown(section.body)"></div>
                </article>
              </div>
              <div v-else class="document-section px-7 py-6 markdown-body" v-html="renderDocumentMarkdown(livePreviewPreviewMd.replace(/^#\s+[^\n]+\n?/, ''))"></div>
              </template>
            </div>
          </div>
          <div v-if="documentFullscreen && !assistantPanelCollapsed" class="reading-splitter" :class="{ 'is-dragging': assistantPanelDragging }" role="separator" aria-label="调整文档与对话宽度" aria-orientation="vertical" tabindex="0" :aria-valuenow="assistantPanelWidth" :aria-valuemin="280" :aria-valuemax="640" title="左右拖动调整宽度，双击恢复" @pointerdown="startAssistantResize" @pointermove="moveAssistantResize" @pointerup="endAssistantResize" @pointercancel="endAssistantResize" @lostpointercapture="assistantPanelDragging = false" @dblclick="setAssistantPanelWidth(360)" @keydown.left.prevent="setAssistantPanelWidth(assistantPanelWidth + 24)" @keydown.right.prevent="setAssistantPanelWidth(assistantPanelWidth - 24)"></div>
          <div v-show="documentFullscreen" id="document-reader-assistant" class="document-chat-slot" :style="{ width: `${assistantPanelCollapsed ? 44 : assistantPanelWidth}px` }" aria-label="当前交付物对话"></div>
          </div>
          </template>
        </div>


      <ProjectKnowledgeSpace :source-path="knowledgeSourcePath" v-if="activeTab === 'knowledge'" :slug="slug" :messages="knowledgeMessages" :streaming="knowledgeStreaming" @ask="askKnowledge" @cancel="cancelKnowledge" />

      <ProjectSpacePanel v-if="activeTab === 'overview' || activeTab === 'meetings'" :key="activeTab" :mode="activeTab" :slug="slug" :meta="projectMeta" :progress-stage="progressStage" :stage-status="stageStatus" :stages="projectOverviewStages" @materials="switchNav('knowledge')" @resume="resumeWorkflow" @open-source="openProjectSource" @open-document="({stage,key}) => selectGroupDeliverable(stage,key)" />

      <!-- Prototype Tab — full width -->
      <div v-if="activeTab === 'prototype'" class="flex h-full min-w-0 flex-1">
        <!-- File tree -->
        <div class="w-[172px] shrink-0 bg-transparent/60 border-r border-slate-100 flex flex-col overflow-hidden">
          <div class="px-2 py-1.5 border-b border-slate-100 flex items-center justify-between">
            <span class="ws-micro font-semibold text-slate-400">文件列表</span>
            <button @click="refreshPrototypeFiles" class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-white transition-colors" title="刷新">
              <i class="fa-solid fa-arrows-rotate text-[9px]"></i>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto scrollbar-thin py-1 px-1.5">
<div v-if="stagePrototypeFiles.length" class="prototype-stage-assets"><h4>阶段流程原型</h4><button v-for="file in stagePrototypeFiles" :key="file.path" type="button" @click="openStagePrototype(file)">阶段 {{ file.stage }} · {{ file.name }} <i class="fa-solid fa-arrow-up-right-from-square"></i></button></div><p v-if="prototypeLoadError" class="px-2 py-2 text-[12px] text-red-600">{{ prototypeLoadError }}</p>
            <div v-if="prototypeFiles.length === 0" class="px-2 py-3 ws-micro text-slate-400 text-center">
              暂无文件
            </div>
            <template v-for="row in fileTreeRows" :key="row.type + ':' + (row.path || row.rel)">
              <!-- 文件夹行：可折叠 -->
              <div v-if="row.type === 'dir'" class="group/row relative">
                <button
                  @click="toggleDir(row.path)"
                  class="w-full text-left pr-6 py-1 rounded ws-micro text-slate-600 hover:bg-white/70 transition-colors flex items-center gap-1"
                  :style="{ paddingLeft: (6 + row.depth * 11) + 'px' }"
                >
                  <i class="fa-solid text-[7px] text-slate-400 w-2 shrink-0" :class="row.collapsed ? 'fa-chevron-right' : 'fa-chevron-down'"></i>
                  <i class="fa-solid text-[9px] shrink-0 text-amber-400" :class="row.collapsed ? 'fa-folder' : 'fa-folder-open'"></i>
                  <span class="truncate font-medium">{{ row.name }}</span>
                </button>
                <button
                  @click.stop="deletePrototypeEntry(row)"
                  type="button"
                  class="absolute top-0.5 right-1 w-4 h-4 rounded flex items-center justify-center text-slate-300 opacity-0 group-hover/row:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger-soft transition-all"
                  :title="`删除文件夹 ${row.name}`"
                  :aria-label="`删除文件夹 ${row.name}`"
                >
                  <i class="fa-solid fa-trash-can text-[8px]"></i>
                </button>
              </div>
              <!-- 文件行 -->
              <div v-else class="group/row relative">
                <button
                  @click="selectPrototypeFile(row.rel)"
                  class="w-full text-left pr-6 py-1 rounded ws-micro transition-colors flex items-center gap-1.5"
                  :style="{ paddingLeft: (6 + row.depth * 11 + 12) + 'px' }"
                  :class="selectedFile === row.rel ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-white/70'"
                >
                  <i
                    class="text-[9px] shrink-0"
                    :class="[fileIcon(row.rel).icon, selectedFile === row.rel ? 'text-blue-500' : fileIcon(row.rel).color]"
                  ></i>
                  <span class="truncate">{{ row.base }}</span>
                </button>
                <button
                  @click.stop="deletePrototypeEntry(row)"
                  type="button"
                  class="absolute top-0.5 right-1 w-4 h-4 rounded flex items-center justify-center text-slate-300 opacity-0 group-hover/row:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger-soft transition-all"
                  :title="`删除 ${row.base}`"
                  :aria-label="`删除 ${row.base}`"
                >
                  <i class="fa-solid fa-trash-can text-[8px]"></i>
                </button>
              </div>
            </template>
          </div>
        </div>
        <!-- Preview pane -->
        <div class="flex-1 flex flex-col min-w-0">
          <div class="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border-b border-slate-100 glass-card">
            <button
              @click="openInBrowser"
              class="inline-flex items-center gap-1.5 h-7 px-2.5 ws-meta rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              :disabled="!selectedFile"
            >
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              在浏览器打开
            </button>
            <button
              @click="regeneratePrototype"
              class="inline-flex items-center gap-1.5 h-7 px-2.5 ws-meta rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              :disabled="isStreaming"
            >
              <i class="fa-solid fa-rotate text-[10px]"></i>
              重新生成
            </button>
            <button
              @click="publishLocal"
              class="inline-flex items-center gap-1.5 h-7 px-2.5 ws-meta rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              :disabled="prototypeFiles.length === 0"
              title="启动本地服务并在浏览器打开（数据可正常加载）"
            >
              <i class="fa-solid fa-globe text-[10px]"></i>
              发布本地服务
            </button>
            <button
              @click="exportZip"
              class="inline-flex items-center gap-1.5 h-7 px-2.5 ws-meta rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              :disabled="prototypeFiles.length === 0"
              title="把原型打包为 ZIP 下载"
            >
              <i class="fa-solid fa-file-zipper text-[10px]"></i>
              导出 ZIP
            </button>
            <button
              @click="deleteAllPrototype"
              class="inline-flex items-center gap-1.5 h-7 px-2.5 ws-meta rounded-md text-slate-500 hover:text-danger hover:bg-danger-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="prototypeFiles.length === 0 || isStreaming"
              title="删除全部原型文件"
            >
              <i class="fa-solid fa-trash-can text-[10px]"></i>
              清空原型
            </button>
            <!-- 预览缩放：仅缩放 iframe 视觉，不改原型文件 -->
            <div v-if="selectedFile && isHtmlSelected" class="ml-auto flex items-center gap-1 rounded-lg bg-slate-100 px-1 py-0.5">
              <button @click="zoomStep(-0.1)" class="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-white hover:text-blue-600 transition-colors" title="缩小">
                <i class="fa-solid fa-minus text-[10px]"></i>
              </button>
              <button @click="setZoom(1)" class="min-w-[42px] text-center text-[11px] tabular-nums text-slate-600 hover:text-blue-600 transition-colors" title="重置为 100%">
                {{ Math.round(previewZoom * 100) }}%
              </button>
              <button @click="zoomStep(0.1)" class="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-white hover:text-blue-600 transition-colors" title="放大">
                <i class="fa-solid fa-plus text-[10px]"></i>
              </button>
            </div>
          </div>
          <div class="flex-1 min-h-0">
            <!-- AI 工作进度：生成 / 迭代原型时实时展示推理步骤、工具调用与输出 -->
            <div
              v-if="streamTargetTab === 'iterate' && iterateMessages.length > 0 && (isStreaming || !selectedFile)"
              ref="iterateChatRef"
              class="h-full overflow-y-auto px-4 py-5"
            >
              <div class="w-full max-w-3xl mx-auto space-y-7">
                <div
                  v-for="(msg, idx) in iterateMessages"
                  :key="idx"
                  class="flex flex-col w-full"
                  :class="msg.role === 'user' ? 'items-end' : 'items-start'"
                >
                  <!-- User -->
                  <div v-if="msg.role === 'user'" class="max-w-[80%] flex flex-col items-end">
                    <div v-if="msg.content" class="rounded-[18px] px-3.5 py-2 leading-relaxed text-[14px] bg-[var(--ui-brand-soft)] text-slate-800 whitespace-pre-wrap break-words text-left">
                      {{ msg.content }}
                    </div>
                  </div>
                  <!-- Assistant -->
                  <div v-else class="w-full flex flex-col items-start">
                    <div class="flex items-center gap-2 mb-2">
                      <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                        <i class="fa-solid fa-robot text-white text-[12px]"></i>
                      </div>
                      <span class="text-[13px] font-semibold text-slate-700">AI 助手</span>
                      <span class="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full"
                        :class="(isStreaming && idx === iterateMessages.length - 1) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'">
                        <span class="w-1.5 h-1.5 rounded-full" :class="(isStreaming && idx === iterateMessages.length - 1) ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'"></span>
                        {{ (isStreaming && idx === iterateMessages.length - 1) ? '工作中' : '已完成' }}
                      </span>
                    </div>
                    <ThinkingSummary :message="msg" :busy="isStreaming && idx === iterateMessages.length - 1 && !msg.thinkingDone" />
                    <div v-if="msg.content || (isStreaming && idx === iterateMessages.length - 1)" class="w-full leading-[1.75] text-[15px] text-slate-800 markdown-body" v-html="renderAssistantContent(msg, idx)" @click="handleContentImgClick"></div>
                    <span v-if="msg.timestamp" class="text-[12px] text-slate-400 mt-2">{{ msg.timestamp }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="!selectedFile && prototypeFiles.length === 0" class="flex flex-col items-center justify-center h-full">
              <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <i class="fa-solid fa-window-maximize text-2xl text-slate-300"></i>
              </div>
              <p class="text-sm text-slate-500 mb-4">{{ stagePrototypeFiles.length ? '阶段原型已生成，请从左侧打开' : '尚未生成原型' }}</p>
              <button
                @click="generatePrototype"
                class="inline-flex items-center gap-2 px-4 py-2 text-xs bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors"
                :disabled="isStreaming"
              >
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                开始生成
              </button>
            </div>
            <div v-else-if="!selectedFile" class="flex items-center justify-center h-full text-sm text-slate-400">
              选择左侧文件进行预览
            </div>
            <div v-else-if="isHtmlSelected" class="w-full h-full overflow-hidden glass-card">
              <iframe
                :key="iframeKey"
                :src="iframeSrc"
                class="border-0 origin-top-left"
                :style="{ width: (100 / previewZoom) + '%', height: (100 / previewZoom) + '%', transform: 'scale(' + previewZoom + ')' }"
                sandbox="allow-scripts allow-same-origin"
              ></iframe>
            </div>
            <!-- 非 HTML 文件：源码预览 -->
            <div v-else class="h-full flex flex-col bg-[var(--ui-ink)] min-h-0">
              <div class="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-white/10">
                <i class="text-[9px]" :class="[fileIcon(selectedFile).icon, fileIcon(selectedFile).color]"></i>
                <span class="ws-micro text-slate-300 font-mono truncate">{{ selectedFile }}</span>
                <span class="ml-auto ws-micro text-slate-500 shrink-0">只读预览</span>
              </div>
              <pre class="flex-1 overflow-auto p-3 text-[11px] leading-[1.6] text-slate-200 font-mono whitespace-pre"><code>{{ fileSource || '（空文件）' }}</code></pre>
            </div>
          </div>

          <!-- 迭代对话条（就地改原型，原「迭代修改」tab 并入这里）-->
          <div v-if="prototypeFiles.length > 0 || isStreaming" class="shrink-0 border-t border-slate-100 glass-card px-4 py-3">
            <div class="max-w-3xl mx-auto">
              <!-- 附件预览 -->
              <div v-if="iterateComposer.attachments.value.length" class="flex items-center gap-2 mb-2 flex-wrap">
                <div v-for="(att, ai) in iterateComposer.attachments.value" :key="ai" class="relative group/att">
                  <img v-if="att.type === 'image'" :src="'data:' + att.media_type + ';base64,' + att.data" class="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                  <div v-else class="flex items-center gap-1.5 h-12 px-2.5 rounded-lg border border-slate-200 glass-card max-w-[160px]">
                    <i class="fa-solid fa-file-lines text-blue-500 text-sm shrink-0"></i>
                    <span class="text-[11px] text-slate-600 truncate">{{ att.name }}</span>
                  </div>
                  <button @click="iterateComposer.removeAttachment(ai)" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[8px] flex items-center justify-center shadow-sm">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
              </div>
              <div class="rounded-2xl border transition-all duration-200 bg-slate-50 border-slate-200 focus-within:bg-white focus-within:border-blue-400/70 focus-within:shadow-[0_4px_20px_-8px_hsl(var(--primary)_/_25%)] flex items-end gap-2 pr-2">
                <textarea
                  v-model="iterateInput"
                  rows="1"
                  :placeholder="isStreaming ? 'AI 正在修改原型…' : '说出你想改什么，AI 就地更新原型，例如：把首页导航改成左侧栏'"
                  :disabled="isStreaming"
                  class="flex-1 resize-none text-[13px] text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none leading-6 px-4 py-3 max-h-[120px] scrollbar-hide disabled:opacity-60"
                  @keydown.enter.exact="onIterateEnter"
                ></textarea>
                <button @click="iterateComposer.pickImage" :disabled="isStreaming" class="mb-1.5 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed" title="上传图片">
                  <i class="fa-solid fa-image text-xs"></i>
                </button>
                <button @click="iterateComposer.pickFile" :disabled="isStreaming" class="mb-1.5 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed" title="上传文件">
                  <i class="fa-solid fa-paperclip text-xs"></i>
                </button>
                <button @click="iterateComposer.toggleRecording" :disabled="isStreaming || !iterateComposer.recordingSupported" class="mb-1.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" :class="iterateComposer.isRecording.value ? 'text-white bg-danger hover:bg-danger-deep' : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'" :title="iterateComposer.recordingSupported ? (iterateComposer.isRecording.value ? '停止录音' : '语音输入') : '当前环境不支持录音'">
                  <i class="fa-solid text-xs" :class="iterateComposer.isRecording.value ? 'fa-stop' : 'fa-microphone'"></i>
                </button>
                <button
                  v-if="isStreaming"
                  @click="cancelStream"
                  class="mb-1.5 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center shrink-0"
                  title="停止"
                >
                  <span class="w-3 h-3 rounded-[3px] glass-card"></span>
                </button>
                <button
                  v-else
                  @click="sendIterate"
                  :disabled="!iterateInput.trim() && iterateComposer.attachments.value.length === 0"
                  class="mb-1.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all"
                  :class="(iterateInput.trim() || iterateComposer.attachments.value.length) ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30' : 'bg-slate-100 text-slate-300 cursor-not-allowed'"
                >
                  <i class="fa-solid fa-arrow-up text-xs"></i>
                </button>
              </div>
              <p class="text-[10px] text-slate-400 mt-1.5 text-center">Enter 发送迭代 · 修改会直接作用到当前原型文件</p>
            </div>
          </div>
        </div>
      </div>


      <!-- 阶段③ 对话 Tab (chat3) — 豆包风格,与「智能对话」一致 -->
      <div v-else-if="activeTab === 'chat3'" class="flex h-full min-w-0 flex-1">
        <!-- Center: Chat area -->
        <div class="flex-1 flex flex-col min-w-0 relative glass-card">
          <div ref="stage3ChatRef" class="flex-1 overflow-y-auto px-4 pt-6" :class="stage3Messages.length > 0 ? 'pb-[150px]' : ''">
            <!-- Empty state -->
            <div v-if="stage3Messages.length === 0" class="flex flex-col items-center justify-center h-full text-center px-6">
              <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/25">
                <i class="fa-solid fa-diagram-project text-xl text-white"></i>
              </div>
              <h3 class="text-[17px] font-semibold text-slate-800 mb-1.5">阶段③ · 需求确认 + 智能体设计</h3>
              <p class="text-[13px] text-slate-400 max-w-md leading-relaxed">把需求签字定稿、拆智能体矩阵。聊透后到「交付物」一键生成确认表 / 设计表 / PRD。</p>
              <div class="flex flex-wrap gap-2 justify-center mt-6 max-w-lg">
                <button
                  v-for="q in stage3Quick"
                  :key="q"
                  @click="stage3Input = q; sendStage3()"
                  class="px-3.5 py-2 rounded-full bg-slate-50 hover:bg-blue-50 border border-slate-200/70 hover:border-blue-200 text-[12.5px] text-slate-600 hover:text-blue-700 transition-all"
                >
                  {{ q }}
                </button>
              </div>
            </div>

            <!-- Message list -->
            <div v-else class="w-full max-w-3xl mx-auto space-y-7">
              <div
                v-for="(msg, idx) in stage3Messages"
                :key="idx"
                class="flex flex-col w-full group"
                :class="msg.role === 'user' ? 'items-end' : 'items-start'"
              >
                <!-- User -->
                <div v-if="msg.role === 'user'" class="max-w-[80%] flex flex-col items-end">
                  <div v-if="msg.attachments && msg.attachments.length" class="flex flex-wrap gap-2 mb-1.5 justify-end">
                    <template v-for="(att, ai) in msg.attachments" :key="ai">
                      <img v-if="att.type === 'image'" :src="'data:' + (att.media_type || 'image/png') + ';base64,' + att.data" class="max-w-[160px] max-h-[120px] object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:brightness-95 transition" @click="openLightbox('data:' + (att.media_type || 'image/png') + ';base64,' + att.data)" />
                      <AttachmentChip v-else :att="att" @preview-image="openLightbox" />
                    </template>
                  </div>
                  <div v-if="msg.content" class="rounded-[18px] px-3.5 py-2 leading-relaxed text-[14px] bg-[var(--ui-brand-soft)] text-slate-800 whitespace-pre-wrap break-words text-left">
                    {{ msg.content }}
                  </div>
                </div>

                <!-- Assistant -->
                <div v-else class="w-full flex flex-col items-start">
                  <!-- AI 头像 + 名字 + 状态 -->
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                      <i class="fa-solid fa-robot text-white text-[12px]"></i>
                    </div>
                    <span class="text-[13px] font-semibold text-slate-700">AI 助手</span>
                    <span class="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full"
                      :class="(isStreaming && idx === stage3Messages.length - 1) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'">
                      <span class="w-1.5 h-1.5 rounded-full" :class="(isStreaming && idx === stage3Messages.length - 1) ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'"></span>
                      {{ (isStreaming && idx === stage3Messages.length - 1) ? '工作中' : '已完成' }}
                    </span>
                  </div>
                  <!-- Thinking steps -->
                  <ThinkingSummary :message="msg" :busy="isStreaming && idx === stage3Messages.length - 1 && !msg.thinkingDone" />
                  <!-- Content: no bubble, plain text -->
                  <div v-if="msg.content || (isStreaming && idx === stage3Messages.length - 1)" class="w-full leading-[1.75] text-[15px] text-slate-800 markdown-body" v-html="renderAssistantContent(msg, idx)" @click="handleContentImgClick"></div>
                  <span v-if="msg.timestamp" class="text-[12px] text-slate-400 mt-2">{{ msg.timestamp }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Composer — 豆包圆角风格 -->
          <div v-if="stage3Messages.length > 0" class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-10 pb-5 px-4">
            <div class="w-full max-w-3xl mx-auto">
              <!-- 快捷操作芯片（贴输入框上方，豆包式）-->
              <div class="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-hide pb-0.5">
                <button
                  v-for="act in quickActions"
                  :key="act.key"
                  @click="runQuickAction(act)"
                  :disabled="isStreaming || deliverableBusy"
                  class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium glass-card border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i :class="act.icon" class="text-[8px] text-blue-500"></i>
                  {{ act.label }}
                </button>
              </div>
              <div class="rounded-[26px] border transition-all duration-200 bg-slate-50 border-slate-200 hover:border-slate-300 shadow-[0_2px_12px_-6px_rgba(15,23,42,0.12)] focus-within:bg-white focus-within:border-blue-400/70 focus-within:shadow-[0_6px_28px_-8px_hsl(var(--primary)_/_28%)]">
                <!-- 附件预览 -->
                <div v-if="stage3Composer.attachments.value.length" class="flex items-center gap-2 px-5 pt-4 flex-wrap">
                  <div v-for="(att, ai) in stage3Composer.attachments.value" :key="ai" class="relative group/att">
                    <img v-if="att.type === 'image'" :src="'data:' + att.media_type + ';base64,' + att.data" class="w-14 h-14 object-cover rounded-xl border border-slate-200" />
                    <div v-else class="flex items-center gap-2 h-14 px-3 rounded-xl border border-slate-200 glass-card max-w-[200px]">
                      <i class="fa-solid fa-file-lines text-blue-500 text-base shrink-0"></i>
                      <span class="text-[12px] text-slate-700 truncate">{{ att.name }}</span>
                    </div>
                    <button @click="stage3Composer.removeAttachment(ai)" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700/90 hover:bg-danger text-white text-[9px] flex items-center justify-center shadow-sm">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                </div>
                <textarea
                  v-model="stage3Input"
                  rows="1"
                  :placeholder="isStreaming ? 'AI 正在响应中…' : '聊需求确认、智能体矩阵设计，Ctrl + Enter 发送'"
                  :disabled="isStreaming"
                  class="w-full resize-none text-[14px] text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none leading-6 px-5 pt-4 pb-1 max-h-[160px] scrollbar-hide disabled:opacity-60"
                  @keydown.ctrl.enter.prevent="sendStage3"
                  @keydown.meta.enter.prevent="sendStage3"
                ></textarea>
                <div class="flex items-center justify-between px-3 pb-3 pt-1.5 gap-2.5">
                  <div class="flex items-center gap-1.5">
                    <button @click="stage3Composer.pickImage" :disabled="isStreaming" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="上传图片">
                      <i class="fa-solid fa-image text-sm"></i>
                    </button>
                    <button @click="stage3Composer.pickFile" :disabled="isStreaming" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="上传文件">
                      <i class="fa-solid fa-paperclip text-sm"></i>
                    </button>
                    <button @click="stage3Composer.toggleRecording" :disabled="isStreaming || !stage3Composer.recordingSupported" class="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed" :class="stage3Composer.isRecording.value ? 'text-white bg-danger hover:bg-danger-deep' : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'" :title="stage3Composer.recordingSupported ? (stage3Composer.isRecording.value ? '停止录音' : '语音输入') : '当前环境不支持录音'">
                      <i class="fa-solid text-sm" :class="stage3Composer.isRecording.value ? 'fa-stop' : 'fa-microphone'"></i>
                    </button>
                    <span v-if="stage3Composer.isRecording.value" class="text-[11px] text-danger font-medium tabular-nums">{{ stage3Composer.recordSeconds.value }}s</span>
                    <span v-else-if="stage3Composer.isTranscribing.value" class="text-[11px] text-blue-500 font-medium">识别中…</span>
                  </div>
                  <div class="flex items-center gap-2.5">
                    <span class="text-[11px] text-slate-400 select-none">Ctrl + Enter 发送</span>
                    <button
                      v-if="isStreaming"
                      @click="cancelStream"
                      class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-sm"
                      title="停止生成"
                    >
                      <span class="w-3 h-3 rounded-[3px] glass-card"></span>
                    </button>
                    <button
                      v-else
                      @click="sendStage3"
                      :disabled="!stage3Input.trim() && stage3Composer.attachments.value.length === 0"
                      class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
                      :class="(stage3Input.trim() || stage3Composer.attachments.value.length) ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30 hover:shadow-lg active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed'"
                    >
                      <i class="fa-solid fa-arrow-up text-sm"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div><!-- end workbench shell -->
    </div><!-- end project content -->
  </div>

  <!-- 轻量提示 -->
  <transition name="fade">
    <div
      v-if="toast.show"
      class="fixed top-4 right-4 z-[9999] max-w-md px-3.5 py-2 rounded-lg shadow-lg text-sm border"
      :class="toast.type === 'success' ? 'glass-card border-emerald-300 text-emerald-700'
        : toast.type === 'error' ? 'glass-card border-red-300 text-red-700'
        : 'glass-card border-blue-200 text-blue-700'"
    >
      <i class="fa-solid mr-1.5" :class="toast.type === 'success' ? 'fa-circle-check'
        : toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'"></i>
      {{ toast.text }}
    </div>
  </transition>

  <div v-if="assessment" class="integrity-overlay" @click.self="assessment=null"><form class="integrity-dialog" @submit.prevent="saveAssessment"><h2>{{assessment.kind==='stage'?'阶段验收确认':'确认当前交付物版本'}}</h2><p>{{assessment.kind==='stage'?getStage(progressStage)?.successCriteria:selectedDeliverable?.name}}</p><label>确认人<input v-model="assessment.reviewer" required placeholder="客户或评审人的姓名"></label><label>确认依据<textarea v-model="assessment.evidence" required placeholder="会议日期、签字记录、验收结果或相关资料链接"></textarea></label><label v-for="(check,index) in assessment.checks" :key="index" class="integrity-check"><input type="checkbox" v-model="check.confirmed">{{check.title}}</label><p v-if="assessmentError" class="text-red-600">{{assessmentError}}</p><footer><button type="button" @click="assessment=null">取消</button><button :disabled="assessmentBusy||assessment.checks.some(c=>!c.confirmed)" class="primary">{{assessmentBusy?'保存中…':'记录确认'}}</button></footer></form></div>
  <div v-if="projectVersionsOpen" class="integrity-overlay" @click.self="projectVersionsOpen=false"><section class="integrity-dialog"><h2>交付物历史版本</h2><p>{{selectedDeliverable?.name}}</p><div v-for="version in projectVersions" :key="version.id" class="integrity-version"><span>{{new Date(version.createdAt).toLocaleString('zh-CN')}} · {{version.label}}</span><button @click="restoreProjectVersion(version)">恢复</button></div><p v-if="!projectVersions.length">尚无历史版本，下一次保存时会自动保留。</p><footer><button @click="projectVersionsOpen=false">关闭</button></footer></section></div>
  <ImageLightbox :src="lightboxSrc" :visible="lightboxVisible" @close="lightboxVisible = false" />
</template>

<script setup>
import { projectKnowledgeChat } from '../../composables/projectKnowledgeChat.js';
import { createProjectDiscussions } from '../../composables/projectDiscussions.js';
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { trackPrompt, getInflightPrompt } from '../../composables/promptInflight.js';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import { marked } from 'marked';
import { cleanAssistantContent } from '@/data/assistant-content';
import { deliverySkillContext, verifyPrototypeSkillOutputs } from '@/data/delivery-skills.mjs';
import { modelFailureMessage } from '@/data/model-failure.mjs';
import ThinkingSummary from '@/components/agent/ThinkingSummary.vue';
import { finalizeResponseSummary, publicToolStep, plainMessage } from '@/data/response-summary.mjs';
import StagePanel from '@/components/workbench/StagePanel.vue';
import ProjectKnowledgeSpace from '@/components/projects/ProjectKnowledgeSpace.vue';
import ProjectSpacePanel from '@/components/projects/ProjectSpacePanel.vue';
import ProjectFlowWorkspace from '@/components/projects/ProjectFlowWorkspace.vue';
import { listProjectKnowledge, projectKnowledgeContext } from '@/composables/projectKnowledge';
import ImageLightbox from '@/components/common/ImageLightbox.vue';
import AttachmentChip from '@/components/common/AttachmentChip.vue';
import ModelSelector from '@/components/agent/ModelSelector.vue';
import coachMascot from '@/assets/fde-coach-mascot.png';
import coachAvatar from '@/assets/fde-coach-avatar.png';
import { FDE_STAGES, getStage, DEFAULT_STAGE } from '@/data/fde-stages';
import { deliverablesForStage } from '@/data/project-deliverables';
import ProjectPrototypePackage from '@/components/projects/ProjectPrototypePackage.vue';
import {stage2GenerationContext,stage2KeyForJob,verifyStage2Files} from '@/data/stage2-contract.mjs';
import { useChatComposer } from '@/composables/useChatComposer';

const props = defineProps({
  slug: { type: String, required: true },
});

const route = useRoute();

// --- State ---
const linkedConversations = ref([]);
async function loadLinkedConversations() {
  const slug = props.slug;
  try {
    const conversations = await window.api.hermes.listProjects({ kind: 'all' });
    if (props.slug !== slug) return;
    linkedConversations.value = conversations.filter(conversation => conversation.parentProjectSlug === slug && !conversation.conversationDeletedAt && conversation.hasMessages !== false)
      .sort((a, b) => (b.lastMessageAt || b.updatedAt || '').localeCompare(a.lastMessageAt || a.updatedAt || ''));
  } catch (_) { linkedConversations.value = []; }
}
watch(() => props.slug, loadLinkedConversations);
const projectName = ref('');
const projectMeta = ref(null);
const activeTab = ref('workspace');
const knowledgeChat = projectKnowledgeChat(props.slug);
const knowledgeMessages = knowledgeChat.messages;
const knowledgeStreaming = knowledgeChat.busy;
const assistantReplyBusy = computed(() => currentStage.value === 1 ? knowledgeStreaming.value : isStreaming.value);
const cancelAssistantReply = () => currentStage.value === 1 ? knowledgeChat.cancel() : cancelStream();
const cancelKnowledge = () => knowledgeChat.cancel();
const researchDocument=ref(null),researchExcerpt=ref('');
function researchViewChanged(file){researchDocument.value=file;researchExcerpt.value='';if(file){assistantPanelTab.value='assistant';assistantConversationOpen.value=true;}}
function researchSelectionChanged({text,file}){if(file?.path!==researchDocument.value?.path)return;researchExcerpt.value=text;if(text){assistantPanelTab.value='assistant';assistantConversationOpen.value=true;}}

const projectMenuOpen = ref(false);
const projectOverviewStages = computed(() => FDE_STAGES.map(stage => ({id:stage.id,label:stageDisplayName(stage.id),documents:deliverablesForStage(stage.id)})));
async function openProjectSource(path) {
  if (typeof flushDocumentEdits === 'function' && !await flushDocumentEdits()) return;
  knowledgeSourcePath.value = path;
  activeTab.value = 'knowledge';
}


// FDE guided product workflow: document review and technical validation remain distinct.
const workflowRef = ref(null);
const workflowOpen = ref(true);
const workflowSnapshot = ref(null);
const workflowBusy = ref(false);
const workflowFile = ref(null);
function setWorkflowBusy(value) { workflowBusy.value = value; deliverableBusy.value = value; }
async function resumeWorkflow() {
  if (typeof flushDocumentEdits === 'function' && !await flushDocumentEdits()) return;
  projectMenuOpen.value = false;
  documentFullscreen.value = false;
  activeTab.value = 'workspace';
  assistantPanelTab.value = 'assistant';
  if (isStreaming.value || deliverableBusy.value) {
    assistantConversationOpen.value = true;
    showToast('生成仍在进行，已返回任务工作区','info');
    return;
  }
  if (currentStage.value !== progressStage.value) await viewStage(progressStage.value);
  workflowOpen.value = currentStage.value <= 3;
  workflowFile.value = null;
  if (workflowOpen.value) {
    deliverableSelected.value = '';
    discussionStore.useDefault();
    assistantPanelTab.value = 'assistant';
    assistantConversationOpen.value = true;
    await nextTick(); workflowRef.value?.resume();
  }
}
async function advanceWorkflowStage(id) {
  if (id <= progressStage.value) { await viewStage(progressStage.value); return; }
  if (id !== progressStage.value + 1 || id > 3 || !workflowRef.value?.canAdvance(progressStage.value)) throw new Error('请先核对本阶段的任务成果。');
  stageAdvancing.value = true;
  try { await selectStage(id); if(progressStage.value !== id) throw new Error('阶段保存失败，请重试。'); }
  finally { stageAdvancing.value = false; }
  workflowOpen.value = true; deliverableSelected.value = ''; assistantConversationOpen.value = true;
  await nextTick(); await workflowRef.value?.resume(true);
}
async function openWorkflowFile({file,stage,name}) {
  if (isStreaming.value || deliverableBusy.value) return;
  if (file.endsWith('.html')) {
    const result = await window.api.hermes.openInBrowser(props.slug,file);
    if (result?.success === false) showToast(result.error || '原型打开失败','error');
    return;
  }
  const d = deliverablesForStage(stage).find(item => item.file === file);
  workflowOpen.value = false;
  if (d) { workflowFile.value = null; selectDeliverable(d.key); return; }
  workflowFile.value = {key:`flow:${file}`,file,name:name || '流程成果',icon:'fa-regular fa-file-lines'};
  deliverableSelected.value = workflowFile.value.key;
  assistantConversationOpen.value = false;
  await showPreview(stage,workflowFile.value);
}
async function runWorkflowJob({stage,task,job,prompt}) {
  if (isStreaming.value) throw new Error('上一轮对话尚未结束，请稍后再试。');
  let skillContent = '';
  if (job.skill && stage !== 2) skillContent = await deliverySkillContext(window.api,job.skill,{prototype:job.skill==='fde-prototype-final'});
  const stage2Key = stage === 2 ? stage2KeyForJob(job) : '';
  if (stage2Key) skillContent += await stage2GenerationContext(window.api,stage2Key);
  deliverableSelected.value = ''; workflowFile.value = null;
  discussionStore.useDefault();
  assistantPanelTab.value = 'assistant'; assistantConversationOpen.value = true;
  const tab=`stage:${stage}`, key=dkey(stage,'__stage__');
  const arr=deliverableMsgs.value[key] ||= [];
  arr.push(createMessage('user',`${task.title} · ${job.title}`));
  const streamId=beginStream(arr,tab);
  arr.push(createMessage('assistant','',{thinkingSteps:[{text:job.title,icon:'fa-solid fa-wand-magic-sparkles',visible:true}],thinkingDone:false,expanded:true,typingContent:'',timestamp:'',streamId}));
  try {
    await window.api.hermes.saveMessage(props.slug,{role:'user',content:`${task.title} · ${job.title}`,tab,timestamp:new Date().toISOString()});
    const p=projectPrompt(prompt+skillContent);
    trackPrompt(props.slug,{tab},p);
    const result=await p;
    if(result?.success === false || result?.stopReason === 'cancelled') throw new Error(result?.error || '生成已停止，已完成文件会保留。');
    if(stage2Key) await verifyStage2Files(window.api,props.slug,stage2Key);
    if(job.skill==='fde-prototype-final') await verifyPrototypeSkillOutputs(window.api,props.slug,'stage3/prototype');
    endStream();
    await loadDeliverablesForStage(stage); await refreshPrototypeFiles();
  } catch(e) { endStream(); throw e; }
}

const documentMenuOpen=ref(false);
const formatProjectDate = (value, withTime = false) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
};

// 图片放大预览（三个对话 tab 共用）
const lightboxSrc = ref('');
const lightboxVisible = ref(false);
const openLightbox = (src) => {
  lightboxSrc.value = src;
  lightboxVisible.value = true;
};
const handleContentImgClick = (e) => {
  const dlBtn = e.target.closest('.chat-file-download');
  if (dlBtn) {
    e.stopPropagation();
    const fp = dlBtn.dataset.filepath;
    if (fp) window.api.fs.saveLocalFile(fp);
    return;
  }
  const openBtn = e.target.closest('.chat-file-open');
  if (openBtn) {
    e.stopPropagation();
    const fp = openBtn.dataset.filepath;
    if (fp) window.api.shell.openPath(fp);
    return;
  }
  const card = e.target.closest('.chat-delivery-card');
  if (card) {
    const fp = card.dataset.filepath;
    if (fp) window.api.shell.openPath(fp);
    return;
  }
  const img = e.target.closest('img.chat-inline-img');
  if (img) openLightbox(img.src);
};

// --- FDE 五阶段工作台状态 ---
const WORKSPACE_STAGES = [2, 3]; // 文档阶段共用阅读器，其余阶段在同一阅读区展示阶段说明
const currentStage = ref(DEFAULT_STAGE);
const progressStage = ref(DEFAULT_STAGE); // 项目真实进度；currentStage 仅表示正在查看的阶段
const stageStatus = ref({ 1: 'active', 2: 'todo', 3: 'todo', 4: 'todo', 5: 'todo' });
const stageAdvancing = ref(false);
const activeStageObj = computed(() => getStage(currentStage.value));
const isWorkspaceStage = computed(() => WORKSPACE_STAGES.includes(currentStage.value));
const stageDisplayName = (id) => ({ 1: '调研准备', 2: '需求沟通', 3: '需求确认', 4: '工作台上线', 5: '客户试用' })[id] || getStage(id)?.label || '';

async function continueProject() {
  if (progressStage.value <= 3) return resumeWorkflow();
  if(!await flushDocumentEdits())return;
  activeTab.value = 'workspace';
  if (currentStage.value !== progressStage.value) await viewStage(progressStage.value);
  else nextTick(() => document.querySelector('.assistant-pane textarea')?.focus());
}

async function viewStage(id, key = '') {
  if (!Number.isInteger(id) || id < 1 || id > progressStage.value || isStreaming.value || deliverableBusy.value) return;
  if(!await flushDocumentEdits())return;
  workflowOpen.value = id <= 3 && !key; workflowFile.value = null;
  if(workflowOpen.value) { deliverableSelected.value=''; assistantConversationOpen.value=true; }
  expandStageDirectory(id);
  if (id === currentStage.value && !key && activeTab.value === 'workspace') return;
  currentStage.value = id;
  activeTab.value = 'workspace';
  assistantPanelTab.value = 'assistant';
  assistantConversationOpen.value = false;
  const d = deliverablesForStage(id).find((entry) => entry.key === key) || deliverablesForStage(id)[0];
  deliverableSelected.value = workflowOpen.value ? '' : (d?.key || '');
  previewLoadSeq++;
  previewEditing.value = false;
  livePreviewContent.value = '';
  livePreviewDocxHtml.value = '';
  livePreviewTitle.value = '';
  livePreviewFile.value = '';
  if (d) {
    await loadDeliverablesForStage(id);
  }
}

// 左栏搜索只过滤当前阶段；历史资料另开只读窗口。
const docSearch = ref('');
const expandedStageIds = ref(new Set([DEFAULT_STAGE]));
function expandStageDirectory(stageId) {
  if (expandedStageIds.value.has(stageId)) return;
  expandedStageIds.value = new Set([...expandedStageIds.value, stageId]);
}
watch(currentStage, expandStageDirectory, { immediate: true });
const assistantPanelTab = ref('assistant');
const assistantConversationOpen = ref(false);
const assistantToolsOpen = ref(false);
const assistantPanelTabs = [
  { key: 'assistant', label: 'AI 助手' },
  { key: 'resources', label: '相关资料' },
  { key: 'discussion', label: '讨论记录' },
];
const readableDiscussion = (value) => String(value || '')
  .replace(/```[\s\S]*?```/g, ' [代码片段] ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [图片] ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_`|\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const discussionThreads = computed(() => {
  const threads = [];
  activeDlvMsgs.value.forEach((msg, index) => {
    const content = readableDiscussion(msg.content);
    if (msg.role === 'user') {
      threads.push({ index, question: content || '附件或图片提问', answer: '', time: msg.timestamp || '' });
    } else if (msg.role === 'assistant') {
      if (!threads.length) threads.push({ index, question: content.slice(0, 42) || 'FDE 助手回复', answer: '', time: msg.timestamp || '' });
      else threads[threads.length - 1].answer = content || '正在回复…';
    }
  });
  return threads.reverse();
});
const discussionCount = computed(() => discussionStore.histories.value.reduce((sum, window) => sum + window.count, 0));
const readyDeliverableCount = computed(() => activeDeliverables.value.filter((d) => deliverableStatus.value[d.key] === 'ready').length);
const assistantQuickActions = computed(() => {
  const stageActions = {
    1: [{ label:'整理行业与客户背景', prompt:'帮我整理本项目的行业背景、客户资料和需要进一步调研的问题。', icon:'fa-solid fa-book' }, { label:'准备需求沟通提纲', prompt:'结合项目背景，准备一份需求沟通提纲和关键追问。', icon:'fa-solid fa-comments' }, { label:'梳理调研准备清单', prompt:'梳理本项目进场前的调研准备清单和需要收集的资料。', icon:'fa-solid fa-list-check' }, { label:'准备关键追问与话术', prompt:'针对本项目准备破冰话术和业务痛点的关键追问。', icon:'fa-solid fa-comment-dots' }],
    4: [{ label:'梳理部署与上线计划', prompt:'结合已有需求、实施计划和智能体设计，梳理工作台部署与上线计划。', icon:'fa-solid fa-server' }, { label:'检查数据与系统对接', prompt:'检查本项目上线所需的数据、系统接口与环境准备，列出待确认事项。', icon:'fa-solid fa-diagram-project' }, { label:'检查上线风险', prompt:'检查本项目部署上线的关键风险，给出处理建议。', icon:'fa-solid fa-shield-halved' }, { label:'整理上线验收清单', prompt:'结合已有方案，整理系统上线前的验收检查清单。', icon:'fa-solid fa-clipboard-check' }],
    5: [{ label:'整理客户试用反馈', prompt:'帮我整理客户试用反馈，并按影响和优先级提出处理建议。', icon:'fa-solid fa-comment-dots' }, { label:'检查交付与验收准备', prompt:'结合本项目资料，检查交付与验收准备情况，列出还需确认的事项。', icon:'fa-solid fa-clipboard-check' }, { label:'安排迭代优先级', prompt:'结合现有试用反馈和项目资料，梳理下一轮迭代的优先级。', icon:'fa-solid fa-list-check' }, { label:'准备客户交付汇报', prompt:'结合本项目资料，准备一份客户交付汇报提纲。', icon:'fa-solid fa-file-powerpoint' }],
  };
  if (stageActions[currentStage.value]) return stageActions[currentStage.value];
  const name = selectedDeliverable.value?.name || '当前文档';
  return [
    {label:'检查当前交付物',prompt:`请检查《${name}》与已有项目资料的一致性，列出需要修改或确认的地方。`,icon:'fa-solid fa-clipboard-check'},
    {label:'梳理待确认问题',prompt:`结合《${name}》和项目资料，整理还需向客户确认的问题，不要编造缺失信息。`,icon:'fa-solid fa-comments'},
    {label:'总结当前交付物',prompt:`请基于《${name}》的实际正文，总结关键结论、范围和风险。没有正文时先说明，不得编造。`,icon:'fa-solid fa-file-lines'},
    {label:'准备评审要点',prompt:`结合《${name}》和本项目资料，整理评审要点、待确认事项和需要补齐的证据。`,icon:'fa-solid fa-list-check'},
  ];
});
function jumpToMessage(index) {
  assistantConversationOpen.value = true;
  nextTick(() => {
    const target = chatContainerRef.value?.querySelector(`[data-msg-index="${index}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
const filteredStageDeliverables = (stageId) => {
  const list = deliverablesForStage(stageId);
  const q = docSearch.value.trim().toLowerCase();
  return q ? list.filter((d) => `${d.name} ${d.short || ''}`.toLowerCase().includes(q)) : list;
};
function handleStageTreeClick(stageId) {
  if (stageId > progressStage.value) return;
  const next = new Set(expandedStageIds.value);
  if (next.has(stageId)) next.delete(stageId);
  else next.add(stageId);
  expandedStageIds.value = next;
}
async function openDiscussion() {
  activeTab.value = 'workspace';
  assistantPanelTab.value = 'discussion';
}
// composer 模型选择器：与「AI 智能对话」同源（hermes.listModels / setModel）
const availableModels = ref([]);
const currentModel = ref('');

// 加载可选模型列表 + 回填当前模型
const loadModels = async (retries = 5) => {
  try {
    const res = await window.api?.hermes?.listModels?.();
    const list = (res && res.models) || [];
    if (list.length > 0) availableModels.value = list;
    if (res?.current && !currentModel.value) currentModel.value = res.current;
    if (list.length === 0 && retries > 0) {
      setTimeout(() => loadModels(retries - 1), 1200);
    }
  } catch (e) {
    console.error('List models failed:', e);
  }
  // 兜底：config.yaml 持久化真值
  if (!currentModel.value) {
    try {
      const cfg = await window.api?.hermes?.readConfigModel?.();
      if (cfg?.model) currentModel.value = cfg.model;
    } catch (_) { /* ignore */ }
  }
};

// 切模型：乐观更新 + 对当前项目会话生效（引擎可能重启，重启后重载项目）
const handleChangeModel = async (modelId) => {
  currentModel.value = modelId;
  try {
    const result = await window.api.hermes.setModel(props.slug, modelId);
    if (result?.restarted) {
      try { await window.api.hermes.loadProject(props.slug); } catch (_) { /* 下次发消息会自动重建 */ }
    }
  } catch (e) {
    console.error('Set model failed:', e);
    // 持久化兜底（无活动会话时）
    try { await window.api?.hermes?.setConfigModel?.(modelId); } catch (_) { /* ignore */ }
  }
};


// 复制结果卡内容到剪贴板
async function copyMessage(text) {
  try {
    await navigator.clipboard.writeText(text || '');
    showToast('已复制内容', 'success');
  } catch (_) {
    showToast('复制失败', 'error');
  }
}


const assessment=ref(null),assessmentBusy=ref(false),assessmentError=ref(''),projectVersionsOpen=ref(false),projectVersions=ref([]),reviewToken=ref('');let reviewSeq=0;

const currentReviewState=computed(()=>{const record=projectMeta.value?.deliverableReviews?.[selectedDeliverable.value?.file];return record&&record.token===reviewToken.value?record.state:'draft';});
async function storeMeta(updates){const result=await window.api.hermes.updateProjectMeta(props.slug,updates);if(!result?.success)throw Error(result?.error||'保存失败');projectMeta.value=result.meta;return result.meta;}
async function sendForReview(){if(!await flushDocumentEdits())return;const d=selectedDeliverable.value;if(!d)return;try{const source=await window.api.hermes.readFile(props.slug,d.file);if(!source.success||!source.content.trim())throw Error('先完成正文再送审');await storeMeta({deliverableReviews:{...projectMeta.value?.deliverableReviews,[d.file]:{state:'review',token:source.token,updatedAt:new Date().toISOString()}}});}catch(e){showToast(e.message,'error');}}
async function openAssessment(kind){if(!await flushDocumentEdits())return;assessmentError.value='';const stage=getStage(progressStage.value);assessment.value={kind,reviewer:'',evidence:'',checks:kind==='stage'?[...(stage.deliverables||[]).map(d=>({title:d.name,confirmed:false})),{title:stage.successCriteria,confirmed:false}]:[{title:'已阅读当前版本，确认内容和验收口径',confirmed:false}]};}
async function saveAssessment(){if(!assessment.value||assessmentBusy.value)return;assessmentBusy.value=true;assessmentError.value='';try{const record={...assessment.value,state:'confirmed',updatedAt:new Date().toISOString()};if(record.kind==='document'){const d=selectedDeliverable.value,source=await window.api.hermes.readFile(props.slug,d.file);if(!source.success||!source.content.trim())throw Error('先完成正文再确认');record.token=source.token;await storeMeta({deliverableReviews:{...projectMeta.value?.deliverableReviews,[d.file]:record}});}else{await storeMeta({stageReviews:{...projectMeta.value?.stageReviews,[progressStage.value]:record}});}assessment.value=null;showToast('确认已记录，正文修改后需重新确认','success');}catch(e){assessmentError.value=e.message;}finally{assessmentBusy.value=false;}}
async function completeProject(){if(!await flushDocumentEdits())return;try{const next={...stageStatus.value,5:'done'};await storeMeta({stageStatus:next});stageStatus.value=next;projectMenuOpen.value=false;showToast('项目已验收完成','success');}catch(e){showToast(e.message,'error');}}
async function openProjectVersions(){if(!await flushDocumentEdits())return;const d=selectedDeliverable.value;if(!d)return;const result=await window.api.hermes.fileHistory(props.slug,d.file);if(!result.success){showToast(result.error,'error');return;}projectVersions.value=result.versions;projectVersionsOpen.value=true;}
async function restoreProjectVersion(version){const d=selectedDeliverable.value;if(!d||!window.confirm('恢复此版本？当前版本会保留在历史中。'))return;const source=await window.api.hermes.readFile(props.slug,d.file);const result=await window.api.hermes.restoreFileVersion(props.slug,d.file,version.id,source.token);if(!result.success){showToast(result.error,'error');return;}projectVersionsOpen.value=false;await loadDeliverablesForStage(currentStage.value);await autoSaveDocx(currentStage.value,d.key);}
async function backupProject(){if(!await flushDocumentEdits())return;const result=await window.api.hermes.backupProject(props.slug);if(!result.success)showToast(result.error,'error');else if(!result.canceled)showToast('项目、原始资料和历史版本已备份','success');}
async function restoreProject(){if(!await flushDocumentEdits()||isStreaming.value||deliverableBusy.value)return;const result=await window.api.hermes.restoreProject(props.slug);if(!result.success)showToast(result.error,'error');else if(!result.canceled)window.location.reload();}

async function advanceStage() {
  if(progressStage.value <= 3) return resumeWorkflow();
  if(!await flushDocumentEdits())return;
  if (stageAdvancing.value || isStreaming.value || deliverableBusy.value || progressStage.value >= FDE_STAGES.length) return;
  stageAdvancing.value = true;
  try {
    await selectStage(progressStage.value + 1);
  } finally {
    stageAdvancing.value = false;
  }
}

async function selectStage(id) {
  // 查看已完成阶段不改变项目进度；只有显式推进操作会写回 meta。
  if (!stageAdvancing.value || id !== progressStage.value + 1 || id > FDE_STAGES.length) return;
  const next = {};
  for (let i = 1; i <= FDE_STAGES.length; i++) {
    next[i] = i < id ? 'done' : i === id ? 'active' : 'todo';
  }
  // 先保存，再更新屏幕；保存失败时不会出现重开项目后阶段回退。
  try {
    const result = await window.api.hermes.updateProjectMeta(props.slug, { stage: id, stageStatus: next, ...(id <= 3 ? {workflowMode:'product-flow-v1'} : {}) });
    if (!result?.success || !result.meta) throw new Error(result?.error || '项目阶段保存失败');
  } catch (e) {
    console.error('[ProjectDetail] stage update failed:', e);
    showToast(e?.message || '项目阶段保存失败，请重试', 'error');
    return;
  }
  progressStage.value = id;
  projectMeta.value = { ...(projectMeta.value || {}), stage: id, stageStatus: next };
  currentStage.value = id;
  // 切阶段时重置到该阶段第一个 tab
  const firstTab = tabsForStage(id)[0];
  if (firstTab) activeTab.value = firstTab.key;
  // 交付物：选中该阶段第一件，并加载该阶段已生成的交付物
  const firstDeliv = deliverablesForStage(id)[0];
  deliverableSelected.value = firstDeliv?.key || '';
  // 清掉上一阶段的预览内容，再读新阶段（loadDeliverablesForStage 会刷新右侧）
  livePreviewContent.value = '';
  livePreviewDocxHtml.value = '';
  livePreviewTitle.value = '';
  livePreviewFile.value = '';
  previewEditing.value = false;
  // 读盘失败不能挡住切阶段：否则高亮和持久化都停在旧阶段，界面看着像「点了没反应」
  try {
    await loadDeliverablesForStage(id);
  } catch (e) {
    console.error('[ProjectDetail] loadDeliverablesForStage failed:', e);
  }
  stageStatus.value = next;
}


// --- Panel toggle state ---
const showSessionPanel = ref(true);
const showLogsPanel = ref(true);

// --- Agent logs state ---
const agentLogs = ref([]);
const logsContainerRef = ref(null);
const iterateLogsContainerRef = ref(null);
let logIdCounter = 0;

const addLog = (type, content, status) => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  agentLogs.value.push({ id: ++logIdCounter, time, type, content, status });
  // Keep max 200 entries
  if (agentLogs.value.length > 200) {
    agentLogs.value = agentLogs.value.slice(-150);
  }
  // Auto scroll logs
  nextTick(() => {
    if (logsContainerRef.value) {
      logsContainerRef.value.scrollTop = logsContainerRef.value.scrollHeight;
    }
    if (iterateLogsContainerRef.value) {
      iterateLogsContainerRef.value.scrollTop = iterateLogsContainerRef.value.scrollHeight;
    }
  });
};

// --- Thought buffer for agent logs ---
let thoughtBuffer = '';
let thoughtFlushTimer = null;

const flushThoughtBuffer = () => {
  if (thoughtBuffer.trim()) {
    // Truncate to 150 chars for display
    const display = thoughtBuffer.length > 150 ? thoughtBuffer.slice(0, 147) + '...' : thoughtBuffer;
    addLog('thought', display);
    thoughtBuffer = '';
  }
  thoughtFlushTimer = null;
};

// tab 集按阶段计算：阶段②③ 统一为 工作台（对话+交付物预览）| 原型
const STAGE2_TABS = [
  { key: 'workspace', label: '工作台', icon: 'fa-solid fa-table-columns' },
  { key: 'prototype', label: '原型', icon: 'fa-solid fa-window-maximize' },
];
const STAGE3_TABS = [
  { key: 'workspace', label: '工作台', icon: 'fa-solid fa-table-columns' },
  { key: 'prototype', label: '定稿原型', icon: 'fa-solid fa-window-maximize' },
];
function tabsForStage(id) {
  return id === 3 ? STAGE3_TABS : STAGE2_TABS;
}
// 顶部不再有横向 Tab：这三个入口作为「当前阶段」下的二级侧边导航
const tabs = computed(() => tabsForStage(currentStage.value));

// 侧边导航切换
async function switchNav(key) {
  if(!await flushDocumentEdits())return;
  documentFullscreen.value = false;
  projectMenuOpen.value = false;
  if (key === 'knowledge') knowledgeSourcePath.value = '';
  activeTab.value = key;
  if (key === 'prototype') await refreshPrototypeFiles();
}

// 左侧可回看已完成阶段；点击交付物直接在中间打开。
function selectGroupDeliverable(stageId, key) {
  if (stageId !== currentStage.value) return viewStage(stageId, key);
  activeTab.value = 'workspace';
  selectDeliverable(key);
}

// 分组树里的生成状态：只对已读过的阶段显示，没读过的显示未生成灰点
function deliverableState(stageId, key) {
  if(stageId===2 && key==='prototype-demo')return prototypePackageReady.value?'ready':'empty';
  return deliverableContents.value[dkey(stageId, key)] ? 'ready' : 'empty';
}

// 当前阶段活动的对话消息数组（workspace tab 按 currentStage 区分）
const currentMessages = computed(() => {
  if (activeTab.value === 'iterate' || streamTargetTab.value === 'iterate') return iterateMessages;
  return currentStage.value === 3 ? stage3Messages : messages;
});

// 按当前 tab 取对应的消息数组（.value）——统一入口，供流式渲染/追加使用
const streamTargetTab = ref('');
// 本轮回复锁定的写入目标 { arr, tab }：生成途中切交付物 / 切 tab 都不会串台
let lockedStream = null;
function activeMessagesArr() {
  if (lockedStream) return lockedStream.arr;
  const t = streamTargetTab.value || activeTab.value;
  if (t === 'iterate') return iterateMessages.value;
  if (t === 'prototype-gen') return prototypeGenMessages.value;
  if (t === 'chat3') return stage3Messages.value;
  if (t === 'workspace' || t.startsWith('deliverable')) {
    if (!deliverableBusyKey.value && discussionStore.activeMessages.value) return discussionStore.activeMessages.value;
    // 正在生成时锁定到生成目标；否则才跟随界面选中项。
    // 否则用户在生成途中切换交付物，剩余 chunk 会串进新选中的那条对话。
    const target = deliverableBusyKey.value || assistantThreadKey.value;
    const k = dkey(currentStage.value, target);
    if (!deliverableMsgs.value[k]) deliverableMsgs.value[k] = [];
    return deliverableMsgs.value[k];
  }
  return messages.value;
}
// 当前 tab 对应的持久化 tab 名
function activeTabName() {
  if (lockedStream) return lockedStream.tab;
  const t = streamTargetTab.value || activeTab.value;
  if (t === 'iterate') return 'iterate';
  if (t === 'prototype-gen') return 'prototype-gen';
  if (t === 'workspace' || t.startsWith('deliverable')) return deliverableSelected.value ? `deliverable:${deliverableBusyKey.value || deliverableSelected.value}` : `stage:${currentStage.value}`;
  if (t === 'chat3') return 'chat3';
  return 'requirement';
}

// 由持久化 tab 名反查该轮应写入的消息数组（重进页面时恢复锁用）
function lockFromTab(tab) {
  const discussionMatch = /^discussion:([1-5]):([^:]+):([^:]+)$/.exec(String(tab));
  if (discussionMatch) {
    const key = `${discussionMatch[1]}:${discussionMatch[2]}::${discussionMatch[3]}`;
    return { arr: deliverableMsgs.value[key] ||= [], tab };
  }
  if (tab === 'knowledge') return { arr: knowledgeMessages.value, tab };
  const stageMatch = /^stage:([1-5])$/.exec(String(tab));
  if (stageMatch) {
    const k = dkey(Number(stageMatch[1]), '__stage__');
    if (!deliverableMsgs.value[k]) deliverableMsgs.value[k] = [];
    return { arr: deliverableMsgs.value[k], tab };
  }
  if (String(tab).startsWith('deliverable:')) {
    const key = String(tab).slice('deliverable:'.length);
    const k = dkey(currentStage.value, key);
    if (!deliverableMsgs.value[k]) deliverableMsgs.value[k] = [];
    return { arr: deliverableMsgs.value[k], tab };
  }
  if (tab === 'iterate') return { arr: iterateMessages.value, tab };
  if (tab === 'chat3') return { arr: stage3Messages.value, tab };
  return { arr: messages.value, tab };
}

// 一轮回复开始：锁死写入目标。之后切交付物 / 切 tab 都不会把剩余 chunk 串到别处。
function beginStream(arr, tab) {
  lockedStream = { arr, tab, stageId: currentStage.value };
  isStreaming.value = true;
  isToolRunning.value = false;
  currentStreamId = Date.now().toString();
  return currentStreamId;
}

// 一轮回复收尾。幂等：引擎事件和 await 返回都会调，只有第一次真正生效，
// 否则 finalizeLastAssistantMessage 会重复落盘同一条回答。
function endStream() {
  if (!isStreaming.value && !lockedStream) return;
  if (streamEndTimer) { clearTimeout(streamEndTimer); streamEndTimer = null; }
  try {
    flushTypewriterQueue();
    finalizeLastAssistantMessage(); // Finalize while the response still owns its target.
  } finally {
    lockedStream = null;
    isStreaming.value = false;
    isToolRunning.value = false;
  }
}

// 离开项目页时上一轮还没结束：重进后锁回它原来的对话，保持「生成中」直到引擎真正返回
function resumeInflight(inflight) {
  const tab = String(inflight.tab || '');
  if (tab === 'knowledge') activeTab.value = 'knowledge';
  const stageMatch = /^stage:([1-5])$/.exec(tab);
  if (stageMatch) {
    currentStage.value = Number(stageMatch[1]);
    activeTab.value = 'workspace';
    deliverableSelected.value = '';
    assistantConversationOpen.value = true;
  }
  const dlvKey = tab.startsWith('deliverable:') ? tab.slice('deliverable:'.length) : '';
  if (dlvKey) {
    deliverableBusy.value = true;
    deliverableBusyKey.value = dlvKey;
    selectDeliverable(dlvKey);
  }
  if (tab === 'iterate') streamTargetTab.value = 'iterate';
  const lock = lockFromTab(tab);
  const streamId = beginStream(lock.arr, lock.tab);
  lock.arr.push(createMessage('assistant', '', {
    thinkingSteps: [{ text: 'AI 仍在处理上一轮请求…', icon: 'fa-solid fa-hourglass-half', visible: true }],
    thinkingDone: false, expanded: true, typingContent: '', timestamp: '', streamId,
  }));
  inflight.done.then(async () => {
    endStream();
    if (dlvKey) {
      deliverableBusy.value = false;
      deliverableBusyKey.value = '';
      await finishLivePreview(currentStage.value);
    }
    if (tab === 'iterate') { iframeKey.value++; streamTargetTab.value = ''; }
    refreshPrototypeFiles();
    loadSpec();
  });
}
// 生成 PRD / 功能清单时自动配图的指令片段。
// {mdDir} 会被替换为该交付物 md 文件所在目录（根目录交付物为空串）。
// 图必须写到「与 md 同级的 assets/ 目录」，并在正文用相对路径 ![](assets/xxx.svg) 引用，
// 这样展示端 inlineRelativeImages 才能按 md 所在目录解析并内联渲染。
const diagramInstruction = (mdDir) => {
  const assetsAbs = mdDir ? `${mdDir}assets/` : 'assets/';
  return `

【自动配图（重要）】在写文档正文前，先根据需求上下文生成 3 类图并存为 SVG，供页面直接展示：
1) 架构图（系统分层/模块关系）→ 文件 \`${assetsAbs}architecture.svg\`
2) 业务流程图（用户操作流程/关键判断分支）→ 文件 \`${assetsAbs}flow.svg\`
3) 智能体能力图（AI/agent 推理、工具、知识库分布）→ 文件 \`${assetsAbs}agent-capability.svg\`

生成方式（优先复用绘图脚本，不可用则退化）：
- 优先：\`python3 ~/.claude/skills/fireworks-tech-graph/scripts/generate-from-template.py architecture 项目绝对路径/${assetsAbs}architecture.svg '{"title":"系统架构","nodes":[...],"arrows":[...]}'\`（flowchart / agent 类型同理，见该脚本用法）。
- 退化：脚本不存在时，直接用 python 写出合法 SVG 文本，再用 \`rsvg-convert 文件.svg -o /tmp/_diagcheck.png\` 校验语法（无 rsvg-convert 则跳过校验，SVG 仍可展示）。
- 每张图先 \`mkdir -p 项目绝对路径/${assetsAbs}\` 确保目录存在。

在文档正文对应章节用【相对路径】插入图片（不要写绝对路径、不要 data URI，展示端会自动内联）：
- 「产品架构总览」章节：\`![架构图](assets/architecture.svg)\`
- 核心业务流程 / 交互流程章节：\`![业务流程图](assets/flow.svg)\`
- AI 能力分布 / 智能体章节：\`![智能体能力图](assets/agent-capability.svg)\`
若某类图与本产品无关可省略对应一张，但架构图与流程图应尽量都有。`;
};

// 需要自动配图的交付物 key（PRD + 功能清单）
const DIAGRAM_KEYS = ['feature-spec', 'prd2', 'prd'];

// Chat state - enhanced message structure
const messages = ref([]);
const chatInput = ref('');
const isStreaming = ref(false);
const isToolRunning = ref(false);
const messagesLoading = ref(true);
const toolLabel = ref('正在处理...');
const chatContainerRef = ref(null);
let currentStreamId = null;

// Spec state
const specContent = ref('');
const specLoading = ref(false);
const specEditing = ref(false);

// Prototype state
const prototypeFiles = ref([]);
const stagePrototypeFiles = ref([]);
const prototypeLoadError = ref('');
async function openStagePrototype(file) {
  try { const result=await window.api.hermes.openInBrowser(props.slug,file.path); if(result?.success===false)throw Error(result.error); }
  catch(error) { showToast(error.message || '原型打开失败','error'); }
}
async function refreshStagePrototypes() {
  prototypeLoadError.value='';
  try {const groups=await Promise.all(['stage2/prototype','stage3/prototype'].map(async dir=>{const result=await window.api.hermes.listFiles(props.slug,dir,true);if(!result?.success)throw Error(result?.error||'阶段原型读取失败');return(result.files||[]).filter(file=>!file.isDirectory&&/\.html?$/i.test(file.name)).map(file=>({name:file.name,path:`${dir}/${file.relPath||file.name}`,stage:dir.startsWith('stage2')?2:3}));}));stagePrototypeFiles.value=groups.flat();}catch(error){stagePrototypeFiles.value=[];prototypeLoadError.value=error.message;}
}

const selectedFile = ref('');
// 折叠的文件夹路径集合（默认全部展开）
const collapsedDirs = ref(new Set());
function toggleDir(dirPath) {
  const s = new Set(collapsedDirs.value);
  if (s.has(dirPath)) s.delete(dirPath); else s.add(dirPath);
  collapsedDirs.value = s;
}
// 由扁平文件列表构建嵌套树，再按折叠状态摊平成「可见行」供 v-for 渲染
const fileTreeRows = computed(() => {
  const root = { dirs: new Map(), files: [] };
  for (const f of prototypeFiles.value) {
    const rel = f.rel || f.name;
    const parts = rel.split('/');
    let node = root;
    // 逐级建目录
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.dirs.has(seg)) node.dirs.set(seg, { name: seg, dirs: new Map(), files: [] });
      node = node.dirs.get(seg);
    }
    node.files.push({ ...f, rel, base: parts[parts.length - 1] });
  }
  const rows = [];
  const walk = (node, prefix, depth) => {
    // 目录在前，按名排序
    const dirNames = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b));
    for (const name of dirNames) {
      const dirPath = prefix ? `${prefix}/${name}` : name;
      const collapsed = collapsedDirs.value.has(dirPath);
      rows.push({ type: 'dir', name, path: dirPath, depth, collapsed });
      if (!collapsed) walk(node.dirs.get(name), dirPath, depth + 1);
    }
    // 文件按名排序
    for (const file of node.files.slice().sort((a, b) => a.base.localeCompare(b.base))) {
      rows.push({ type: 'file', ...file, depth });
    }
  };
  walk(root, '', 0);
  return rows;
});

// 轻量提示（导出 / 发布本地服务的成功或失败反馈）
const toast = ref({ show: false, type: 'info', text: '' });
let toastTimer = null;
function showToast(text, type = 'info') {
  toast.value = { show: true, type, text };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value.show = false; }, 3200);
}
const iframeKey = ref(0);
const iframeSrc = ref('');
// 非 HTML 文件的源码预览
const fileSource = ref('');
const isHtmlSelected = ref(true);
// 原型预览缩放（仅缩放 iframe 视觉，不改原型文件）
const previewZoom = ref(0.75);
function setZoom(z) {
  previewZoom.value = Math.min(1.5, Math.max(0.5, Math.round(z * 100) / 100));
}
function zoomStep(delta) { setZoom(previewZoom.value + delta); }

// 按扩展名给文件树选图标 / 颜色
function fileIcon(rel) {
  const n = (rel || '').toLowerCase();
  if (/\.html?$/.test(n)) return { icon: 'fa-solid fa-file-code', color: 'text-amber-600' };
  if (/\.jsx?$|\.mjs$/.test(n)) return { icon: 'fa-brands fa-js', color: 'text-yellow-500' };
  if (/\.css$/.test(n)) return { icon: 'fa-brands fa-css3-alt', color: 'text-sky-500' };
  if (/\.json$/.test(n)) return { icon: 'fa-solid fa-database', color: 'text-emerald-500' };
  if (/\.(png|jpe?g|gif|svg|webp)$/.test(n)) return { icon: 'fa-solid fa-image', color: 'text-indigo-500' };
  if (/\.md$/.test(n)) return { icon: 'fa-solid fa-file-lines', color: 'text-slate-500' };
  return { icon: 'fa-solid fa-file', color: 'text-slate-400' };
}
// 文件树展示名：子目录文件带上父目录前缀，避免同名混淆
function fileLabel(f) {
  return f.rel || f.name;
}

// Iterate state
const iterateMessages = ref([]);
const iterateInput = ref('');
const iterateChatRef = ref(null);

// 原型「生成 / 重新生成」的流式消息（就地显示在原型页，不进对话 tab）
const prototypeGenMessages = ref([]);

// --- 阶段③ state ---
const stage3Messages = ref([]);
const stage3Input = ref('');
const stage3ChatRef = ref(null);

// 三个对话 tab 各自的多模态输入器（图片 / 文件 / 语音）。
// 语音识别文本回填到对应 tab 的输入框；发送时把 attachments 传入 hermes.prompt。
const reqComposer = useChatComposer({
  onTranscribe: (t) => { chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + t; },
  getSlug: () => props.slug,
});
const iterateComposer = useChatComposer({
  onTranscribe: (t) => { iterateInput.value = (iterateInput.value ? iterateInput.value + ' ' : '') + t; },
  getSlug: () => props.slug,
});
const stage3Composer = useChatComposer({
  onTranscribe: (t) => { stage3Input.value = (stage3Input.value ? stage3Input.value + ' ' : '') + t; },
  getSlug: () => props.slug,
});

// —— 通用交付物状态（阶段②③共用，按 currentStage 键控）——
const prototypePackageReady = ref(false);
const deliverableSelected = ref('');          // 当前选中的交付物 key
const deliverableContents = ref({});          // { 'stage:key': markdown } —— 原文，供编辑/导出/保存
const deliverablePreviews = ref({});           // { 'stage:key': markdown } —— 相对图片已内联为 data URI，供预览
const deliverableEditing = ref(false);
const deliverableBusy = ref(false);
const deliverableBusyKey = ref('');   // 正在生成的交付物 key（只让它转圈）

// 当前阶段交付物清单 + 选中项 + 状态
const activeDeliverables = computed(() => deliverablesForStage(currentStage.value));
const selectedDeliverable = computed(() =>
  activeDeliverables.value.find((d) => d.key === deliverableSelected.value) || workflowFile.value || null
);
const assistantSubject = computed(() => (currentStage.value===1&&researchDocument.value?.name) || selectedDeliverable.value?.name || (workflowOpen.value ? workflowSnapshot.value?.currentTask : '') || activeStageObj.value?.name || '当前阶段');
const assistantThreadKey = computed(() => deliverableSelected.value || '__stage__');
const activeDeliverableContent = computed(() =>
  deliverableContents.value[`${currentStage.value}:${deliverableSelected.value}`] || ''
);
// 预览用内容：优先用图片已内联的版本，回退到原文（编辑中的实时内容也会回退到原文）
const activeDeliverablePreview = computed(() =>
  deliverablePreviews.value[`${currentStage.value}:${deliverableSelected.value}`] ||
  activeDeliverableContent.value
);
const deliverableStatus = computed(() => {
  const m = {};
  activeDeliverables.value.forEach((d) => {
    if(d.kind==='prototype-package'){m[d.key]=prototypePackageReady.value?'ready':'empty';return;}
    m[d.key] = deliverableContents.value[`${currentStage.value}:${d.key}`] ? 'ready' : 'empty';
  });
  return m;
});

const stage3Quick = [
  '帮我把阶段②收敛的需求整理成最终确认清单',
  '这个项目该拆成哪几个智能体？画个矩阵',
  '梳理一下每个智能体的输入输出和边界',
];
const stage2Quick = [
  '帮我梳理这个项目的核心需求和使用场景',
  '这个客户可能有哪些痛点？该问哪些问题',
  '基于我们聊的，列一下需要哪些 AI 能力',
];

// Session update subscription
let unsubscribe = null;

// --- Helper: create a fresh message object ---
function createMessage(role, content, extra = {}) {
  return {
    role,
    content: content || '',
    thinkingSteps: [],
    thinkingDone: true,
    expanded: false,
    typingContent: '',
    timestamp: formatTimestamp(),
    ...extra,
  };
}

function formatTimestamp(date) {
  const d = date || new Date();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${mm}-${dd} ${h}:${m}`;
}

// --- Helper: format tool call text nicely ---
function formatToolCallText(title) { return publicToolStep(title); }

// --- Markdown rendering (with delivery card support) ---
const ALL_EXTS = 'png|jpg|jpeg|gif|svg|webp|bmp|ico|pdf|html|htm|xlsx|xls|csv|doc|docx|ppt|pptx|zip|rar|7z|gz|tar|mp3|mp4|wav|mov|avi|txt|md|json|js|ts|css|py|java|go|rs|sh|vue';
const IMG_EXTS_SET = new Set(['png','jpg','jpeg','gif','svg','webp','bmp','ico']);

function escAttr(s) { return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function deliveryCardHtml(fp) {
  const safePath = fp.replace(/\\/g, '/');
  const name = safePath.split('/').pop();
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const isImg = IMG_EXTS_SET.has(ext);
  const iconMap = {
    pdf: ['fa-file-pdf', '#e11d48', '#fff1f2'],
    doc: ['fa-file-word', 'var(--ui-brand)', 'var(--ui-brand-soft)'], docx: ['fa-file-word', 'var(--ui-brand)', 'var(--ui-brand-soft)'],
    xls: ['fa-file-excel', '#059669', '#ecfdf5'], xlsx: ['fa-file-excel', '#059669', '#ecfdf5'], csv: ['fa-file-excel', '#059669', '#ecfdf5'],
    ppt: ['fa-file-powerpoint', '#ea580c', '#fff7ed'], pptx: ['fa-file-powerpoint', '#ea580c', '#fff7ed'],
    zip: ['fa-file-zipper', '#d97706', '#fffbeb'], rar: ['fa-file-zipper', '#d97706', '#fffbeb'], '7z': ['fa-file-zipper', '#d97706', '#fffbeb'],
    png: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], jpg: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], jpeg: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'],
    gif: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], svg: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'], webp: ['fa-image', 'var(--ui-violet)', 'var(--ui-violet-soft)'],
    html: ['fa-file-code', 'var(--ui-accent)', 'var(--ui-accent-soft)'], htm: ['fa-file-code', 'var(--ui-accent)', 'var(--ui-accent-soft)'],
    md: ['fa-file-lines', 'var(--ui-brand)', 'var(--ui-brand-soft)'], txt: ['fa-file-lines', 'var(--ui-brand)', 'var(--ui-brand-soft)'],
  };
  const [icon, color, bg] = iconMap[ext] || ['fa-file', 'var(--ui-text-3)', 'var(--ui-bg-3)'];
  const typeLabels = { pdf:'PDF', doc:'Word', docx:'Word', xls:'Excel', xlsx:'Excel', csv:'CSV', ppt:'PPT', pptx:'PPT', png:'PNG', jpg:'JPEG', jpeg:'JPEG', gif:'GIF', svg:'SVG', webp:'WebP', html:'HTML', md:'Markdown', txt:'文本' };
  const typeLabel = typeLabels[ext] || ext.toUpperCase() || '文件';
  const thumbHtml = isImg ? `<img src="file:///${escAttr(safePath.replace(/^\//, ''))}" class="chat-delivery-thumb" onerror="this.style.display='none'" />` : '';

  return `<div class="chat-delivery-card" data-filepath="${escAttr(safePath)}" data-name="${escAttr(name)}" data-ext=".${escAttr(ext)}">`
    + `<div class="chat-delivery-icon" style="background:${bg}"><i class="fa-solid ${icon}" style="color:${color}"></i></div>`
    + `<div class="chat-delivery-main"><div class="chat-delivery-name">${escAttr(name)}</div><div class="chat-delivery-meta">${escAttr(typeLabel)}</div></div>`
    + thumbHtml
    + `<button class="chat-delivery-action chat-file-download" data-filepath="${escAttr(safePath)}" title="另存为…"><i class="fa-solid fa-download"></i></button>`
    + `<button class="chat-delivery-action chat-file-open" data-filepath="${escAttr(safePath)}" title="用系统程序打开"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`
    + `</div>`;
}

const _pdPlaceholders = [];
const processImagePaths = (content) => {
  const card = (fp) => deliveryCardHtml(fp);
  const imgTag = (fp) => {
    const safePath = fp.replace(/\\/g, '/').replace(/^\//, '');
    return `<img src="file:///${safePath}" class="max-w-[480px] rounded-lg border border-slate-200 my-2 cursor-zoom-in chat-inline-img" onerror="this.style.display='none'" />`;
  };
  const IMG_EXTS = 'png|jpg|jpeg|gif|svg|webp|bmp|ico';
  // 只有正经交付物(文档/表格/演示/网页/压缩包/音视频/md)转卡片;
  // 代码与参数文件(js/ts/py/json/css/sh/vue…)保持行内代码,不转卡片。
  const CARD_EXTS = new Set([
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx',
    'html', 'htm', 'md', 'txt',
    'zip', 'rar', '7z', 'gz', 'tar',
    'mp3', 'wav', 'mp4', 'mov', 'avi',
  ]);
  const render = (fp) => {
    const ext = (fp.split('.').pop() || '').toLowerCase();
    if (IMG_EXTS_SET.has(ext)) {
      if (!fp.startsWith('/')) return card(fp);
      return imgTag(fp);
    }
    if (!CARD_EXTS.has(ext)) return null; // 代码/参数文件不转卡片
    return card(fp);
  };

  _pdPlaceholders.length = 0;
  // 返回 null 表示不转卡片,调用方保留原始文本交给 marked。
  const ph = (fp) => {
    const html = render(fp);
    if (html == null) return null;
    const id = `XDLVR${_pdPlaceholders.length}X`;
    _pdPlaceholders.push(html);
    return id;
  };

  let processed = content.replace(
    new RegExp('`\\s*((?:[\\w.\\-\\u4e00-\\u9fff]+\\/)*[\\w.\\-\\u4e00-\\u9fff]+\\.(' + ALL_EXTS + '))\\s*`', 'gi'),
    (m, fp) => ph(fp) ?? m
  );
  processed = processed.replace(
    new RegExp(`MEDIA:([^\\s\\n]+\\.(${ALL_EXTS}))`, 'gi'),
    (m, fp) => ph(fp) ?? m
  );
  processed = processed.replace(
    new RegExp(`(?:^|\\n)[ \\t]*(?:\`)?(\\/[^\\s\`]+\\.(${ALL_EXTS}))(?:\`)?[ \\t]*(?:\\n|$)`, 'gim'),
    (m, fp) => { const id = ph(fp); return id == null ? m : '\n' + id + '\n'; }
  );
  processed = processed.replace(
    new RegExp(`(?<![\\w/:.])(\\/[^\\s\`<>|]+\\.(${ALL_EXTS}))(?![\\w/])`, 'gi'),
    (m, fp) => ph(fp) ?? m
  );
  processed = processed.replace(
    new RegExp(`(?<![\\w/:.\\u4e00-\\u9fff])((?:[\\w.\\-\\u4e00-\\u9fff]+\\/)+[\\w.\\-\\u4e00-\\u9fff]+\\.(${ALL_EXTS}))(?![\\w/])`, 'gi'),
    (m, fp) => ph(fp) ?? m
  );
  processed = processed.replace(
    new RegExp(`!\\[[^\\]]*\\]\\((\\/[^)]+\\.(${IMG_EXTS}))\\)`, 'gi'),
    (m, fp) => ph(fp) ?? m
  );
  processed = processed.replace(
    new RegExp(`(?:已生成[：:.]\\s*|生成了\\s*)([^\\s，。、\\n]+\\.(${ALL_EXTS}))`, 'gi'),
    (m, fn) => { const id = ph(fn); return id == null ? m : m.replace(fn, id); }
  );
  return processed;
};

// noFileCards：工作台对话区用——右侧已有文档预览，正文里再出文件卡片是重复信息。
// 此时文件名退化成普通行内代码，不再渲染可下载/打开的卡片。
const renderMarkdown = (text, opts = {}) => {
  if (!text) return '';
  if (opts.noFileCards) return marked(text, { breaks: true, gfm: true });
  let html = marked(processImagePaths(text), { breaks: true, gfm: true });
  for (let i = 0; i < _pdPlaceholders.length; i++) {
    html = html.replace(`XDLVR${i}X`, _pdPlaceholders[i]);
  }
  return html;
};

const renderedSpec = computed(() => {
  if (!specContent.value) return '';
  return marked(specContent.value, { breaks: true, gfm: true });
});

// --- Render assistant content with typewriter cursor ---
const renderAssistantContent = (msg, index, opts = {}) => {
  const targetMessages = activeMessagesArr();
  const isLast = index === targetMessages.length - 1;

  // If still streaming and this is the last message, show typing content with cursor
  if (isLast && isStreaming.value && msg.role === 'assistant') {
    const content = msg.typingContent || msg.content || '';
    if (content) {
      return renderMarkdown(cleanAssistantContent(content), opts) + "<span class='inline-block w-2 h-4 bg-blue-500 ml-1 rounded-sm animate-pulse align-middle'></span>";
    }
    // Still waiting for first content
    return "<span class='inline-block w-2 h-4 bg-blue-500 ml-1 rounded-sm animate-pulse align-middle'></span>";
  }

  return renderMarkdown(cleanAssistantContent(msg.content), opts);
};

// --- Load project ---
const loadProject = async () => {
  messagesLoading.value = true;
  try {
    const data = await window.api.hermes.loadProject(props.slug);
    try {
      const history = await window.api.hermes.readFile(props.slug, 'messages.jsonl');
      if (data && history?.success) data.messages = String(history.content || '').split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
    } catch (error) { console.warn('完整项目讨论读取失败，使用已有记录', error); }
    if (data) {
      projectMeta.value = data.meta || data;
      projectName.value = data.meta?.name || data.name || props.slug;
      // 读取 FDE 阶段状态(主进程已对旧项目补默认)
      const m = projectMeta.value || {};
      if (typeof m.stage === 'number') {
        progressStage.value = m.stage;
        currentStage.value = m.stage;
      }
      if (m.stageStatus && typeof m.stageStatus === 'object') stageStatus.value = m.stageStatus;
      if (data.messages && data.messages.length > 0) {
        // 按交付物分拣：tab 形如 'deliverable:<key>'，各自恢复到独立会话
        const dlvBuckets = {};
        for (const m of data.messages) {
          if (discussionStore.restoreMessage(m, dlvBuckets)) continue;
          const tab = m.tab || '';
          const stageMatch = /^stage:([1-5])$/.exec(tab);
          if (stageMatch) {
            const k = `${stageMatch[1]}:__stage__`;
            (dlvBuckets[k] ||= []).push(m);
            continue;
          }
          if (!tab.startsWith('deliverable:')) continue;
          const key = tab.slice('deliverable:'.length);
          const knownStages = [2, 3].filter(sid => deliverablesForStage(sid).some(d => d.key === key));
          const stageIds = m.stageId ? [m.stageId] : knownStages.length ? knownStages : [projectMeta.value?.stage || 2];
          for (const sid of stageIds) {
            const k = `${sid}:${key}`;
            (dlvBuckets[k] ||= []).push(m);
          }
        }
        const restored = {};
        for (const [k, msgs] of Object.entries(dlvBuckets)) {
          restored[k] = msgs.map((m) => createMessage(m.role || 'assistant', m.content || '', { thinkingSummary: m.thinkingSummary || '', thinkingSteps: m.thinkingSteps || [], timestamp: m.timestamp || '' }));
        }
        deliverableMsgs.value = restored;

        if (!knowledgeStreaming.value) knowledgeMessages.value = data.messages.filter(m => m.tab === 'knowledge').map(m => createMessage(m.role || 'assistant', m.content || '', { thinkingSummary: m.thinkingSummary || '', thinkingSteps: m.thinkingSteps || [], timestamp: m.timestamp || '' }));
        const reqMsgs = data.messages.filter(m => m.tab !== 'knowledge' && m.tab !== 'iterate' && m.tab !== 'chat3' && !String(m.tab || '').startsWith('deliverable:') && !String(m.tab || '').startsWith('discussion:') && !/^stage:[1-5]$/.test(m.tab || ''));
        const itMsgs = data.messages.filter(m => m.tab === 'iterate');
        const s3Msgs = data.messages.filter(m => m.tab === 'chat3');
        if (reqMsgs.length) {
          messages.value = reqMsgs.map(m => createMessage(m.role || 'assistant', m.content || '', { thinkingSummary: m.thinkingSummary || '', thinkingSteps: m.thinkingSteps || [], timestamp: m.timestamp || '' }));
        }
        if (itMsgs.length) {
          iterateMessages.value = itMsgs.map(m => createMessage(m.role || 'assistant', m.content || '', { thinkingSummary: m.thinkingSummary || '', thinkingSteps: m.thinkingSteps || [], timestamp: m.timestamp || '' }));
        }
        if (s3Msgs.length) {
          stage3Messages.value = s3Msgs.map(m => createMessage(m.role || 'assistant', m.content || '', { thinkingSummary: m.thinkingSummary || '', thinkingSteps: m.thinkingSteps || [], timestamp: m.timestamp || '' }));
        }
      }
      if (data.sessionRecovered) {
        messages.value.push(createMessage('assistant', '检测到之前的会话已过期，已从项目文件中自动恢复上下文，可以继续之前的工作。'));
      }
    }
  } catch (e) {
    console.error('Failed to load project:', e);
    projectName.value = props.slug;
  } finally {
    messagesLoading.value = false;
  }
};

// --- Session update handler ---
let streamEndTimer = null;

const scheduleStreamEnd = () => {
  // Don't auto-end while tools are running — AI may be between tool calls
  if (isToolRunning.value) return;
  if (streamEndTimer) clearTimeout(streamEndTimer);
  // 120 seconds — generous fallback; normal ending relies on agent_message_end event
  streamEndTimer = setTimeout(() => {
    // prompt 还没返回说明引擎仍在跑（长工具调用时可能 2 分钟没 chunk），不能提前收尾
    if (isStreaming.value && !isToolRunning.value && !getInflightPrompt(props.slug)) {
      endStream();
      loadSpec();
      refreshPrototypeFiles();
    }
  }, 120000);
};

// --- Typewriter effect ---
const typewriterQueue = [];
let typewriterTimer = null;
const TYPEWRITER_INTERVAL = 30; // ms per chunk

const enqueueChunk = (text) => {
  typewriterQueue.push(text);
  if (!typewriterTimer) {
    drainTypewriter();
  }
};

const drainTypewriter = () => {
  if (typewriterQueue.length === 0) {
    typewriterTimer = null;
    return;
  }
  const text = typewriterQueue.shift();
  appendAssistantText(text);
  scrollToBottom();
  typewriterTimer = setTimeout(drainTypewriter, TYPEWRITER_INTERVAL);
};

const flushTypewriterQueue = () => {
  if (typewriterTimer) clearTimeout(typewriterTimer);
  typewriterTimer = null;
  while (typewriterQueue.length > 0) {
    appendAssistantText(typewriterQueue.shift());
  }
  scrollToBottom();
};

const appendAssistantText = (text) => {
  const targetMessages = activeMessagesArr();
  const lastMsg = targetMessages[targetMessages.length - 1];
  if (lastMsg && lastMsg.role === 'assistant') {
    // Append to typingContent (which shows during streaming) and content (the final)
    lastMsg.typingContent = (lastMsg.typingContent || '') + text;
    lastMsg.content = (lastMsg.content || '') + text;
  } else {
    targetMessages.push(createMessage('assistant', text, {
      thinkingSteps: [],
      thinkingDone: false,
      expanded: true,
      typingContent: text,
    }));
  }
};

// --- Finalize the last assistant message when streaming ends ---
const finalizeLastAssistantMessage = () => {
  const targetMessages = activeMessagesArr();
  const lastMsg = targetMessages[targetMessages.length - 1];
  if (lastMsg && lastMsg.role === 'assistant') {
    lastMsg.thinkingDone = true;
    lastMsg.expanded = false;
    lastMsg.typingContent = '';
    lastMsg.timestamp = formatTimestamp();
    finalizeResponseSummary(lastMsg);
    const failure = modelFailureMessage(lastMsg.content);
    if (failure) lastMsg.content = failure;
    if (lastMsg.thinkingSteps && lastMsg.thinkingSteps.length > 0) {
      // Summarize what was done instead of generic "处理完成"
      const toolSteps = lastMsg.thinkingSteps.filter(s => s.icon === 'fa-solid fa-wrench' || s.text.startsWith('✅'));
      const summary = toolSteps.length > 0
        ? `全部完成（${toolSteps.length} 个操作）`
        : '回复完成';
      lastMsg.thinkingSteps.push({
        text: summary,
        icon: 'fa-solid fa-flag-checkered',
        visible: true,
      });
    }

    // Persist assistant message
    if (lastMsg.content) {
      const tab = activeTabName();
      window.api.hermes.saveMessage(props.slug, plainMessage({ role: 'assistant', content: lastMsg.content, thinkingSummary: lastMsg.thinkingSummary, thinkingSteps: lastMsg.thinkingSteps.filter(s => s.kind === 'public-progress'), tab, stageId: lockedStream?.stageId || currentStage.value, timestamp: new Date().toISOString() })).catch(error => console.warn('Save response failed:', error));
    }
  }
};

// --- Get or create the current assistant message for streaming ---
const getOrCreateAssistantMsg = () => {
  const targetMessages = activeMessagesArr();
  const lastMsg = targetMessages[targetMessages.length - 1];
  // 未结束 → 继续追加
  if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.thinkingDone) {
    return lastMsg;
  }
  // 已结束但 streamId 匹配当前轮次 → 重新打开追加（防止竞态丢内容）
  if (lastMsg && lastMsg.role === 'assistant' && lastMsg.streamId && lastMsg.streamId === currentStreamId) {
    lastMsg.thinkingDone = false;
    return lastMsg;
  }
  // 否则新建
  const newMsg = createMessage('assistant', '', {
    thinkingSteps: [],
    thinkingDone: false,
    expanded: true,
    typingContent: '',
    timestamp: '',
    streamId: currentStreamId,
  });
  targetMessages.push(newMsg);
  return newMsg;
};

// 从 ACP tool_call 事件里抓「写文件」的实时内容，推到右侧预览面板。
// 引擎在 auto-approve 模式下会把完整新内容放进 content[] 的 diff 块（{type:'diff', path, newText}），
// 所以文档在 agent 写完那一刻就能渲染，不用等落盘再读回。
function captureLiveEdit(update) {
  if (lockedStream?.tab === 'knowledge') return;
  if (!update) return;
  const blocks = Array.isArray(update.content) ? update.content
    : (update.content ? [update.content] : []);
  const diff = blocks.find((c) => c && (c.type === 'diff' || c.newText != null || c.new_text != null));
  if (!diff) return;

  const rawPath = diff.path || diff.file_path || '';
  const newText = diff.newText ?? diff.new_text ?? '';
  if (!rawPath || typeof newText !== 'string') return;

  // 只关心当前阶段的交付物 md（其他文件如原型 html 不进文档面板）
  const norm = String(rawPath).replace(/\\/g, '/');
  const stageId = currentStage.value;
  const d = deliverablesForStage(stageId).find((x) => norm.endsWith(x.file));
  if (!d) return;

  const k = dkey(stageId, d.key);
  deliverableContents.value = { ...deliverableContents.value, [k]: newText };
  // 实时预览优先展示正在写的这份，切换选中项让左右对应
  deliverableSelected.value = d.key;
  livePreviewTitle.value = d.name;
  livePreviewFile.value = d.file;
  livePreviewContent.value = newText;
  livePreviewMode.value = 'md';        // 生成过程中固定看 md 实时流
  livePreviewDocxHtml.value = '';      // 新内容让旧 docx 快照失效
  livePreviewStreaming.value = true;
}

const handleSessionUpdate = (data) => {
  if (!data || data.channel === 'knowledge' || (data.slug && data.slug !== props.slug)) return;
  const sessionId = data.sessionId || data.session_id;
  if (!data.slug && sessionId && sessionId !== projectMeta.value?.sessionId) return;
  // ACP notification structure varies — normalize access
  const update = data.update || data;
  const type = update.type || update.sessionUpdate || data.type || data.sessionUpdate;

  // Debug: log every incoming event to help diagnose silent drops
  if (!type) {
    console.warn('[ProjectDetail] session-update with no type:', JSON.stringify(data).slice(0, 300));
    return;
  }
  console.log('[ProjectDetail] session-update:', type);

  if (type === 'agent_message_chunk' || type === 'content_block_delta') {
    const text = update.content?.text || update.content || '';
    if (!isStreaming.value) {
      addLog('info', '📝 AI 开始生成回复内容');
    }
    isStreaming.value = true;
    isToolRunning.value = false;
    if (thoughtBuffer) flushThoughtBuffer();
    enqueueChunk(text);
    scheduleStreamEnd();
  } else if (type === 'agent_thought_chunk' || type === 'agent_reasoning') {
    if (isStreaming.value) {
      const message = getOrCreateAssistantMsg();
      if (!message.thinkingSteps.some(s => s.kind === 'public-progress' && s.text === '正在整理问题和相关上下文。')) message.thinkingSteps.push({text:'正在整理问题和相关上下文。',kind:'public-progress',icon:'fa-solid fa-book-open'});
    }
    if (isStreaming.value) scheduleStreamEnd();
  } else if (type === 'tool_call_start') {
    if (streamEndTimer) clearTimeout(streamEndTimer);
    flushTypewriterQueue();
    // Flush thought buffer when a tool starts
    if (thoughtBuffer) flushThoughtBuffer();
    isToolRunning.value = true;
    isStreaming.value = true;

    const assistantMsg = getOrCreateAssistantMsg();
    // Mark the last thought step as done (so next thought starts fresh)
    const steps = assistantMsg.thinkingSteps;
    if (steps.length > 0 && steps[steps.length - 1].icon === 'fa-solid fa-brain') {
      steps[steps.length - 1]._done = true;
      // Trim very long thoughts to a summary
      const lastThought = steps[steps.length - 1];
      if (lastThought.text.length > 200) {
        lastThought.text = lastThought.text.slice(0, 150) + '... (思考中)';
      }
    }

    const title = update.title || update.name || '正在执行工具...';
    const args = update.arguments || update.args || {};
    toolLabel.value = title;

    // 实时预览：引擎写文件时带 diff 内容块（{type:'diff', path, newText}），
    // 直接把 newText 推到右侧面板，不必等落盘后再读回。
    captureLiveEdit(update);

    assistantMsg.thinkingSteps.push({
      text: publicToolStep(title), kind: 'public-progress',
      icon: 'fa-solid fa-wrench',
      visible: true,
    });
    addLog('tool', formatToolCallText(title, args), 'running');
    scrollToBottom();
  } else if (type === 'tool_call_progress') {
    captureLiveEdit(update);
    if (update.status === 'completed' || update.status === 'failed') {
      isToolRunning.value = false;
      const assistantMsg = getOrCreateAssistantMsg();
      const title = update.title || update.name || '';
      if (update.status === 'completed') {
        const detail = update.content?.text || title || '完成';
        assistantMsg.thinkingSteps.push({
          text: publicToolStep(title, 'completed'), kind: 'public-progress',
          icon: 'fa-solid fa-check',
          visible: true,
        });
        addLog('tool', '✓ ' + (title || '完成'), 'completed');
      } else {
        assistantMsg.thinkingSteps.push({
          text: publicToolStep(title, 'failed'), kind: 'public-progress',
          icon: 'fa-solid fa-xmark',
          visible: true,
        });
        addLog('tool', '✗ ' + (title || '工具执行失败'), 'failed');
      }
      scrollToBottom();
    }
  } else if (type === 'tool_call_end') {
    isToolRunning.value = false;
    // Mark tool completion in thinking steps if no tool_call_progress was sent
    const assistantMsg = getOrCreateAssistantMsg();
    const toolName = update.title || update.name || update.toolName || '';
    if (toolName) {
      assistantMsg.thinkingSteps.push({
        text: publicToolStep(toolName, 'completed'), kind: 'public-progress',
        icon: 'fa-solid fa-circle-check',
        visible: true,
      });
      addLog('tool', '✓ ' + toolName, 'completed');
    }
    scrollToBottom();
    scheduleStreamEnd();
  } else if (type === 'agent_message_end' || type === 'session_end' || type === 'stop') {
    const completedTab = lockedStream?.tab;
    if (thoughtBuffer) flushThoughtBuffer();
    endStream();
    // Rich completion log with usage stats if available
    const usage = update.usage || data.usage || {};
    let doneMsg = '✅ 回复完成';
    if (usage.totalTokens || usage.total_tokens) {
      const total = usage.totalTokens || usage.total_tokens || 0;
      const input = usage.inputTokens || usage.input_tokens || 0;
      const output = usage.outputTokens || usage.output_tokens || 0;
      doneMsg += ` | tokens: ${input}→${output} (${total})`;
    }
    addLog('info', doneMsg);
    // 原型迭代结束：刷新 iframe 并清除流目标标记
    if (activeTab.value === 'iterate' || streamTargetTab.value === 'iterate') {
      iframeKey.value++;
      refreshPrototypeFiles();
      streamTargetTab.value = '';
    }
    loadSpec();
    refreshPrototypeFiles();
    // 阶段②③：AI 可能刚写完交付物文件，读回渲染
    if (completedTab !== 'knowledge' && (currentStage.value === 2 || currentStage.value === 3)) {
      deliverableBusy.value = false;
      deliverableBusyKey.value = '';
      livePreviewStreaming.value = false;
      finishLivePreview(currentStage.value);
    }
  } else if (type === 'usage_update' || type === 'usage') {
    // Rich usage info: model, tokens, latency
    const used = update.used || 0;
    const size = update.size || 0;
    const pct = size > 0 ? Math.round((used / size) * 100) : 0;
    const model = update.model || '';
    const latency = update.latency ? `${update.latency}s` : '';
    const inputTokens = update.inputTokens || update.input_tokens || '';
    const outputTokens = update.outputTokens || update.output_tokens || '';

    let logContent = `上下文: ${(used/1000).toFixed(1)}k/${(size/1000).toFixed(0)}k (${pct}%)`;
    if (inputTokens || outputTokens) {
      logContent += ` | in:${inputTokens} out:${outputTokens}`;
    }
    if (model) {
      logContent += ` | ${model}`;
    }
    if (latency) {
      logContent += ` | ${latency}`;
    }
    addLog('usage', logContent);

    if (isStreaming.value && !isToolRunning.value) {
      scheduleStreamEnd();
    }
    if (update.used && update.size) {
      addLog('usage', `tokens: ${update.used}/${update.size}`);
    }
    if (isStreaming.value && !isToolRunning.value) {
      scheduleStreamEnd();
    }
  } else if (type === 'error') {
    if (thoughtBuffer) flushThoughtBuffer();
    const targetMessages = activeMessagesArr();   // 先取本轮目标，endStream 会清锁
    endStream();
    addLog('error', update.message || '请求失败');
    targetMessages.push(createMessage('assistant', `**Error:** ${update.message || '请求失败'}`));
  }
};

// --- Chat functions ---
const sendMessage = async () => {
  const text = chatInput.value.trim();
  const atts = reqComposer.attachments.value;
  if ((!text && atts.length === 0) || isStreaming.value) return;
  if (!(await reqComposer.checkModelForAttachments())) return;

  messages.value.push(createMessage('user', text, atts.length ? { attachments: [...atts] } : {}));
  chatInput.value = '';
  const sending = [...atts];
  reqComposer.clearAttachments();
  beginStream(messages.value, 'requirement');

  window.api.hermes.saveMessage(props.slug, { role: 'user', content: text, tab: 'requirement', timestamp: new Date().toISOString() });

  // Pre-create assistant message with initial thinking step
  messages.value.push(createMessage('assistant', '', {
    thinkingSteps: [
      { text: '已发送请求，等待 AI 响应...', icon: 'fa-solid fa-cloud-arrow-up', visible: true },
    ],
    thinkingDone: false,
    expanded: true,
    typingContent: '',
    timestamp: '',
    streamId: currentStreamId,
  }));

  scrollToBottom();

  try {
    const p = projectPrompt(text, sending);
    trackPrompt(props.slug, { tab: 'requirement' }, p);
    await p;
    endStream();   // prompt 返回 = 引擎这一轮真的结束了
    loadSpec();
  } catch (e) {
    console.error('Prompt failed:', e);
    endStream();
  }
};

const sendIterate = async () => {
  const text = iterateInput.value.trim();
  const atts = iterateComposer.attachments.value;
  if ((!text && atts.length === 0) || isStreaming.value) return;
  if (!(await iterateComposer.checkModelForAttachments())) return;

  streamTargetTab.value = 'iterate';   // 原型页迭代：内容归到 iterate 流，不污染需求对话
  iterateMessages.value.push(createMessage('user', text, atts.length ? { attachments: [...atts] } : {}));
  iterateInput.value = '';
  const sending = [...atts];
  iterateComposer.clearAttachments();
  beginStream(iterateMessages.value, 'iterate');

  window.api.hermes.saveMessage(props.slug, { role: 'user', content: text, tab: 'iterate', timestamp: new Date().toISOString() });

  // Pre-create assistant message with initial thinking step
  iterateMessages.value.push(createMessage('assistant', '', {
    thinkingSteps: [
      { text: '已发送请求，等待 AI 响应...', icon: 'fa-solid fa-cloud-arrow-up', visible: true },
    ],
    thinkingDone: false,
    expanded: true,
    typingContent: '',
    timestamp: '',
    streamId: currentStreamId,
  }));

  try {
    const p = projectPrompt(`/prototype-iterate ${text}`, sending);
    trackPrompt(props.slug, { tab: 'iterate' }, p);
    await p;
    endStream();
    iframeKey.value++;
    refreshPrototypeFiles();
    streamTargetTab.value = '';
  } catch (e) {
    console.error('Iterate prompt failed:', e);
    endStream();
    streamTargetTab.value = '';
  }
};

// ============ 阶段③：需求确认 + 智能体设计 ============

// 阶段③对话发送（复用项目级 prompt 通道，注入阶段语境）
const sendStage3 = async () => {
  const text = stage3Input.value.trim();
  const atts = stage3Composer.attachments.value;
  if ((!text && atts.length === 0) || isStreaming.value) return;
  if (!(await stage3Composer.checkModelForAttachments())) return;

  stage3Messages.value.push(createMessage('user', text, atts.length ? { attachments: [...atts] } : {}));
  stage3Input.value = '';
  const sending = [...atts];
  stage3Composer.clearAttachments();
  beginStream(stage3Messages.value, 'chat3');

  window.api.hermes.saveMessage(props.slug, { role: 'user', content: text, tab: 'chat3', timestamp: new Date().toISOString() });

  stage3Messages.value.push(createMessage('assistant', '', {
    thinkingSteps: [{ text: '已发送请求，等待 AI 响应...', icon: 'fa-solid fa-cloud-arrow-up', visible: true }],
    thinkingDone: false, expanded: true, typingContent: '', timestamp: '', streamId: currentStreamId,
  }));
  scrollToBottom();

  const framed = `【阶段③ 需求确认+智能体设计】你是 FDE 交付工程师。当前任务：把阶段②收敛后的需求签字定死，并把业务链路拆成智能体矩阵（一个环节一个智能体、上游输出=下游输入、过 Eval 门禁）。请围绕以下用户输入继续推进，必要时追问澄清：\n\n${text}`;
  try {
    const p = projectPrompt(framed, sending);
    trackPrompt(props.slug, { tab: 'chat3' }, p);
    await p;
    endStream();
  } catch (e) {
    console.error('Stage3 prompt failed:', e);
    endStream();
  }
};

// —— 工作台右侧文档预览状态 ——
// 实时预览：agent 通过 tool_call(kind=edit) 写文件时，直接取 new_text 更新此处
const livePreviewContent = ref('');      // 当前右侧面板展示的 markdown 原文（实时 or 静态）
const livePreviewDocxHtml = ref('');     // docx → HTML 快照（生成完成后填充）
const livePreviewMode = ref('md');       // 'md' | 'docx'
const livePreviewTitle = ref('');        // 面板顶部标题（交付物名）
const livePreviewFile = ref('');         // 正在预览的项目内相对路径（用于 docx 转存判断）
const livePreviewStreaming = ref(false); // 正在实时接收写入（面板顶部显示「生成中」）
const docxBusy = ref(false);             // 正在生成 / 转存 Word
const leftPanelCollapsed = ref(false);  // 二级侧边栏收起为窄轨
const leftPanelWidth = ref(0);          // 0 = 用默认 248px；>0 = 用户拖过，固定像素
const leftPanelDragging = ref(false);

function openPreviewWindow() {
  const d = selectedDeliverable.value;
  if (!d) return;
  if (livePreviewFile.value !== d.file || !livePreviewContent.value) {
    showPreview(currentStage.value, d);
  }
  previewScrollRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
}

// 显示指定交付物的预览：切换 livePreviewContent + 标题。
// 内存里没有时回落到读盘——否则已生成的交付物在内存未填充前会被误判成「未生成」。
let previewLoadSeq = 0;
async function showPreview(stageId, d) {
  const requestId = ++previewLoadSeq;
  const k = dkey(stageId, d.key);
  livePreviewTitle.value = d.name;
  livePreviewFile.value = d.file;
  livePreviewDocxHtml.value = '';
  livePreviewMode.value = 'md';
  livePreviewContent.value = '';
  previewEditing.value = false;

  let content = deliverableContents.value[k] || '';
  if (!content) {
    await loadDeliverable(stageId, d);          // 读盘并写回 deliverableContents
    content = deliverableContents.value[k] || '';
  }
  if (requestId !== previewLoadSeq) return;
  livePreviewContent.value = content;
  if (content) loadDocxPreview(stageId, d);
  nextTick(() => { if (requestId === previewLoadSeq && previewScrollRef.value) previewScrollRef.value.scrollTop = 0; });
}

async function loadDocxPreview(stageId, d) {
  try {
    const docxRel = d.file.replace(/\.md$/i, '') + '.docx';
    const r = await window.api.hermes.docxPreview(props.slug, docxRel);
    if (r && r.success && r.html && livePreviewFile.value === d.file) livePreviewDocxHtml.value = r.html;
  } catch (_) { /* 无 docx 时静默 */ }
}

// 侧边栏宽度拖拽：把手在侧栏右侧，鼠标右移变宽。
function startLeftDrag(e) {
  leftPanelDragging.value = true;
  const startX = e.clientX;
  // 首次拖拽以当前实际渲染宽度为起点，避免从默认值跳一下
  const panelEl = e.currentTarget?.previousElementSibling;
  const startW = leftPanelWidth.value || panelEl?.getBoundingClientRect().width || 248;
  const onMove = (ev) => {
    leftPanelWidth.value = Math.min(380, Math.max(150, startW + (ev.clientX - startX)));
  };
  const onUp = () => {
    leftPanelDragging.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// 生成结束后把 md 转成 docx。走 md-export 技能而不是主进程的即时转换：
// 技能带 360 品牌排版(深蓝标题 / 蓝底白字表格 / 中文字体 / 图片嵌入)，
// 主进程那套只做最朴素的结构映射，给甲方的版面撑不住。
// 代价是要等一轮模型往返，所以只在生成/保存结束后跑，不放在交互路径上。
async function autoSaveDocx(stageId, key) {
  const d = deliverablesForStage(stageId).find((x) => x.key === key) || (workflowFile.value?.key === key ? workflowFile.value : null);
  if (!d) return;
  const docxRel = d.file.replace(/\.md$/i, '') + '.docx';
  try {
    // 直接跑本地 md-export 脚本，不占用 AI 对话轮次（原先走 /md-export prompt，
    // 慢、会把转存消息混进时间线，失败还静默，Word 按钮因此永远点不动）。
    const conv = await window.api.hermes.mdToDocx(props.slug, d.file);
    if (!conv || !conv.success) {
      console.warn('[ProjectDetail] mdToDocx failed:', conv && conv.error);
      return;
    }
    const rv = await window.api.hermes.docxPreview(props.slug, docxRel);
    if (rv && rv.success && rv.html && currentStage.value === stageId && deliverableSelected.value === key) livePreviewDocxHtml.value = rv.html;
  } catch (e) {
    console.warn('[ProjectDetail] autoSaveDocx failed:', e);
  }
}

// —— 工作台：每件交付物的独立消息状态 ——
// 每件交付物的独立消息数组：键为 `${stageId}:${key}`
const deliverableMsgs = ref({});
const discussionStore = createProjectDiscussions({
  slug: () => props.slug,
  scope: () => currentStage.value === 1 ? '1:__stage__' : dkey(currentStage.value, assistantThreadKey.value),
  buckets: deliverableMsgs, knowledge: knowledgeMessages,
  busy: () => isStreaming.value || deliverableBusy.value,
  error: text => showToast(text, 'error'),
  show: () => { assistantPanelTab.value = 'assistant'; assistantConversationOpen.value = true; },
  open: async scope => {
    const [stage, key] = scope.split(':');
    if (!await flushDocumentEdits()) return false;
    if (Number(stage) !== currentStage.value) await viewStage(Number(stage), key === '__stage__' ? '' : key);
    if (key !== '__stage__') { workflowOpen.value = false; await selectDeliverable(key); }
    else deliverableSelected.value = '';
  },
});

// 当前选中交付物的消息数组（响应式引用，供模板绑定）
const activeDlvMsgs = computed(() => {
  if (discussionStore.activeMessages.value) return discussionStore.activeMessages.value;
  if(currentStage.value===1)return knowledgeMessages.value;
  const k = dkey(currentStage.value, assistantThreadKey.value);
  if (!deliverableMsgs.value[k]) deliverableMsgs.value[k] = [];
  return deliverableMsgs.value[k];
});

// Existing task conversations are visible on entry and after restoring history.
watch([currentStage, assistantThreadKey, () => discussionStore.active.value?.id,
  () => activeDlvMsgs.value.length], () => {
  if (activeDlvMsgs.value.length) assistantConversationOpen.value = true;
}, { flush: 'post' });

// 发送当前交付物的对话消息
const dlvInput = ref('');
const dlvComposer = useChatComposer({
  onTranscribe: (t) => { dlvInput.value = (dlvInput.value ? dlvInput.value + ' ' : '') + t; },
  getSlug: () => props.slug,
});

const knowledgeSourcePath=ref('');
async function followKnowledgeCitation(event){const link=event.target.closest('a[href^="#knowledge/"]');if(!link)return;event.preventDefault();try{const source=decodeURIComponent(link.getAttribute('href').slice('#knowledge/'.length));if(!await flushDocumentEdits())return;knowledgeSourcePath.value=source;if(!(currentStage.value===1&&activeTab.value==='workspace'))activeTab.value='knowledge';}catch{showToast('来源链接无法识别','error');}}
async function projectPrompt(text, attachments, selectedPaths) {
  const context = await projectKnowledgeContext(props.slug, selectedPaths, text);
  const files = Array.isArray(attachments) ? attachments : attachments?.attachments;
  const flowContext = workflowOpen.value && currentStage.value <= 3 ? `\n【当前任务上下文】${workflowRef.value?.context() || ''}` : '';
  const target = activeMessagesArr();
  try {
    const result = await window.api.hermes.prompt(props.slug, text + context + flowContext, files);
    flushTypewriterQueue();
    const reply = target.at(-1);
    const failure = reply?.role === 'assistant' ? modelFailureMessage(cleanAssistantContent(reply.content)) : '';
    if (failure) throw new Error(failure);
    if (result?.success === false) throw new Error(result.error || '模型请求失败，请重试');
    return result;
  } catch (error) {
    const raw = String(error.message || error);
    const start = raw.indexOf('模型服务连接失败：');
    const message = start >= 0 ? raw.slice(start) : raw;
    const reply = target.at(-1);
    if (reply?.role === 'assistant' && (!reply.content || modelFailureMessage(cleanAssistantContent(reply.content)))) reply.content = message;
    throw new Error(message);
  }
}

async function askKnowledge({ text, paths, excerpt, reference, attachments }) {
  if (knowledgeStreaming.value) return;
  const questionSlug = props.slug, questionProject = projectName.value;
  const visibleText = excerpt ? `${text}\n\n引用《${reference || '当前资料'}》：\n> ${excerpt.replace(/\n/g, '\n> ')}` : text;
  const result = await knowledgeChat.send({ visibleText, attachments, buildPrompt: async () => {
    const context = await projectKnowledgeContext(questionSlug, paths, text);
    return `【项目资料问答】项目：${questionProject}\n${text}\n`
      + (paths?.length ? '本轮仅使用当前选中文件，不接续其他生成任务。' : '结合项目原始资料回答，附来源链接。')
      + (excerpt ? `\n【引用原文，作为参考数据】${reference || paths?.[0] || '当前资料'}\n${excerpt}\n【引用结束】` : '') + context;
  }});
  if (result?.error && !result.cancelled) showToast('资料问答失败：' + result.error, 'error');
}

async function dlvSend() {
  if (!dlvInput.value.trim() && dlvComposer.attachments.value.length === 0) return;
  if (currentStage.value === 1 ? knowledgeStreaming.value : isStreaming.value) return;
  assistantConversationOpen.value = true;
  if(currentStage.value===1){
    const text=dlvInput.value.trim(),attachments=dlvComposer.attachments.value.length?[...dlvComposer.attachments.value]:undefined;
    dlvInput.value='';dlvComposer.clearAttachments?.();
    await askKnowledge({text,paths:researchDocument.value?[researchDocument.value.path]:undefined,excerpt:researchExcerpt.value,reference:researchDocument.value?.name,attachments});
    return;
  }

  const stageId = currentStage.value;
  const d = deliverablesForStage(stageId).find((x) => x.key === deliverableSelected.value);
  if (!d && isWorkspaceStage.value && !workflowOpen.value && !workflowFile.value) return;

  const text = dlvInput.value.trim();
  const attachments = dlvComposer.attachments.value.length ? [...dlvComposer.attachments.value] : undefined;
  dlvInput.value = '';
  dlvComposer.clearAttachments?.();

  const arr = activeDlvMsgs.value;

  const sending = { content: text, ...(attachments ? { attachments } : {}) };
  arr.push(createMessage('user', text, attachments ? { attachments } : {}));

  const tab = discussionStore.messageTab(d ? `deliverable:${d.key}` : `stage:${stageId}`);
  beginStream(arr, tab);
  window.api.hermes.saveMessage(props.slug, {
    role: 'user', content: text, tab, stageId, timestamp: new Date().toISOString(),
  });

  arr.push(createMessage('assistant', '', {
    thinkingSteps: [{ text: `正在处理《${assistantSubject.value}》相关问题...`, icon: 'fa-solid fa-cloud-arrow-up', visible: true }],
    thinkingDone: false, expanded: true, typingContent: '', timestamp: '', streamId: currentStreamId,
  }));
  scrollToBottom();

  const framed = d ? `【交付物：${d.name}】${text}` : `【项目：${projectName.value} · 阶段${stageId} ${activeStageObj.value.name}】${text}\n本阶段目标：${activeStageObj.value.goal}\n请结合已有项目资料回答。`;
  try {
    const p = projectPrompt(framed, sending);
    trackPrompt(props.slug, { tab }, p);
    await p;
    endStream();
  } catch (e) {
    console.error('dlvSend failed:', e);
    endStream();
  }
}

// 右侧预览滚动容器
const previewScrollRef = ref(null);
const documentReaderRef = ref(null);
const documentFullscreenButtonRef = ref(null);
const documentFullscreen = ref(false);
const projectMainRef = ref(null);
const mainAssistantPanelWidth = ref(360);
const fullscreenAssistantPanelWidth = ref(360);
const mainAssistantPanelCollapsed = ref(false);
const fullscreenAssistantPanelCollapsed = ref(false);
const assistantPanelCollapsed = computed(() => documentFullscreen.value ? fullscreenAssistantPanelCollapsed.value : mainAssistantPanelCollapsed.value);
const assistantPanelToggleRef = ref(null);
async function toggleAssistantPanel() {
  assistantPanelDragging.value = false;
  const collapsed = documentFullscreen.value ? fullscreenAssistantPanelCollapsed : mainAssistantPanelCollapsed;
  collapsed.value = !collapsed.value;
  await nextTick();
  assistantPanelToggleRef.value?.focus({ preventScroll: true });
}
const assistantPanelWidth = computed(() => documentFullscreen.value ? fullscreenAssistantPanelWidth.value : mainAssistantPanelWidth.value);
const assistantPanelDragging = ref(false);
let assistantDragStartX = 0;
let assistantDragStartWidth = 360;
try {
  const mainWidth = Number(localStorage.getItem('fde-main-assistant-panel-width'));
  const fullscreenWidth = Number(localStorage.getItem('fde-fullscreen-assistant-panel-width') || localStorage.getItem('fde-assistant-panel-width'));
  if (mainWidth >= 280 && mainWidth <= 640) mainAssistantPanelWidth.value = mainWidth;
  if (fullscreenWidth >= 280 && fullscreenWidth <= 640) fullscreenAssistantPanelWidth.value = fullscreenWidth;
} catch (_) { /* 本地偏好不可用时使用默认宽度 */ }

watch(documentFullscreen, () => { assistantPanelDragging.value = false; });

function setAssistantPanelWidth(width, remember = true) {
  const layoutWidth = (documentFullscreen.value ? documentReaderRef.value : projectMainRef.value)?.clientWidth || 1200;
  const maxWidth = Math.max(280, Math.min(640, layoutWidth - 460));
  const panelWidth = documentFullscreen.value ? fullscreenAssistantPanelWidth : mainAssistantPanelWidth;
  panelWidth.value = Math.round(Math.min(maxWidth, Math.max(280, width)));
  if (remember) {
    const storageKey = documentFullscreen.value ? 'fde-fullscreen-assistant-panel-width' : 'fde-main-assistant-panel-width';
    try { localStorage.setItem(storageKey, String(panelWidth.value)); } catch (_) { /* 不影响拖拽 */ }
  }
}

function startAssistantResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  assistantDragStartX = event.clientX;
  assistantDragStartWidth = assistantPanelWidth.value;
  assistantPanelDragging.value = true;
  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveAssistantResize(event) {
  if (!assistantPanelDragging.value) return;
  setAssistantPanelWidth(assistantDragStartWidth + assistantDragStartX - event.clientX, false);
}

function endAssistantResize(event) {
  if (!assistantPanelDragging.value) return;
  assistantPanelDragging.value = false;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  setAssistantPanelWidth(assistantPanelWidth.value);
}
const documentTitle = computed(() => livePreviewTitle.value || selectedDeliverable.value?.name || '交付物文档');
let readerReturnFocus = null;

async function toggleDocumentFullscreen() {
  const scrollTop = previewScrollRef.value?.scrollTop || 0;
  if (!documentFullscreen.value) {
    readerReturnFocus = document.activeElement;
    assistantPanelTab.value = 'assistant';
  }
  documentFullscreen.value = !documentFullscreen.value;
  await nextTick();
  if (previewScrollRef.value) previewScrollRef.value.scrollTop = scrollTop;
  const focusTarget = documentFullscreen.value ? documentFullscreenButtonRef.value : readerReturnFocus;
  if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
}

function handleDocumentReaderKeydown(event) {
  if (!documentFullscreen.value || lightboxVisible.value) return;
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation(); toggleDocumentFullscreen();
  } else if (event.key === 'Tab') {
    const reader=documentReaderRef.value, assistant=document.getElementById('project-reading-assistant');
    const selector='button:not(:disabled), textarea, input, select, a[href], [tabindex="0"]';
    const controls=[...new Set([...(reader?.querySelectorAll(selector)||[]),...(assistant?.querySelectorAll(selector)||[])])]
      .filter(element=>element.getClientRects().length)
      .sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    const first=controls[0],last=controls[controls.length-1],outside=!reader?.contains(document.activeElement)&&!assistant?.contains(document.activeElement);
    if(event.shiftKey&&(document.activeElement===first||outside)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||outside)){event.preventDefault();first?.focus();}
  }
}

function scrollToDocumentSection(index) {
  const section = documentReaderRef.value?.querySelector(`[data-document-section="${index}"]`);
  const scroller = previewScrollRef.value;
  if (!section || !scroller) return;
  scroller.scrollTo({
    top: scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 20,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

function renderDocumentMarkdown(source) {
  return renderMarkdown(source, { noFileCards: true })
    .replace(/<table\b[\s\S]*?<\/table>/gi, (table) => `<div class="document-table-scroll">${table}</div>`);
}

watch([activeTab, currentStage], () => { documentFullscreen.value = false; });

// docx 相对路径（面板顶栏展示）
const docxRelPath = computed(() =>
  livePreviewFile.value ? livePreviewFile.value.replace(/\.md$/i, '') + '.docx' : ''
);

// 预览用 markdown：图片已内联的版本优先，回退到实时原文
const livePreviewPreviewMd = computed(() => {
  const k = dkey(currentStage.value, deliverableSelected.value);
  return deliverablePreviews.value[k] || livePreviewContent.value;
});

// 从真实 Markdown 标题构建分节阅读视图，编辑与导出仍使用原文件全文。
function documentSectionHeadings(source) {
  const headings = [];
  let fence = '';
  for (const match of source.matchAll(/^ {0,3}(`{3,}|~{3,})[^\n]*$|^##[\t ]+(.+)$/gm)) {
    if (match[1]) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[0].trimStart().slice(match[1].length).trim()) fence = '';
    } else if (!fence) {
      headings.push({ title: match[2].trim(), index: match.index, end: match.index + match[0].length });
    }
  }
  return headings;
}

const structuredDocument = computed(() => {
  const source = livePreviewPreviewMd.value || '';
  const headings = documentSectionHeadings(source);
  if (!headings.length) return { intro: '', sections: [] };
  const intro = source.slice(0, headings[0].index).replace(/^#\s+[^\n]+\n?/, '').trim();
  const sections = headings.map((heading, index) => ({
    index: index + 1,
    title: heading.title.replace(/^[一二三四五六七八九十百\d]+[、.．]\s*/, ''),
    body: source.slice(heading.end, headings[index + 1]?.index ?? source.length).trim(),
  }));
  return { intro, sections };
});
const documentVersion = computed(() => livePreviewPreviewMd.value.match(/版本[：:]\s*(V?[\d.]+(?:[-－]\d+)?)/i)?.[1] || '');
const documentStats = computed(() => {
  if (!selectedDeliverable.value) return [
    { value: currentStage.value, label:'当前阶段', tone:'bg-blue-50 text-blue-700' },
    { value: activeStageObj.value.deliverables.length, label:'计划交付', tone:'bg-emerald-50 text-emerald-700' },
    { value: discussionCount.value, label:'讨论记录', tone:'bg-orange-50 text-orange-700' },
  ];
  const source = livePreviewPreviewMd.value || '';
  const base = [
    { value: structuredDocument.value.sections.length, label: '文档章节', tone: 'bg-blue-50 text-blue-700' },
    { value: readyDeliverableCount.value, label: '已生成', tone: 'bg-emerald-50 text-emerald-700' },
    { value: discussionCount.value, label: '讨论记录', tone: 'bg-orange-50 text-orange-700' },
  ];
  if (deliverableSelected.value !== 'final-req') return base;
  return [
    { value: new Set([...source.matchAll(/^\|\s*(R-\d+)\s*\|/gm)].map((match) => match[1])).size, label: '核心需求', tone: 'bg-blue-50 text-blue-700' },
    { value: new Set([...source.matchAll(/^\|\s*(SC-\d+)\s*\|/gm)].map((match) => match[1])).size, label: '业务场景', tone: 'bg-emerald-50 text-emerald-700' },
    { value: (source.match(/（待签署）/g) || []).length, label: '待确认项', tone: 'bg-orange-50 text-orange-700' },
  ];
});

// 选交付物 → 切选中项 + 刷新右侧预览
async function selectDeliverable(key) {
  if(currentStage.value===2 && ['feature-spec','prd2','prototype'].includes(key)) {
    if(key==='prototype')key='prototype-demo';
    else {openWorkflowFile({file:key==='feature-spec'?'spec.md':'stage2/prd.md',stage:2,name:key==='feature-spec'?'产品原型 Demo · 功能清单':'产品原型 Demo · 配套 PRD'});return;}
  }

  workflowOpen.value=false; workflowFile.value=null;
  if(!await flushDocumentEdits())return;
  deliverableSelected.value = key;
  assistantConversationOpen.value = false;
  const d = deliverablesForStage(currentStage.value).find((x) => x.key === key);
  if (d) showPreview(currentStage.value, d);
  // 切换后确保该交付物的消息数组初始化
  const k = dkey(currentStage.value, key);
  if (!deliverableMsgs.value[k]) deliverableMsgs.value[k] = [];
}

// —— 右侧预览的在线编辑 ——
const previewEditing = ref(false);
const previewDraft = ref('');
const sectionEdit = ref(null);
const sectionDraft = ref('');
const sectionSaving = ref(false),previewSaving=ref(false);
watch(livePreviewContent,async content=>{const seq=++reviewSeq;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content||''));if(seq===reviewSeq)reviewToken.value=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');});
let editContext=null,previewSavePromise=null,sectionSavePromise=null,editTimer=null,sectionTimer=null;
function projectDraftKey(){return 'fde-project-draft:'+props.slug+':'+(editContext?.stageId||currentStage.value)+':'+(editContext?.key||deliverableSelected.value);}
watch(previewDraft,()=>{if(!previewEditing.value)return;try{localStorage.setItem(projectDraftKey(),previewDraft.value);}catch{}clearTimeout(editTimer);editTimer=setTimeout(()=>savePreviewEdit(false),800);});
watch(sectionDraft,()=>{if(!sectionEdit.value)return;try{localStorage.setItem('fde-section-draft:'+props.slug+':'+sectionEdit.value.stageId+':'+sectionEdit.value.key+':'+sectionEdit.value.index,sectionDraft.value);}catch{}clearTimeout(sectionTimer);sectionTimer=setTimeout(()=>saveDocumentSection(false),800);});
async function flushDocumentEdits(){if(researchSpaceRef.value&&!researchSpaceRef.value.beforeLeave())return false;clearTimeout(editTimer);clearTimeout(sectionTimer);if(sectionEdit.value&&!await saveDocumentSection())return false;if(previewEditing.value&&!await savePreviewEdit())return false;return true;}
onBeforeRouteLeave(flushDocumentEdits);
async function setPreviewMode(mode){if(await flushDocumentEdits())livePreviewMode.value=mode;}


watch([currentStage, deliverableSelected, livePreviewMode], () => { sectionEdit.value = null; });

async function editDocumentSection(index) {
  if(!await flushDocumentEdits())return;
  if (isStreaming.value || livePreviewStreaming.value || sectionSaving.value) return;
  const source = livePreviewContent.value || '';
  const headings = documentSectionHeadings(source);
  const heading = headings[index - 1];
  if (!heading) return;
  const start = heading.end;
  const end = headings[index]?.index ?? source.length;
  sectionEdit.value = { index, source, start, end, stageId: currentStage.value, key: deliverableSelected.value };
  sectionDraft.value = source.slice(start, end).trim();
  const recovered=localStorage.getItem('fde-section-draft:'+props.slug+':'+currentStage.value+':'+deliverableSelected.value+':'+index);if(recovered&&window.confirm('恢复本章节的未完成草稿吗？'))sectionDraft.value=recovered;
  nextTick(() => documentReaderRef.value?.querySelector('.section-editor')?.focus({ preventScroll: true }));
}

async function saveDocumentSection(finish=true) {
  if(sectionSavePromise){if(!await sectionSavePromise)return false;return saveDocumentSection(finish);}
  const edit=sectionEdit.value;if(!edit)return true;
  if(isStreaming.value||livePreviewStreaming.value)return false;
  const d=deliverablesForStage(edit.stageId).find(entry=>entry.key===edit.key) || (workflowFile.value?.key===edit.key ? workflowFile.value : null);if(!d)return false;
  const draft=sectionDraft.value,source=edit.source;
  const content=source.slice(0,edit.start)+'\n\n'+draft.trim()+'\n\n'+source.slice(edit.end);
  sectionSaving.value=true;
  sectionSavePromise=(async()=>{try{
    const result=await window.api.hermes.writeFile(props.slug,d.file,content,source);
    if(!result?.success)throw Error(result?.error||'无法保存文档');
    const k=dkey(edit.stageId,edit.key);deliverableContents.value={...deliverableContents.value,[k]:content};deliverablePreviews.value={...deliverablePreviews.value,[k]:await inlineRelativeImages(content,d.file)};
    edit.source=content;edit.end=edit.start+draft.trim().length+4;
    if(currentStage.value===edit.stageId&&deliverableSelected.value===edit.key){livePreviewContent.value=content;livePreviewDocxHtml.value='';}
    if(sectionEdit.value===edit&&sectionDraft.value===draft){localStorage.removeItem('fde-section-draft:'+props.slug+':'+edit.stageId+':'+edit.key+':'+edit.index);if(finish)sectionEdit.value=null;}
    await autoSaveDocx(edit.stageId,edit.key);return true;
  }catch(error){showToast('保存失败，草稿已保留：'+error.message,'error');return false;}
  finally{sectionSaving.value=false;sectionSavePromise=null;}})();
  const success=await sectionSavePromise;if(success&&finish&&sectionEdit.value)return saveDocumentSection(finish);return success;
}

async function togglePreviewEdit() {
  if(sectionEdit.value&&!await saveDocumentSection())return;
  if (previewEditing.value) { await savePreviewEdit(); return; }
  editContext={stageId:currentStage.value,key:deliverableSelected.value,source:livePreviewContent.value||''};
  previewDraft.value = editContext.source;
  const recovered=localStorage.getItem(projectDraftKey());if(recovered&&window.confirm('发现本机未完成草稿，恢复到编辑器吗？'))previewDraft.value=recovered;
  previewEditing.value = true;
}

// 保存编辑：写回 md → 刷新预览 → 重新转存 docx（保持 md 与 Word 一致）
async function savePreviewEdit(finish=true) {
  if(previewSavePromise){if(!await previewSavePromise)return false;return savePreviewEdit(finish);}
  if(!editContext||!previewEditing.value)return true;
  const context=editContext,content=previewDraft.value,d=deliverablesForStage(context.stageId).find(x=>x.key===context.key) || (workflowFile.value?.key===context.key ? workflowFile.value : null);if(!d)return false;
  if(content===context.source){if(finish)previewEditing.value=false;return true;}
  previewSaving.value=true;
  previewSavePromise=(async()=>{try{
    const result=await window.api.hermes.writeFile(props.slug,d.file,content,context.source);if(!result?.success)throw Error(result?.error||'保存失败');
    context.source=content;const k=dkey(context.stageId,context.key);deliverableContents.value={...deliverableContents.value,[k]:content};deliverablePreviews.value={...deliverablePreviews.value,[k]:await inlineRelativeImages(content,d.file)};
    if(editContext===context&&currentStage.value===context.stageId&&deliverableSelected.value===context.key){livePreviewContent.value=content;livePreviewDocxHtml.value='';if(previewDraft.value===content){localStorage.removeItem(projectDraftKey());if(finish)previewEditing.value=false;}}
    await autoSaveDocx(context.stageId,context.key);return true;
  }catch(error){showToast('保存失败，草稿已保留：'+error.message,'error');return false;}
  finally{previewSaving.value=false;previewSavePromise=null;}})();
  const success=await previewSavePromise;if(success&&finish&&previewEditing.value)return savePreviewEdit(finish);return success;
}

// 本阶段是否有可清理的东西（文档或对话），决定工具栏清空按钮是否可用
const stageHasAnyDeliverable = computed(() =>
  deliverablesForStage(currentStage.value).some((d) => hasDeliverableData(currentStage.value, d.key))
);

// 清空当前阶段全部交付物：逐件复用单件删除的同一套清理逻辑（文档 + 对话 + 内存态）
async function deleteStageDeliverables() {
  const stageId = currentStage.value;
  const targets = deliverablesForStage(stageId).filter((d) => hasDeliverableData(stageId, d.key));
  if (!targets.length) return;

  const docCount = targets.filter((d) => deliverableState(stageId, d.key) === 'ready').length;
  const parts = [`${targets.length} 件交付物的对话记录`];
  if (docCount) parts.push(`${docCount} 份已生成文档（md / Word）`);
  if (!window.confirm(`清空阶段${stageId}的全部交付物？\n将删除 ${parts.join(' 和 ')}。\n此操作不可恢复。`)) return;

  const failed = [];
  for (const d of targets) {
    const ok = await removeDeliverable(stageId, d.key);
    if (!ok) failed.push(d.short || d.name);
  }
  if (failed.length) showToast(`部分未删除：${failed.join('、')}`, 'error');
  else showToast(`已清空阶段${stageId}的交付物`, 'success');
}

// 侧栏是否给这件交付物显示删除按钮：有对话记录或已生成文档就给。
// 只看对话记录会漏掉「文档已生成但记录被清过」的情况，那时用户就没有清理入口了。
function hasDeliverableData(stageId, key) {
  return (deliverableMsgs.value[dkey(stageId, key)] || []).length > 0
    || deliverableState(stageId, key) === 'ready';
}

// 真正执行删除：对话记录 + 生成的文档（md / docx）+ 内存态。
// 单件删除和「清空本阶段」共用这一份，避免两处逻辑各写各的而走岔。
// 返回是否全部成功（调用方决定怎么提示）。
async function removeDeliverable(stageId, key) {
  const d = deliverablesForStage(stageId).find((x) => x.key === key);
  if (!d) return false;
  const k = dkey(stageId, key);
  const hasDoc = deliverableState(stageId, key) === 'ready';
  let ok = true;

  try {
    await window.api.hermes.deleteMessages(props.slug, `deliverable:${key}`);
    deliverableMsgs.value = { ...deliverableMsgs.value, [k]: [] };
  } catch (e) {
    console.warn('[ProjectDetail] deleteMessages failed:', e);
    ok = false;
  }

  if (hasDoc) {
    // md 和同名 docx 一起删；docx 可能不存在，主进程按幂等处理
    for (const rel of [d.file, d.file.replace(/\.md$/i, '') + '.docx']) {
      try {
        const r = await window.api.hermes.deleteFile(props.slug, rel);
        if (r && !r.success) { console.warn('[ProjectDetail] deleteFile failed:', rel, r.error); ok = false; }
      } catch (e) {
        console.warn('[ProjectDetail] deleteFile threw:', rel, e);
        ok = false;
      }
    }
    // 内存态同步清掉，状态点才会回到「未生成」
    const nextContents = { ...deliverableContents.value };
    const nextPreviews = { ...deliverablePreviews.value };
    delete nextContents[k];
    delete nextPreviews[k];
    deliverableContents.value = nextContents;
    deliverablePreviews.value = nextPreviews;
    // 删的正是当前预览的那份 → 清空右侧面板
    if (stageId === currentStage.value && deliverableSelected.value === key) {
      livePreviewContent.value = '';
      livePreviewDocxHtml.value = '';
      livePreviewMode.value = 'md';
      previewEditing.value = false;
    }
  }
  return ok;
}

// 删除单件交付物（侧栏行内垃圾桶）：确认 → 复用 removeDeliverable
async function clearDeliverableChat(key, stageId = currentStage.value) {
  const d = deliverablesForStage(stageId).find((x) => x.key === key);
  if (!d) return;
  const k = dkey(stageId, key);
  const rounds = (deliverableMsgs.value[k] || []).filter((m) => m.role === 'user').length;
  const hasDoc = deliverableState(stageId, key) === 'ready';
  const parts = [];
  if (rounds) parts.push(`${rounds} 轮对话记录`);
  if (hasDoc) parts.push('已生成的文档（md / Word）');
  if (!parts.length) return;
  if (!window.confirm(`删除《${d.name}》的${parts.join(' 和 ')}？\n此操作不可恢复。`)) return;

  if (await removeDeliverable(stageId, key)) showToast(`已删除《${d.name}》`, 'success');
  else showToast(`《${d.name}》部分内容删除失败`, 'error');
}

// 切到 Word 成品视图（只读 HTML 快照，无快照时按钮禁用）
// 确保当前交付物的 .docx 已生成：没有就现场转一份。
// 走 hermes:md-to-docx（本地直接跑 md-export 脚本），不再绕 AI 对话——
// 之前依赖 /md-export prompt，慢且失败后静默，按钮就永久点不动。
async function ensureDocx() {
  if (livePreviewDocxHtml.value) return true;
  const stageId = currentStage.value;
  const key = deliverableSelected.value;
  const d = deliverablesForStage(stageId).find((x) => x.key === key);
  if (!d) return false;
  const docxRel = d.file.replace(/\.md$/i, '') + '.docx';
  docxBusy.value = true;
  try {
    // 1) 磁盘上可能已经有（之前生成过，只是本次没读到）
    let rv = await window.api.hermes.docxPreview(props.slug, docxRel);
    if (rv && rv.success && rv.html) {
      livePreviewDocxHtml.value = rv.html;
      return true;
    }
    // 2) 没有就现场转换
    showToast('正在生成 Word…', 'info');
    const conv = await window.api.hermes.mdToDocx(props.slug, d.file);
    if (!conv || !conv.success) {
      showToast(`Word 生成失败：${(conv && conv.error) || '未知错误'}`, 'error');
      return false;
    }
    rv = await window.api.hermes.docxPreview(props.slug, docxRel);
    if (rv && rv.success && rv.html) {
      livePreviewDocxHtml.value = rv.html;
      showToast('Word 已生成', 'success');
      return true;
    }
    showToast(`Word 预览失败：${(rv && rv.error) || '未知错误'}`, 'error');
    return false;
  } catch (e) {
    showToast(`Word 生成失败：${e.message || e}`, 'error');
    return false;
  } finally {
    docxBusy.value = false;
  }
}

async function switchToDocxView() {
  if(!await flushDocumentEdits())return;
  if (await ensureDocx()) livePreviewMode.value = 'docx';
}

// 用系统默认程序打开该交付物的 .docx（没有就先生成）
async function openDeliverableDocx() {
  if(!await flushDocumentEdits())return;
  if (!livePreviewFile.value) return;
  if (!(await ensureDocx())) return;
  try {
    await window.api.hermes.openInBrowser(props.slug, docxRelPath.value);
  } catch (e) {
    showToast(`打开失败：${e.message || e}`, 'error');
  }
}

// 一轮生成结束：读回全部交付物 → 刷新当前预览 → 自动转存 docx
async function finishLivePreview(stageId) {
  await loadDeliverablesForStage(stageId);
  const key = deliverableSelected.value;
  const d = deliverablesForStage(stageId).find((x) => x.key === key);
  if (d) {
    showPreview(stageId, d);
    await autoSaveDocx(stageId, key);
  }
  livePreviewStreaming.value = false;
}

// —— 文档预览辅助：渲染选中交付物 ——

const dkey = (stageId, key) => `${stageId}:${key}`;

// 把交付物 md 里的相对图片路径转成 data URI（Electron renderer 无法按项目目录解析相对路径）。
// 相对路径以该 md 文件所在目录为基准解析；data:/http(s): 等绝对地址原样保留。
// 只用于「预览」渲染，不写回磁盘，保持 md 里干净的相对路径。
const inlineRelativeImages = async (md, mdRelPath) => {
  if (!md || !/!\[[^\]]*\]\(/.test(md)) return md;
  const baseDir = mdRelPath.includes('/') ? mdRelPath.slice(0, mdRelPath.lastIndexOf('/')) : '';
  const imgRe = /(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g;
  const tasks = [];
  md.replace(imgRe, (m, _pre, src) => {
    if (!/^(data:|https?:|file:|\/\/)/i.test(src) && !tasks.some((t) => t.src === src)) {
      const rel = (baseDir ? baseDir + '/' : '') + src;
      tasks.push({ src, promise: window.api.hermes.readFileDataUri(props.slug, rel) });
    }
    return m;
  });
  if (!tasks.length) return md;
  const uriBySrc = {};
  await Promise.all(
    tasks.map(async (t) => {
      try {
        const r = await t.promise;
        if (r && r.success && r.dataUri) uriBySrc[t.src] = r.dataUri;
      } catch (_) { /* 图片缺失：保留原路径 */ }
    })
  );
  return md.replace(imgRe, (m, pre, src, title, post) =>
    uriBySrc[src] ? `${pre}${uriBySrc[src]}${title || ''}${post}` : m
  );
};

// 读取某份交付物文件到 deliverableContents（原文，供编辑/导出/保存），
// 同时生成一份图片内联版本供预览渲染。
const loadDeliverable = async (stageId, d) => {
  if(d.kind==='prototype-package'){const results=await Promise.all(d.files.map(file=>window.api.hermes.readFile(props.slug,file)));prototypePackageReady.value=results.every(result=>result?.success&&String(result.content||'').trim());}
  try {
    const result = await window.api.hermes.readFile(props.slug, d.file);
    if (result && result.success && result.content) {
      const k = dkey(stageId, d.key);
      deliverableContents.value = { ...deliverableContents.value, [k]: result.content };
      const preview = await inlineRelativeImages(result.content, d.file);
      deliverablePreviews.value = { ...deliverablePreviews.value, [k]: preview };
    }
  } catch (e) { /* 未生成，忽略 */ }
};

const loadDeliverablesForStage = async (stageId) => {
  for (const d of deliverablesForStage(stageId)) {
    await loadDeliverable(stageId, d);
  }
  // 读回内容后同步刷新右侧预览：否则首次进入/切阶段时右侧停在骨架屏
  // （之前只有手工点击交付物才会走 showPreview）
  if (stageId === currentStage.value) {
    const d = deliverablesForStage(stageId).find((x) => x.key === deliverableSelected.value);
    if (d) await showPreview(stageId, d);
  }
};

const loadAllDeliverableMsgs = async (stageId) => {
  // messages.jsonl 里按 tab 字段过滤出每件交付物的消息
  // 已由 loadProject 加载到 allMessages，这里按 tab key 分拣
  // （若未来需要懒加载可再改；目前项目消息量小，全量分拣可行）
};

// 阶段一直接收集资料；完成按钮记录用户确认并沿顺序进入阶段二。
const researchSpaceRef=ref(null),researchSources=ref(null),researchFormBusy=ref(false),researchContinuing=ref(false),researchContinueError=ref('');
function updateResearchSources(files){researchSources.value=files;generationSources.value=files?.length??null;researchContinueError.value='';}
async function finishResearchPreparation(){
  if(researchContinuing.value||researchFormBusy.value||!await flushDocumentEdits())return;
  researchContinuing.value=true;researchContinueError.value='';
  try{
    const sources=await listProjectKnowledge(props.slug);updateResearchSources(sources);
    if(!sources.length)throw Error('请先上传资料或保存一份对接记录。');
    const confirmedAt=new Date().toISOString();
    await storeMeta({researchPreparation:{state:'ready',sources:sources.map(f=>({path:f.path,name:f.name})),confirmedAt},stageReviews:{...projectMeta.value?.stageReviews,1:{kind:'stage',state:'confirmed',reviewer:'当前资料整理人',evidence:'在阶段一确认项目资料准备完成：'+sources.map(f=>f.name).join('、'),checks:[{title:'项目资料已放入，并确认用于后续需求沟通',confirmed:true}],updatedAt:confirmedAt}}});
    if(progressStage.value===1)await advanceStage();else await viewStage(2);
    if(currentStage.value===1)throw Error('阶段切换未完成，请检查提示后重试。');
  }catch(e){researchContinueError.value=e.message||'进入需求沟通失败，请重试。';}
  finally{researchContinuing.value=false;}
}

// 页面提示与生成入口共用同一份项目依据判断。
const generationSources=ref(null),generationSourceError=ref('');let generationSourceSeq=0;
const generationHasRequirement=computed(()=>{const value=String(projectMeta.value?.requirement||'').trim();return !!value&&value!==projectName.value&&value!==props.slug;});
const generationHasDiscussion=computed(()=>[...messages.value,...stage3Messages.value,...Object.values(deliverableMsgs.value).flat()].some(m=>m.role==='user'&&String(m.content||'').trim().length>30&&!/^请生成《/.test(m.content||'')));
const generationContextReady=computed(()=>generationSources.value!==null&&!generationSourceError.value&&(generationSources.value>0||generationHasRequirement.value||generationHasDiscussion.value));
const nextWorkflowDeliverable=computed(()=>{const items=activeDeliverables.value,index=items.findIndex(d=>d.key===deliverableSelected.value);return items.slice(index+1).find(d=>projectMeta.value?.deliverableReviews?.[d.file]?.state!=='confirmed')||items.slice(0,index).find(d=>projectMeta.value?.deliverableReviews?.[d.file]?.state!=='confirmed')||null;});
const generationStageReviewed=computed(()=>projectMeta.value?.stageReviews?.[progressStage.value]?.state==='confirmed'&&progressStage.value<5);
async function continueDeliverableWorkflow(){if(nextWorkflowDeliverable.value)return selectGroupDeliverable(currentStage.value,nextWorkflowDeliverable.value.key);if(currentStage.value!==progressStage.value)return;if(generationStageReviewed.value)return advanceStage();return openAssessment('stage');}
const deliverableOrder=computed(()=>{const index=activeDeliverables.value.findIndex(d=>d.key===deliverableSelected.value);return index<0?0:index+1;});
async function refreshGenerationSources(){const seq=++generationSourceSeq;generationSources.value=null;generationSourceError.value='';try{const sources=await listProjectKnowledge(props.slug);if(seq===generationSourceSeq)generationSources.value=sources.length;}catch(e){if(seq===generationSourceSeq)generationSourceError.value='项目资料暂时无法读取，请重试。';}}
watch(()=>props.slug,refreshGenerationSources,{immediate:true});
watch(activeTab,tab=>{documentMenuOpen.value=false;if(tab==='workspace')refreshGenerationSources();});
watch(deliverableSelected,()=>{documentMenuOpen.value=false;});

// 生成某份交付物：读模板(md/html)或走 skill → 拼 prompt → AI 真跑 write_file → 读回
const generateDeliverable = async (key) => {
  if (isStreaming.value || deliverableBusy.value) return;
  try {
    const sources = await listProjectKnowledge(props.slug);
    generationSources.value=sources.length;generationSourceError.value='';
    if (!sources.length && !generationHasRequirement.value && !generationHasDiscussion.value) {
      activeTab.value = 'knowledge';
      showToast('请先导入客户资料、录入沟通记录，或补充具体需求后再生成', 'info');
      return;
    }
  } catch (e) {
    showToast(`项目资料读取失败：${e.message || e}`, 'error');
    return;
  }
  if (isStreaming.value || deliverableBusy.value) return;
  const stageId = currentStage.value;
  const d = deliverablesForStage(stageId).find((x) => x.key === key);
  if (!d) return;
  let stage2Context='', method='';
  try {
    if(stageId===2) stage2Context=await stage2GenerationContext(window.api,key);
    else method=await deliverySkillContext(window.api,d.skill);
  } catch(error) { showToast(error.message,'error'); return; }

  deliverableSelected.value = key;
  discussionStore.useDefault();
  assistantPanelTab.value = 'assistant'; assistantConversationOpen.value = true;
  deliverableBusy.value = true;
  deliverableBusyKey.value = key;

  // 生成留痕：写进「该交付物」的独立对话线（早先误写进全局 messages/stage3Messages，
  // 导致不同交付物、以及和「AI 智能对话」页的记录互相串台）
  const mk = dkey(stageId, key);
  if (!deliverableMsgs.value[mk]) deliverableMsgs.value[mk] = [];
  const chatArr = deliverableMsgs.value[mk];
  const tab = `deliverable:${key}`;
  beginStream(chatArr, tab);
  const userMsg = `请生成《${d.name}》`;
  chatArr.push(createMessage('user', userMsg));
  window.api.hermes.saveMessage(props.slug, { role: 'user', content: userMsg, tab, timestamp: new Date().toISOString() });
  chatArr.push(createMessage('assistant', '', {
    thinkingSteps: [{ text: `正在生成《${d.name}》...`, icon: 'fa-solid fa-wand-magic-sparkles', visible: true }],
    thinkingDone: false, expanded: true, typingContent: '', timestamp: '', streamId: currentStreamId,
  }));

  const reqName = projectMeta.value?.name || props.slug;
  // md 文件所在目录（根目录交付物为空串），供画图指令定位 assets/
  const mdDir = d.file.includes('/') ? d.file.slice(0, d.file.lastIndexOf('/') + 1) : '';
  const diagramPart = DIAGRAM_KEYS.includes(d.key) ? diagramInstruction(mdDir) : '';
  let prompt = '';

  if(stageId===2) {
    prompt = `【阶段二交付】基于本项目“${reqName}”的真实材料生成《${d.name}》。保留已有人工修订并归档旧版。`+stage2Context;
  } else if (d.skill) {
    // 走现成 skill（如 product-feature-spec），不塞模板
    prompt = `/${d.skill} 根据本项目"${reqName}"之前的需求对话上下文，生成《${d.name}》。\n\n`
      + `【重要】把生成的完整内容用 write_file 工具写入当前项目目录下的 \`${d.file}\` 文件（Markdown 格式）。`
      + diagramPart + method;
  } else {
    // 读手册模板（md 优先，否则 html 当结构参考）
    let tplText = '';
    try {
      if (d.tpl) {
        const t = await window.api.handbook.readMd(d.tpl.stage, d.tpl.md);
        if (t && t.success) tplText = t.content || '';
      } else if (d.tplHtml) {
        const t = await window.api.handbook.readHtml(d.tplHtml.stage, d.tplHtml.html);
        if (t && t.success) tplText = t.content || '';
      }
    } catch (e) { tplText = ''; }

    prompt = `【阶段${stageId} 交付物生成】基于本项目"${reqName}"之前的需求对话上下文，生成《${d.name}》。\n\n`
      + (tplText
        ? `严格参照以下 FDE 手册模板的结构与字段（这是标准格式，不要照抄示例内容，要结合本项目实际填写）：\n\n----- 模板开始 -----\n${tplText.slice(0, 6000)}\n----- 模板结束 -----\n\n`
        : `请按该交付物的行业标准结构组织内容。\n\n`)
      + `【重要】把生成的完整内容用 write_file 工具写入当前项目目录下的 \`${d.file}\` 文件（Markdown 格式，若目录不存在请一并创建）。`
      + diagramPart;
  }

  try {
    const p = projectPrompt(prompt);
    trackPrompt(props.slug, { tab: `deliverable:${key}` }, p);
    const generationResult=await p;
    if(generationResult?.success===false || generationResult?.stopReason==='cancelled')throw Error(generationResult?.error||'生成已停止');
    if(stageId===2)await verifyStage2Files(window.api,props.slug,key);
    // 兜底：agent_message_end 已在事件处理里调 endStream，这里再调一次也是幂等的
    endStream();
    deliverableBusy.value = false;
    deliverableBusyKey.value = '';
    await finishLivePreview(stageId);
  } catch (e) {
    console.error('Generate deliverable failed:', e);
    showToast(e.message || '交付物生成失败，已有内容已保留','error');
    endStream();
    deliverableBusy.value = false;
    deliverableBusyKey.value = '';
    livePreviewStreaming.value = false;
  }
};

// —— 对话顶部「快捷操作」：按阶段动态。每件交付物一个生成按钮 + 一个「生成原型」——
const quickActions = computed(() => {
  const acts = activeDeliverables.value.map((d) => ({
    key: d.key, label: `生成${d.short}`, icon: d.icon, kind: 'deliverable',
  }));
  if (currentStage.value !== 2) acts.push({ key: '__proto__gen', label: '生成原型', icon: 'fa-solid fa-wand-magic-sparkles', kind: 'prototype' });
  return acts;
});

const runQuickAction = (act) => {
  if (isStreaming.value || deliverableBusy.value) return;
  if (act.kind === 'prototype') {
    activeTab.value = 'prototype';
    generatePrototype();
  } else {
    // 工作台内就地生成：切右侧预览到这件交付物，不再跳 tab
    activeTab.value = 'workspace';
    selectDeliverable(act.key);
    generateDeliverable(act.key);
  }
};

const saveDeliverable = async (key) => {
  const stageId = currentStage.value;
  const d = deliverablesForStage(stageId).find((x) => x.key === key);
  if (!d) return;
  try {
    const raw = deliverableContents.value[dkey(stageId, key)] || '';
    await window.api.hermes.writeFile(props.slug, d.file, raw);
    // 刷新预览：编辑后可能新增/改动图片引用，重新内联相对图片
    const preview = await inlineRelativeImages(raw, d.file);
    deliverablePreviews.value = { ...deliverablePreviews.value, [dkey(stageId, key)]: preview };
    deliverableEditing.value = false;
  } catch (e) { console.error('Save deliverable failed:', e); }
};

const updateDeliverableContent = (val) => {
  deliverableContents.value = { ...deliverableContents.value, [dkey(currentStage.value, deliverableSelected.value)]: val };
};

const exportDeliverableMd = async (key) => {
  const stageId = currentStage.value;
  const d = deliverablesForStage(stageId).find((x) => x.key === key);
  const content = d && deliverableContents.value[dkey(stageId, key)];
  if (!d || !content) return;
  try {
    await window.api.hermes.writeFile(props.slug, d.file, content);
    await window.api.hermes.openInBrowser(props.slug, d.file);
  } catch (e) { console.error('Export deliverable md failed:', e); }
};

// 中文输入法选词时的回车 isComposing 为 true，不能当发送——否则选个词就把半句发出去。
const onIterateEnter = (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  sendIterate();
};

const cancelStream = async () => {
  try {
    await window.api.hermes.cancel(props.slug);
  } catch (e) {
    console.error('Cancel failed:', e);
  }
  endStream();
  deliverableBusy.value = false;
  deliverableBusyKey.value = '';
  livePreviewStreaming.value = false;
  streamTargetTab.value = '';
};

const scrollToBottom = () => {
  nextTick(() => {
    if ((activeTab.value === 'iterate' || (activeTab.value === 'prototype' && streamTargetTab.value === 'iterate')) && iterateChatRef.value) {
      iterateChatRef.value.scrollTop = iterateChatRef.value.scrollHeight;
    } else if (chatContainerRef.value) {
      // 工作台左栏（阶段②③共用同一个容器）
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
    }
  });
};

// --- Spec functions ---
const loadSpec = async () => {
  specLoading.value = true;
  try {
    const result = await window.api.hermes.readFile(props.slug, 'spec.md');
    if (result && result.success && result.content) {
      specContent.value = result.content;
    } else {
      specContent.value = '';
    }
  } catch (e) {
    specContent.value = '';
  } finally {
    specLoading.value = false;
  }
};

const toggleSpecEdit = () => {
  specEditing.value = !specEditing.value;
};

const generateSpec = async () => {
  isStreaming.value = true;
  activeTab.value = 'workspace';
  const requirement = projectMeta.value?.requirement || projectMeta.value?.name || '这个产品';
  messages.value.push(createMessage('user', '请根据我们之前的讨论，生成完整的产品功能清单'));
  messages.value.push(createMessage('assistant', '', {
    thinkingSteps: [
      { text: '正在生成功能清单...', icon: 'fa-solid fa-list-check', visible: true },
    ],
    thinkingDone: false,
    expanded: true,
    typingContent: '',
    timestamp: '',
  }));
  scrollToBottom();

  try {
    await projectPrompt(`/product-feature-spec 根据之前的对话讨论，为"${requirement}"生成完整的产品功能清单。\n\n【重要】请将生成的功能清单用 write_file 工具写入当前目录的 spec.md 文件中。` + diagramInstruction(''));
    finalizeLastAssistantMessage();
    isStreaming.value = false;
    loadSpec();
    selectDeliverable('feature-spec');
  } catch (e) {
    console.error('Generate spec failed:', e);
    isStreaming.value = false;
  }
};

const saveSpec = async () => {
  try {
    await window.api.hermes.writeFile(props.slug, 'spec.md', specContent.value);
    specEditing.value = false;
  } catch (e) {
    console.error('Failed to save spec:', e);
  }
};

const exportSpec = async () => {
  if (!specContent.value) {
    await loadSpec();
  }
  if (specContent.value) {
    try {
      await window.api.hermes.writeFile(props.slug, 'spec.md', specContent.value);
      await window.api.hermes.openInBrowser(props.slug, 'spec.md');
    } catch (e) {
      console.error('Export spec failed:', e);
    }
  }
};

const exportWord = async () => {
  if (!specContent.value) {
    await loadSpec();
  }
  if (specContent.value) {
    try {
      await window.api.hermes.writeFile(props.slug, 'spec.md', specContent.value);
      await window.api.hermes.exportWord(props.slug);
    } catch (e) {
      console.error('Export word failed:', e);
    }
  }
};

// --- Prototype functions ---
const refreshPrototypeFiles = async () => {
  await refreshStagePrototypes();
  try {
    const result = await window.api.hermes.listFiles(props.slug, 'prototype', true);
    const files = (result && result.success) ? (result.files || []) : (Array.isArray(result) ? result : []);
    // 展示全部产物（html / js / json / data 等）。排序与目录分组交给 fileTreeRows。
    const kept = files
      .filter(f => !f.isDirectory)
      .map(f => ({ ...f, rel: f.relPath || f.name }));
    prototypeFiles.value = kept;
    // 默认折叠所有文件夹：收集每个文件路径里出现的目录前缀
    const dirs = new Set();
    for (const f of kept) {
      const parts = f.rel.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        dirs.add(parts.slice(0, i + 1).join('/'));
      }
    }
    collapsedDirs.value = dirs;
    if (kept.length > 0 && !selectedFile.value) {
      // 默认选顶层第一个 html，没有则选第一个文件
      const firstHtml = kept.find(f => /\.html?$/i.test(f.rel) && !f.rel.includes('/'))
        || kept.find(f => /\.html?$/i.test(f.rel));
      selectPrototypeFile((firstHtml || kept[0]).rel);
    }
  } catch (e) {
    prototypeFiles.value = [];
  }
};

const selectPrototypeFile = async (fileName) => {
  selectedFile.value = fileName;
  fileSource.value = '';
  const isHtml = /\.html?$/i.test(fileName);
  isHtmlSelected.value = isHtml;
  try {
    if (isHtml) {
      // HTML 走本地静态服务在 iframe 内渲染（data/*.json 等可正常加载）
      const result = await window.api.hermes.prototypeUrl(props.slug, fileName);
      if (result && result.success) {
        iframeSrc.value = result.url;
      } else {
        const res = await window.api.hermes.readFile(props.slug, `prototype/${fileName}`);
        const blob = new Blob([res?.content ?? ''], { type: 'text/html' });
        iframeSrc.value = URL.createObjectURL(blob);
      }
      iframeKey.value++;
    } else {
      // 非 HTML（js / json / css / 数据文件）直接展示源码。
      // read-file 返回 { success, content }，直接 String(res) 会渲染成 [object Object]
      const res = await window.api.hermes.readFile(props.slug, `prototype/${fileName}`);
      if (res && res.success) fileSource.value = String(res.content ?? '');
      else fileSource.value = `读取失败：${(res && res.error) || '未知错误'}`;
    }
  } catch (e) {
    console.error('Failed to load prototype file:', e);
    fileSource.value = `读取失败：${e.message || e}`;
  }
};

// 删除原型里的文件 / 文件夹。fileTreeRows 的路径都相对 prototype 目录，
// 落到磁盘要补 prototype/ 前缀（与 selectPrototypeFile 的读取路径保持一致）。
const deletePrototypeEntry = async (row) => {
  if (!row) return;
  const isDir = row.type === 'dir';
  const rel = isDir ? row.path : row.rel;
  if (!rel) return;

  let tip;
  if (isDir) {
    const inside = prototypeFiles.value.filter((f) => String(f.rel || f.name).startsWith(`${rel}/`)).length;
    tip = `删除文件夹《${row.name}》及其中 ${inside} 个文件？`;
  } else {
    tip = `删除《${row.base}》？`;
  }
  if (!window.confirm(`${tip}\n此操作不可恢复。`)) return;

  try {
    const r = await window.api.hermes.deleteFile(props.slug, `prototype/${rel}`, isDir);
    if (!r || !r.success) {
      showToast(`删除失败：${(r && r.error) || '未知错误'}`, 'error');
      return;
    }
    // 删掉的正是当前预览的文件（或它所在的目录）→ 清空预览
    const selected = selectedFile.value;
    if (selected && (selected === rel || (isDir && selected.startsWith(`${rel}/`)))) {
      selectedFile.value = '';
      fileSource.value = '';
      iframeSrc.value = '';
      isHtmlSelected.value = false;
    }
    await refreshPrototypeFiles();
    showToast(isDir ? `已删除文件夹《${row.name}》` : `已删除《${row.base}》`, 'success');
  } catch (e) {
    showToast(`删除失败：${e.message || e}`, 'error');
  }
};

// 清空整个原型：删掉 prototype 目录下所有内容。
// 走目录递归删除，比逐个文件删可靠（子目录、空目录都能清掉）。
const deleteAllPrototype = async () => {
  const count = prototypeFiles.value.length;
  if (!count) return;
  if (!window.confirm(`删除全部原型文件？\n共 ${count} 个文件，包含所有页面、脚本和数据。\n此操作不可恢复，之后可用「重新生成」重建。`)) return;

  try {
    const r = await window.api.hermes.deleteFile(props.slug, 'prototype', true);
    if (!r || !r.success) {
      showToast(`清空失败：${(r && r.error) || '未知错误'}`, 'error');
      return;
    }
    selectedFile.value = '';
    fileSource.value = '';
    iframeSrc.value = '';
    isHtmlSelected.value = false;
    await refreshPrototypeFiles();
    showToast(`已清空原型（${count} 个文件）`, 'success');
  } catch (e) {
    showToast(`清空失败：${e.message || e}`, 'error');
  }
};

const openInBrowser = async () => {
  // 走本地静态服务而非 file://，否则原型页 fetch('data/*.json') 会被浏览器拦截、数据空白
  try {
    const file = selectedFile.value || (prototypeFiles.value[0]?.name);
    if (!file) return;
    const result = await window.api.hermes.prototypeUrl(props.slug, file);
    if (result && result.success) {
      await window.api.shell.openExternal(result.url);
    } else {
      // 本地服务不可用时退回 file://
      await window.api.hermes.openInBrowser(props.slug, `prototype/${file}`);
    }
  } catch (e) {
    console.error('Open in browser failed:', e);
  }
};

// 发布本地服务：把本地 http 服务指向本项目原型目录，并用默认浏览器打开
const publishLocal = async () => {
  try {
    const file = selectedFile.value || (prototypeFiles.value[0]?.name) || 'index.html';
    const result = await window.api.hermes.prototypeUrl(props.slug, file);
    if (result && result.success) {
      await window.api.shell.openExternal(result.url);
      showToast(`已发布并在浏览器打开：${result.url}`, 'success');
    } else {
      showToast(`发布失败：${(result && result.error) || '未知错误'}`, 'error');
      console.error('Publish local failed:', result && result.error);
    }
  } catch (e) {
    showToast(`发布失败：${e.message || e}`, 'error');
    console.error('Publish local failed:', e);
  }
};

const generatePrototype = async () => {
  if (isStreaming.value) return;
  if (currentStage.value === 2) { activeTab.value = 'workspace'; await selectDeliverable('prototype-demo'); return generateDeliverable('prototype-demo'); }
  activeTab.value = 'prototype';
  streamTargetTab.value = 'iterate';           // 生成过程的流归到 iterate 消息数组，供原型页进度面板展示
  iterateMessages.value.push(createMessage('user', '基于已确认需求、AI 能力清单与现有 PRD（如有） 生成 HTML 原型'));
  beginStream(iterateMessages.value, 'iterate');
  iterateMessages.value.push(createMessage('assistant', '', {
    thinkingSteps: [
      { text: '正在准备生成原型...', icon: 'fa-solid fa-wand-magic-sparkles', visible: true },
    ],
    thinkingDone: false,
    expanded: true,
    typingContent: '',
    timestamp: '',
    streamId: currentStreamId,
  }));
  scrollToBottom();
  try {
    const p = projectPrompt('/prototype-generator 基于当前项目已确认需求、AI 能力清单与现有 PRD（如有） 生成 HTML 原型，输出到 prototype/ 目录');
    trackPrompt(props.slug, { tab: 'iterate' }, p);
    await p;
  } catch (e) {
    console.error('Generate prototype failed:', e);
  }
  endStream();
  iframeKey.value++;
  refreshPrototypeFiles();
  streamTargetTab.value = '';
};

const regeneratePrototype = async () => {
  if (isStreaming.value) return;
  if (currentStage.value === 2) { activeTab.value = 'workspace'; await selectDeliverable('prototype-demo'); return generateDeliverable('prototype-demo'); }
  activeTab.value = 'prototype';
  streamTargetTab.value = 'iterate';
  iterateMessages.value.push(createMessage('user', '基于已确认需求、AI 能力清单与现有 PRD（如有） 重新生成 HTML 原型'));
  beginStream(iterateMessages.value, 'iterate');
  iterateMessages.value.push(createMessage('assistant', '', {
    thinkingSteps: [
      { text: '正在准备重新生成原型...', icon: 'fa-solid fa-wand-magic-sparkles', visible: true },
    ],
    thinkingDone: false,
    expanded: true,
    typingContent: '',
    timestamp: '',
    streamId: currentStreamId,
  }));
  scrollToBottom();
  try {
    const p = projectPrompt('/prototype-generator 基于当前项目已确认需求、AI 能力清单与现有 PRD（如有） 重新生成 HTML 原型，输出到 prototype/ 目录');
    trackPrompt(props.slug, { tab: 'iterate' }, p);
    await p;
  } catch (e) {
    console.error('Regenerate prototype failed:', e);
  }
  endStream();
  iframeKey.value++;
  refreshPrototypeFiles();
  streamTargetTab.value = '';
};

// --- Export functions ---
const exportZip = async () => {
  try {
    const result = await window.api.hermes.exportZip(props.slug);
    if (result && result.success) {
      showToast(`已导出：${result.path}`, 'success');
    } else if (result && result.canceled) {
      // 用户取消，不提示
    } else {
      showToast(`导出失败：${(result && result.error) || '未知错误'}`, 'error');
    }
  } catch (e) {
    showToast(`导出失败：${e.message || e}`, 'error');
    console.error('Export zip failed:', e);
  }
};

// --- Lifecycle ---
onMounted(async () => {
  loadLinkedConversations();
  window.addEventListener('keydown', handleDocumentReaderKeydown, true);
  loadModels();
  await loadProject();

  // 依据恢复后的当前阶段，把 activeTab 设为该阶段第一个 tab
  const stageTabs = tabsForStage(currentStage.value);
  if (!stageTabs.some(t => t.key === activeTab.value)) {
    activeTab.value = stageTabs[0]?.key || 'workspace';
  }

  // Set initial tab from query
  const queryTab = route.query.tab;
  if (queryTab && (queryTab === 'knowledge' || tabs.value.some(t => t.key === queryTab))) {
    activeTab.value = queryTab;
  }

  // Subscribe to session updates
  if (window.api && window.api.hermes && window.api.hermes.onSessionUpdate) {
    unsubscribe = window.api.hermes.onSessionUpdate(handleSessionUpdate);
  }

  // Load spec
  loadSpec();

  // 交付物：初始化当前阶段选中项 + 读回已生成的交付物
  const requestedStage = Number(route.query.stage);
  const requestedDeliverable = String(route.query.deliverable || '');
  if (requestedDeliverable && Number.isInteger(requestedStage) && requestedStage >= 1 && requestedStage <= progressStage.value && deliverablesForStage(requestedStage).some(d => d.key === requestedDeliverable)) {
    currentStage.value = requestedStage;
    activeTab.value = 'workspace';
    workflowOpen.value=false;
    deliverableSelected.value = requestedDeliverable;
  }
  const firstDeliv = deliverablesForStage(currentStage.value)[0];
  if(workflowOpen.value && currentStage.value<=3) { deliverableSelected.value=''; assistantConversationOpen.value=true; }
  else if (firstDeliv && !deliverableSelected.value) deliverableSelected.value = firstDeliv.key;
  loadDeliverablesForStage(currentStage.value);
  // 加载每件交付物的独立对话记录
  loadAllDeliverableMsgs(currentStage.value);
  await discussionStore.restore();
  if (workflowOpen.value) discussionStore.useDefault();
  if (activeDlvMsgs.value.length) assistantConversationOpen.value = true;

  const inflight = getInflightPrompt(props.slug);
  if (inflight) resumeInflight(inflight);

  // Load prototype files
  refreshPrototypeFiles();

  // Auto-start if flagged
  if (route.query.autostart === 'true' && projectMeta.value) {
    const requirement = projectMeta.value.requirement || projectMeta.value.name || '';
    if (requirement) {
      messages.value.push(createMessage('user', requirement));
      isStreaming.value = true;

      // Pre-create assistant message
      messages.value.push(createMessage('assistant', '', {
        thinkingSteps: [
          { text: '已发送请求，等待 AI 响应...', icon: 'fa-solid fa-cloud-arrow-up', visible: true },
        ],
        thinkingDone: false,
        expanded: true,
        typingContent: '',
        timestamp: '',
      }));

      try {
        await projectPrompt(`/brainstorming ${requirement}`);
      } catch (e) {
        console.error('Auto-start prompt failed:', e);
        isStreaming.value = false;
      }
    }
  }
});

onUnmounted(() => {
  generationSourceSeq++;
  clearTimeout(editTimer);clearTimeout(sectionTimer);
  window.removeEventListener('keydown', handleDocumentReaderKeydown, true);
  if (unsubscribe) {
    unsubscribe();
  }
  if (streamEndTimer) clearTimeout(streamEndTimer);
  if (typewriterTimer) clearTimeout(typewriterTimer);
  if (thoughtFlushTimer) clearTimeout(thoughtFlushTimer);
});

// Watch tab changes to load relevant data
watch(activeTab, (newTab) => {
  if (newTab === 'workspace') {
    loadDeliverablesForStage(currentStage.value);
  } else if (newTab === 'prototype') {
    refreshPrototypeFiles();
  }
});
</script>

<style scoped>
.review-status{font-size:11px;color:#64748b;border-radius:5px;background:#f0f5ff;padding:4px 6px;white-space:nowrap}.integrity-overlay{position:fixed;inset:0;z-index:1500;display:grid;place-items:center;background:#17203640}.integrity-dialog{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;width:min(520px,90vw);max-height:85vh;overflow:auto;font-size:13px;color:#334155}.integrity-dialog h2{font-size:18px;font-weight:600;margin-bottom:10px}.integrity-dialog p{font-size:12px;line-height:1.8;color:#64748b;margin:10px 0}.integrity-dialog label{display:flex;flex-direction:column;gap:6px;margin:14px 0}.integrity-dialog input:not([type=checkbox]),.integrity-dialog textarea{padding:8px 10px;border:1px solid #dbe4f0;border-radius:7px;width:100%}.integrity-dialog textarea{min-height:85px}.integrity-dialog label.integrity-check{flex-direction:row;align-items:flex-start;line-height:1.7}.integrity-dialog footer{display:flex;justify-content:flex-end;gap:14px;margin-top:20px}.integrity-dialog button{padding:7px 10px;border-radius:6px;cursor:pointer;color:#2563eb}.integrity-dialog button.primary{background:#2563eb;color:#fff}.integrity-dialog button:disabled{opacity:.5}.integrity-version{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf1f6;padding:6px 0}

.fde-reply-status { display:flex; align-items:center; gap:7px; padding:4px 0 10px; color:#7c8aa2; font-size:12px; }
.document-toolbar { min-height:68px; flex-wrap:wrap; gap:8px; }
.stage-overview-paper { width:calc(100% - 40px); max-width:920px; margin:20px auto 32px; border:1px solid #e1e8f4; border-radius:14px; background:#fff; box-shadow:0 1px 4px rgba(15,23,42,.04); overflow:hidden; }

.project-nav-btn {
  display: flex;
  width: 100%;
  min-height: 36px;
  align-items: center;
  gap: 10px;
  border-radius: 9px;
  padding: 0 10px;
  color: #64748b;
  text-align: left;
  font-size: 12px;
  font-weight: 450;
  transition: background-color .15s, color .15s;
}
.project-nav-btn i { width: 16px; text-align: center; font-size: 12px; }
.project-nav-btn:hover { background: #fff; color: #1d4ed8; }
.project-nav-btn.is-active { background: #e9f0ff; color: #1d4ed8; font-weight: 600; }
.project-sidebar input { font-size: 12px; }
.project-sidebar button:not(.project-nav-btn) { font-size: 11.5px; font-weight: 450; }
.project-sidebar button[aria-current] { font-weight: 550; }
.assistant-pane > div[role="tablist"] button { font-size: 11px; font-weight: 500; }
.assistant-pane .assistant-intro h3 { font-size: 14px; font-weight: 600; }
.assistant-pane .assistant-intro h4 { font-size: 12px; font-weight: 600; }
.assistant-pane .assistant-intro .space-y-1 button { font-size: 11px; font-weight: 450; }
.assistant-pane .assistant-intro .grid div div:first-child { font-size: 18px; }
.assistant-pane .assistant-intro .grid div div:last-child { font-size: 10px; }
.discussion-card-title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-weight: 550; }
.discussion-card-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
:deep(.assistant-pane .chat-answer.markdown-body) { font-size: 13px; line-height: 1.65; }
.document-main :deep(.markdown-body) { font-size: 15px; line-height: 1.8; }
.assistant-pane { min-height: 0; height: 100%; max-height: 100%; background: #fbfdff; container-type: inline-size; container-name: fde-assistant; }
.assistant-content { overflow: hidden; }
.assistant-messages, .assistant-history-scroll, .assistant-resource-panel { min-height: 0; overscroll-behavior-y: contain; overflow-wrap: anywhere; }
.assistant-messages { flex-basis: 0; }
.project-assistant-composer { position: relative; z-index: 20; }
.project-assistant-input-row { height: 52px; box-sizing: border-box; }
.project-assistant-input-row textarea { height: 32px; max-height: 32px; overflow-y: auto; scrollbar-width: none; }
.project-assistant-input-row textarea::-webkit-scrollbar { display: none; }
.assistant-conversation-actions { display: flex; align-items: center; gap: 8px; min-height: 28px; margin-bottom: 5px; padding: 0 4px; color: #94a3b8; font-size: 11px; }
.assistant-conversation-actions > span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-conversation-actions button { display: inline-flex; align-items: center; flex-shrink: 0; gap: 5px; padding: 5px 6px; border: 0; border-radius: 6px; color: #64748b; background: transparent; }
.assistant-conversation-actions button:hover { color: #2563eb; background: #eff6ff; }
.assistant-conversation-actions button:disabled { opacity: .4; }
.assistant-conversation-actions button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
.assistant-home-content {
  overflow-y: auto;
  background: #fff;
}
.assistant-home-composer { background: #fff; }
.assistant-hero { --hero-mascot-size: clamp(220px, 83cqw, 320px); display: grid; grid-template-columns: clamp(78px, 30cqw, 160px) minmax(0, 1fr); gap: 10px; min-height: 140px; overflow: hidden; padding: 0 12px 0 4px; }
.assistant-hero-figure { position: relative; min-width: 0; overflow: hidden; }
.assistant-hero-figure .assistant-intro-mascot { position: absolute; width: var(--hero-mascot-size); height: var(--hero-mascot-size); max-width: none; left: calc(50% - var(--hero-mascot-size) * .48); bottom: calc(var(--hero-mascot-size) * -.55); object-fit: contain; }
.assistant-hero-copy { min-width: 0; align-self: center; padding: 16px 0; }
.assistant-hero-copy h3 { line-height: 1.5; color: #0f172a; }
.assistant-hero-copy p { margin-top: 8px; font-size: 11px; line-height: 1.7; color: #475569; overflow-wrap: anywhere; }
.assistant-intro { background: #fff; padding-bottom: 12px; }
.assistant-home-content .assistant-intro { display:flex; flex:1 0 auto; min-height:100%; box-sizing:border-box; flex-direction:column; }
.assistant-home-content .assistant-intro > h4 { margin-top:auto; padding-top:24px; }
.assistant-lower-scene {
  container-type: size;
  min-height: 180px;
  max-height: 180px;
  flex: 0 0 180px;
  margin-top: auto;
  --scene-mascot-size: min(clamp(220px, 70cqw, 340px), 125cqh);
  overflow: hidden;
  border-top: 1px solid #edf1f7;
  background: linear-gradient(180deg, #fff 0%, #fff 24%, #e6f2ff 50%, #bddcff 100%);
}
.assistant-lower-scene::before,
.assistant-lower-scene::after { content: ''; position: absolute; pointer-events: none; border-radius: 50%; }
.assistant-lower-scene::before { width: 110%; height: 110px; left: -30%; bottom: -20px; background: rgba(137, 195, 255, .43); transform: rotate(-13deg); }
.assistant-lower-scene::after { width: 120%; height: 140px; right: -55%; bottom: -60px; background: rgba(91, 161, 245, .4); transform: rotate(-18deg); }
.assistant-lower-mascot { position: absolute; z-index: 1; width: var(--scene-mascot-size); height: var(--scene-mascot-size); max-width: none; right: calc(var(--scene-mascot-size) * -.28); bottom: calc(var(--scene-mascot-size) * -.22); object-fit: contain; }
.assistant-speech {
  position: absolute;
  right: calc(var(--scene-mascot-size) * .4 + 16px);
  top: calc(100% - var(--scene-mascot-size) * .76);
  z-index: 10;
  width: calc(100% - var(--scene-mascot-size) * .4 - 44px);
  max-width: 212px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  color: #64748b;
  font-size: 11px;
  line-height: 1.7;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .05);
}
@container fde-assistant (max-width: 340px) {
  .assistant-hero { gap: 7px; padding-right: 10px; }
  .assistant-pane .assistant-hero h3 { font-size: 13px; }
  .assistant-hero-copy { padding-top: 12px; padding-bottom: 12px; }
  .assistant-composer-tools, .assistant-composer-tools > div { flex-wrap: wrap; }
  .assistant-composer-tools > span { display: none; }
}
.assistant-speech-tail {
  position: absolute;
  right: -14px;
  top: 24px;
  width: 16px;
  height: 22px;
  pointer-events: none;
}
.assistant-intro-mascot { transform-origin: 50% 85%; animation: coach-greet 4.2s ease-in-out infinite; }
.assistant-lower-mascot { transform-origin: 50% 85%; animation: coach-greet 4.2s ease-in-out infinite 1s; }
@keyframes coach-greet { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(1.5deg); } }
@media (prefers-reduced-motion: reduce) { .assistant-intro-mascot, .assistant-lower-mascot { animation: none; } }
:deep(.document-section-body.markdown-body) { font-size: 14px; line-height: 1.75; color: #334155; }
:deep(.document-section-body.markdown-body > p:first-child) { margin-top: 0; }
:deep(.document-section-body.markdown-body strong) { color: #1e293b; }
:deep(.document-section-body.markdown-body table) { display: block; width: 100%; max-width: 100%; overflow-x: auto; border-collapse: separate; border-spacing: 0; border: 1px solid #dce6f4; border-radius: 9px; font-size: 13px; }
:deep(.document-section-body.markdown-body table th),
:deep(.document-section-body.markdown-body table td) { border: 0; border-bottom: 1px solid #e6edf7; border-right: 1px solid #e6edf7; padding: 10px 12px; vertical-align: top; min-width: 100px; }
:deep(.document-section-body.markdown-body table tr:last-child td) { border-bottom: 0; }
:deep(.document-section-body.markdown-body table th:last-child),
:deep(.document-section-body.markdown-body table td:last-child) { border-right: 0; }
:deep(.document-section-body.markdown-body table th) { background: #eff5ff; color: #385078; font-weight: 650; white-space: nowrap; }
:deep(.document-section-body.markdown-body table td:first-child) { background: #f8fbff; color: #385078; font-weight: 600; }
:deep(.document-section-body.markdown-body table tr:nth-child(2n)) { background: #fff; }
:deep(.document-section-body.markdown-body ol) { padding-left: 1.5rem; }
:deep(.document-section-body.markdown-body li) { padding: 5px 0; border-bottom: 1px solid #edf2f8; }
:deep(.document-section-body.markdown-body li:last-child) { border-bottom: 0; }
:deep(.document-section-body.markdown-body h3) { margin-top: 1.25em; font-size: 15px; color: #0f172a; }
.document-main.document-fullscreen { position: fixed; inset: 0; z-index: 1000; }
.document-fullscreen-btn {
  display: inline-flex; align-items: center; gap: 7px; min-height: 34px;
  padding: 0 11px; border: 1px solid #bfdbfe; border-radius: 8px;
  background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 500;
  transition: background-color .15s;
}
.document-fullscreen-btn:hover { background: #dbeafe; }
.document-fullscreen-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
.document-paper { width: calc(100% - 40px); max-width: 920px; margin: 20px auto 40px; }
.document-masthead { padding: 28px 28px 24px; border-bottom: 1px solid #e8edf4; }
.document-outline { display: flex; flex-wrap: wrap; gap: 7px; padding: 12px 24px; border-bottom: 1px solid #edf2f7; }
.document-outline button { max-width: 100%; border-radius: 6px; padding: 5px 8px; text-align: left; overflow-wrap: anywhere; font-size: 11px; line-height: 1.5; color: #475569; background: #f1f5f9; }
.document-outline button:hover { background: #eaf1ff; color: #1d4ed8; }
.document-section { padding: 24px 28px; scroll-margin-top: 20px; }
.document-fullscreen .document-toolbar { padding: 16px 28px; }
.document-scroll { min-width: 0; }
.document-fullscreen .document-paper { width: calc(100% - 48px); max-width: 1000px; margin-top: 24px; }
.document-chat-slot { display: flex; min-width: 0; flex-shrink: 0; background: #fbfdff; }
.reading-splitter { position: relative; width: 8px; flex-shrink: 0; cursor: col-resize; touch-action: none; background: #eef2f7; outline-offset: -2px; }
.reading-splitter::after { content: ''; position: absolute; top: 50%; left: 3px; width: 2px; height: 32px; border-radius: 2px; background: #bac9dd; transform: translateY(-50%); }
.reading-splitter:hover, .reading-splitter.is-dragging { background: #dbeafe; }
.reading-splitter:hover::after, .reading-splitter.is-dragging::after { background: #3b82f6; }
.reading-splitter:focus-visible { outline: 2px solid #2563eb; }
.reading-splitter-normal { position: absolute; top: 0; bottom: 0; z-index: 20; }
.panel-resizing { user-select: none; cursor: col-resize; }
.coach-chat-avatar { position: relative; width: 32px; height: 32px; flex-shrink: 0; overflow: hidden; border-radius: 50%; background: linear-gradient(145deg, #eaf3ff, #d8e9ff); }
.coach-chat-avatar img { width: 100%; height: 100%; object-fit: cover; }
.assistant-pane.assistant-reading-chat { position: static; inset: auto; width: 100%; border: 0; border-radius: 0; box-shadow: none; }
.assistant-reading-chat :deep(.chat-answer.markdown-body) { font-size: 13px; line-height: 1.75; }
.document-fullscreen .document-masthead { padding: 36px 40px 28px; }
.document-fullscreen .document-section { padding: 28px 40px; }
.document-fullscreen .document-editor { height: calc(100vh - 210px); }
.document-main :deep(.markdown-body) { font-size: 14px; line-height: 1.85; color: #334155; overflow-wrap: anywhere; }
.document-main :deep(.markdown-body p) { margin-bottom: 1em; }
.document-main :deep(.markdown-body h3) { color: #0f172a; font-size: 15px; font-weight: 600; }
.document-main :deep(.markdown-body blockquote) { color: #475569; background: #f8fafc; border-left: 3px solid #cbd5e1; }
.document-main :deep(.document-table-scroll) { max-width: 100%; overflow-x: auto; margin: 1em 0; border: 1px solid #dce6f4; border-radius: 9px; }
.document-main :deep(.document-table-scroll table) { display: table; width: 100%; margin: 0; border: 0; border-radius: 0; }
/* 所有可点击元素统一小手光标；禁用态恢复默认 */
button:not(:disabled),
[role="button"],
a,
textarea,
summary,
label[for] {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}
textarea {
  cursor: text;
}

/* --- 统一字号台阶（收敛原先 10.5~14px 七八档到 4 档）---
   ws-title 面板/卡片主标题 · ws-body 正文/文档名 · ws-label 次要 · ws-meta 状态/提示 */
.ws-title { font-size: 14px; line-height: 1.3; }
.ws-body  { font-size: 13px; line-height: 1.45; }
.ws-label { font-size: 12px; line-height: 1.4; }
.ws-meta  { font-size: 11px; line-height: 1.4; }
/* 侧边导航专用：比 ws-meta 再小半档，密度优先 */
.ws-micro { font-size: 10.5px; line-height: 1.35; }

/* --- 顶栏工具按钮：MD/Word/编辑/下载/折叠 统一同一档 ---
   28px 高、10px 字、6px 圆角、图标 10px，hover 蓝 */
.ws-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background .15s, color .15s;
}
.ws-tool-btn i { font-size: 11px; }
.ws-tool-btn:hover:not(:disabled) { background: hsl(var(--primary) / 8%); color: hsl(var(--primary)); }
.ws-tool-btn.is-on { background: hsl(var(--primary) / 10%); color: hsl(var(--primary)); }
.ws-tool-btn:disabled { opacity: .4; cursor: not-allowed; }

/* --- 段控药丸（MD | Word 容器）--- */
.ws-seg { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 9px; background: hsl(var(--primary) / 6%); }
.ws-seg-btn {
  display: inline-flex; align-items: center; gap: 4px;
  height: 24px; padding: 0 9px; border-radius: 7px;
  font-size: 12px; font-weight: 500; border: none; cursor: pointer;
  color: hsl(var(--muted-foreground)); background: transparent;
  transition: background .15s, color .15s, box-shadow .15s;
}
.ws-seg-btn i { font-size: 9px; }
.ws-seg-btn.is-on { background: hsl(var(--background)); color: hsl(var(--primary)); box-shadow: 0 1px 3px hsl(var(--foreground) / 8%); }
.ws-seg-btn:disabled { opacity: .4; cursor: not-allowed; }

/* --- composer 圆形图标按钮：统一 32px --- */
.ws-icon-btn {
  width: 32px; height: 32px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  color: hsl(var(--muted-foreground)); background: transparent; border: none; cursor: pointer;
  transition: background .15s, color .15s;
}
.ws-icon-btn i { font-size: 13px; }
.ws-icon-btn:hover:not(:disabled) { background: hsl(var(--primary) / 8%); color: hsl(var(--primary)); }
.ws-icon-btn:disabled { opacity: .4; cursor: not-allowed; }

/* 用户气泡：淡蓝底（token），替代硬编码 var(--ui-brand-soft) */
.user-bubble {
  background: hsl(var(--primary) / 9%);
}


/* AI 结果卡：白底 + 淡蓝描边，动作条按钮 */
.result-card {
  background: hsl(var(--background));
  box-shadow: 0 4px 16px hsl(var(--primary) / 6%);
}
.result-act {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: transparent;
  transition: background .15s, color .15s;
}
.result-act i { font-size: 11px; }
.result-act:hover:not(:disabled) {
  background: hsl(var(--primary) / 8%);
  color: hsl(var(--primary));
}
.result-act:disabled { opacity: .45; cursor: not-allowed; }
.result-act-icon { padding: 0; width: 28px; justify-content: center; }

/* 深度推理中：柔和呼吸，替代刺眼的 animate-pulse（0↔1 快闪）。
   幅度小、周期长，尊重「减少动效」偏好。 */
@keyframes thinking-breathe {
  0%, 100% { opacity: .55; }
  50% { opacity: 1; }
}
.thinking-breathe {
  animation: thinking-breathe 1.8s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .thinking-breathe { animation: none; opacity: .85; }
}

/* Markdown Body — document reading feel */
:deep(.markdown-body) {
  word-wrap: break-word;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--ui-ink-2);
}
:deep(.chat-answer.markdown-body) {
  font-size: 15px;
  line-height: 1.75;
}
:deep(.markdown-body p) {
  margin-bottom: 1.1em;
}
:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}
:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  margin-top: 1.75em;
  margin-bottom: 0.6em;
  font-weight: 700;
  line-height: 1.3;
  color: var(--ui-ink);
}
:deep(.markdown-body h1) { font-size: 1.45em; letter-spacing: -0.01em; }
:deep(.markdown-body h2) {
  font-size: 1.2em;
  border-bottom: 1.5px solid var(--ui-line-2);
  padding-bottom: 0.35em;
  letter-spacing: -0.005em;
}
:deep(.markdown-body h3) { font-size: 1.05em; font-weight: 600; color: var(--ui-ink-3); }
:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin-top: 0.25em;
  margin-bottom: 1.1em;
  padding-left: 1.75em;
}
:deep(.markdown-body ul) { list-style-type: disc; }
:deep(.markdown-body ol) { list-style-type: decimal; }
:deep(.markdown-body li) { margin-bottom: 0.35em; }
:deep(.markdown-body li + li) { margin-top: 0; }
:deep(.markdown-body code) {
  padding: 0.18em 0.42em;
  margin: 0;
  font-size: 83%;
  background-color: var(--ui-bg-2);
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
  color: var(--ui-ink);
  border: 1px solid var(--ui-line-2);
}
:deep(.markdown-body pre) {
  padding: 16px 18px;
  overflow: auto;
  font-size: 83%;
  line-height: 1.5;
  background-color: var(--ui-bg-3);
  border-radius: 10px;
  margin-bottom: 1.2em;
  border: 1px solid var(--ui-line-2);
}
:deep(.markdown-body pre code) {
  padding: 0;
  margin: 0;
  background-color: transparent;
  border: 0;
  color: var(--ui-ink-3);
  font-size: inherit;
  line-height: inherit;
}
:deep(.markdown-body blockquote) {
  padding: 0.3em 1em;
  color: var(--ui-text-2);
  border-left: 3px solid var(--ui-line);
  margin-bottom: 1.1em;
  background: var(--ui-bg-3);
  border-radius: 0 6px 6px 0;
}
:deep(.markdown-body table) {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow: auto;
  margin-bottom: 1.2em;
  border-spacing: 0;
  border-collapse: collapse;
  font-size: 12.5px;
}
:deep(.markdown-body table th),
:deep(.markdown-body table td) {
  padding: 7px 14px;
  border: 1px solid var(--ui-line-2);
}
:deep(.markdown-body table th) {
  background: var(--ui-bg-3);
  font-weight: 600;
  color: var(--ui-ink-3);
}
:deep(.markdown-body table tr:nth-child(2n)) {
  background-color: #fafafa;
}
:deep(.markdown-body hr) {
  height: 1.5px;
  padding: 0;
  margin: 1.5em 0;
  background-color: var(--ui-line-2);
  border: 0;
}

/* Compact Markdown for Thinking Steps */
:deep(.compact-markdown) {
  word-wrap: break-word;
  line-height: 1.25;
}
:deep(.compact-markdown p) {
  margin: 0 !important;
  padding: 0 !important;
}
:deep(.compact-markdown pre) {
  padding: 4px 8px !important;
  margin: 2px 0 !important;
  font-size: 11px !important;
  background-color: var(--ui-bg-3);
  border-radius: 4px;
  border: 1px solid var(--ui-line-2);
  overflow-x: auto;
}
:deep(.compact-markdown pre code) {
  background-color: transparent;
  border: 0;
  padding: 0;
  color: var(--ui-ink-3);
  font-size: inherit;
}
:deep(.compact-markdown code) {
  padding: 0.1em 0.3em;
  font-size: 12px;
  background-color: var(--ui-bg-2);
  border-radius: 4px;
  color: var(--ui-ink);
  word-break: break-all;
  white-space: pre-wrap;
}

/* Hide scrollbar for a cleaner look */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Spec prose styles */
.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3) {
  color: var(--ui-ink-2);
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
.prose :deep(ul),
.prose :deep(ol) {
  padding-left: 1.5em;
}
.prose :deep(code) {
  background: var(--ui-bg-2);
  padding: 0.15em 0.4em;
  border-radius: 0.25rem;
  font-size: 0.85em;
}
.prose :deep(pre) {
  background: var(--ui-ink-2);
  color: var(--ui-line-2);
  padding: 1em;
  border-radius: 0.75rem;
  overflow-x: auto;
}
.prose :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
.prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
}
.prose :deep(th),
.prose :deep(td) {
  border: 1px solid var(--ui-line-2);
  padding: 0.5em 0.75em;
  text-align: left;
}
.prose :deep(th) {
  background: var(--ui-bg-3);
  font-weight: 600;
}
:deep(.chat-delivery-card) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 340px;
  padding: 6px 8px 6px 7px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e8e8e4;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  margin: 5px 4px 5px 0;
  vertical-align: middle;
}
:deep(.chat-delivery-card:hover) {
  border-color: var(--ui-line);
  box-shadow: 0 1px 4px rgba(15,23,42,0.06);
}
:deep(.chat-delivery-icon) {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
}
:deep(.chat-delivery-main) {
  min-width: 0;
  max-width: 200px;
}
:deep(.chat-delivery-name) {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ui-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
:deep(.chat-delivery-meta) {
  font-size: 10.5px;
  color: var(--ui-text-3);
  margin-top: 1px;
}
:deep(.chat-delivery-thumb) {
  width: 34px;
  height: 34px;
  object-fit: cover;
  border-radius: 7px;
  border: 1px solid var(--ui-line-2);
  flex-shrink: 0;
}
:deep(.chat-delivery-action) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ui-text-3);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
  font-size: 11px;
}
:deep(.chat-delivery-action:hover) {
  background: var(--ui-bg-2);
  color: var(--ui-ink-3);
}
/* 项目页按生成进度展示操作，助手贴齐内容区边界。 */
.document-primary-action{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 16px;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:500;white-space:nowrap}
.document-primary-action:hover{background:#1d4ed8}.document-primary-action:disabled{opacity:.5;cursor:default}
.document-options{position:relative}.document-menu-dismiss{position:fixed;inset:0;z-index:30}.document-options-menu{position:absolute;right:0;top:42px;z-index:40;min-width:172px;padding:6px;background:white;border:1px solid #e2e8f0;border-radius:9px;box-shadow:0 10px 30px #172b4d1a}
.document-options-menu button{display:flex;justify-content:space-between;align-items:center;gap:20px;width:100%;padding:9px 12px;text-align:left;font-size:12px;color:#475569;border-radius:6px}.document-options-menu button:hover{background:#eff6ff;color:#1d4ed8}.document-options-menu button:disabled{opacity:.5;cursor:default}.document-options-menu small{display:block;padding:8px 12px;color:#94a3b8;font-size:10px;border-top:1px solid #f1f5f9}
.deliverable-start{width:calc(100% - 64px);max-width:720px;margin:clamp(32px,8vh,84px) auto;padding:30px 32px;border:1px solid #e3eaf4;border-radius:12px;background:#fff}
.start-eyebrow{color:#64748b;font-size:12px}.deliverable-start h2{margin:12px 0 10px;color:#17233b;font-size:22px;font-weight:600;line-height:1.5}.start-description{font-size:13px;line-height:1.8;color:#64748b}
.generation-steps{display:flex;gap:16px;margin:30px 0;padding:0;list-style:none}.generation-steps li{display:flex;flex:1;gap:9px;min-width:0;color:#94a3b8}.generation-steps li>span{display:flex;justify-content:center;align-items:center;flex-shrink:0;width:25px;height:25px;border-radius:50%;background:#f1f5f9;font-size:12px}.generation-steps strong{display:block;font-size:13px;font-weight:500;line-height:25px}.generation-steps p{margin-top:4px;font-size:11px;line-height:1.6}.generation-steps .is-current{color:#2563eb}.generation-steps .is-current>span{background:#2563eb;color:#fff}.generation-steps .is-done>span{background:#eaf6f0;color:#168b62}.generation-steps .is-done strong{color:#475569}
.start-source-note{padding-top:18px;border-top:1px solid #edf1f7;font-size:12px;line-height:1.7;color:#64748b}.start-actions{display:flex;gap:12px;align-items:center;margin-top:20px}
@media(max-width:1100px){.deliverable-start{width:calc(100% - 32px);padding:24px}.generation-steps{flex-direction:column;gap:16px}.generation-steps p{margin-top:1px}}
.research-stage-next{margin:0 28px 28px;padding-top:18px;border-top:1px solid #e8edf5}.research-stage-next>p{font-size:13px;line-height:1.8;color:#64748b}
.research-document-scroll{display:block;overflow-y:auto;background:#f5f8fd;padding:20px 22px}.research-workspace{display:flex;min-height:0;min-width:0;flex-direction:column;gap:14px;max-width:1120px;margin:0 auto}.research-continue{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:6px 2px 14px;border-top:0;background:transparent;flex-shrink:0}.research-continue strong{font-size:13px;font-weight:500;color:#334155}.research-continue p{margin-top:4px;font-size:12px;line-height:1.6;color:#64748b}.research-continue button{white-space:normal;line-height:1.6;max-width:240px;min-height:40px}.research-workspace :deep(.knowledge-space){height:auto}
@media(max-width:1100px){.research-continue{align-items:flex-start;flex-direction:column;gap:10px}.research-continue button{max-width:100%}}
.project-stage-steps{display:flex;align-items:center;margin-top:16px;padding:15px 18px;background:#fff;border:1px solid #e4eaf3;border-radius:12px;box-shadow:0 2px 8px #15345b04;gap:12px}.project-stage-steps li{display:flex;align-items:center;flex:1;min-width:0;gap:12px}.project-stage-steps li:last-child{flex:0 0 auto}.project-stage-steps button{display:flex;align-items:center;gap:8px;white-space:nowrap;color:#64748b;font-size:12px;min-height:32px;border-radius:7px}.project-stage-steps button:disabled{cursor:not-allowed;color:#8393a9}.project-stage-steps .stage-number{display:grid;place-items:center;width:28px;height:28px;flex-shrink:0;background:#f0f4f9;border-radius:50%;color:#6b7e98;font-size:13px;font-weight:550}.project-stage-steps .is-current button{color:#2563eb;font-weight:600}.project-stage-steps .is-current .stage-number{background:#2563eb;color:white}.project-stage-steps .is-done .stage-number{background:#e7efff;color:#2563eb}.stage-connector{height:3px;flex:1;min-width:10px;border-radius:3px;background:#e2e8f0}.is-done .stage-connector{background:#93b4fc}.preparation-project-header{border-bottom:0;padding:18px 22px 0;background:#f5f8fd}.preparation-project-header>div:first-child>span.ml-3,.preparation-project-header>div:first-child>a.ml-3{display:none}.preparation-project-header>div:nth-child(2)>a{color:#2563eb;background:#edf3ff}.preparation-project-header>div:nth-child(2)>a i:before{content:"\f07b"}.preparation-project-header>div:nth-child(3){padding-left:5px;margin-top:4px}
@media(max-width:1100px){.project-stage-steps{gap:8px;padding:12px}.project-stage-steps li{gap:8px}.project-stage-steps button{flex-direction:column;gap:4px;font-size:11px;white-space:normal;text-align:center}.project-stage-steps li:last-child{flex:1}.stage-connector{min-width:6px}.research-document-scroll{padding:16px}.research-continue{padding-bottom:4px}}
.research-document-scroll.research-file-open{display:flex;padding:0;overflow:hidden;background:white}.research-workspace.is-reading-material{flex:1;height:100%;max-width:none;gap:0}.material-ai-scope{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e4eaf3;background:#f8fbff;flex-shrink:0}.material-ai-scope>i{color:#2563eb;font-size:17px}.material-ai-scope>div{min-width:0}.material-ai-scope span{display:block;font-size:11px;color:#64748b}.material-ai-scope strong{display:block;font-size:12px;font-weight:500;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}.selected-material-excerpt{margin:10px 10px 0;padding:10px 12px;background:#f5f8ff;border:1px solid #dce7fa;border-radius:9px}.selected-material-excerpt>div{display:flex;align-items:center;justify-content:space-between}.selected-material-excerpt strong{font-size:11px;font-weight:550;color:#2563eb}.selected-material-excerpt button{width:24px;height:24px;color:#64748b}.selected-material-excerpt p{font-size:12px;line-height:1.7;color:#475569;max-height:80px;overflow-y:auto;white-space:pre-wrap;margin:4px 0 6px}.selected-material-excerpt>span{font-size:10px;color:#64748b}

#project-reading-assistant .assistant-panel-tab { font-size:12px!important; line-height:18px!important; font-weight:500!important; }
#project-reading-assistant .assistant-resource-panel { font-size:12px; line-height:1.6; }
#project-reading-assistant .assistant-resource-panel h3 { font-size:13px!important; line-height:20px; }
#project-reading-assistant .assistant-resource-panel button { font-size:12px!important; line-height:18px!important; }
#project-reading-assistant .assistant-resource-panel button span:last-child { font-size:11px!important; }
#project-reading-assistant .assistant-quick-action { font-size:12px!important; line-height:18px!important; min-height:32px; }
.prototype-stage-assets { padding:8px; border-bottom:1px solid #e2e8f0; }
.prototype-stage-assets h4 { font-size:11px; color:#64748b; margin-bottom:6px; }
.prototype-stage-assets button { display:block; width:100%; text-align:left; border-radius:6px; padding:6px; font-size:12px; color:#2563eb; overflow-wrap:anywhere; }
.prototype-stage-assets button:hover { background:#eff6ff; }

</style>

<style scoped>
.stage-overview-paper { width:calc(100% - 32px); max-width:none; margin:16px auto; min-height:calc(100% - 32px); }
.document-main :deep(.fde-flow .flow-card) { max-width:none; }
</style>

<style scoped>
#project-reading-assistant.assistant-pane.assistant-reading-chat { position:fixed!important; inset:0 0 0 auto!important; width:var(--fde-reading-assistant-width,360px)!important; height:100vh; z-index:1002; border:0; border-left:1px solid #e2e8f0; border-radius:0; box-shadow:none; }
.document-main.document-fullscreen { position:fixed!important; inset:0!important; z-index:1000; width:100vw; height:100vh; background:white; }
</style>

<style scoped>

/* Collapse keeps the same assistant DOM, draft, messages and saved width. */
.assistant-pane-toggle { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:28px; height:28px; align-self:center; margin-left:4px; border:0; border-radius:6px; background:transparent; color:#64748b; cursor:pointer; font-size:12px; }
.assistant-pane-toggle:hover { color:#2563eb; background:#eff6ff; }
.assistant-pane-toggle:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }
.assistant-collapsed-rail { position:absolute; inset:0 0 0 auto; width:44px; z-index:20; display:flex; justify-content:center; align-items:flex-start; padding-top:12px; border-left:1px solid #e2e8f0; background:#fff; }
.assistant-collapsed-rail .assistant-pane-toggle { margin-left:0; align-self:flex-start; }
.assistant-collapsed-rail.is-fullscreen { position:fixed; height:100vh; z-index:1002; }

</style>
