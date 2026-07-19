/**
 * 设备身份识别（三层：jti 续接 > 稳定指纹 > 旧版指纹迁移）
 *
 * 登录时按优先级向后端提供三类身份线索，后端据此复用既有设备记录（同 jti、
 * 同 token），避免同一台机器被识别成多台设备：
 *
 * 1. previous_jti —— 本浏览器上次登录拿到的设备 jti（localStorage 持久化）。
 *    同浏览器重登的最高优先级线索，与指纹是否漂移无关，保证 100% 续接。
 *    jti 只是设备记录索引、不含任何秘密，登录本身已由主密码鉴权，明文携带安全。
 * 2. device_fingerprint（v2）—— 跨浏览器稳定的机器指纹，用于「同一台机器、
 *    另一个浏览器首次登录」时归并到同一设备。
 * 3. legacy 指纹 —— 历史两代指纹（v1 属性哈希 / 更早的随机 UUID），仅供
 *    迁移期匹配旧记录；命中后后端会把记录指纹升级为 v2，之后不再依赖。
 *
 * v2 指纹采集原则（v1 的教训）：
 * - v1 混入了 screen 宽高 / devicePixelRatio / languages / deviceMemory 等属性，
 *   它们随外接显示器、页面缩放、浏览器差异（Safari 反指纹限制、deviceMemory
 *   仅 Chrome 系）而变，导致同机不同浏览器、甚至同浏览器前后两次都对不上。
 * - v2 只保留真正跨浏览器、跨会话稳定的机器属性：platform、时区、
 *   CPU 核数（统一压到 min(n, 8)，对齐 Safari 的反指纹上限）。
 * - 熵低是有意为之：指纹只做单用户场景下的设备去重，不参与鉴权。同平台、
 *   同时区的两台机器（或 Mac 与桌面模式 iPad）会被并成同一设备，可接受；
 *   反指纹浏览器（如 Brave 随机化核数）最多多建一条记录，随后被 jti 续接兜住。
 */

const DEVICE_JTI_KEY = 'cloudhook_device_jti';
// 旧版随机 UUID 指纹的 localStorage key（2026-07 前使用，现仅迁移期读取）
const LEGACY_DEVICE_ID_KEY = 'cloudhook_device_id';

/** 属性缺失统一序列化为 '?'，保证同一机器各浏览器产出一致的输入串 */
function val(v: unknown): string {
  return v === undefined || v === null || v === '' ? '?' : String(v);
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '?';
  } catch {
    return '?';
  }
}

/**
 * v2 指纹输入：仅跨浏览器稳定属性。带 'v2' 前缀，与 v1 哈希空间隔离。
 */
function collectStableAttributesV2(): string {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const cores = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
    ? Math.min(nav.hardwareConcurrency, 8)
    : '?';
  return ['v2', val(nav.platform), getTimezone(), String(cores)].join('|');
}

/**
 * v1 指纹输入（已弃用，仅供迁移匹配）。
 * ⚠️ 必须与 2026-07 版算法逐字节一致，否则旧记录无法命中，勿改动。
 */
function collectStableAttributesV1(): string {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const scr = typeof screen !== 'undefined' ? screen : ({} as Screen);

  const languages = Array.isArray(nav.languages) && nav.languages.length
    ? nav.languages.join(',')
    : val(nav.language);

  return [
    val(nav.platform),
    `${val(scr.width)}x${val(scr.height)}x${val(scr.colorDepth)}`,
    val(typeof window !== 'undefined' ? window.devicePixelRatio : undefined),
    getTimezone(),
    val(nav.hardwareConcurrency),
    val((nav as Navigator & { deviceMemory?: number }).deviceMemory),
    val(nav.maxTouchPoints),
    languages,
  ].join('|');
}

/**
 * SHA-256 哈希（hex）。Web Crypto 不可用（非安全上下文）时退化为
 * 简易 FNV-1a 哈希——仅影响极老的 http 本地调试场景，生产均为 HTTPS。
 */
async function hashAttributes(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a-${(h >>> 0).toString(16)}`;
}

/**
 * 获取当前设备的机器级指纹（v2，跨浏览器稳定）
 */
export async function getDeviceFingerprint(): Promise<string> {
  return hashAttributes(collectStableAttributesV2());
}

/**
 * 迁移期指纹候选列表（按优先级）：
 * - v1 属性哈希：2026-07 指纹升级后、本次 v2 升级前创建的记录
 * - 随机 UUID：2026-07 前创建的记录
 * 后端逐个回退匹配，命中即复用原设备并把指纹升级为 v2。
 */
export async function getLegacyFingerprints(): Promise<string[]> {
  const candidates: string[] = [];
  try {
    candidates.push(await hashAttributes(collectStableAttributesV1()));
  } catch {
    /* v1 计算失败不阻断登录 */
  }
  try {
    const legacyUuid = localStorage.getItem(LEGACY_DEVICE_ID_KEY);
    if (legacyUuid) candidates.push(legacyUuid);
  } catch {
    /* localStorage 不可用 */
  }
  return candidates;
}

/**
 * 读取本浏览器已知的设备 jti：优先取显式记录的 cloudhook_device_jti；
 * 老版本没存过该 key 时，从残留的登录 token 里解出 jti（payload 为
 * base64url(JSON)，客户端解码只为取索引，不做也无法做签名验证）。
 */
export function getKnownDeviceJti(): string {
  try {
    const stored = localStorage.getItem(DEVICE_JTI_KEY);
    if (stored) return stored;
    const token = localStorage.getItem('token');
    if (token) {
      const payloadPart = token.split('.')[0] || '';
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
      const payload = JSON.parse(atob(base64 + pad));
      if (typeof payload.jti === 'string') return payload.jti;
    }
  } catch {
    /* 解析失败按无记录处理 */
  }
  return '';
}

/**
 * 登录成功后记录本浏览器绑定的设备 jti（logout 不清除，跨会话续接身份）
 */
export function rememberDeviceJti(jti: string): void {
  try {
    if (jti) localStorage.setItem(DEVICE_JTI_KEY, jti);
  } catch {
    /* localStorage 不可用时静默 */
  }
}
