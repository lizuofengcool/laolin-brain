/**
 * 内存级 API 速率限制器
 * 使用 lru-cache 实现，无需外部 Redis 服务
 * 适合个人/小团队使用，生产环境可替换为 Redis 方案
 */
import { LRUCache } from 'lru-cache';

interface RateLimitOptions {
  /** 时间窗口内允许的最大请求数 */
  maxRequests: number;
  /** 时间窗口大小（毫秒） */
  windowMs: number;
}

interface RateLimitResult {
  /** 是否允许请求 */
  success: boolean;
  /** 当前窗口内剩余可用请求数 */
  remaining: number;
  /** 重置时间（毫秒时间戳） */
  resetTime: number;
}

// 默认配置：每分钟100次请求
const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 100,
  windowMs: 60 * 1000,
};

// 不同接口的速率限制配置（匹配路径前缀，从最具体到最通用）
const ROUTE_LIMITS: [string, RateLimitOptions][] = [
  // 认证接口：严格限制防止暴力破解
  ['/api/auth/', { maxRequests: 10, windowMs: 60 * 1000 }],
  // 文件上传：适中限制（必须放在 /api/files 之前）
  ['/api/files/upload', { maxRequests: 30, windowMs: 60 * 1000 }],
  // 文件删除：严格限制防止误操作（必须放在 /api/files 之前）
  ['/api/files/import', { maxRequests: 20, windowMs: 60 * 1000 }],
  // 通用文件操作：每分钟20次
  ['/api/files', { maxRequests: 20, windowMs: 60 * 1000 }],
];

function getOptionsForPath(path: string): RateLimitOptions {
  for (const [prefix, options] of ROUTE_LIMITS) {
    if (path.startsWith(prefix)) return options;
  }
  return DEFAULT_OPTIONS;
}

// LRU 缓存：key = IP:路径前缀，value = { count, resetTime }
const limiterCache = new LRUCache<string, { count: number; resetTime: number }>({
  max: 10000, // 最多缓存10000个客户端记录
  ttl: 5 * 60 * 1000, // 记录5分钟后自动过期
});

/**
 * 检查请求是否被允许
 * @param identifier 客户端标识（通常是IP地址）
 * @param path 请求路径，用于匹配不同的限制策略
 */
export function rateLimit(identifier: string, path: string): RateLimitResult {
  const options = getOptionsForPath(path);
  const key = `${identifier}:${path.split('/').slice(0, 4).join('/')}`;
  const now = Date.now();

  // 获取或创建记录
  let record = limiterCache.get(key);

  if (!record || now > record.resetTime) {
    // 新窗口期，重置计数
    record = { count: 0, resetTime: now + options.windowMs };
    limiterCache.set(key, record);
  }

  record.count++;

  if (record.count > options.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  return {
    success: true,
    remaining: Math.max(0, options.maxRequests - record.count),
    resetTime: record.resetTime,
  };
}

/**
 * 清除指定客户端的所有速率限制记录（用于测试或管理）
 */
export function clearRateLimits(identifier?: string): void {
  if (identifier) {
    for (const key of limiterCache.keys()) {
      if (key.startsWith(identifier + ':')) {
        limiterCache.delete(key);
      }
    }
  } else {
    limiterCache.clear();
  }
}

// ─── 分享链接密码暴力破解防护（按 token 计失败次数）───
// 通用 rateLimit 按 IP+路径 计所有请求，无法精准阻止单条分享链接被定向暴破
// （4 位最短密码仅 10000 种组合，默认 100/min/IP ≈ 6000 猜/小时）。
// 这里按分享 token 维度累计密码验证失败次数，达阈值后锁定该 token 的验证。

interface SharePasswordLimitOptions {
  /** 窗口内允许的最大失败次数 */
  maxFailures: number;
  /** 时间窗口大小（毫秒） */
  windowMs: number;
}

const SHARE_PASSWORD_LIMIT: SharePasswordLimitOptions = {
  maxFailures: 10,
  windowMs: 15 * 60 * 1000, // 15 分钟
};

interface SharePasswordLimitResult {
  /** 是否允许继续验证 */
  success: boolean;
  /** 窗口内剩余可用失败次数 */
  remaining: number;
  /** 窗口重置时间（毫秒时间戳） */
  resetTime: number;
}

// 按 token 维度的失败计数缓存。key = `share-pwd:${token}`
const sharePasswordCache = new LRUCache<string, { failures: number; resetTime: number }>({
  max: 50000,
  ttl: SHARE_PASSWORD_LIMIT.windowMs,
});

/**
 * 检查分享 token 的密码验证是否被限流。
 * 在比对密码前调用：success=false 时直接返回 429，不触达密码比对。
 */
export function checkSharePasswordLimit(token: string): SharePasswordLimitResult {
  const now = Date.now();
  const record = sharePasswordCache.get(token);

  if (!record || now > record.resetTime) {
    return {
      success: true,
      remaining: SHARE_PASSWORD_LIMIT.maxFailures,
      resetTime: now + SHARE_PASSWORD_LIMIT.windowMs,
    };
  }

  if (record.failures >= SHARE_PASSWORD_LIMIT.maxFailures) {
    return { success: false, remaining: 0, resetTime: record.resetTime };
  }

  return {
    success: true,
    remaining: SHARE_PASSWORD_LIMIT.maxFailures - record.failures,
    resetTime: record.resetTime,
  };
}

/**
 * 记录一次密码验证失败（密码错误时调用）。
 */
export function recordSharePasswordFailure(token: string): void {
  const now = Date.now();
  let record = sharePasswordCache.get(token);

  if (!record || now > record.resetTime) {
    record = { failures: 0, resetTime: now + SHARE_PASSWORD_LIMIT.windowMs };
  }

  record.failures++;
  sharePasswordCache.set(token, record);
}

/**
 * 清除 token 的失败计数（密码验证成功后调用，避免合法用户误输被累积）。
 */
export function clearSharePasswordLimit(token: string): void {
  sharePasswordCache.delete(token);
}

/**
 * 清除所有分享密码限流记录（仅用于测试）。
 */
export function clearAllSharePasswordLimits(): void {
  sharePasswordCache.clear();
}
