# AI 代码模式 → 内置 VS Code IDE：实施方案（v2）

> 适用范围：FDE 产设大师桌面端（Electron 41 + Vue 3 + Vite，`src/main/index.js` 主进程，`src/preload/index.js` 预加载，`src/renderer` 渲染层）。
> 本文在原方案基础上，按项目实际情况重写：修正了开源选型，明确了分发方式、Electron 嵌入方式、与现有 AI coding 的融合方式，以及可执行的验收步骤。

---

## 一、选型结论（先看这里）

| 候选 | 许可证 | macOS | Windows | 终端 | Node 插件宿主 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| **coder/code-server** | MIT | ✅ arm64/x64 | ✅ x64 | ✅ | ✅（完整扩展宿主） | **采用** |
| gitpod-io/openvscode-server | MIT | ❌ 官方只发 linux 包（1.90~1.109 均是） | ❌ | ✅ | ✅ | 淘汰（桌面端无法分发） |
| microsoft/vscode 源码 web 构建 | MIT（核心） | ✅ | ✅ | ❌ | ⚠️ 仅 web 扩展 | 淘汰（能力不完整） |
| Eclipse Theia | EPL-2.0 | ✅ | ✅ | ✅ | ✅ | 备选（体积/改造成本更高） |
| 本机已装 VS Code 的 `code serve-web` | 微软 VS Code Server 许可 | ✅ | ✅ | ✅ | ✅（含微软市场） | **可选后端**（零下载，但依赖用户已安装） |

**结论：以 code-server 作为默认内置后端；把本机 VS Code 的 `code serve-web` 作为可选后端（检测到就允许切换）。**

原方案“只依赖本机 VS Code”的问题：
- 目标客户机器不一定装了 VS Code；Windows portable 版用户尤其可能没有。
- macOS GUI 进程的 PATH 与终端不一致，`code` 常常不可见，需要额外做安装目录探测。
- 把“未安装 → 引导用户装 VS Code”作为唯一路径，产品开箱体验差。

原方案未覆盖的点：
- `serve-web` 的 VS Code Server 许可需要用户确认，不能静默替你接受。
- 扩展市场：微软市场不允许非微软产品使用；code-server 默认走 **Open VSX**。
- 本机 VS Code 升级/卸载会让 IDE 突然不可用，需要有降级后端。

---

## 二、总体架构

```
Vue 渲染层（CodeWorkspace.vue）
├── 左：工作区文件树 / 经典编辑器（保留，IDE 模式下隐藏）
├── 中：<CodeIdePane>                     ← 新增
│     ├── 状态机：checking / downloading / starting / ready / error / unavailable
│     └── <webview src="http://127.0.0.1:<port>/?folder=<workspace>">
└── 右：AI coding 对话面板（保留，ACP + diff 审批）

Electron 主进程
└── src/main/ide/
    ├── index.js            # IPC 注册 + 生命周期
    ├── code-server.js      # 定位 / 下载 / 校验 / 解压 / 版本
    ├── local-vscode.js     # 探测本机 code CLI + serve-web 能力
    ├── server.js           # 后端选择、端口、spawn、健康检查、进程树清理
    ├── paths.js            # userData 下的数据目录
    └── download.js         # HTTPS 下载（重定向、进度、SHA-256）
```

**职责边界**
- 渲染层不碰 `child_process`、不拼命令、不直接扫安装目录；只通过 `window.api.ide.*` 拿状态和 URL。
- 一个应用进程只启动 **一个** IDE Server；切换工作区通过 URL 的 `?folder=` 参数，而不是重启服务。
- AI 的文件读写继续走主进程既有的 `code:*` IPC（带路径逃逸校验）；code-server 的文件监听会自动感知外部改动，无需额外同步。

---

## 三、Electron 嵌入方式：为什么先用 `<webview>`

原方案推荐 `WebContentsView`。本项目采用 **`<webview>`**，理由：

1. 现有页面是 Vue SPA + 自定义三栏布局（文件树 / 编辑器 / AI 对话）。`<webview>` 是一个普通 DOM 元素，天然参与 flex 布局、被父容器裁剪、跟随滚动与 Tab 显隐；`WebContentsView` 是原生视图，浮在 DOM 之上，必须由主进程手工同步 `x/y/width/height`，Tab 切换、拖拽分栏、AI 面板开合都要额外做边界同步。
2. 切 Tab 时 `<webview>` 只是 `display:none`，`webContents` 不销毁，编辑器状态不丢；符合本项目 `AppShellLayout` 的 `RouterView` 结构。
3. 后续如果遇到 webview 的性能/权限瓶颈，再迁移到 `WebContentsView`；接口（URL + 状态）不变。

