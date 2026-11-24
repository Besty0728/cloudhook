/**
 * CloudHook - 消息构建器
 * 构建发送到 Bark 的通知消息
 */

// ============================================================================
// 风险评估
// ============================================================================

const RISK_MAP = {
  'permission_required': 'high',
  'attention_required': 'medium',
  'task_done': 'low',
  'turn_paused': 'low',
  'info': 'low'
};

// 只读 Bash 命令（低风险）
const SAFE_CMDS = ['ls', 'cat', 'head', 'tail', 'find', 'grep', 'wc', 'which', 'echo', 'printf',
  'date', 'pwd', 'whoami', 'uname', 'hostname', 'env', 'printenv', 'df', 'du', 'file', 'stat',
  'git status', 'git log', 'git diff', 'git show', 'git branch', 'git remote', 'git tag',
  'npm list', 'npm ls', 'npm view', 'node -v', 'python --version', 'pip list'];

// 中等风险命令（修改但不破坏性）
const MEDIUM_CMDS = ['cp', 'mkdir', 'touch', 'ln', 'rename', 'sort', 'uniq', 'tee', 'xargs',
  'chmod', 'chown', 'chgrp', 'pip install', 'npm install', 'apt install', 'yum install',
  'brew install', 'mv', 'git checkout', 'git switch', 'git merge', 'git rebase',
  'git stash', 'git add', 'git commit', 'docker run', 'docker build',
  'docker compose up', 'systemctl restart', 'systemctl reload',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'curl', 'wget', 'ssh', 'scp', 'rsync'];

/**
 * 评估 Bash / run_command 命令风险等级
 * @param {string} cmd
 * @returns {'low'|'medium'|'high'|'critical'}
 */
export function assessBashRisk(cmd) {
  const c = String(cmd || '').trim().toLowerCase();
  if (/\bsudo\b/.test(c)) return 'critical';
  if (/rm\s+.*-[a-z]*r[a-z]*f/.test(c) && /\/\s|\/\.\.\s|\*\s|\.\.\//.test(c)) return 'critical';
  if (/\b(rm|kill|killall|pkill|dd|mkfs|fdisk|shutdown|reboot|halt|poweroff)\b/.test(c)) return 'high';
  if (/(curl|wget).*\|\s*(ba)?sh/.test(c)) return 'high';
  if (/git\s+push.*--force/.test(c)) return 'high';
  if (/npm\s+publish/.test(c)) return 'high';
  for (let i = 0; i < MEDIUM_CMDS.length; i++) {
    if (c.startsWith(MEDIUM_CMDS[i])) return 'medium';
  }
  for (let j = 0; j < SAFE_CMDS.length; j++) {
    if (c.startsWith(SAFE_CMDS[j])) return 'low';
  }
  return 'medium';
}

/**
 * 计算事件风险等级
 * @param {string} eventType
 * @param {object|null} parsed
 * @returns {'low'|'medium'|'high'|'critical'}
 */
export function getRiskLevel(eventType, parsed) {
  if (eventType === 'permission_required' && parsed) {
    const tool = (parsed.tool_name || '').toLowerCase();
    if (tool === 'bash' || tool === 'run_command') {
      const cmd = (parsed.tool_input && parsed.tool_input.command) || '';
      return assessBashRisk(cmd);
    }
    if (tool === 'ask_permission') return 'high';
    if (tool === 'read' || tool === 'glob' || tool === 'grep' || tool === 'list' ||
      tool === 'read_file' || tool === 'view_file' || tool === 'list_dir' ||
      tool === 'find_by_name' || tool === 'grep_search') return 'low';
    if (tool === 'write' || tool === 'edit' || tool === 'multiedit' || tool === 'notebookedit' ||
      tool === 'write_file' || tool === 'edit_file' || tool === 'write_to_file' ||
      tool === 'replace_file_content' || tool === 'multi_replace_file_content' || tool === 'apply_patch') return 'medium';
    if (tool === 'webfetch' || tool === 'websearch' || tool === 'search_web' || tool === 'read_url_content') return 'low';
    return 'medium';
  }
  if (eventType === 'attention_required' && parsed) {
    const raw = parsed.raw_event || {};
    if (String(raw.error || '').trim() || String(raw.terminationReason || '').toUpperCase() === 'ERROR') {
      return 'high';
    }
  }
  return RISK_MAP[eventType] || 'low';
}

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
  const maxSummaryLen = Math.max(10, 80 - prefix.length - fixedText.length - 3);
  const truncated = summary.length > maxSummaryLen
    ? summary.slice(0, maxSummaryLen) + '...'
    : summary;

  return `${prefix}${fixedText}${truncated}`;
}

/**
 * 构建注意请求消息
 */
function buildAttentionBody(parsed, userName, deviceName, agentName) {
  const raw = parsed?.raw_event || {};
  const ti = parsed?.tool_input || {};
  const tool = (parsed?.tool_name || '').toLowerCase();
  const agMeta = ti.ArtifactMetadata || ti.artifactMetadata;
  const hasReqFeedback = !!(agMeta && (agMeta.RequestFeedback === true || agMeta.requestFeedback === true));

  // Claude Code 的 Notification payload 中 title/message 是顶层字段，不在
  // notification 子对象里；兼容保留 notification.title/message 以防其他来源用了嵌套结构
  let title = raw.title || raw.message || raw.notification?.title || raw.notification?.message || raw.error_message || '';
  if (!title && tool === 'ask_question' && Array.isArray(ti.questions) && ti.questions[0] && ti.questions[0].question) {
    title = '提问：' + String(ti.questions[0].question);
  }
  if (!title && hasReqFeedback) {
    const rawDesc = (agMeta.Summary !== undefined ? agMeta.Summary : agMeta.summary) || ti.file_path || '';
    const firstLine = String(rawDesc).split(/\r?\n/)[0].trim();
    title = '需要你审批计划：' + firstLine;
  }
  if (!title) {
    const errStr = String(raw.error || '').trim();
    const reason = String(raw.terminationReason || '').toUpperCase();
    if (errStr) {
      title = '执行出错：' + errStr;
    } else if (reason === 'ERROR') {
      title = '执行出错中断，需要你处理';
    } else if (reason === 'MAX_INVOCATIONS' || reason === 'MAX_FORCED_INVOCATIONS' || reason === 'MAX_STEPS_EXCEEDED') {
      title = '已达最大步数上限，需要你确认继续';
    } else if (reason === 'MAX_TOKEN_BUDGET_EXCEEDED') {
      title = '已超 Token 预算上限，需要你介入';
    } else if (reason === 'TERMINAL_STEP_TYPE') {
      title = '等待你确认或审批当前步骤';
    }
  }
  if (!title) title = '请求你的注意';

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
      kimi_code: { enabled: true },
      unknown: { enabled: true }
    }
  };
}
