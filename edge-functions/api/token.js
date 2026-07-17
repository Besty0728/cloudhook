/**
 * CloudHook - Token 管理 API
 * 登录签发无状态 Token（自验证，不依赖 KV）
 */

import { buildTokenPayload, signTokenPayload, hashPassword, registerDevice, getDevices, resolveKv, findDeviceByFingerprint, getClientIp, requireAuth } from '../_shared.js';

// ============================================================================
// 工具函数
// ============================================================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

/**
 * 恒定时间字符串比较，避免计时侧信道
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * 校验 master password 是否与环境变量配置一致。
 * 注意：前端已经对密码进行了 SHA-256 哈希，这里收到的是哈希值。
 * 支持明文 MASTER_PASSWORD，或预哈希的 MASTER_PASSWORD_HASH（SHA-256 十六进制）。
 */
async function isMasterPasswordValid(env, passwordHashFromClient) {
  if (env.MASTER_PASSWORD_HASH) {
    // 前端已哈希，直接比对
    return timingSafeEqual(
      passwordHashFromClient.toLowerCase().trim(),
      env.MASTER_PASSWORD_HASH.toLowerCase().trim()
    );
  }
  if (env.MASTER_PASSWORD) {
    // 将明文配置哈希后与前端哈希比对
    const expectedHash = await hashPassword(env.MASTER_PASSWORD);
    return timingSafeEqual(
      passwordHashFromClient.toLowerCase().trim(),
      expectedHash.toLowerCase().trim()
    );
  }
  return false;
}

// ============================================================================
// POST /api/token - 登录并签发 Token
// ============================================================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { device_name, master_password, device_fingerprint, legacy_fingerprint, ttl } = body;

    if (!master_password) {
      return jsonResponse({
        error: 'Missing master_password',
        message: 'Master password is required'
      }, 400);
    }

    // 未配置任何密码环境变量：提示部署者先配置
    if (!env.MASTER_PASSWORD && !env.MASTER_PASSWORD_HASH) {
      return jsonResponse({
        error: 'Not configured',
        message: 'Server is missing MASTER_PASSWORD. Set it in the EdgeOne console environment variables.'
      }, 503);
    }

    if (!env.HMAC_SECRET) {
      return jsonResponse({
        error: 'Not configured',
        message: 'Server is missing HMAC_SECRET. Set it in the EdgeOne console environment variables.'
      }, 503);
    }

    // 校验密码
    const valid = await isMasterPasswordValid(env, master_password);
    if (!valid) {
      return jsonResponse({
        error: 'Invalid password',
        message: 'Master password does not match'
      }, 401);
    }

    // 签发无状态 Token（单用户模式，userId 固定 default）
    const userId = 'default';
    const kv = resolveKv(env);
    const clientIp = getClientIp(request);
    const nowIso = new Date().toISOString();

    // 设备指纹去重：同一设备（指纹命中）复用既有 jti，避免反复登录堆积重复记录。
    // 命中时保留原 jti、created_at 与用户已重命名的 device_name，仅续期 iat/exp。
    // 优先匹配新指纹（稳定属性哈希）；未命中且携带旧版 UUID 指纹时回退匹配——
    // 迁移期兼容：命中旧指纹同样复用原设备，下方 registerDevice 会把指纹更新为
    // 新哈希，此后任意浏览器登录都走新指纹命中这同一条记录。
    let existing = device_fingerprint
      ? await findDeviceByFingerprint(kv, userId, device_fingerprint)
      : null;
    if (!existing && legacy_fingerprint) {
      existing = await findDeviceByFingerprint(kv, userId, legacy_fingerprint);
    }

    const jti = existing?.jti || crypto.randomUUID();
    const createdAt = existing?.created_at || nowIso;
    // 复用时沿用历史设备名（尊重用户重命名）；首次登录用前端传入名
    const deviceName = existing?.device_name || device_name || 'Unknown Device';

    // 先构建 payload 拿到 iat/exp，再签名；iat/exp 入库供「揭示 token」确定性重算
    var payloadOpts = { deviceName, jti };
    if (existing) {
      // 复用已有设备：沿用原 iat/exp，避免登录覆盖用户已设的有效期（如永久 token）。
      // 与「揭示 token」逻辑一致，使 token 明文复现（密钥不变）。
      // 仅当 exp 为永久(0)或未过期时沿用；过期/缺失的老设备走默认 30 天重新签发。
      const nowSec = Math.floor(Date.now() / 1000);
      if (existing.exp === 0 || (existing.exp > 0 && existing.exp > nowSec)) {
        payloadOpts.iat = existing.iat
          || (existing.created_at ? Math.floor(new Date(existing.created_at).getTime() / 1000) : nowSec);
        payloadOpts.exp = existing.exp;
      }
    } else if (ttl !== undefined) {
      // 首次登录且前端指定了 ttl
      payloadOpts.ttlSeconds = Number(ttl);
    }
    const payload = buildTokenPayload(userId, payloadOpts);
    const token = await signTokenPayload(payload, env.HMAC_SECRET);

    // 异步写设备注册表（不阻塞响应，避免 KV 写入延迟导致登录卡顿/闪退）。
    // registerDevice 按 jti 去重：命中则更新，未命中则追加。
    const devicePromise = registerDevice(kv, userId, {
      jti,
      device_name: deviceName,
      fingerprint: device_fingerprint || existing?.fingerprint || null,
      created_at: createdAt,
      iat: payload.iat,
      exp: payload.exp,
      last_ip: clientIp,
      last_seen: nowIso
    });
    // 安全调用 waitUntil —— EdgeOne 运行时应支持，但防御运行时差异
    if (typeof context.waitUntil === 'function') {
      try { context.waitUntil(devicePromise); } catch { devicePromise.catch(() => {}); }
    } else {
      devicePromise.catch(() => {});
    }

    return jsonResponse({
      success: true,
      token,
      device_name: deviceName,
      jti,
      user_id: userId,
      created_at: createdAt,
      exp: payload.exp
    });

  } catch (error) {
    console.error('[CloudHook] Create token error:', error);
    return jsonResponse({
      error: 'Internal server error',
      message: error.message
    }, 500);
  }
}

// ============================================================================
// GET /api/token - 返回设备列表
// ============================================================================
// 设备列表来自注册表（user:{uid}:devices），当前设备通过请求 token 的 jti 比对标记。

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    // 统一鉴权：签名验证 + 吊销名单检查（管理端点 fail-closed）
    const auth = await requireAuth(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    const payload = auth.payload;

    const currentJti = payload.jti || null;
    const rawDevices = await getDevices(auth.kv, payload.uid);

    const devices = rawDevices.map(d => ({
      jti: d.jti,
      device_name: d.device_name || 'Unknown Device',
      created_at: d.created_at,
      exp: d.exp !== undefined ? d.exp : null,
      last_ip: d.last_ip,
      last_seen: d.last_seen,
      is_current: !!currentJti && d.jti === currentJti
    }));

    return jsonResponse({
      success: true,
      devices
    });

  } catch (error) {
    console.error('[CloudHook] List devices error:', error);
    return jsonResponse({
      error: 'Internal server error',
      message: error.message
    }, 500);
  }
}

// ============================================================================
// OPTIONS - CORS 预检
// ============================================================================

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CloudHook-Token, X-Timestamp, X-Signature',
      'Access-Control-Max-Age': '86400'
    }
  });
}
