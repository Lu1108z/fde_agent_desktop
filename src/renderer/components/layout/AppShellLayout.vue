<template>
  <div class="app-root">
    <!-- 授权到期遮罩:过了 expire_at(缓冲期/硬过期)或授权异常 → 全屏阻断,必须导入新授权 -->
    <div v-if="licenseBlock" class="license-overlay">
      <div class="license-overlay-drag"></div>
      <div class="license-card no-drag">
        <div class="license-card-icon">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <h2 class="license-card-title">{{ licenseBlock.title }}</h2>
        <p class="license-card-desc">{{ licenseBlock.desc }}</p>
        <div v-if="licenseBlock.detail" class="license-card-detail">{{ licenseBlock.detail }}</div>
        <button class="license-card-btn" :disabled="importing" @click="importLicense">
          <i class="fa-solid fa-file-import"></i>
          {{ importing ? '正在导入…' : '导入授权文件' }}
        </button>
        <p v-if="importError" class="license-card-err">{{ importError }}</p>
        <p class="license-card-sn" v-if="licenseInfo && licenseInfo.sn">机器码:{{ licenseInfo.sn }}</p>
      </div>
    </div>

    <!-- 窗口控制保留在独立的拖拽栏，避免顶部导航占用原生窗口操作区域。 -->
    <header class="app-titlebar drag-region">
      <span class="titlebar-caption">FDE 产品设计</span>
      <div class="titlebar-right no-drag">
        <button @click="minimizeWindow" class="win-btn" title="最小化">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
        <button @click="toggleMaximize" class="win-btn" title="最大化">
          <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.2"/></svg>
          <svg v-else width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2.2" y="3.2" width="4.6" height="4.6" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M3.6 3V2.2A.8.8 0 0 1 4.4 1.4h3.4a.8.8 0 0 1 .8.8v3.4a.8.8 0 0 1-.8.8H7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
        <button @click="closeWindow" class="win-btn win-btn--close" title="关闭">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
      </div>
    </header>

    <header class="app-header">
      <RouterLink to="/" class="header-brand" aria-label="返回工作台">
        <img src="../../assets/logo.png" alt="" class="header-logo" />
        <span>FDE 产品设计</span>
      </RouterLink>

      <nav ref="navElement" class="header-nav" aria-label="主要导航" @keydown.esc.stop.prevent="closeNav">
        <div v-for="item in primaryNav" :key="item.to" class="header-nav-group" :class="{ 'header-nav-group--open': openNav === item.to }" @mouseenter="enterNav(item)" @mouseleave="leaveNav(item)" @focusin="focusNav(item, $event)" @focusout="leaveNavFocus(item, $event)" @click="closeNav" @contextmenu.prevent="closeNav">
          <RouterLink
            :to="item.to"
            class="header-nav-link"
            :class="item.match(route.path) ? 'header-nav-link--active' : ''"
            :aria-current="item.match(route.path) ? 'page' : undefined"
            :aria-expanded="item.children?.length ? openNav === item.to : undefined"
            :aria-controls="item.children?.length ? 'header-subnav-' + item.to.slice(1) : undefined"
          >
            <i :class="item.icon" aria-hidden="true"></i>
            <span>{{ item.label }}</span>
          </RouterLink>
          <div v-if="item.children?.length" :id="'header-subnav-' + item.to.slice(1)" class="header-subnav" :aria-hidden="openNav !== item.to" :inert="openNav !== item.to">
            <RouterLink v-for="child in item.children" :key="child.to" :to="child.to" class="header-subnav-link" :class="child.match(route.path) ? 'header-subnav-link--active' : ''">
              <i :class="child.icon" aria-hidden="true"></i>
              <span>{{ child.label }}</span>
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="header-actions">
        <div class="header-status" :title="engineTitle">
          <span class="status-dot" :class="engineDotCls"></span>
          <span>{{ engineText }}</span>
        </div>
        <span v-if="licenseChip" class="header-license" :class="licenseChip.cls" :title="licenseChip.title">
          <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
          {{ licenseChip.text }}
        </span>
        <RouterLink to="/settings" class="header-settings" :class="isSettingsRoute ? 'header-settings--active' : ''" :title="`设置 · ${appVersionShort}`" aria-label="设置">
          <i class="fa-solid fa-gear" aria-hidden="true"></i>
        </RouterLink>
      </div>
    </header>

    <main class="app-content">
      <RouterView v-slot="{ Component, route: pageRoute }">
        <KeepAlive include="AgentHome,Coach">
          <component :is="Component" :key="pageRoute.path" />
        </KeepAlive>
      </RouterView>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isMaximized = ref(false);
