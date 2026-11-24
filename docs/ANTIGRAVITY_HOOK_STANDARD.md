# Antigravity Hook 工程标准与 CloudHook 接入规范

本文档定义 Google Antigravity（App / CLI / IDE）生命周期 Hook（`hooks.json`）的完整协议、零噪音工程规范与 CloudHook 生产级接入模板。跨智能体统一协议请参见 [HOOK_STANDARD.md](./HOOK_STANDARD.md)。

---

## 1. 配置文件位置与加载优先级

Antigravity 按以下优先级加载并合并 `hooks.json`（高优先级同名/同事件规则先执行或覆盖，不同命名 hook 按顺序合并执行）：

| 优先级 | 路径 | 作用域 | 说明 |
|---|---|---|---|
| 1（最高） | `<workspace>/.agents/hooks.json` | 项目级 | 仅对当前工作区生效 |
| 2 | `~/.gemini/config/hooks.json` | 用户全局 | 跨工作区、跨端共享（App / CLI / IDE 均读取） |
| 3（最低） | `<plugin_root>/hooks.json` | 插件级 | 随已安装插件加载，运行时注入 `PLUGIN_ROOT` / `PLUGIN_DATA` 环境变量 |

### 各客户端数据目录对照

`stdin` payload 中的 `transcriptPath` 与 `artifactDirectoryPath` 会随运行载体不同而变化：

| 客户端 | 数据目录 | 说明 |
|---|---|---|
| Antigravity 2.0 (App) | `~/.gemini/antigravity/` | 桌面端 / 独立 App |
| Antigravity CLI | `~/.gemini/antigravity-cli/` | 命令行端 |
| Antigravity IDE | `~/.gemini/antigravity-ide/` | IDE 插件端 |

> [!IMPORTANT]
> - **`~/.gemini/antigravity-cli/settings.json` 不会加载 hooks！** 切勿将 `hooks` 写入 `settings.json`，必须写入独立的 `hooks.json`。
> - **文件编码必须为 UTF-8（无 BOM）**。带 BOM 的 JSON 文件会导致解析失败且静默跳过加载。

---

## 2. 顶层 Schema 与结构差异

`hooks.json` 顶层是一个 JSON 对象，**每个顶层 Key 是一个自定义的 Hook 名称**（如 `"cloudhook"`、`"lint-checker"`），映射到其配置对象：

```json
{
  "cloudhook": {
    "enabled": true,
    "PreToolUse": [ ... ],
    "Stop": [ ... ]
  }
}
```

### 顶层字段与合并规则

- `enabled`（boolean，可选，默认 `true`）：设为 `false` 可一键禁用该命名 Hook 下的全部事件处理器。
- **合并机制**：来自不同配置文件（项目级、全局级、插件级）或多个命名 Hook 的同事件处理器会**合并并按顺序执行**。

### Flat 与 Grouped 两种事件结构（极易写错）

Antigravity 的 6 个生命周期事件分为 **Flat（扁平）** 与 **Grouped（分组）** 两种截然不同的数组结构：

| 事件名 | 触发时机 | Matcher 目标 | 结构类型 |
|---|---|---|---|
| `SessionStart` | 新会话开始时触发一次 | 不适用（忽略） | **Flat**：直接为 handler 对象数组 |
| `PreToolUse` | 工具执行前 | 工具名称正则（如 `run_command`） | **Grouped**：`{ "matcher": "...", "hooks": [ ... ] }` |
| `PostToolUse` | 工具执行完成后 | 工具名称正则（如 `run_command`） | **Grouped**：`{ "matcher": "...", "hooks": [ ... ] }` |
| `PreInvocation` | 调用模型前 | 不适用（忽略） | **Flat**：直接为 handler 对象数组 |
| `PostInvocation` | 工具调用全部结束后 | 不适用（忽略） | **Flat**：直接为 handler 对象数组 |
| `Stop` | 执行循环终止时 | 不适用（忽略） | **Flat**：直接为 handler 对象数组 |

