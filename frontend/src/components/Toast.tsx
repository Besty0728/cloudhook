/**
 * Toast 通知组件
 */

import { useState, useEffect } from 'react';
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export default function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // 等待动画结束
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeStyles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  };

  const icons = {
    success: (
      <div className="flex-shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
        <CheckCircleIcon className="h-5 w-5 text-white" />
      </div>
    ),
    error: (
      <div className="flex-shrink-0 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
        <ExclamationCircleIcon className="h-5 w-5 text-white" />
      </div>
    ),
    info: (
      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
        <InformationCircleIcon className="h-5 w-5 text-white" />
      </div>
    ),
    warning: (
      <div className="flex-shrink-0 w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
        <ExclamationCircleIcon className="h-5 w-5 text-white" />
      </div>
    ),
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl transition-all duration-300 backdrop-blur-sm ${
        typeStyles[type]
      } ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
      style={{ minWidth: '300px', maxWidth: '500px' }}
    >
      {icons[type]}
      <span className="flex-1 font-medium">{message}</span>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
