import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parsePaginationParams,
  createPaginatedResult,
  batchProcess,
  concurrentMap,
  debounce,
  throttle,
  MemoryCache,
  globalCache,
  cachedQuery,
  optimizedCount,
  optimizedCreateMany,
  withPerformance,
  shouldCompress,
  optimizedJsonResponse,
} from '@/lib/utils/performance-optimized';

// performance-optimized.ts 顶部 `import { db } from '@/lib/db'` 为未使用死导入
// （函数体均不引用 db），但模块加载会触发 PrismaClient 构造（不连库，安全）。
// 模块导出 14 个符号：分页工具 2、批处理/并发 2、节流防抖 2、MemoryCache 类 +
// globalCache 单例 + cachedQuery 3、DB 优化包装 2、性能装饰器 1、响应工具 2。
// 仅依赖 next 无关的原语（Date.now / setTimeout / Buffer / console），全部可直接单测。
// globalCache 为模块级单例，跨用例持久 → 顶层 beforeEach 调 clear() 隔离。

beforeEach(() => {
  globalCache.clear();
});

// ─── parsePaginationParams ───────────────────────────────────────────────

describe('parsePaginationParams —— 默认值/钳制/NaN 守卫/选项透传', () => {
  it('无参数走默认 page=1 / pageSize=20 / skip=0 / take=20', () => {
    const r = parsePaginationParams(new URLSearchParams());
    expect(r).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });

  it('显式 page/pageSize 解析为整数', () => {
    const r = parsePaginationParams(new URLSearchParams('page=3&pageSize=50'));
    expect(r).toEqual({ page: 3, pageSize: 50, skip: 100, take: 50 });
  });

  it('page<1 被 Math.max(1,…) 钳制为 1', () => {
    const r = parsePaginationParams(new URLSearchParams('page=0'));
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
  });

  it('page 为负数被钳制为 1', () => {
    const r = parsePaginationParams(new URLSearchParams('page=-5'));
    expect(r.page).toBe(1);
  });

  it('page 非数字（NaN）走守卫回退为 1（与 api-response 不同，此处有 isNaN 守卫）', () => {
    const r = parsePaginationParams(new URLSearchParams('page=abc'));
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
  });

  it('小数 page 经 parseInt 截断', () => {
    const r = parsePaginationParams(new URLSearchParams('page=2.9'));
    expect(r.page).toBe(2);
    expect(r.skip).toBe(20); // (2-1)*20
  });

  it('pageSize<1 回退为 defaultPageSize', () => {
    const r = parsePaginationParams(new URLSearchParams('pageSize=0'));
    expect(r.pageSize).toBe(20);
  });

  it('pageSize 非数字回退为 defaultPageSize', () => {
    const r = parsePaginationParams(new URLSearchParams('pageSize=xyz'));
    expect(r.pageSize).toBe(20);
  });

  it('pageSize>100 被钳制为 maxPageSize(100)', () => {
    const r = parsePaginationParams(new URLSearchParams('pageSize=999'));
    expect(r.pageSize).toBe(100);
  });

  it('pageSize=100 边界不被钳制', () => {
    const r = parsePaginationParams(new URLSearchParams('pageSize=100'));
    expect(r.pageSize).toBe(100);
  });

  it('options.defaultPageSize / options.maxPageSize 透传', () => {
    const r = parsePaginationParams(
      new URLSearchParams('page=2&pageSize=5'),
      { defaultPageSize: 10, maxPageSize: 50 }
    );
    expect(r).toEqual({ page: 2, pageSize: 5, skip: 5, take: 5 });
  });

  it('options.maxPageSize 钳制生效（pageSize 超过自定义上限）', () => {
    const r = parsePaginationParams(
      new URLSearchParams('pageSize=60'),
      { defaultPageSize: 10, maxPageSize: 50 }
    );
    expect(r.pageSize).toBe(50);
  });

  it('skip = (page-1)*pageSize 联动计算', () => {
    const r = parsePaginationParams(new URLSearchParams('page=4&pageSize=25'));
    expect(r.skip).toBe(75);
    expect(r.take).toBe(25);
  });
});

// ─── createPaginatedResult ───────────────────────────────────────────────

