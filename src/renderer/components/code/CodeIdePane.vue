<template>
  <section class="ide-pane">
    <!-- 工具栏 -->
    <div class="ide-toolbar">
      <div class="ide-toolbar-left">
        <i class="fa-solid fa-code text-blue-600 text-xs"></i>
        <span class="ide-title">FDE Code</span>
        <span v-if="state === 'ready'" class="ide-dot" title="IDE 已就绪"></span>
        <div class="ide-backend" ref="backendWrap">
          <button
            v-if="backendLabel"
            class="ide-badge ide-badge--btn"
            :class="'ide-badge--' + backend"
            title="切换 IDE 后端（内置 FDE Code / 本机 VS Code）"
            @click="backendMenuOpen = !backendMenuOpen"
          >
            {{ backendLabel }}<i class="fa-solid fa-angle-down ide-badge-caret"></i>
          </button>
          <span v-else class="ide-badge">{{ state === 'idle' ? '待启动' : '准备中' }}</span>
          <div v-if="backendMenuOpen" class="ide-menu">
            <button :class="{ 'ide-menu--on': backend === 'code-server' }" @click="switchBackend('code-server')">
              <i class="fa-solid fa-box"></i>
              <span>
                <strong>FDE Code（内置）</strong>
                <em>随应用走，扩展在应用目录里；已预装 Claude Code</em>
              </span>
            </button>
            <button
              :class="{ 'ide-menu--on': backend === 'local-vscode' }"
              :disabled="localAvailable === false"
              @click="switchBackend('local-vscode')"
            >
              <i class="fa-solid fa-desktop"></i>
              <span>
                <strong>本机 VS Code</strong>
                <em>{{ localAvailable === false ? '未检测到本机 VS Code（需支持 serve-web）' : '复用已安装的 VS Code，零下载' }}</em>
              </span>
            </button>
          </div>
        </div>
        <span v-if="state === 'ready' && locale" class="ide-badge ide-badge--locale" :title="locale === 'zh-cn' ? '界面语言：中文' : '界面语言：英文'">
          {{ locale === 'zh-cn' ? '中文' : 'EN' }}
        </span>
      </div>
      <div class="ide-toolbar-right">
        <CodeModeSwitch :model-value="mode === 'ide'" @update:model-value="onModeChange" />
        <span class="ide-toolbar-divider"></span>
        <!-- AI 面板开关：收起时右侧留一条 32px 竖条，用户可以再点回来 -->
        <button
          class="ide-btn ide-btn--icon"
          :class="{ 'ide-btn--on': aiVisible }"
          :title="aiVisible ? '收起 AI coding 面板' : '展开 AI coding 面板'"
          @click="emit('toggle-ai')"
        >
          <i class="fa-solid" :class="aiVisible ? 'fa-angles-right' : 'fa-angles-left'"></i>
        </button>
        <span class="ide-toolbar-divider"></span>
        <button class="ide-btn ide-btn--icon" :disabled="busy" title="重新加载 IDE 页面" @click="reloadView">
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
        <button class="ide-btn ide-btn--icon" :disabled="busy" title="重启 IDE 服务" @click="restartServer">
          <i class="fa-solid fa-power-off"></i>
        </button>
      </div>
    </div>

    <!-- 不影响启动的提示（如中文包安装失败） -->
    <div v-if="state === 'ready' && warning && !warningDismissed" class="ide-warning">
      <i class="fa-solid fa-circle-info"></i>
      <span>{{ warning }}</span>
      <button class="ide-warning-close" title="关闭提示" @click="dismissWarning"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <!-- 加载 / 状态 -->
    <div v-if="busy || state === 'idle'" class="ide-state">
      <div class="ide-state-card">
        <div class="ide-state-icon">
          <i class="fa-solid fa-code" v-if="state === 'checking' || state === 'idle'"></i>
          <i class="fa-solid fa-download" v-else-if="state === 'downloading' || state === 'installing'"></i>
          <i class="fa-solid fa-spinner fa-spin" v-else></i>
        </div>
        <h3>{{ stateTitle }}</h3>
        <p>{{ stateHint }}</p>

        <div v-if="state === 'downloading'" class="ide-progress">
          <div class="ide-progress-bar"><span :style="{ width: (download?.percent || 0) + '%' }"></span></div>
          <div class="ide-progress-meta">
            <span>{{ download?.percent || 0 }}%</span>
            <span v-if="download?.total">{{ formatBytes(download.received) }} / {{ formatBytes(download.total) }}</span>
            <span v-if="download?.bytesPerSecond">{{ formatBytes(download.bytesPerSecond) }}/s</span>
          </div>
          <button class="ide-btn ide-btn--ghost" @click="cancelDownload">取消下载</button>
        </div>
      </div>
    </div>

    <!-- 不可用 / 错误 -->
    <div v-else-if="state === 'unavailable' || state === 'error'" class="ide-state">
      <div class="ide-state-card ide-state-card--error">
        <div class="ide-state-icon ide-state-icon--warn"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <h3>{{ state === 'unavailable' ? 'IDE 运行时不可用' : 'IDE 启动失败' }}</h3>
        <p class="ide-error-text">{{ error || '未知错误' }}</p>
        <div class="ide-state-actions">
          <button class="ide-btn ide-btn--primary" @click="retry">重试</button>
          <button
            v-if="state === 'unavailable' || backend === 'local-vscode'"
            class="ide-btn"
            @click="retryWithLocal"
          >改用本机 VS Code</button>
          <button
            v-if="state === 'unavailable' || backend === 'code-server'"
            class="ide-btn"
            @click="retryWithCodeServer"
          >改用 FDE Code</button>
        </div>
        <p class="ide-log-hint" v-if="logPath">
          日志：<code>{{ logPath }}</code>
        </p>
        <p class="ide-note">
          FDE Code 使用 <a href="https://github.com/coder/code-server" @click.prevent="openExternal('https://github.com/coder/code-server')">code-server</a>（MIT），
          扩展市场为 <a href="https://open-vsx.org" @click.prevent="openExternal('https://open-vsx.org')">Open VSX</a>；
          微软市场专属扩展（Pylance、C#、Copilot 等）不可用。
        </p>
      </div>
    </div>

    <!-- IDE 本体 -->
    <div v-show="state === 'ready' && url" class="ide-host">
      <webview
        ref="webviewEl"
        :src="url"
        :partition="partition"
        :webpreferences="webPreferences"
        class="ide-webview"
        @dom-ready="onDomReady"
        @did-fail-load="onFailLoad"
      ></webview>
    </div>

    <div v-if="state === 'ready' && loadingFrame" class="ide-loading-overlay">
      <i class="fa-solid fa-spinner fa-spin"></i><span>正在加载 FDE Code…</span>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import CodeModeSwitch from './CodeModeSwitch.vue';

