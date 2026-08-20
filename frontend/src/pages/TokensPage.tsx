/**
 * 设备管理页（Token 管理）
 *
 * 一设备一 Token 模型：每次登录或手动创建生成一条设备记录，
 * 撤销设备即撤销该设备的访问凭证（Token 加入 KV 吊销名单）。
 *
 * 核心交互：
 * - 进页面自动加载设备列表（GET /api/token）
 * - 创建设备：重新输入主密码 + 设备名，签发新 token（POST /api/token）
 * - 查看 Token：揭示任意设备的 token 明文（GET /api/token/{jti}，需 HMAC 签名）
 * - 当前设备高亮标识，撤销按钮禁用
 * - 其他设备可撤销（DELETE /api/token/{jti}，需 HMAC 签名）
 * - 撤销前 ConfirmDialog 二次确认（danger=true）
 * - 缺少 HMAC Secret 时自动弹窗获取
 */

import { useEffect, useState, useCallback } from 'react';
import { getDevices, revokeDevice, createDevice, revealDeviceToken, renameDevice, updateDeviceTtl } from '@/api/tokens';
import { Device } from '@/types/api';
import { formatDateTime, formatRelativeTime } from '@/utils/format';
import { hashPassword } from '@/utils/passwordHash';
import { getKnownDeviceJti } from '@/utils/deviceId';
import { useAuthStore } from '@/store/authStore';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button, ConfirmDialog, StatusBadge, EmptyState, Input } from '@/components/ui';
import { Plus, Copy, Check, Eye, X, ChevronDown, Pencil, Clock } from 'lucide-react';

// ─── Toast 简易内部实现（不引入第三方，保持页面自包含）─────────────────────

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'warning';
  message: string;
}

let toastIdCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    // 4 秒后自动移除
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

