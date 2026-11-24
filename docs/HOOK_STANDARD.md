# CloudHook 多智能体 Hook 统一接入标准

本文档定义 CloudHook 面向多智能体（Claude Code、Codex CLI、Antigravity、Kimi Code 及未来扩展）的统一接入协议、抗噪工程原则、事件分类矩阵与标准最小配置模板。Antigravity 专项细节请参见 [ANTIGRAVITY_HOOK_STANDARD.md](./ANTIGRAVITY_HOOK_STANDARD.md)。

---

## 1. CloudHook 统一接入协议

### 1.1 端点与请求头

- **统一入口**：`POST /api/hook`（`/api/notify` 为等效别名）
- **核心请求头**：
  - `Content-Type: application/json`
  - `X-CloudHook-Token: <设备 Token>`（无状态 HMAC-SHA256 签名令牌，必填）
  - `X-Agent-Type: <agent_id>`（强烈推荐：`claude_code` / `codex` / `antigravity` / `kimi_code`）
  - `X-Hook-Event: <EventName>`（当智能体 payload 不带事件名字段时必填，如 Antigravity）

### 1.2 四层来源识别链（`detectAgent`）

由于 Codex / Antigravity / Kimi Code 均通过 `curl` 转发，User-Agent 恒为 `curl/x.y`，CloudHook 按以下优先级自动识别来源：

1. **`header`**：`X-Agent-Type` 请求头（或 URL query `?agent=`）→ 显式归一化映射。
2. **`ua`**：`User-Agent` 关键词匹配（忽略空 UA 与 `curl/*`）。
3. **`shape`**：Payload 字段形状推断（`client_type === 'kimi_code_cli'` → `conversationId` + Antigravity 特征字段 → `hook_event_name` + `turn_id|model` / `agent-turn-complete` → Claude Code 特征字段）。
4. **`fallback`**：兜底归类为 `unknown`（显示名「其他智能体」，分类走 Claude Code 规则）。

### 1.3 HTTP 200 响应契约

EdgeOne 平台会对 `5xx` 响应覆盖 HTML 错误页导致诊断信息丢失，因此 `/api/hook` **所有路径一律返回 HTTP 200**，通过 JSON 响应体中的 `success: true | false` 表达实际结果（鉴权失败、限流、IP/地理拦截均会写入访问日志）。

---

## 2. 四大智能体 Hook 协议对比矩阵

| 维度 | Claude Code | Codex CLI | Antigravity | Kimi Code |
|---|---|---|---|---|
| **配置文件路径** | `~/.claude/settings.json`<br>`.claude/settings.json` | `~/.codex/hooks.json`<br>`.codex/hooks.json` | `~/.gemini/config/hooks.json`<br>`.agents/hooks.json` | `~/.kimi-code/config.toml` |
| **配置格式** | JSON（`hooks` 字段） | JSON（`hooks` 字段）或 TOML | JSON（顶层为命名 Hook Key） | TOML（`[[hooks]]` 数组） |
| **Handler 类型** | 原生 `http` + `command` | 仅 `command` | 仅 `command` | 仅 `command` |
| **JSON 键名风格** | `snake_case` | `snake_case` | **`camelCase`**（protojson） | `snake_case` |
| **事件名字段** | `hook_event_name` | `hook_event_name` | `hookEventName`（部分早期版本缺失，需 `X-Hook-Event`） | `hook_event_name` |
| **原生权限事件** | `PermissionRequest` / `Notification` | `PermissionRequest` | **无**（用 `PreToolUse` 匹配 `ask_question\|ask_permission` 替代） | `PermissionRequest` |
| **Stdout 契约** | `http` hook 忽略；`command` 可为空 | 必须为空或合法 JSON | **必须为合法 JSON**（如 `{"decision":"allow"}` / `{"decision":"stop"}`） | 建议重定向丢弃（防被当作 `hookSpecificOutput`） |

---

## 3. 核心抗噪四原则（Four Golden Rules）

1. **只订阅「交互阻断」与「回合结束」**：绝不在日常配置中订阅全量工具调用（`PreToolUse` / `PostToolUse` 通配 `*`）。只有当智能体**必须等待人类输入**或**一轮任务真正结束**时才应推 Bark。
2. **后台任务中间态静默（`turn_paused`）**：子智能体或后台任务未全部结束时的回合暂停（Claude Code `background_tasks.length > 0`、Codex/Kimi `SubagentStop`、Antigravity `fullyIdle: false`）归类为 `turn_paused`，**仅记日志，绝不推 Bark**。
3. **非推送类 `info` 事件客户端预过滤 + 服务端兜底**：对于本地即可判定的无噪音事件（如 Antigravity 的 `USER_CANCELED`、`TERMINAL_CUSTOM_HOOK`、`fullyIdle: false`），在本地 `command` 中通过 `case` 精确键值匹配直接跳过网络请求；对于常规工具调用等 `info` 事件，Antigravity 通道在服务端也会强制静默不推 Bark。
4. **短超时 + Fail-Open**：所有 `command` 型 hook 必须设置 `--connect-timeout 3 -m 5`（或 `-m 8`/`-m 10`）与 `|| true`，确保网络抖动或服务端异常时**永不阻塞、永不报错中断智能体主流程**。

---

## 4. 统一事件分类与推送矩阵

CloudHook 后端 `classify(parsed, agentId)` 将各智能体事件统一映射为 5 种分类：
- `permission_required`（推送，高风险）
- `attention_required`（推送，中/高风险）
- `task_done`（推送，低风险）
- `turn_paused`（**只记日志，不推送**）
- `info`（Claude Code/Codex/Kimi 到达即推，故需在客户端少注册；**Antigravity 通道在服务端强制只记日志不推送**）

