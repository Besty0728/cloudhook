/**
 * 仪表板页面（中性优雅配色版）
 */

import { useEffect, useState } from 'react';
import { getEvents } from '@/api/events';
import { Event } from '@/types/api';
import { formatRelativeTime, getRiskLevelColor, getRiskLevelText } from '@/utils/format';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Dashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setIsLoading(true);
      const data = await getEvents(10, 0);
      setEvents(data.events || []);
      // 累计接收数（旧后端无此字段时退回滚动窗口条数）
      setTotal(data.total_received ?? data.total ?? 0);
    } catch (err: any) {
      console.error('Failed to load events:', err);
      setError(err.message || '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

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

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="group relative bg-black rounded-2xl p-6 text-white shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-200 text-sm font-medium tracking-wide">总事件数</p>
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-4xl font-bold mb-1 tracking-tight">{total}</p>
            <p className="text-gray-300 text-xs tracking-wide">累计接收事件</p>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-emerald-100 text-sm font-medium tracking-wide">今日事件</p>
              <svg className="w-8 h-8 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-4xl font-bold mb-1 tracking-tight">{todayEvents}</p>
            <p className="text-emerald-100 text-xs tracking-wide">今天已处理</p>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-amber-100 text-sm font-medium tracking-wide">最近事件</p>
              <svg className="w-8 h-8 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-2xl font-bold mb-1 truncate tracking-tight">
              {events[0]?.event_name || '-'}
            </p>
            <p className="text-amber-100 text-xs tracking-wide">最新活动</p>
          </div>
        </div>
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors tracking-wide"
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
            <div className="space-y-3">
              {events.map((event, index) => (
                <div
                  key={index}
                  className="group flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl hover:shadow-md transition-all duration-200 border border-gray-100 hover:border-gray-300"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-slate-100 to-gray-200 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate group-hover:text-gray-700 transition-colors tracking-tight">
                        {event.event_name}
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5 tracking-wide">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatRelativeTime(event.timestamp)}
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
