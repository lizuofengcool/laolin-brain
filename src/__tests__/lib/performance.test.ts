import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parsePaginationParams,
  createPaginatedResult,
  MemoryCache,
  globalCache,
  debounce,
  throttle,
  batchProcess,
  concurrentMap,
} from "@/lib/utils/performance";

/**
 * 直接覆盖 src/lib/utils/performance.ts 的 8 个运行时导出。
 *
 * 历史背景：本文件早期版本用「模拟」内联副本测试，从未 import 真实模块，
 * 故 src/lib/utils/performance.ts 长期零真实覆盖。另有一个 co-located
 * src/lib/utils/__tests__/performance.test.ts 既在 vitest include 之外（不运行）
 * 又调用不存在的 API（has/getStats/hasMore/对象构造参数），属误导性死代码，已删除。
 * 本文件改为真实 import + 控制流锁定。
 */

describe("parsePaginationParams", () => {
  it("空对象走默认值：page=1 / pageSize=20 / skip=0 / take=20", () => {
    const r = parsePaginationParams({});
    expect(r).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });

  it("显式 page + pageSize 直读", () => {
    const r = parsePaginationParams({ page: 3, pageSize: 50 });
    expect(r).toEqual({ skip: 100, take: 50, page: 3, pageSize: 50 });
  });

  it("page=0 钳制为 1", () => {
    expect(parsePaginationParams({ page: 0 })).toHaveProperty("page", 1);
  });

  it("page 负数钳制为 1", () => {
    expect(parsePaginationParams({ page: -5 })).toHaveProperty("page", 1);
  });

  it("page 缺省（undefined）走默认 1", () => {
    expect(parsePaginationParams({ pageSize: 10 })).toHaveProperty("page", 1);
  });

  it("pageSize=0 视为 falsy 回退默认 20（|| 短路，未到 Math.max 钳位）", () => {
    expect(parsePaginationParams({ pageSize: 0 })).toHaveProperty("pageSize", 20);
  });

  it("pageSize 负数（truthy）经 Math.max(1, ...) 钳制为 1", () => {
    expect(parsePaginationParams({ pageSize: -5 })).toHaveProperty("pageSize", 1);
  });

  it("pageSize 超过 100 被封顶为 100", () => {
    expect(parsePaginationParams({ pageSize: 1000 })).toHaveProperty("pageSize", 100);
  });

  it("pageSize=500 被封顶为 100", () => {
    expect(parsePaginationParams({ pageSize: 500 })).toHaveProperty("pageSize", 100);
  });

  it("limit 作为 pageSize 的回退（无 pageSize 时）", () => {
    expect(parsePaginationParams({ limit: 15 })).toHaveProperty("pageSize", 15);
  });

  it("pageSize 优先于 limit", () => {
    expect(parsePaginationParams({ pageSize: 30, limit: 15 })).toHaveProperty("pageSize", 30);
  });

  it("skip = (page-1) * pageSize，take = pageSize", () => {
    const r = parsePaginationParams({ page: 5, pageSize: 25 });
    expect(r.skip).toBe(100);
    expect(r.take).toBe(25);
  });

  it("返回字段恰好为 {skip, take, page, pageSize}", () => {
    const r = parsePaginationParams({ page: 2, pageSize: 10 });
    expect(Object.keys(r).sort()).toEqual(["page", "pageSize", "skip", "take"]);
  });
});

