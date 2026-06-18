/**
 * Toggle.tsx — 开关组件
 *
 * 使用 uiverse.css 中的 .btn-toggle-* 类，选中时显示蓝紫渐变。
 */

import React from 'react';
import { cn } from '@/utils/cn';

export interface ToggleProps {
  /** 当前选中状态 */
  checked: boolean;
  /** 切换回调 */
  onChange: (checked: boolean) => void;
  /** 是否禁用 */
  disabled?: boolean;
  className?: string;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled, className }) => {
  const id = React.useId();

  return (
    <div className={cn('btn-toggle-container', className)}>
      <input
        id={id}
        type="checkbox"
        className="btn-toggle-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <label htmlFor={id} className="btn-toggle-switch">
        <span className="btn-toggle-slider" />
      </label>
    </div>
  );
};

export default Toggle;
