# CloudHook 多智能体来源适配 — 调研与实施方案

> **状态**：**已实施**（2026-07-26）。本文档为设计与实施记录。
> **日期**：2026-07-26
> **用途**：本文是这次改动的完整交接材料，包含调研一手结论、现状代码地图、设计决策与理由、既存问题、未决事项与实施记录。接手后只读本文即可维护，不必重新调研。

---

## 1. 背景与目标

CloudHook 目前把「事件来源」写死为 Claude Code：

| 硬编码位置 | 具体表现 |
|---|---|
| `edge-functions/_shared.js:649-666` `classify()` | 只认 Claude Code 的事件名 `Notification` / `PermissionRequest` / `Stop` |
| `edge-functions/_shared.js:672-677` `TITLE_MAP` | 四条标题全部以 "Claude Code" 开头 |
| `edge-functions/_shared.js:746-784` `buildMessage()` | 每个分支的正文都拼接字面量 "Claude Code" |
| `logEvent` / `writeAccessLog` 写入的对象 | 没有来源字段，前端无从区分 |

**目标**：同一个 `/api/hook` 端点识别请求来自 **Claude Code / Codex CLI / Antigravity CLI / 其他**，并让通知文案、日志展示、推送开关跟着来源走。

**用户已确认的四项需求边界**（2026-07-26 澄清）：

1. 识别策略：**多信号优先级链**（显式头 → UA → payload 特征 → 兜底）
2. 适配范围：**Claude Code、Codex CLI、Antigravity CLI**（+ 未知来源兜底）
3. 影响面：**通知文案带来源名**、**日志记录 + 前端展示筛选**、**按来源独立开关**
   （明确**不做** Bark 分组/图标按来源区分，也不做用户自定义来源命名）
4. 接入指引：Hooks 页仿照现有 Claude Code 页的展示形式，为另外两家各出一份

---

## 2. 现状代码地图

### 2.1 Hook 事件处理链路

`edge-functions/api/hook.js` `onRequestPost`（`:128-312`）的十步：

| 步骤 | 行号 | 说明 |
|---|---|---|
| 取 KV / IP / UA / `X-Hook-Event` | `:134-137` | `userAgent` 在 `:136` 取得，目前只写日志不参与判断 |
| `denyLog` 闭包 | `:142-152` | 被拒请求也写访问日志 |
| Token 验签（`ignoreExp`）+ 过期 + 吊销 | `:154-178` | 区分 invalid / expired / revoked |
| 读配置 | `:181` | `getUserConfig(kv, userId, env)` |
| IP / 地理 / 限流风控 | `:184-209` | 失败均 `denyLog` 后返回 200 + `success:false` |
| 解析 body、定事件名 | `:212-217` | `hook_event_name` → `hookEventName` → `X-Hook-Event` 头 → `'Unknown'` |
| `parseEvent` | `:53-122` / 调用在 `:217` | 限量提字符串（2000 节点 / 8KB），提 `tool_name`、`tool_input`、`summary`、`has_error` |
| `classify` → `shouldNotify` | `:220-222` | `turn_paused` 不推送 |
| `buildMessage` | `:225` | 第 8 参传的是 `payload.dev`（设备名，非 agent） |
| 异步推送 + 双日志 | `:229-293` | 三段各自 try/catch 隔离；`notified` 记真实推送结果，失败写 `push_error` |
| 立即返回 200 | `:296-302` | |

**`edge-functions/api/notify.js` 是 `hook.js` 的逐字节副本**（`diff` 只差第 2 行注释），行号完全一致。任何改动必须双份同步。

### 2.2 `_shared.js` 关键段落定位

| 段落 | 行号 |
|---|---|
| security（token / 加解密 / requireAuth） | `:15-212` |
| `resolveKv` | `:223` |
| `getDefaultConfig` | `:236-246` |
| `getUserConfig` / `saveUserConfig` | `:248-269` |
| `logEvent` / `getEvents` | `:271-308` |
| 设备注册表 / 吊销 | `:322-410` |
| `writeAccessLog` / `getAccessLogs` | `:412-433` |
| 日志删除 | `:439-499` |
| risk（IP / geo） | `:521-592` |
| `pushBark` / `testBarkPush` | `:605-636` |
| `classify` + 关键词表 + WAF 绕过常量 | `:638-666` |
| `TITLE_MAP` / `RISK_MAP` / `assessBashRisk` / `getRiskLevel` / `buildMessage` | `:668-784` |
| `safeWaitUntil` | `:790` |
| 日志容量常量 `EVENT_LOG_CAP=100` / `ACCESS_LOG_CAP=200` | `:218-219` |