const appVersion = ref('v3.3.8');
const licenseInfo = ref(null);
const importing = ref(false);
const importError = ref('');

// AI 引擎就绪状态
const engineReady = ref(null); // null=检测中, true=就绪, false=未就绪
let licenseTimer = null;

// 版本号去掉前缀 v,状态条里用 5.7.0 这样的纯数字胶囊
const appVersionShort = computed(() => String(appVersion.value).replace(/^v/i, ''));

const engineText = computed(() =>
  engineReady.value === true ? 'AI 引擎就绪'
  : engineReady.value === false ? 'AI 引擎未就绪'
  : 'AI 引擎检测中'
);
const engineDotCls = computed(() =>
  engineReady.value === true ? 'dot-blue'
  : engineReady.value === false ? 'dot-amber'
  : 'dot-gray'
);
const engineTitle = computed(() =>
  engineReady.value === true ? 'AI 引擎已就绪,可正常对话'
  : engineReady.value === false ? 'AI 引擎未就绪,请前往设置检查引擎/密钥'
  : '正在检测 AI 引擎状态…'
);

const isSettingsRoute = computed(() => route.path === '/settings');

// 项目入口默认进入第一项项目进度，次级页面通过悬停/键盘聚焦菜单访问。
const primaryNav = [
  { to: '/', label: '工作台', icon: 'fa-solid fa-table-columns', match: (p) => p === '/' },
  { to: '/project-management', label: '项目', icon: 'fa-solid fa-folder-open', match: (p) => p.startsWith('/projects') || p === '/project-spec' || p.startsWith('/project-management'), children: [
    { to: '/project-management', label: '项目进度', icon: 'fa-solid fa-chart-simple', match: (p) => p === '/project-management' },
    { to: '/projects', label: '项目与交付物', icon: 'fa-solid fa-folder-open', match: (p) => p.startsWith('/projects') },
    { to: '/project-spec', label: 'FDE 项目规范', icon: 'fa-solid fa-clipboard-list', match: (p) => p === '/project-spec' },
  ] },
  { to: '/coach', label: '培训', icon: 'fa-solid fa-graduation-cap', match: (p) => p === '/training' || p === '/coach', children: [
    { to: '/coach', label: 'FDE 教练陪练', icon: 'fa-solid fa-headset', match: (p) => p === '/coach' },
    { to: '/training', label: '培训教程', icon: 'fa-solid fa-graduation-cap', match: (p) => p === '/training' },
  ] },
  { to: '/chat', label: 'AI 助手', icon: 'fa-solid fa-comments', match: (p) => p === '/chat' || p.startsWith('/code') || p === '/apps' || p === '/experts', children: [
    { to: '/chat', label: 'AI 智能对话', icon: 'fa-solid fa-comments', match: (p) => p === '/chat' },
    { to: '/code', label: 'AI 代码模式', icon: 'fa-solid fa-code', match: (p) => p.startsWith('/code') },
    { to: '/apps', label: 'AI 应用广场', icon: 'fa-solid fa-store', match: (p) => p === '/apps' || p === '/experts' },
  ] },
  { to: '/library/team', label: '资源', icon: 'fa-solid fa-book-open', match: (p) => p.startsWith('/library') || p === '/knowledge' || p === '/skills', children: [
    { to: '/library/team', label: '团队资料库', icon: 'fa-solid fa-folder-open', match: p => p === '/library/team' },
    { to: '/library/repository', label: '代码仓', icon: 'fa-solid fa-code-branch', match: p => p === '/library/repository' },
    { to: '/knowledge', label: '知识中心', icon: 'fa-solid fa-book-open', match: (p) => p === '/knowledge' },
    { to: '/skills', label: '技能中心', icon: 'fa-solid fa-brain', match: (p) => p === '/skills' },
  ] },
];

// 顶栏授权徽章:客户名 + 有效期(永久/剩余天数/缓冲期)
const licenseChip = computed(() => {
  const l = licenseInfo.value;
  if (!l || !l.customer) return null;
  const customer = l.customer;
  if (l.status === 'ACTIVE_PERMANENT' || l.licenseType === 'permanent') {
    return { text: `${customer} · 永久`, cls: 'lic-gray', title: `已授权:${customer}(永久授权)` };
  }
  if (l.status === 'GRACE_PERIOD') {
    return { text: `${customer} · 已到期`, cls: 'lic-red', title: `${customer} · 授权已到期,处于缓冲期,请尽快续期` };
  }
  if (l.status === 'ACTIVE_TEMPORARY' && l.expireAt) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exp = new Date(l.expireAt + 'T00:00:00');
    const days = Math.ceil((exp - today) / 86400000);
    const cls = days <= 7 ? 'lic-red' : days <= 30 ? 'lic-amber' : 'lic-gray';
    const text = days <= 0 ? `${customer} · 今日到期` : `${customer} · 剩 ${days} 天`;
    return { text, cls, title: `${customer} · 有效期至 ${l.expireAt}(剩 ${days} 天)` };
  }
  return null;
});