// ─── Toast 展示组件 ────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0) return null;

  const colorMap: Record<ToastItem['type'], string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
  };

  const iconMap: Record<ToastItem['type'], React.ReactNode> = {
    success: (
      <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300 ${colorMap[toast.type]}`}
        >
          {iconMap[toast.type]}
          <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="关闭通知"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── 设备卡片组件 ──────────────────────────────────────────────────────────

interface DeviceCardProps {
  device: Device;
  revoking: boolean;
  revealing: boolean;
  renaming: boolean;
  expanded: boolean;
  token: string | null;
  isNewToken: boolean;
  onRevokeClick: (device: Device) => void;
  onToggleReveal: (device: Device) => void;
  onRename: (device: Device, newName: string) => Promise<void>;
  onModifyTtl: (device: Device) => void;
}

function DeviceCard({
  device,
  revoking,
  revealing,
  renaming,
  expanded,
  token,
  isNewToken,
  onRevokeClick,
  onToggleReveal,
  onRename,
  onModifyTtl,
}: DeviceCardProps) {
  const isCurrent = device.is_current;
  // 内联重命名状态
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(device.device_name);

  // 进入编辑态时同步当前设备名
  const startEdit = () => {
    setDraftName(device.device_name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftName(device.device_name);
  };

  const submitEdit = async () => {
    const trimmed = draftName.trim();
    // 无变化或为空：直接退出编辑态
    if (!trimmed || trimmed === device.device_name) {
      cancelEdit();
      return;
    }
    await onRename(device, trimmed);
    setEditing(false);
  };

  return (
    <div
      className={`
        relative rounded-2xl border transition-all duration-200 overflow-hidden
        ${isCurrent
          ? 'bg-gradient-to-r from-gray-50/80 to-stone-50/80 border-gray-300/70 shadow-md ring-1 ring-gray-300/50'
          : 'bg-white/70 border-gray-100 hover:shadow-md hover:border-gray-300'}
        backdrop-blur-sm
      `}
    >
      {/* 头部行：信息 + 操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
        {/* 左侧：设备图标 + 信息 */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* 设备图标 */}
          <div
            className={`
              flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center
              ${isCurrent
                ? 'bg-black'
                : 'bg-gradient-to-br from-gray-100 to-gray-200'}
            `}
          >
            <svg
              className={`w-5 h-5 ${isCurrent ? 'text-white' : 'text-gray-500'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          {/* 设备名 + 元信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {editing ? (
                /* 编辑态：输入框 + 确认/取消 */
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    disabled={renaming}
                    maxLength={50}
                    className="px-2 py-1 text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-lg outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-400 max-w-[200px]"
                    aria-label="编辑设备名称"
                  />
                  <button
                    onClick={submitEdit}
                    disabled={renaming}
                    className="flex-shrink-0 p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-50"
                    aria-label="保存设备名称"
                    title="保存"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={renaming}
                    className="flex-shrink-0 p-1 text-gray-400 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                    aria-label="取消编辑"
                    title="取消"
                  >
                    <X size={16} />
                  </button>
                </span>
              ) : (
                /* 展示态：设备名 + 重命名按钮 */
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-gray-900 truncate">{device.device_name}</span>
                  <button
                    onClick={startEdit}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    aria-label="重命名设备"
                    title="重命名"
                  >
                    <Pencil size={14} />
                  </button>
                </span>
              )}
              {/* 当前设备标识 */}
              {isCurrent && (
                <StatusBadge status="active" label="当前设备" />
              )}
            </div>

            {/* 元数据行 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {/* 创建时间 */}
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                创建于 {formatDateTime(device.created_at)}
              </span>

              {/* Token 有效期 */}
              <button
                onClick={() => onModifyTtl(device)}
                className="flex items-center gap-1 hover:text-gray-800 transition-colors group"
                title="点击修改有效期"
              >
                <Clock className="w-3.5 h-3.5" />
                {device.exp === 0
                  ? '永久有效'
                  : device.exp != null && device.exp > 0
                    ? device.exp * 1000 > Date.now()
                      ? `有效期至 ${formatDateTime(new Date(device.exp * 1000).toISOString())}`
                      : '已过期'
                    : '有效期未知'
                }
                <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>

              {/* 最后使用时间 */}
              {device.last_seen && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  最后活跃 {formatRelativeTime(device.last_seen)}
                </span>
              )}

              {/* 最后 IP */}
              {device.last_ip && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                  {device.last_ip}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：操作区 */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* 查看 Token：点击展开/收起手风琴 */}
          <Button
            variant="secondary"
            onClick={() => onToggleReveal(device)}
            disabled={revealing}
            aria-expanded={expanded}
            className="text-sm flex items-center gap-1.5"
          >
            <Eye size={15} />
            {revealing ? '获取中…' : expanded ? '收起 Token' : '查看 Token'}
            <ChevronDown
              size={15}
              className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </Button>

          {isCurrent ? (
            /* 当前设备：禁用撤销，说明原因 */
            <button
              disabled
              title="当前设备无法撤销（撤销后等于退出登录）"
              className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed select-none"
            >
              当前设备无法撤销
            </button>
          ) : (
            /* 其他设备：危险撤销按钮 */
            <Button
              variant="danger"
              onClick={() => onRevokeClick(device)}
              disabled={revoking}
              className="text-sm"
            >
              {revoking ? '撤销中…' : '撤销'}
            </Button>
          )}
        </div>
      </div>

      {/* 手风琴展开区：Token 明文 */}
      <div
        className={`
          grid transition-all duration-300 ease-in-out
          ${expanded && token ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
        `}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-0">
            <div className="border-t border-gray-200/70 pt-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">
                设备 Token（X-CloudHook-Token）
              </label>
              {token && <TokenDisplay token={token} />}
              {isNewToken && (
                <div className="mt-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    请将此 Token 配置到 Claude Code 的 settings.json 中。它也可随时在本页「查看 Token」重新获取。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Token 展示块（带复制按钮，创建/查看共用）──────────────────────────────

function TokenDisplay({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 px-3 py-2.5 bg-gray-100 rounded-lg text-xs text-gray-800 font-mono break-all leading-relaxed max-h-32 overflow-y-auto">
        {token}
      </code>
      <button
        onClick={handleCopy}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
        aria-label="复制 Token"
      >
        {copied ? <><Check size={15} />已复制</> : <><Copy size={15} />复制</>}
      </button>
    </div>
  );
}

// ─── 创建设备弹窗 ──────────────────────────────────────────────────────────

interface CreateDeviceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (token: string, deviceName: string, jti: string) => void;
  onError: (message: string) => void;
}

function CreateDeviceModal({ open, onClose, onCreated, onError }: CreateDeviceModalProps) {
  const [deviceName, setDeviceName] = useState('');
  const [password, setPassword] = useState('');
  const [ttl, setTtl] = useState<number>(0); // default: permanent
  const [submitting, setSubmitting] = useState(false);

  // 关闭时重置表单
  useEffect(() => {
    if (!open) {
      setDeviceName('');
      setPassword('');
      setTtl(0);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!deviceName.trim()) {
      onError('请填写设备名称');
      return;
    }
    if (!password) {
      onError('请输入主密码');
      return;
    }
    setSubmitting(true);
    try {
      // 对密码进行哈希后再发送到后端
      const passwordHash = await hashPassword(password);
      const res = await createDevice(deviceName.trim(), passwordHash, ttl);
      if (res.success !== false && res.token) {
        onCreated(res.token, res.device_name, res.jti);
      } else {
        onError('创建设备失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 后端密码校验失败返回 401
      if (msg.includes('401') || msg.toLowerCase().includes('password')) {
        onError('主密码不正确');
      } else {
        onError(`创建失败：${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-3xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
              <Plus size={18} className="text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">创建新设备</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        {/* 表单 */}
        <div className="px-6 pb-2 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">设备名称</label>
            <Input
              value={deviceName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeviceName(e.target.value)}
              placeholder="例：MacBook Pro / 公司台式机"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">主密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="为新设备签发 token 需重新校验主密码"
              disabled={submitting}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">Token 有效期</label>
            <select
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 transition-colors appearance-none cursor-pointer"
            >
              <option value={0}>永久（永不过期）</option>
              <option value={604800}>7 天</option>
              <option value={2592000}>30 天</option>
              <option value={7776000}>90 天</option>
              <option value={31536000}>1 年</option>
            </select>
          </div>
        </div>

        {/* 操作 */}
        <div className="flex justify-end gap-3 px-6 py-5">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>取消</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '创建中…' : '创建设备'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 修改有效期弹窗 ────────────────────────────────────────────────────────

interface ModifyTtlModalProps {
  open: boolean;
  device: Device | null;
  onClose: () => void;
  onUpdated: (jti: string, newExp: number, newToken: string) => void;
  onError: (message: string) => void;
}

function ModifyTtlModal({ open, device, onClose, onUpdated, onError }: ModifyTtlModalProps) {
  const [ttl, setTtl] = useState<number>(0);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 成功后展示新 token
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [resultExp, setResultExp] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      if (device?.exp === 0) setTtl(0);
      else setTtl(0);
      setPassword('');
      setSubmitting(false);
      setResultToken(null);
      setResultExp(0);
      setCopied(false);
    }
  }, [open, device]);

  if (!open || !device) return null;

  const handleSubmit = async () => {
    if (!password) {
      onError('请输入主密码');
      return;
    }
    setSubmitting(true);
    try {
      const res = await updateDeviceTtl(device.jti, ttl);
      if (res.success !== false && res.token) {
        setResultToken(res.token);
        setResultExp(res.exp);
      } else {
        onError('修改有效期失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.toLowerCase().includes('password')) {
        onError('主密码不正确');
      } else {
        onError(`修改失败：${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (resultToken) {
      onUpdated(device.jti, resultExp, resultToken);
    }
    onClose();
  };

  const handleCopy = () => {
    if (resultToken) {
      navigator.clipboard.writeText(resultToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const ttlLabel = ttl === 0 ? '永久（永不过期）'
    : ttl === 604800 ? '7 天'
    : ttl === 2592000 ? '30 天'
    : ttl === 7776000 ? '90 天'
    : '1 年';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-3xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
              <Clock size={18} className="text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">修改有效期</h3>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        {resultToken ? (
          /* 成功：展示新 Token */
          <div className="px-6 pb-6 space-y-4">
            <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm text-emerald-800 font-medium">
                有效期已更新为「{ttlLabel}」
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">
                新 Token（请替换 settings.json 中的旧 Token）
              </label>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 px-3 py-2.5 bg-gray-100 rounded-lg text-xs text-gray-800 font-mono break-all leading-relaxed max-h-32 overflow-y-auto">
                  {resultToken}
                </code>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
                >
                  {copied ? <><Check size={15} />已复制</> : <><Copy size={15} />复制</>}
                </button>
              </div>
            </div>
            <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800 leading-relaxed">
                新 Token 签名已变更，旧 Token 将在原有效期到达后自动失效。请尽快将新 Token 更新到 Claude Code 的 settings.json 中。
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={handleClose}>完成</Button>
            </div>
          </div>
        ) : (
          /* 表单 */
          <>
            <div className="px-6 pb-2 space-y-4">
              <div className="px-3 py-2 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600">
                  设备：<span className="font-medium text-gray-900">{device.device_name}</span>
                  <span className="mx-2">·</span>
                  当前：{device.exp === 0 ? '永久有效' : device.exp != null && device.exp > 0 ? `有效期至 ${formatDateTime(new Date(device.exp * 1000).toISOString())}` : '未知'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">新有效期</label>
                <select
                  value={ttl}
                  onChange={(e) => setTtl(Number(e.target.value))}
                  disabled={submitting}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 transition-colors appearance-none cursor-pointer"
                >
                  <option value={0}>永久（永不过期）</option>
                  <option value={604800}>7 天</option>
                  <option value={2592000}>30 天</option>
                  <option value={7776000}>90 天</option>
                  <option value={31536000}>1 年</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">主密码</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="修改有效期需重新校验主密码"
                  disabled={submitting}
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-5">
              <Button variant="secondary" onClick={onClose} disabled={submitting}>取消</Button>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '更新中…' : '确认修改'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────

export default function TokensPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 待撤销的设备（用于确认弹窗）
  const [pendingRevoke, setPendingRevoke] = useState<Device | null>(null);
  // 正在撤销中的 jti 集合（防止重复提交）
  const [revokingSet, setRevokingSet] = useState<Set<string>>(new Set());

  // 创建设备弹窗开关
  const [createOpen, setCreateOpen] = useState(false);
  // 修改有效期的目标设备（null = 弹窗关闭）
  const [ttlModifyDevice, setTtlModifyDevice] = useState<Device | null>(null);
  // 正在揭示 token 的 jti 集合（防止重复提交）
  const [revealingSet, setRevealingSet] = useState<Set<string>>(new Set());
  // 正在重命名中的 jti 集合（防止重复提交）
  const [renamingSet, setRenamingSet] = useState<Set<string>>(new Set());
  // 当前展开（手风琴）的设备 jti，null 表示全部收起
  const [expandedJti, setExpandedJti] = useState<string | null>(null);
  // 已获取的 token 明文缓存：jti → token
  const [tokenCache, setTokenCache] = useState<Record<string, string>>({});
  // 刚创建的设备 jti（用于展示一次性保存提示）
  const [newTokenJti, setNewTokenJti] = useState<string | null>(null);

  const { toasts, addToast, removeToast } = useToast();

  // 加载设备列表
  const loadDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getDevices();
      setDevices(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载设备列表失败';
      console.error('[TokensPage] 加载设备列表失败:', err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // 点击撤销按钮 → 弹确认框
  const handleRevokeClick = useCallback((device: Device) => {
    setPendingRevoke(device);
  }, []);

  // 取消确认
  const handleRevokeCancel = useCallback(() => {
    setPendingRevoke(null);
  }, []);

  // 确认撤销
  const handleRevokeConfirm = useCallback(async () => {
    if (!pendingRevoke) return;
    const { jti, device_name } = pendingRevoke;
    setPendingRevoke(null);

    setRevokingSet((prev) => new Set(prev).add(jti));
    try {
      await revokeDevice(jti);
      addToast('success', `设备「${device_name}」已成功撤销`);
      // 清理该设备的展开状态与 token 缓存
      if (expandedJti === jti) setExpandedJti(null);
      setTokenCache((prev) => {
        const next = { ...prev };
        delete next[jti];
        return next;
      });
      // 撤销成功后刷新列表
      await loadDevices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '撤销失败';
      addToast('error', `撤销失败：${msg}`);
      console.error('[TokensPage] 撤销设备失败:', err);
    } finally {
      setRevokingSet((prev) => {
        const next = new Set(prev);
        next.delete(jti);
        return next;
      });
    }
  }, [pendingRevoke, addToast, loadDevices, expandedJti]);

  // 创建设备成功 → 缓存 token、展开该设备的手风琴并刷新列表
  const handleCreated = useCallback((token: string, deviceName: string, jti: string) => {
    setCreateOpen(false);
    setTokenCache((prev) => ({ ...prev, [jti]: token }));
    setNewTokenJti(jti);
    setExpandedJti(jti);
    addToast('success', `设备「${deviceName}」已创建`);
    loadDevices();
  }, [addToast, loadDevices]);

  // 修改有效期成功 → 更新 token 缓存、刷新列表
  const handleTtlUpdated = useCallback((jti: string, _newExp: number, newToken: string) => {
    setTokenCache((prev) => ({ ...prev, [jti]: newToken }));
    // PATCH 改有效期会重签 token；HooksPage 指引与 apiClient 鉴权读的是 authStore
    // 快照，当前设备必须回写，否则指引永远展示旧 token。
    // 不传 passwordHash：setToken 的该参数可选，不传不会覆盖/清除已存哈希。
    if (jti === getKnownDeviceJti()) {
      useAuthStore.getState().setToken(newToken);
    }
    setNewTokenJti(jti);
    setExpandedJti(jti);
    addToast('success', '有效期已更新');
    loadDevices();
  }, [addToast, loadDevices]);

  // 点击「查看 Token」→ 手风琴切换展开/收起；展开时按需揭示 token 明文
  const handleToggleReveal = useCallback(async (device: Device) => {
    const { jti } = device;

    // 已展开 → 收起
    if (expandedJti === jti) {
      setExpandedJti(null);
      return;
    }

    // 已有缓存 → 直接展开，无需再请求
    if (tokenCache[jti]) {
      setNewTokenJti(null);
      setExpandedJti(jti);
      return;
    }

    // 无缓存 → 拉取后展开
    setRevealingSet((prev) => new Set(prev).add(jti));
    try {
      const res = await revealDeviceToken(jti);
      if (res.success !== false && res.token) {
        setTokenCache((prev) => ({ ...prev, [jti]: res.token }));
        // reveal 返回的是注册表确定性重算的 canonical token；若当前设备的
        // authStore 快照与之不同（历史漂移，如改有效期后未回写的旧版本残留），
        // 借机回写自愈，保证 HooksPage 指引与 apiClient 鉴权用到最新 token
        if (jti === getKnownDeviceJti() && res.token !== useAuthStore.getState().token) {
          useAuthStore.getState().setToken(res.token);
        }
        setNewTokenJti(null);
        setExpandedJti(jti);
      } else {
        addToast('error', '获取 Token 失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取 Token 失败';
      addToast('error', `获取 Token 失败：${msg}`);
      console.error('[TokensPage] 揭示 Token 失败:', err);
    } finally {
      setRevealingSet((prev) => {
        const next = new Set(prev);
        next.delete(jti);
        return next;
      });
    }
  }, [expandedJti, tokenCache, addToast]);

  // 重命名设备（仅需 Token，乐观更新本地列表）
  const handleRename = useCallback(async (device: Device, newName: string) => {
    const { jti } = device;
    setRenamingSet((prev) => new Set(prev).add(jti));
    try {
      await renameDevice(jti, newName);
      // 乐观更新：直接改本地列表，避免整列表刷新闪烁
      setDevices((prev) =>
        prev.map((d) => (d.jti === jti ? { ...d, device_name: newName } : d))
      );
      addToast('success', `已重命名为「${newName}」`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '重命名失败';
      addToast('error', `重命名失败：${msg}`);
      console.error('[TokensPage] 重命名设备失败:', err);
      throw err; // 抛出让卡片保持编辑态
    } finally {
      setRenamingSet((prev) => {
        const next = new Set(prev);
        next.delete(jti);
        return next;
      });
    }
  }, [addToast]);

  // 当前设备放首位，其余按创建时间降序
  const sortedDevices = [...devices].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <>
      {/* Toast 通知浮层 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 撤销确认弹窗 */}
      <ConfirmDialog
        open={pendingRevoke !== null}
        title="确认撤销设备"
        message={
          pendingRevoke
            ? `撤销后，设备「${pendingRevoke.device_name}」将立即无法访问 CloudHook，需重新登录获取新 Token。此操作不可撤销。`
            : ''
        }
        confirmText="确认撤销"
        cancelText="取消"
        danger
        onConfirm={handleRevokeConfirm}
        onCancel={handleRevokeCancel}
      />

      {/* 创建设备弹窗 */}
      <CreateDeviceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        onError={(msg) => addToast('error', msg)}
      />

      {/* 修改有效期弹窗 */}
      <ModifyTtlModal
        open={ttlModifyDevice !== null}
        device={ttlModifyDevice}
        onClose={() => setTtlModifyDevice(null)}
        onUpdated={handleTtlUpdated}
        onError={(msg) => addToast('error', msg)}
      />

      <div className="p-6 max-w-4xl mx-auto">
        {/* 页面标题区 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
            设备管理
          </h1>
          <p className="text-gray-600 tracking-wide">管理所有登录设备及其访问凭证（Token）</p>
        </div>

        {/* 说明信息卡片 */}
        <div className="mb-6 p-4 bg-gray-50/60 border border-gray-200/80 rounded-2xl backdrop-blur-sm">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center mt-0.5">
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-sm text-gray-800 space-y-1">
              <p className="font-semibold">关于 Token 机制</p>
              <ul className="text-gray-700/90 space-y-0.5 list-disc list-inside">
                <li>每台设备单独签发 Token（无状态签名，验证不查数据库）</li>
                <li>「创建设备」需重新输入主密码，签发后可随时「查看 Token」复制到多台机器</li>
                <li>撤销通过 KV 吊销名单生效，已签发的 Token 在下次请求时会被拦截</li>
                <li>撤销当前设备等于将自己退出登录，已限制该操作</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 主内容卡片 */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100">
          {/* 卡片头部 */}
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">已登录设备</h2>
                  {!isLoading && !error && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      共 {devices.length} 台设备
                    </p>
                  )}
                </div>
              </div>

              {/* 操作区：创建 + 刷新 */}
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-1.5"
                >
                  <Plus size={16} />
                  创建设备
                </Button>
                <Button
                  variant="refresh"
                  onClick={loadDevices}
                  disabled={isLoading}
                  aria-label="刷新设备列表"
                />
              </div>
            </div>
          </div>

          {/* 卡片内容区 */}
          <div className="p-6">
            {isLoading ? (
              /* 加载中 */
              <div className="py-16 flex flex-col items-center gap-4">
                <LoadingSpinner size="lg" />
                <p className="text-gray-500 text-sm">加载设备列表中…</p>
              </div>
            ) : error ? (
              /* 加载出错 */
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mb-4">
                  <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-red-600 font-medium mb-1">加载失败</p>
                <p className="text-sm text-gray-500 mb-6">{error}</p>
                <Button variant="primary" onClick={loadDevices}>
                  重试
                </Button>
              </div>
            ) : sortedDevices.length === 0 ? (
              /* 空状态（理论上不会出现，至少有当前设备） */
              <EmptyState
                title="暂无设备记录"
                description="当前账户下没有已登录的设备，请重新登录"
                icon={
                  <svg className="w-7 h-7 text-gray-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                }
              />
            ) : (
              /* 设备列表 */
              <div className="space-y-3">
                {sortedDevices.map((device) => (
                  <DeviceCard
                    key={device.jti}
                    device={device}
                    revoking={revokingSet.has(device.jti)}
                    revealing={revealingSet.has(device.jti)}
                    renaming={renamingSet.has(device.jti)}
                    expanded={expandedJti === device.jti}
                    token={tokenCache[device.jti] ?? null}
                    isNewToken={newTokenJti === device.jti}
                    onRevokeClick={handleRevokeClick}
                    onToggleReveal={handleToggleReveal}
                    onRename={handleRename}
                    onModifyTtl={setTtlModifyDevice}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
