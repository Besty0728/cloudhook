/**
 * TagInput.tsx — 标签输入组件
 *
 * 用于编辑字符串数组（如 dangerous_commands、ip 名单）。
 * 交互方式：
 *  - 输入后按 Enter 或 Tab 添加标签
 *  - 点击标签右侧 × 删除
 *  - 空输入框时按 Backspace 删除最后一个标签
 */

import React, { useState, useRef, KeyboardEvent } from 'react';
import { cn } from '@/utils/cn';

export interface TagInputProps {
  /** 当前标签数组 */
  value: string[];
  /** 变更回调，返回新的完整数组 */
  onChange: (tags: string[]) => void;
  /** 占位文字 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 外层容器 className */
  className?: string;
}

const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  placeholder = '输入后按 Enter 添加',
  disabled = false,
  className,
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /** 提交当前输入为新标签 */
  const commitTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    // 去重：已存在则不重复添加
    if (!value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitTag();
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      // 空输入时退格删除最后一个
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    const next = [...value];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1.5 min-h-[42px] w-full rounded-xl border border-gray-200',
        'bg-white/70 backdrop-blur-sm px-2.5 py-1.5 cursor-text',
        'transition-all duration-200',
        'focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-200/60',
        disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {/* 已添加的标签 */}
      {value.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200/70 text-indigo-700 text-xs font-medium"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(index);
              }}
              className="text-indigo-400 hover:text-indigo-600 transition-colors leading-none"
              aria-label={`删除 ${tag}`}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {/* 输入区域 */}
      {!disabled && (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitTag}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none py-0.5"
        />
      )}
    </div>
  );
};

export default TagInput;