### 2.3 数据流关键事实（探索确认，直接影响实现）

- **`logEvent`（`:271-285`）无字段白名单**，`events.unshift(event)` 整个对象原样入库 → 新增 `agent` 字段不会被丢弃
- **`writeAccessLog`（`:412-423`）是 `{ id, timestamp, ...log }`**，展开在后，调用方自带的 `id`/`timestamp` 会覆盖默认值
- **`config.js` 的 PUT 无 schema / 白名单校验**（`:107` 直接 `request.json()`，`:114-117` 顶层浅展开合并）→ 新增 `config.agents` 段会原样保存；但**浅合并意味着提交部分 `agents` 会整体替换该子树**，前端必须每次提交完整对象
- **⚠️ `getUserConfig`（`:248-259`）读到 KV 里的 JSON 直接返回，不与默认配置合并** → 已有用户的 KV 配置里没有 `agents` 键，改 `getDefaultConfig` 对存量用户无效。消费侧必须写 `config?.agents?.[id]?.enabled !== false`，前端必须写 `?? true`
- `GET /api/events` 已支持 `limit`/`offset`/`type`/`device`（`events.js:42-63`），过滤在 `_shared.js:292-293`
- `GET /api/access-logs` 仅支持 `limit`/`offset`/`device`（`access-logs.js:38`），过滤在 `_shared.js:430`

### 2.4 前端结构

**`frontend/src/pages/EventsPage.tsx`（1046 行，单文件自包含）**

- 主组件 `:974-1045`，Tab 切换 `activeTab` `:975`，导航 `:1020-1036`
- `EventsTab` `:283-570`、`AccessLogsTab` `:645-898`，各自独立分页/选择/删除
- 共享组件：`DeviceFilter` `:243-264`、`DeviceTag` `:268-279`、`Checkbox` `:220-239`、`EventDetailModal` `:117-216`
- `EventRow` `:582-641` 渲染 `event_name` `:607` → `event_type` 徽章 `:609-611` → `DeviceTag` `:612` → 相对时间 `:618`；右侧 `notified` `:625-632` + `risk_level` `:633`
- **筛选全部走 API 参数，无本地过滤**：`EVENT_TYPE_OPTIONS` `:21-28`，筛选栏 `:406-424`，`load(offset, type, device)` `:297-312`
- **易漏点**：`load()` 有 6 处调用（初始 `:316`、删除后 `:375`、清空后 `:394`、刷新 `:475`、重试 `:495`），`useCallback` deps 是 `[]`，筛选值靠显式传参，加参数时必须全部补齐

**`frontend/src/pages/ConfigPage.tsx`（495 行）**

- 3 个 `SectionCard`（`:48-81` 定义）：Bark `:308-359`、Persona `:362-384`、风险控制 `:387-480`
- 纯 `useState` 扁平字段（`:116-142`），无 Zustand（Zustand 只用于 authStore）
- 每卡独立保存：`doSave(payload, setSaving, label)` `:182-201`，各 handler `:204-269`，**每个 handler 提交整个子树**（因后端浅合并）
- 开关模板：`UiverseToggle`，现成例子 `risk_control.rate_limit.enabled` `:462-468`、`persona.enabled` `:368-374`
- 加载填充模式：`cfg.risk_control?.x?.y ?? 默认值`（`:145-179`）

**`frontend/src/pages/HooksPage.tsx`（249 行）**：单页展示 Claude Code 原生 http hook 接入，含端点/Token 卡片、可复制配置块、事件类型说明表、提示区。

### 2.5 双份维护关系（CLAUDE.md 约束 1）

| 真源 | 副本 |
|---|---|
| `edge-functions/_shared.js` | `lib/*.js`（security / kv-store / risk / bark / classifier / message-builder 六段） |
| `edge-functions/api/hook.js` | `edge-functions/api/notify.js`（逐字节） |

**现状偏差（本次调研发现）**：

- `package.json` 引用的 `scripts/dev.mjs` 与 `scripts/dev-mock.mjs` **在仓库中不存在** → `npm run dev` / `npm run mock` 实际跑不起来
- `lib/` 目前只被 `scripts/test-bark.mjs`（bark.js）与 `scripts/test-device-identity.mjs`（security.js、kv-store.js）引用
- `lib/classifier.js`、`lib/message-builder.js`、`lib/risk.js`、`lib/config-resolver.js` **无人引用**，且已落后于 `_shared.js`（缺 `turn_paused` 分支与对应文案）

---

## 3. 三家 Hook 机制调研（一手结论）

