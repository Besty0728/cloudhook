/**
 * Textarea.tsx — 带聚焦动效的多行文本输入框
 *
 * 样式与 Input 协调，聚焦时下边框变为蓝紫渐变。
 */

import React from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 标签文字（显示在输入框上方，非浮动，适合 textarea） */
  label?: string;
  /** 额外 className 作用于外层容器 */
  className?: string;
}

const Textarea: React.FC<TextareaProps> = ({ label, className, ...props }) => {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label className="text-xs font-semibold text-indigo-600">{label}</label>
      )}
      <textarea
        className={cn(
          'w-full resize-none rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm text-slate-800 font-medium',
          'placeholder-slate-400 backdrop-blur-sm',
          'transition-all duration-200 outline-none',
          'focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/60',
        )}
        {...props}
      />
    </div>
  );
};

export default Textarea;
