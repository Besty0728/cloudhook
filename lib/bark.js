/**
 * CloudHook - Bark 推送封装
 * 发送通知到 Bark API
 *
 * 采用官方推荐的 POST JSON 方式（POST /{key}，参数放 body）：
 * 相比路径式 GET /{key}/{title}/{body}，JSON body 对中文、换行、特殊字符
 * 无需 URL 编码，避免内容被服务端误处理（返回 200 却实际未送达）。
 * 参考：https://github.com/Finb/Bark/blob/master/docs/en-us/tutorial.md
 *       https://github.com/Finb/bark-server/blob/master/docs/API_V2.md
 */

/**
 * 带超时的 fetch（不依赖 AbortSignal.timeout，兼容性更好）
 */
async function fetchWithTimeout(url, init, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 推送通知到 Bark
 * @param {string} barkKey - Bark Key
 * @param {string} barkServer - Bark 服务器地址
 * @param {string} title - 通知标题
 * @param {string} body - 通知内容
 * @param {object} options - 额外选项
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function pushBark(
  barkKey,
  barkServer = 'https://api.day.app',
  title,
  body,
  options = {}
) {
  // 验证参数
  if (!barkKey || barkKey === 'YOUR_BARK_KEY') {
    console.warn('[CloudHook] Bark key not configured, skipping push');
    return { success: false, message: 'Bark key not configured' };
  }

  if (!title || !body) {
    console.warn('[CloudHook] Title or body missing, skipping push');
    return { success: false, message: 'Title or body missing' };
  }

  try {
    const server = barkServer.replace(/\/$/, ''); // 移除末尾斜杠
    const endpoint = `${server}/${encodeURIComponent(barkKey)}`;

    // 组装 JSON body（参数名遵循 Bark API：title/body/group/level/sound/icon/url）
    const payload = {
      title,
      body,
      group: options.group || 'CloudHook',
      level: options.level || 'timeSensitive'
    };
    if (options.sound) payload.sound = options.sound;
    if (options.icon) payload.icon = options.icon;
    if (options.url) payload.url = options.url;

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'CloudHook/1.0'
      },
      body: JSON.stringify(payload)
    });

    // 无论 2xx 与否，都读出文本用于诊断（Bark 错误信息在 body 里）
    const rawText = await response.text();

    if (!response.ok) {
      console.error(`[CloudHook] Bark API error (${response.status}):`, rawText);
      return {
        success: false,
        message: `Bark 返回 HTTP ${response.status}：${rawText || '(空响应)'}`
      };
    }

    // 解析 JSON 响应；Bark 成功时返回 { code: 200, message: "success", ... }
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      // 非 JSON 响应：当作异常处理，把原文透传出来
      return {
        success: false,
        message: `Bark 返回非预期响应：${rawText || '(空响应)'}`
      };
    }

    if (result.code === 200) {
      return { success: true, message: result.message || 'Notification sent successfully' };
    }

    console.error('[CloudHook] Bark API returned error:', result);
    return {
      success: false,
      message: `Bark 错误（code ${result.code}）：${result.message || '未知错误'}`
    };

  } catch (error) {
    console.error('[CloudHook] Bark push failed:', error);

    if (error.name === 'AbortError') {
      return { success: false, message: 'Bark 请求超时' };
    }

    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}

/**
 * 测试 Bark 推送
 * @param {string} barkKey - Bark Key
 * @param {string} barkServer - Bark 服务器地址
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testBarkPush(barkKey, barkServer = 'https://api.day.app') {
  return pushBark(
    barkKey,
    barkServer,
    'CloudHook 测试',
    'CloudHook Bark 推送测试\n如果你收到这条消息，说明配置正确！',
    { group: 'CloudHook', level: 'active' }
  );
}
