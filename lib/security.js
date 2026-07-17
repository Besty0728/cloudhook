/**
 * CloudHook - 安全工具库
 * 提供 HMAC 签名验证、AES 加密解密、Token 生成等功能
 */

import { resolveKv, isTokenRevoked } from './kv-store.js';

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 将 ArrayBuffer 转换为十六进制字符串
 */
function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将十六进制字符串转换为 ArrayBuffer
 */
function hexToArrayBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

/**
 * 将十六进制字符串转换为 Uint8Array
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ============================================================================
// 密码哈希验证（用于敏感操作的二次验证）
// ============================================================================

/**
 * 验证请求头中的密码哈希是否与配置的主密码匹配
 * @param {Request} request - Fetch API Request 对象
 * @param {object} env - 环境变量对象（包含 MASTER_PASSWORD 或 MASTER_PASSWORD_HASH）
 * @returns {Promise<{valid: boolean, reason: string}>}
 */
export async function verifyPasswordHash(request, env) {
  try {
    const passwordHash = request.headers.get('X-Password-Hash');

    if (!passwordHash) {
      return { valid: false, reason: 'missing_password_hash' };
    }

    // 如果环境变量配置了 MASTER_PASSWORD_HASH，直接比对
    if (env.MASTER_PASSWORD_HASH) {
      const valid = timingSafeEqual(
        passwordHash.toLowerCase().trim(),
        env.MASTER_PASSWORD_HASH.toLowerCase().trim()
      );
      return { valid, reason: valid ? 'ok' : 'password_mismatch' };
    }

    // 如果环境变量配置了明文 MASTER_PASSWORD，先哈希再比对
    if (env.MASTER_PASSWORD) {
      const expectedHash = await hashPassword(env.MASTER_PASSWORD);
      const valid = timingSafeEqual(
        passwordHash.toLowerCase().trim(),
        expectedHash.toLowerCase().trim()
      );
      return { valid, reason: valid ? 'ok' : 'password_mismatch' };
    }

    return { valid: false, reason: 'server_not_configured' };

  } catch (error) {
    console.error('Password hash verification error:', error);
    return { valid: false, reason: 'verification_error' };
  }
}

/**
 * 恒定时间字符串比较，避免计时侧信道攻击
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

// ============================================================================
// HMAC 签名验证
// ============================================================================

/**
 * 验证 HMAC-SHA256 签名
 * @param {Request} request - Fetch API Request 对象
 * @param {string} secret - HMAC 密钥
 * @returns {Promise<{valid: boolean, reason: string}>}
 */
export async function verifyHmacSignature(request, secret) {
  try {
    const signature = request.headers.get('X-Signature');
    const timestamp = request.headers.get('X-Timestamp');

    if (!signature || !timestamp) {
      return { valid: false, reason: 'missing_headers' };
    }

    // 防重放攻击：时间戳必须在 5 分钟内
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    if (isNaN(requestTime) || Math.abs(now - requestTime) > 300000) {
      return { valid: false, reason: 'timestamp_expired' };
    }

    // 构建待签名字符串: timestamp + method + path + body
    const body = await request.clone().text();
    const url = new URL(request.url);
    const message = `${timestamp}${request.method}${url.pathname}${body}`;

    // 计算期望签名
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = hexToBytes(signature);
    const dataBytes = encoder.encode(message);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, dataBytes);

    return { valid, reason: valid ? 'ok' : 'signature_mismatch' };

  } catch (error) {
    console.error('HMAC verification error:', error);
    return { valid: false, reason: 'verification_error' };
  }
}

/**
 * 生成 HMAC-SHA256 签名（用于测试或客户端）
 * @param {string} message - 待签名消息
 * @param {string} secret - HMAC 密钥
 * @returns {Promise<string>} 十六进制签名字符串
 */
export async function generateHmacSignature(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );

  return arrayBufferToHex(signature);
}

// ============================================================================
// AES-256-GCM 加密解密
// ============================================================================

/**
 * AES-256-GCM 加密
 * @param {string} plaintext - 明文
 * @param {string} key - 32 字符密钥
 * @returns {Promise<{iv: string, ciphertext: string}>}
 */
