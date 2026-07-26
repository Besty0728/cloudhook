/**
 * CloudHook - 消息构建器
 * 构建发送到 Bark 的通知消息
 */

// ============================================================================
// 标题构建
// ============================================================================

/**
 * 按来源显示名生成标题
 * @param {string} eventType - 事件类型
 * @param {string} agentName - 来源显示名（如 'Claude Code' / 'Codex'）
 * @returns {string}
 */
function buildTitle(eventType, agentName) {
  if (eventType === 'permission_required') return `${agentName} 需要权限`;
  if (eventType === 'attention_required') return `${agentName} 需要你`;
  if (eventType === 'task_done') return `${agentName} 已完成`;
  if (eventType === 'turn_paused') return `${agentName} 本轮结束`;
  return `${agentName} 提醒`;
}

// ============================================================================
// 消息体构建函数
// ============================================================================

/**
 * 构建权限请求消息
 */
function buildPermissionBody(parsed, extraSummary, userName, deviceName, agentName) {
  const summary = extraSummary || parsed?.summary || '等待用户允许操作';
  const name = userName || '';
  const device = deviceName || 'Unknown Device';

  // 构建前缀："Betsy，Book 上的 Claude Code "
  let prefix = '';
  if (name) {
    prefix = `${name}，${device} 上的 ${agentName} `;
  } else {
    prefix = `${device} 上的 ${agentName} `;
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
function buildAttentionBody(parsed, userName, deviceName, agentName) {
  const raw = parsed || {};
  // Claude Code 的 Notification payload 中 title/message 是顶层字段，不在
  // notification 子对象里；兼容保留 notification.title/message 以防其他来源用了嵌套结构
  const title = raw.raw_event?.title || raw.raw_event?.message ||
    raw.raw_event?.notification?.title || raw.raw_event?.notification?.message || '请求你的注意';
  const name = userName || '';
  const device = deviceName || 'Unknown Device';

  // 构建消息
  let message = '';
  if (name) {
    message = `${name}，${device} 上的 ${agentName} ${title}`;
  } else {
    message = `${device} 上的 ${agentName} ${title}`;
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
function buildDoneBody(userName, deviceName, agentName) {
  const name = userName || '';
  const device = deviceName || 'Unknown Device';

  if (name) {
    return `${name}，${device} 上的 ${agentName} 已经完成了任务`;
  }
  return `${device} 上的 ${agentName} 已经完成了任务`;
}

/**
 * 构建本轮结束消息（本轮结束但仍有后台任务运行中）
 */
function buildPausedBody(parsed, userName, deviceName, agentName) {
  const bg = parsed?.raw_event?.background_tasks;
  const n = Array.isArray(bg) ? bg.length : 0;
  const suffix = n > 0 ? `本轮结束，仍有 ${n} 个后台任务运行中` : '本轮结束，后台任务运行中';
  const name = userName || '';
  const device = deviceName || 'Unknown Device';

  if (name) {
    return `${name}，${device} 上的 ${agentName} ${suffix}`;
  }
  return `${device} 上的 ${agentName} ${suffix}`;
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
 * @param {string} [agentName] - 来源显示名（Claude Code/Codex/Antigravity/其他智能体），
 *   缺省 'Claude Code'，保证不传该参数的旧调用行为不变
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
  deviceName = null,
  agentName = 'Claude Code'
) {
  // 从配置中提取用户名
  const personaEnabled = config?.persona?.enabled !== false;
  const userName = personaEnabled ? (config?.persona?.user_name || 'Betsy') : '';

  // 设备名称，默认值
  const device = deviceName || 'Unknown Device';

  // 获取标题
  const title = buildTitle(eventType, agentName);

  // 构建消息体
  let body = '';

  switch (eventType) {
    case 'permission_required':
      body = buildPermissionBody(parsed, extraSummary, userName, device, agentName);
      break;

    case 'attention_required':
      body = buildAttentionBody(parsed, userName, device, agentName);
      break;

    case 'task_done':
      body = buildDoneBody(userName, device, agentName);
      break;

    case 'turn_paused':
      body = buildPausedBody(parsed, userName, device, agentName);
      break;

    default:
      if (userName) {
        body = `${userName}，${device} 上的 ${agentName} 事件`;
      } else {
        body = `${device} 上的 ${agentName} 事件`;
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
    },
    agents: {
      claude_code: { enabled: true },
      codex: { enabled: true },
      antigravity: { enabled: true },
      unknown: { enabled: true }
    }
  };
}
