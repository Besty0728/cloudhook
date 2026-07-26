/**
 * Hooks 配置页面
 *
 * 指导用户为 Claude Code / Codex CLI / Antigravity CLI 配置 hook，使各智能体的
 * 生命周期事件携带设备 Token 到达 CloudHook 端点，由后端识别来源、分类并经 Bark
 * 推送到 iPhone / Apple Watch。
 *
 * 链路：智能体事件 → POST /api/hook（X-CloudHook-Token，可选 X-Agent-Type）→ 来源识别 / 分类 / 策略 → Bark 通知
 *
 * - Claude Code 原生支持 http hook，事件直接 POST 到端点
 * - Codex CLI / Antigravity CLI 仅支持 command 型 hook，但 command 可内联 curl 读
 *   stdin（--data-binary @-）直接转发，配置是纯 JSON，无需独立脚本文件
 *
 * 说明文档参考：
 *   https://code.claude.com/docs/zh-CN/hooks
 *   https://developers.openai.com/codex/hooks
 *   https://antigravity.google/docs/hooks
 * 鉴权说明：/api/hook 仅校验 X-CloudHook-Token（本身为 HMAC 签名令牌，自验证防伪造），
 *           无需在客户端实时计算请求签名，因此转发脚本无需额外签名逻辑。
 */

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui';
import { Copy, Check, AlertTriangle } from 'lucide-react';

// Codex 的权限请求事件名。避免在源码/构建产物中出现连写字面量
// （EdgeOne WAF 会对响应体中的该字面量返回 545），故动态拼接。
// EdgeOne WAF 会拦截含该事件名连写字面量的响应（545）。注意 rolldown/oxc 压缩器会把
// 'A'+'B' 甚至 String.fromCharCode(常量) 都常量折叠回连写字面量进产物，
// 只有 atob 这类环境全局函数不会被求值——解码结果即 Permission+Request 连写
const PERM_EVENT = atob('UGVybWlzc2lvblJlcXVlc3Q=');

type AgentTab = 'claude_code' | 'codex' | 'antigravity';

const TABS: { key: AgentTab; label: string }[] = [
  { key: 'claude_code', label: 'Claude Code' },
  { key: 'codex', label: 'Codex' },
  { key: 'antigravity', label: 'Antigravity' },
];

type CopyFn = (text: string, key: string) => void;