**需要的主进程改动**
```js
// createWindow() 的 webPreferences
webviewTag: true,
```

**webview 安全策略**
- `nodeIntegration=no`、`contextIsolation=yes`、`sandbox=yes`（guest 侧）。
- 主进程监听 `web-contents-created`，对 `webview` 的 guest：
  - `setWindowOpenHandler` 一律 `deny`（外链交给系统浏览器）。
  - `will-navigate` 只允许 `http://127.0.0.1:<当前端口>`。
  - `will-attach-webview` 强制清掉 `preload`、`nodeIntegration`。
- 不给 IDE guest 注入我们的 preload，IDE 与主进程完全隔离。

---

## 四、后端一：code-server（默认）

### 4.1 版本与分发

- 固定版本：`4.143.1`（对应 VS Code 1.10x，含完整扩展宿主）。
- 资源命名（官方 release）：
  - `code-server-4.143.1-macos-arm64.tar.gz`
  - `code-server-4.143.1-macos-amd64.tar.gz`
  - `code-server-4.143.1-windows-amd64.tar.gz`
  - `code-server-4.143.1-linux-amd64.tar.gz`
- 三种来源，按优先级：
  1. `FDE_CODE_SERVER_DIR` 环境变量（开发/企业内网指定）。
  2. 随安装包分发：`process.resourcesPath/code-server`（打包时由 `scripts/fetch-ide-server.js` 预置，可离线）。
  3. 首次使用时下载到 `userData/ide/code-server/<version>-<platform>/`（如 `4.143.1-macos-arm64`）。
- 下载：HTTPS + 跟随重定向 + 进度事件 + **SHA-256 校验**（校验值在 `code-server.js` 里按版本+平台固定）。校验失败删除临时文件并报错，绝不执行。
- 解压：调用系统 `tar`（macOS / Windows 10+ / Linux 均内置），`shell:false`，参数数组传入。解压后目录名统一重命名为 `<version>-<platform>`，并写 `.fde-installed.json` 标记文件。
- 禁用自动更新：启动参数 `--disable-update-check`；下载版本由应用控制。

### 4.2 启动参数

```text
<code-server>/lib/node <code-server目录>
  --bind-addr 127.0.0.1:<随机端口>
  --auth none
  --disable-telemetry
  --disable-update-check
  --disable-workspace-trust        # 桌面端打开的是用户自己登记的本地目录
  --user-data-dir <userData>/ide/server-data
  --extensions-dir <userData>/ide/extensions
  <工作区绝对路径>          # code-server 用位置参数打开目录（没有 --default-folder）
```

- 端口：`net.createServer().listen(0)` 取空闲端口；若启动失败自动换端口重试一次。
- `--auth none` 只在 `127.0.0.1` 上使用。**这是 loopback 信任模型**：任何本机进程都能访问该端口。对桌面单机应用可接受；如果客户环境有更严格的威胁模型，改用 `--auth password` + 随机密码，并通过一次性登录页自动登录（`webview.executeJavaScript`），但会增加脆弱点，默认不做。
- 工作区切换：`http://127.0.0.1:<port>/?folder=<encodeURIComponent(absPath)>`。code-server 支持 `?folder=` / `?workspace=`。
  - 实测：`GET /` 会 302 到“上次打开的目录”；带 `/?folder=...` 直接返回 200 的 workbench 页面，因此统一使用带 `folder` 的 URL。
- 启动器：直接执行 `lib/node <code-server目录> ...`，绕过 `bin/code-server[.cmd]` 脚本，避免 Windows `.cmd` 的引号问题。
- 首次启动 code-server 需要初始化服务端数据，耗时可能 5~20 秒；UI 必须显示 `starting`，并提供重试。

### 4.3 扩展兼容性（必须向用户说明）

- code-server 默认扩展市场是 **Open VSX**（`https://open-vsx.org`）。绝大多数常用扩展（Python、ESLint、Prettier、Vue、Java、Go、Rust 等）都有。
- **AI 扩展可作内置 AI coding 的补充**：Open VSX 上 `Anthropic.claude-code`（Claude Code，2.1.x）、`saoudrizwan.claude-dev`（Cline）均可安装。因此 IDE 模式下右侧 AI coding 面板可整体收起，给 VS Code 让出宽度。
- **微软市场专属扩展不可用**：Pylance、C#/C# Dev Kit、Remote 系列、GitHub Copilot 等。这是许可证限制，不是技术问题。
- 支持通过环境变量覆盖 gallery（企业内网镜像）：
  ```js
  if (process.env.FDE_EXTENSIONS_GALLERY) {
    env.EXTENSIONS_GALLERY = process.env.FDE_EXTENSIONS_GALLERY;
  }
  ```
