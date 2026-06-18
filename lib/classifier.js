/**
 * CloudHook - 事件分类器
 * 将 Claude Code hook 事件分类为通知类型
 */

// ============================================================================
// 关键词集合（用于扫描 Notification 内容）
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

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 扫描 Notification 文本中的关键词
 * @param {string} rawText - 原始文本
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
 * @returns {string} 事件类型
 *
 * 返回值：
 *   - permission_required: PermissionRequest 或 Notification 含权限关键词
 *   - attention_required: Notification 无强权限关键词
 *   - task_done: Stop hook 触发
 */
export function classify(parsed) {
  const eventName = parsed.event_name || '';

  if (eventName === 'PermissionRequest') {
    return 'permission_required';
  }

  if (eventName === 'Notification') {
    return scanNotificationText(parsed);
  }

  if (eventName === 'Stop') {
    return 'task_done';
  }

  // 未配置的事件不推送
  return 'info';
}
