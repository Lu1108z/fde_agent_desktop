# Claude Code 插件复用平台 AI 配置 —— 方案与实施

> 背景：FDE Code 默认预装 `Anthropic.claude-code`。用户机器上如果没有 Claude 的配置，
> 插件能打开但一发消息就 `Not logged in · Please run /login`，容易被当成插件坏了。
> 本文记录实测结论与分期方案。

## 一、实测结论（决定方案走向的事实）

### 1.1 没有配置文件就是不可用

```
env -i HOME=/tmp/nohome PATH=/usr/bin:/bin claude -p "hi"
→ Not logged in · Please run /login
```

插件本身装得上、界面能开，但会话起不来。所以「什么都不做」对无配置用户是不合格的体验。

### 1.2 Claude Code 只会说 Anthropic Messages 协议

在本地起假服务端抓真实出站请求（`claude` 2.1.312 原生二进制）：

```
POST /v1/messages?beta=true
authorization: Bearer <token>
anthropic-version: 2023-06-01
body: { model, messages, system, tools[12], metadata, max_tokens,
        thinking, context_management, output_config, stream }
```

二进制里搜不到任何以 `chat/completions` 出站的客户端代码。**结论：它没有 OpenAI 兼容模式。**

平台配置的协议决定可行性：

| 平台档案 `apiMode` | 能否直接复用 | 原因 |
| --- | --- | --- |
| `anthropic_messages` | ✅ | 协议同构，改地址和凭据即可 |
| `chat_completions` | ❌ | OpenAI 协议网关没有 `/v1/messages` 路由 |
| `codex_responses` | ❌ | 同上（OpenAI 官方 `/responses` 不是 Messages API） |

平台预设里 **360 网关默认就是 `chat_completions`**，所以「不能直连」是主路径而非边缘情况。

> 实测线索：`https://api.360.cn/v1/messages` 无凭据返回 **401**，而 `/v1/definitely-not-a-real-endpoint` 返回 **404**。
> 401/404 的区别说明 360 很可能**原生支持** Anthropic Messages 路由。若属实，360 用户把协议改成
> `anthropic_messages` 即可直连，无需中转。**待用真实 key 验证。**

### 1.3 三个必须避开的坑

1. **baseUrl 不能带 `/v1`**。Claude 在 base 后拼 `/v1/messages`：
   实测 `ANTHROPIC_BASE_URL=http://127.0.0.1:47996/v1` → 实际请求 `POST /v1/v1/messages`。
   平台档案的 baseUrl 是 OpenAI 习惯（`…/v1`），搬运时**必须剥掉尾缀**。
2. **不要写用户的 `~/.claude/settings.json`**。那是用户全局 Claude Code 的配置，
   写进去会污染他终端里的 Claude，还可能覆盖他自己的登录态。
3. **有干净的注入点，不需要备份**。插件设置 `claudeCode.environmentVariables`
   会被合并进子进程 env（`extension.js`：`Q={...process.env}` 后逐个赋值），
   且扩展只拦 `CLAUDE_CONFIG_DIR` 这一个变量名，`ANTHROPIC_*` 全部放行。
   写进**我们自己 IDE 的 settings.json** 即可，扩展与设置都在应用目录内，天然隔离。

## 二、分期方案

### 一期：开关 + 配置搬运 + 诚实降级（本次实施）

**用户可见**

设置页新增卡片「FDE Code 的 Claude 插件」：

- 开关「复用平台 AI 配置」，**默认关闭**（关闭时行为与现在完全一致）。
- 状态行实时显示结论：可直连 / 协议不兼容 / 未配置网关。

**行为**

| 平台网关协议 | 开放开关后的行为 |
| --- | --- |
| `anthropic_messages` | 写入 `ANTHROPIC_BASE_URL`（剥 `/v1`）+ 凭据 + 模型名到 IDE 设置，关掉登录提示 |
| `chat_completions` / `codex_responses` | **不写配置、不假装可用**，明确提示协议不兼容并给出口 |

**为什么不做自动备份**：一期只写我们自己的 `userData/ide/.../User/settings.json`，
不碰 `~/.claude/settings.json`，所以不存在「要备份用户的 claude 配置」这个问题。
备份只在二期（若要做全局注入）才有必要。

**写入内容**（`claudeCode.environmentVariables`）：

```
ANTHROPIC_BASE_URL      = <baseUrl 去掉尾部 /v1>
ANTHROPIC_AUTH_TOKEN    = <apiKey>          // bearer 鉴权
ANTHROPIC_API_KEY       = <apiKey>          // 部分网关只认这个头
ANTHROPIC_MODEL         = <模型裸名>
ANTHROPIC_SMALL_FAST_MODEL = <模型裸名>
ANTHROPIC_DEFAULT_HAIKU_MODEL = <模型裸名> // 后台小任务用，不写会去调内置 haiku 名
```

外加 `claudeCode.disableLoginPrompt = true`。
模型名按平台档案的 `stripVendorPrefix` 决定是否剥掉 `厂商/` 前缀（与写 config.yaml 的规则一致）。

**实现落点**