- 插件安装在 `userData/ide/extensions`，升级应用不丢；卸载/重置提供显式入口。

### 4.4 中文界面（默认中文）

VS Code 服务端的显示语言解析链（`server-main.js`）：

```text
args.locale || <userData>/User/argv.json 的 locale || cookie vscode.nls.locale
            || Accept-Language || 'en'
```

命中的翻译来自 **`<userData>/languagepacks.json`**，key 是语言包 manifest 里的 `languageId`（中文简体是 **`zh-cn`**，不是 `zh-hans`）。这个文件平时由 workbench 的 `LanguagePackService` 在「安装/卸载扩展」时写出；**服务端渲染页面时只读它、不会自动生成**，缺了它页面里 NLS 脚本地址为空，界面就是英文——这正是最初尝试 `--locale zh-cn` 无效的原因。

因此首启由主进程 `src/main/ide/locale.js` 做三件事（都在 spawn 之前）：

1. 装语言包：`<runtime> --install-extension MS-CEINTL.vscode-language-pack-zh-hans --extensions-dir … --user-data-dir …`；优先用预置 vsix（离线可用），没有才走 Open VSX。
2. 生成 `languagepacks.json`：读扩展的 `extensions.json` 索引与 manifest，按 workbench 的算法（`md5(扩展 id + 版本)` 作 hash）写出 `zh-cn` 条目与全部 translations 映射；**合并写回**，不丢 workbench 自己写过的其它语言。
3. 写默认 locale：`<userData>/User/argv.json` 里没有 `locale` 才补 `{"locale":"zh-cn"}`；用户已在 VS Code 里「配置显示语言」改过就尊重现状。仅当 argv.json 坏到无法解析时，才退回命令行 `--locale`。

失败只降级不阻断：状态里带 `warning`，工具栏显示 `EN` 徽标与一条可关闭提示；安装失败会记一次时间戳，24 小时内不再重复联网重试（避免离线环境每次启动都白等网络超时）。

**本机 VS Code 后端不一样**：它 `product.json` 里配了 `nlsCoreBaseUrl`（vscode-unpkg CDN），语言只从请求头取，`argv.json` 在服务端渲染阶段不参与。所以主进程给 IDE 的 webview 会话（`persist:fde-vscode`）统一补 `Accept-Language: zh-cn,zh;q=0.9,en;q=0.8`。这是解析链里优先级最低的一环，因此不会覆盖用户在 IDE 内的语言选择。

### 4.5 首次写入的用户设置

`src/main/ide/seed.js` 在首次启动时补写 `User/settings.json` 的少量默认键（已有的键一律不动，解析失败就整体放弃不写）：

| 键 | 值 | 原因 |
| --- | --- | --- |
| `workbench.secondarySideBar.defaultVisibility` | `hidden` | VS Code 1.143 默认展开自带「聊天」辅助栏，占约 380px；右侧已有我们的 AI coding，再并一栏会把编辑区压到一半 |

### 4.5b 预置扩展与关闭自带 AI

**默认预装 Claude Code**（`Anthropic.claude-code`，Open VSX 上的官方发行）。理由：内置 code-server 的扩展市场是 Open VSX，用户不一定知道该装哪个；预装后打开活动栏就能看到 Claude，登录即用，作为右侧 AI coding 之外的第二种选择。

实现（`src/main/ide/extensions.js`）：

- 读 `extensions.json` 索引判断是否已装，**缺了才装**；用户卸载过就不再强行装回。
- 优先用随包 vsix（`resources/extensions/claude-code-<targetPlatform>.vsix`）离线安装，没有才走 Open VSX。
- 失败只给提示（与语言包失败提示合并展示），不阻断 IDE 启动。
- 两种后端都走同一套逻辑（`cli.js` 统一了 code-server 的 `lib/node <dir>` 与本机 CLI 的调用差异）。

**关掉 VS Code 自带的 AI**：`chat.disableAIFeatures: true`（写进 `seed.js` 的默认设置）。否则 IDE 里会同时出现三套 AI 入口（右侧我们的面板、VS Code 自带 Chat、Claude 扩展），互相抢焦点。这个键在 1.143 的 workbench 里真实存在（`workbench.js` 里有 `Qc="chat.disableAIFeatures"` 且用于"禁用内置 chat 扩展"的迁移逻辑），已实测生效：活动栏只剩 `Claude Code`，没有 Chat 入口。

