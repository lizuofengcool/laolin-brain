import { describe, it, expect, beforeEach, vi } from "vitest";

// 模拟性能工具函数
describe("性能优化工具", () => {
  describe("分页工具", () => {
    // 模拟分页参数解析
    const parsePaginationParams = (params: {
      page?: string;
      pageSize?: string;
      defaultPageSize?: number;
      maxPageSize?: number;
    }) => {
      const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
      const defaultSize = params.defaultPageSize || 20;
      const maxSize = params.maxPageSize || 100;
      let pageSize = parseInt(params.pageSize || String(defaultSize), 10) || defaultSize;
      pageSize = Math.min(Math.max(1, pageSize), maxSize);
      const skip = (page - 1) * pageSize;

      return { page, pageSize, skip };
    };

    // 模拟分页结果创建
    const createPaginatedResult = <T>(
      data: T[],
      total: number,
      page: number,
      pageSize: number
    ) => {
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
    };

    it("应该正确解析默认分页参数", () => {
      const result = parsePaginationParams({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.skip).toBe(0);
    });

    it("应该正确解析自定义分页参数", () => {
      const result = parsePaginationParams({ page: "3", pageSize: "50" });
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(50);
      expect(result.skip).toBe(100);
    });

    it("应该限制最大页面大小", () => {
      const result = parsePaginationParams({ pageSize: "1000", maxPageSize: 100 });
      expect(result.pageSize).toBe(100);
    });

    it("应该确保页码至少为1", () => {
      const result = parsePaginationParams({ page: "0" });
      expect(result.page).toBe(1);
    });

    it("应该处理无效的页码参数", () => {
      const result = parsePaginationParams({ page: "abc" });
      expect(result.page).toBe(1);
    });

    it("应该正确创建分页结果", () => {
      const data = [1, 2, 3, 4, 5];
      const result = createPaginatedResult(data, 100, 1, 10);

      expect(result.data).toEqual(data);
      expect(result.total).toBe(100);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it("应该正确计算最后一页", () => {
      const data = [1, 2, 3];
      const result = createPaginatedResult(data, 23, 3, 10);

      expect(result.totalPages).toBe(3);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("内存缓存", () => {
    // 模拟内存缓存类
    class MemoryCache {
      private cache = new Map<string, { value: any; expiresAt: number }>();
      private defaultTTL: number;

      constructor(defaultTTL = 30000) {
        this.defaultTTL = defaultTTL;
      }

      get<T>(key: string): T | null {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiresAt) {
          this.cache.delete(key);
          return null;
        }

        return item.value as T;
      }

      set<T>(key: string, value: T, ttl?: number): void {
        const expiresAt = Date.now() + (ttl || this.defaultTTL);
        this.cache.set(key, { value, expiresAt });
      }

      delete(key: string): boolean {
        return this.cache.delete(key);
      }

      clear(): void {
        this.cache.clear();
      }

      size(): number {
        return this.cache.size;
      }
    }

    it("应该正确设置和获取缓存", () => {
      const cache = new MemoryCache();
      cache.set("test", "value");

      expect(cache.get("test")).toBe("value");
    });

    it("应该返回null当缓存不存在时", () => {
      const cache = new MemoryCache();
      expect(cache.get("nonexistent")).toBeNull();
    });

    it("应该在TTL过期后返回null", () => {
      const cache = new MemoryCache();
      cache.set("test", "value", 1); // 1ms过期

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(cache.get("test")).toBeNull();
          resolve(true);
        }, 10);
      });
    });

    it("应该正确删除缓存", () => {
      const cache = new MemoryCache();
      cache.set("test", "value");
      cache.delete("test");

      expect(cache.get("test")).toBeNull();
    });

    it("应该正确清空所有缓存", () => {
      const cache = new MemoryCache();
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();

      expect(cache.size()).toBe(0);
    });

    it("应该返回正确的缓存大小", () => {
      const cache = new MemoryCache();
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      expect(cache.size()).toBe(2);
    });
  });

  describe("防抖函数", () => {
    // 模拟防抖函数
    const debounce = <T extends (...args: any[]) => any>(
      fn: T,
      delay: number
    ): ((...args: Parameters<T>) => void) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      return (...args: Parameters<T>) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          fn(...args);
        }, delay);
      };
    };

    it("应该延迟执行函数", () => {
      return new Promise((resolve) => {
        let count = 0;
        const debouncedFn = debounce(() => {
          count++;
        }, 10);

        debouncedFn();
        expect(count).toBe(0);

        setTimeout(() => {
          expect(count).toBe(1);
          resolve(true);
        }, 20);
      });
    });

    it("应该取消前一次调用", () => {
      return new Promise((resolve) => {
        let count = 0;
        const debouncedFn = debounce(() => {
          count++;
        }, 10);

        debouncedFn();
        debouncedFn();
        debouncedFn();

        setTimeout(() => {
          expect(count).toBe(1);
          resolve(true);
        }, 20);
      });
    });
  });

  describe("节流函数", () => {
    // 模拟节流函数
    const throttle = <T extends (...args: any[]) => any>(
      fn: T,
      limit: number
    ): ((...args: Parameters<T>) => void) => {
      let inThrottle = false;

      return (...args: Parameters<T>) => {
        if (!inThrottle) {
          fn(...args);
          inThrottle = true;
          setTimeout(() => {
            inThrottle = false;
          }, limit);
        }
      };
    };

    it("应该限制函数调用频率", () => {
      return new Promise((resolve) => {
        let count = 0;
        const throttledFn = throttle(() => {
          count++;
        }, 10);

        throttledFn();
        throttledFn();
        throttledFn();

        expect(count).toBe(1);

        setTimeout(() => {
          throttledFn();
          expect(count).toBe(2);
          resolve(true);
        }, 15);
      });
    });
  });

  describe("批量处理", () => {
    // 模拟批量处理函数
    const batchProcess = async <T, R>(
      items: T[],
      processor: (item: T) => Promise<R>,
      batchSize: number = 10
    ): Promise<R[]> => {
      const results: R[] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);
      }

      return results;
    };

    it("应该按批次处理项目", async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = async (item: number) => item * 2;

      const results = await batchProcess(items, processor, 2);

      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(results.length).toBe(5);
    });

    it("应该处理空数组", async () => {
      const processor = async (item: number) => item * 2;
      const results = await batchProcess([], processor);

      expect(results).toEqual([]);
    });

    it("应该处理小于批次大小的数组", async () => {
      const items = [1, 2, 3];
      const processor = async (item: number) => item * 2;

      const results = await batchProcess(items, processor, 10);

      expect(results).toEqual([2, 4, 6]);
    });
  });

  describe("并发控制", () => {
    // 模拟并发控制函数
    const concurrentMap = async <T, R>(
      items: T[],
      mapper: (item: T) => Promise<R>,
      concurrency: number = 5
    ): Promise<R[]> => {
      const results: R[] = new Array(items.length);
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < items.length) {
          const index = currentIndex++;
          results[index] = await mapper(items[index]);
        }
      };

      const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => worker()
      );

      await Promise.all(workers);
      return results;
    };

    it("应该限制并发数量", async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const mapper = async (item: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return item * 2;
      };

      const results = await concurrentMap(items, mapper, 3);

      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it("应该处理空数组", async () => {
      const mapper = async (item: number) => item * 2;
      const results = await concurrentMap([], mapper);

      expect(results).toEqual([]);
    });
  });
});