const props = defineProps({
  workspace: { type: Object, default: null },
  // 'ide' | 'classic'：由父组件控制；classic 时不挂载本组件。
  mode: { type: String, default: 'ide' },
  // 右侧 AI coding 面板是否可见（IDE 模式下可收起，给编辑器更多宽度）。
  aiVisible: { type: Boolean, default: true },
});
const emit = defineEmits(['ready', 'error', 'update:mode', 'toggle-ai']);

const partition = 'persist:fde-vscode';
const webPreferences = 'contextIsolation=yes,nodeIntegration=no,sandbox=yes';

const state = ref('idle');
const backend = ref(null);
const url = ref('');
const error = ref('');
const warning = ref('');
const warningDismissed = ref(false);
const locale = ref('');
const localAvailable = ref(null);
const backendMenuOpen = ref(false);
const download = ref(null);
const logPath = ref('');
const loadingFrame = ref(true);
const webviewEl = ref(null);
const backendWrap = ref(null);

let unsub = null;
let ensureSeq = 0;

const busy = computed(() => ['checking', 'downloading', 'installing', 'preparing', 'starting'].includes(state.value));
const backendLabel = computed(() => {
  if (state.value !== 'ready') return '';
  return backend.value === 'local-vscode' ? '本机 VS Code' : 'FDE Code';
});
const stateTitle = computed(() => ({
  idle: '准备 IDE…',
  checking: '正在检查 IDE 运行时…',
  downloading: '首次使用：正在下载 IDE 运行时',
  installing: '正在安装 IDE 运行时…',
  preparing: '正在准备中文界面…',
  starting: '正在启动 FDE Code 服务…',
}[state.value] || '正在启动…'));
const stateHint = computed(() => ({
  idle: '即将为当前工作区启动本地 IDE。',
  checking: '检查是否已有可用的 FDE Code 运行时，或本机 VS Code。',
  downloading: '只需下载一次，之后会缓存在本机；下载完成后即可离线使用。',
  installing: '解压并校验安装包。',
  preparing: '安装中文语言包并写入默认显示语言，只需一次。',
  starting: '首次启动需要初始化 FDE Code 服务，可能比平时慢一些（约 5~20 秒）。',
}[state.value] || ''));