describe('createPaginatedResult —— totalPages/hasMore 公式锁定', () => {
  it('返回六字段结构 data/total/page/pageSize/totalPages/hasMore', () => {
    const r = createPaginatedResult([1, 2, 3], 10, 1, 3);
    expect(r).toEqual({
      data: [1, 2, 3],
      total: 10,
      page: 1,
      pageSize: 3,
      totalPages: 4, // Math.ceil(10/3)
      hasMore: true, // 1 < 4
    });
  });

  it('total=0 时 totalPages=0 且 hasMore=false', () => {
    const r = createPaginatedResult([], 0, 1, 20);
    expect(r.totalPages).toBe(0);
    expect(r.hasMore).toBe(false);
  });

  it('page === totalPages 时 hasMore=false（最后一页）', () => {
    const r = createPaginatedResult([1], 10, 4, 3);
    expect(r.totalPages).toBe(4);
    expect(r.hasMore).toBe(false); // 4 < 4 = false
  });

  it('page > totalPages（越界）时 hasMore=false', () => {
    const r = createPaginatedResult([], 10, 5, 3);
    expect(r.hasMore).toBe(false); // 5 < 4 = false
  });

  it('total 可整除 pageSize 时 totalPages 精确', () => {
    const r = createPaginatedResult([1, 2], 6, 1, 3);
    expect(r.totalPages).toBe(2);
    expect(r.hasMore).toBe(true); // 1 < 2
  });

  it('data 字段原样透传（含嵌套对象/null）', () => {
    const data = [{ a: 1 }, null, 'x'] as any;
    const r = createPaginatedResult(data, 3, 1, 10);
    expect(r.data).toBe(data);
  });
});

// ─── batchProcess ────────────────────────────────────────────────────────

describe('batchProcess —— 分批切片与结果拼接', () => {
  it('空数组返回空结果，不调 processor', async () => {
    const processor = vi.fn().mockResolvedValue([]);
    const r = await batchProcess([], processor as any, 2);
    expect(r).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });

  it('单批（items <= batchSize）一次调用 processor', async () => {
    const processor = vi.fn(async (batch: number[]) => batch.map((x) => x * 10));
    const r = await batchProcess([1, 2, 3], processor, 10);
    expect(r).toEqual([10, 20, 30]);
    expect(processor).toHaveBeenCalledTimes(1);
    expect(processor).toHaveBeenCalledWith([1, 2, 3], 0);
  });

  it('多批切片，batchIndex 递增，结果按顺序拼接', async () => {
    const processor = vi.fn(async (batch: number[]) => batch.map((x) => x * 10));
    const r = await batchProcess([1, 2, 3, 4, 5], processor, 2);
    expect(r).toEqual([10, 20, 30, 40, 50]);
    expect(processor).toHaveBeenCalledTimes(3);
    expect(processor).toHaveBeenNthCalledWith(1, [1, 2], 0);
    expect(processor).toHaveBeenNthCalledWith(2, [3, 4], 1);
    expect(processor).toHaveBeenNthCalledWith(3, [5], 2);
  });

  it('默认 batchSize=100（items 超过 100 拆 2 批）', async () => {
    const items = Array.from({ length: 150 }, (_, i) => i + 1);
    const processor = vi.fn(async (batch: number[]) => batch.map((x) => x));
    const r = await batchProcess(items, processor);
    expect(r).toEqual(items);
    expect(processor).toHaveBeenCalledTimes(2);
    expect(processor).toHaveBeenNthCalledWith(1, items.slice(0, 100), 0);
    expect(processor).toHaveBeenNthCalledWith(2, items.slice(100, 150), 1);
  });
});

// ─── concurrentMap ───────────────────────────────────────────────────────

describe('concurrentMap —— 并发执行与按 index 落位', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it('空数组返回空结果', async () => {
    const mapper = vi.fn();
    const r = await concurrentMap([], mapper as any);
    expect(r).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it('同步 resolve 的 mapper 结果按 index 顺序落位', async () => {
    const r = await concurrentMap([1, 2, 3], (x) => Promise.resolve(x * 10), 3);
    expect(r).toEqual([10, 20, 30]);
  });

  it('即使 mapper 完成顺序乱序，结果仍按原 index 落位', async () => {
    // index 0 延迟最长最后完成，但 results[0] 仍为其结果
    const items = [1, 2, 3];
    const mapper = (item: number, index: number) =>
      new Promise<number>((resolve) => {
        setTimeout(() => resolve(item * 10), (3 - index) * 15);
      });
    const r = await concurrentMap(items, mapper, 3);
    expect(r).toEqual([10, 20, 30]);
  });

  it('concurrency 默认 10（每个 item 调用一次 mapper）', async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const mapper = vi.fn((x: number) => Promise.resolve(x));
    await concurrentMap(items, mapper);
    expect(mapper).toHaveBeenCalledTimes(12);
  });

  it('mapper 抛错时 worker 记录 console.error 并向上 rethrow', async () => {
    const mapper = (item: number) => {
      if (item === 2) throw new Error('boom');
      return Promise.resolve(item);
    };
    await expect(concurrentMap([1, 2, 3], mapper, 3)).rejects.toThrow('boom');
    expect(errSpy).toHaveBeenCalled();
  });
});

