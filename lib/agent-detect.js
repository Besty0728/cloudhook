/**
 * CloudHook - 智能体来源识别
 * 从 /api/hook 请求中识别事件来自 Claude Code / Codex CLI / Antigravity CLI /
 * Kimi Code CLI / 其他，供分类、风险评级、通知文案按来源分支。
 *
 * 设计原则：多信号优先级链（显式头 → UA → payload 形状 → 兜底），全部为纯函数，
 * 不抛异常中断主流程，任意一层出错都降级到下一层，最终兜底为 unknown。
 */

// ============================================================================
// 内置来源与显示名
// ============================================================================

export const AGENT_NAMES = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  antigravity: 'Antigravity',
  kimi_code: 'Kimi Code',
  unknown: '其他智能体'
};

// ============================================================================
// 第 1 层：显式标记
// ============================================================================

/**
 * 归一化显式标记为内置 agent id
 * trim → 小写 → 空格/连字符转下划线，再匹配别名表
 * @param {*} raw - 原始值（请求头或 query 参数）
 * @returns {string|null} 内置 agent id，无法识别返回 null
 */
function normalizeAgentId(raw) {
  try {
    const v = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (v === 'claude' || v === 'claudecode' || v === 'claude_code') return 'claude_code';
    if (v === 'codex' || v === 'codex_cli') return 'codex';
    if (v === 'antigravity' || v === 'agy' || v === 'gemini') return 'antigravity';
    if (v === 'kimi' || v === 'kimicode' || v === 'kimi_code' || v === 'kimi_code_cli') return 'kimi_code';
    return null;
  } catch { return null; }
}

/**
 * 显式标记识别：请求头 X-Agent-Type，取不到再取 query ?agent=
 * 带了显式值但无法归一化 → id 为 unknown，source 仍记为 header
 * @param {Request} request - Fetch API Request 对象
 * @returns {{id: string, name: string, source: 'header'}|null}
 */
function detectByHeader(request) {
  try {
    let raw = request?.headers?.get?.('X-Agent-Type');
    if (!raw) {
      try { raw = new URL(request.url).searchParams.get('agent'); } catch { raw = null; }
    }
    if (!raw) return null;
    const id = normalizeAgentId(raw) || 'unknown';
    return { id, name: AGENT_NAMES[id], source: 'header' };
  } catch { return null; }
}

// ============================================================================
// 第 2 层：User-Agent 规则表
// ============================================================================

/**
 * UA 识别：curl 或空 UA 无法区分来源（Codex/Antigravity 均由脚本 curl 转发），
 * 不判定，落下一层
 * @param {Request} request - Fetch API Request 对象
 * @returns {{id: string, name: string, source: 'ua'}|null}
 */
function detectByUa(request) {
  try {
    const ua = (request?.headers?.get?.('User-Agent') || '').toLowerCase();
    if (!ua || ua.includes('curl')) return null;
    if (ua.includes('claude')) return { id: 'claude_code', name: AGENT_NAMES.claude_code, source: 'ua' };
    if (ua.includes('codex')) return { id: 'codex', name: AGENT_NAMES.codex, source: 'ua' };
    if (ua.includes('antigravity') || ua.includes('gemini')) return { id: 'antigravity', name: AGENT_NAMES.antigravity, source: 'ua' };
    if (ua.includes('kimi')) return { id: 'kimi_code', name: AGENT_NAMES.kimi_code, source: 'ua' };
    return null;
  } catch { return null; }
}

// ============================================================================
// 第 3 层：payload 形状推断
// ============================================================================

/**
 * payload 形状识别：Codex/Antigravity 的 hook 只能靠脚本 curl 转发，UA 恒为
 * curl/x.y，必须按字段形状区分。顺序即优先级，命中即返回。
 * @param {object|null} rawEvent - 已解析的请求体
 * @returns {{id: string, name: string, source: 'shape'}|null}
 */
function detectByShape(rawEvent) {
  try {
    if (!rawEvent || typeof rawEvent !== 'object') return null;

    // Kimi Code：hooks runner 给每个 payload 注入 client_type，一锤定音。
    // 必须先于 codex 判据——Kimi 的 TurnStarted/PermissionRequest 带 turn_id、
    // SessionStart 带 model，落到 codex 判据会被误判为 Codex
    if (rawEvent.client_type === 'kimi_code_cli') {
      return { id: 'kimi_code', name: AGENT_NAMES.kimi_code, source: 'shape' };
    }

    // Antigravity：camelCase 字段，conversationId 搭配任一步骤/终止字段
    if (rawEvent.conversationId !== undefined && (
      rawEvent.toolCall !== undefined ||
      rawEvent.terminationReason !== undefined ||
      rawEvent.invocationNum !== undefined ||
      rawEvent.stepIdx !== undefined
    )) {
      return { id: 'antigravity', name: AGENT_NAMES.antigravity, source: 'shape' };
    }

    // Codex：snake_case，hook_event_name 搭配 turn_id/model（Codex 扩展字段）。
    // 注意：不用 agent_type 作为判据 —— Claude Code 的 SubagentStop 事件也带
    // agent_type，用它判断会把 Claude Code 误判为 Codex
    if (rawEvent.hook_event_name !== undefined && (
      rawEvent.turn_id !== undefined || rawEvent.model !== undefined
    )) {
      return { id: 'codex', name: AGENT_NAMES.codex, source: 'shape' };
    }

    // Codex 旧版 notify 通道（非 hook，独立 JSON 参数格式）
    if (rawEvent.type === 'agent-turn-complete') {
      return { id: 'codex', name: AGENT_NAMES.codex, source: 'shape' };
    }

    // Claude Code：具备任一原生 hook 字段即可识别
    if (rawEvent.hook_event_name !== undefined || rawEvent.transcript_path !== undefined || rawEvent.session_id !== undefined) {
      return { id: 'claude_code', name: AGENT_NAMES.claude_code, source: 'shape' };
    }

    return null;
  } catch { return null; }
}

// ============================================================================
// 主识别函数
// ============================================================================

/**
 * 多信号来源识别：显式头 → UA → payload 形状 → 兜底
 * rawEvent 可能为 null（body 尚未解析时的降级调用），全程容错，不抛异常。
 * @param {Request} request - Fetch API Request 对象
 * @param {object|null} rawEvent - 已解析的请求体（可能为 null）
 * @returns {{id: 'claude_code'|'codex'|'antigravity'|'kimi_code'|'unknown', name: string, source: 'header'|'ua'|'shape'|'fallback'}}
 */
export function detectAgent(request, rawEvent) {
  try {
    const byHeader = detectByHeader(request);
    if (byHeader) return byHeader;
  } catch { /* 降级到下一层 */ }
  try {
    const byUa = detectByUa(request);
    if (byUa) return byUa;
  } catch { /* 降级到下一层 */ }
  try {
    const byShape = detectByShape(rawEvent);
    if (byShape) return byShape;
  } catch { /* 降级到兜底 */ }
  return { id: 'unknown', name: AGENT_NAMES.unknown, source: 'fallback' };
}