export async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  // 确保密钥长度为 32 字节（256 位）
  const keyBytes = encoder.encode(key.padEnd(32, '0').slice(0, 32));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    encoder.encode(plaintext)
  );

  return {
    iv: arrayBufferToHex(iv),
    ciphertext: arrayBufferToHex(encrypted)
  };
}

/**
 * AES-256-GCM 解密
 * @param {{iv: string, ciphertext: string}} encryptedData - 加密数据
 * @param {string} key - 32 字符密钥
 * @returns {Promise<string>} 解密后的明文
 */
export async function decrypt(encryptedData, key) {
  const iv = hexToArrayBuffer(encryptedData.iv);
  const ciphertext = hexToArrayBuffer(encryptedData.ciphertext);
  const encoder = new TextEncoder();

  // 确保密钥长度为 32 字节（256 位）
  const keyBytes = encoder.encode(key.padEnd(32, '0').slice(0, 32));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ============================================================================
// Token 生成
// ============================================================================

/**
 * 生成 UUID v4 Token
 * @returns {string} UUID 字符串
 */
export function generateToken() {
  return crypto.randomUUID();
}

/**
 * 生成安全的随机字符串（用于密钥生成）
 * @param {number} length - 字符串长度
 * @returns {string} 十六进制随机字符串
 */
export function generateSecureRandom(length = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return arrayBufferToHex(bytes);
}

// ============================================================================
// 密码哈希（用于 Master Password）
// ============================================================================

/**
 * 使用 SHA-256 哈希密码
 * @param {string} password - 明文密码
 * @returns {Promise<string>} 十六进制哈希值
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToHex(hash);
}

// ============================================================================
// 无状态签名 Token（自验证，不依赖 KV）
// ============================================================================
//
// EdgeOne KV 为最终一致性，不适合「每请求都要读、且写后立即读」的 token 鉴权。
// 这里改用自验证签名 token：payload 内编码用户与有效期，用 HMAC_SECRET 签名，
// 验证时只需重算签名比对，无需任何 KV 读取，从根本上避免一致性延迟导致的 401。

/**
 * base64url 编码（无 padding，UTF-8 安全）
 *
 * 先把字符串按 UTF-8 编码成字节再 base64，避免 btoa 遇到非 Latin1 字符
 * （如中文设备名）抛 InvalidCharacterError。纯 ASCII 输出与旧实现完全一致，
 * 已签发的英文名 token 不受影响。
 */
function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * base64url 解码（UTF-8 安全，与 base64UrlEncode 对称）
 */
function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 ? '='.repeat(4 - (padded.length % 4)) : '';
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * 构建 Token payload（不签名），便于调用方拿到 iat/exp 等字段后入库，
 * 后续可用 signTokenPayload 确定性重算出同一 token。
 * @param {string} userId - 用户 ID
 * @param {object} [options] - { ttlSeconds, iat, exp, deviceName, jti }
 * @returns {object} { uid, iat, exp, dev, jti }
 */
export function buildTokenPayload(userId, options = {}) {
  const ttl = options.ttlSeconds || 30 * 24 * 60 * 60; // 默认 30 天
  const iat = options.iat || Math.floor(Date.now() / 1000);
  return {
    uid: userId,
    iat,
    exp: options.exp || (iat + ttl),
    dev: options.deviceName || 'Unknown Device',
    // jti：token 唯一标识，用于设备注册表索引和撤销名单（revoked:{jti}）
    jti: options.jti || crypto.randomUUID()
  };
}

/**
 * 对指定 payload 签名生成 token 字符串。
 *
 * 字段顺序必须与签发时一致（uid/iat/exp/dev/jti），因为 JSON.stringify 按插入顺序
 * 序列化，HMAC 又对序列化结果签名。只要 payload 各字段值相同且顺序相同，
 * 重算即可得到与原始签发**完全一致**的 token（揭示/撤销端点据此还原）。
 *
 * @param {object} payload - 形如 { uid, iat, exp, dev, jti }
 * @param {string} secret - 签名密钥（HMAC_SECRET）
 * @returns {Promise<string>} 形如 `<base64url(payload)>.<hex签名>`
 */
export async function signTokenPayload(payload, secret) {
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const signature = await generateHmacSignature(payloadStr, secret);
  return `${payloadStr}.${signature}`;
}

/**
 * 签发无状态 Token（= buildTokenPayload + signTokenPayload）
 * @param {string} userId - 用户 ID
 * @param {string} secret - 签名密钥（HMAC_SECRET）
 * @param {object} [options] - { ttlSeconds, iat, exp, deviceName, jti }
 * @returns {Promise<string>} 形如 `<base64url(payload)>.<hex签名>`
 */
export async function createAuthToken(userId, secret, options = {}) {
  const payload = buildTokenPayload(userId, options);
  return signTokenPayload(payload, secret);
}

/**
 * 验证无状态 Token
 *
 * 默认返回 userId 字符串（向后兼容现有调用）；
 * 传入 { full: true } 时返回完整 payload（含 uid/iat/exp/dev/jti），验证失败统一返回 null。
 *
 * @param {string} token - Token 字符串
 * @param {string} secret - 签名密钥（HMAC_SECRET）
 * @param {object} [options] - { full: 是否返回完整 payload }
 * @returns {Promise<string|object|null>} 验证通过返回 userId 或 payload，否则 null
 */
export async function verifyAuthToken(token, secret, options = {}) {
  try {
    if (!token || typeof token !== 'string') return null;

    const dotIndex = token.lastIndexOf('.');
    if (dotIndex <= 0) return null;

    const payloadStr = token.slice(0, dotIndex);
    const providedSig = token.slice(dotIndex + 1);

    // 用 crypto.subtle.verify 做恒定时间比对
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = hexToBytes(providedSig);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(payloadStr)
    );
    if (!valid) return null;

    // 解析 payload，校验过期（exp === 0 表示永久；缺失 exp 视为非法）
    const payload = JSON.parse(base64UrlDecode(payloadStr));
    if (payload.exp === undefined || payload.exp === null) return null;
    if (payload.exp > 0) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) return null;
    }

    // full 模式返回完整 payload，便于读取 jti/dev 等字段
    if (options.full) {
      return payload.uid ? payload : null;
    }

    return payload.uid || null;
  } catch (error) {
    console.error('Auth token verification error:', error);
    return null;
  }
}

