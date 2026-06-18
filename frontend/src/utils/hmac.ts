/**
 * HMAC-SHA256 签名生成
 * 用于需要签名的 API 请求（PUT /api/config, DELETE /api/token）
 */

export async function hmacSignature(
  method: string,
  path: string,
  body: any,
  secret: string
): Promise<{ timestamp: string; signature: string }> {
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const message = `${timestamp}${method}${path}${bodyStr}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );

  const hexSignature = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { timestamp, signature: hexSignature };
}