| | Claude Code | Codex CLI 0.145 | Antigravity CLI |
|---|---|---|---|
| 配置位置 | `.claude/settings.json`（项目/全局） | `~/.codex/config.toml` 或 `hooks.json` | `~/.gemini/config/hooks.json` 或工作区 `.agents/hooks.json` |
| handler 类型 | **原生 `type: "http"`**（还支持 command） | **仅 `type: "command"`**（prompt/agent 会被解析但跳过） | **仅 `type: "command"`** |
| 到达端点方式 | CC 直接 POST | 脚本读 stdin → curl | 脚本读 stdin → curl |
| 实际 User-Agent | CC 自身 UA（**未实测，见 §8**） | `curl/x.y` | `curl/x.y` |
| 字段风格 | snake_case | snake_case | **camelCase** |
| 事件名字段 | `hook_event_name` | `hook_event_name` | **无**（必须按形状推断） |
| 输入通道 | HTTP body | stdin JSON | stdin JSON |

来源：[Claude Code Hooks](https://code.claude.com/docs/en/hooks)、[Codex Hooks](https://developers.openai.com/codex/hooks)、[Antigravity Hooks](https://antigravity.google/docs/hooks)。Codex 侧另以本机 `@openai/codex@0.145.0` 二进制中的字符串常量交叉验证（`hook_event_name`、`agent-turn-complete`、`stop_hook_active` 等确实存在）。

### 3.1 Claude Code

事件：`SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PermissionRequest` / `PostToolUse` / `Notification` / `SubagentStart` / `SubagentStop` / `PreCompact` / `Stop` / `SessionEnd`

**Notification 真实 payload**（注意是顶层字段）：

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../00893aaf-....jsonl",
  "cwd": "/Users/...",
  "hook_event_name": "Notification",
  "message": "Claude needs your permission",
  "title": "Permission needed",
  "notification_type": "permission_prompt"
}
```

`notification_type` 取值含 `permission_prompt`、`idle_prompt`（也是 matcher 可过滤的值）。

**Stop 真实 payload**：

```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/.../....jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": true,
  "last_assistant_message": "I've completed the refactoring...",
  "background_tasks": [
    { "id": "task-001", "type": "shell", "status": "running", "description": "tail logs", "command": "tail -f /var/log/syslog" }
  ],
  "session_crons": [
    { "id": "cron-001", "schedule": "0 9 * * 1-5", "recurring": true, "prompt": "check the build" }
  ]
}
```

`background_tasks` / `session_crons` 需 Claude Code v2.1.145+。

**http hook 配置格式**（支持 `timeout`、`headers`、`allowedEnvVars`）：

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [
  { "type": "http", "url": "http://...", "timeout": 30,
    "headers": { "Authorization": "Bearer $MY_TOKEN" },
    "allowedEnvVars": ["MY_TOKEN"] } ] } ] } }
```

非 2xx / 连接失败 / 超时都是非阻断错误，不影响 CC 正常使用。

### 3.2 Codex CLI 0.145

事件：`SessionStart` / `SessionEnd` / `SubagentStart` / `SubagentStop` / `PreToolUse` / **`PermissionRequest`** / `PostToolUse` / `PreCompact` / `PostCompact` / `UserPromptSubmit` / `Stop` — **没有 `Notification`**。

公共输入字段：`session_id`、`transcript_path`、`cwd`、`hook_event_name`、`model`（Codex 扩展）；多数事件另有 `permission_mode`、`turn_id`（Codex 扩展）。

- `PermissionRequest`：`turn_id`、`tool_name`（`Bash` / `apply_patch` / `mcp__server__tool`）、`tool_input`（`Bash` 与 `apply_patch` 用 `tool_input.command`）、可选 `tool_input.description`
- `PostToolUse`：另有 `tool_use_id`、`tool_response`
- `Stop`：`turn_id`、`stop_hook_active`、`last_assistant_message`（**无 `background_tasks`**）
- `SubagentStart` / `SubagentStop`：`agent_id`、`agent_type`

配置形态（TOML 内联，也支持 `hooks.json`）：

```toml
[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = '/path/to/forward.sh Stop'
timeout = 30
```

`timeout` 单位秒，缺省 600（`SessionEnd` 缺省 1 秒、上限 3 秒）。`[features] hooks = false` 可全局关闭。

另有一条旧的 `notify` 通道（外部程序 + JSON 参数，`{"type":"agent-turn-complete","turn-id":...,"last-assistant-message":...}`），本方案作为识别兜底之一支持，但不作为推荐接入方式。

### 3.3 Antigravity CLI