describe("createPaginatedResult", () => {
  it("首页：hasNext=true / hasPrev=false", () => {
    const r = createPaginatedResult([1, 2, 3], 100, 1, 10);
    expect(r.data).toEqual([1, 2, 3]);
    expect(r.total).toBe(100);
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(10);
    expect(r.totalPages).toBe(10);
    expect(r.hasNext).toBe(true);
    expect(r.hasPrev).toBe(false);
  });

  it("末页：hasNext=false / hasPrev=true", () => {
    const r = createPaginatedResult([1, 2, 3], 23, 3, 10);
    expect(r.totalPages).toBe(3);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(true);
  });

  it("中间页：hasNext=true / hasPrev=true", () => {
    const r = createPaginatedResult([], 30, 2, 10);
    expect(r.totalPages).toBe(3);
    expect(r.hasNext).toBe(true);
    expect(r.hasPrev).toBe(true);
  });

  it("total=0：totalPages=0，hasNext=false（1<0 为假），hasPrev=false（1>1 为假）", () => {
    const r = createPaginatedResult([], 0, 1, 10);
    expect(r.totalPages).toBe(0);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(false);
  });

  it("total 恰被 pageSize 整除：无余页", () => {
    const r = createPaginatedResult([], 20, 2, 10);
    expect(r.totalPages).toBe(2);
    expect(r.hasNext).toBe(false);
  });

  it("data 引用原样保留（不做拷贝）", () => {
    const data = [9, 8, 7];
    const r = createPaginatedResult(data, 5, 1, 10);
    expect(r.data).toBe(data);
  });

  it("返回字段恰好为 7 个", () => {
    const r = createPaginatedResult([], 0, 1, 10);
    expect(Object.keys(r).sort()).toEqual(
      ["data", "hasNext", "hasPrev", "page", "pageSize", "total", "totalPages"].sort()
    );
  });
});

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    cache = new MemoryCache<string>(60000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("set 后 get 返回值", () => {
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
  });

  it("get 不存在的 key 返回 null", () => {
    expect(cache.get("missing")).toBeNull();
  });

  it("未过期：defaultTTL 窗口内仍可读", () => {
    cache.set("k", "v"); // 60s 默认
    vi.advanceTimersByTime(59999);
    expect(cache.get("k")).toBe("v");
  });

  it("过期：超过 defaultTTL 后 get 返回 null 并删除条目", () => {
    cache.set("k", "v");
    expect(cache.size()).toBe(1);
    vi.advanceTimersByTime(60001);
    expect(cache.get("k")).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it("set 显式 ttl 覆盖 defaultTTL", () => {
    cache.set("k", "v", 1000);
    vi.advanceTimersByTime(999);
    expect(cache.get("k")).toBe("v");
    vi.advanceTimersByTime(2);
    expect(cache.get("k")).toBeNull();
  });

  it("set 不传 ttl 走 defaultTTL", () => {
    cache.set("k", "v");
    vi.advanceTimersByTime(59999);
    expect(cache.get("k")).toBe("v");
  });

  it("delete 存在的 key 返回 true 并移除", () => {
    cache.set("k", "v");
    expect(cache.delete("k")).toBe(true);
    expect(cache.get("k")).toBeNull();
  });

  it("delete 不存在的 key 返回 false", () => {
    expect(cache.delete("nope")).toBe(false);
  });

  it("clear 清空全部，size 归 0", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("a")).toBeNull();
  });

  it("size 反映当前条目数（含未过期）", () => {
    expect(cache.size()).toBe(0);
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size()).toBe(2);
  });

  it("可存储 falsy 值 0 / '' / false，且 get 能区分于「不存在」", () => {
    const c = new MemoryCache<any>(60000);
    c.set("z", 0);
    c.set("e", "");
    c.set("f", false);
    expect(c.get("z")).toBe(0);
    expect(c.get("e")).toBe("");
    expect(c.get("f")).toBe(false);
    expect(c.get("missing")).toBeNull();
  });

  describe("getOrSet", () => {
    it("缓存未命中：调用 fetcher、写入、返回值", async () => {
      const fetcher = vi.fn().mockResolvedValue("fresh");
      const v = await cache.getOrSet("k", fetcher);
      expect(v).toBe("fresh");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.get("k")).toBe("fresh");
    });

    it("缓存命中：不调用 fetcher，直接返回缓存", async () => {
      cache.set("k", "cached");
      const fetcher = vi.fn().mockResolvedValue("should-not-run");
      const v = await cache.getOrSet("k", fetcher);
      expect(v).toBe("cached");
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("getOrSet 的 ttl 参数透传给 set（自定义过期）", async () => {
      const fetcher = vi.fn().mockResolvedValue("fresh");
      await cache.getOrSet("k", fetcher, 500);
      vi.advanceTimersByTime(499);
      const fetcher2 = vi.fn().mockResolvedValue("again");
      const v = await cache.getOrSet("k", fetcher2);
      expect(v).toBe("fresh");
      expect(fetcher2).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      const fetcher3 = vi.fn().mockResolvedValue("again2");
      const v2 = await cache.getOrSet("k", fetcher3);
      expect(v2).toBe("again2");
      expect(fetcher3).toHaveBeenCalledTimes(1);
    });

    it("命中可缓存的 falsy 值（0）时不再调 fetcher", async () => {
      const c = new MemoryCache<any>(60000);
      const f1 = vi.fn().mockResolvedValue(0);
      const v1 = await c.getOrSet("k", f1);
      expect(v1).toBe(0);
      const f2 = vi.fn().mockResolvedValue(0);
      const v2 = await c.getOrSet("k", f2);
      expect(v2).toBe(0);
      expect(f2).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("仅清理过期条目，返回清理数量，保留未过期", () => {
      cache.set("a", "1", 1000); // 1s 过期
      cache.set("b", "2", 1000);
      cache.set("c", "3", 60000); // 60s 未过期
      vi.advanceTimersByTime(1001);
      const removed = cache.cleanup();
      expect(removed).toBe(2);
      expect(cache.size()).toBe(1);
      expect(cache.get("c")).toBe("3");
    });

    it("无过期条目时返回 0", () => {
      cache.set("a", "1");
      const removed = cache.cleanup();
      expect(removed).toBe(0);
      expect(cache.size()).toBe(1);
    });

    it("全部过期时返回全部数量", () => {
      cache.set("a", "1", 1000);
      cache.set("b", "2", 1000);
      vi.advanceTimersByTime(1001);
      const removed = cache.cleanup();
      expect(removed).toBe(2);
      expect(cache.size()).toBe(0);
    });

    it("空缓存 cleanup 返回 0", () => {
      expect(cache.cleanup()).toBe(0);
    });
  });
});

describe("globalCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    globalCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalCache.clear();
  });

  it("是 MemoryCache 实例", () => {
    expect(globalCache).toBeInstanceOf(MemoryCache);
  });

  it("默认 TTL 为 30s（30s 内可读，超过即过期）", () => {
    globalCache.set("g", "v");
    vi.advanceTimersByTime(29999);
    expect(globalCache.get("g")).toBe("v");
    vi.advanceTimersByTime(2);
    expect(globalCache.get("g")).toBeNull();
  });

  it("与新建的 MemoryCache 实例相互独立", () => {
    const other = new MemoryCache<string>(60000);
    globalCache.set("shared", "gv");
    other.set("shared", "ov");
    expect(globalCache.get("shared")).toBe("gv");
    expect(other.get("shared")).toBe("ov");
    globalCache.clear();
    expect(other.get("shared")).toBe("ov");
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("同步调用不立即执行 fn", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    expect(fn).not.toHaveBeenCalled();
  });

  it("延迟到达后执行一次", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("连续多次调用只执行最后一次（trailing）", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a");
    d("b");
    d("c");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("新一轮调用在延迟窗口内会重置计时器", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(60); // 未到
    d(); // 重置
    vi.advanceTimersByTime(60); // 距上次 60，仍未到 100
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40); // 累计距上次调用 100
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("参数透传给最终执行", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1, 2, 3);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
  });
});

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("首次调用立即执行（leading）", () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("节流窗口内后续调用被丢弃", () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t();
    t();
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("节流窗口结束后下一次调用恢复执行", () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t();
    vi.advanceTimersByTime(100);
    t();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("参数透传", () => {
    const fn = vi.fn();
    const t = throttle(fn, 50);
    t("x", "y");
    expect(fn).toHaveBeenCalledWith("x", "y");
  });

  it("窗口内第二次调用不传参给已执行的 fn", () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t("first");
    t("second"); // 被丢弃
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("first");
  });
});