### Handler 对象字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `type` | string | 否（默认 `"command"`） | 目前**仅支持 `"command"`**（不支持 HTTP / prompt hook） |
| `command` | string | 是 | Shell 命令（Unix 通过 `sh -c`，Windows 通过 `cmd /c` 执行）；支持 `~` 展开；工作目录为 `hooks.json` 所在目录 |
| `timeout` | int | 否（默认 `30`） | 超时时间（秒） |

---

## 3. Matcher 正则规则与工具清单

在 `PreToolUse` / `PostToolUse` 的 Grouped 结构中，`matcher` 使用正则匹配工具名称（工具名由内部 `CORTEX_STEP_TYPE_` 前缀去除并转小写得到）：

- `"*"` 或 `""`：匹配所有工具（**严禁在 CloudHook 中使用**，见第 5 节）
- `"ask_question|ask_permission"`：精确匹配交互类工具
- `"browser_.*"`：匹配所有浏览器工具

### Antigravity 工具名称清单（含历史与当前命名）

| 类别 | 工具名（当前 / 历史别名） | 说明 |
|---|---|---|
| 文件读取 | `read_file` / `view_file` | 读取文件内容 |
| 文件写入 | `write_file` / `write_to_file` | 新建或覆盖文件（含 `ArtifactMetadata.RequestFeedback` 计划审批） |
| 文件编辑 | `edit_file` / `replace_file_content` / `multi_replace_file_content` | 局部或批量替换文件内容 |
| 目录与检索 | `list_dir`、`find_by_name`、`grep_search` | 列目录、按名查找、正则搜索 |
| 网络工具 | `search_web`、`read_url_content` | 网页搜索与 URL 内容读取 |
| 命令与任务 | `run_command`、`manage_task`、`schedule` | Shell 命令执行、后台任务管理、定时任务 |
| 人机交互 | `ask_question`、`ask_permission` | 向用户提问选项、请求高危/外部操作权限 |
| 多智能体 | `invoke_subagent`、`send_message` | 拉起子智能体、发送跨智能体消息 |
| 浏览器 | `browser_*` | 浏览器自动化操作系列工具 |

---

## 4. Stdin / Stdout JSON 契约

> [!IMPORTANT]
> Antigravity Hook 的所有 JSON 键均采用 **camelCase**（protojson 编码），例如 `conversationId`、`stepIdx`、`hookEventName`。

### 4.1 Common Input Fields（所有事件 Stdin 公共字段）

```json
{
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/path/to/workspace"],
  "transcriptPath": "/path/to/workspace/.gemini/antigravity/transcript.jsonl",
  "artifactDirectoryPath": "/path/to/workspace/.gemini/antigravity/artifacts",
  "modelName": "auto",
  "lastUserInput": "Fix the failing unit test",
  "hookEventName": "PreToolUse",
  "cwd": "/path/to/workspace"
}
```

- `hookEventName`：当前触发的事件名称（与 `hooks.json` 中一致）。
- `cwd`：智能体当前工作目录（不是 hook 进程的工作目录）。
- `lastUserInput`：用户最近一次输入文本（**注意**：本地预过滤时严禁对整段 JSON 做裸子串匹配，防止用户输入内容触发误匹配）。

### 4.2 `PreToolUse` 契约与 6 种 `decision`

**Stdin**：包含公共字段 + `stepIdx`（number）+ `toolCall`（`{ id, name, args }`）。

**Stdout**：必须输出合法 JSON，包含必填字段 `decision`：

