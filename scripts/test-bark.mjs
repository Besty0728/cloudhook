#!/usr/bin/env node
/**
 * Bark 推送诊断脚本（绕过 CloudHook 整个系统，直接打真实 Bark API）
 *
 * 用途：区分「Bark key/设备本身的问题」还是「CloudHook 代码的问题」。
 * 同时用三种方式发送，把每种的真实响应完整打印出来对比。
 *
 * 用法：
 *   node scripts/test-bark.mjs <你的BarkKey> [服务器地址]
 *   node scripts/test-bark.mjs abcd1234xxxx
 *   node scripts/test-bark.mjs abcd1234xxxx https://api.day.app
 */

import { pushBark } from '../lib/bark.js';

const barkKey = process.argv[2];
const barkServer = process.argv[3] || 'https://api.day.app';

if (!barkKey) {
  console.error('\x1b[31m错误：缺少 Bark Key\x1b[0m');
  console.error('用法：node scripts/test-bark.mjs <你的BarkKey> [服务器地址]');
  process.exit(1);
}

const server = barkServer.replace(/\/$/, '');
console.log('\n========================================');
console.log('  Bark 推送诊断');
console.log('========================================');
console.log(`服务器：${server}`);
console.log(`Key：   ${barkKey.slice(0, 4)}****${barkKey.slice(-4)}（长度 ${barkKey.length}）`);
console.log('');

// ── 方式 1：CloudHook 当前实现（POST JSON）────────────────────────────────
async function testCloudHookImpl() {
  console.log('\x1b[36m[方式1] CloudHook 当前实现（pushBark / POST JSON）\x1b[0m');
  const result = await pushBark(
    barkKey,
    server,
    '诊断测试 1',
    'POST JSON 方式\n这是 CloudHook 实际使用的推送实现',
    { group: 'CloudHook诊断' }
  );
  console.log('  结果：', JSON.stringify(result));
  console.log('');
}

// ── 方式 2：纯英文 + 路径式 GET（最原始、兼容性最好）──────────────────────
async function testSimpleGet() {
  console.log('\x1b[36m[方式2] 纯英文 + 路径式 GET（最简单，排除编码问题）\x1b[0m');
  const url = `${server}/${barkKey}/CloudHook/Hello%20from%20diagnostic`;
  console.log('  URL：', url);
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    console.log(`  HTTP ${resp.status}：${text}`);
  } catch (err) {
    console.log('  \x1b[31m请求异常：\x1b[0m', err.message);
  }
  console.log('');
}

// ── 方式 3：POST JSON 用 /push 端点 + device_key（官方 V2 推荐）──────────────
async function testV2Push() {
  console.log('\x1b[36m[方式3] POST /push + device_key（官方 V2）\x1b[0m');
  const url = `${server}/push`;
  console.log('  URL：', url);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        device_key: barkKey,
        title: '诊断测试 3',
        body: 'V2 /push 端点\ndevice_key 放 body',
        group: 'CloudHook诊断',
      }),
    });
    const text = await resp.text();
    console.log(`  HTTP ${resp.status}：${text}`);
  } catch (err) {
    console.log('  \x1b[31m请求异常：\x1b[0m', err.message);
  }
  console.log('');
}

await testSimpleGet();
await testCloudHookImpl();
await testV2Push();

console.log('========================================');
console.log('  诊断完成');
console.log('========================================');
console.log('判读：');
console.log('  • 三种都返回 code:200 但手机都收不到');
console.log('      → 问题在 Bark key 或设备（key 过期/通知权限/App 未登录）');
console.log('      → 验证：浏览器直接访问 方式2 的 URL，看手机是否响');
console.log('  • 某些方式收到、某些收不到');
console.log('      → 是编码/端点问题，告诉我哪种收到了');
console.log('  • 出现非 200 或请求异常');
console.log('      → 把上面的 HTTP 状态码和响应文本发我');
console.log('');
