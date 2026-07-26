/**
 * CloudHook - KV 存储操作封装
 * 统一错误处理和数据访问接口
 */

import { ConfigResolver } from './config-resolver.js';

// ============================================================================
// KV 绑定解析
// ============================================================================
//
// EdgeOne Pages 边缘函数中，KV 绑定以「全局变量」形式注入运行时，变量名即
// 控制台「绑定命名空间」时填写的「变量名称」（见官方 KV 模板：直接 my_kv.get(...)）。
// 部分运行时也可能挂在 env 上，这里两处都查，按候选名依次尝试，返回首个可用对象。
//
// 控制台绑定时「变量名称」请填 cloudhook_kv 或 KV（二者均被识别）。

const KV_BINDING_NAMES = ['cloudhook_kv', 'KV', 'kv', 'my_kv'];

/**
 * 解析当前运行时可用的 KV 命名空间对象
 * @param {object} env - 边缘函数 context.env
 * @returns {KVNamespace|null} 具备 get/put 方法的 KV 对象，找不到返回 null
 */
export function resolveKv(env) {
  const isKv = (obj) => obj && typeof obj.get === 'function' && typeof obj.put === 'function';

  // 1. 全局作用域（EdgeOne 官方文档与模板的注入方式）
  for (const name of KV_BINDING_NAMES) {
    try {
      const candidate = globalThis[name];
      if (isKv(candidate)) return candidate;
    } catch {
      // 访问未声明全局变量在严格模式下可能抛错，忽略继续
    }
  }

  // 2. env 对象（兼容部分运行时把绑定挂在 env 上）
  if (env) {
    for (const name of KV_BINDING_NAMES) {
      if (isKv(env[name])) return env[name];
    }
  }

  return null;
}

// ============================================================================
// 用户配置（使用 ConfigResolver - 支持 KV + 环境变量双模式）
// ============================================================================

/**
 * 获取用户配置
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {object} env - 环境变量对象
 * @returns {Promise<object>} 配置对象
 */
export async function getUserConfig(kv, userId, env = {}) {
  const resolver = new ConfigResolver(env, kv);
  return await resolver.getUserConfig(userId);
}

/**
 * 保存用户配置
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {object} config - 配置对象
 * @param {object} env - 环境变量对象
 * @returns {Promise<{success: boolean, source: string, message?: string}>}
 */
export async function saveUserConfig(kv, userId, config, env = {}) {
  const resolver = new ConfigResolver(env, kv);
  return await resolver.saveUserConfig(userId, config);
}

// ============================================================================
// 事件日志
// ============================================================================

/**
 * 记录事件到日志
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {object} event - 事件对象
 * @returns {Promise<void>}
 */
export async function logEvent(kv, userId, event) {
  try {
    const key = `user_${userId}_events`;
    const json = await kv.get(key);
    const events = json ? JSON.parse(json) : [];

    // 滚动窗口：最多保留 100 条
    events.unshift(event);
    if (events.length > 100) {
      events.length = 100;
    }

    await kv.put(key, JSON.stringify(events));
  } catch (error) {
    console.error('Error logging event:', error);
    // 日志失败不应阻断主流程，静默处理
  }
}

/**
 * 获取事件历史
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {number} limit - 返回数量限制
 * @param {number} offset - 偏移量
 * @returns {Promise<{events: array, total: number, has_more: boolean}>}
 */
export async function getEvents(kv, userId, limit = 20, offset = 0, filter = {}) {
  try {
    const key = `user_${userId}_events`;
    const json = await kv.get(key);
    let events = json ? JSON.parse(json) : [];
    if (filter.type) events = events.filter(e => e.event_type === filter.type);
    if (filter.device) events = events.filter(e => e.jti === filter.device);
    if (filter.agent) events = events.filter(e => e.agent === filter.agent);

    return {
      events: events.slice(offset, offset + limit),
      total: events.length,
      has_more: offset + limit < events.length
    };
  } catch (error) {
    console.error('Error getting events:', error);
    return { events: [], total: 0, has_more: false };
  }
}

// ============================================================================
// 速率限制
// ============================================================================

/**
 * 检查速率限制
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {string} endpoint - 端点名称
 * @param {number} limit - 限制次数
 * @returns {Promise<boolean>} 是否超过限制
 */
export async function checkRateLimit(kv, userId, endpoint, limit = 100) {
  try {
    // 使用当前分钟作为时间窗口
    const minute = Math.floor(Date.now() / 60000);
    const key = `ratelimit_${userId}_${endpoint}_${minute}`;

    const countStr = await kv.get(key);
    const count = countStr ? parseInt(countStr) : 0;

    if (count >= limit) {
      return true; // 超过限制
    }

    // 增加计数，TTL 2 分钟
    await kv.put(key, String(count + 1), { expirationTtl: 120 });

    return false; // 未超过限制
  } catch (error) {
    console.error('Error checking rate limit:', error);
    return false; // 出错时不阻断请求
  }
}

