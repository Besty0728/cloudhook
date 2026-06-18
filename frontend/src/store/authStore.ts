/**
 * 全局认证状态管理
 * 使用 Zustand + localStorage 持久化
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  isLoggedIn: boolean;
  setToken: (token: string, passwordHash?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      isLoggedIn: false,

      setToken: (token: string, passwordHash?: string) => {
        localStorage.setItem('token', token);
        if (passwordHash) {
          // 存储密码哈希，用于后续的写操作验证
          localStorage.setItem('password_hash', passwordHash);
        }
        set({ token, isLoggedIn: true });
      },

      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('password_hash');
        set({ token: null, isLoggedIn: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, isLoggedIn: state.isLoggedIn }),
    }
  )
);