| 智能体 | 触发事件 / 条件 | 后端分类 | 是否推送 Bark |
|---|---|---|---|
| **Claude Code** | `PermissionRequest` / `Notification`（含权限关键词） | `permission_required` | 是 |
| | `Notification`（其他交互/空闲提醒） | `attention_required` | 是 |
| | `Stop`（`background_tasks` 为空或缺失） | `task_done` | 是 |
| | `Stop`（`background_tasks` 非空） | `turn_paused` | **否** |
| **Codex CLI** | `PermissionRequest` | `permission_required` | 是 |
| | `Stop` | `task_done` | 是 |
| | `SubagentStop` | `turn_paused` | **否** |
| **Antigravity** | `PreToolUse` (`ask_permission`) / `PreToolUse` (`run_command` 且 `high`/`critical`) | `permission_required` | 是 |
| | `PreToolUse` (`ask_question` / 写文件且 `RequestFeedback: true`) | `attention_required` | 是 |
| | `PreToolUse`（其他工具或低/中风险命令）/ `PostToolUse` / `SessionStart` / `PreInvocation` | `info` | **否**（服务端静默） |
| | `Stop` (`fullyIdle === false`) | `turn_paused` | **否** |
| | `Stop` (`USER_CANCELED` / `TERMINAL_CUSTOM_HOOK`) | `info` | **否**（服务端静默） |
| | `Stop` (`ERROR` / `MAX_*` / `TERMINAL_STEP_TYPE` / 非空 `error`) | `attention_required` | 是 |
| | `Stop` (`NO_TOOL_CALL` / `INJECTED_RESPONSE` 且 `fullyIdle !== false`) | `task_done` | 是 |
| **Kimi Code** | `PermissionRequest` | `permission_required` | 是 |
| | `StopFailure` / `PostToolUseFailure` / `Notification` (`task.failed`) | `attention_required` | 是 |
| | `Stop` / `Notification` (`task.completed`) | `task_done` | 是 |
| | `SubagentStop` | `turn_paused` | **否** |

---

## 5. 各智能体标准最小配置模板

以下模板中的 `<ENDPOINT>` 替换为 `https://<你的域名>/api/hook`，`<TOKEN>` 替换为设备 Token。

### 5.1 Claude Code（`~/.claude/settings.json`）

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "<ENDPOINT>",
            "headers": {
              "X-CloudHook-Token": "<TOKEN>",
              "X-Agent-Type": "claude_code"
            }
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "<ENDPOINT>",
            "headers": {
              "X-CloudHook-Token": "<TOKEN>",
              "X-Agent-Type": "claude_code"
            }
          }
        ]
      }
    ]
  }
}
```

### 5.2 Codex CLI（`~/.codex/hooks.json`）

```json
{
  "description": "CloudHook 事件推送",
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: codex' --data-binary @- >/dev/null 2>&1 || true",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: codex' --data-binary @- >/dev/null 2>&1 || true",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### 5.3 Antigravity（`~/.gemini/config/hooks.json`）

完整参数、本地预过滤、高危命令可选模板与排查指南请见 [ANTIGRAVITY_HOOK_STANDARD.md](./ANTIGRAVITY_HOOK_STANDARD.md)。

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

### 5.4 Kimi Code（`~/.kimi-code/config.toml`）

```toml
[[hooks]]
event = "PermissionRequest"
command = "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: kimi_code' --data-binary @- >/dev/null 2>&1 || true"
timeout = 10

[[hooks]]
event = "Stop"
command = "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: kimi_code' --data-binary @- >/dev/null 2>&1 || true"
timeout = 10

[[hooks]]
event = "Notification"
matcher = "task\\.(completed|failed)"
command = "curl -sS --connect-timeout 3 -m 5 -X POST '<ENDPOINT>' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: <TOKEN>' -H 'X-Agent-Type: kimi_code' --data-binary @- >/dev/null 2>&1 || true"
timeout = 10
```

---

## 6. 新智能体接入检查清单（Onboarding Checklist）

新增第 5+ 个智能体支持时，按以下顺序同步改动：

1. **双份共享模块同步**（`lib/` 与 `edge-functions/_shared.js`）：
   - `kv-store`：`getDefaultConfig().agents` 添加新 `<agent_id>: { enabled: true }`。
   - `agent-detect`：`AGENT_NAMES` 添加显示名；`_normalizeAgentId` 添加别名；`_detectByUa` 与 `_detectByShape` 添加特征判据（注意避免与现有智能体字段冲突）。
   - `classifier`：`classify(parsed, agentId)` 添加专属分类分支（明确哪些事件为 `turn_paused` 或 `info` 静默）。
   - `message-builder`：`getRiskLevel` 与 `buildMessage` 适配新工具名与异常摘要字段。
2. **入口路由同步**（`edge-functions/api/hook.js` 与 `edge-functions/api/notify.js` 保持除第 2 行注释外字节一致）：
   - 若 payload 无标准事件名字段，补充事件名推断函数；在 `parseEvent` 中映射特有 `toolCall` / 参数字段。
3. **前端与开关**（`frontend/`）：
   - `HooksPage.tsx` 新增对应 Tab（使用 `JSON.stringify` 生成配置，严禁手写转义；注意 EdgeOne WAF 对敏感字面量的限制）。
   - `ConfigPage.tsx` / `EventsPage.tsx` / `AccessLogsPage.tsx` 补充来源筛选与开关项。
4. **冒烟测试与文档**：
   - 在 `scripts/test-agent-detect.mjs` 补充来源识别、分类、文案与 `_shared.js` 一致性断言并运行通过。
   - 更新 `docs/HOOK_STANDARD.md` 与 `CLAUDE.md`。
