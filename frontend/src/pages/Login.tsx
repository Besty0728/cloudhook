import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { login, getSetupStatus } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Toast from '@/components/Toast';
import { hashPassword } from '@/utils/passwordHash';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const { setToken } = useAuthStore();
  const { toasts, removeToast, success, error } = useToast();

  const [masterPassword, setMasterPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 服务端是否已配置 MASTER_PASSWORD；false 时提示部署者先配置环境变量
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    getSetupStatus().then((status) => setConfigured(status.configured));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!masterPassword.trim()) {
      error('请输入 Master Password');
      return;
    }

    setIsLoading(true);

    try {
      // 前端预哈希密码，防止明文传输
      const passwordHash = await hashPassword(masterPassword);

      const response = await login(passwordHash);
      // 无状态签名 token 签发后立即有效，无需等待 KV 同步
      // 存储密码哈希用于后续的写操作验证
      setToken(response.token, passwordHash);
      success('登录成功！');
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      const message = err.response?.data?.message || err.response?.data?.error || err.message || '登录失败';
      error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}

      <div className="login-box">
        <p>CloudHook</p>

        {configured === false && (
          <span className="setup-hint">
            服务端尚未配置 MASTER_PASSWORD，请先在 EdgeOne 控制台设置环境变量后重新部署
          </span>
        )}

        <form onSubmit={handleSubmit}>
          <div className="user-box">
            <input
              required
              type={showPassword ? 'text' : 'password'}
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              disabled={isLoading}
            />
            <label>Master Password</label>
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <button type="submit" className="submit-btn" disabled={isLoading}>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="footer-hint">AI Agent 云端监控哨兵</p>
      </div>
    </div>
  );
}
