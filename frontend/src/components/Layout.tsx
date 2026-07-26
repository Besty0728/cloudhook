/**
 * 主布局组件（优雅中性配色版）
 *
 * 改动：
 *  - 使用 ExpandableTabs 替换顶部导航
 *  - 移除蓝色主题，改用中性优雅色调
 *  - 优化字体间距和排版
 *  - 保留 ClickSpark 全局动效
 */

import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import {
  Home,
  Settings,
  Clock,
  Key,
  LogOut,
  Activity,
} from 'lucide-react';
import ClickSpark from '@/components/ui/ClickSpark';
import { ExpandableTabs } from '@/components/ui/expandable-tabs';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const tabs = [
    { title: '仪表板', icon: Home },
    { title: '配置', icon: Settings },
    { type: 'separator' as const },
    { title: 'Hooks', icon: Clock },
    { title: '事件流', icon: Activity },
    { title: 'Token', icon: Key },
  ];

  const handleTabChange = (index: number | null) => {
    if (index === null) return;
    // 注意：paths 数组要和 tabs 数组对齐，separator 位置用 null 占位
    const paths = ['/dashboard', '/config', null, '/hooks', '/events', '/tokens'];
    const targetPath = paths[index];
    if (targetPath) navigate(targetPath);
  };

  return (
    <ClickSpark sparkColor="#6b7280" sparkRadius={20} sparkCount={10} duration={500}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-50">

        {/* ── 顶部导航栏 ── */}
        <nav className="bg-white/70 backdrop-blur-xl shadow-sm border-b border-gray-200/60 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">

              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-gray-900">
                    CloudHook
                  </h1>
                  <p className="text-xs text-gray-500 -mt-0.5 tracking-wide">AI Agent 监控</p>
                </div>
              </div>

              {/* 桌面端可展开导航 */}
              <div className="hidden md:flex items-center">
                <ExpandableTabs
                  tabs={tabs}
                  activeColor="text-gray-900"
                  onChange={handleTabChange}
                />
              </div>

              {/* 登出按钮 */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white/70 border border-gray-300 shadow-sm hover:text-gray-900 hover:bg-gray-100 hover:border-gray-400 active:scale-[0.97] rounded-xl transition-all duration-200"
                aria-label="登出"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">登出</span>
              </button>
            </div>
          </div>
        </nav>

        {/* ── 移动端底部导航栏 ── */}
        <div className="md:hidden bg-white/90 backdrop-blur-sm border-b border-gray-200/60">
          <div className="flex overflow-x-auto scrollbar-hide">
            {[
              { path: '/dashboard', label: '仪表板', icon: Home },
              { path: '/config', label: '配置', icon: Settings },
              { path: '/hooks', label: 'Hooks', icon: Clock },
              { path: '/events', label: '事件流', icon: Activity },
              { path: '/tokens', label: 'Token', icon: Key },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={[
                    'relative flex flex-col items-center gap-1 px-5 py-3 text-xs font-medium whitespace-nowrap',
                    'transition-colors duration-150',
                    isActive
                      ? 'text-gray-900'
                      : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  <Icon size={20} />
                  <span className="tracking-wide">{item.label}</span>
                  {/* 激活指示线 */}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gray-900" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 主内容区 ── */}
        <main className="max-w-7xl mx-auto py-6 pb-16 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </ClickSpark>
  );
}