// 授权阻断遮罩:任何“过了到期日”或授权异常的状态都要挡住使用。
// 覆盖:GRACE_PERIOD(缓冲期,已过 expire)/ HARD_EXPIRED / NO_LICENSE / SN_MISMATCH / TAMPERED / CLOCK_ROLLBACK / FINGERPRINT_FAIL
const licenseBlock = computed(() => {
  const l = licenseInfo.value;
  if (!l) return null; // 尚未取到状态,先不阻断,避免误挡
  const customer = l.customer || '';
  const who = customer ? `${customer} 的` : '';
  switch (l.status) {
    case 'GRACE_PERIOD': {
      // 已到期,处于缓冲期——按你的要求同样弹窗阻断
      const detail = l.expireAt ? `授权已于 ${l.expireAt} 到期` : '';
      return { title: '授权已到期', desc: `${who}授权已到期,请导入新的授权文件后继续使用。`, detail };
    }
    case 'HARD_EXPIRED':
      return { title: '授权已过期', desc: `${who}授权已过期,请导入新的授权文件后继续使用。`, detail: l.expireAt ? `到期日:${l.expireAt}` : '' };
    case 'NO_LICENSE':
      return { title: '未授权', desc: '本机尚未导入授权文件,请导入授权文件以激活软件。', detail: '' };
    case 'SN_MISMATCH':
      return { title: '授权与本机不匹配', desc: '当前授权文件绑定的机器码与本机不一致,请使用为本机签发的授权文件。', detail: '' };
    case 'CLOCK_ROLLBACK':
      return { title: '检测到系统时间异常', desc: '系统时间被回拨,授权校验无法通过。请将系统时间调整正确后重试。', detail: '' };
    case 'TAMPERED':
      return { title: '授权文件无效', desc: '授权文件已损坏或被篡改,请重新导入有效的授权文件。', detail: '' };
    case 'FINGERPRINT_FAIL':
      return { title: '无法读取机器码', desc: '无法获取本机机器码,授权校验失败,请联系技术支持。', detail: '' };
    default:
      // ACTIVE_PERMANENT / ACTIVE_TEMPORARY 或未知的 ok:true 状态 → 不阻断
      return l.ok ? null : { title: '授权校验未通过', desc: '授权状态异常,请导入有效的授权文件。', detail: l.status ? `状态:${l.status}` : '' };
  }
});

// One menu owns the dropdown; a previously clicked link must not keep another menu open.
const navElement = ref(null), openNav = ref('');
function closeNav() { openNav.value = ''; }
function enterNav(item) { openNav.value = item.children?.length ? item.to : ''; }
function leaveNav(item) { if (openNav.value === item.to) closeNav(); }
function focusNav(item, event) {
  if (event.target.matches?.(':focus-visible')) enterNav(item);
}
function leaveNavFocus(item, event) {
  if (!event.currentTarget.contains(event.relatedTarget) && openNav.value === item.to) closeNav();
}
function dismissNav(event) { if (!navElement.value?.contains(event.target)) closeNav(); }
watch(() => route.fullPath, closeNav);
function obscureOnlinePages(payload) {
  window.api?.feishuOnline?.obscured(payload);
  window.api?.geelibOnline?.obscured(payload);
}
watch(() => !!openNav.value, value => obscureOnlinePages({ reason: 'navigation', value }), { immediate: true });
onMounted(() => { window.addEventListener('pointerdown', dismissNav); window.addEventListener('blur', closeNav); });
onUnmounted(() => { window.removeEventListener('pointerdown', dismissNav); window.removeEventListener('blur', closeNav); });
watch(licenseBlock, value => obscureOnlinePages({ reason: 'license', value: !!value }), { immediate: true });
onUnmounted(() => obscureOnlinePages({ reason: 'navigation', value: false }));

const loadLicense = async () => {
  try {
    if (window.api?.license?.status) {
      const r = await window.api.license.status();
      if (r && r.success !== false) licenseInfo.value = r;
    }
  } catch (e) { /* ignore */ }
};

