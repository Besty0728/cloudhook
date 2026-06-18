/**
 * StatusBadge.tsx — 状态徽章
 *
 * 支持风险级别（low/medium/high/critical）和访问结果（allowed/denied/rate_limited/geo_blocked/ip_blocked）。
 * 已剥离 UGuard 的 useI18n，直接使用中文文案。
 */

import { cn } from '@/utils/cn';

/** 支持的状态类型 */
export type StatusVariant =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'allowed'
  | 'denied'
  | 'rate_limited'
  | 'geo_blocked'
  | 'ip_blocked'
  | 'active'
  | 'revoked'
  | (string & {}); // 允许任意字符串，未知状态降级显示

export interface StatusBadgeProps {
  status: StatusVariant;
  /** 自定义显示文字，不传则由组件内部映射 */
  label?: string;
  className?: string;
}

/** 状态 → 中文标签映射 */
function getLabel(status: string): string {
  const map: Record<string, string> = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '极危',
    allowed: '通过',
    denied: '拒绝',
    rate_limited: '限流',
    geo_blocked: '地区限制',
    ip_blocked: 'IP 封禁',
    active: '正常',
    revoked: '已撤销',
  };
  return map[status] ?? status;
}

/** 状态 → Tailwind 颜色类映射（蓝紫系 + 风险色） */
function getColorClass(status: string): string {
  const map: Record<string, string> = {
    low: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200/70',
    high: 'bg-orange-50 text-orange-700 border border-orange-200/70',
    critical: 'bg-red-50 text-red-700 border border-red-200/70',
    allowed: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70',
    denied: 'bg-red-50 text-red-700 border border-red-200/70',
    rate_limited: 'bg-amber-50 text-amber-700 border border-amber-200/70',
    geo_blocked: 'bg-violet-50 text-violet-700 border border-violet-200/70',
    ip_blocked: 'bg-red-50 text-red-700 border border-red-200/70',
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70',
    revoked: 'bg-gray-100 text-gray-600 border border-gray-200/70',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600 border border-gray-200/70';
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide shadow-sm',
        getColorClass(status),
        className,
      )}
    >
      {label ?? getLabel(status)}
    </span>
  );
}

export default StatusBadge;