注意 vsix 体积：Claude Code 的 vsix 内含约 276 MB 的原生二进制（各平台各一份），压缩后 arm64 121 MB / win32-x64 135 MB。这是"离线可用"的代价，已计入安装包体积。

### 4.6 后端优先级（本地 VS Code vs 自动下载）

**默认内置 code-server，不优先本机 VS Code。** 理由：

| 维度 | 内置 code-server（默认） | 本机 VS Code |
| --- | --- | --- |
| 开箱可用 | 一定可用（已下载过就零等待） | 没装 / 是 portable 版 / PATH 不可见就没有 |
| 首次成本 | 195 MB（打包预置可离线，否则下载一次） | 0 |
| 扩展归属 | 应用自己的 `userData/ide/extensions`，卸载应用才清 | 落在 VS Code 自己的用户目录，和用户日常开发混在一起 |
| 稳定性 | 版本由应用固定 | 用户升级 / 卸载 VS Code 后可能失效 |
| 扩展市场 | Open VSX（含 Claude Code / Cline） | 微软市场 + 用户已装扩展 |

`npm run dev` 之前看起来"总是先下载"，是因为开发态没有预置运行时（`process.resourcesPath` 不存在），缓存目录也还没建立。现在有两条消除首次等待的路径：

- 开发机：`npm run fetch:ide-server` 把运行时预置到 `.cache/ide/installed/`，定位顺序里排在缓存之前，秒开。
- 发布包：`npm run fetch:ide-server -- --package` 复制到 `build/ide-resources/`，配进 electron-builder 的 `extraResources`，安装包自带运行时，完全不下载。

偏好持久化在 `userData/ide/preferences.json`：用户在工具栏显式切到「本机 VS Code」会被记住；**回退**到另一个后端不算用户意愿，不落盘（`src/main/ide/prefs.js`）。

### 4.7 端口复用（必须做，不是优化）

服务端口**不能每次随机**。浏览器的 `localStorage` / `IndexedDB` / Service Worker 按 origin 隔离，而 origin 含端口 —— 每次启动换端口等于每次给 IDE 换一个新 origin。实测后果：

1. IDE 里的客户端状态（布局、打开的编辑器、扩展自己的登录态如 Claude 扩展的 token）重启后全部读不回来，用户感觉"每次都像新装的"。
2. 分区目录 `Partitions/fde-vscode` 里会堆积每个历史端口一份存储。开发机堆到十几个 origin 后，webview 里出现**文档加载完、`workbench.js` 200、但页面上没有 `.monaco-workbench` 的黑屏**，且不抛异常、`reload()` 也不恢复。

因此 `server.js` 用 `pickPort(backend)`：先试 `prefs.savedPort(backend)` 里的上次端口，`portAvailable()` 确认未被占用则复用，否则退回随机空闲端口；服务真正 ready 后才 `prefs.rememberPort()` 落盘。两个后端分开记（`preferences.json` 的 `ports.code-server` / `ports.local-vscode`），因为同时只能跑一个、但切换后各自的 origin 应该保持稳定。

诊断记录（用于以后排查同类问题）：

| 处理 | 黑屏是否恢复 |
| --- | --- |
| `reload()` | 否 |
| 清 HTTP cache（`session.clearCache`） | 否 |
| 清 V8 code cache（`clearCodeCaches`） | 否 |
| 清 partition 存储（`clearStorageData`） | **是** |
| 删掉整个 partition 目录 | 是 |

保留兜底：`ide:recover` IPC（清该 session 的缓存 + 存储），渲染层在 `dom-ready` 后 8 秒仍检测不到 `.monaco-workbench` 时调一次再重载，每次加载只自救一次，防止和真正的启动失败死循环。只动 `persist:fde-vscode` 这个 IDE 专用会话，不影响应用自身页面。

---

## 五、后端二：本机 VS Code `serve-web`（可选）

### 5.1 探测

不要只用 `which code`。GUI 进程 PATH 与登录 Shell 不同。

- macOS：
  - `/opt/homebrew/bin/code`、`/usr/local/bin/code`
  - `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`
  - `~/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`
  - 可追加一次 `zsh -lic 'command -v code'`（超时 3s），仅用于补充 PATH。
- Windows：
  - `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd`
  - `%PROGRAMFILES%\Microsoft VS Code\bin\code.cmd`
  - PATH 中的 `code.cmd` / `code.exe`
- 能力检测：`<cli> serve-web --help` 退出码 0 且输出包含 `serve-web`。
- 对 `.cmd` 使用 `spawn` 时需 `shell:true` 或走 `cmd.exe /c`；绝不用字符串拼接执行。

