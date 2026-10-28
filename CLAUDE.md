# product-lobster-desktop

Hermes agent 桌面版（Electron + Vue 3 + Vite）。前端在 `src/renderer`，主进程 `src/main/index.js`，预加载 `src/preload/index.js`。

## 构建 / 验证

- 只构建渲染层（最快验证前端改动是否编译通过）：`npx vite build --config vite.config.js`
- 完整打包：`npm run build`（win）/ `npm run build:mac`

## 原型（Prototype）预览 —— 项目详情页

阶段②/③ 的「原型」tab。核心文件：[ProjectDetail.vue](src/renderer/pages/projects/ProjectDetail.vue)。

**数据流**：
- 主进程 `hermes:list-files`（[src/main/index.js](src/main/index.js) 约 2181 行）递归列出 `prototype/` 目录下全部文件，返回 `{ name, isDirectory, relPath, path }`，`relPath` 相对 prototype 目录。调用需传 `recursive: true`。
- preload：`window.api.hermes.listFiles(slug, dir, recursive)`。
- 预览地址走本地静态服务 `hermes:prototype-url`（不是 file://，否则原型页 `fetch('data/*.json')` 被拦截、数据空白）。

**渲染约定（ProjectDetail.vue）**：
- `refreshPrototypeFiles()`：拉全部产物（不再只保留 `.html`），每项带 `rel`（=relPath）。加载后**默认折叠所有文件夹**（`collapsedDirs` 填入所有目录前缀）。默认选中顶层第一个 html。
- 文件列表是**真正的文件夹树**：`fileTreeRows` computed 把扁平列表建成嵌套树，再按 `collapsedDirs` 折叠状态摊平成可见行；每层文件夹在前、文件在后，各自按名排序。`toggleDir(path)` 折叠/展开。
- 选中文件预览：html → iframe（`isHtmlSelected`），其余（js/json/css…）→ 深色只读源码视图（`fileSource`）。
- iframe 预览带**缩放控件**（`previewZoom` 0.5~1.5，CSS transform，只缩放视觉、不改原型文件）。原型本身字号偏大是生成侧（原型生成 skill）的规范问题，桌面端只能靠缩放缓解。
- 文件图标按扩展名着色：`fileIcon(rel)`。

## AI 代码 IDE —— 内置 VS Code

代码工作区页面 [CodeWorkspace.vue](src/renderer/pages/code/CodeWorkspace.vue) 默认是 **IDE 模式**（中间内嵌 VS Code），右侧保留原 AI coding 面板；工具栏可切到「经典」模式（原自研编辑器 + 终端）。完整方案见 [docs/vscode-web移植方案.md](docs/vscode-web移植方案.md)。

**主进程模块**：[src/main/ide/](src/main/ide/)

