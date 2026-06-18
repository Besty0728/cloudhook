/**
 * 密码哈希工具
 * 用于前端密码预哈希，防止明文传输
 */

/**
 * 使用 SHA-256 哈希密码
 * @param password 明文密码
 * @returns 十六进制哈希字符串
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // 转换为十六进制字符串
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex;
}

/**
 * 生成用于敏感操作的二次验证哈希
 * 在密码哈希基础上加盐再哈希，用于写操作验证
 * @param passwordHash 密码的第一次哈希
 * @param salt 盐值（通常使用时间戳或操作标识）
 * @returns 二次哈希字符串
 */
export async function hashWithSalt(passwordHash: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passwordHash + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex;
}