// 导入授权文件:调主进程弹文件选择器 → 校验落盘 → 重新拉状态。成功即撤下遮罩。
const importLicense = async () => {
  if (importing.value) return;
  importError.value = '';
  importing.value = true;
  try {
    if (!window.api?.license?.import) { importError.value = '当前环境不支持导入,请联系技术支持。'; return; }
    const res = await window.api.license.import();
    if (res && res.canceled) { return; } // 用户取消,静默
    if (res && res.success) {
      // 主进程仅在校验通过(ok)时才返回 success:true 并落盘
      await loadLicense(); // 刷新状态,licenseBlock 会随之消失
      importError.value = '';
    } else {
      const reason = res && (res.reason || res.status || res.error);
      importError.value = reasonText(reason);
    }
  } catch (e) {
    importError.value = '导入失败:' + (e && e.message ? e.message : '未知错误');
  } finally {
    importing.value = false;
  }
};

// 把校验状态码翻译成给用户看的话
const reasonText = (r) => {
  switch (r) {
    case 'SN_MISMATCH': return '该授权文件不是为本机签发的(机器码不匹配)。';
    case 'HARD_EXPIRED': return '该授权文件已过期。';
    case 'GRACE_PERIOD': return '该授权文件已到期(处于缓冲期),请使用有效授权。';
    case 'TAMPERED': return '授权文件已损坏或被篡改。';
    case 'CLOCK_ROLLBACK': return '检测到系统时间被回拨,请校正系统时间后重试。';
    case 'FINGERPRINT_FAIL': return '无法读取本机机器码。';
    case 'NO_LICENSE': return '未选择有效的授权文件。';
    default: return r ? ('导入失败:' + r) : '导入失败,请确认授权文件是否有效。';
  }
};

// 检测 AI 引擎就绪状态(引擎可执行 + 密钥已配 + ACP 就绪)
const checkEngine = async () => {
  try {
    if (!window.api?.env?.check) { engineReady.value = null; return; }
    const res = await window.api.env.check();
    if (!res || !res.success) { engineReady.value = null; return; }
    engineReady.value = !!(res.engine?.ok && res.apiKey?.configured && res.acp?.ok);
  } catch (e) { engineReady.value = null; }
};

onMounted(async () => {
  if (window.api && window.api.window) {
    try {
      isMaximized.value = await window.api.window.isMaximized();
      window.api.window.onMaximizedChanged((event, isMax) => {
        isMaximized.value = isMax;
      });
    } catch (e) {}
  }
  if (window.api && window.api.app) {
    try {
      appVersion.value = 'v' + await window.api.app.getVersion();
    } catch (e) {}
  }
  loadLicense();
  // 每 60s 复查一次授权,修掉“开着不动就永不复查”的问题:缓冲期跨进硬过期、时钟异常等都能及时挡住
  licenseTimer = setInterval(loadLicense, 60000);

  checkEngine();
});

onUnmounted(() => {
  if (licenseTimer) clearInterval(licenseTimer);
});

const minimizeWindow = () => {
  if (window.api) window.api.window.minimize();
};

const toggleMaximize = () => {
  if (window.api) window.api.window.maximize();
};

const closeWindow = () => {
  if (window.api) window.api.window.close();
};
</script>