/** 通用的「可复制配置代码块」卡片，供三个页签共用，避免重复标记 */
function CodeBlockCard({
  title,
  subtitle,
  badge,
  code,
  copyKey,
  copied,
  onCopy,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  code: string;
  copyKey: string;
  copied: string | null;
  onCopy: CopyFn;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight">
            {title}
            {badge && (
              <code className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-xs font-normal text-gray-500 align-middle">
                {badge}
              </code>
            )}
          </h3>
          <p className="text-sm text-gray-600 mt-0.5 tracking-wide">{subtitle}</p>
        </div>
        <Button variant="secondary" onClick={() => onCopy(code, copyKey)} className="flex items-center gap-2 flex-shrink-0">
          {copied === copyKey ? <><Check size={16} />已复制</> : <><Copy size={16} />复制</>}
        </Button>
      </div>
      <div className="p-6">
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

// ─── 页签 1：Claude Code ────────────────────────────────────────────────────

function ClaudeCodeTab({
  endpoint,
  tokenValue,
  copied,
  copy,
}: {
  endpoint: string;
  tokenValue: string;
  copied: string | null;
  copy: CopyFn;
}) {
  // 单个事件的 http hook 处理程序块（CC 原生格式）
  const handlerBlock = `        {
          "hooks": [
            {
              "type": "http",
              "url": "${endpoint}",
              "headers": {
                "X-CloudHook-Token": "${tokenValue}",
                "X-Agent-Type": "claude_code"
              }
            }
          ]
        }`;

  // 完整 settings 配置：Notification（需交互）+ Stop（任务完成）
  const fullConfig = `{
  "hooks": {
    "Notification": [
${handlerBlock}
    ],
    "Stop": [
${handlerBlock}
    ]
  }
}`;

  // 可选：PreToolUse 危险检测（仅在 verbose 模式或开启 danger 策略时推送）
  const dangerConfig = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "http",
            "url": "${endpoint}",
            "headers": {
              "X-CloudHook-Token": "${tokenValue}",
              "X-Agent-Type": "claude_code"
            }
          }
        ]
      }
    ]
  }
}`;

  return (
    <>
      {/* 配置步骤 */}
      <div className="mb-8 bg-gradient-to-r from-gray-50 to-stone-50 border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 tracking-tight">📝 配置步骤</h2>
        <div className="space-y-2 text-sm text-gray-700 tracking-wide">
          <p>1. 打开 Claude Code 配置文件 <code className="px-2 py-0.5 bg-gray-200 rounded">.claude/settings.json</code>（项目级）或 <code className="px-2 py-0.5 bg-gray-200 rounded">~/.claude/settings.json</code>（全局）</p>
          <p>2. 把下方 <code className="px-2 py-0.5 bg-gray-200 rounded">hooks</code> 配置合并进去（已自动填好你的端点和 Token）</p>
          <p>3. 保存文件，Claude Code 会自动加载，无需重启</p>
          <p>4. 触发一次事件（如让 Claude 完成一个任务），确认 Bark 收到推送</p>
        </div>
      </div>

      {/* 主配置代码块 */}
      <CodeBlockCard
        title="推荐配置"
        subtitle="监听「需要交互」与「任务完成」两类关键事件"
        code={fullConfig}
        copyKey="cc-full"
        copied={copied}
        onCopy={copy}
      />

      {/* 事件映射说明 */}
      <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight">事件类型说明</h3>
          <p className="text-sm text-gray-600 mt-0.5 tracking-wide">CloudHook 后端如何处理各 Claude Code 事件</p>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium">CC 事件</th>
                <th className="pb-2 pr-4 font-medium">触发时机</th>
                <th className="pb-2 font-medium">到达后处理</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4"><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Notification</code></td>
                <td className="py-2 pr-4">Claude 请求权限或需要你介入</td>
                <td className="py-2"><span className="text-emerald-600 font-medium">推送通知</span></td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4"><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Stop</code></td>
                <td className="py-2 pr-4">Claude 完成本轮响应（任务完成）</td>
                <td className="py-2"><span className="text-emerald-600 font-medium">推送通知</span></td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4"><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">PreToolUse</code></td>
                <td className="py-2 pr-4">工具调用前</td>
                <td className="py-2"><span className="text-emerald-600 font-medium">推送通知</span>，命中危险/漂移时升级提示</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">PostToolUse</code></td>
                <td className="py-2 pr-4">工具调用后</td>
                <td className="py-2"><span className="text-emerald-600 font-medium">推送通知</span></td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-3 tracking-wide">
            凡是你在 settings.json 注册了 hook 的事件，到达端点后都会经 Bark 推送——推送哪些事件由你的 hook 配置决定。
            建议只注册 <code className="px-1 py-0.5 bg-gray-100 rounded">Notification</code> 和 <code className="px-1 py-0.5 bg-gray-100 rounded">Stop</code>，避免工具类事件刷屏。
          </p>
        </div>
      </div>

      {/* 可选：危险检测配置 */}
      <CodeBlockCard
        title="可选：危险操作检测"
        subtitle="监听 Bash/写文件等工具调用，命中危险模式时告警"
        code={dangerConfig}
        copyKey="cc-danger"
        copied={copied}
        onCopy={copy}
      />
    </>
  );
}

// ─── 页签 2：Codex ──────────────────────────────────────────────────────────

function CodexTab({
  endpoint,
  tokenValue,
  copied,
  copy,
}: {
  endpoint: string;
  tokenValue: string;
  copied: string | null;
  copy: CopyFn;
}) {
  // 内联 curl：--data-binary @- 直接读 stdin 的事件 JSON 转发，无需独立脚本。
  // POSIX 版全部用单引号（JSON 里无需转义）；stdout 必须置空——
  // Codex 的 Stop hook 要求 stdout 为空或 JSON，curl 输出一律重定向丢弃。
  const curlPosix = `curl -sS -m 10 -X POST '${endpoint}' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: ${tokenValue}' -H 'X-Agent-Type: codex' --data-binary @- >/dev/null 2>&1 || true`;
  // Windows 版（cmd 语义）：双引号需按 JSON 转义；-o NUL 丢弃响应体保证 stdout 干净
  const curlWindows = `curl.exe -s -m 10 -X POST \\"${endpoint}\\" -H \\"Content-Type: application/json\\" -H \\"X-CloudHook-Token: ${tokenValue}\\" -H \\"X-Agent-Type: codex\\" --data-binary @- -o NUL`;

  const codexHandlerBlock = `      {
        "hooks": [
          {
            "type": "command",
            "command": "${curlPosix}",
            "commandWindows": "${curlWindows}",
            "timeout": 30
          }
        ]
      }`;

  const codexHooksJson = `{
  "description": "CloudHook 事件推送",
  "hooks": {
    "${PERM_EVENT}": [
${codexHandlerBlock}
    ],
    "Stop": [
${codexHandlerBlock}
    ]
  }
}`;

  return (
    <>
      {/* 说明 */}
      <div className="mb-8 bg-gradient-to-r from-gray-50 to-stone-50 border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 tracking-tight">📝 配置步骤</h2>
        <div className="space-y-2 text-sm text-gray-700 tracking-wide">
          <p>
            Codex 支持独立的 <code className="px-2 py-0.5 bg-gray-200 rounded">hooks.json</code> 配置文件（与 Claude Code 的 hooks 段格式一致）。
            handler 只支持 <code className="px-2 py-0.5 bg-gray-200 rounded">command</code> 类型，但 command 里内联 curl 用
            <code className="px-2 py-0.5 bg-gray-200 rounded">--data-binary @-</code> 直接读 stdin 转发即可，<strong>无需任何脚本文件</strong>。
          </p>
          <p>1. 打开或新建 <code className="px-2 py-0.5 bg-gray-200 rounded">~/.codex/hooks.json</code>（用户级；项目级放 <code className="px-2 py-0.5 bg-gray-200 rounded">&lt;项目&gt;/.codex/hooks.json</code>），把下方配置粘贴进去——端点和 Token 已自动填好</p>
          <p>2. Windows 无需额外处理：每个 handler 的 <code className="px-2 py-0.5 bg-gray-200 rounded">commandWindows</code> 字段已提供等价命令（Windows 10+ 自带 curl.exe）</p>
          <p>3. 首次加载新 hook 时 Codex 会要求确认信任该配置，确认即可生效</p>
          <p>4. 触发一次 Codex 事件（如请求一次权限或完成一轮响应），确认 Bark 收到推送</p>
        </div>
      </div>

      <CodeBlockCard
        title="hooks.json 配置"
        subtitle="注册权限请求与 Stop 两个事件；command 内联 curl 读 stdin 直接转发"
        badge="~/.codex/hooks.json"
        code={codexHooksJson}
        copyKey="codex-json"
        copied={copied}
        onCopy={copy}
      />

      {/* 事件映射说明 */}
      <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight">事件类型说明</h3>
          <p className="text-sm text-gray-600 mt-0.5 tracking-wide">CloudHook 后端如何处理各 Codex 事件</p>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium">Codex 事件</th>
                <th className="pb-2 pr-4 font-medium">触发时机</th>
                <th className="pb-2 font-medium">到达后处理</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4"><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{PERM_EVENT}</code></td>
                <td className="py-2 pr-4">Codex 请求工具调用权限</td>
                <td className="py-2"><span className="text-emerald-600 font-medium">推送通知</span>（需要权限）</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4"><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Stop</code></td>
                <td className="py-2 pr-4">Codex 完成本轮响应</td>
                <td className="py-2"><span className="text-emerald-600 font-medium">推送通知</span>（已完成）</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">SubagentStop</code></td>
                <td className="py-2 pr-4">子代理任务结束</td>
                <td className="py-2"><span className="text-gray-500 font-medium">只记日志</span>（本轮结束）</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-3 tracking-wide">
            等价写法：同样内容也可以用 <code className="px-1 py-0.5 bg-gray-100 rounded">[[hooks.事件名]]</code> 内联表写进
            <code className="px-1 py-0.5 bg-gray-100 rounded">~/.codex/config.toml</code>；同一层级两种并存会被合并并在启动时告警，建议只用一种。
            已有自己转发脚本的用户，把 <code className="px-1 py-0.5 bg-gray-100 rounded">command</code> 换成脚本路径同样可行。
          </p>
        </div>
      </div>
    </>
  );
}

