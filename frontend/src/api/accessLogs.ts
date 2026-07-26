/**
 * 访问日志 API
 * 对应契约：GET /api/access-logs?limit=&offset=
 * 对应契约：DELETE /api/access-logs { ids } | { clear_all: true }
 */

import { apiClient } from './client';
import { AccessLogsResponse, DeleteResponse } from '@/types/api';

/**
 * 获取访问日志列表
 * GET /api/access-logs → {success, logs, total, has_more}
 * @param limit  - 每页条数，默认 20
 * @param offset - 偏移量，默认 0
 * @param device - 设备 jti 过滤（可选）
 * @param agent  - 来源智能体过滤（可选）
 */
export async function getAccessLogs(
  limit = 20,
  offset = 0,
  device?: string,
  agent?: string
): Promise<AccessLogsResponse> {
  const params: Record<string, unknown> = { limit, offset };
  if (device) {
    params.device = device;
  }
  if (agent) {
    params.agent = agent;
  }
  const response = await apiClient.get<AccessLogsResponse>('/api/access-logs', {
    params,
  });
  return response.data;
}

/**
 * 按 ID 删除访问日志
 * DELETE /api/access-logs { ids: string[] }
 */
export async function deleteAccessLogsByIds(ids: string[]): Promise<DeleteResponse> {
  const response = await apiClient.delete<DeleteResponse>('/api/access-logs', {
    data: { ids },
  });
  return response.data;
}

/**
 * 清空全部访问日志
 * DELETE /api/access-logs { clear_all: true }
 */
export async function clearAllAccessLogs(): Promise<DeleteResponse> {
  const response = await apiClient.delete<DeleteResponse>('/api/access-logs', {
    data: { clear_all: true },
  });
  return response.data;
}
