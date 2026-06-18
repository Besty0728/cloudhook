/**
 * 格式化工具函数
 */

import { format, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * 格式化日期时间
 */
export function formatDateTime(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, 'yyyy-MM-dd HH:mm:ss', { locale: zhCN });
  } catch {
    return '无效日期';
  }
}

/**
 * 格式化相对时间（多久之前）
 */
export function formatRelativeTime(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
  } catch {
    return '未知';
  }
}

/**
 * 脱敏 Bark Key（只显示前 4 位和后 4 位）
 */
export function maskBarkKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/**
 * 脱敏 Token（只显示前 8 位）
 */
export function maskToken(token: string): string {
  if (!token || token.length < 8) return '***';
  return `${token.slice(0, 8)}...`;
}

/**
 * 风险等级颜色
 */
export function getRiskLevelColor(level?: string): string {
  switch (level) {
    case 'critical':
      return 'text-red-600 bg-red-50';
    case 'high':
      return 'text-orange-600 bg-orange-50';
    case 'medium':
      return 'text-yellow-600 bg-yellow-50';
    case 'low':
      return 'text-green-600 bg-green-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

/**
 * 风险等级文本
 */
export function getRiskLevelText(level?: string): string {
  switch (level) {
    case 'critical':
      return '极高';
    case 'high':
      return '高';
    case 'medium':
      return '中';
    case 'low':
      return '低';
    default:
      return '正常';
  }
}
