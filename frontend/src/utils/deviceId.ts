/**
 * 设备指纹（跨浏览器稳定标识）
 *
 * 采集同一台机器上跨浏览器基本一致的硬件/环境属性，做 SHA-256 哈希后作为
 * 「机器级指纹」。登录时随请求带上，后端据此对同一设备去重（复用既有 jti），
 * 避免同一台电脑在 Chrome / Edge 等不同浏览器里被误判为多台设备。
 *
 * 采集原则：
 * - 只选跨浏览器稳定的属性，明确排除 User-Agent（含浏览器名/版本）与
 *   WebGL / canvas（反指纹浏览器会随机化，且对区分同型号机器没有帮助）
 * - 属性缺失时统一序列化为 '?'，保证同一机器各浏览器产出一致的输入串
 *
 * 权衡与说明：
 * - 两台配置完全相同的机器（同型号、同分辨率、同时区）会得到相同指纹，
 *   被视为同一设备共享 jti / Token。单用户场景下概率极低，可接受
 * - 指纹是哈希值，不可逆推出原始属性；仅用于设备列表去重，不参与鉴权
 * - 从旧版 localStorage 随机 UUID 切换后，旧设备记录不再命中，
 *   首次重新登录会新建一条记录，旧记录可在设备管理页手动撤销
 */

/**
 * 采集跨浏览器稳定属性并拼成规范化字符串
 */
function collectStableAttributes(): string {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const scr = typeof screen !== 'undefined' ? screen : ({} as Screen);

  // 属性缺失统一为 '?'，保证跨浏览器序列化结果一致
  const val = (v: unknown): string =>
    v === undefined || v === null || v === '' ? '?' : String(v);

  let timezone = '?';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '?';
  } catch {
    /* 极端环境下 Intl 不可用，保持 '?' */
  }

  const languages = Array.isArray(nav.languages) && nav.languages.length
    ? nav.languages.join(',')
    : val(nav.language);

  return [
    val(nav.platform),
    `${val(scr.width)}x${val(scr.height)}x${val(scr.colorDepth)}`,
    val(typeof window !== 'undefined' ? window.devicePixelRatio : undefined),
    timezone,
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
 * 获取当前设备的机器级指纹（跨浏览器稳定）
 */
export async function getDeviceFingerprint(): Promise<string> {
  return hashAttributes(collectStableAttributes());
}

// 旧版指纹的 localStorage key（2026-07 前为随机 UUID，现已弃用）
const LEGACY_DEVICE_ID_KEY = 'cloudhook_device_id';

/**
 * 读取旧版指纹（localStorage 随机 UUID），仅供登录时发给后端做迁移匹配：
 * 后端命中旧指纹即复用原设备记录（同 jti、同 token），并把指纹升级为新的
 * 属性哈希，实现无缝过渡。只读不生成——旧版本浏览器访问过即存在，否则返回空串。
 */
export function getLegacyDeviceFingerprint(): string {
  try {
    return localStorage.getItem(LEGACY_DEVICE_ID_KEY) || '';
  } catch {
    return '';
  }
}