// ─── debounce ────────────────────────────────────────────────────────────

describe('debounce —— 延迟执行与尾部合并', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('单次调用在 wait 后执行一次', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wait 内多次调用仅执行最后一次（前置被取消）', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced('b');
    debounced('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('透传参数', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced(1, 2, 3);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
  });

  it('绑定 this', () => {
    const ctx = { val: 42 };
    const fn = function (this: any, x: number) {
      return (this as any).val + x;
    };
    const spy = vi.fn(fn);
    const debounced = debounce(spy, 50);
    debounced.call(ctx, 8);
    vi.advanceTimersByTime(50);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.instances[0]).toBe(ctx);
    expect(spy).toHaveBeenCalledWith(8);
  });
});

// ─── throttle ────────────────────────────────────────────────────────────

describe('throttle —— 首次立即执行与限流窗口', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('首次调用立即执行', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('限流窗口内后续调用被抑制', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1); // 窗口结束不补执行
  });

  it('窗口结束后下一次调用再次立即执行', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('透传参数与 this', () => {
    const ctx = { n: 1 };
    const fn = function (this: any, x: number) { (this as any).n = x; };
    const spy = vi.fn(fn);
    const throttled = throttle(spy, 50);
    throttled.call(ctx, 99);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.instances[0]).toBe(ctx);
    expect(spy).toHaveBeenCalledWith(99);
    expect((ctx as any).n).toBe(99);
  });
});

// ─── MemoryCache ─────────────────────────────────────────────────────────

describe('MemoryCache —— 基础 CRUD', () => {
  it('get 未命中返回 null', () => {
    const c = new MemoryCache(30000);
    expect(c.get('missing')).toBeNull();
  });

  it('set 后 get 返回值', () => {
    const c = new MemoryCache();
    c.set('k', 'v');
    expect(c.get('k')).toBe('v');
  });

  it('delete 命中返回 true 并移除', () => {
    const c = new MemoryCache();
    c.set('k', 'v');
    expect(c.delete('k')).toBe(true);
    expect(c.get('k')).toBeNull();
  });

  it('delete 未命中返回 false', () => {
    const c = new MemoryCache();
    expect(c.delete('nope')).toBe(false);
  });

  it('clear 清空所有条目', () => {
    const c = new MemoryCache();
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.size()).toBe(0);
    expect(c.get('a')).toBeNull();
  });

  it('has 命中返回 true，未命中返回 false', () => {
    const c = new MemoryCache();
    expect(c.has('x')).toBe(false);
    c.set('x', 1);
    expect(c.has('x')).toBe(true);
  });

  it('size 返回当前未过期条目数', () => {
    const c = new MemoryCache();
    c.set('a', 1);
    c.set('b', 2);
    expect(c.size()).toBe(2);
  });

  it('构造默认 defaultTTL=30000', () => {
    // 间接验证：未过期时仍可取
    const c = new MemoryCache();
    c.set('k', 'v');
    expect(c.get('k')).toBe('v');
  });
});

describe('MemoryCache —— TTL 过期与清理（fake timers）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('默认 TTL 过期后 get 返回 null 且删除条目', () => {
    const c = new MemoryCache(1000);
    c.set('k', 'v');
    expect(c.get('k')).toBe('v');
    vi.advanceTimersByTime(999);
    expect(c.get('k')).toBe('v'); // 边界：未过期（> 判定）
    vi.advanceTimersByTime(2); // 累计 1001 > 1000
    expect(c.get('k')).toBeNull();
  });

  it('expiresAt === 当前时间时仍未过期（严格 > 判定）', () => {
    const c = new MemoryCache(1000);
    c.set('k', 'v'); // expiresAt = 1000
    vi.advanceTimersByTime(1000); // Date.now() === 1000
    expect(c.get('k')).toBe('v'); // 1000 > 1000 = false → 未过期
  });

  it('自定义 TTL 覆盖 defaultTTL', () => {
    const c = new MemoryCache(100000);
    c.set('k', 'v', 500);
    vi.advanceTimersByTime(499);
    expect(c.get('k')).toBe('v');
    vi.advanceTimersByTime(2); // 501 > 500
    expect(c.get('k')).toBeNull();
  });

  it('has 过期返回 false 并删除', () => {
    const c = new MemoryCache(1000);
    c.set('k', 'v');
    vi.advanceTimersByTime(1001);
    expect(c.has('k')).toBe(false);
    expect(c.size()).toBe(0); // has 内部已 delete
  });

  it('size 触发 cleanup 清理过期项', () => {
    const c = new MemoryCache(1000);
    c.set('a', 1);
    c.set('b', 2);
    vi.advanceTimersByTime(1001);
    expect(c.size()).toBe(0); // cleanup 移除全部过期
  });
});

