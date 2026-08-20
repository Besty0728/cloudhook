/**
 * 仪表板页面（轻质中性 stat tile 版）
 *
 * 统计卡遵循 stat tile 规范：白卡 + 色点强调 + 大数字（正文同款无衬线），
 * 文字一律用文本色（灰阶），色彩只出现在小色点上；「总事件数」为本视图唯一 hero 数字。
 */

import { useEffect, useState } from 'react';
import { getEvents } from '@/api/events';
import { Event } from '@/types/api';
import { formatRelativeTime, getRiskLevelColor, getRiskLevelText } from '@/utils/format';
import LoadingSpinner from '@/components/LoadingSpinner';

/** 来源显示名（与 EventsPage 的 AGENT_LABEL 一致） */
const AGENT_LABEL: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  antigravity: 'Antigravity',
  kimi_code: 'Kimi Code',
  unknown: '其他智能体',
};

/** 来源色点（与 EventsPage 徽章配色一致：琥珀/翠绿/天蓝/紫/灰） */
const AGENT_DOT: Record<string, string> = {
  claude_code: 'bg-amber-400',
  codex: 'bg-emerald-400',
  antigravity: 'bg-sky-400',
  kimi_code: 'bg-violet-400',
  unknown: 'bg-gray-300',
};

/** 轻质中性统计卡：label + 色点 → 数值 → 弱化说明 */
function StatTile({
  label,
  dotClass,
  value,
  caption,
  hero = false,
}: {
  label: string;
  dotClass: string;
  value: string;
  caption: string;
  hero?: boolean;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <p className="text-sm text-gray-500 font-medium tracking-wide">{label}</p>
      </div>
      <p
        className={`font-semibold text-gray-900 tracking-tight truncate ${
          hero ? 'text-5xl' : 'text-3xl'
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-2 tracking-wide">{caption}</p>
    </div>
  );
}

export default function Dashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      setIsLoading(true);
      const data = await getEvents(10, 0);
      setEvents(data.events || []);
      // 累计接收数（旧后端无此字段时退回滚动窗口条数）
      setTotal(data.total_received ?? data.total ?? 0);
    } catch (err) {
      console.error('Failed to load events:', err);
      const e = err as { message?: string };
      setError(e.message || '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  // 计算今日事件数
  const todayEvents = events.filter((e) => {
    const eventDate = new Date(e.timestamp).toDateString();
    const today = new Date().toDateString();
    return eventDate === today;
  }).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
          仪表板
        </h1>
        <p className="text-gray-600 tracking-wide">实时监控 AI Agent 运行状态</p>
      </div>

      {/* 统计卡（stat tiles）：hero 数字唯一，色彩仅点缀 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatTile
          label="总事件数"
          dotClass="bg-gray-900"
          value={total.toLocaleString()}
          caption="累计接收事件"
          hero
        />
        <StatTile
          label="今日事件"
          dotClass="bg-emerald-500"
          value={todayEvents.toLocaleString()}
          caption="今天已处理"
        />
        <StatTile
          label="最近事件"
          dotClass="bg-amber-500"
          value={events[0]?.event_name || '—'}
          caption={events[0] ? formatRelativeTime(events[0].timestamp) : '暂无活动'}
        />
      </div>

      {/* 最近事件列表 */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200">
        <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 tracking-tight">最近事件</h2>
            </div>
            <span className="text-sm text-gray-500 tracking-wide">实时更新</span>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center">
              <LoadingSpinner size="lg" />
              <p className="mt-4 text-gray-500 tracking-wide">加载中...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 mb-4 tracking-wide">{error}</p>
              <button
                onClick={loadEvents}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors tracking-wide"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重试
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-gray-500 tracking-wide">暂无事件</p>
              <p className="text-sm text-gray-400 mt-2 tracking-wide">等待 Agent 推送新事件</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event, index) => (
                <div
                  key={index}
                  className="group flex items-center justify-between px-4 py-3.5 bg-gray-50/70 rounded-xl border border-gray-100 hover:border-gray-300 hover:bg-white hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-gray-500" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate tracking-tight">
                        {event.event_name}
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-2 mt-0.5 tracking-wide">
                        <span>{formatRelativeTime(event.timestamp)}</span>
                        {event.agent ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                            <span className={`w-1.5 h-1.5 rounded-full ${AGENT_DOT[event.agent] || 'bg-gray-300'}`} />
                            {AGENT_LABEL[event.agent] || event.agent}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <span
                      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${getRiskLevelColor(
                        event.risk_level
                      )} shadow-sm tracking-wide`}
                    >
                      {getRiskLevelText(event.risk_level)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
