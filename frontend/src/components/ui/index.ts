/**
 * frontend/src/components/ui/index.ts
 * 统一导出所有 UI 组件
 */

export { Button, default } from './Button';

export { default as Toggle } from './Toggle';
export type { ToggleProps } from './Toggle';

export { default as UiverseToggle } from './UiverseToggle';

export { Input, default as InputDefault } from './Input';

export { Label, default as LabelDefault } from './label';

export { default as Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

export { ConfirmDialog, default as ConfirmDialogDefault } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';

export { StatusBadge, default as StatusBadgeDefault } from './StatusBadge';
export type { StatusBadgeProps, StatusVariant } from './StatusBadge';

export { EmptyState, default as EmptyStateDefault } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { default as ClickSpark } from './ClickSpark';
export type { ClickSparkProps } from './ClickSpark';

export { default as TagInput } from './TagInput';
export type { TagInputProps } from './TagInput';

export { ExpandableTabs } from './expandable-tabs';
