/**
 * 设备指纹（稳定标识）
 *
 * 在首次访问时生成一个随机 UUID 存入 localStorage，作为本浏览器/设备的稳定标识。
 * 登录时随请求带上，后端据此对同一设备去重，避免反复登录堆积重复设备记录。
 *
 * 说明：这是「软指纹」——清除 localStorage 或换浏览器会得到新指纹（视为新设备），
 * 不依赖任何硬件/隐私信息，仅用于设备列表去重，不参与鉴权。
 */

const DEVICE_ID_KEY = 'cloudhook_device_id';

/**
 * 获取当前设备指纹，不存在则生成并持久化
 */
export function getDeviceFingerprint(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
