/**
 * 配置管理 API
 */

import { apiClient, authenticatedRequest } from './client';
import { Config, ConfigResponse, ApiResponse } from '@/types/api';

/**
 * 获取用户配置
 */
export async function getConfig(): Promise<Config> {
  const response = await apiClient.get<ConfigResponse>('/api/config');
  return response.data.config;
}

/**
 * 更新用户配置
 */
export async function updateConfig(updates: Partial<Config>): Promise<ApiResponse<Config>> {
  return await authenticatedRequest<ApiResponse<Config>>('PUT', '/api/config', updates);
}

/**
 * 测试 Bark 推送
 */
export async function testBarkPush(): Promise<ApiResponse> {
  const response = await apiClient.post<ApiResponse>('/api/config/test');
  return response.data;
}