事件：`PreToolUse` / `PostToolUse` / `PreInvocation` / `PostInvocation` / `Stop` — **既没有 `Notification` 也没有 `PermissionRequest`**。

公共输入字段（camelCase）：`conversationId`、`workspacePaths`（数组）、`transcriptPath`、`artifactDirectoryPath`。

- `PreToolUse`：`toolCall.name`、`toolCall.args`、`stepIdx`
- `PostToolUse`：`stepIdx`、`error`（失败时非空）
- `PreInvocation` / `PostInvocation`：`invocationNum`、`initialNumSteps`
- `Stop`：`executionNum`、`terminationReason`（`model_stop` / `max_steps_exceeded` / `error`）、`error`、**`fullyIdle`**（true = 后台任务也全部结束）

工具名与 CC 完全不同：`run_command`（参数 `CommandLine`/`Cwd`）、`write_to_file`（`TargetFile`）、`replace_file_content`、`multi_replace_file_content`、`view_file`、`list_dir`、`find_by_name`、`grep_search`、`search_web`、`read_url_content`、`invoke_subagent`、`ask_question` 等。

`PreToolUse` 真实 payload：

```json
{
  "toolCall": { "name": "run_command", "args": { "CommandLine": "npm test", "Cwd": "/workspace/project", "WaitMsBeforeAsync": 5000 } },
  "stepIdx": 19,
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/workspace/project"],
  "transcriptPath": "~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl",
  "artifactDirectoryPath": "~/.gemini/antigravity/brain/<id>"
}
```

`Stop` 真实 payload：

```json
{
  "executionNum": 1,
  "terminationReason": "model_stop",
  "error": "",
  "fullyIdle": true,
  "conversationId": "ec33ebf9-...",
  "workspacePaths": ["/workspace/project"],
  "transcriptPath": "...",
  "artifactDirectoryPath": "..."
}
```

配置形态：

```json
{
  "cloudhook": {
    "Stop": [ { "type": "command", "command": "/path/to/forward.sh Stop", "timeout": 30 } ],
    "PreToolUse": [ { "matcher": "run_command", "hooks": [ { "type": "command", "command": "/path/to/forward.sh PreToolUse" } ] } ]
  }
}
```

注意 `PreInvocation`/`PostInvocation`/`Stop` 是**直接跟 handler 列表**（无 matcher 层），`PreToolUse`/`PostToolUse` 才有 `matcher` + `hooks` 两层。

### 3.4 核心结论

Codex 与 Antigravity 都只支持 command 类型 hook，必须由脚本转发，**UA 恒为 `curl/x.y`** —— 单靠 User-Agent 无法区分来源，必须用多信号识别链。

---

## 4. 设计

### 4.1 来源识别 `detectAgent(request, rawEvent)`

新增 `lib/agent-detect.js`，并在 `edge-functions/_shared.js` 放一份自包含副本。返回 `{ id, name, source }`，`source` 记录命中层级（`header` / `ua` / `shape` / `fallback`），写进访问日志便于排查误判。

优先级链：

1. **显式标记**：请求头 `X-Agent-Type`（兼容 query `?agent=`）→ 归一化为 `claude_code` / `codex` / `antigravity`；非法值落 `unknown`
2. **UA 规则表**：含 `claude-code`/`claude` → claude_code；含 `codex` → codex；含 `antigravity`/`gemini` → antigravity；`curl` 或空 → 不判定，进下一层
3. **payload 形状推断**：
   - 有 `conversationId` 且（`toolCall` | `terminationReason` | `invocationNum` | `stepIdx`）→ antigravity
   - 有 `hook_event_name` 且（`turn_id` | `model` | `agent_type`）→ codex
   - `type === 'agent-turn-complete'`（Codex 旧 notify 通道）→ codex
   - 有 `hook_event_name` / `transcript_path` / `session_id` → claude_code
4. **兜底** → `unknown`，显示名「其他智能体」，UA 原样记入访问日志

存量 Claude Code 配置不带新头时靠第 3 层即可正确识别，用户无需立即改配置。

### 4.2 事件归一化（`parseEvent` 扩展）

Antigravity payload 没有事件名，按形状推断后再进现有流水线：

| 形状 | 归一事件名 |
|---|---|
| `toolCall` + `stepIdx` | `PreToolUse` |
| `stepIdx` + `error`（无 `toolCall`） | `PostToolUse` |
| `terminationReason` + `fullyIdle` | `Stop` |
| `invocationNum` | `PreInvocation` / `PostInvocation` |

字段映射：`toolCall.name` → `tool_name`；`toolCall.args.CommandLine` → `tool_input.command`；`args.TargetFile` → `tool_input.file_path`；`args.Url` → `tool_input.url`。