<style scoped>
/* 授权到期遮罩:全屏、最高层级、阻断一切交互 */
.license-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
/* 顶部一条可拖拽区,遮罩下仍能移动/关闭窗口 */
.license-overlay-drag {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 52px;
  -webkit-app-region: drag;
}
.license-card {
  position: relative;
  width: 420px;
  max-width: calc(100vw - 48px);
  background: #ffffff;
  border-radius: 16px;
  padding: 32px 32px 28px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
  text-align: center;
}
.license-card-icon {
  width: 56px; height: 56px;
  margin: 0 auto 16px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  background: #fef2f2;
  color: #dc2626;
  font-size: 24px;
}
.license-card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-ink);
  margin: 0 0 8px;
}
.license-card-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ui-text);
  margin: 0 0 6px;
}
.license-card-detail {
  font-size: 12px;
  color: var(--ui-text-3);
  margin: 0 0 20px;
}
.license-card-btn {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 22px;
  border: none;
  border-radius: 10px;
  background: var(--ui-brand);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.license-card-btn:hover:not(:disabled) { background: var(--ui-brand-dark); }
.license-card-btn:disabled { opacity: 0.6; cursor: default; }
.license-card-err {
  font-size: 12px;
  color: #dc2626;
  margin: 12px 0 0;
}
.license-card-sn {
  font-size: 11px;
  color: var(--ui-line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin: 16px 0 0;
  word-break: break-all;
}

.drag-region {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}

/* 浅蓝灰的桌面框架：独立窗口栏 + 横向主导航 + 页面内容。 */
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  color: var(--ui-ink-2);
  background: #fff;
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.app-titlebar {
  height: 29px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 0 18px;
  background: #fff;
  border-bottom: 1px solid #e9eef8;
}
.titlebar-caption { color: #8a99b3; font-size: 10px; font-weight: 600; letter-spacing: 0.02em; }
.titlebar-right { display: inline-flex; align-items: center; gap: 3px; }
.win-btn {
  width: 28px; height: 23px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px; color: #8190aa;
  transition: background 0.16s, color 0.16s;
}
.win-btn:hover { background: #eef3fc; color: #28416b; }
.win-btn--close:hover { background: #ef4444; color: white; }

.app-header {
  height: 61px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 0 30px;
  position: relative;
  z-index: 30;
  background: #fff;
  border-bottom: 1px solid #e8eef8;
  box-shadow: 0 2px 16px rgba(47, 89, 170, 0.04);
}
.header-brand {
  display: inline-flex; align-items: center; gap: 10px;
  flex-shrink: 0;
  color: #172642; font-size: 18px; font-weight: 750; letter-spacing: -0.02em; white-space: nowrap;
}
.header-logo { width: 34px; height: 34px; object-fit: contain; }
.header-nav { height: 100%; display: flex; align-items: stretch; gap: 7px; }
.header-nav-group { position: relative; display: flex; align-items: center; }
.header-nav-link {
  min-width: 88px; height: 40px; padding: 0 13px;
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  position: relative; border-radius: 10px;
  color: #7183a4; font-size: 14px; font-weight: 600; white-space: nowrap;
  transition: background 0.16s, color 0.16s;
}
.header-nav-link i { font-size: 15px; }
.header-nav-link:hover, .header-nav-link:focus-visible { background: #f0f5ff; color: #2866e9; }
.header-nav-link--active { color: #2563eb; background: #eef4ff; }
.header-nav-link--active::after {
  content: ''; position: absolute; height: 3px; left: 15px; right: 15px; bottom: -11px;
  border-radius: 3px 3px 0 0; background: #2563eb;
}
.header-subnav {
  position: absolute; top: 100%; left: 0; min-width: 188px;
  padding: 8px; background: #fff; border: 1px solid #e2eafb;
  border-radius: 12px; box-shadow: 0 14px 36px rgba(33, 69, 129, 0.13);
  opacity: 0; visibility: hidden; transform: translateY(5px);
  pointer-events: none;
}
.header-nav-group--open .header-subnav { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); transition: opacity 0.15s, transform 0.15s; }
.header-subnav-link {
  display: flex; align-items: center; gap: 10px;
  min-height: 36px; padding: 0 10px; border-radius: 7px;
  color: #576a89; font-size: 13px; white-space: nowrap;
}
.header-subnav-link i { width: 17px; text-align: center; color: #8597b6; }
.header-subnav-link:hover, .header-subnav-link:focus-visible, .header-subnav-link--active { background: #eef4ff; color: #2563eb; }
.header-subnav-link:hover i, .header-subnav-link--active i { color: #2563eb; }
.header-actions { display: flex; align-items: center; gap: 16px; margin-left: auto; white-space: nowrap; }
.header-status { display: flex; align-items: center; gap: 8px; color: #7183a4; font-size: 12px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-blue { background: #3b82f6; box-shadow: 0 0 0 3px #dbeafe; }
.dot-amber { background: #f59e0b; box-shadow: 0 0 0 3px #fef3c7; }
.dot-gray { background: #a8b5c9; box-shadow: 0 0 0 3px #edf1f7; }
.header-license { padding: 6px 9px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.header-license i { margin-right: 4px; }
.header-license.lic-gray { color: #6f809c; background: #f0f3f9; }
.header-license.lic-amber { color: #a9670b; background: #fffbeb; }
.header-license.lic-red { color: #b91c1c; background: #fef2f2; }
.header-settings {
  width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px; color: #7183a4; font-size: 16px;
}
.header-settings:hover, .header-settings:focus-visible, .header-settings--active { background: #eef4ff; color: #2563eb; }
.app-content {
  flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column;
  overflow: hidden; background: #fff;
}
@media (prefers-reduced-motion: reduce) {
  .header-nav-link, .header-subnav, .win-btn { transition: none; }
}
</style>
