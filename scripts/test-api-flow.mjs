#!/usr/bin/env node
/**
 * 测试完整的 API 认证流程
 * 模拟前端请求，验证 Mock 服务器响应
 */

import { createHash } from 'crypto';

function sha256(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

const API_BASE = 'http://127.0.0.1:8787';
const PASSWORD = 'admin';
const PASSWORD_HASH = sha256(PASSWORD);

console.log('🧪 CloudHook API 认证流程测试\n');
console.log(`📍 API 地址: ${API_BASE}`);
console.log(`🔐 测试密码: ${PASSWORD}`);
console.log(`🔑 密码哈希: ${PASSWORD_HASH}\n`);

async function testFlow() {
  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. 测试登录
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('1️⃣  测试登录 (POST /api/token)');
    console.log(`   请求体: { master_password: "${PASSWORD_HASH}" }`);

    const loginRes = await fetch(`${API_BASE}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_name: 'Web',
        master_password: PASSWORD_HASH,
        user_id: 'default',
      }),
    });

    if (!loginRes.ok) {
      const error = await loginRes.json();
      console.log(`   ❌ 登录失败: ${error.message || error.error}`);
      return;
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log(`   ✅ 登录成功`);
    console.log(`   Token: ${token.substring(0, 40)}...`);
    console.log('');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. 测试读操作（只需 Token）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('2️⃣  测试读操作 (GET /api/events)');
    console.log(`   请求头: Authorization: Bearer ${token.substring(0, 30)}...`);

    const eventsRes = await fetch(`${API_BASE}/api/events?limit=5`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!eventsRes.ok) {
      const error = await eventsRes.json();
      console.log(`   ❌ 读取失败: ${error.message || error.error}`);
      return;
    }

    const eventsData = await eventsRes.json();
    console.log(`   ✅ 读取成功`);
    console.log(`   事件数量: ${eventsData.events.length}`);
    console.log('');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. 测试写操作（需要 Token + 密码哈希）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('3️⃣  测试写操作 (PUT /api/config)');
    console.log(`   请求头: Authorization: Bearer {token}`);
    console.log(`   请求头: X-Password-Hash: ${PASSWORD_HASH.substring(0, 30)}...`);

    const configRes = await fetch(`${API_BASE}/api/config`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Password-Hash': PASSWORD_HASH,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bark_key: 'TEST_BARK_KEY',
      }),
    });

    if (!configRes.ok) {
      const error = await configRes.json();
      console.log(`   ❌ 更新失败: ${error.message || error.error}`);
      return;
    }

    const configData = await configRes.json();
    console.log(`   ✅ 更新成功`);
    console.log(`   消息: ${configData.message}`);
    console.log('');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. 测试查看 Token（写操作）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('4️⃣  测试查看 Token (GET /api/token/{jti})');
    const jti = loginData.jti;
    console.log(`   JTI: ${jti}`);
    console.log(`   请求头: Authorization: Bearer {token}`);
    console.log(`   请求头: X-Password-Hash: {hash}`);

    const revealRes = await fetch(`${API_BASE}/api/token/${jti}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Password-Hash': PASSWORD_HASH,
      },
    });

    if (!revealRes.ok) {
      const error = await revealRes.json();
      console.log(`   ❌ 查看失败: ${error.message || error.error}`);
      return;
    }

    const revealData = await revealRes.json();
    console.log(`   ✅ 查看成功`);
    console.log(`   设备名: ${revealData.device_name}`);
    console.log(`   Token: ${revealData.token.substring(0, 40)}...`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 所有测试通过！认证流程工作正常。');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    console.error('\n💡 确保 Mock API 服务器正在运行：');
    console.error('   node scripts/dev-mock.mjs');
  }
}

testFlow();