/**
 * 统一请求鉴权：签名/有效期验证 + 吊销名单检查
 *
 * 所有管理端点（token/config/events/access-logs）应使用此函数替代裸 verifyAuthToken，
 * 否则被撤销的 token 仍能访问管理 API。
 *
 * @param {Request} request - 请求对象（从 X-CloudHook-Token 头取 token）
 * @param {object} env - 环境变量（需含 HMAC_SECRET）
 * @param {object} [options]
 * @param {boolean} [options.strict=true] - 吊销名单不可读（KV 未绑定/异常）时
 *   fail-closed 返回 503。安全优先——无法确认吊销状态的管理操作不应放行。
 *   hook 通知链路不走此函数，保持 fail-open。
 * @returns {Promise<{ok:true, payload:object, kv:object|null}|{ok:false, status:number, error:string}>}
 *   调用方用各自的 jsonResponse 构造错误响应：
 *   const auth = await requireAuth(request, env);
 *   if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
 */
export async function requireAuth(request, env, options = {}) {
  const strict = options.strict !== false;
  const token = request.headers.get('X-CloudHook-Token');
  if (!token) return { ok: false, status: 401, error: 'Missing token' };
  const payload = await verifyAuthToken(token, env.HMAC_SECRET, { full: true });
  if (!payload) return { ok: false, status: 401, error: 'Invalid token' };
  const kv = resolveKv(env);
  const { revoked, kvError } = await isTokenRevoked(kv, payload.jti);
  if (revoked) return { ok: false, status: 401, error: 'Token revoked' };
  if (kvError && strict) return { ok: false, status: 503, error: 'Auth store unavailable' };
  return { ok: true, payload, kv };
}