若转发脚本带了 `X-Hook-Event` 头，**以该头为准**（脚本本来就按事件分别注册，最可靠），形状推断只作兜底。

Claude Code / Codex 走现有 `hook_event_name` → `hookEventName` → `X-Hook-Event` 链，不改动。

### 4.3 分类映射 `classify(parsed, agentId)`

| agent | 规则 |
|---|---|
| claude_code | **现状完全不变**：`PermissionRequest` → permission_required；`Notification` → 关键词扫描（permission_required / attention_required）；`Stop` 且 `background_tasks` 非空 → turn_paused，否则 task_done；其余 → info |
| codex | `PermissionRequest` → permission_required；`Stop` → task_done；`SubagentStop` → turn_paused；其余 → info |
| antigravity | `PreToolUse` → permission_required；`Stop` 且 `fullyIdle:false` → turn_paused，`true` → task_done；其余 → info |
| unknown | 走 Claude Code 规则（事件名同名即同义） |

`PermissionRequest` 字面量必须继续用 `String.fromCharCode` 动态构建（EdgeOne WAF 会以 545 拦截该字符串，见 `_shared.js:646-647`）。

### 4.4 风险评级 `getRiskLevel`

工具名归一后扩展映射（现状见 `_shared.js:727-744`）：

- `run_command` 与 `bash` 同路 → `assessBashRisk`（Antigravity 命令取 `toolCall.args.CommandLine`）
- `write_to_file` / `replace_file_content` / `multi_replace_file_content` / `apply_patch` → medium
- `view_file` / `list_dir` / `find_by_name` / `grep_search` → low
- `search_web` / `read_url_content` → low

其余保持现状（未知工具 → medium）。

### 4.5 通知文案

`TITLE_MAP` 由常量表改为按来源显示名生成：`${agentName} 需要权限` / `${agentName} 需要你` / `${agentName} 已完成` / `${agentName} 本轮结束`；`buildMessage()` 正文前缀里的 "Claude Code" 同样替换。**80 字截断与 persona 前缀逻辑保持原样**。

`buildMessage` 新增末位参数 `agentName`，默认 `'Claude Code'`，保证旧调用行为不变。

内置显示名：`Claude Code` / `Codex` / `Antigravity` / `其他智能体`。

### 4.6 按来源独立开关（config 新增段）

```js
agents: {
  claude_code: { enabled: true },
  codex:       { enabled: true },
  antigravity: { enabled: true },
  unknown:     { enabled: true }
}
```

`enabled:false` → 只写事件日志不推送：`notified:false` + `push_error:'agent_muted'`（前端展示为「已静音」而非推送失败）。

**兼容性硬约束**：见 §2.3 —— 后端一律 `config?.agents?.[id]?.enabled !== false`，前端一律 `?? true`，缺字段绝不能判为静音。

### 4.7 日志与 API

- 事件日志与访问日志各新增 `agent` 字段（写入方在 `hook.js:280-291` 与 `:231-239`/`:144-151`）
- `GET /api/events?agent=` 与 `GET /api/access-logs?agent=`：照抄 `device` 过滤路径（`events.js:43/63` → `_shared.js:293`；`access-logs.js:38` → `_shared.js:430`）

### 4.8 前端

- `types/api.ts`：`Event`/`AccessLog` 加 `agent?`，`Config` 加 `agents?`
- `api/events.ts:17-33`、`api/accessLogs.ts`：加 `agent` 形参并拼 query
- `EventsPage.tsx`：新增 `AGENT_OPTIONS`（仿 `:21-28`）与 `AgentBadge`（仿 `DeviceTag` `:268-279`）；`agentFilter` state + `load()` 第 4 参数（**6 处调用点全补**，见 §2.4）；筛选栏 `:421` 插来源下拉；`EventRow` `:612` 插徽章；详情弹窗 `:175-206` 加「来源」格；`AccessLogRow` `:941` 同步
- `ConfigPage.tsx`：Persona 卡片后（`:384` 与 `:386` 之间）新增第 4 个 `SectionCard`「智能体来源」，三个 `UiverseToggle`（仿 `:462-468`），`handleSaveAgents` 仿 `handleSavePersona` `:235-245`，**提交完整 `agents` 子树**
- `HooksPage.tsx`：改造为三页签，沿用现有卡片 + 复制按钮形式：
  - Claude Code 页签：现有配置的 headers 补 `"X-Agent-Type": "claude_code"`
  - Codex 页签：`config.toml` 片段（`[[hooks.Stop]]` + `[[hooks.PermissionRequest]]`）
  - Antigravity 页签：`hooks.json` 片段（`Stop` 直列 handler，`PreToolUse` 带 matcher）
  - 两者的 `command` 指向转发脚本，附一份通用转发脚本（bash + PowerShell：读 stdin JSON → `curl -X POST`，带 `X-CloudHook-Token`、`X-Agent-Type`、`X-Hook-Event`）；用户若已有自己的脚本，替换 command 路径即可