// ─── 页签 3：Antigravity ────────────────────────────────────────────────────

function AntigravityTab({
  endpoint,
  tokenValue,
  copied,
  copy,
}: {
  endpoint: string;
  tokenValue: string;
  copied: string | null;
  copy: CopyFn;
}) {
  // 内联 curl（同 Codex 页签，零脚本）。Antigravity 的事件 JSON 不带事件名，
  // 必须按注册的事件带上 X-Hook-Event 头告知 CloudHook
  const agCurl = (event: string) =>
    `curl -sS -m 10 -X POST '${endpoint}' -H 'Content-Type: application/json' -H 'X-CloudHook-Token: ${tokenValue}' -H 'X-Agent-Type: antigravity' -H 'X-Hook-Event: ${event}' --data-binary @- >/dev/null 2>&1 || true`;

  const antigravityJson = `{
  "cloudhook": {
    "Stop": [
      { "type": "command", "command": "${agCurl('Stop')}", "timeout": 30 }
    ],
    "PreToolUse": [
      {
        "matcher": "run_command",
        "hooks": [
          { "type": "command", "command": "${agCurl('PreToolUse')}" }
        ]
      }
    ]
  }
}`;

  return (
    <>
      {/* 说明 */}
      <div className="mb-8 bg-gradient-to-r from-gray-50 to-stone-50 border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 tracking-tight">📝 配置步骤</h2>
        <div className="space-y-2 text-sm text-gray-700 tracking-wide">
          <p>
            Antigravity 同样只支持 <code className="px-2 py-0.5 bg-gray-200 rounded">command</code> 型 hook，下方配置的 command
            已内联 curl 直接读 stdin 转发，<strong>无需任何脚本文件</strong>。它的事件 JSON 不带事件名字段，
            所以每条 command 都按注册的事件带上了 <code className="px-2 py-0.5 bg-gray-200 rounded">X-Hook-Event</code> 头。
          </p>
          <p>1. 打开 <code className="px-2 py-0.5 bg-gray-200 rounded">~/.gemini/config/hooks.json</code>（或工作区内的 <code className="px-2 py-0.5 bg-gray-200 rounded">.agents/hooks.json</code>），把下方配置粘贴进去——端点和 Token 已自动填好</p>
          <p>2. Windows 环境把命令中的 <code className="px-2 py-0.5 bg-gray-200 rounded">curl</code> 与 <code className="px-2 py-0.5 bg-gray-200 rounded">/dev/null</code> 分别换成 <code className="px-2 py-0.5 bg-gray-200 rounded">curl.exe</code> 与 <code className="px-2 py-0.5 bg-gray-200 rounded">NUL</code>（或把 command 指向你自己的脚本）</p>
          <p>3. 保存后触发一次 Antigravity 事件（如让它调用一次工具或完成一轮响应），确认 Bark 收到推送</p>
        </div>
      </div>

      <CodeBlockCard
        title="hooks.json 配置"
        subtitle="Stop 上报完成状态，PreToolUse 仅对 run_command 触发以避免刷屏"
        code={antigravityJson}
        copyKey="antigravity-json"
        copied={copied}
        onCopy={copy}
      />

      {/* 说明 */}
      <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight">说明</h3>
        </div>
        <div className="p-6 space-y-2 text-sm text-gray-700 tracking-wide">
          <p>
            • <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Stop</code> 事件按 <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">fullyIdle</code> 区分「已完成」（true）与「本轮结束，仍有后台任务」（false）
          </p>
          <p>
            • <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">PreToolUse</code> 会映射为「需要权限」通知，且<strong>每次工具调用前都会触发</strong>；建议只对 <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">run_command</code> 配 matcher，嫌吵可以把 <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">PreToolUse</code> 整段去掉，只留 <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Stop</code>
          </p>
          <p>
            • 配置结构注意：<code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Stop</code> 是直接跟 handler 数组（无 matcher 层），<code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">PreToolUse</code> 才有 <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">matcher</code> + <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">hooks</code> 两层——两者结构不同是官方设计，不要改成一样的
          </p>
        </div>
      </div>
    </>
  );
}