// ============================================================================
// 设备注册表（KEY: user:{uid}:devices，存设备数组）
// ============================================================================
//
// 注意：设备注册表仅用于「展示设备列表」，token 鉴权本身仍是无状态的，
// 验证不读这里。写入失败不阻断主流程。

/**
 * 注册设备（登录时调用，建议放进 waitUntil 异步执行避免阻塞响应）
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} uid - 用户 ID
 * @param {object} device - 设备对象 { jti, device_name, created_at, last_ip, last_seen }
 * @returns {Promise<void>}
 */
export async function registerDevice(kv, uid, device) {
  try {
    const key = `user_${uid}_devices`;
    const json = await kv.get(key);
    const devices = json ? JSON.parse(json) : [];

    // 按 jti 去重：若已存在则更新，否则追加
    const idx = devices.findIndex(d => d.jti === device.jti);
    if (idx >= 0) {
      devices[idx] = { ...devices[idx], ...device };
    } else {
      devices.unshift(device);
    }

    // 设备数量上限保护，最多保留 50 个
    if (devices.length > 50) {
      devices.length = 50;
    }

    await kv.put(key, JSON.stringify(devices));
  } catch (error) {
    console.error('Error registering device:', error);
    // 注册失败不阻断登录主流程
  }
}

/**
 * 获取设备列表
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} uid - 用户 ID
 * @returns {Promise<array>} 设备数组
 */
export async function getDevices(kv, uid) {
  try {
    const key = `user_${uid}_devices`;
    const json = await kv.get(key);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error getting devices:', error);
    return [];
  }
}

/**
 * 按设备指纹查找已注册设备（用于登录去重，避免同一设备反复创建新记录）
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} uid - 用户 ID
 * @param {string} fingerprint - 前端生成的稳定设备指纹
 * @returns {Promise<object|null>} 命中的设备对象，未命中返回 null
 */
export async function findDeviceByFingerprint(kv, uid, fingerprint) {
  if (!fingerprint) return null;
  try {
    const devices = await getDevices(kv, uid);
    return devices.find(d => d.fingerprint === fingerprint) || null;
  } catch (error) {
    console.error('Error finding device by fingerprint:', error);
    return null;
  }
}

/**
 * 重命名设备（仅改 device_name，低敏感操作，校验 Token 即可）
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} uid - 用户 ID
 * @param {string} jti - 目标设备标识
 * @param {string} newName - 新设备名
 * @returns {Promise<boolean>} true=改名成功，false=设备不存在
 */
export async function renameDevice(kv, uid, jti, newName) {
  const key = `user_${uid}_devices`;
  const json = await kv.get(key);
  if (!json) return false;

  const devices = JSON.parse(json);
  const idx = devices.findIndex(d => d.jti === jti);
  if (idx < 0) return false;

  devices[idx].device_name = newName;
  await kv.put(key, JSON.stringify(devices));
  return true;
}

/**
 * 从注册表移除设备（撤销时调用）
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} uid - 用户 ID
 * @param {string} jti - 设备/Token 唯一标识
 * @returns {Promise<void>}
 */
export async function removeDevice(kv, uid, jti) {
  try {
    const key = `user_${uid}_devices`;
    const json = await kv.get(key);
    if (!json) return;

    const devices = JSON.parse(json).filter(d => d.jti !== jti);
    await kv.put(key, JSON.stringify(devices));
  } catch (error) {
    console.error('Error removing device:', error);
  }
}

// ============================================================================
// Token 撤销名单（KEY: revoked_{jti}（已剥离非法字符），存在即撤销，带 TTL）
// ============================================================================
//
// 撤销机制：验签通过后再查此名单，默认不存在=有效。
// TTL 设为 token 剩余有效期，过期后 token 本身也失效，无需再保留撤销标记。

/**
 * 吊销名单 KV key。EdgeOne KV key 仅允许字母/数字/下划线：
 * jti 是带连字符的 UUID，统一剥离非法字符，写入与读取共用此函数保证一致。
 * （旧的带连字符 key 成为孤儿，随 TTL 自然过期，无需迁移）
 * @param {string} jti - Token 唯一标识
 * @returns {string}
 */
function revokedKey(jti) {
  return `revoked_${String(jti).replace(/[^A-Za-z0-9_]/g, '')}`;
}

/**
 * 撤销 Token（写入撤销标记）
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} jti - Token 唯一标识
 * @param {number} ttlSeconds - 标记存活秒数（建议为 token 剩余有效期）；
 *   0 表示撤销永久 token，标记不设 TTL 永久保留（否则标记到期后永久 token 复活）
 * @returns {Promise<void>}
 */