### 5.2 启动参数

```text
code serve-web
  --host 127.0.0.1
  --port <随机端口>
  --without-connection-token
  --default-folder <工作区>
  --server-data-dir <userData>/ide/vscode-server-data
  --disable-telemetry
```

- 目录布局与 code-server 不同：`--server-data-dir` 下会再套 `data/`（userData）与 `extensions/`。混用两套目录会互相踩配置，因此本机后端单独用 `ide/vscode-server-data`。
- **`serve-web` 不接受 `--disable-workspace-trust`**：传了会当成未知参数直接退出（实测报 `unexpected argument`），表现为「切到本机 VS Code 就失败并回退」。受限模式那条黄条改为在 `settings.json` 里用 `security.workspace.trust.enabled: false` 关掉。
- 许可：`--accept-server-license-terms` **不在首次启动时自动加**。如果 CLI 在无该参数时阻塞等待，就在 UI 里展示许可链接与“我同意并继续”按钮，用户点击后才带参数重启。
- 该后端使用用户自己的 VS Code 与其扩展（含微软市场），但用户升级/卸载 VS Code 后可能失效 → UI 提供“改用内置 IDE”一键切换。

---

## 六、AI coding 与 IDE 的融合

**阶段 1（本次实现）：并排融合**

- 保留现有右侧 AI 对话面板（多会话、流式、工具步骤、diff 审批、token/耗时统计）。
- 中间区域从“自研 textarea 编辑器 + xterm 终端”替换为内嵌 VS Code。
- AI 通过主进程 `code:*` IPC 读写磁盘；code-server 的文件监听自动刷新编辑器与文件树。
- “AI 改文件 → diff 审批 → 落盘 → IDE 立即看到”这条链路不变。
- 左侧自研文件树、经典编辑器、自研终端在 IDE 模式下隐藏；保留一个“经典模式 / IDE 模式”切换，便于回滚与低配机器使用。

**模式切换与 AI 面板位置（按反馈调整）**

- 切换按钮从 AI 对话标题栏移到**各模式自己的工具栏**：IDE 模式下在 IDE 工具栏左侧，经典模式下在编辑器工具栏右侧。共用一个 `CodeModeSwitch.vue`，避免两处各写一套。
- 切换按钮不再依赖 AI 面板存在——AI 面板可以整个收起，按钮仍然在。
- IDE 模式右上角有 **AI 面板开关**（sparkles 图标）；收起后剩一条 32px 竖条，点竖条恢复。AI 对话标题栏也加了收起按钮。
- 因为可以装 Claude Code / Cline 等扩展补足 AI 能力，默认并不强制收起，但布局状态（IDE/经典、AI 面板显隐）都记在 `localStorage`，下次进工作区保持上次选择。

**阶段 2（后续）**

- 把 AI 对话做成 VS Code 扩展：扩展通过本机 HTTP/WebSocket 桥接到主进程 ACP，聊天面板嵌进 IDE 侧边栏，实现“光标处上下文 + 选区解释 + 内联 diff”。
- 需要新增：本机桥接服务（仅 loopback）、扩展打包与预装、`vscode.workspace.fs` 与 ACP 工具的对齐。

---

## 七、状态机与 UI

IDE 面板状态：

| 状态 | 含义 | UI |
| --- | --- | --- |
| `checking` | 正在检测后端/安装目录 | 轻量 loading |
| `downloading` | 首次下载 code-server | 进度条 + 速度 + 可取消 |
| `installing` | 解压/校验 | “正在安装 IDE 运行时…” |
| `starting` | 服务已拉起，等待端口就绪 | 分步提示（首次较慢） |
| `ready` | 可加载 | webview |
| `error` | 启动失败 | 错误原因 + 重试 + 查看日志 |
| `unavailable` | 两个后端都不可用 | 安装引导（下载/指定目录/使用本机 VS Code） |

- 每一步都是显式状态，不能一个长时间无反馈的 Loading。
- 下载支持取消；取消后清理临时文件。
- 启动超时（code-server 60s / 本机 VS Code 90s）后进入 `error`，日志路径可复制。

---

## 八、安全与生命周期（上线要求）

- 只监听 `127.0.0.1`，禁止 `0.0.0.0`。
- 端口随机；端口冲突自动重试。
- 工作区路径必须是已有目录，且来自工作区记录；不接受渲染层传入任意路径。
- 日志脱敏：不打印 token、cookie、完整 URL 查询串。
- 进程归属：只 kill 自己启动的子进程。
  - POSIX：`spawn(..., { detached: true })` 后 `process.kill(-pid, 'SIGTERM')`，超时再 `SIGKILL`。
  - Windows：`taskkill /PID <pid> /T /F`。
  - 绝不按进程名 `pkill code`，避免误杀用户自己的 VS Code。
