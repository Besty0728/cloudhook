/**
 * ConfirmDialog.tsx — 确认弹窗
 *
 * 基于 <dialog> 原生元素，适用于撤销 Token 等危险操作的二次确认。
 * 已剥离 UGuard 的 useI18n，直接使用中文文案。
 */

import { useEffect, useRef } from 'react';
import Button from './Button';

export interface ConfirmDialogProps {
  /** 弹窗是否可见 */
  open: boolean;
  /** 弹窗标题 */
  title: string;
  /** 确认内容描述 */
  message: string;
  /** 确认按钮文字，默认"确认" */
  confirmText?: string;
  /** 取消按钮文字，默认"取消" */
  cancelText?: string;
  /** 是否为危险操作（确认按钮变红） */
  danger?: boolean;
  /** 点击确认回调 */
  onConfirm: () => void;
  /** 点击取消/关闭回调 */
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // 同步 dialog 原生 open 状态
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open && !el.open) {
      el.showModal();
    }
    if (!open && el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="fixed inset-0 z-50 m-auto w-full max-w-sm rounded-2xl border border-white/80 bg-white/90 p-0 shadow-2xl backdrop:bg-slate-900/20 backdrop:backdrop-blur-sm backdrop-blur-3xl"
    >
      {/* 动画容器 */}
      <div className="modal-box p-0">
        <div className="p-6">
          {/* 标题行：带彩色左边框 */}
          <div className="flex items-start gap-3 mb-3">
            {danger ? (
              <div className="flex-shrink-0 w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            ) : (
              <div className="flex-shrink-0 w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            <h3 className="text-lg font-bold text-gray-900 leading-snug">{title}</h3>
          </div>

          <p className="text-sm font-medium leading-relaxed text-gray-600 ml-12">{message}</p>
        </div>

        {/* 操作按钮行 */}
        <div className="flex justify-end gap-3 px-6 pb-6">
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export default ConfirmDialog;
