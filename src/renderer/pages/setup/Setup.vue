<template>
  <div class="min-h-screen h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50/40 font-sans text-slate-800 antialiased overflow-hidden">
    <!-- 顶部可拖拽条与窗口控制 -->
    <div class="h-10 shrink-0 drag-region flex items-center justify-between px-5">
      <div class="flex items-center gap-2 no-drag">
        <img src="../../assets/logo.png" alt="Logo" class="w-6 h-6 rounded-lg object-cover shadow-sm" />
        <span class="font-semibold text-slate-700 text-[13px]">FDE产品设计 · 初始化</span>
      </div>
      <div class="flex items-center no-drag">
        <button @click="minimizeWindow" class="setup-win-btn" title="最小化">
          <i class="fa-solid fa-minus"></i>
        </button>
        <button @click="toggleMaximize" class="setup-win-btn" title="最大化">
          <i class="fa-solid" :class="isMaximized ? 'fa-clone' : 'fa-square'"></i>
        </button>
        <button @click="closeWindow" class="setup-win-btn setup-win-btn-close" title="关闭">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto flex items-start justify-center p-6">
      <div class="w-full max-w-2xl">
        <!-- 步骤指示 -->
        <div class="flex items-center justify-center gap-2 mb-8">
          <template v-for="(s, i) in steps" :key="i">
            <div class="flex items-center gap-2">
              <span
                class="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors"
                :class="i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'"
              >
                <i v-if="i < step" class="fa-solid fa-check text-[10px]"></i>
                <span v-else>{{ i + 1 }}</span>
              </span>
              <span class="text-[12px] font-medium" :class="i === step ? 'text-blue-700' : 'text-slate-400'">{{ s }}</span>
            </div>
            <div v-if="i < steps.length - 1" class="w-8 h-px bg-slate-200"></div>
          </template>
        </div>

        <div class="glass-card rounded-3xl border border-slate-200/70 shadow-lg shadow-blue-500/5 p-8">
          <!-- 步骤1:授权 -->
          <div v-if="step === 0">
            <h1 class="text-xl font-bold text-slate-800 mb-1">软件授权</h1>
            <p class="text-[13px] text-slate-500 mb-6">填写企业授权码在线激活。内网或断网环境可改用授权文件导入。</p>

            <!-- 机器码 -->
            <div class="rounded-2xl border border-slate-200 bg-transparent/60 p-4 mb-4">
              <div class="text-[11px] text-slate-400 mb-1.5">本机机器码</div>
              <div class="flex items-center gap-2">
                <code class="flex-1 min-w-0 text-[13px] font-mono text-slate-700 glass-card border border-slate-200 rounded-lg px-3 py-2 truncate">{{ machineSn || '计算中...' }}</code>
                <button @click="copySn" :disabled="!machineSn" class="shrink-0 text-[12px] px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40">
                  <i class="fa-solid" :class="copied ? 'fa-check' : 'fa-copy'"></i> {{ copied ? '已复制' : '复制' }}
                </button>
              </div>
            </div>

            <!-- 在线激活 -->
            <div class="rounded-2xl border border-blue-200/70 bg-blue-50/40 p-4 mb-4">
              <div class="text-[11px] text-slate-500 mb-1.5">企业授权码</div>
              <div class="flex items-center gap-2">
                <input
                  v-model="secretKey"
                  type="text"
                  placeholder="填写企业授权码后在线激活"
                  :disabled="activating"
                  @keyup.enter="activateOnline"
                  class="flex-1 min-w-0 text-[13px] font-mono glass-card border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 disabled:opacity-50"
                />
                <button
                  @click="activateOnline"
                  :disabled="activating || !secretKey.trim()"
                  class="shrink-0 text-[12px] px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
                >
                  <i class="fa-solid" :class="activating ? 'fa-spinner fa-spin' : 'fa-bolt'"></i>
                  {{ activating ? ' 激活中' : ' 在线激活' }}
                </button>
              </div>

              <button @click="showServerUrl = !showServerUrl" class="mt-2 text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
                <i class="fa-solid text-[9px]" :class="showServerUrl ? 'fa-chevron-down' : 'fa-chevron-right'"></i> 授权服务地址
              </button>
              <input
                v-if="showServerUrl"
                v-model="serverUrl"
                type="text"
                placeholder="https://授权服务地址"
                :disabled="activating"
                class="mt-1.5 w-full text-[12px] font-mono glass-card border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 disabled:opacity-50"
              />

              <div v-if="activateError" class="mt-2 text-[12px] text-danger-deep flex items-start gap-1.5">
                <i class="fa-solid fa-circle-exclamation mt-0.5"></i><span>{{ activateError }}</span>
              </div>
            </div>

            <!-- 授权状态 -->
            <div v-if="licState" class="mb-4 p-3 rounded-xl text-[12px] flex items-start gap-2"
                 :class="licState.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-soft text-danger-deep'">
              <i class="fa-solid mt-0.5" :class="licState.ok ? 'fa-circle-check' : 'fa-circle-exclamation'"></i>
              <span>
                {{ licStatusText }}
                <!-- TAMPERED 时把真实原因(密钥缺失/不匹配)一并显示:
                     否则用户只看到笼统的「授权文件无效或已损坏」,无从下手。 -->
                <span v-if="licState.message" class="block mt-1 font-mono text-[11px] opacity-80 break-all">{{ licState.message }}</span>
              </span>
            </div>

            <div class="flex items-center justify-between mt-6">
              <button @click="refreshLicense" :disabled="licLoading" class="text-[13px] px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50">
                <i class="fa-solid" :class="licLoading ? 'fa-spinner fa-spin' : 'fa-rotate-right'"></i> 刷新状态
              </button>
              <div class="flex items-center gap-2">
                <button @click="importLicense" :disabled="importing" class="text-[13px] px-3.5 py-2 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40">
                  <i class="fa-solid" :class="importing ? 'fa-spinner fa-spin' : 'fa-file-import'"></i>
                  {{ importing ? ' 导入中' : ' 导入授权文件' }}
                </button>
                <button
                  @click="goNextFromLicense"
                  :disabled="!(licState && licState.ok)"
                  class="text-[13px] px-4 py-2 rounded-xl font-medium text-white transition-colors"
                  :class="(licState && licState.ok) ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'"
                >
                  下一步 <i class="fa-solid fa-arrow-right text-[11px] ml-1"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- 步骤2:环境自检 -->
          <div v-else-if="step === 1">
            <h1 class="text-xl font-bold text-slate-800 mb-1">环境自检</h1>
            <p class="text-[13px] text-slate-500 mb-6">确认运行环境就绪,避免装完跑不起来。</p>

            <div class="space-y-3">
              <div v-for="c in checkRows" :key="c.key" class="flex items-start gap-3 p-3.5 rounded-xl border" :class="rowClass(c.state)">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="iconWrapClass(c.state)">
                  <i :class="iconClass(c.state)"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="text-[13px] font-semibold text-slate-800">{{ c.label }}</div>
                  <div class="text-[12px] mt-0.5" :class="c.state === 'fail' ? 'text-danger-deep' : 'text-slate-500'">{{ c.detail }}</div>
                </div>
                <button
                  v-if="c.key === 'acp' && c.state === 'fail'"
                  @click="restartEngine"
                  :disabled="restarting"
                  class="shrink-0 text-[12px] px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  <i class="fa-solid" :class="restarting ? 'fa-spinner fa-spin' : 'fa-rotate-right'"></i>
                  {{ restarting ? ' 重启中' : ' 重启引擎' }}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between mt-7">
              <button @click="runCheck" :disabled="checking" class="text-[13px] px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50">
                <i class="fa-solid" :class="checking ? 'fa-spinner fa-spin' : 'fa-rotate-right'"></i> 重新检查
              </button>
              <button
                @click="goNextFromCheck"
                :disabled="checking"
                class="text-[13px] px-4 py-2 rounded-xl font-medium text-white transition-colors disabled:opacity-50"
                :class="engineReady ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'"
              >
                下一步:配置 API Key <i class="fa-solid fa-arrow-right text-[11px] ml-1"></i>
              </button>
            </div>
            <p v-if="!engineReady && !checking" class="text-[11px] text-danger mt-3 text-right">
              引擎未就绪,先解决上方红色项。开发模式需先在 hermes-agent 建好 .venv。
            </p>
          </div>

          <!-- 步骤3:填 API Key。网关和模型由管理员固定（主进程 FIXED_GATEWAY / FIXED_MODELS） -->
          <div v-else-if="step === 2">
            <h1 class="text-xl font-bold text-slate-800 mb-1">配置 API Key</h1>
            <p class="text-[13px] text-slate-500 mb-5">填入 360 API Key 即可。网关和模型已由管理员统一设置。</p>

            <div class="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[12.5px] text-slate-600 space-y-1">
              <div><span class="text-slate-400 mr-2">网关</span>{{ FIXED_GATEWAY.name }}</div>
              <div><span class="text-slate-400 mr-2">可用模型</span>{{ FIXED_MODELS.map((m) => m.label).join('、') }}</div>
            </div>

            <label class="block text-[12px] font-medium text-slate-600 mb-1.5">API Key</label>
            <input
              v-model="apiKey"
              type="password"
              placeholder="请输入 360 API Key"
              class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 mb-4"
              @keyup.enter="saveAndFinish"
            />

            <div v-if="testResult" class="mb-4 p-3 rounded-xl text-[12px] flex items-start gap-2"
                 :class="testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-soft text-danger-deep'">
              <i class="fa-solid mt-0.5" :class="testResult.ok ? 'fa-circle-check' : 'fa-circle-exclamation'"></i>
              <span>{{ testResult.message || testResult.error }}</span>
            </div>
            <div class="flex items-center justify-between mt-6">
              <button @click="step = 1" class="text-[13px] px-3.5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
                <i class="fa-solid fa-arrow-left text-[11px] mr-1"></i> 上一步
              </button>
              <div class="flex items-center gap-2">
                <button
                  @click="testConn"
                  :disabled="!apiKey.trim() || testing"
                  class="text-[13px] px-3.5 py-2 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40"
                >
                  <i class="fa-solid" :class="testing ? 'fa-spinner fa-spin' : 'fa-plug'"></i>
                  {{ testing ? ' 测试中' : ' 测试连接' }}
                </button>
                <button
                  @click="saveAndFinish"
                  :disabled="saving || !apiKey.trim()"
                  class="text-[13px] px-4 py-2 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  <i class="fa-solid" :class="saving ? 'fa-spinner fa-spin' : 'fa-check'"></i>
                  {{ saving ? ' 保存中' : ' 保存并进入' }}
                </button>
              </div>
            </div>
          </div>
          <!-- 步骤4:完成 -->
          <div v-else class="text-center py-8">
            <div class="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <i class="fa-solid fa-circle-check text-emerald-500 text-3xl"></i>
            </div>
            <h1 class="text-xl font-bold text-slate-800 mb-1">环境就绪</h1>
            <p class="text-[13px] text-slate-500">正在进入工作台...</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { FIXED_GATEWAY, FIXED_MODELS } from '../../constants/models.js';
