/**
 * Hooks 配置页面
 *
 * 指导用户在 Claude Code 中配置「原生 http hook」，使 CC 生命周期事件
 * 携带设备 Token 直接 POST 到 CloudHook 端点，再由后端分类并经 Bark 推送。
 *
 * 链路：CC 事件 → POST /api/hook（X-CloudHook-Token）→ 分类/策略 → Bark 通知
 *
 * 说明文档参考：https://code.claude.com/docs/zh-CN/hooks
 * 鉴权说明：/api/hook 仅校验 X-CloudHook-Token（本身为 HMAC 签名令牌，自验证防伪造），
 *           无需在客户端实时计算请求签名，因此可直接用 CC 原生 http hook。
 */

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui';
import { Copy, Check, AlertTriangle } from 'lucide-react';

export default function HooksPage() {
  const token = useAuthStore((s) => s.token);
  const [copied, setCopied] = useState<string | null>(null);

  // 部署地址取当前站点 origin，端点固定 /api/hook
  const endpoint = `${window.location.origin}/api/hook`;
  // 未登录到 token 时给占位符，引导用户去登录/设备页
  const tokenValue = token || '<在此粘贴你的 CloudHook Token>';

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // 单个事件的 http hook 处理程序块（CC 原生格式）
  const handlerBlock = `        {
          "hooks": [
            {
              "type": "http",
              "url": "${endpoint}",
              "headers": {
                "X-CloudHook-Token": "${tokenValue}"
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
              "X-CloudHook-Token": "${tokenValue}"
            }
          }
        ]
      }
    ]
  }
}`;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 页头 */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
          Hook 配置
        </h1>
        <p className="text-gray-600 tracking-wide">
          在 Claude Code 中配置原生 http hook，事件携带 Token 直推 CloudHook，再经 Bark 通知你
        </p>
      </div>

      {/* 链路说明 */}
      <div className="mb-8 bg-gradient-to-r from-gray-50 to-stone-50 border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 tracking-tight">🔗 工作原理</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 tracking-wide">
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">Claude Code 事件</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">携带 Token POST /api/hook</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">分类 / 策略判断</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 font-medium">Bark 推送到你的设备</span>
        </div>
        <p className="text-sm text-gray-600 mt-3 tracking-wide">
          Claude Code 在生命周期事件触发时，把事件 JSON 通过 POST 直接发到 CloudHook 端点，
          请求头携带你的设备 Token 完成鉴权。凡到达端点的事件，后端都会识别类型并经 Bark 通知你，
          推送哪些事件完全由你在 settings.json 里注册的 hook 决定。
        </p>
      </div>

      {/* 接入信息：端点 + Token */}
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
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight">推荐配置</h3>
            <p className="text-sm text-gray-600 mt-0.5 tracking-wide">监听「需要交互」与「任务完成」两类关键事件</p>
          </div>
          <Button variant="secondary" onClick={() => copy(fullConfig, 'full')} className="flex items-center gap-2">
            {copied === 'full' ? <><Check size={16} />已复制</> : <><Copy size={16} />复制配置</>}
          </Button>
        </div>
        <div className="p-6">
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
            <code>{fullConfig}</code>
          </pre>
        </div>
      </div>

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
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight">可选：危险操作检测</h3>
            <p className="text-sm text-gray-600 mt-0.5 tracking-wide">监听 Bash/写文件等工具调用，命中危险模式时告警</p>
          </div>
          <Button variant="secondary" onClick={() => copy(dangerConfig, 'danger')} className="flex items-center gap-2">
            {copied === 'danger' ? <><Check size={16} />已复制</> : <><Copy size={16} />复制配置</>}
          </Button>
        </div>
        <div className="p-6">
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
            <code>{dangerConfig}</code>
          </pre>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-amber-900 mb-2 tracking-tight">💡 提示</h3>
        <ul className="text-sm text-amber-800 space-y-1 tracking-wide">
          <li>• <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">matcher</code> 用于过滤工具，省略或用 <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">"*"</code> 表示匹配全部</li>
          <li>• Token 即登录时签发的设备凭证，在「设备管理」页可撤销；撤销后该 Token 立即失效</li>
          <li>• http hook 的非 2xx 响应不会阻断 Claude Code，推送失败不影响你正常使用</li>
          <li>• 不想暴露 Token 明文，可改用环境变量：headers 写 <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">"$CLOUDHOOK_TOKEN"</code> 并在同级加 <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">"allowedEnvVars": ["CLOUDHOOK_TOKEN"]</code></li>
        </ul>
      </div>
    </div>
  );
}