| `decision` | 语义与行为 | CloudHook 建议 |
|---|---|---|
| `"allow"` | **放行 Hook 检查并交由 Antigravity 默认权限策略处理**（如原本需弹窗确认的仍会弹窗，遵循用户的 Always Allow 缓存） | **推荐**：通知类 Hook 一律返回 `{"decision":"allow"}` |
| `"auto_approve"` | **强制自动批准**该工具调用，跳过所有用户确认弹窗 | **严禁在通知 Hook 中使用**，避免越权放行危险操作 |
| `"deny"` | 立即硬性拦截工具执行，可附带 `reason` 说明 | 仅安全拦截 Hook 使用 |
| `"ask"` | 弹出权限确认询问用户（遵循 Always Allow 缓存） | 安全审计 Hook 使用 |
| `"force_ask"` | 强制弹出权限确认，忽略 Always Allow 缓存 | 高危二次确认 Hook 使用 |
| `""`（空/省略） | 未显式决策，按默认流程继续 | 不推荐，建议始终显式输出 `"allow"` |

> [!CAUTION]
> **区分 `"allow"` 与 `"auto_approve"`**：通知类 Hook（如 CloudHook）只负责旁路观测与推送，绝不应改变 Antigravity 原有的安全边界。输出 `{"decision":"allow"}` 表示「Hook 本身不拦截，交还默认策略」；而 `"auto_approve"` 会直接绕过用户确认。

其他可选输出字段：`reason`（string）、`permissionOverrides`（string[]）、`overwrite`（object，顶层浅合并修改 `toolCall.args`）。

### 4.3 `PostToolUse` 契约

- **Stdin**：公共字段 + `stepIdx` + `toolCall`（与 `PreToolUse` 同 `id`）+ `error`（仅失败时存在，如 `"exit status 1"`）。
- **Stdout**：期望空 JSON 对象 `{}`。

### 4.4 `SessionStart` / `PreInvocation` / `PostInvocation` 契约

- **`SessionStart`**：仅包含公共字段；Stdout 可选返回 `injectSteps`（`systemMessage` / `userMessage` / `errorMessage`）。
- **`PreInvocation`**：公共字段 + `invocationNum` + `initialNumSteps`；Stdout 可返回 `injectSteps` 与 `terminationBehavior`（`"terminate"` 或 `""`）。
- **`PostInvocation`**：输入同 `PreInvocation`；Stdout 可返回 `injectSteps` 与 `terminationBehavior`（`"force_continue"` / `"terminate"` / `""`）。

### 4.5 `Stop` 契约与完整 `terminationReason` 表

**Stdin**：

```json
{
  "executionNum": 1,
  "terminationReason": "NO_TOOL_CALL",
  "error": "",
  "fullyIdle": true,
  "continuationActive": false,
  "conversationId": "...",
  "hookEventName": "Stop"
}
```

- `fullyIdle`（boolean）：`true` 表示所有后台任务均已结束；`false` 表示仍有后台任务在运行（CloudHook 归类为 `turn_paused`，**只记日志不推送**）。
- `continuationActive`（boolean）：若本轮是由上一次 `Stop` hook 强制续跑的（`executionNum > 0`），则为 `true`，直到用户发送新消息才重置为 `false`（防止 `Stop` hook 死循环续跑）。
- `terminationReason`（string，去掉 `EXECUTOR_TERMINATION_REASON_` 前缀后的枚举名）：

| `terminationReason` | 含义 | CloudHook 分类 | 是否推送 Bark |
|---|---|---|---|
| `NO_TOOL_CALL` | 模型正常结束本轮回复（未继续调工具） | `task_done` | 是（当 `fullyIdle !== false`） |
| `INJECTED_RESPONSE` | 注入响应后正常结束 | `task_done` | 是（当 `fullyIdle !== false`） |
| `ERROR` | 执行因错误终止（常伴随非空 `error`） | `attention_required`（高危） | 是 |
| `MAX_INVOCATIONS` | 达到最大调用步数上限 | `attention_required` | 是 |
| `MAX_FORCED_INVOCATIONS` | 达到强制续跑次数上限 | `attention_required` | 是 |
| `MAX_TOKEN_BUDGET_EXCEEDED` | 超出 Token 预算上限 | `attention_required` | 是 |
| `TERMINAL_STEP_TYPE` | 停在终端步骤（如等待审批/确认） | `attention_required` | 是 |
| `USER_CANCELED` | 用户主动取消当前执行 | `info` | **否**（仅记日志） |
| `TERMINAL_CUSTOM_HOOK` | 被 `PreInvocation`/`PostInvocation` hook 主动终止 | `info` | **否**（仅记日志） |

