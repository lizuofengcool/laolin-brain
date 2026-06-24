/**
 * 数据库查询优化工具
 * 提供查询优化、缓存、批量处理等功能
 */

import { db } from "@/lib/db";

// 查询缓存配置
interface QueryCacheOptions {
  ttl?: number; // 缓存时间（毫秒）
  key?: string; // 缓存键
}

// 分页查询选项
interface PaginatedQueryOptions {
  page?: number;
  pageSize?: number;
  maxPageSize?: number;
  defaultPageSize?: number;
}

// 分页结果
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// 默认分页配置
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * 解析分页参数
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  options: PaginatedQueryOptions = {}
): { page: number; pageSize: number; skip: number; take: number } {
  const {
    defaultPageSize = DEFAULT_PAGE_SIZE,
    maxPageSize = MAX_PAGE_SIZE,
  } = options;

  let page = parseInt(searchParams.get("page") || "1", 10);
  let pageSize = parseInt(searchParams.get("pageSize") || String(defaultPageSize), 10);

  // 验证参数
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(pageSize) || pageSize < 1) pageSize = defaultPageSize;
  if (pageSize > maxPageSize) pageSize = maxPageSize;

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  return { page, pageSize, skip, take };
}

/**
 * 创建分页结果
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / pageSize);
  const hasMore = page < totalPages;

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasMore,
  };
}

/**
 * 批量处理数据
 * 适用于大量数据的分批处理，避免内存溢出
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (batch: T[], batchIndex: number) => Promise<R[]>,
  batchSize: number = 100
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch, Math.floor(i / batchSize));
    results.push(...batchResults);
  }

  return results;
}

/**
 * 并发控制
 * 限制并发请求数量，避免资源耗尽
 */
export async function concurrentMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = 10
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(workerId: number): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      if (index >= items.length) break;

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        console.error(`Worker ${workerId} failed at index ${index}:`, error);
        throw error;
      }
    }
  }

  // 创建指定数量的worker
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    (_, i) => worker(i)
  );

  await Promise.all(workers);
  return results;
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 内存缓存类
 */
export class MemoryCache<T = any> {
  private cache: Map<string, { value: T; expiresAt: number }> = new Map();
  private defaultTTL: number;

  constructor(defaultTTL: number = 30000) {
    // 默认30秒
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, { value, expiresAt });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  size(): number {
    // 清理过期项
    this.cleanup();
    return this.cache.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// 全局缓存实例
export const globalCache = new MemoryCache(30000); // 30秒默认TTL

/**
 * 带缓存的数据库查询
 */
export async function cachedQuery<T>(
  cacheKey: string,
  queryFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const cached = globalCache.get(cacheKey);
  if (cached !== null) {
    return cached as T;
  }

  const result = await queryFn();
  globalCache.set(cacheKey, result, ttl);
  return result;
}

/**
 * 优化的计数查询
 * 使用更高效的方式进行计数
 */
export async function optimizedCount(
  model: any,
  where: any
): Promise<number> {
  // 使用select优化，只查需要的字段
  const result = await model.count({ where });
  return result;
}

/**
 * 批量创建优化
 * 使用createMany进行批量创建
 */
export async function optimizedCreateMany(
  model: any,
  data: any[],
  batchSize: number = 100
): Promise<number> {
  let totalCreated = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const result = await model.createMany({ data: batch });
    totalCreated += result.count;
  }

  return totalCreated;
}

/**
 * 性能监控装饰器
 * 记录函数执行时间
 */
export function withPerformance<T extends (...args: any[]) => any>(
  func: T,
  name?: string
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  const funcName = name || func.name || "anonymous";

  return async function (this: any, ...args: Parameters<T>): Promise<ReturnType<T>> {
    const startTime = Date.now();
    try {
      const result = await func.apply(this, args);
      const duration = Date.now() - startTime;
      if (duration > 100) {
        // 只记录慢查询
        console.log(`[Performance] ${funcName} took ${duration}ms`);
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Performance] ${funcName} failed after ${duration}ms:`, error);
      throw error;
    }
  };
}

/**
 * 响应压缩辅助
 * 检查是否应该压缩响应
 */
export function shouldCompress(size: number): boolean {
  // 大于1KB的响应进行压缩
  return size > 1024;
}

/**
 * 优化的JSON响应
 * 自动处理大数据量的响应优化
 */
export function optimizedJsonResponse(data: any, statusCode: number = 200): Response {
  const json = JSON.stringify(data);
  const size = Buffer.byteLength(json, "utf-8");

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Response-Size": String(size),
  };

  // 如果数据量大，添加缓存提示
  if (size > 10240) {
    // 大于10KB
    headers["Cache-Control"] = "public, max-age=60";
  }

  return new Response(json, {
    status: statusCode,
    headers,
  });
}
