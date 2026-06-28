/**
 * 事件流页面
 * 包含两个 Tab：事件流（带类型筛选+分页+删除）和访问日志（风控可视化+分页+删除）
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { getEvents, deleteEvents, clearAllEvents } from '@/api/events';
import { getAccessLogs, deleteAccessLogsByIds, clearAllAccessLogs } from '@/api/accessLogs';
import { getDevices } from '@/api/tokens';
import { Event, AccessLog, Device } from '@/types/api';
import { formatRelativeTime } from '@/utils/format';
import { StatusBadge, EmptyState, Button, ConfirmDialog } from '@/components/ui';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatDateTime } from '@/utils/format';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

/** 事件类型筛选选项（与后端 localClassify 实际产出对齐） */
const EVENT_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '全部', value: '' },
  { label: '需要权限', value: 'permission_required' },
  { label: '需要关注', value: 'attention_required' },
  { label: '任务完成', value: 'task_done' },
  { label: '信息', value: 'info' },
];

// ─── Toast 简易内部实现（保持页面自包含）─────────────────────────────────────

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
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

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

// ─── 子组件：事件详情弹窗 ──────────────────────────────────────────────────────

interface EventDetailModalProps {
  event: Event;
  deviceNameMap: Map<string, string>;
  onClose: () => void;
}

function EventDetailModal({ event, deviceNameMap, onClose }: EventDetailModalProps) {
  return (
    /* 遮罩层 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-stone-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">事件详情</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="px-6 py-5 space-y-4">
          {/* 事件名称 */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">事件名称</p>
            <p className="text-sm font-semibold text-gray-900">{event.event_name}</p>
          </div>

          {/* 标题 */}
          {event.title && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">标题</p>
              <p className="text-sm text-gray-800">{event.title}</p>
            </div>
          )}

          {/* 正文 */}
          {event.body && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">内容</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                {event.body}
              </p>
            </div>
          )}

          {/* 元数据行 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">事件类型</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200 text-xs font-semibold tracking-wide">
                {event.event_type}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">风险等级</p>
              {event.risk_level ? (
                <StatusBadge status={event.risk_level} />
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">时间</p>
              <p className="text-xs text-gray-600">{formatDateTime(event.timestamp)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">通知状态</p>
              <span className={`text-xs font-semibold ${event.notified ? 'text-emerald-600' : 'text-gray-400'}`}>
                {event.notified ? '已推送' : '未推送'}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">来源设备</p>
              <p className="text-xs text-gray-600">
                {event.jti ? (deviceNameMap.get(event.jti) || '已删除设备') : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* 弹窗底部 */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <Button variant="secondary" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  );
}