| 文件 | 改动 |
| --- | --- |
| `src/main/ide/claude-bridge.js`（新） | 读平台激活档案 → 判断协议 → 生成环境变量 → 写入/清理 IDE 设置 |
| `src/main/ide/index.js` | 新增 `ide:claude-config`（查状态）与 `ide:apply-claude-config`（开关）两个 IPC |
| `src/main/ide/prefs.js` | 记住开关状态（`claudeBridge`） |
| `src/preload/index.js` | 暴露 `window.api.ide.claudeConfig()` / `applyClaudeConfig(enabled)` |
| `src/renderer/pages/settings/Settings.vue` | 新增卡片：开关 + 状态 + 不兼容时的说明 |

**关键实现约定**

- 只增改我们关心的 6 个键，其余设置一律不动；关闭开关时只删这 6 个键（连同 `disableLoginPrompt`），
  不整文件重写。
- 读取平台档案走主进程已有的 `readGatewayProfiles()`（`gateway-profiles.json` 是唯一事实来源），
  不重新解析 `config.yaml`。
- 协议判断复用 `normalizeGatewayMode()`，与设置页/写 config 的逻辑保持一致，
  避免出现「设置页说 Anthropic、搬运时当 OpenAI」的分歧。
- 开关打开但网关不兼容时，**不写任何配置**，只回状态——宁可明确不可用，也不要写出一份
  连不上还看不出原因的配置。
- 改了网关（切档案 / 改地址）后，下次启动 IDE 时重新同步一次，避免配置漂移。

### 二期：本地协议转换网关（暂不实施）

只有当一期 + 360 实测都不足以覆盖用户时才做。工作量估计 800–1500 行，且需持续跟进
Claude Code 的协议演进：

- `tools[].input_schema` ↔ `function.parameters`
- `tool_use` / `tool_result` ↔ `tool_calls` / `role:tool`
- SSE 全套事件：`message_start` / `content_block_start|delta|stop` / `message_delta` / `message_stop` / `ping`
- `thinking`、`context_management`、`output_config`、`anthropic-beta` 的兼容或优雅忽略
- `/v1/messages/count_tokens` 的近似实现
- 图片块、`max_tokens` 上限对齐

在 `127.0.0.1` 上起进程内 translator，同样只监听回环。本质是 claude-code-router /
LiteLLM 的一个子集，不建议自己从头写——优先评估直接内嵌现成实现。

## 三、一期实施状态

已落地：

| 文件 | 内容 |
| --- | --- |
| `src/main/ide/claude-bridge.js`（新） | 读网关档案 → 判断协议 → 生成/清理环境变量；`describe()` 只读查状态（不回 key 值） |
| `src/main/ide/index.js` | IPC `ide:claude-config` / `ide:apply-claude-config`；`setGatewayModeResolver()` 注入主进程的协议判断 |
| `src/main/ide/prefs.js` | `claudeBridge` 开关持久化（默认 false） |
| `src/main/ide/paths.js` | `backendUserDataDir(backend)`：code-server 与本机 VS Code 的设置目录不同，写配置必须按后端取 |
| `src/main/ide/server.js` | 两个后端启动时各对账一次（`syncOnStart`），防止用户改网关后配置漂移 |
| `src/main/index.js` | 启动时把 `normalizeGatewayMode` 注入 IDE，协议判断只有一份实现 |
| `src/preload/index.js` | `window.api.ide.claudeConfig()` / `applyClaudeConfig(enabled)` |
| `src/renderer/pages/settings/Settings.vue` | 卡片「FDE Code 的 Claude 插件」：开关 + 状态行（未启用 / 可直连 / 协议不兼容 / 未配置网关） |

实现细节与方案的差异：

- 环境变量多写一个 `ANTHROPIC_DEFAULT_HAIKU_MODEL`（新版 Claude 的后台小任务用它，缺了会去调内置 haiku 名）。
- 状态查询不回传任何 key，只回网关名、baseUrl、模型名与变量名列表。
- 换网关后设置页会静默重同步一次（仅当开关打开且协议兼容），不用等用户重启 IDE。
- 写入前比较序列化结果，没有实际变化就不落盘，不重写用户的 settings.json。

## 四、验证清单（一期）

- [x] 默认关闭时：IDE 设置里没有 `claudeCode.*` 相关键，行为与改动前一致（逻辑上由 `syncOnStart(false)` 保证，且无键时不落盘）。
- [x] Anthropic 协议网关 + 开开关：写入 env 键，`ANTHROPIC_BASE_URL` 无 `/v1` 尾缀（已用临时 `HERMES_HOME` 跑通：`https://gw.example.com/anthropic/v1` → `https://gw.example.com/anthropic`）。
- [ ] 同上，插件里发消息不再提示登录（**需真实 key，未验**）。
- [x] OpenAI 协议网关 + 开开关：不写任何键，状态回 `protocol-mismatch`。
- [x] 关闭开关：我们写的键被移除，用户自己的 `MY_FLAG` 等设置保留。
- [x] 用户自己手动改过 `claudeCode.environmentVariables`：只覆盖我们负责的键，不整段删。
- [x] settings.json 解析不了时完全不动，回明确错误。
- [ ] 两种 IDE 后端（内置 FDE Code / 本机 VS Code）各跑一次真实插件（**需在应用内验证**）。