const formatBytes = (n) => {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const applyStatus = (s) => {
  if (!s) return;
  state.value = s.state || 'idle';
  backend.value = s.backend || null;
  error.value = s.error || '';
  warning.value = s.warning || '';
  locale.value = s.locale || '';
  if (s.localAvailable !== undefined) localAvailable.value = s.localAvailable;
  download.value = s.download || null;
  logPath.value = s.logPath || '';
  if (s.state === 'ready' && s.url) {
    if (s.url !== url.value) {
      url.value = s.url;
      loadingFrame.value = true;
      blankRescued = false;
      clearBlankTimer();
    }
    emit('ready');
  }
  if (s.state === 'error' || s.state === 'unavailable') emit('error', s.error);
};

const ensure = async (backendOpt) => {
  if (!window.api?.ide) {
    state.value = 'unavailable';
    error.value = '当前环境不支持内置 FDE Code。';
    return;
  }
  // 工作区还没加载完：保持 checking，等父组件传入 workspace 后由 watch 重试。
  if (!props.workspace?.path) {
    state.value = 'checking';
    error.value = '';
    return;
  }
  const seq = ++ensureSeq;
  loadingFrame.value = true;
  warningDismissed.value = false;
  try {
    const res = backendOpt
      ? await window.api.ide.restart(props.workspace.path, backendOpt)
      : await window.api.ide.ensure(props.workspace.path);
    if (seq !== ensureSeq) return;
    applyStatus(res);
  } catch (e) {
    if (seq !== ensureSeq) return;
    state.value = 'error';
    error.value = e.message || String(e);
  }
};

const retry = () => ensure();
const retryWithLocal = () => ensure('local-vscode');
const retryWithCodeServer = () => ensure('code-server');
const switchBackend = (next) => {
  backendMenuOpen.value = false;
  if (next === backend.value && state.value === 'ready') return;
  ensure(next);
};
const onModeChange = (next) => emit('update:mode', next ? 'ide' : 'classic');
const dismissWarning = () => { warningDismissed.value = true; };
const restartServer = async () => {
  loadingFrame.value = true;
  try {
    const res = await window.api.ide.restart(props.workspace.path);
    applyStatus(res);
  } catch (e) {
    state.value = 'error';
    error.value = e.message || String(e);
  }
};
const cancelDownload = async () => {
  try { await window.api.ide.cancelDownload(); } catch (_) { /* ignore */ }
};
const reloadView = () => {
  loadingFrame.value = true;
  blankRescued = false;
  clearBlankTimer();
  try { webviewEl.value?.reload(); } catch (_) { ensure(); }
};

// 空白页兜底：偶发情况是文档加载完、workbench.js 却没跑起来（黑屏，且单纯 reload 无效）。
// dom-ready 后再等几秒没等到 .monaco-workbench 就清一次 IDE 会话缓存/存储并重载；
// 每次加载只自救一次，避免和真正的启动失败死循环。
const BLANK_CHECK_MS = 8000;
let blankTimer = null;
let blankRescued = false;

const clearBlankTimer = () => {
  if (blankTimer) clearTimeout(blankTimer);
  blankTimer = null;
};

const scheduleBlankCheck = () => {
  clearBlankTimer();
  if (blankRescued) return;
  blankTimer = setTimeout(async () => {
    blankTimer = null;
    let mounted = true;
    try {
      mounted = !!(await webviewEl.value?.executeJavaScript?.(
        '!!document.querySelector(".monaco-workbench")', true,
      ));
    } catch (_) {
      // 取不到（导航中 / guest 已销毁）就当它正常，不再折腾。
      return;
    }
    if (mounted || blankRescued) return;
    blankRescued = true;
    loadingFrame.value = true;
    try { await window.api?.ide?.recover?.(); } catch (_) { /* 清不掉也照样重载 */ }
    try { webviewEl.value?.reload(); } catch (_) { ensure(); }
  }, BLANK_CHECK_MS);
};

const onDomReady = () => {
  loadingFrame.value = false;
  scheduleBlankCheck();
};
const onFailLoad = (e) => {
  // -3 是用户主动中止导航（切换 URL/刷新），不是错误。
  if (e?.errorCode === -3) return;
  loadingFrame.value = false;
  state.value = 'error';
  error.value = `IDE 页面加载失败：${e?.errorDescription || e?.errorCode || '未知错误'}`;
};
const openExternal = (target) => { window.api?.shell?.openExternal?.(target); };

// 后端菜单：点空白处关闭（webview 会吞掉点击，所以用捕获阶段的 mousedown）。
const onDocMouseDown = (e) => {
  if (!backendMenuOpen.value) return;
  if (backendWrap.value && !backendWrap.value.contains(e.target)) backendMenuOpen.value = false;
};

onMounted(async () => {
  if (window.api?.ide?.onStatus) {
    unsub = window.api.ide.onStatus(applyStatus);
  }
  document.addEventListener('mousedown', onDocMouseDown, true);
  try {
    const current = await window.api?.ide?.status?.();
    applyStatus(current);
  } catch (_) { /* ignore */ }
  await ensure();
});

onUnmounted(() => {
  clearBlankTimer();
  document.removeEventListener('mousedown', onDocMouseDown, true);
  if (unsub) unsub();
});

watch(() => props.workspace?.path, (next, prev) => {
  if (next && next !== prev) ensure();
});
</script>

<style scoped>
.ide-pane { order: 2; position: relative; flex: 1 1 0; min-width: 320px; min-height: 0; display: flex; flex-direction: column; background: #1e1e1e; overflow: hidden; }

.ide-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 38px; padding: 0 10px; border-bottom: 1px solid var(--ui-brand-soft-2); background: var(--ui-bg, #fff); flex: none; }
.ide-toolbar-left, .ide-toolbar-right { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ide-toolbar-divider { width: 1px; height: 16px; background: var(--ui-brand-soft-2); }
.ide-title { color: var(--ui-ink-3); font-size: 12px; font-weight: 600; white-space: nowrap; }
.ide-badge { padding: 1px 7px; border-radius: 999px; font-size: 10.5px; background: var(--ui-brand-soft); color: var(--ui-brand); white-space: nowrap; }
.ide-badge--local-vscode { background: #eef6ff; color: #2563eb; }
.ide-badge--locale { background: #f1f5f9; color: var(--ui-text-2); }
.ide-backend { position: relative; }
.ide-badge--btn { display: inline-flex; align-items: center; gap: 4px; border: 0; cursor: pointer; font-family: inherit; line-height: 1.6; }
.ide-badge--btn:hover { filter: brightness(.97); }
.ide-badge-caret { font-size: 8px; opacity: .7; }
.ide-menu { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; width: 268px; padding: 5px; border: 1px solid var(--ui-brand-soft-2); border-radius: 10px; background: #fff; box-shadow: 0 10px 30px rgba(15, 23, 42, .16); }
.ide-menu button { width: 100%; display: flex; align-items: flex-start; gap: 9px; padding: 8px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--ui-text-2); cursor: pointer; text-align: left; }
.ide-menu button:hover:not(:disabled) { background: var(--ui-brand-soft); }
.ide-menu button:disabled { opacity: .55; cursor: default; }
.ide-menu button.ide-menu--on { background: var(--ui-brand-soft); color: var(--ui-brand-dark); }
.ide-menu i { width: 14px; margin-top: 2px; color: var(--ui-text-3); text-align: center; font-size: 11px; }
.ide-menu span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ide-menu strong { font-size: 12px; font-weight: 600; }
.ide-menu em { color: var(--ui-text-3); font-size: 10.5px; font-style: normal; line-height: 1.45; }
.ide-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, .14); }
.ide-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 26px; min-width: 26px; padding: 0 8px; border: 1px solid var(--ui-brand-soft-2); border-radius: 6px; background: var(--ui-bg, #fff); color: var(--ui-text-2); cursor: pointer; font-size: 11.5px; }
.ide-btn:hover:not(:disabled) { border-color: var(--ui-brand-light); color: var(--ui-brand); background: var(--ui-brand-soft); }
.ide-btn:disabled { opacity: .5; cursor: default; }
.ide-btn--icon { padding: 0; width: 26px; }
.ide-btn--on { border-color: var(--ui-brand-light); color: var(--ui-brand); background: var(--ui-brand-soft); }
.ide-btn--primary { border-color: var(--ui-brand); background: var(--ui-brand); color: #fff; }
.ide-btn--primary:hover:not(:disabled) { background: var(--ui-brand-dark, var(--ui-brand)); color: #fff; }
.ide-btn--ghost { border: 0; background: transparent; color: var(--ui-text-3); }

.ide-warning { display: flex; align-items: center; gap: 8px; flex: none; padding: 7px 12px; border-bottom: 1px solid #f1dfb6; background: #fffaf0; color: #8a5a10; font-size: 11.5px; line-height: 1.5; }
.ide-warning span { flex: 1; min-width: 0; }
.ide-warning-close { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: inherit; cursor: pointer; opacity: .6; }
.ide-warning-close:hover { opacity: 1; background: rgba(138, 90, 16, .1); }

.ide-host { position: relative; flex: 1; min-height: 0; background: #1e1e1e; }
.ide-webview { width: 100%; height: 100%; border: 0; display: flex; }

.ide-state { flex: 1; display: grid; place-items: center; padding: 24px; background: var(--ui-brand-soft); }
.ide-state-card { width: min(520px, 92%); padding: 28px; border: 1px solid var(--ui-brand-soft-2); border-radius: 16px; background: var(--ui-bg, #fff); box-shadow: 0 10px 32px rgba(15, 23, 42, .06); text-align: center; }
.ide-state-card--error { text-align: left; }
.ide-state-icon { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto 14px; border-radius: 16px; background: var(--ui-brand-soft); color: var(--ui-brand); font-size: 20px; }
.ide-state-icon--warn { background: #fff7e6; color: #d18b1f; }
.ide-state-card h3 { margin: 0 0 6px; color: var(--ui-ink-3); font-size: 15px; }
.ide-state-card p { margin: 0; color: var(--ui-text-3); font-size: 12.5px; line-height: 1.7; }
.ide-error-text { margin: 8px 0 14px !important; padding: 9px 11px; border-radius: 8px; background: #fff5f5; color: #b42318 !important; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px !important; word-break: break-word; }
.ide-state-actions { display: flex; gap: 8px; margin-top: 14px; }
.ide-log-hint { margin-top: 12px !important; font-size: 11px !important; word-break: break-all; }
.ide-log-hint code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ide-note { margin-top: 14px !important; padding-top: 12px; border-top: 1px dashed var(--ui-brand-soft-2); font-size: 11.5px !important; }
.ide-note a { color: var(--ui-brand); text-decoration: none; }

.ide-progress { margin-top: 18px; }
.ide-progress-bar { height: 8px; border-radius: 999px; background: var(--ui-brand-soft-2); overflow: hidden; }
.ide-progress-bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--ui-brand-light), var(--ui-brand)); transition: width .25s ease; }
.ide-progress-meta { display: flex; justify-content: space-between; gap: 8px; margin: 8px 0 10px; color: var(--ui-text-3); font-size: 11px; font-variant-numeric: tabular-nums; }

.ide-loading-overlay { position: absolute; inset: 38px 0 0; display: flex; align-items: center; justify-content: center; gap: 9px; background: rgba(30, 30, 30, .92); color: #d4d4d4; font-size: 12.5px; z-index: 2; }
</style>
