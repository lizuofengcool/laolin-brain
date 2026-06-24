import { describe, it, expect, vi } from "vitest";
import {
  parsePaginationParams,
  createPaginatedResult,
  MemoryCache,
  debounce,
  throttle,
  batchProcess,
  concurrentMap,
} from "../performance";

describe("性能工具函数", () => {
  describe("parsePaginationParams", () => {
    it("应该解析默认分页参数", () => {
      const result = parsePaginationParams({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.skip).toBe(0);
    });

    it("应该解析自定义分页参数", () => {
      const result = parsePaginationParams({ page: 3, pageSize: 50 });
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(50);
      expect(result.skip).toBe(100);
    });

    it("应该限制最大分页大小", () => {
      const result = parsePaginationParams({ pageSize: 1000 });
      expect(result.pageSize).toBeLessThanOrEqual(100);
    });

    it("应该处理无效的页码", () => {
      const result = parsePaginationParams({ page: -1 });
      expect(result.page).toBe(1);
    });
  });

  describe("createPaginatedResult", () => {
    it("应该创建分页结果", () => {
      const data = [1, 2, 3, 4, 5];
      const result = createPaginatedResult(data, 100, { page: 1, pageSize: 10, skip: 0 });
      expect(result.data).toEqual(data);
      expect(result.total).toBe(100);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it("应该正确计算最后一页", () => {
      const data = [1, 2, 3];
      const result = createPaginatedResult(data, 23, { page: 3, pageSize: 10, skip: 20 });
      expect(result.totalPages).toBe(3);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("MemoryCache", () => {
    it("应该缓存和获取值", () => {
      const cache = new MemoryCache({ defaultTTL: 1000 });
      cache.set("key", "value");
      expect(cache.get("key")).toBe("value");
    });

    it("应该在TTL过期后返回null", async () => {
      const cache = new MemoryCache({ defaultTTL: 10 });
      cache.set("key", "value");
      expect(cache.get("key")).toBe("value");

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(cache.get("key")).toBeNull();
    });

    it("应该删除缓存项", () => {
      const cache = new MemoryCache();
      cache.set("key", "value");
      cache.delete("key");
      expect(cache.get("key")).toBeNull();
    });

    it("应该清空所有缓存", () => {
      const cache = new MemoryCache();
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();
      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")).toBeNull();
    });

    it("应该检查缓存是否存在", () => {
      const cache = new MemoryCache();
      cache.set("key", "value");
      expect(cache.has("key")).toBe(true);
      expect(cache.has("nonexistent")).toBe(false);
    });

    it("应该获取缓存统计信息", () => {
      const cache = new MemoryCache();
      cache.set("key1", "value1");
      cache.get("key1");
      cache.get("key2");

      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe("debounce", () => {
    it("应该防抖函数调用", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 10);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(fn).not.toHaveBeenCalled();
    });

    it("应该在延迟后调用函数", async () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 10);

      debouncedFn("test");

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("test");
    });
  });

  describe("throttle", () => {
    it("应该节流函数调用", async () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 20);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 30));
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("batchProcess", () => {
    it("应该批量处理项目", async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = await batchProcess(items, async (item) => item * 2, {
        batchSize: 3,
      });

      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    });

    it("应该处理空数组", async () => {
      const results = await batchProcess([], async (item) => item);
      expect(results).toEqual([]);
    });
  });

  describe("concurrentMap", () => {
    it("应该并发处理项目", async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await concurrentMap(items, async (item) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return item * 2;
      }, 2);

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it("应该限制并发数", async () => {
      let activeCount = 0;
      let maxActiveCount = 0;

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      await concurrentMap(
        items,
        async (item) => {
          activeCount++;
          maxActiveCount = Math.max(maxActiveCount, activeCount);
          await new Promise((resolve) => setTimeout(resolve, 10));
          activeCount--;
          return item;
        },
        3
      );

      expect(maxActiveCount).toBeLessThanOrEqual(3);
    });
  });
});