export async function revokeToken(kv, jti, ttlSeconds) {
  if (ttlSeconds === 0) {
    await kv.put(revokedKey(jti), '1');
    return;
  }
  // TTL 至少 60 秒，避免传入负数导致写入异常
  const ttl = Math.max(60, Math.floor(ttlSeconds || 60));
  await kv.put(revokedKey(jti), '1', { expirationTtl: ttl });
}

/**
 * 检查 Token 是否被撤销
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} jti - Token 唯一标识
 * @returns {Promise<{revoked: boolean, kvError: boolean}>}
 *   revoked=已撤销；kvError=吊销名单不可读（KV 未绑定/查询异常），
 *   由调用方决定放行（hook 通知链路）还是拒绝（管理端点，见 security.requireAuth）
 */
export async function isTokenRevoked(kv, jti) {
  if (!jti) return { revoked: false, kvError: false };
  if (!kv) return { revoked: false, kvError: true };
  try {
    const val = await kv.get(revokedKey(jti));
    return { revoked: val !== null && val !== undefined, kvError: false };
  } catch (error) {
    console.error('Error checking token revocation:', error);
    return { revoked: false, kvError: true };
  }
}

// ============================================================================
// 访问日志（KEY: user:{uid}:accesslog，滚动数组，最多 200 条）
// ============================================================================

/**
 * 写入访问日志（建议放进 waitUntil 异步执行）
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} uid - 用户 ID
 * @param {object} log - 日志对象（结构见契约 AccessLog，无需预填 id/timestamp）
 * @returns {Promise<void>}
 */
export async function writeAccessLog(kv, uid, log) {
  try {
    const key = `user_${uid}_accesslog`;
    const json = await kv.get(key);
    const logs = json ? JSON.parse(json) : [];

    // 自动补全 id 和 timestamp
    const randBytes = crypto.getRandomValues(new Uint8Array(4));
    const rand = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const entry = {
      id: log.id || `${Date.now()}_${rand}`,
      timestamp: log.timestamp || new Date().toISOString(),
      ...log
    };

    logs.unshift(entry);
    // 滚动窗口：最多保留 200 条
    if (logs.length > 200) {
      logs.length = 200;
    }

    await kv.put(key, JSON.stringify(logs));
  } catch (error) {
    console.error('Error writing access log:', error);
    // 日志失败不阻断主流程
  }
}

/**
 * 获取访问日志（分页）
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} uid - 用户 ID
 * @param {number} limit - 返回数量限制
 * @param {number} offset - 偏移量
 * @returns {Promise<{logs: array, total: number, has_more: boolean}>}
 */
export async function getAccessLogs(kv, uid, limit = 20, offset = 0, filter = {}) {
  try {
    const key = `user_${uid}_accesslog`;
    const json = await kv.get(key);
    let logs = json ? JSON.parse(json) : [];
    if (filter.device) logs = logs.filter(l => l.jti === filter.device);
    if (filter.agent) logs = logs.filter(l => l.agent === filter.agent);

    return {
      logs: logs.slice(offset, offset + limit),
      total: logs.length,
      has_more: offset + limit < logs.length
    };
  } catch (error) {
    console.error('Error getting access logs:', error);
    return { logs: [], total: 0, has_more: false };
  }
}

// ============================================================================
// Pending Actions（用于权限等待检测）
// ============================================================================

/**
 * 添加 Pending Action
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {string} actionId - Action ID
 * @param {object} actionData - Action 数据
 * @returns {Promise<void>}
 */
export async function addPendingAction(kv, userId, actionId, actionData) {
  const key = `user_${userId}_pending_${actionId}`;
  const data = {
    ...actionData,
    created_at: new Date().toISOString(),
    status: 'pending'
  };

  // 300 秒后自动过期
  await kv.put(key, JSON.stringify(data), { expirationTtl: 300 });
}

/**
 * 获取 Pending Action
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {string} actionId - Action ID
 * @returns {Promise<object|null>}
 */
export async function getPendingAction(kv, userId, actionId) {
  try {
    const key = `user_${userId}_pending_${actionId}`;
    const json = await kv.get(key);
    return json ? JSON.parse(json) : null;
  } catch (error) {
    console.error('Error getting pending action:', error);
    return null;
  }
}

/**
 * 清除 Pending Action
 * @param {KVNamespace} kv - EdgeOne KV 实例
 * @param {string} userId - 用户 ID
 * @param {string} actionId - Action ID
 * @returns {Promise<void>}
 */
export async function clearPendingAction(kv, userId, actionId) {
  const key = `user_${userId}_pending_${actionId}`;
  await kv.delete(key);
}

