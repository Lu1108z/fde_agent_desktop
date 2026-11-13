<template>
  <div class="flex-1 overflow-y-auto p-8">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-slate-800 mb-8">设置</h1>

      <!-- AI Model Config -->
      <div class="glass-card rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <i class="fa-solid fa-robot text-blue-700"></i>
          </div>
          <h2 class="font-semibold text-slate-800">AI 模型配置</h2>
        </div>

        <!-- 网关和模型由管理员固定（主进程 FIXED_GATEWAY / FIXED_MODELS），这里只填 API Key -->
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-600">
            <span><span class="text-slate-400 mr-1.5">网关</span>{{ FIXED_GATEWAY_NAME }}</span>
            <span><span class="text-slate-400 mr-1.5">可用模型</span>{{ FIXED_MODEL_LABELS.join('、') }}</span>
            <span class="text-[12px] text-slate-400"><i class="fa-solid fa-lock mr-1 text-[10px]"></i>由管理员统一设置，聊天时可在两者之间切换</span>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
            <div class="relative">
              <input
                :type="showApiKey ? 'text' : 'password'"
                v-model="form.apiKey"
                placeholder="请输入 360 API Key"
                class="w-full px-3.5 py-2 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all font-mono"
              />
              <button
                @click="showApiKey = !showApiKey"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <i :class="showApiKey ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'" class="text-sm"></i>
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <button
              @click="saveAndActivate"
              :disabled="saving || !form.apiKey.trim()"
              class="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
            >
              <i class="fa-solid mr-1.5 text-xs" :class="saving ? 'fa-spinner fa-spin' : 'fa-check'"></i>
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <button
              @click="testConn"
              :disabled="!form.apiKey.trim() || testing"
              class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-sm transition-colors"
            >
              <i class="fa-solid mr-1.5 text-xs" :class="testing ? 'fa-spinner fa-spin' : 'fa-plug'"></i>
              {{ testing ? '测试中…' : '测试连接' }}
            </button>
            <span v-if="testResult" class="text-xs" :class="testResult.ok ? 'text-blue-600' : 'text-danger-deep'">
                <i class="fa-solid mr-1" :class="testResult.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'"></i>{{ testResult.message || testResult.error }}
            </span>
            <span v-if="saveStatus === 'success'" class="text-xs text-blue-600 font-medium">
              <i class="fa-solid fa-circle-check mr-1"></i>{{ saveMsg || '已保存' }}
            </span>
            <span v-else-if="saveStatus === 'error'" class="text-xs text-danger-deep font-medium">
              <i class="fa-solid fa-triangle-exclamation mr-1"></i>{{ saveMsg || '保存失败' }}
            </span>
          </div>
        </div>
      </div>

      <!-- MCP Servers -->
      <div class="glass-card rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <i class="fa-solid fa-plug text-blue-700"></i>
          </div>
          <h2 class="font-semibold text-slate-800">MCP 服务器</h2>
        </div>
        <p class="text-xs text-slate-500 mb-3">
          MCP (Model Context Protocol) 服务器扩展 AI 的能力——连接外部数据源、API 和工具。
          在 <code class="bg-transparent px-1.5 py-0.5 rounded text-[11px] font-mono">~/.product-lobster/config.yaml</code> 的 <code class="bg-transparent px-1.5 py-0.5 rounded text-[11px] font-mono">mcp_servers:</code> 部分配置。
        </p>
        <button
          @click="openConfigFile"
          class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm transition-colors cursor-pointer"
        >
          <i class="fa-solid fa-file-code mr-1.5 text-xs"></i>
          打开 config.yaml
        </button>
      </div>

      <!-- 外观主题 -->
      <div class="glass-card rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <i class="fa-solid fa-palette text-blue-700"></i>
          </div>
          <h2 class="font-semibold text-slate-800">外观主题</h2>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            v-for="t in THEME_OPTIONS"
            :key="t.key"
            type="button"
            @click="setTheme(t.key)"
            class="text-left rounded-xl border p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            :class="theme === t.key ? 'border-primary bg-primary-soft' : 'border-slate-200 hover:border-primary'"
          >
            <div class="flex items-center gap-2.5 mb-2">
              <!-- 色卡预览：直接用写死的色值，避免受当前主题影响 -->
              <span class="flex gap-1 shrink-0">
                <span v-for="c in t.swatch" :key="c" class="w-4 h-4 rounded" :style="{ background: c }"></span>
              </span>
              <span class="text-[13px] font-semibold text-slate-800">{{ t.name }}</span>
              <i v-if="theme === t.key" class="fa-solid fa-circle-check text-primary text-[12px] ml-auto"></i>
            </div>
            <p class="text-[11.5px] text-slate-500 leading-relaxed">{{ t.desc }}</p>
          </button>
        </div>
      </div>

      <!-- Data Storage -->
      <div class="glass-card rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <i class="fa-solid fa-hard-drive text-blue-700"></i>
          </div>
          <h2 class="font-semibold text-slate-800">数据存储</h2>
        </div>
        <div class="space-y-3">
          <div class="flex items-center justify-between py-2">
            <span class="text-sm text-slate-600">数据目录</span>
            <span class="text-sm text-slate-800 font-mono bg-transparent px-3 py-1 rounded-lg">{{ hermesHome }}</span>
          </div>
          <div class="flex items-center justify-between py-2 border-t border-slate-50">
            <span class="text-sm text-slate-600">项目数量</span>
            <span class="text-sm text-slate-800 font-semibold">{{ projectCount }} 个</span>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="glass-card rounded-2xl border border-slate-100 shadow-sm p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <i class="fa-solid fa-circle-info text-blue-700"></i>
          </div>
          <h2 class="font-semibold text-slate-800">关于</h2>
        </div>
        <div class="space-y-3">
          <div class="flex items-center justify-between py-2">
            <span class="text-sm text-slate-600">应用名称</span>
            <span class="text-sm text-slate-800">FDE产品设计</span>
          </div>
          <div class="flex items-center justify-between py-2 border-t border-slate-50">
            <span class="text-sm text-slate-600">版本号</span>
            <span class="text-sm text-slate-800 font-mono">{{ appVersion }}</span>
          </div>
          <div class="flex items-center justify-between py-2 border-t border-slate-50">
            <span class="text-sm text-slate-600">技术栈</span>
            <span class="text-sm text-slate-500">Electron + Vue 3 + AI Agent</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { FIXED_GATEWAY, FIXED_MODELS } from '../../constants/models.js';