- 应用退出：`before-quit` / `will-quit` 同步清理；`window-all-closed` 也要清理。
- 崩溃恢复：服务异常退出时状态回到 `error`，允许手动重启；不做无限自动重启。
- 不静默替换二进制：下载地址、版本、哈希全部固定；更新只在应用升级时发生。

---

## 九、目录与 IPC

```
src/main/ide/
├── index.js          # registerIdeIpc() + shutdownIde()
├── backend.js        # 选择/回退后端
├── code-server.js    # 定位、下载、校验、解压
├── local-vscode.js   # 本机 CLI 探测
├── server.js         # spawn / 健康检查 / 停止
├── download.js       # 流式下载 + 进度
└── paths.js          # userData/ide 目录

src/renderer/components/code/CodeIdePane.vue   # IDE 容器 + 状态 UI + webview
scripts/fetch-ide-server.js                    # 可选：打包前预置离线运行时
```

IPC（均经 preload 白名单）：

```js
window.api.ide.status()                      // { state, backend, url, version, logPath }
window.api.ide.ensure({ workspacePath })     // 启动/复用，返回 { success, url, backend, state }
window.api.ide.restart()                     // 手动重启
window.api.ide.stop()
window.api.ide.onStatus(cb)                  // 主进程推送状态/下载进度
```

---

## 十、验证清单

**构建**
- [ ] `npx vite build --config vite.config.js` 通过。
- [ ] `node -c` 校验所有新增主进程文件语法。

**后端**
- [ ] 首次调用 `ensure` 能下载 code-server、校验 SHA-256、解压、启动。
- [ ] `curl http://127.0.0.1:<port>/` 返回 VS Code workbench HTML。
- [ ] `?folder=<工作区>` 能打开指定目录。
- [ ] 端口冲突时自动换端口。
- [ ] 应用退出后进程树被清理（`ps` 无残留）。

**前端**
- [ ] IDE 模式下中间区域渲染 VS Code，AI 面板仍可用。
- [ ] AI 写入文件后 IDE 编辑器出现变更（或提示重新加载）。
- [ ] 经典模式可切回，原编辑器/终端功能不受影响。
- [ ] 未安装/下载失败时显示引导，不是空白页。

**扩展**
- [ ] 在 IDE 内安装一个 Open VSX 扩展（如 `Vue - Official` 或 `Prettier`），重启后仍存在。
- [ ] 明确提示“微软市场专属扩展不可用”。

**安装包**
- [ ] Windows portable / macOS dmg 启动后能找到运行时（打包或首次下载）。
- [ ] 离线包：`scripts/fetch-ide-server.js` 预置后，断网可启动。

---

## 十一、分阶段交付

1. **MVP（本次）**：code-server 自动下载/缓存 + `<webview>` 嵌入 + 与现有 AI 面板并排 + 状态机 + 经典模式回退。
2. **安装体验**：离线打包脚本、下载进度/取消、本机 VS Code 后端切换、许可确认。
3. **产品化**：进程守护、项目目录绑定、扩展市场镜像配置、AI 扩展（阶段 2）。

---

## 十二、明确不做的事

- 不打包、不自动下载 **微软官方 VS Code CLI 二进制**并当作自有组件分发。
- 不默认开启微软扩展市场（许可证不允许）。
- 不在用户未确认时自动接受 VS Code Server 许可。
- 不监听 `0.0.0.0`，不把 IDE 端口暴露到局域网。
- 不杀掉用户自己启动的 VS Code / code-server 进程。

---

## 十三、实施记录（2026-10-28，v2）

### 已落地文件

