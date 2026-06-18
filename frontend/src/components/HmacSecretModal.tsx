/**
 * 密码验证输入弹窗
 * 当用户进行需要验证的敏感操作时，若缺少密码验证，自动弹出此弹窗
 */

import { useState, useEffect } from 'react';
import { useHmacSecretStore } from '@/store/hmacSecretStore';
import { Button, Input } from '@/components/ui';
import { Shield, X } from 'lucide-react';

export default function HmacSecretModal() {
  const { modalOpen, submit, cancel } = useHmacSecretStore();
  const [password, setPassword] = useState('');

  // 弹窗打开时重置输入
  useEffect(() => {
    if (modalOpen) {
      setPassword('');
    }
  }, [modalOpen]);

  if (!modalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      return;
    }
    submit(password.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-3xl animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">密码验证</h3>
              <p className="text-xs text-gray-500 mt-0.5">敏感操作需要重新验证</p>
            </div>
          </div>
          <button
            onClick={cancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="取消"
          >
            <X size={20} />
          </button>
        </div>

        {/* 说明信息 */}
        <div className="px-6 pt-4 pb-2">
          <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-800 leading-relaxed">
              此操作需要重新验证您的主密码。这是为了保护敏感操作（创建/查看/撤销设备、修改配置等）的安全。
            </p>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="px-6 pb-2 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">
              主密码
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="输入您的主密码"
              autoFocus
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') handleSubmit(e as any);
              }}
            />
          </div>
        </form>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 px-6 py-5 bg-gray-50 rounded-b-2xl">
          <Button variant="secondary" onClick={cancel}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!password.trim()}>
            确认
          </Button>
        </div>
      </div>
    </div>
  );
}