import { useFixedKeyTest } from '../../composables/useFixedKeyTest.js';

const router = useRouter();

const isMaximized = ref(false);
const minimizeWindow = () => window.api?.window?.minimize();
const toggleMaximize = () => {
  window.api?.window?.maximize();
  isMaximized.value = !isMaximized.value;
};
const closeWindow = () => window.api?.window?.close();
const steps = ['软件授权', '环境自检', '配置 Key', '完成'];
const step = ref(0);

// --- 授权 ---
const machineSn = ref('');
const copied = ref(false);
const licState = ref(null);
const licLoading = ref(false);
const importing = ref(false);

// 在线取证
const secretKey = ref('');
const serverUrl = ref('');
const showServerUrl = ref(false);
const activating = ref(false);
const activateError = ref('');

const LIC_STATUS_TEXT = {
  ACTIVE_PERMANENT: '已授权(永久)',
  ACTIVE_TEMPORARY: '已授权(临时)',
  GRACE_PERIOD: '授权已到期,处于缓冲期,请尽快续期',
  HARD_EXPIRED: '授权已过期,请导入新的授权文件',
  NO_LICENSE: '尚未授权,请导入授权文件',
  SN_MISMATCH: '授权文件与本机不匹配(换机需重新授权)',
  TAMPERED: '授权文件无效或已损坏',
  CLOCK_ROLLBACK: '检测到系统时间异常,请校正后重试',
  FINGERPRINT_FAIL: '无法读取本机标识',
};
const licStatusText = computed(() => {
  if (!licState.value) return '';
  const s = licState.value.status;
  let t = LIC_STATUS_TEXT[s] || s;
  if (licState.value.customer) t += ` · ${licState.value.customer}`;
  if (licState.value.expireAt) t += ` · 到期 ${licState.value.expireAt}`;
  return t;
});