**Stdout**：

- 若需阻止停止并继续执行：`{"decision":"continue","reason":"..."}`
- 正常允许停止：`{"decision":"stop"}`（或任何非 `"continue"` 值）

---

## 5. 同步阻塞陷阱与零噪音工程规范

Antigravity 的 Hook 目前**全部同步执行并阻塞 Agent 循环**，接入 CloudHook 必须严格遵守以下 5 条工程规范：

1. **严禁全工具通配（`"matcher": "*"` 或 `""`）**：每次读文件、grep、列目录都会同步阻塞等待网络请求并产生大量无意义告警。`PreToolUse` 必须使用精准 `matcher`（推荐 `"ask_question|ask_permission"`）。
2. **本地 POSIX `case` 精确键值预过滤**：在 `Stop` hook 中，先用 `b=$(cat)` 读取 stdin，通过精确 JSON 键值对模式匹配（如 `*'\"fullyIdle\":false'*`、`*'\"terminationReason\":\"USER_CANCELED\"'*`、`*'\"terminationReason\":\"TERMINAL_CUSTOM_HOOK\"'*`，兼容冒号后有/无空格），命中则直接跳过 `curl` 零延迟返回！**切勿用裸关键字匹配**，否则 `lastUserInput` 中恰好包含 `"USER_CANCELED"` 字样会导致误过滤。
3. **短超时 + 永不阻塞退出（Fail-Open）**：`curl` 必须带 `--connect-timeout 3 -m 5`，配置 `timeout: 10`，尾部加 `|| true` 防止断网或服务端异常时 hook 返回非零退出码影响 Agent 正常工作。
4. **始终向 Stdout 输出合规 JSON**：重定向 `curl` 输出到 `/dev/null 2>&1`，并在命令末尾显式 `echo '{"decision":"allow"}'`（`PreToolUse`）或 `echo '{"decision":"stop"}'`（`Stop`），避免 HTTP 响应体污染 stdout 导致 JSON 解析失败。
5. **已知平台限制**：
   - Antigravity 目前**没有独立的原生权限请求事件**（即不存在类似 Claude Code/Codex 的权限事件），因此通过 `PreToolUse` 精确匹配 `ask_question|ask_permission`（及可选 `run_command` / `RequestFeedback`）来替代。
   - Payload 中目前**无 `isSubagent` 字段**，子智能体触发的独立会话同样携带 `conversationId`；若需抑制后台任务中间态推送，依赖 `Stop` 的 `fullyIdle: false` 检测。

---

## 6. 开箱即用 CloudHook 配置模板

将以下内容写入 `~/.gemini/config/hooks.json`（或项目级 `.agents/hooks.json`），替换 `<ENDPOINT>`（如 `https://your-app.edgeone.app/api/hook`）与 `<TOKEN>`：

### 6.1 推荐零噪音模板（日常必选）

仅监听 `ask_question`、`ask_permission` 与 `Stop`（本地预过滤掉 `fullyIdle:false`、`USER_CANCELED`、`TERMINAL_CUSTOM_HOOK`）：

```json
{
  "cloudhook": {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": "ask_question|ask_permission",
        "hooks": [
          {
            "type": "command",
            "command": "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: antigravity' -H 'X-Hook-Event: PreToolUse' --data-binary @- >/dev/null 2>&1 || true; echo '{\"decision\":\"allow\"}'",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "b=$(cat); case \"$b\" in *'\"fullyIdle\":false'*|*'\"fullyIdle\": false'*|*'\"terminationReason\":\"USER_CANCELED\"'*|*'\"terminationReason\": \"USER_CANCELED\"'*|*'\"terminationReason\":\"TERMINAL_CUSTOM_HOOK\"'*|*'\"terminationReason\": \"TERMINAL_CUSTOM_HOOK\"'*) ;; *) printf '%s' \"$b\" | curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: antigravity' -H 'X-Hook-Event: Stop' --data-binary @- >/dev/null 2>&1 || true ;; esac; echo '{\"decision\":\"stop\"}'",
            "timeout": 10
      }
    ]
  }
}
```

