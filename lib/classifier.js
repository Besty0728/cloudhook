/**
 * CloudHook - 事件分类器
 * 将 hook 事件分类为通知类型，按来源（agentId）分支
 */

// ============================================================================
// 关键词集合（用于扫描 Claude Code Notification 内容）
// ============================================================================

// 强权限关键词（用户必须操作）
const PERMISSION_KEYWORDS_EN = [
  'permission', 'permissions', 'allow', 'approve', 'approval',
  'confirm', 'confirmation', 'needs your attention',
  'waiting for input', 'waiting for user', 'requires user',
  'user action required', 'permission_prompt'
];

const PERMISSION_KEYWORDS_ZH = [
  '权限', '允许', '批准', '确认', '等待用户',
  '需要你', '需要用户', '需要操作', '是否继续', '请确认'
];

// lib/ 不经过 EdgeOne WAF，本可直接写字面量 'PermissionRequest'；这里仍用
// String.fromCharCode 动态构建，与 _shared.js（WAF 会拦截该字面量，见 CLAUDE.md
// 「EdgeOne 平台约束」）保持完全一致的写法，便于两份实现逐行 diff 对照。
const PERMISSION_REQUEST_EVENT = String.fromCharCode(
  80, 101, 114, 109, 105, 115, 115, 105, 111, 110, 82, 101, 113, 117, 101, 115, 116
);

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 扫描 Notification 文本中的关键词
 * @param {object} parsed - 解析后的事件对象
 * @returns {string} 'permission_required' | 'attention_required'
 */
function scanNotificationText(parsed) {
  const textLower = parsed.text_lower || (parsed.raw_text || '').toLowerCase();

  for (const kw of PERMISSION_KEYWORDS_EN) {
    if (textLower.includes(kw)) {
      return 'permission_required';
    }
  }

  for (const kw of PERMISSION_KEYWORDS_ZH) {
    if (textLower.includes(kw)) {
      return 'permission_required';
    }
  }

  return 'attention_required';
}

// ============================================================================
// 主分类函数
// ============================================================================

/**
 * 分类解析后的事件
 * @param {object} parsed - 解析后的事件对象
 * @param {string} [agentId] - 来源 id（claude_code/codex/antigravity/kimi_code/unknown）。
 *   缺省时行为与旧版本（未区分来源）完全一致，走 Claude Code 规则。
 * @returns {string} 事件类型
 *
 * 返回值：
 *   - permission_required: PermissionRequest（或等价事件）/ Notification 含权限关键词
 *   - attention_required: Notification 无强权限关键词 / Kimi StopFailure、
 *     PostToolUseFailure、Notification(notification_type 含 failed)
 *   - task_done: Stop 且无未完成后台任务 / Kimi Notification(notification_type 含 completed)
 *   - turn_paused: 本轮结束但仍有后台任务运行中（Claude Code background_tasks /
 *     Codex、Kimi SubagentStop / Antigravity Stop 且 fullyIdle:false）
 *   - info: 其余事件
 */
export function classify(parsed, agentId) {
  const eventName = parsed.event_name || '';

  if (agentId === 'codex') {
    if (eventName === PERMISSION_REQUEST_EVENT) return 'permission_required';
    if (eventName === 'Stop') return 'task_done';
    if (eventName === 'SubagentStop') return 'turn_paused';
    return 'info';
  }

  if (agentId === 'kimi_code') {
    if (eventName === PERMISSION_REQUEST_EVENT) return 'permission_required';
    if (eventName === 'Stop') return 'task_done';
    if (eventName === 'SubagentStop') return 'turn_paused';
    if (eventName === 'StopFailure' || eventName === 'PostToolUseFailure') return 'attention_required';
    if (eventName === 'Notification') {
      // Kimi 的 Notification 是后台任务状态变化（task.completed/task.failed 等），
      // 语义与 Claude Code 的 Notification（权限/空闲提醒）完全不同，不走关键词扫描
      const nt = String((parsed.raw_event && parsed.raw_event.notification_type) || '');
      if (nt.includes('failed')) return 'attention_required';
      if (nt.includes('completed')) return 'task_done';
      return 'info';
    }
    return 'info';
  }

  if (agentId === 'antigravity') {
    if (eventName === 'PreToolUse') return 'permission_required';
    if (eventName === 'Stop') {
      return (parsed.raw_event && parsed.raw_event.fullyIdle === false) ? 'turn_paused' : 'task_done';
    }
    return 'info';
  }

  // claude_code / unknown / 未传 agentId：行为保持不变
  if (eventName === PERMISSION_REQUEST_EVENT) {
    return 'permission_required';
  }

  if (eventName === 'Notification') {
    return scanNotificationText(parsed);
  }

  if (eventName === 'Stop') {
    // Claude Code v2.1.145+：background_tasks 非空 = 本轮结束但仍有后台任务（subagent 等），
    // 不是任务真正完成；字段缺失（旧版本）时保持 task_done 兼容
    const bg = parsed.raw_event && parsed.raw_event.background_tasks;
    if (Array.isArray(bg) && bg.length > 0) return 'turn_paused';
    return 'task_done';
  }

  // 未配置的事件不推送
  return 'info';
}
