/**
 * 认证相关 API
 */

import { apiClient } from './client';
import { ApiResponse } from '@/types/api';
import { getDeviceFingerprint } from '@/utils/deviceId';

export interface LoginRequest {
  device_name: string;
  master_password: string;
  user_id?: string;
  device_fingerprint?: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  device_name: string;
  user_id: string;
}

/**
 * 生成 Token（登录）
 * 单用户模式：仅凭 Master Password 登录，device_name 固定占位。
 */
export async function login(
  masterPassword: string
): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/token', {
    device_name: 'Web',
    master_password: masterPassword,
    user_id: 'default', // 单用户模式
    device_fingerprint: getDeviceFingerprint(), // 设备指纹，后端据此去重避免重复创建
  });
  return response.data;
}

/**
 * 验证 Token 是否有效
 */
export async function validateToken(): Promise<boolean> {
  try {
    const response = await apiClient.get<ApiResponse>('/api/config');
    return response.data.success;
  } catch {
    return false;
  }
}

export interface SetupStatus {
  configured: boolean;
}

/**
 * 查询服务端是否已配置（MASTER_PASSWORD）。
 * 用于登录页提示部署者：未配置时无法登录，需先在控制台设置环境变量。
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  try {
    const response = await apiClient.get<{
      success: boolean;
      configured: boolean;
    }>('/api/setup-status');
    return { configured: response.data.configured };
  } catch {
    // 探测失败时按已配置处理，不阻断正常登录入口
    return { configured: true };
  }
}