### 4.9 双份维护

真源 `edge-functions/_shared.js`；`hook.js` 与 `notify.js` 必须逐字节同步。`lib/` 虽是死代码（§2.5），按 CLAUDE.md 规范仍同步更新，并顺带补齐落后的 `turn_paused` 逻辑。

---

## 5. 改动清单

**后端**

- 新增 `lib/agent-detect.js`；`edge-functions/_shared.js` 增 agent-detect 段
- `edge-functions/_shared.js`：`classify` / `getRiskLevel` / `buildMessage` / `getDefaultConfig` / `getEvents` / `getAccessLogs`
- `edge-functions/api/hook.js` + `api/notify.js`（双份）：`parseEvent` 扩展、识别接线、静音判断、日志加 `agent`
- `edge-functions/api/events.js`、`api/access-logs.js`：`agent` query 参数
- `lib/classifier.js`、`lib/message-builder.js`、`lib/kv-store.js`：同步

**前端**

- `frontend/src/types/api.ts`、`api/events.ts`、`api/accessLogs.ts`
- `frontend/src/pages/EventsPage.tsx`、`ConfigPage.tsx`、`HooksPage.tsx`

**文档**

- `CLAUDE.md` 补一段多来源识别说明

## 6. 实施编排

字段契约先定死（`agent` id 取值、config 结构、query 参数名如上），四路可并行：

1. **后端核心**：`_shared.js` 的 agent-detect / classify / risk / message + `getDefaultConfig`
2. **后端接线**：`hook.js` + `notify.js` 双份 + `events.js` / `access-logs.js` 过滤参数
3. **前端展示**：types + EventsPage 徽章筛选 + ConfigPage 开关区块
4. **接入指引与同步**：HooksPage 三页签与转发脚本 + `lib/` 同步 + 冒烟脚本

## 7. 验证

- 新增 `scripts/test-agent-detect.mjs`：用 §3 的真实 payload 样本（CC `Notification`/`Stop`、Codex `PermissionRequest`/`Stop`、Antigravity `PreToolUse`/`Stop` 含 `fullyIdle` 两态）跑 detect → parse → classify → risk → message，断言来源 id、事件分类、标题文案、静音行为
- `node scripts/test-agent-detect.mjs` 全绿
- `cd frontend && npm run lint && npm run build` 通过
- 核对 `hook.js` 与 `notify.js` 仍逐字节一致（`diff` 只应差第 2 行注释）
- 部署后用 `curl` 分别带三种 `X-Agent-Type` 打线上端点，确认 Bark 标题来源名正确、事件页徽章与筛选可用、关闭某来源开关后只记日志不推送

## 8. 未决事项 / 待验证

1. **Claude Code http hook 的真实 User-Agent 未知** — 官方文档未提及，CC 二进制（`~/.claude/downloads/claude-2.1.89-win32-x64.exe`）中未 grep 到明文 UA。
   影响可控：CC 走显式头 + payload 形状两层都能识别，UA 规则表只是补充。
   实测途径：查线上「访问日志」页已有记录的 `user_agent` 字段，或本地起 mock 服务后触发一次 CC hook。拿到后补进 UA 规则表即可。
2. **Antigravity `PreToolUse` 映射为 permission_required 可能刷屏** — 该事件在每次工具调用前触发。建议在 Hooks 页提示只对 `run_command` 等高风险工具配 matcher，或干脆只注册 `Stop`。若实际体验太吵，可改为默认归 info、由用户在配置里开启。
3. **用户提到「我们已经有通用的这种 hook 的脚本了」** — 尚未确认具体内容。当前按「页面自带一份通用转发脚本、用户可替换 command 路径」处理；若用户脚本形态不同（例如不发 `X-Hook-Event` 头），形状推断兜底仍能工作。

## 9. 调研中发现的既存问题（与本次改动相邻，可顺带处理）

