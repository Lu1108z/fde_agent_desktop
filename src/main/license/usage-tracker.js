/**
 * 功能使用统计：为心跳捎带上报收集本机使用情况（AI 智能对话 / 项目列表）。
 *
 * 主进程在各个 IPC 汇聚点调用 track*()；HeartbeatClient 每次成功上报后调
 * reset() 清零窗口增量。累计值(chatMessagesTotal)持久化到 userData，跨重启累加。
 * 只用于运营统计与用户画像，收集失败/读写失败一律静默，不影响业务。
 *
 * 画像维度（按设备聚合）：
 *   - 次数：messages_delta / list_opens_delta / detail_opens_delta
 *   - 话题：chat topics（项目名=对话话题，按窗口内消息数）
 *   - 内容：recent_previews（最近若干条消息预览，各≤128 字）
 *   - 项目动态：opened（按项目的打开次数+阶段）、created（新建项目）
 *   - 活跃时段：active_hours（本地小时 → 事件数直方图，服务端跨窗口累加）
 */
const fs = require('fs');
const path = require('path');

const PREVIEW_MAX = 128;       // 消息预览长度
const RECENT_PREVIEWS_MAX = 10; // 窗口内保留的消息预览条数
const RECENT_NAMES_MAX = 5;    // 最近项目名保留个数
const TOPIC_MAX = 30;          // 窗口内话题（项目名）上限
const OPENED_PROJECTS_MAX = 30; // 窗口内按项目统计打开次数上限

function previewOf(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_MAX);
}

class UsageTracker {
  /**
   * @param {string} persistPath 累计值持久化文件（userData 下）
   */
  constructor(persistPath) {
    this.persistPath = persistPath || '';
    this.osUsername = this._readOsUsername();
    this.reset();
    this._loadTotals();
  }

  _readOsUsername() {
    try { return require('os').userInfo().username || ''; } catch { return ''; }
  }

  reset() {
    this.windowStart = new Date().toISOString();
    // AI 智能对话（含 AI 代码模式）
    this.chatMessagesDelta = 0;
    this.codeMessagesDelta = 0;   // 其中来自代码模式的消息数
    this.chatMessagesTotal = 0;
    this.chatSessions = new Set();
    this.chatLastPreview = '';
    this.chatLastAt = null;
    this.chatTopics = new Map();   // topic -> { messages, source, last_at }
    this.recentPreviews = [];      // [{ topic, source, text, at }]
    // 项目列表
    this.projectListOpensDelta = 0;
    this.projectDetailOpensDelta = 0;
    this.projectCount = 0;
    this.recentProjectNames = [];
    this.projectLastOpenedAt = null;
    this.openedProjects = new Map(); // name -> { opens, phase, stage }
    this.createdProjects = [];       // [{ name, project_type, at }]
    // 活跃时段：小时(0-23) -> 事件数
    this.activeHours = new Array(24).fill(0);
  }