| 文件 | 作用 |
| --- | --- |
| `src/main/ide/paths.js` | `userData/ide` 下的运行时/数据/扩展/日志/偏好目录 |
| `src/main/ide/download.js` | HTTPS 下载（重定向、进度、SHA-256、取消、`.part` 临时文件） |
| `src/main/ide/code-server.js` | 固定版本 4.143.1、平台映射、定位（env → 打包资源 → 开发缓存 → 用户缓存）、下载/校验/解压 |
| `src/main/ide/local-vscode.js` | macOS/Windows 常见安装目录 + login shell + `serve-web` 能力探测 |
| `src/main/ide/locale.js` | 中文语言包：安装 → 生成 `languagepacks.json` → 写默认 locale（两种后端共用） |
| `src/main/ide/seed.js` | 首次写入 `User/settings.json` 默认键（收辅助栏、关工作区信任提示），不覆盖已有配置 |
| `src/main/ide/prefs.js` | 后端偏好与端口持久化（`preferences.json`）+ 语言包安装失败冷却 |
| `src/main/ide/server.js` | 端口复用（`pickPort`）、spawn、健康检查、状态机（新增 `preparing`）、进程组清理、日志 |
| `src/main/ide/index.js` | IPC 注册（含空白页自救 `ide:recover`）、webview 安全策略、webview 会话 `Accept-Language`、退出清理 |
| `src/renderer/components/code/CodeIdePane.vue` | IDE 状态 UI + `<webview>` + 后端切换菜单 + 语言徽标 + AI 面板开关 |
| `src/renderer/components/code/CodeModeSwitch.vue` | IDE / 经典 切换（IDE 工具栏与经典编辑器工具栏共用） |
| `scripts/fetch-ide-server.js` | 预置离线运行时 + 中文语言包 vsix（`.cache/ide/installed` 或打包资源） |
| `src/preload/index.js` | `window.api.ide.{status,ensure,restart,stop,cancelDownload,recover,onStatus}` |
| `src/renderer/pages/code/CodeWorkspace.vue` | 默认 IDE 模式；AI 面板可收起且状态持久化；经典模式完全保留 |

### 实测结果（macOS arm64）

- code-server `4.143.1`（Code `1.143.1`）自动下载 195 MB → SHA-256 校验通过 → 解压 → 启动成功。
- `GET http://127.0.0.1:<port>/?folder=<workspace>` 返回 200，页面含 `vscode` workbench。
- 同一服务切换工作区：端口复用、URL 仅变化 `folder` 参数。
- 跨应用重启端口复用：`preferences.json` 记下上次端口，第二次启动仍是同一端口（实测连续两次均为 60046）。
- Open VSX 安装扩展实测：`dbaeumer.vscode-eslint@3.0.34` 安装成功并可列出；`anthropic.claude-code@2.1.312` 安装成功。
- Electron `<webview>` 嵌入实测：VS Code 完整界面渲染，文件树正确打开工作区目录。
- 退出清理：`SIGTERM` 结束应用后，code-server 进程组无残留（`SIGTERM`/`SIGINT`/`SIGHUP` + `will-quit` + `process.exit` 兜底）。

### 中文界面（关键结论）

- 只传 `--locale zh-cn` 或只写 `User/argv.json` 都**不生效**：服务端渲染页面时读的是 `<userData>/languagepacks.json`，没有这个文件时 NLS 脚本地址为空。
- `languagepacks.json` 的 key 必须是语言包 manifest 的 `languageId` = **`zh-cn`**（不是 `zh-hans`；`y6()` 只按 `-` 逐段回退，不做别名映射）。
- 补齐三样后页面开始加载 `clp/<hash>.zh-cn/<nlsHash>/nls.messages.js`，实测译文覆盖 18325/24291 条（75.4%），未覆盖的是新增未翻译词条。
- 生产路径实测：`prepareLocale()` 装包 + 生成缓存 + 写 `argv.json` 后，**不传 `--locale`** 也直接是中文；工具栏显示「中文」徽标，资源管理器/欢迎页/命令面板均为中文。
- 本机 `serve-web` 后端实测：语言走 `nlsCoreBaseUrl`（vscode-unpkg CDN），`argv.json` 不参与；补 `Accept-Language: zh-cn` 后页面 NLS 指向 `https://www.vscode-unpkg.net/nls/<commit>/1.143.1/zh-cn/nls.messages.js`，界面中文。

### 布局与交互

- IDE 工具栏：后端徽标可点开切换「内置 IDE / 本机 VS Code」、语言徽标、AI 面板开关、重载、重启、IDE/经典切换。
- 收起 AI 面板后 VS Code 占满中央区域，右侧留 32px 竖条可恢复。
- 默认收起 VS Code 自带「聊天」辅助栏（`workbench.secondarySideBar.defaultVisibility: hidden`），否则会与右侧 AI coding 挤成三列 AI。
- `--disable-workspace-trust` 后「受限模式」黄条消失，编辑器区多出约 32px。

### 修过的坑

