/**
 * 设备（Token）管理 API
 * 对应契约：GET /api/token、DELETE /api/token/{jti}
 */

import { apiClient, authenticatedRequest } from './client';
import { DeviceListResponse, Device, ApiResponse, RevealTokenResponse, CreateDeviceResponse, UpdateTtlResponse } from '@/types/api';

/**
 * 获取当前账户下所有设备列表
 * GET /api/token → 解包 {success, devices}
 */
export async function getDevices(): Promise<Device[]> {
  const response = await apiClient.get<DeviceListResponse>('/api/token');
  return response.data.devices;
}

/**
 * 创建新设备并签发 token
 * POST /api/token，需重新输入主密码（敏感操作二次校验）
 * @param deviceName - 设备名称
 * @param masterPassword - 主密码（已哈希）
 * @param ttl - Token 有效期（秒），0 = 永久，undefined = 服务端默认 30 天
 */
export async function createDevice(
  deviceName: string,
  masterPassword: string,
  ttl?: number
): Promise<CreateDeviceResponse> {
  const body: Record<string, unknown> = {
    device_name: deviceName,
    master_password: masterPassword,
    user_id: 'default',
  };
  if (ttl !== undefined) body.ttl = ttl;
  const response = await apiClient.post<CreateDeviceResponse>('/api/token', body);
  return response.data;
}

/**
 * 揭示指定设备的 token 明文（需要密码验证）
 * GET /api/token/{jti}
 * @param jti - 目标设备的 jti 标识
 */
export async function revealDeviceToken(jti: string): Promise<RevealTokenResponse> {
  return await authenticatedRequest<RevealTokenResponse>('GET', `/api/token/${jti}`);
}

/**
 * 撤销指定设备的 Token（需要密码验证）
 * DELETE /api/token/{jti}
 * @param jti - 要撤销的设备 Token 的 jti 标识
 */
export async function revokeDevice(jti: string): Promise<ApiResponse> {
  return await authenticatedRequest<ApiResponse>('DELETE', `/api/token/${jti}`);
}

/**
 * 重命名设备（仅需 Token，无需密码二次验证）
 * PATCH /api/token/{jti}
 * @param jti - 目标设备的 jti 标识
 * @param deviceName - 新设备名
 */
export async function renameDevice(
  jti: string,
  deviceName: string
): Promise<ApiResponse> {
  const response = await apiClient.patch<ApiResponse>(`/api/token/${jti}`, {
    device_name: deviceName,
  });
  return response.data;
}

/**
 * 修改设备 Token 有效期（需密码二次验证）
 * PATCH /api/token/{jti}，body 含 ttl 字段
 * @param jti - 目标设备的 jti 标识
 * @param ttl - 新的有效期（秒），0 = 永久
 */
export async function updateDeviceTtl(
  jti: string,
  ttl: number
): Promise<UpdateTtlResponse> {
  return await authenticatedRequest<UpdateTtlResponse>(
    'PATCH',
    `/api/token/${jti}`,
    { ttl }
  );
}

// ── 兼容旧接口（供旧代码过渡期使用，后续可删除） ──────────────────────────

/**
 * @deprecated 登录已统一在 auth.ts 的 login()，请勿在新代码中调用此函数
 */
export async function createToken(
  deviceName: string,
  masterPassword: string
): Promise<{ success: boolean; token: string; device_name: string; jti: string; created_at: string }> {
  const response = await apiClient.post('/api/token', {
    device_name: deviceName,
    master_password: masterPassword,
    user_id: 'default',
  });
  return response.data;
}

/**
 * @deprecated 使用 getDevices() 替代
 */
export async function getTokens(): Promise<DeviceListResponse> {
  const response = await apiClient.get<DeviceListResponse>('/api/token');
  return response.data;
}

/**
 * @deprecated 使用 revokeDevice(jti) 替代
 */
export async function revokeToken(tokenId: string): Promise<ApiResponse> {
  return revokeDevice(tokenId);
}