  _loadTotals() {
    if (!this.persistPath) return;
    try {
      if (fs.existsSync(this.persistPath)) {
        const saved = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));
        if (Number.isFinite(saved.chat_messages_total)) {
          this.chatMessagesTotal = saved.chat_messages_total;
        }
      }
    } catch { /* 损坏则从 0 开始 */ }
  }

  _saveTotals() {
    if (!this.persistPath) return;
    try {
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify({
        chat_messages_total: this.chatMessagesTotal,
      }), 'utf-8');
    } catch { /* 统计数据写失败无碍 */ }
  }

  _bumpActiveHour() {
    try { this.activeHours[new Date().getHours()] += 1; } catch { /* ignore */ }
  }

  /**
   * 用户在 AI 对话发送了一条消息。
   * @param {string} text 消息文本
   * @param {string} sessionKey 会话标识（hermes:xxx / code:xxx）
   * @param {string} topic 对话话题（项目名/会话标题）
   * @param {'chat'|'code'} source 来源：chat=AI 智能对话，code=AI 代码模式
   */
  trackChat(text, sessionKey, topic, source) {
    try {
      const src = source === 'code' ? 'code' : 'chat';
      this.chatMessagesDelta += 1;
      this.chatMessagesTotal += 1;
      if (src === 'code') this.codeMessagesDelta += 1;
      this._bumpActiveHour();
      if (sessionKey) this.chatSessions.add(String(sessionKey));
      const now = new Date().toISOString();
      const preview = previewOf(text);
      if (preview) {
        this.chatLastPreview = preview;
        this.chatLastAt = now;
        const t = String(topic || '').trim() || '未命名对话';
        this.recentPreviews.push({ topic: t.slice(0, 64), source: src, text: preview, at: now });
        if (this.recentPreviews.length > RECENT_PREVIEWS_MAX) this.recentPreviews.shift();
        const entry = this.chatTopics.get(t) || { messages: 0, source: src, last_at: null };
        entry.messages += 1;
        entry.source = src;
        entry.last_at = now;
        this.chatTopics.set(t, entry);
        if (this.chatTopics.size > TOPIC_MAX) {
          // 超上限时淘汰最久未活跃的话题
          const oldest = [...this.chatTopics.entries()].sort((a, b) => String(a[1].last_at).localeCompare(String(b[1].last_at)))[0];
          if (oldest) this.chatTopics.delete(oldest[0]);
        }
      }
      this._saveTotals();
    } catch { /* ignore */ }
  }

  /** 项目列表页被打开（或刷新）。projectCount 由调用方传入当前项目总数。 */
  trackProjectListOpen(projectCount) {
    try {
      this.projectListOpensDelta += 1;
      this._bumpActiveHour();
      if (Number.isFinite(projectCount)) this.projectCount = projectCount;
      this.projectLastOpenedAt = new Date().toISOString();
    } catch { /* ignore */ }
  }

  /** 用户打开了一个项目详情。name 为项目展示名，phase/stage 可选。 */
  trackProjectDetailOpen(name, phase, stage) {
    try {
      this.projectDetailOpensDelta += 1;
      this._bumpActiveHour();
      const n = String(name || '').trim();
      if (n) {
        this.recentProjectNames = [n, ...this.recentProjectNames.filter((x) => x !== n)].slice(0, RECENT_NAMES_MAX);
        const entry = this.openedProjects.get(n) || { opens: 0, phase: '', stage: 0 };
        entry.opens += 1;
        if (phase) entry.phase = String(phase);
        if (Number.isFinite(stage)) entry.stage = Number(stage);
        this.openedProjects.set(n, entry);
        if (this.openedProjects.size > OPENED_PROJECTS_MAX) {
          const oldest = [...this.openedProjects.entries()][0];
          if (oldest) this.openedProjects.delete(oldest[0]);
        }
      }
      this.projectLastOpenedAt = new Date().toISOString();
    } catch { /* ignore */ }
  }

  /** 用户新建了一个项目。 */
  trackProjectCreate(name, projectType) {
    try {
      this._bumpActiveHour();
      const n = String(name || '').trim();
      if (n) this.createdProjects.push({ name: n.slice(0, 64), project_type: String(projectType || ''), at: new Date().toISOString() });
    } catch { /* ignore */ }
  }

  /** 列表加载时刷新已记录项目的阶段进度（不创建条目，只更新已存在的）。 */
  refreshProjectPhase(name, phase, stage) {
    try {
      const n = String(name || '').trim();
      const entry = this.openedProjects.get(n);
      if (!entry) return;
      if (phase) entry.phase = String(phase);
      if (Number.isFinite(stage)) entry.stage = Number(stage);
    } catch { /* ignore */ }
  }

  /** 生成心跳 usage 报文。完全没活动时返回 null（报文不带 usage 字段）。 */
  snapshot() {
    if (this.chatMessagesDelta === 0 && this.projectListOpensDelta === 0 && this.projectDetailOpensDelta === 0 && this.createdProjects.length === 0) {
      return null;
    }
    const usage = {
      since: this.windowStart,
      os_username: this.osUsername,
      active_hours: this.activeHours.slice(),
    };
    usage.chat = {
      messages_delta: this.chatMessagesDelta,
      code_messages_delta: this.codeMessagesDelta,
      messages_total: this.chatMessagesTotal,
      sessions_active: this.chatSessions.size,
      topics: [...this.chatTopics.entries()].map(([name, v]) => ({ name: name.slice(0, 64), messages: v.messages, source: v.source || 'chat', last_at: v.last_at || '' })),
      recent_previews: this.recentPreviews.slice(),
      last_message_preview: this.chatLastPreview,
      last_message_at: this.chatLastAt || '',
    };
    usage.projects = {
      list_opens_delta: this.projectListOpensDelta,
      detail_opens_delta: this.projectDetailOpensDelta,
      count: this.projectCount,
      opened: [...this.openedProjects.entries()].map(([name, v]) => ({ name: name.slice(0, 64), opens: v.opens, phase: v.phase, stage: v.stage })),
      created: this.createdProjects.slice(),
      recent_names: this.recentProjectNames.slice(),
      last_opened_at: this.projectLastOpenedAt || '',
    };
    return usage;
  }
}

module.exports = { UsageTracker };