1. **`attention_required` 正文取值路径是错的** — `_shared.js:763` 读 `parsed.raw_event.notification.title || .message`，但 CC 的 `Notification` payload 是**顶层** `message`/`title`（见 §3.1），没有 `notification` 子对象。结果这条分支的正文一直退化成默认的「请求你的注意」。修正为读顶层 `title` / `message` 即可。
2. **CC 的 `notification_type` 字段可替代关键词扫描** — `classify` 现在靠中英文关键词表猜是不是权限请求（`_shared.js:642-644`），而 payload 里直接有 `notification_type: "permission_prompt" | "idle_prompt"`。优先判该字段、关键词扫描降级为兜底，会准确得多。
3. **`scripts/dev.mjs` 与 `scripts/dev-mock.mjs` 缺失** — `npm run dev` / `npm run mock` 无法运行，`CLAUDE.md` 的「常用命令」与实际不符；`lib/` 因此成为无人引用的死代码。
4. **`config.js:142` 调 `saveUserConfig(kv, userId, newConfig, env)` 多传一个参数** — `_shared.js:261` 只接三个，多余参数被忽略，无害但易误导。

## 10. 决策记录（为什么这么选）

| 决策 | 理由 |
|---|---|
| 不用 token 绑定 agent 类型 | 同一台机器可能同时跑三家 CLI 共用一个设备 Token；且 token 是无状态签名的，加字段后存量 token 不含该字段，还得回查 KV 注册表，给 hook 热路径多一次 KV 读 |
| UA 只作第二优先级 | Codex/Antigravity 只能 curl 转发，UA 恒为 `curl/x.y`，无法区分；但用户明确要求「按 UA 区分」，故保留 UA 层用于识别带自定义 UA 的客户端 |
| payload 形状推断放第三层而非第一层 | 显式头最可靠且成本最低；形状推断是为了让存量 CC 配置零改动仍能被正确识别 |
| 静音用 `push_error:'agent_muted'` 而非静默丢弃 | 事件页能看出「为什么没推」，与现有 `push_error` 展示链路一致，不新增字段 |
| 不做 Bark 分组/图标按来源区分 | 用户在需求澄清中未选该项 |
| 不做用户自定义来源命名 | 用户未选；内置四个显示名足够，后续要扩展再说 |
| `buildMessage` 用末位可选参数而非改签名顺序 | 该函数已有 8 个位置参数且中间三个是废弃占位（`_d1/_d2/_d3`），追加末位参数对现有调用零影响 |

## 11. 平台约束（EdgeOne，实施时必须守住）

- `PermissionRequest` 字面量一律 `String.fromCharCode` 动态构建（WAF 会 545 拦截）
- 所有响应保持 HTTP 200 + `body.success`（5xx 会被平台 HTML 错误页覆盖）
- KV key 只允许字母/数字/下划线（`agent` 只进 value 不进 key，安全）
- `console.log` 上限 20 次/执行
- KV 绑定是全局变量注入，一律经 `resolveKv(env)`
- `context.waitUntil` 行为有运行时差异，一律用 `safeWaitUntil()`
- 旧配置无 `agents` 段 → 一律默认启用，不得因缺字段静音
- **Claude Code 侧零回归**：不带任何新请求头的存量 CC 请求，分类、文案、推送行为必须与现在完全一致

## 12. 参考资料