const loadSn = async () => {
  try {
    const r = await window.api.license.machineSn();
    if (r && r.success) machineSn.value = r.sn;
  } catch (e) { /* ignore */ }
};
const loadServerUrl = async () => {
  try {
    const r = await window.api.license.serverUrl();
    if (r && r.success && r.url) serverUrl.value = r.url;
    else showServerUrl.value = true; // 没有内置地址时直接展开让用户填
  } catch (e) { showServerUrl.value = true; }
};
const activateOnline = async () => {
  activateError.value = '';
  if (!secretKey.value.trim()) { activateError.value = '请填写企业授权码'; return; }
  activating.value = true;
  try {
    const r = await window.api.license.activateOnline({
      secretKey: secretKey.value.trim(),
      serverUrl: serverUrl.value.trim() || undefined,
    });
    if (r && r.success) {
      secretKey.value = '';
      await refreshLicense();
    } else if (r && r.rejected) {
      licState.value = { ok: false, status: r.status };
      activateError.value = LIC_STATUS_TEXT[r.status] || r.status;
    } else {
      activateError.value = (r && r.error) || '激活失败';
    }
  } catch (e) {
    activateError.value = e.message || '激活失败';
  } finally { activating.value = false; }
};
const refreshLicense = async () => {
  licLoading.value = true;
  try {
    const r = await window.api.license.status();
    if (r && r.success !== false) licState.value = r;
  } catch (e) { console.error('license.status failed', e); }
  finally { licLoading.value = false; }
};
const copySn = async () => {
  try { await navigator.clipboard.writeText(machineSn.value); copied.value = true; setTimeout(() => copied.value = false, 1500); }
  catch { /* clipboard 不可用时忽略 */ }
};
const importLicense = async () => {
  importing.value = true;
  try {
    const r = await window.api.license.import();
    if (r && r.success) {
      await refreshLicense();
    } else if (r && r.rejected) {
      licState.value = { ok: false, status: r.status };
    }
  } catch (e) { console.error('license.import failed', e); }
  finally { importing.value = false; }
};
const goNextFromLicense = () => {
  if (!(licState.value && licState.value.ok)) return;
  step.value = 1;
  runCheck();
};