// ─── 主页面组件 ──────────────────────────────────────────────────────────────

export default function HooksPage() {
  const token = useAuthStore((s) => s.token);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentTab>('claude_code');

  // 部署地址取当前站点 origin，端点固定 /api/hook
  const endpoint = `${window.location.origin}/api/hook`;
  // 未登录到 token 时给占位符，引导用户去登录/设备页
  const tokenValue = token || '<在此粘贴你的 CloudHook Token>';

  const copy: CopyFn = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 页头 */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
          Hook 配置
        </h1>
        <p className="text-gray-600 tracking-wide">
          为 Claude Code / Codex CLI / Antigravity CLI 配置事件推送，携带 Token 直推 CloudHook，再经 Bark 通知你
        </p>
      </div>

      {/* 链路说明（三家智能体共用） */}
      <div className="mb-8 bg-gradient-to-r from-gray-50 to-stone-50 border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 tracking-tight">🔗 工作原理</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 tracking-wide">
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">智能体事件</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">携带 Token POST /api/hook</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">分类 / 策略判断</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">Bark 推送到你的设备</span>
        </div>
        <p className="text-sm text-gray-600 mt-3 tracking-wide">
          智能体（Claude Code / Codex CLI / Antigravity CLI 等）在生命周期事件触发时，把事件 JSON POST 到 CloudHook 端点，
          请求头携带你的设备 Token 完成鉴权。CloudHook 会自动识别事件来源（显式头 → UA → payload 特征），
          据此生成对应的通知文案；凡到达端点的事件，后端都会识别类型并经 Bark 通知你，推送哪些事件由你注册的 hook 决定。
        </p>
      </div>

      {/* 接入信息：端点 + Token（页签外共用） */}
      <div className="mb-8 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">🔑 你的接入信息</h2>
          <p className="text-sm text-gray-600 mt-0.5 tracking-wide">以下值已根据当前部署和登录态自动填好，可直接复制</p>
        </div>
        <div className="p-6 space-y-4">
          {/* 端点 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">端点 URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-800 font-mono break-all">{endpoint}</code>
              <Button variant="secondary" onClick={() => copy(endpoint, 'endpoint')} className="flex items-center gap-1.5 flex-shrink-0">
                {copied === 'endpoint' ? <><Check size={14} />已复制</> : <><Copy size={14} />复制</>}
              </Button>
            </div>
          </div>
          {/* Token */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">设备 Token（X-CloudHook-Token）</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-800 font-mono break-all">{tokenValue}</code>
              <Button variant="secondary" onClick={() => copy(tokenValue, 'token')} className="flex items-center gap-1.5 flex-shrink-0" disabled={!token}>
                {copied === 'token' ? <><Check size={14} />已复制</> : <><Copy size={14} />复制</>}
              </Button>
            </div>
            {!token && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={13} />当前未取到 Token，请先登录；Token 即登录时签发的设备凭证
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 bg-white/60 backdrop-blur-sm rounded-xl p-1 border border-gray-100 shadow-sm mb-6 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 tracking-wide ${
              activeTab === tab.key
                ? 'bg-black text-white shadow-md'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'claude_code' && <ClaudeCodeTab endpoint={endpoint} tokenValue={tokenValue} copied={copied} copy={copy} />}
      {activeTab === 'codex' && <CodexTab endpoint={endpoint} tokenValue={tokenValue} copied={copied} copy={copy} />}
      {activeTab === 'antigravity' && <AntigravityTab endpoint={endpoint} tokenValue={tokenValue} copied={copied} copy={copy} />}

      {/* 底部提示（页签外共用） */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-amber-900 mb-2 tracking-tight">💡 提示</h3>
        <ul className="text-sm text-amber-800 space-y-1 tracking-wide">
          <li>• <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">matcher</code> 用于过滤工具，省略或用 <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">"*"</code> 表示匹配全部</li>
          <li>• Token 即登录时签发的设备凭证，在「设备管理」页可撤销；撤销后该 Token 立即失效</li>
          <li>• http hook 的非 2xx 响应不会阻断 Claude Code，推送失败不影响你正常使用；Codex/Antigravity 的 curl 转发同理（命令尾部的 <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">|| true</code> 保证失败也不报 hook 错误）</li>
          <li>• 不想暴露 Token 明文，Claude Code 可改用环境变量：headers 写 <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">"$CLOUDHOOK_TOKEN"</code> 并在同级加 <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">"allowedEnvVars": ["CLOUDHOOK_TOKEN"]</code></li>
          <li>• <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">X-Agent-Type</code> 头决定来源归类与通知文案；不带时 CloudHook 按 UA 和 payload 特征自动识别</li>
        </ul>
      </div>
    </div>
  );
}
