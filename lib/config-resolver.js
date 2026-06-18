/**
 * CloudHook - 配置解析器
 * 支持 KV + 环境变量双模式
 * 优先级：KV → 本地缓存 → 环境变量 → 默认值
 */

import { getDefaultConfig } from './message-builder.js';

export class ConfigResolver {
  constructor(env, kv = null) {
    this.env = env;
    this.kv = kv;
    this.cache = new Map(); // 内存缓存
  }

  /**
   * 获取用户配置
   * @param {string} userId - 用户 ID
   * @returns {Promise<object>} 配置对象
   */
  async getUserConfig(userId) {
    // 1. 尝试从 KV 读取
    if (this.kv) {
      try {
        const json = await this.kv.get(`user_${userId}_config`);
        if (json) {
          const config = JSON.parse(json);
          // 更新缓存
          this.cache.set(userId, config);
          return config;
        }
      } catch (error) {
        console.warn('[ConfigResolver] KV read failed, falling back:', error.message);
      }
    }

    // 2. 尝试从缓存读取
    if (this.cache.has(userId)) {
      console.log('[ConfigResolver] Using cached config for user:', userId);
      return this.cache.get(userId);
    }

    // 3. 尝试从环境变量读取（单用户模式）
    if (this.env.USER_CONFIG_JSON) {
      try {
        const config = JSON.parse(this.env.USER_CONFIG_JSON);
        console.log('[ConfigResolver] Loaded config from environment variable');
        // 缓存环境变量配置
        this.cache.set(userId, config);
        return config;
      } catch (error) {
        console.error('[ConfigResolver] Invalid USER_CONFIG_JSON:', error.message);
      }
    }

    // 4. 返回默认配置
    console.log('[ConfigResolver] Using default config for user:', userId);
    const defaultConfig = getDefaultConfig();
    return defaultConfig;
  }

  /**
   * 保存用户配置
   * @param {string} userId - 用户 ID
   * @param {object} config - 配置对象
   * @returns {Promise<{success: boolean, source: string, message?: string}>}
   */
  async saveUserConfig(userId, config) {
    // 1. 尝试保存到 KV
    if (this.kv) {
      try {
        await this.kv.put(`user_${userId}_config`, JSON.stringify(config));
        // 同步更新缓存
        this.cache.set(userId, config);
        console.log('[ConfigResolver] Config saved to KV for user:', userId);
        return {
          success: true,
          source: 'kv',
          message: 'Configuration saved successfully'
        };
      } catch (error) {
        console.warn('[ConfigResolver] KV save failed:', error.message);
      }
    }

    // 2. KV 不可用时，仅更新缓存
    this.cache.set(userId, config);
    console.warn('[ConfigResolver] Config saved to cache only (KV unavailable)');
    return {
      success: false,
      source: 'cache',
      message: 'Configuration saved to cache only. Enable KV for persistence across sessions.'
    };
  }

  /**
   * 检查 KV 是否可用
   * @returns {boolean}
   */
  isKVAvailable() {
    return this.kv !== null && this.kv !== undefined;
  }

  /**
   * 清除缓存（用于测试或重置）
   * @param {string} [userId] - 可选的用户 ID，不提供则清除所有缓存
   */
  clearCache(userId = null) {
    if (userId) {
      this.cache.delete(userId);
      console.log('[ConfigResolver] Cache cleared for user:', userId);
    } else {
      this.cache.clear();
      console.log('[ConfigResolver] All cache cleared');
    }
  }
}