// --- 自检 ---
const checking = ref(false);
const restarting = ref(false);
const checkData = ref(null);

const engineReady = computed(() => checkData.value && checkData.value.engine.ok && checkData.value.acp.ok);

const checkRows = computed(() => {
  const d = checkData.value;
  const st = (ok) => (d ? (ok ? 'ok' : 'fail') : 'pending');
  return [
    { key: 'engine', label: '设计引擎 (hermes-acp)', state: st(d?.engine.ok), detail: d ? (d.engine.ok ? '已找到引擎程序' : d.engine.error) : '检测中...' },
    { key: 'acp', label: '引擎连接', state: st(d?.acp.ok), detail: d ? (d.acp.ok ? '引擎已连接并就绪' : d.acp.error) : '检测中...' },
    { key: 'apiKey', label: 'API Key', state: d ? (d.apiKey.configured ? 'ok' : 'warn') : 'pending', detail: d ? (d.apiKey.configured ? `已配置 (${d.apiKey.provider || 'openai'})` : '尚未配置,下一步填写') : '检测中...' },
  ];
});

const rowClass = (s) => ({ ok: 'border-emerald-100 bg-emerald-50/40', fail: 'border-danger-soft bg-danger-soft/40', warn: 'border-amber-100 bg-amber-50/40', pending: 'border-slate-100 bg-slate-50/40' }[s]);
const iconWrapClass = (s) => ({ ok: 'bg-emerald-100 text-emerald-600', fail: 'bg-danger-soft text-danger-deep', warn: 'bg-amber-100 text-amber-600', pending: 'bg-slate-100 text-slate-400' }[s]);
const iconClass = (s) => ({ ok: 'fa-solid fa-check text-sm', fail: 'fa-solid fa-xmark text-sm', warn: 'fa-solid fa-triangle-exclamation text-xs', pending: 'fa-solid fa-spinner fa-spin text-xs' }[s]);

