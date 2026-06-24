/**
 * 性能优化工具
 * 
 * 功能：
 * 1. 分页工具
 * 2. 缓存工具
 * 3. 查询优化工具
 */

/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * 解析分页参数
 */
export function parsePaginationParams(params: PaginationParams): {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || params.limit || 20));
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  return { skip, take, page, pageSize };
}

/**
 * 生成分页结果
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasNext,
    hasPrev,
  };
}

/**
 * 简单内存缓存
 */
export class MemoryCache<T = any> {
  private cache: Map<string, { value: T; expiresAt: number }> = new Map();
  private defaultTTL: number;

  constructor(defaultTTL: number = 60000) { // 默认60秒
    this.defaultTTL = defaultTTL;
  }

  /**
   * 获取缓存
   */
  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * 设置缓存
   */
  set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取或设置缓存
   */
  async getOrSet(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * 清理过期缓存
   */
  cleanup(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * 全局缓存实例
 */
export const globalCache = new MemoryCache(30000); // 30秒

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 批量处理工具
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}

/**
 * 并发控制
 */
export async function concurrentMap<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

export default {
  parsePaginationParams,
  createPaginatedResult,
  MemoryCache,
  globalCache,
  debounce,
  throttle,
  batchProcess,
  concurrentMap,
};
