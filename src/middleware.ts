import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * API 速率限制中间件（内存版）
 * 使用滑动窗口算法，零外部依赖，适合单实例部署
 * 自动清理过期条目，防止内存泄漏
 */

interface RateLimitEntry {
  timestamps: number[];
}

// 存储每个 IP 的请求时间戳
const rateLimitStore = new Map<string, RateLimitEntry>();

// 清理间隔：每 60 秒清理一次过期条目
const CLEANUP_INTERVAL_MS = 60_000;

// 上次清理时间
let lastCleanup = Date.now();

// 速率限制配置
interface RateLimitConfig {
  windowMs: number;   // 窗口时长（毫秒）
  maxRequests: number; // 窗口内最大请求数
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { windowMs: 60_000, maxRequests: 10 },     // 登录/注册：每分钟 10 次
  upload: { windowMs: 60_000, maxRequests: 30 },    // 文件上传：每分钟 30 次
  ai: { windowMs: 60_000, maxRequests: 20 },        // AI 接口：每分钟 20 次
  default: { windowMs: 60_000, maxRequests: 100 },  // 通用 API：每分钟 100 次
};

/**
 * 根据请求路径和方法匹配速率限制配置
 */
function getConfigForPath(path: string, method: string): RateLimitConfig {
  if (path.startsWith('/api/auth/')) return RATE_LIMITS.auth;
  if (path === '/api/files' && method === 'POST') return RATE_LIMITS.upload;
  if (path.startsWith('/api/ai/')) return RATE_LIMITS.ai;
  return RATE_LIMITS.default;
}

/**
 * 将路径中的动态段替换为占位符，用于速率限制分组
 * 例如: /api/files/abc123/preview -> /api/files/:id/preview
 */
function normalizeRateLimitPath(path: string): string {
  return path
    .replace(/\/api\/files\/[^/]+\/preview\/?$/, '/api/files/:id/preview')
    .replace(/\/api\/files\/[^/]+\/download\/?$/, '/api/files/:id/download')
    .replace(/\/api\/files\/[^/]+\/versions\/?$/, '/api/files/:id/versions')
    .replace(/\/api\/files\/[^/]+\/thumbnail\/?$/, '/api/files/:id/thumbnail')
    .replace(/\/api\/files\/[^/]+\/share\/?$/, '/api/files/:id/share')
    .replace(/\/api\/files\/[^/]+\/favorite\/?$/, '/api/files/:id/favorite')
    .replace(/\/api\/files\/[^/]+\/restore\/?$/, '/api/files/:id/restore')
    .replace(/\/api\/files\/[^/]+\/?$/, '/api/files/:id')
    .replace(/\/api\/faces\/groups\/[^/]+\/photos\/?$/, '/api/faces/groups/:id/photos')
    .replace(/\/api\/faces\/groups\/[^/]+\/?$/, '/api/faces/groups/:id')
    .replace(/\/api\/folders\/[^/]+\/?$/, '/api/folders/:id')
    .replace(/\/api\/embeddings\/[^/]+\/?$/, '/api/embeddings/:id');
}

/**
 * 清理过期的速率限制条目
 */
function cleanupExpiredEntries(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of rateLimitStore.entries()) {
    // 保留最近 120 秒内的条目（覆盖所有窗口大小）
    entry.timestamps = entry.timestamps.filter(t => now - t < 120_000);
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * 检查速率限制
 * @returns { allowed: boolean, remaining: number, resetAfterMs: number }
 */
function checkRateLimit(ip: string, path: string, method: string): {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
} {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const config = getConfigForPath(path, method);
  // Strip query params to prevent per-query rate limit bypass
  const normalizedPath = normalizeRateLimitPath(path.split('?')[0]);
  const cacheKey = `${ip}:${normalizedPath}`;

  const entry = rateLimitStore.get(cacheKey) || { timestamps: [] };

  // 移除窗口外的旧时间戳
  entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

  const allowed = entry.timestamps.length < config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.timestamps.length - (allowed ? 1 : 0));
  const resetAfterMs = entry.timestamps.length > 0
    ? config.windowMs - (now - entry.timestamps[0])
    : config.windowMs;

  if (allowed) {
    entry.timestamps.push(now);
  }

  rateLimitStore.set(cacheKey, entry);

  return { allowed, remaining, resetAfterMs };
}

// 上传端点的最大请求体大小（纵深防御，route handler 中还有实际业务校验）
const UPLOAD_MAX_BODY_SIZE = 100 * 1024 * 1024; // 100MB

// 需要进行请求体大小检查的上传端点
const UPLOAD_BODY_CHECK_ENDPOINTS: Array<{ path: string; method: string }> = [
  { path: '/api/files', method: 'POST' },
];

/**
 * 检查请求体大小是否超过限制（纵深防御措施）
 * 在速率限制之前拦截超大请求，防止恶意上传耗尽服务器资源
 * 注意：实际文件大小校验还在 route handler 中执行
 */
function checkBodySizeLimit(
  request: NextRequest,
  path: string,
  method: string,
): NextResponse | null {
  const needsCheck = UPLOAD_BODY_CHECK_ENDPOINTS.some(
    ep => ep.path === path && ep.method === method,
  );
  if (!needsCheck) return null;

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > UPLOAD_MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: `请求体过大，最大允许 ${Math.round(UPLOAD_MAX_BODY_SIZE / 1024 / 1024)}MB` },
        { status: 413 },
      );
    }
  }
  // Content-Length 缺失时不拒绝（部分客户端/代理不发送此头部），
  // 由 route handler 在解析 formData 后做精确校验

  return null;
}

export async function middleware(request: NextRequest) {
  // 仅对 /api 路径生效
  const path = request.nextUrl.pathname;
  if (!path.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 纵深防御：在速率限制之前先检查请求体大小，拦截超大请求
  const bodySizeResponse = checkBodySizeLimit(request, path, request.method);
  if (bodySizeResponse) return bodySizeResponse;

  // CSRF 防护：对非浏览器的可变请求进行 Origin 校验
  // 浏览器会在跨站请求中发送 Origin 头，同源请求则 Origin 与 Host 一致。
  // 非浏览器客户端（curl、服务端 fetch 等）通常不发送 Origin，直接放行。
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host) {
      const originHost = origin.replace(/^https?:\/\//, '');
      if (originHost !== host) {
        return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
      }
    }
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',').pop()?.trim() || '127.0.0.1' : '127.0.0.1';
  const result = checkRateLimit(ip, path, request.method);

  if (!result.allowed) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试', resetAfterMs: result.resetAfterMs },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(result.resetAfterMs / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
