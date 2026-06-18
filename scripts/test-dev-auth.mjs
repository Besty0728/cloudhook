#!/usr/bin/env node
/**
 * 测试本地开发环境认证流程
 * 验证前端密码哈希 + Mock 服务器验证是否匹配
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function sha256Hex(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

function loadDevAuth() {
  const result = { password: 'admin', passwordHash: '' };
  try {
    const envPath = join(__dir, '..', 'frontend', '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    const hashMatch = content.match(/^DEV_PASSWORD_HASH=(.+)$/m);
    const plainMatch = content.match(/^DEV_PASSWORD=(.+)$/m);
    if (hashMatch) result.passwordHash = hashMatch[1].trim().toLowerCase();
    if (plainMatch) result.password = plainMatch[1].trim();
  } catch {
    console.log('⚠️  未找到 .env.local，使用默认密码: admin');
  }
  return result;
}

console.log('🔐 CloudHook 本地开发认证测试\n');

const config = loadDevAuth();
const expectedHash = config.passwordHash || sha256Hex(config.password);

console.log('📋 配置信息:');
if (config.passwordHash) {
  console.log(`   配置方式: DEV_PASSWORD_HASH（预哈希）`);
  console.log(`   哈希值: ${config.passwordHash}`);
} else {
  console.log(`   配置方式: DEV_PASSWORD（明文，默认）`);
  console.log(`   明文密码: ${config.password}`);
  console.log(`   计算哈希: ${expectedHash}`);
}

console.log('\n🧪 模拟前端登录流程:');
console.log(`   1. 用户输入明文密码: ${config.password || '(从 HASH 推导，不可逆)'}`);
const frontendHash = sha256Hex(config.password);
console.log(`   2. 前端 SHA-256 哈希: ${frontendHash}`);
console.log(`   3. 发送到后端: POST /api/token { master_password: "${frontendHash}" }`);

console.log('\n✅ 后端验证结果:');
const isValid = frontendHash.toLowerCase() === expectedHash.toLowerCase();
if (isValid) {
  console.log(`   ✓ 密码哈希匹配！`);
  console.log(`   ✓ 前端哈希: ${frontendHash}`);
  console.log(`   ✓ 后端期望: ${expectedHash}`);
} else {
  console.log(`   ✗ 密码哈希不匹配！`);
  console.log(`   ✗ 前端哈希: ${frontendHash}`);
  console.log(`   ✗ 后端期望: ${expectedHash}`);
}

console.log('\n📝 生成其他密码的哈希:');
console.log(`   node -e "console.log(require('crypto').createHash('sha256').update('your_password').digest('hex'))"`);
console.log('');