// ─── globalCache ─────────────────────────────────────────────────────────

describe('globalCache —— 模块级单例', () => {
  it('是 MemoryCache 实例', () => {
    expect(globalCache).toBeInstanceOf(MemoryCache);
  });

  it('跨引用共享状态（同一对象）', () => {
    globalCache.set('singleton-key', { n: 1 });
    expect(globalCache.get('singleton-key')).toEqual({ n: 1 });
  });
});

// ─── cachedQuery ─────────────────────────────────────────────────────────

describe('cachedQuery —— 基于 globalCache 的缓存查询', () => {
  it('未命中时调 queryFn 并缓存结果', async () => {
    const qf = vi.fn().mockResolvedValue('fresh');
    const r1 = await cachedQuery('k1', qf);
    expect(r1).toBe('fresh');
    expect(qf).toHaveBeenCalledTimes(1);
    const r2 = await cachedQuery('k1', qf);
    expect(r2).toBe('fresh');
    expect(qf).toHaveBeenCalledTimes(1); // 命中，不再调
  });

  it('queryFn 返回 null 时被视作未命中（get 返回 null 与未命中不可区分 → 不缓存 null）', async () => {
    const qf = vi.fn().mockResolvedValue(null);
    await cachedQuery('null-k', qf);
    await cachedQuery('null-k', qf);
    expect(qf).toHaveBeenCalledTimes(2); // null 不缓存，每次重调
  });

  it('ttl 透传给 globalCache.set，过期后重新调用 queryFn', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    try {
      const qf = vi.fn().mockResolvedValue('v');
      await cachedQuery('ttl-k', qf, 500);
      expect(qf).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(400);
      await cachedQuery('ttl-k', qf, 500);
      expect(qf).toHaveBeenCalledTimes(1); // 未过期
      vi.advanceTimersByTime(200); // 累计 600 > 500
      await cachedQuery('ttl-k', qf, 500);
      expect(qf).toHaveBeenCalledTimes(2); // 过期重调
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── optimizedCount ──────────────────────────────────────────────────────

describe('optimizedCount —— 委托 model.count', () => {
  it('调用 model.count({ where }) 并返回结果', async () => {
    const model = { count: vi.fn().mockResolvedValue(42) };
    const r = await optimizedCount(model, { active: true });
    expect(r).toBe(42);
    expect(model.count).toHaveBeenCalledWith({ where: { active: true } });
  });

  it('透传任意 where（含空对象）', async () => {
    const model = { count: vi.fn().mockResolvedValue(0) };
    const r = await optimizedCount(model, {});
    expect(r).toBe(0);
    expect(model.count).toHaveBeenCalledWith({ where: {} });
  });
});

// ─── optimizedCreateMany ─────────────────────────────────────────────────

describe('optimizedCreateMany —— 分批 createMany 求和', () => {
  it('单批调用 createMany 并返回 count', async () => {
    const model = { createMany: vi.fn().mockResolvedValue({ count: 3 }) };
    const r = await optimizedCreateMany(model, [{ a: 1 }, { a: 2 }, { a: 3 }], 100);
    expect(r).toBe(3);
    expect(model.createMany).toHaveBeenCalledTimes(1);
    expect(model.createMany).toHaveBeenCalledWith({
      data: [{ a: 1 }, { a: 2 }, { a: 3 }],
    });
  });

  it('多批拆分，count 累加', async () => {
    const model = {
      createMany: vi
        .fn()
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 1 }),
    };
    const data = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }];
    const r = await optimizedCreateMany(model, data, 2);
    expect(r).toBe(5);
    expect(model.createMany).toHaveBeenCalledTimes(3);
    expect(model.createMany).toHaveBeenNthCalledWith(1, { data: [{ a: 1 }, { a: 2 }] });
    expect(model.createMany).toHaveBeenNthCalledWith(2, { data: [{ a: 3 }, { a: 4 }] });
    expect(model.createMany).toHaveBeenNthCalledWith(3, { data: [{ a: 5 }] });
  });

  it('默认 batchSize=100（items<=100 单批）', async () => {
    const model = { createMany: vi.fn().mockResolvedValue({ count: 2 }) };
    await optimizedCreateMany(model, [{ a: 1 }, { a: 2 }]);
    expect(model.createMany).toHaveBeenCalledTimes(1);
  });

  it('空 data 数组不调 createMany，返回 0', async () => {
    const model = { createMany: vi.fn() };
    const r = await optimizedCreateMany(model, []);
    expect(r).toBe(0);
    expect(model.createMany).not.toHaveBeenCalled();
  });
});