- `code-server.js`：固定 code-server `4.143.1`，优先 `FDE_CODE_SERVER_DIR` → `resources/code-server` → 开发缓存 `.cache/ide/installed/` → `userData/ide/code-server/`，缺失时自动下载并校验 SHA-256（arm64/amd64/win 三个平台都已固定）。运行时直接执行 `lib/node <dir>`。
- `server.js`：单实例服务；`--bind-addr 127.0.0.1:<port> --auth none --disable-workspace-trust`；工作区切换只改 `?folder=` URL，不重启。**端口必须复用**（`pickPort()` 先试上次端口，占用才随机）：localStorage/IndexedDB 按含端口的 origin 隔离，换端口等于丢 IDE 客户端状态，还会在分区里堆历史 origin 导致 workbench 黑屏。状态机 `checking/downloading/installing/preparing/starting/ready/error/unavailable`。退出时按进程组清理（POSIX `kill(-pid)` / Windows `taskkill /T /F`）。
- `locale.js`：**默认中文界面**。装 `MS-CEINTL.vscode-language-pack-zh-hans` → 生成 `<serverDataDir>/languagepacks.json`（key 必须是 `zh-cn`）→ 写 `User/argv.json` 的 `locale`。**少任何一样界面就退回英文**：服务端渲染页面时只读 `languagepacks.json`，`--locale` 单独不够。
- `seed.js`：首次补写 `User/settings.json`（`secondarySideBar.defaultVisibility=hidden`、`security.workspace.trust.enabled=false`、**`chat.disableAIFeatures=true`** 关掉 VS Code 自带 AI），已有的键不动。
- `cli.js`：调 `--install-extension` 的统一入口（code-server 走 `lib/node <dir>`，本机 VS Code 直接调 CLI）。
- `extensions.js`：**预装 Claude Code**（`Anthropic.claude-code`）。缺了才装、失败只提示不阻断；有随包 vsix（`resources/extensions/claude-code-<targetPlatform>.vsix`）就离线装，否则走 Open VSX。
- `claude-bridge.js`：可选开关，把平台网关配置搬给 Claude 插件（写 IDE 自己的 `User/settings.json` 的 `claudeCode.environmentVariables`，**不碰用户的 `~/.claude/settings.json`**）。Claude 只会 Anthropic Messages 协议，所以只在 `apiMode=anthropic_messages` 时才写；OpenAI 协议一律不写、回 `protocol-mismatch`。baseUrl 必须剥掉尾部 `/v1`（Claude 自己拼 `/v1/messages`）。协议判断由主进程注入的 `normalizeGatewayMode` 提供，保证与设置页一致。
- `prefs.js`：后端偏好与各后端上次端口（`preferences.json` 的 `backend` / `ports`）；只有用户显式切换才落盘，回退不算。
- `local-vscode.js`：探测本机 `code serve-web` 作为可选后端（`FDE_IDE_BACKEND=local-vscode` 可强制）。**它不认 `--disable-workspace-trust`，传了会直接退出**；目录布局也不同（`<server-data-dir>/data` + `/extensions`），单独用 `ide/vscode-server-data`。
- `index.js`：注册 `ide:*` IPC、webview 安全策略，并给 IDE 的 webview 会话（`persist:fde-vscode`）补 `Accept-Language: zh-cn`——本机 serve-web 后端只靠这个取语言。`ide:recover` 是空白页自救（清该 session 缓存+存储），只清缓存无效。

**渲染层**

- 界面上统一叫 **FDE Code**（不出现 "VS Code" 字样）；只有「本机 VS Code」这个可选项保留原名，因为那确实是用户装的 VS Code。
- [CodeIdePane.vue](src/renderer/components/code/CodeIdePane.vue)：状态 UI + `<webview>` + 后端切换菜单 + 语言徽标 + AI 面板开关（`fa-angles-right/left`，收起/展开方向随状态变）；`dom-ready` 后 8 秒仍无 `.monaco-workbench` 就调一次 `ide:recover` 并重载（每次加载只自救一次）。
- **图标必须用 FontAwesome 6 里真实存在的名字**：仓库装的是 `@fortawesome/fontawesome-free@7`，`fa-sparkles`、`fa-brackets-curly` 这类 FA7 专有/已改名的图标会渲染成空白方块。新增图标前先 `grep "^\.fa-xxx {" node_modules/@fortawesome/fontawesome-free/css/all.css`。
- [CodeModeSwitch.vue](src/renderer/components/code/CodeModeSwitch.vue)：IDE/经典 切换，IDE 工具栏与经典编辑器工具栏共用；不再放在 AI 面板标题栏（面板可整块收起）。
- IDE 模式与 AI 面板显隐记在 `localStorage`（`fde-code-mode` / `fde-code-ai-visible`）。主窗口 `webPreferences.webviewTag = true`。
- 扩展市场是 **Open VSX**（`userData/ide/extensions`，含 Claude Code `Anthropic.claude-code` / Cline）；微软市场专属扩展（Pylance/C#/Copilot）不可用。
- **打包流程（IDE 资源是必须项）**：
  1. `npm run build:ide:mac` / `build:ide:win` / `build:ide:mac:x64` —— 拉对应平台的运行时 + 语言包 + Claude vsix 到 `build/ide-resources/`，并写 `.platform.json`。
  2. `npm run build:mac` / `build:win` —— 先跑 `check-engine` 与 `check-ide` 两道前置校验，再 `electron-builder`。
  - `extraResources` 已配好 `code-server`、`language-pack-zh-hans.vsix`、`extensions` 三项。
  - `build/ide-resources/` 是**单一路径**，交叉打包会被覆盖：`check-ide-resources.js` 读 `.platform.json` 校验，平台不符直接失败。
  - `check-engine.js` 会读文件头判断 `hermes-acp` 的平台，防止把 mac 引擎塞进 exe。**PyInstaller 不能交叉编译**，Windows 包必须在 Windows 上构建引擎。
  - `npmRebuild: false`：node-pty 自带各平台 prebuilds，交叉打包时不需要（也不能）用 node-gyp 重编。