- [Claude Code Hooks 文档](https://code.claude.com/docs/en/hooks)
- [Codex Hooks 文档](https://developers.openai.com/codex/hooks) ｜ [Codex 生成的 schema](https://github.com/openai/codex/tree/main/codex-rs/hooks/schema/generated)
- [Antigravity Hooks 文档](https://antigravity.google/docs/hooks)
- 项目内：`CLAUDE.md`（架构约束）、`docs/SETUP.md`（部署）、`docs/LOCAL_DEVELOPMENT.md`

---

## 13. 实施记录（2026-07-26）

### 13.1 完成情况

按方案 §5 的改动清单完整实施：

**后端**
- ✓ 新增 `lib/agent-detect.js`，`edge-functions/_shared.js` 相应增加 agent-detect 自包含段
- ✓ 扩展 `classify` / `getRiskLevel` / `buildMessage` / `getDefaultConfig` / `getEvents` / `getAccessLogs`
- ✓ `edge-functions/api/hook.js` + `notify.js` 双份同步：`parseEvent` 扩展、来源检测接线、静音逻辑、日志加 `agent` 字段
- ✓ `api/events.js` 与 `api/access-logs.js` 新增 `?agent=` 过滤参数
- ✓ `lib/` 下 classifier / message-builder / kv-store 等共享模块同步更新

**前端**
- ✓ `types/api.ts` Event / AccessLog 加 `agent?`，Config 加 `agents?` 结构
- ✓ `api/events.ts` / `api/accessLogs.ts` 新增 `agent` 形参与 query 拼接
- ✓ `EventsPage.tsx`：新增 `AGENT_OPTIONS` 与 `AgentBadge` 组件；6 处 `load()` 调用点全部补齐 `agentFilter` 参数；筛选栏、`EventRow`、`AccessLogRow` 各处插入来源徽章；详情弹窗加「来源」显示
- ✓ `ConfigPage.tsx`：Persona 卡片后新增第 4 个 `SectionCard`（智能体来源），包含四个 `UiverseToggle` 开关，`handleSaveAgents` 提交完整 `agents` 子树
- ✓ `HooksPage.tsx`：改造为三页签（Claude Code / Codex / Antigravity），各带专属配置片段与说明。Codex 与 Antigravity 均为**纯 JSON 配置、零脚本**：command 内联 curl 用 `--data-binary @-` 读 stdin 直接转发（Codex 用 `~/.codex/hooks.json`，`commandWindows` 字段提供 Windows 变体；Antigravity 用 `~/.gemini/config/hooks.json`，每条 command 带 `X-Hook-Event` 头补齐事件名）。经查证：Codex 的 hooks.json 与 config.toml 内联 `[hooks]` 等价，同层并存会合并并在启动时告警；handler 仍仅 `type:"command"` 会执行，故「零脚本」靠内联 curl 实现而非 http 型 handler

**文档**
- ✓ `CLAUDE.md` 第 4 节补充「多来源识别」小段

### 13.2 方案调整

实施过程对方案的两处修正：

1. **detectAgent 的 codex 形状判据** — 原方案 §4.1 提及按 `turn_id | model` 判定，实施时明确**不检查 `agent_type` 字段**。原因：Claude Code 的 `SubagentStop` 事件也带 `agent_type`，若该层检查会误判 CC 子智能体事件为 Codex。改为 `hook_event_name` + (`turn_id` | `model`) 双层判定，噪音更低。

2. **ConfigPage 开关数量** — 原方案 §4.8 暗示「三个 UiverseToggle」（Claude Code / Codex / Antigravity），实施时改为**四个**（另加 `unknown`），与 config 结构 `agents.{ claude_code, codex, antigravity, unknown }.enabled` 对齐，完整性更强。

### 13.3 验证

- ✓ `node scripts/test-agent-detect.mjs` — 新增冒烟测试，12 组用例 32 项断言全绿（含 lib/ 与 _shared.js 双份一致性校验、CC 零回归、静音三态）
- ✓ `node scripts/test-device-identity.mjs` — 既有 41 项断言全绿，`lib/kv-store.js` 改动无回归
- ✓ `cd frontend && npx tsc --noEmit` 零错误；`npm run lint` 17 个错误与改动前基线完全一致（零新增，均为历史遗留）
- ✓ `npm run build` 通过，产物 `public/assets/` 已 grep 确认无 WAF 敏感连写字面量
- ✓ `diff edge-functions/api/hook.js edge-functions/api/notify.js`（除第 2 行注释外）字节一致

### 13.3.1 实施中发现的新坑：压缩器常量折叠 vs WAF

HooksPage 需要在页面展示 Codex 的 `[[hooks.<权限事件名>]]` 配置片段，源码里最初用 `'Permission' + 'Request'` 拼接规避 WAF——但 **rolldown/oxc 压缩器会把字符串拼接常量折叠回连写字面量写进构建产物**；换成 `String.fromCharCode(常量...)` 依然被折叠（两次构建产物 hash 完全一致，证明压缩器对 fromCharCode 也做求值）。最终采用 `atob('UGVybWlzc2lvblJlcXVlc3Q=')`（环境全局函数，压缩器不求值）。**结论：前端源码规避 WAF 字面量只能用 atob 这类不可静态求值的构造，且每次构建后必须 grep `public/assets/` 复查**。该约束已补录进 CLAUDE.md。

### 13.4 待验证事项

方案 §8 的两项「未决事项」仍待实测确认，不动原文：

- **未决事项 1（Claude Code 真实 User-Agent）** — CC 的 http hook 实际 UA 未知。识别工作已不依赖此项（显式头 + payload 形状两层足够），UA 规则表仅作补充；若后续线上日志获得 CC 原生 UA 样本，补进 `detectAgent` 的 UA 规则表即可。
- **未决事项 3（用户自有脚本形态）** — 用户提到已有通用转发脚本，具体形态未确认。当前 HooksPage 附带一份通用脚本（读 stdin → curl 发送）覆盖标准场景；若用户脚本差异导致不发 `X-Hook-Event` 头，payload 形状推断兜底仍能工作。