const runCheck = async () => {
  checking.value = true;
  try {
    const res = await window.api.env.check();
    if (res && res.success) {
      checkData.value = res;
      if (res.allOk) finishToApp();
    }
  } catch (e) { console.error('env.check failed', e); }
  finally { checking.value = false; }
};

const restartEngine = async () => {
  restarting.value = true;
  try {
    await window.api.hermes.restart();
    await runCheck();
  } catch (e) { console.error('restart failed', e); }
  finally { restarting.value = false; }
};

const goNextFromCheck = () => {
  if (!engineReady.value) return;
  step.value = 2;
};

// --- 配置 Key ---
// 网关和模型由管理员固定，主进程保存时会强制写入，这里只收 API Key。
const apiKey = ref('');
const saving = ref(false);
const { testing, testResult, testConn } = useFixedKeyTest(() => apiKey.value);

const saveAndFinish = async () => {
  if (!apiKey.value.trim() || saving.value) return;
  saving.value = true;
  try {
    const saved = await window.api.gateway.saveProfile({ apiKey: apiKey.value.trim() });
    if (!saved || !saved.success) throw new Error((saved && saved.error) || '保存失败');
    // activateProfile 内部负责写 .env / config.yaml 并重启引擎。
    const activated = await window.api.gateway.activateProfile(saved.profile.id);
    if (!activated || !activated.success) throw new Error((activated && activated.error) || '启用失败');
    finishToApp();
  } catch (e) {
    console.error('save failed', e);
    testResult.value = { ok: false, error: '保存失败:' + (e.message || '') };
  } finally {
    saving.value = false;
  }
};

const finishToApp = () => {
  step.value = 3;
  setTimeout(() => router.replace('/'), 800);
};

onMounted(async () => {
  if (window.api?.window) {
    try {
      isMaximized.value = await window.api.window.isMaximized();
      window.api.window.onMaximizedChanged((...args) => {
        const value = args.length > 1 ? args[1] : args[0];
        if (typeof value === 'boolean') isMaximized.value = value;
      });
    } catch { /* ignore */ }
  }
  await loadSn();
  await loadServerUrl();
  await refreshLicense();
  // 已授权 → 直接进环境自检
  if (licState.value && licState.value.ok) {
    step.value = 1;
    runCheck();
  }
});
</script>

<style scoped>
.drag-region { -webkit-app-region: drag; }
.no-drag { -webkit-app-region: no-drag; }
.setup-win-btn {
  -webkit-app-region: no-drag;
  width: 34px;
  height: 28px;
  border-radius: 8px;
  color: #64748b;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color .15s ease, background-color .15s ease;
}
.setup-win-btn:hover { color: #334155; background: rgba(148, 163, 184, .16); }
.setup-win-btn-close:hover { color: #fff; background: #ef4444; }
</style>
