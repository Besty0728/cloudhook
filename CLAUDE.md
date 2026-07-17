# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

CloudHook — Claude Code 云端监控通知系统。EdgeOne Pages 全栈部署：边缘函数接收 Claude Code 的 HTTP Hook 事件，分类/评级后经 Bark 推送到 iPhone / Apple Watch，附带 React SPA 管理界面。单用户系统（userId 固定 `'default'`）。

## 常用命令

```bash
npm run dev          # 一键本地开发：Mock API(:8787) + Vite(:3000)，自动清理占用端口
npm run mock         # 仅启动 Mock API 服务器（scripts/dev-mock.mjs）
npm run build        # 构建前端到 public/（即 EdgeOne 部署的产物目录）
cd frontend && npm run lint   # ESLint
```

- 本地开发默认密码 `admin`，可在 `frontend/.env.local` 用 `DEV_PASSWORD_HASH` / `DEV_PASSWORD` 覆盖
- `scripts/test-*.mjs` 为手动冒烟脚本（API 流程、Bark 推送、开发登录）
- 无自动化测试框架（`npm test` 是占位）

## 关键架构约束

### 1. 共享代码双份维护（最重要的坑）

- `lib/*.js` — 本地 Mock 服务器（`scripts/dev-mock.mjs`）import 的源模块
- `edge-functions/_shared.js` — 部署用的**自包含打包版**，因为 EdgeOne 运行时无法解析 `edge-functions/` 目录之外的 import
- **修改 `lib/` 中任何共享逻辑，必须同步改 `_shared.js` 对应段落**（security / kv-store / risk / bark / classifier / message-builder 六段），否则本地与线上行为不一致

### 2. EdgeOne 平台约束（代码中大量 workaround 的根源）

- **KV 绑定是全局变量注入**（如 `cloudhook_kv`），不是 `env.KV`；一律通过 `resolveKv(env)` 获取（探测 globalThis 候选名再查 env）
- **KV key 只允许字母/数字/下划线**（不能含冒号等），所有 key 用 `user_{uid}_xxx` 格式
- **5xx 会被平台 HTML 错误页覆盖**导致诊断信息丢失 → API 一律返回 HTTP 200，用 `body.success` 表达结果
- **WAF 拦截源码中的字面量 `PermissionRequest`**（会 545）→ 用 `String.fromCharCode` 动态构建
- `console.log` 上限 20 次/执行
- `context.waitUntil` 行为有运行时差异 → 用 `safeWaitUntil()` 封装

### 3. 认证与设备模型

- Token 为**无状态 HMAC-SHA256 签名**：`base64url(payload).hex(sig)`，`verifyAuthToken` 只验签名 + exp（exp=0 为永久），不查 KV
- 吊销靠 KV 黑名单 `revoked_{jti}`（key 经 `revokedKey()` 剥离连字符等非法字符）
- **管理端点一律用 `requireAuth(request, env)` 鉴权**（验签 + 吊销检查）：吊销名单不可读时 fail-closed 返回 503；hook/notify 通知链路直接调 `isTokenRevoked`，KV 异常时 fail-open 保推送可用性
- 敏感写操作（撤销设备、改配置、揭示 Token）额外要求 `X-Password-Hash` 头（前端已对密码做 SHA-256）
- **Token 是确定性可重算的**：注册表存 `iat/exp/jti/device_name`，用相同字段重签即得原文——这是「查看 Token」功能的原理，也意味着改设备名不影响已签发 Token
- 设备指纹 = 前端对跨浏览器稳定属性（platform/screen/timezone/CPU 核数等，不含 UA/WebGL）的 SHA-256 哈希（`frontend/src/utils/deviceId.ts`），登录时指纹命中则复用既有 jti 去重；权衡：两台配置完全相同的机器会被视为同一设备

### 4. Hook 事件处理流水线（hook.js）

解析（`parseEvent` 限量提取字符串，2000 节点/8KB 上限）→ `classify` 分类（permission_required / attention_required / task_done / turn_paused / info）→ `getRiskLevel` 风险评级 → `buildMessage` 构建文案 → `safeWaitUntil` 异步推 Bark + 写日志 → 立即返回 200。

- `Stop` 事件按 `background_tasks` 数组（Claude Code v2.1.145+）区分：非空 → `turn_paused`（只记日志不推送），空/缺失 → `task_done`
- 事件日志滚动保留 100 条、访问日志 200 条；`user_{uid}_event_count` 是独立累计计数器，清空日志不影响它

### 5. 目录结构

```
edge-functions/     # 后端（Cloudflare Workers 风格，onRequest{Get,Post,...} 导出）
  _middleware.js    # 全局 CORS/安全头/错误兜底
  _shared.js        # 自包含共享模块（见约束 1）
  api/hook.js       # 主 Webhook（notify.js 是备用别名）
  api/token.js + api/token/[jti].js   # 登录签发 / 设备管理（动态路由）
  api/config.js + api/config/test.js  # 配置读写 / Bark 测试推送
  api/events.js, api/access-logs.js   # 日志查询与删除
lib/                # 共享模块源码（本地 mock 用）
frontend/           # React 19 + Vite 8 + Zustand + Tailwind，构建到 public/
public/             # 构建产物 = EdgeOne 输出目录（勿手改）
scripts/            # dev/mock/冒烟脚本
```

### 6. 部署

EdgeOne Pages 连接 Git 仓库，输出目录 `public`，函数目录 `edge-functions`（见 `edgeone.json`）。必需环境变量：`HMAC_SECRET`（签名）、`ENCRYPTION_KEY`（Bark Key 加密存储）、`MASTER_PASSWORD_HASH` 或 `MASTER_PASSWORD`（登录）。KV 命名空间绑定变量名须为 `cloudhook_kv` 或 `KV`。详见 `docs/SETUP.md`。
