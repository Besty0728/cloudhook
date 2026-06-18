/**
 * EmptyState.tsx — 空状态占位组件
 *
 * 显示一个居中的空状态图标 + 标题 + 可选描述。
 * 配色已调整为 CloudHook 蓝紫系。
 */

import { cn } from '@/utils/cn';

export interface EmptyStateProps {
  /** 主标题 */
  title: string;
  /** 副说明文字（可选） */
  description?: string;
  /** 自定义图标（不传则显示默认空箱图标） */
  icon?: React.ReactNode;
  /** 操作按钮或其他内容 */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('text-center py-14', className)}>
      {/* 图标容器 */}
      <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50/70 border border-indigo-300/20 flex items-center justify-center mb-4 shadow-sm">
        {icon ?? (
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-400/60"
          >
            <path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>

      <p className="text-[15px] font-semibold text-gray-700">{title}</p>
      {description && (
        <p className="mt-1 text-[13px] font-medium text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export default EmptyState;