// ─── withPerformance ─────────────────────────────────────────────────────

describe('withPerformance —— 计时装饰器与慢查询日志', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('包装函数并返回其结果', async () => {
    const func = vi.fn(async () => 'result');
    const wrapped = withPerformance(func, 'myFn');
    expect(await wrapped()).toBe('result');
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('执行时间 >100ms 记录 console.log 慢查询', async () => {
    const func = async () => {
      vi.setSystemTime(new Date(150)); // 模拟 150ms 耗时
      return 'ok';
    };
    const wrapped = withPerformance(func, 'myFn');
    expect(await wrapped()).toBe('ok');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Performance] myFn took 150ms');
  });

  it('执行时间 <=100ms 不记录 console.log', async () => {
    const func = async () => 'ok';
    const wrapped = withPerformance(func, 'fastFn');
    await wrapped();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('func 抛错时 console.error 记录后 rethrow', async () => {
    const func = async () => {
      vi.setSystemTime(new Date(50));
      throw new Error('boom');
    };
    const wrapped = withPerformance(func, 'errFn');
    await expect(wrapped()).rejects.toThrow('boom');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('[Performance] errFn failed after 50ms:');
  });

  it('name 缺省时回退到 func.name', async () => {
    const func = async function myCustomFn() {
      vi.setSystemTime(new Date(150));
      return 1;
    };
    const wrapped = withPerformance(func);
    await wrapped();
    expect(logSpy).toHaveBeenCalledWith('[Performance] myCustomFn took 150ms');
  });

  it('name 缺省且 func.name 为空时回退到 "anonymous"', async () => {
    // 直接传入匿名箭头（无变量名推断）→ func.name === ''
    const wrapped = withPerformance(async () => {
      vi.setSystemTime(new Date(150));
      return 1;
    });
    await wrapped();
    expect(logSpy).toHaveBeenCalledWith('[Performance] anonymous took 150ms');
  });
});

// ─── shouldCompress ──────────────────────────────────────────────────────

describe('shouldCompress —— size > 1024 阈值', () => {
  it('size=0 → false', () => {
    expect(shouldCompress(0)).toBe(false);
  });

  it('size=1024 边界 → false（严格 >）', () => {
    expect(shouldCompress(1024)).toBe(false);
  });

  it('size=1025 → true', () => {
    expect(shouldCompress(1025)).toBe(true);
  });

  it('size 远超阈值 → true', () => {
    expect(shouldCompress(99999)).toBe(true);
  });
});

// ─── optimizedJsonResponse ───────────────────────────────────────────────

describe('optimizedJsonResponse —— JSON 响应构建与体积提示', () => {
  it('默认 status=200，含 Content-Type 与 X-Response-Size', () => {
    const res = optimizedJsonResponse({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    const expectedSize = Buffer.byteLength(JSON.stringify({ a: 1 }), 'utf-8');
    expect(res.headers.get('X-Response-Size')).toBe(String(expectedSize));
  });

  it('自定义 statusCode 透传', () => {
    const res = optimizedJsonResponse({ ok: false }, 500);
    expect(res.status).toBe(500);
  });

  it('body 为 JSON.stringify 结果', async () => {
    const data = { x: 1, y: [2, 3] };
    const res = optimizedJsonResponse(data);
    expect(await res.text()).toBe(JSON.stringify(data));
  });

  it('X-Response-Size 按 utf-8 字节计算（多字节字符）', () => {
    const data = { name: '中' };
    const res = optimizedJsonResponse(data);
    const expectedSize = Buffer.byteLength(JSON.stringify(data), 'utf-8');
    expect(res.headers.get('X-Response-Size')).toBe(String(expectedSize));
    // 多字节字符使字节数 > 字符数
    expect(expectedSize).toBeGreaterThan(JSON.stringify(data).length);
  });

  it('size <= 10240 不加 Cache-Control', () => {
    const res = optimizedJsonResponse({ small: 'data' });
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('size > 10240 加 Cache-Control: public, max-age=60', () => {
    const big = { items: 'x'.repeat(11000) };
    const res = optimizedJsonResponse(big);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  });
});
