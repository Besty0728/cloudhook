/**
 * 密码验证弹窗全局状态管理
 * 提供自动弹窗获取密码验证的能力
 */

import { create } from 'zustand';

interface HmacSecretState {
  /** 弹窗是否显示 */
  modalOpen: boolean;
  /** 当前等待密码的 Promise resolve 回调队列 */
  resolvers: Array<(password: string | null) => void>;
  /** 打开弹窗并返回 Promise，等待用户输入 */
  prompt: () => Promise<string | null>;
  /** 提交密码（用户输入后调用） */
  submit: (password: string) => void;
  /** 取消输入 */
  cancel: () => void;
}

export const useHmacSecretStore = create<HmacSecretState>((set, get) => ({
  modalOpen: false,
  resolvers: [],

  prompt: () => {
    return new Promise<string | null>((resolve) => {
      set((state) => ({
        modalOpen: true,
        resolvers: [...state.resolvers, resolve],
      }));
    });
  },

  submit: (password: string) => {
    const { resolvers } = get();
    // resolve 所有等待的 Promise，返回密码明文（调用方会自行哈希）
    resolvers.forEach((resolve) => resolve(password));
    set({ modalOpen: false, resolvers: [] });
  },

  cancel: () => {
    const { resolvers } = get();
    // 取消时 resolve 为 null
    resolvers.forEach((resolve) => resolve(null));
    set({ modalOpen: false, resolvers: [] });
  },
}));