describe("batchProcess", () => {
  it("按顺序处理全部项目并返回结果", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await batchProcess(items, async (n) => n * 2, 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("空数组返回空数组", async () => {
    const results = await batchProcess([], async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("batchSize 大于数组长度时单批完成", async () => {
    const items = [1, 2, 3];
    const results = await batchProcess(items, async (n) => n, 10);
    expect(results).toEqual([1, 2, 3]);
  });

  it("省略 batchSize 时默认 10", async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    const results = await batchProcess(items, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return n;
    });
    expect(results).toEqual(items);
    expect(maxActive).toBeLessThanOrEqual(10);
  });

  it("batchSize=1 退化为顺序处理（并发上限 1）", async () => {
    const items = [1, 2, 3];
    let active = 0;
    let maxActive = 0;
    await batchProcess(
      items,
      async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return n;
      },
      1
    );
    expect(maxActive).toBe(1);
  });

  it("processor 抛错时 reject 传播", async () => {
    const items = [1, 2, 3];
    await expect(
      batchProcess(items, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }, 2)
    ).rejects.toThrow("boom");
  });
});

describe("concurrentMap", () => {
  it("按原顺序返回全部结果", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await concurrentMap(
      items,
      async (n) => {
        // 用随机延迟打乱完成顺序，验证结果仍按 index 对齐
        await new Promise((r) => setTimeout(r, Math.random() * 20 + 5));
        return n * 10;
      },
      3
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("并发数不超过指定上限", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    await concurrentMap(
      items,
      async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return n;
      },
      3
    );
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("空数组返回空数组", async () => {
    const results = await concurrentMap([], async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("concurrency 大于 items.length 时 worker 数取 items.length", async () => {
    const items = [1, 2];
    let active = 0;
    let maxActive = 0;
    const results = await concurrentMap(
      items,
      async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return n;
      },
      100
    );
    expect(results).toEqual([1, 2]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("省略 concurrency 默认 5", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    const results = await concurrentMap(items, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n;
    });
    expect(results).toEqual(items);
    expect(maxActive).toBeLessThanOrEqual(5);
  });

  it("mapper 抛错时 reject 传播", async () => {
    const items = [1, 2, 3];
    await expect(
      concurrentMap(
        items,
        async (n) => {
          if (n === 2) throw new Error("fail");
          return n;
        },
        2
      )
    ).rejects.toThrow("fail");
  });
});
