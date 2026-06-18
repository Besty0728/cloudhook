/**
 * CloudHook 前端应用主入口
 */

import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ConfigPage from './pages/ConfigPage';
import HooksPage from './pages/HooksPage';
import EventsPage from './pages/EventsPage';
import TokensPage from './pages/TokensPage';
import HmacSecretModal from './components/HmacSecretModal';

// 受保护的路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore();
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <HashRouter>
      {/* 全局 HMAC Secret 输入弹窗 */}
      <HmacSecretModal />

      <Routes>
        {/* 登录页 */}
        <Route path="/login" element={<Login />} />

        {/* 受保护的路由 */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="hooks" element={<HooksPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="tokens" element={<TokensPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