import { useTheme } from '../../composables/useTheme.js';
import { useFixedKeyTest } from '../../composables/useFixedKeyTest.js';

const { theme, setTheme } = useTheme();

const THEME_OPTIONS = [
  {
    key: 'blue',
    name: '蓝色玻璃',
    desc: '品牌蓝 + 四角光晕，卡片走浅蓝斜向渐变，偏清爽的产品感。',
    swatch: ['#2563eb', '#6090f6', '#eff4ff'],
  },
  {
    key: 'brown',
    name: '暖棕磨砂',
    desc: '黄铜棕 + 暖纸底，叠一层颗粒噪点，接近纸张手感的阅读氛围。',
    swatch: ['#8f5a18', '#ac8347', '#f7f5f0'],
  },
];

// --- API Key ----------------------------------------------------------------
// 网关和模型由管理员固定（主进程 FIXED_GATEWAY / FIXED_MODELS 会强制写入），这里只改 Key。
const FIXED_GATEWAY_NAME = FIXED_GATEWAY.name;
const FIXED_MODEL_LABELS = FIXED_MODELS.map((m) => m.label);
const profileId = ref('');
const form = ref({ apiKey: '' });
const { testing, testResult, testConn } = useFixedKeyTest(() => form.value.apiKey);

// 保存：主进程只采用 Key，网关和模型强制用固定值，然后重启引擎生效。
async function saveAndActivate() {
  saving.value = true;
  saveStatus.value = '';
  try {
    const saved = await window.api.gateway.saveProfile({ id: profileId.value, apiKey: form.value.apiKey.trim() });
    if (!saved || !saved.success) throw new Error((saved && saved.error) || '保存失败');
    profileId.value = saved.profile.id;
    const r = await window.api.gateway.activateProfile(saved.profile.id);
    if (!r || !r.success) throw new Error((r && r.error) || '启用失败');
    saveStatus.value = 'success';
    saveMsg.value = '已保存，引擎已重启';
  } catch (e) {
    saveStatus.value = 'error';
    saveMsg.value = e.message;
  } finally {
    saving.value = false;
    setTimeout(() => { saveStatus.value = ''; }, 4000);
  }
}

const showApiKey = ref(false);
const hermesHome = ref('~/.product-lobster');
const projectCount = ref(0);
const appVersion = ref('3.3.8');
const saving = ref(false);
const saveStatus = ref(''); // '' | 'success' | 'error'
const saveMsg = ref('');

onMounted(async () => {
  // Load app version
  if (window.api && window.api.app) {
    try {
      appVersion.value = await window.api.app.getVersion();
    } catch (e) {}
  }

  // Load project count
  if (window.api && window.api.hermes) {
    try {
      const projects = await window.api.hermes.listProjects({ kind: 'project' });
      projectCount.value = projects ? projects.length : 0;
    } catch (e) {}
  }

  if (window.api && window.api.gateway) {
    try {
      const r = await window.api.gateway.listProfiles();
      const active = r && r.success && ((r.profiles || []).find((p) => p.id === r.activeId) || (r.profiles || [])[0]);
      if (active) { profileId.value = active.id; form.value.apiKey = active.apiKey || ''; }
    } catch (e) {
      console.error('listProfiles failed:', e);
    }
  }
});

async function openConfigFile() {
  try {
    const homeDir = await window.api.fs.getHomeDir();
    await window.api.shell.openPath(homeDir + '/.product-lobster/config.yaml');
  } catch (e) {
    console.error('Failed to open config.yaml:', e);
  }
}
</script>
