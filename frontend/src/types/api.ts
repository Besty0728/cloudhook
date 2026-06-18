/**
 * CloudHook 前端类型定义
 * 严格对齐 .dev/API_CONTRACT.md
 */

export interface Config {
  bark_key: string;
  bark_server: string;
  /** persona：AI 人设配置 */
  persona: {
    enabled: boolean;
    user_name: string;
  };
  /** 风险控制：地理 / IP / 限流，契约新增段 */
  risk_control?: {
    geo: {
      enabled: boolean;
      allowed_countries: string[];
      allowed_regions: string[];
    };
    ip: {
      mode: 'off' | 'allowlist' | 'blocklist';
      allowlist: string[];
      blocklist: string[];
    };
    rate_limit: {
      enabled: boolean;
      max_per_minute: number;
    };
  };
}

/** 事件记录，新增 title / body / notified 字段 */
export interface Event {
  event_name: string;
  timestamp: string;
  event_type: string;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  title?: string;
  body?: string;
  notified?: boolean;
  /** @deprecated 旧字段，后端已移除，保留以免旧页面编译报错 */
  message?: string;
  /** @deprecated 旧字段 */
  metadata?: Record<string, unknown>;
}

/** 访问日志单条记录 */
export interface AccessLog {
  id: string;
  timestamp: string;
  ip: string;
  country_code?: string;
  country_name?: string;
  region_code?: string;
  region_name?: string;
  user_agent?: string;
  result: 'allowed' | 'denied' | 'rate_limited' | 'geo_blocked' | 'ip_blocked';
  reason?: string;
  event_name?: string;
}

/** 设备（Token）信息，对应 GET /api/token 返回的 Device 结构 */
export interface Device {
  jti: string;
  device_name: string;
  created_at: string;
  /** Token 过期时间戳（Unix秒）。0 = 永久，null = 未记录（旧设备） */
  exp?: number | null;
  last_ip?: string;
  last_seen?: string;
  is_current: boolean;
}

/** GET /api/token/{jti} 揭示设备 token 明文的返回结构 */
export interface RevealTokenResponse {
  success: boolean;
  jti: string;
  device_name: string;
  token: string;
  expires_at: string | null;
}

/** PATCH /api/token/{jti} 修改有效期的返回结构 */
export interface UpdateTtlResponse {
  success: boolean;
  jti: string;
  device_name: string;
  token: string;
  exp: number;
  expires_at: string | null;
  message?: string;
}

/** POST /api/token 创建设备签发 token 的返回结构 */
export interface CreateDeviceResponse {
  success: boolean;
  token: string;
  device_name: string;
  jti: string;
  user_id: string;
  created_at: string;
  /** Token 过期时间戳。0 = 永久 */
  exp: number;
}

/**
 * @deprecated 使用 Device 替代；保留此类型避免旧引用编译报错
 */
export interface TokenInfo {
  token_id: string;
  device_name: string;
  created_at: string;
  last_used: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  source?: 'kv' | 'cache';
}

/** GET /api/events 响应体 */
export interface EventsResponse {
  success?: boolean;
  events: Event[];
  total: number;
  has_more: boolean;
}

/** GET /api/access-logs 响应体 */
export interface AccessLogsResponse {
  success?: boolean;
  logs: AccessLog[];
  total: number;
  has_more: boolean;
}

/** GET /api/token 响应体 */
export interface DeviceListResponse {
  success: boolean;
  devices: Device[];
}

/**
 * @deprecated 使用 DeviceListResponse 替代
 */
export interface TokenListResponse {
  tokens: Record<string, TokenInfo>;
}

export interface ConfigResponse {
  success: boolean;
  config: Config;
}

/** DELETE /api/events 和 DELETE /api/access-logs 响应体 */
export interface DeleteResponse {
  success: boolean;
  deleted: number;
  remaining: number;
  error?: string;
  message?: string;
}