- **webview 黑屏（最费时的一个）**：本机后端在应用内偶尔只渲染出空白页，`state: ready`、`workbench.js` 200、无异常、`reload()` 无效。逐层排除 webview 沙箱 / partition / `hardenWebviews()` / 懒加载 / 隐藏容器后，用"挪走 partition 子目录再放回"的二分定位到是 **partition 存储残留**：当时每次启动都取随机端口，分区里堆了十几个历史 origin，workbench bootstrap 静默失败。修法是端口复用（见 4.7），并保留 `ide:recover` 兜底。注意这个坑只在应用内出现、单独 BrowserWindow 复现不了，因为单独复现时都是全新分区。
- `serve-web` 不认 `--disable-workspace-trust`，传了会 `unexpected argument` 直接退出 → 表现为「切本机 VS Code 就失败并回退到 code-server」。改为只给 code-server 传该参数，本机后端用设置项关闭。
- `serve-web` 的 `--server-data-dir` 下会再套 `data/` 与 `extensions/`，与 code-server 的 `--user-data-dir` 布局不兼容，混用会互相踩配置 → 本机后端单独用 `ide/vscode-server-data`。

### 打包（v3：内置 IDE 资源）

`extraResources` 新增三项：`code-server`、`language-pack-zh-hans.vsix`、`extensions`。配套两道前置校验，都是因为 electron-builder 对缺失的 `from` 只警告不报错：

| 脚本 | 校验内容 |
| --- | --- |
| `check-ide-resources.js` | 运行时（`package.json` + `lib/node` 或 `lib/node.exe`）、语言包、对应平台的 Claude vsix 都在位；读 `.platform.json` 确认平台没串 |
| `check-engine.js` | `hermes-acp` 存在，且**读文件头判断平台**与目标一致（MZ→Windows、Mach-O→macos、ELF→linux） |

实测（macOS arm64 宿主）：

- `dmg`：`npm run build:mac` → 648 MB，`Contents/Resources` 内含 code-server 599 MB、extensions 122 MB、语言包 624 KB。用打包产物当 `resourcesPath` 跑一轮验证：运行时/语言包/Claude 全部命中随包资源，`state=ready`、`locale=zh-cn`、活动栏有 Claude Code、无下载。
- `exe`：`electron-builder --win portable --x64` 交叉打包成功 → 488 MB，`resources/code-server/lib/node.exe` 是 PE32+ x86-64、extensions 里是 `claude-code-win32-x64.vsix`。
- **但 Windows 包里的 `hermes-acp` 仍是我在 mac 上暂存的 Mach-O 版本**——PyInstaller 不支持交叉编译，必须在 Windows 上跑 `npm run build:hermes`。为此 `check-engine.js` 加了平台校验，`npm run build:win` 现在会在这里直接失败而不是产出坏包。
- 交叉打包需要 `npmRebuild: false`：`node-pty` 1.1.0 自带 `prebuilds/win32-x64`（含 `pty.node`、`conpty`、`winpty-agent.exe`），而 node-gyp 明确拒绝从源码交叉编译。

### 待补

- **Windows 实机验证**：包能打出来（IDE 资源正确），但引擎必须在 Windows 上重建后才能发布；`userData/ide` 下的进程组清理（`taskkill /T /F`）与 `lib/node.exe` 启动也需在真机跑一遍。
- mac `x64` 包：`build:mac:x64` 脚本与 `macos-amd64` 的 SHA-256 已就位，但未实机验证。
- 离线打包：在 CI/发布机执行 `npm run fetch:ide-server -- --package`，并把 `build/ide-resources/code-server` 与 `build/ide-resources/language-pack-zh-hans.vsix` 加入 electron-builder `extraResources`（未预置时保持首次下载）。
- 发布风险：code-server 自带的 `node` 可执行文件未签名。macOS 从 `userData` 启动一般不受 Gatekeeper 限制（下载不落 quarantine），但需在目标机实测；Windows 需关注企业杀软对未签名 `node.exe` 的拦截，必要时改为随安装包预置并走企业白名单。
- ~~AI 扩展（阶段 2）~~：已预装 Claude Code（见 4.5b）。
- 本机 VS Code 后端的界面语言依赖 vscode-unpkg CDN 取 NLS 脚本（`nlsCoreBaseUrl`），完全离线时会退回英文；内置 code-server 后端不受影响（NLS 由本地服务提供）。
- 中文语言包版本 1.131.0 落后本机 VS Code 1.143.1，个别新增/改动词条会显示成占位符原文（如带终端的欢迎页 `(已替代) {0}`）；等 Open VSX 发布新版语言包后更新 `scripts/fetch-ide-server.js` 里的 `LANG_PACK.version` 即可。
- 工具栏「后端切换菜单」目前在 IDE 启动中/错误态也能点，切过去会重新走一遍启动流程；体验上可以再补一个确认或禁用态。
