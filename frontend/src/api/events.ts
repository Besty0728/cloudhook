/**
 * 事件历史 API
 * 对应契约：GET /api/events?limit=&offset=&type=
 * 对应契约：DELETE /api/events { indices } | { clear_all: true }
 */

import { apiClient } from './client';
import { EventsResponse, DeleteResponse } from '@/types/api';

/**
 * 获取事件列表
 * GET /api/events → {success, events, total, has_more}
 * @param limit  - 每页条数，默认 20
 * @param offset - 偏移量，默认 0
 * @param type   - 事件类型过滤（可选）
 */
export async function getEvents(
  limit = 20,
  offset = 0,
  type?: string,
  device?: string
): Promise<EventsResponse> {
  const params: Record<string, unknown> = { limit, offset };
  if (type) {
    params.type = type;
  }
  if (device) {
    params.device = device;
  }

  const response = await apiClient.get<EventsResponse>('/api/events', { params });
  return response.data;
}

/**
 * 按索引删除事件
 * DELETE /api/events { indices: number[] }
 */
export async function deleteEvents(indices: number[]): Promise<DeleteResponse> {
  const response = await apiClient.delete<DeleteResponse>('/api/events', {
    data: { indices },
  });
  return response.data;
}

/**
 * 清空全部事件
 * DELETE /api/events { clear_all: true }
 */
export async function clearAllEvents(): Promise<DeleteResponse> {
  const response = await apiClient.delete<DeleteResponse>('/api/events', {
    data: { clear_all: true },
  });
  return response.data;
}
