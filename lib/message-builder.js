/**
 * CloudHook - 消息构建器
 * 构建发送到 Bark 的通知消息
 */

// ============================================================================
// 标题映射（精简为实际使用的事件类型）
// ============================================================================

const TITLE_MAP = {
  'permission_required': 'Claude Code 需要权限',
  'attention_required': 'Claude Code 需要你',
  'task_done': 'Claude Code 已完成'
};

// ============================================================================
// 消息体构建函数
// ============================================================================

/**
 * 构建权限请求消息
 */
function buildPermissionBody(parsed, extraSummary, userName, deviceName) {
  const summary = extraSummary || parsed?.summary || '等待用户允许操作';
  const name = userName || '';
  const device = deviceName || 'Unknown Device';

  // 构建前缀："Betsy，Book 上的 Claude Code "
  let prefix = '';
  if (name) {
    prefix = `${name}，${device} 上的 Claude Code `;
  } else {
    prefix = `${device} 上的 Claude Code `;
  }

  // 计算剩余空间：80 - prefix长度 - "需要你允许操作\n操作：" - "..."
  const fixedText = '需要你允许操作\n操作：';
  const maxSummaryLen = 80 - prefix.length - fixedText.length - 3;
  const truncated = summary.length > maxSummaryLen
    ? summary.slice(0, maxSummaryLen) + '...'
    : summary;

  return `${prefix}${fixedText}${truncated}`;
}

/**
 * 构建注意请求消息
 */
function buildAttentionBody(parsed, userName, deviceName) {
  const raw = parsed || {};
  const notification = raw.raw_event?.notification || {};
  const title = notification.title || notification.message || '请求你的注意';
  const name = userName || '';
  const device = deviceName || 'Unknown Device';

  // 构建消息
  let message = '';
  if (name) {
    message = `${name}，${device} 上的 Claude Code ${title}`;
  } else {
    message = `${device} 上的 Claude Code ${title}`;
  }

  // 总长度限制 80
  if (message.length > 80) {
    message = message.slice(0, 77) + '...';
  }

  return message;
}

/**
 * 构建任务完成消息
 */
function buildDoneBody(parsed, userName, deviceName) {
  const raw = parsed || {};
  const lastMsg = raw.raw_event?.last_assistant_message || '';
  const name = userName || '';
  const device = deviceName || 'Unknown Device';

  let prefix = '';
  if (name) {
    prefix = `${name}，${device} 上的 Claude Code 已完成当前任务`;
  } else {
    prefix = `${device} 上的 Claude Code 已完成当前任务`;
  }

  if (lastMsg) {
    const maxMsgLen = 80 - prefix.length - 1; // 1 for newline
    const truncated = lastMsg.length > maxMsgLen
      ? lastMsg.slice(0, maxMsgLen - 3) + '...'
      : lastMsg;
    return `${prefix}\n${truncated}`;
  }

  return prefix;
}

// ============================================================================
// 主构建函数
// ============================================================================

/**
 * 构建通知消息
 * @param {string} eventType - 事件类型
 * @param {object} parsed - 解析后的事件
 * @param {object} dangerInfo - 危险信息（已废弃，保留参数兼容性）
 * @param {object} driftInfo - 漂移信息（已废弃，保留参数兼容性）
 * @param {object} failureInfo - 失败信息（已废弃，保留参数兼容性）
 * @param {string} extraSummary - 额外摘要
 * @param {object} config - 配置对象
 * @param {string} deviceName - 设备名称
 * @returns {{title: string, body: string}}
 */
export function buildMessage(
  eventType,
  parsed = null,
  dangerInfo = null,
  driftInfo = null,
  failureInfo = null,
  extraSummary = '',
  config = null,
  deviceName = null
) {
  // 从配置中提取用户名
  const personaEnabled = config?.persona?.enabled !== false;
  const userName = personaEnabled ? (config?.persona?.user_name || 'Betsy') : '';

  // 设备名称，默认值
  const device = deviceName || 'Unknown Device';

  // 获取标题
  const title = TITLE_MAP[eventType] || 'Claude Code 提醒';

  // 构建消息体
  let body = '';

  switch (eventType) {
    case 'permission_required':
      body = buildPermissionBody(parsed, extraSummary, userName, device);
      break;

    case 'attention_required':
      body = buildAttentionBody(parsed, userName, device);
      break;

    case 'task_done':
      body = buildDoneBody(parsed, userName, device);
      break;

    default:
      if (userName) {
        body = `${userName}，${device} 上的 Claude Code 事件`;
      } else {
        body = `${device} 上的 Claude Code 事件`;
      }
  }

  return { title, body };
}

/**
 * 获取默认配置
 * @returns {object}
 */
export function getDefaultConfig() {
  return {
    bark_key: '',
    bark_server: 'https://api.day.app',
    persona: {
      enabled: true,
      user_name: 'Betsy'
    },
    risk_control: {
      geo: {
        enabled: false,
        allowed_countries: [],
        allowed_regions: []
      },
      ip: {
        mode: 'off',
        allowlist: [],
        blocklist: []
      },
      rate_limit: {
        enabled: true,
        max_per_minute: 100
      }
    }
  };
}