// ─── 子组件：选择复选框 ────────────────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
        checked
          ? 'bg-black border-black'
          : 'bg-white border-gray-300 hover:border-gray-400'
      }`}
      aria-label={checked ? '取消选择' : '选择'}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// ─── 子组件：设备筛选下拉 ──────────────────────────────────────────────────────

function DeviceFilter({
  devices,
  value,
  onChange,
}: {
  devices: Device[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 transition-colors cursor-pointer max-w-[180px] truncate"
    >
      <option value="">全部设备</option>
      {devices.map((d) => (
        <option key={d.jti} value={d.jti}>{d.device_name}</option>
      ))}
    </select>
  );
}

// ─── 子组件：设备名标签（jti→设备名映射；查不到显示「已删除设备」；无 jti 不显示）──

function DeviceTag({ jti, deviceNameMap }: { jti?: string; deviceNameMap: Map<string, string> }) {
  if (!jti) return null;
  const name = deviceNameMap.get(jti);
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7h10v10H9zM9 12H5a2 2 0 00-2 2v3h6V12z" />
      </svg>
      {name || '已删除设备'}
    </span>
  );
}

// ─── 子组件：事件流 Tab ────────────────────────────────────────────────────────

function EventsTab({ addToast, devices, deviceNameMap }: { addToast: (type: ToastItem['type'], msg: string) => void; devices: Device[]; deviceNameMap: Map<string, string> }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'delete_selected' | 'clear_all' | null>(null);

  const load = useCallback(async (newOffset: number, newType: string, newDevice: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getEvents(PAGE_SIZE, newOffset, newType || undefined, newDevice || undefined);
      setEvents(data.events || []);
      setTotal(data.total || 0);
      setHasMore(data.has_more || false);
      setOffset(newOffset);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    load(0, typeFilter, deviceFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 切换类型筛选：重置到第 0 页，清空选择
  const handleTypeChange = (val: string) => {
    setTypeFilter(val);
    setSelectedIndices(new Set());
    load(0, val, deviceFilter);
  };

  // 切换设备筛选：重置到第 0 页，清空选择
  const handleDeviceChange = (val: string) => {
    setDeviceFilter(val);
    setSelectedIndices(new Set());
    load(0, typeFilter, val);
  };

  const handlePrev = () => {
    setSelectedIndices(new Set());
    load(Math.max(0, offset - PAGE_SIZE), typeFilter, deviceFilter);
  };
  const handleNext = () => {
    setSelectedIndices(new Set());
    load(offset + PAGE_SIZE, typeFilter, deviceFilter);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 选择逻辑
  const toggleSelect = (localIdx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(localIdx)) next.delete(localIdx);
      else next.add(localIdx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === events.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(events.map((_, i) => i)));
    }
  };

  // 删除逻辑
  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      const globalIndices = Array.from(selectedIndices).map(i => offset + i);
      const result = await deleteEvents(globalIndices);
      if (result.success) {
        addToast('success', `已删除 ${result.deleted} 条事件`);
      } else {
        addToast('error', result.message || '删除失败');
      }
      setSelectedIndices(new Set());
      await load(offset, typeFilter, deviceFilter);
    } catch (err: unknown) {
      addToast('error', `删除失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  };

  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const result = await clearAllEvents();
      if (result.success) {
        addToast('success', `已清空全部 ${result.deleted} 条事件`);
      } else {
        addToast('error', result.message || '清空失败');
      }
      setSelectedIndices(new Set());
      await load(0, typeFilter, deviceFilter);
    } catch (err: unknown) {
      addToast('error', `清空失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2 bg-white/60 backdrop-blur-sm rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
        <span className="text-xs font-medium text-gray-400 mr-1 tracking-wide">类型筛选：</span>
        {EVENT_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleTypeChange(opt.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 border tracking-wide ${
              typeFilter === opt.value
                ? 'bg-black text-white border-transparent shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs font-medium text-gray-400 tracking-wide">设备：</span>
        <DeviceFilter devices={devices} value={deviceFilter} onChange={handleDeviceChange} />
      </div>

      {/* 批量操作栏（选中时显示） */}
      {selectedIndices.size > 0 && (
        <div className="flex items-center gap-3 bg-black/5 backdrop-blur-sm rounded-xl px-4 py-3 border border-black/10">
          <span className="text-sm font-semibold text-gray-800">{selectedIndices.size} 已选择</span>
          <div className="flex-1" />
          <button
            onClick={() => setSelectedIndices(new Set())}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            取消选择
          </button>
          <button
            onClick={() => setConfirmAction('delete_selected')}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            删除选中
          </button>
        </div>
      )}

      {/* 列表区域 */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100">
        {/* 列表头 */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700 tracking-wide">
              共 <span className="text-gray-900">{total}</span> 条事件
            </span>
            {events.length > 0 && (
              <Checkbox
                checked={selectedIndices.size === events.length && events.length > 0}
                onChange={toggleSelectAll}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmAction('clear_all')}
              disabled={total === 0 || isDeleting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-red-200 hover:border-red-300"
            >
              清空全部
            </button>
            <Button variant="refresh" onClick={() => load(offset, typeFilter, deviceFilter)} disabled={isLoading}>
              刷新
            </Button>
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-gray-500">加载中...</p>
            </div>
          ) : error ? (
            <div className="text-center py-14">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-red-50 rounded-full mb-4">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <Button variant="secondary" onClick={() => load(offset, typeFilter, deviceFilter)}>重试</Button>
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              title="暂无事件"
              description={typeFilter ? `没有"${typeFilter}"类型的事件记录` : '等待 Agent 推送新事件'}
              icon={
                <svg className="w-7 h-7 text-gray-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              }
            />
          ) : (
            <div className="space-y-2">
              {events.map((event, idx) => (
                <EventRow
                  key={`${event.event_name}-${event.timestamp}-${idx}`}
                  event={event}
                  selected={selectedIndices.has(idx)}
                  onToggleSelect={() => toggleSelect(idx)}
                  onClick={() => setSelectedEvent(event)}
                  deviceNameMap={deviceNameMap}
                />
              ))}
            </div>
          )}
        </div>

        {/* 分页控件 */}
        {!isLoading && !error && total > PAGE_SIZE && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              第 {currentPage} / {totalPages} 页，共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={offset === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← 上一页
              </button>
              <button
                onClick={handleNext}
                disabled={!hasMore}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页 →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 事件详情弹窗 */}
      {selectedEvent && (
        <EventDetailModal event={selectedEvent} deviceNameMap={deviceNameMap} onClose={() => setSelectedEvent(null)} />
      )}

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === 'clear_all' ? '清空全部事件' : '删除选中事件'}
        message={
          confirmAction === 'clear_all'
            ? `确认清空全部 ${total} 条事件记录？此操作不可撤销。`
            : `确认删除选中的 ${selectedIndices.size} 条事件记录？此操作不可撤销。`
        }
        confirmText="删除"
        danger
        onConfirm={confirmAction === 'clear_all' ? handleClearAll : handleDeleteSelected}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// ─── 子组件：单条事件行 ────────────────────────────────────────────────────────

interface EventRowProps {
  event: Event;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  deviceNameMap: Map<string, string>;
}

function EventRow({ event, selected, onToggleSelect, onClick, deviceNameMap }: EventRowProps) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center justify-between p-4 rounded-xl hover:shadow-md transition-all duration-200 border cursor-pointer ${
        selected
          ? 'bg-black/5 border-black/20'
          : 'bg-gradient-to-r from-gray-50 to-white border-gray-100 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* 选择复选框 */}
        <Checkbox checked={selected} onChange={onToggleSelect} />

        {/* 左侧图标 */}
        <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-slate-100 to-gray-200 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
          <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
          </svg>
        </div>

        {/* 名称 + 类型 + 时间 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900 truncate group-hover:text-slate-700 transition-colors text-sm">
              {event.event_name}
            </p>
            <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
              {event.event_type}
            </span>
            <DeviceTag jti={event.jti} deviceNameMap={deviceNameMap} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatRelativeTime(event.timestamp)}
          </p>
        </div>
      </div>

      {/* 右侧：风险等级 + 通知状态 */}
      <div className="flex-shrink-0 flex items-center gap-2 ml-3">
        {event.notified && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-2.83-2h5.66A3 3 0 0110 18z" />
            </svg>
            已通知
          </span>
        )}
        {event.risk_level && <StatusBadge status={event.risk_level} />}
        {/* 展开箭头 */}
        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

// ─── 子组件：访问日志 Tab ──────────────────────────────────────────────────────

function AccessLogsTab({ addToast, devices, deviceNameMap }: { addToast: (type: ToastItem['type'], msg: string) => void; devices: Device[]; deviceNameMap: Map<string, string> }) {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'delete_selected' | 'clear_all' | null>(null);

  const load = useCallback(async (newOffset: number, newDevice: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAccessLogs(PAGE_SIZE, newOffset, newDevice || undefined);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setHasMore(data.has_more || false);
      setOffset(newOffset);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0, deviceFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrev = () => {
    setSelectedIds(new Set());
    load(Math.max(0, offset - PAGE_SIZE), deviceFilter);
  };
  const handleNext = () => {
    setSelectedIds(new Set());
    load(offset + PAGE_SIZE, deviceFilter);
  };

  const handleDeviceChange = (val: string) => {
    setDeviceFilter(val);
    setSelectedIds(new Set());
    load(0, val);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 选择逻辑
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === logs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map(l => l.id)));
    }
  };

  // 删除逻辑
  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAccessLogsByIds(Array.from(selectedIds));
      if (result.success) {
        addToast('success', `已删除 ${result.deleted} 条访问记录`);
      } else {
        addToast('error', result.message || '删除失败');
      }
      setSelectedIds(new Set());
      await load(offset, deviceFilter);
    } catch (err: unknown) {
      addToast('error', `删除失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  };

  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const result = await clearAllAccessLogs();
      if (result.success) {
        addToast('success', `已清空全部 ${result.deleted} 条访问记录`);
      } else {
        addToast('error', result.message || '清空失败');
      }
      setSelectedIds(new Set());
      await load(0, deviceFilter);
    } catch (err: unknown) {
      addToast('error', `清空失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 设备筛选栏 */}
      <div className="flex flex-wrap items-center gap-2 bg-white/60 backdrop-blur-sm rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
        <span className="text-xs font-medium text-gray-400 mr-1 tracking-wide">设备筛选：</span>
        <DeviceFilter devices={devices} value={deviceFilter} onChange={handleDeviceChange} />
      </div>

      {/* 批量操作栏（选中时显示） */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 backdrop-blur-sm rounded-xl px-4 py-3 border border-violet-200">
          <span className="text-sm font-semibold text-violet-800">{selectedIds.size} 已选择</span>
          <div className="flex-1" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            取消选择
          </button>
          <button
            onClick={() => setConfirmAction('delete_selected')}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            删除选中
          </button>
        </div>
      )}

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100">
        {/* 列表头 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700">
              共 <span className="text-violet-600">{total}</span> 条访问记录
            </span>
            {logs.length > 0 && (
              <Checkbox
                checked={selectedIds.size === logs.length && logs.length > 0}
                onChange={toggleSelectAll}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmAction('clear_all')}
              disabled={total === 0 || isDeleting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-red-200 hover:border-red-300"
            >
              清空全部
            </button>
            <Button variant="refresh" onClick={() => load(offset, deviceFilter)} disabled={isLoading}>
              刷新
            </Button>
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-gray-500">加载中...</p>
            </div>
          ) : error ? (
            <div className="text-center py-14">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-red-50 rounded-full mb-4">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <Button variant="secondary" onClick={() => load(offset, deviceFilter)}>重试</Button>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="暂无访问日志"
              description="当有请求进入时，访问记录将显示在这里"
              icon={
                <svg className="w-7 h-7 text-violet-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              }
            />
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <AccessLogRow
                  key={log.id}
                  log={log}
                  selected={selectedIds.has(log.id)}
                  onToggleSelect={() => toggleSelect(log.id)}
                  deviceNameMap={deviceNameMap}
                />
              ))}
            </div>
          )}
        </div>

        {/* 分页 */}
        {!isLoading && !error && total > PAGE_SIZE && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              第 {currentPage} / {totalPages} 页，共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={offset === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← 上一页
              </button>
              <button
                onClick={handleNext}
                disabled={!hasMore}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页 →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === 'clear_all' ? '清空全部访问日志' : '删除选中访问日志'}
        message={
          confirmAction === 'clear_all'
            ? `确认清空全部 ${total} 条访问记录？此操作不可撤销。`
            : `确认删除选中的 ${selectedIds.size} 条访问记录？此操作不可撤销。`
        }
        confirmText="删除"
        danger
        onConfirm={confirmAction === 'clear_all' ? handleClearAll : handleDeleteSelected}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// ─── 子组件：单条访问日志行 ────────────────────────────────────────────────────

function AccessLogRow({ log, selected, onToggleSelect, deviceNameMap }: { log: AccessLog; selected: boolean; onToggleSelect: () => void; deviceNameMap: Map<string, string> }) {
  const indicatorColor =
    log.result === 'allowed'
      ? 'bg-emerald-400'
      : log.result === 'rate_limited'
        ? 'bg-amber-400'
        : 'bg-red-400';

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 ${
      selected
        ? 'bg-violet-50 border-violet-200'
        : 'bg-gradient-to-r from-gray-50 to-white border-gray-100 hover:border-violet-200 hover:shadow-sm'
    }`}>
      {/* 选择复选框 */}
      <div className="flex-shrink-0 mt-1">
        <Checkbox checked={selected} onChange={onToggleSelect} />
      </div>

      {/* 结果指示点 */}
      <div className="flex-shrink-0 mt-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${indicatorColor}`} />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* 第一行：时间 + IP + 地区 + result badge */}
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-xs text-gray-400 font-mono">{formatDateTime(log.timestamp)}</span>
          <span className="text-xs font-semibold text-gray-800 font-mono">{log.ip}</span>
          {(log.country_name || log.region_name) && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {[log.country_name, log.region_name].filter(Boolean).join(' / ')}
            </span>
          )}
          <StatusBadge status={log.result} />
          <DeviceTag jti={log.jti} deviceNameMap={deviceNameMap} />
        </div>

        {/* 第二行：reason + UA */}
        <div className="flex flex-col gap-0.5">
          {log.reason && (
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">原因：</span>
              {log.reason}
            </p>
          )}
          {log.user_agent && (
            <p className="text-xs text-gray-400 truncate">
              <span className="font-medium text-gray-500">UA：</span>
              {log.user_agent}
            </p>
          )}
          {log.event_name && (
            <p className="text-xs text-gray-600">
              <span className="font-medium">关联事件：</span>
              {log.event_name}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 主页面组件 ────────────────────────────────────────────────────────────────

type TabKey = 'events' | 'access-logs';

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('events');
  const { toasts, addToast, removeToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    getDevices().then(setDevices).catch(() => { /* 设备列表加载失败不阻断日志查看 */ });
  }, []);

  const deviceNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of devices) m.set(d.jti, d.device_name);
    return m;
  }, [devices]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    {
      key: 'events',
      label: '事件流',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      ),
    },
    {
      key: 'access-logs',
      label: '访问日志',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 页头 */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
          事件流
        </h1>
        <p className="text-gray-600 tracking-wide">查看 Agent 推送的事件记录与风控访问日志</p>
      </div>

      {/* Tab 导航 */}
      <div className="flex items-center gap-1 bg-white/60 backdrop-blur-sm rounded-xl p-1 border border-gray-100 shadow-sm mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 tracking-wide ${
              activeTab === tab.key
                ? 'bg-black text-white shadow-md'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'events' ? <EventsTab addToast={addToast} devices={devices} deviceNameMap={deviceNameMap} /> : <AccessLogsTab addToast={addToast} devices={devices} deviceNameMap={deviceNameMap} />}

      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