### 6.2 可选：高危命令告警（`run_command`）

在 `PreToolUse` 数组中追加一项，CloudHook 后端会自动放行/静默 `low` 与 `medium` 风险命令，**仅对 `high` / `critical`（如 `sudo`、`rm -rf`、`git push --force`、`curl | sh`）推送 Bark**：

```json
{
  "matcher": "run_command",
  "hooks": [
    {
      "type": "command",
      "command": "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: antigravity' -H 'X-Hook-Event: PreToolUse' --data-binary @- >/dev/null 2>&1 || true; echo '{\"decision\":\"allow\"}'",
      "timeout": 10
    }
  ]
}
```

### 6.3 可选：计划/产物审批提醒（`RequestFeedback`）

当 Antigravity 写入计划文档或 Artifact 并设置 `ArtifactMetadata.RequestFeedback: true` 时触发提醒（普通写文件会被 CloudHook 后端自动静默为 `info`，不推 Bark）：

```json
{
  "matcher": "write_file|write_to_file|edit_file|replace_file_content",
  "hooks": [
    {
      "type": "command",
      "command": "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: antigravity' -H 'X-Hook-Event: PreToolUse' --data-binary @- >/dev/null 2>&1 || true; echo '{\"decision\":\"allow\"}'",
      "timeout": 10
    }
  ]
}
```

### 6.4 Windows 环境适配说明

Windows 下 Antigravity 使用 `cmd /c` 执行 `command`：
- 将 `curl` 替换为 `curl.exe`（Windows 10+ 内置），`>/dev/null 2>&1` 替换为 `>NUL 2>&1`。
- `cmd /c` 不支持 POSIX `case ... esac`，建议将本地预过滤逻辑写入短 PowerShell 单行命令或独立 `.ps1` 脚本，并在结尾输出 `{"decision":"allow"}` / `{"decision":"stop"}`。

---

## 7. 验证与排查清单

1. **检查配置加载状态**：
   - **CLI**：在会话中执行 `/hooks` 命令，确认 `cloudhook` 出现在已加载列表且状态为 `enabled`。
   - **IDE**：打开 **Customizations > Hooks** 面板，确认规则已识别且无 JSON 语法错误提示。
2. **离线 Stdin Dry-Run 测试**（验证 stdout 合规性与本地预过滤）：
   ```bash
   # 测试 PreToolUse 输出合法 JSON
   echo '{"conversationId":"test-1","stepIdx":1,"toolCall":{"id":"t1","name":"ask_question","args":{"questions":[{"question":"Proceed?"}]}}}' \
     | sh -c "<你的 PreToolUse command>"
   # 预期输出: {"decision":"allow"}

   # 测试 Stop 本地预过滤（USER_CANCELED 不应发起网络请求，直接秒回）
   echo '{"conversationId":"test-1","terminationReason":"USER_CANCELED","fullyIdle":true}' \
     | sh -c "<你的 Stop command>"
   # 预期输出: {"decision":"stop"}
   ```
3. **CloudHook 后台日志核对**：
   - **AccessLogs（访问日志）**：检查 `agent` 是否为 `antigravity`，`result` 是否为 `allowed`（若为 `denied` 检查 `reason` 如 `token_expired` / `token_revoked`）。
   - **Events（事件日志）**：检查 `event_type` 与 `notified` 字段；若 `push_error` 为 `agent_muted`，说明 Antigravity 来源被静音。
4. **重新开启 Antigravity 推送开关**：
   - 若此前因噪音临时关闭了 Antigravity 推送，登录 CloudHook 管理后台 → **ConfigPage（系统配置）** → 找到 **智能体通知开关** → 重新开启 **Antigravity** 开关并保存。
