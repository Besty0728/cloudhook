/**
 * CloudHook API 客户端
 * 包含 Token 自动注入和 401 错误处理
 */

import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// 请求拦截器：自动添加 Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers['X-CloudHook-Token'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：处理 401 错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效：清除登录态。
      // 用 store 的 logout 触发 SPA 内重渲染（ProtectedRoute 会跳转登录页），
      // 避免 window.location 整页刷新造成的「闪退」观感。
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

/**
 * 密码验证请求（用于 PUT/DELETE 等写操作）
 * 使用 Token + 密码哈希进行双重验证
 */
export async function authenticatedRequest<T = any>(
  method: string,
  path: string,
  data?: any
): Promise<T> {
  // 开发环境使用 mock 密码哈希
  const passwordHash =
    localStorage.getItem('password_hash') ||
    (import.meta.env.DEV ? 'dev-mock-password-hash' : null);

  // 生产环境缺少密码哈希时，自动弹出输入框
  if (!passwordHash && !import.meta.env.DEV) {
    // 动态导入 store 避免循环依赖
    const { useHmacSecretStore } = await import('@/store/hmacSecretStore');
    const inputPassword = await useHmacSecretStore.getState().prompt();

    // 用户取消输入
    if (!inputPassword) {
      throw new Error('Password verification is required for this operation.');
    }

    // 哈希密码并存储
    const { hashPassword } = await import('@/utils/passwordHash');
    const hashedPassword = await hashPassword(inputPassword);
    localStorage.setItem('password_hash', hashedPassword);
  }

  // 添加密码哈希到请求头
  const response = await apiClient.request({
    method,
    url: path,
    data,
    headers: {
      'X-Password-Hash': passwordHash,
    },
  });

  return response.data;
}
