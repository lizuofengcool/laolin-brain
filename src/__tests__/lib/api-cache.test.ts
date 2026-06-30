import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cachedFetch, invalidateCache, getCacheStats } from '@/lib/api-cache';

// api-cache.ts 仅依赖全局 fetch（无 @/lib/db / next/server 等模块依赖），
// 故只需 stubGlobal('fetch', mockFetch) 隔离网络。模块级 cache Map 在单文件内
// 跨用例持久，每个 beforeEach 用 invalidateCache() 清空，避免用例间污染。

const mockFetch = vi.fn();

/** 构造类 fetch Response 对象：ok/status/statusText/json()。 */
function mockResponse<T>(data: T, { status = 200, statusText = 'OK' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => data,
  };
}

beforeEach(() => {
  invalidateCache();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── cachedFetch：命中 / 未命中 / 非 ok / 非 GET 不缓存 ───────────────────────

describe('cachedFetch —— 命中/未命中/非 ok 抛错/非 GET 不缓存', () => {
  it('未命中时调 fetch 并返回解析后的 JSON', async () => {
    mockFetch.mockResolvedValue(mockResponse({ items: [1, 2, 3] }));

    const data = await cachedFetch('/api/files');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/files', undefined);
    expect(data).toEqual({ items: [1, 2, 3] });
  });

  it('命中时直接返回缓存数据，不再调 fetch', async () => {
    mockFetch.mockResolvedValue(mockResponse({ ts: 1 }));

    await cachedFetch('/api/files');
    const second = await cachedFetch('/api/files');

    expect(second).toEqual({ ts: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1); // 第二次命中，未触网
  });

  it('同一 url 不同 method 视为不同缓存键（GET 命中不污染 POST）', async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true }));

    await cachedFetch('/api/files', { method: 'GET' });
    await cachedFetch('/api/files', { method: 'POST' });

    // GET 与 POST 键不同，POST 不命中 GET 缓存 → 两次 fetch
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('非 2xx 响应抛错，错误信息含 status / statusText / url', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ err: 'boom' }, { status: 500, statusText: 'Internal Server Error' })
    );

    await expect(cachedFetch('/api/fail')).rejects.toThrow(
      'cachedFetch error: 500 Internal Server Error for /api/fail'
    );
    // 抛错后不写缓存
    expect(getCacheStats().size).toBe(0);
  });

  it('非 GET（POST/PUT/DELETE）不写缓存（仅 GET 缓存）', async () => {
    mockFetch.mockResolvedValue(mockResponse({ done: true }));

    await cachedFetch('/api/files', { method: 'POST' });
    await cachedFetch('/api/files', { method: 'POST' });

    // 两次 POST 均未命中且不缓存 → 两次 fetch + 缓存仍为空
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(getCacheStats().size).toBe(0);
  });

  it('method 缺省时按 GET 处理并缓存', async () => {
    mockFetch.mockResolvedValue(mockResponse({ a: 1 }));

    await cachedFetch('/api/files'); // options 缺省 → method 默认 GET
    await cachedFetch('/api/files', { method: 'GET' }); // 显式 GET 同键 → 命中

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getCacheStats().size).toBe(1);
  });

  it('泛型类型透传：返回值形状与 fetch 解析一致', async () => {
    mockFetch.mockResolvedValue(mockResponse({ name: 'x', count: 7 }));

    const data = await cachedFetch<{ name: string; count: number }>('/api/files');

    expect(data.name).toBe('x');
    expect(data.count).toBe(7);
  });
});

// ─── detectTTL：URL 模式自动分类（经 getCacheStats ttl 秒数验证） ──────────────

describe('detectTTL —— URL 模式自动分类（经 getCacheStats.ttl 秒数锁定）', () => {
  // 每个 ttl 用例：单次 GET 写缓存后断言 getCacheStats().entries[0].ttl（秒）
  function ttlOf(url: string, explicitTtl?: number): number {
    return getCacheStats().entries.find((e) => e.key.includes(url))?.ttl ?? -1;
  }

  it('/search 与 /semantic → 30s（search 档）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/search');
    await cachedFetch('/api/semantic');
    const stats = getCacheStats();
    expect(stats.entries.find((e) => e.key.includes('/api/search'))?.ttl).toBe(30);
    expect(stats.entries.find((e) => e.key.includes('/api/semantic'))?.ttl).toBe(30);
  });

  it('/files 与 /folders → 300s（fileList 档）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files');
    await cachedFetch('/api/folders');
    const stats = getCacheStats();
    expect(stats.entries.find((e) => e.key.includes('/api/files'))?.ttl).toBe(300);
    expect(stats.entries.find((e) => e.key.includes('/api/folders'))?.ttl).toBe(300);
  });

  it('/dashboard / /analytics / /stats → 120s（dashboard 档）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/dashboard');
    await cachedFetch('/api/analytics');
    await cachedFetch('/api/stats');
    const stats = getCacheStats();
    expect(stats.entries.find((e) => e.key.includes('/api/dashboard'))?.ttl).toBe(120);
    expect(stats.entries.find((e) => e.key.includes('/api/analytics'))?.ttl).toBe(120);
    expect(stats.entries.find((e) => e.key.includes('/api/stats'))?.ttl).toBe(120);
  });

  it('无匹配模式 → 60s（generic 兜底）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/unknown-endpoint');
    expect(ttlOf('/api/unknown-endpoint')).toBe(60);
  });

  it('显式 ttl 覆盖自动检测（/files 默认 300s，显式 5000ms → 5s）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files', undefined, 5000);
    expect(ttlOf('/api/files')).toBe(5);
  });

  it('模式优先级：/files/search 同时命中 /files 与 /search → 取 search(30s)', async () => {
    // detectTTL 先判 /search||/semantic 再判 /files，故 /files/search 走 30s
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files/search');
    expect(ttlOf('/api/files/search')).toBe(30);
  });
});

// ─── generateCacheKey：method / auth / body 组合（经 getCacheStats.key 验证） ──

describe('generateCacheKey —— method 大小写归一 / auth 三形态 / body 切片', () => {
  it('method 大小写归一：get 与 GET 产生同一键（第二次命中）', async () => {
    mockFetch.mockResolvedValue(mockResponse({ v: 1 }));

    await cachedFetch('/api/x', { method: 'get' });
    await cachedFetch('/api/x', { method: 'GET' }); // 同键 → 命中

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Headers 实例：Authorization 计入键', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x', { headers: new Headers({ Authorization: 'Bearer h1' }) });
    expect(getCacheStats().entries[0].key).toBe('GET:/api/x:Bearer h1');
  });

  it('数组 headers：Authorization 计入键', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x', {
      headers: [['Authorization', 'Bearer arr']] as unknown as Headers,
    });
    expect(getCacheStats().entries[0].key).toBe('GET:/api/x:Bearer arr');
  });

  it('对象 headers：Authorization 计入键', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x', { headers: { Authorization: 'Bearer obj' } });
    expect(getCacheStats().entries[0].key).toBe('GET:/api/x:Bearer obj');
  });

  it('无 headers 时键尾部为空（method:url:）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x');
    expect(getCacheStats().entries[0].key).toBe('GET:/api/x:');
  });

  it('不同 auth 视为不同键（两份缓存，互不命中）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x', { headers: { Authorization: 'Bearer A' } });
    await cachedFetch('/api/x', { headers: { Authorization: 'Bearer B' } });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(getCacheStats().size).toBe(2);
  });

  it('string body 计入键：不同 body → 不同键', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x', { body: 'abc' });
    await cachedFetch('/api/x', { body: 'xyz' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(getCacheStats().size).toBe(2);
  });

  it('string body 截断 256：前 256 字符相同则视为同键（命中）', async () => {
    // 两段 body 仅在第 257 字符不同，slice(0,256) 后同键 → 第二次命中
    const same = 'a'.repeat(256);
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x', { body: same + 'X' });
    await cachedFetch('/api/x', { body: same + 'Y' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getCacheStats().size).toBe(1);
  });

  it('非 string body 不计入键：两份不同对象 body → 同键命中', async () => {
    // typeof body !== 'string' → body 段为空，键仅 method:url:auth
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/x', { body: { foo: 1 } as unknown as BodyInit });
    await cachedFetch('/api/x', { body: { bar: 2 } as unknown as BodyInit });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getCacheStats().entries[0].key).toBe('GET:/api/x:');
  });
});

// ─── invalidateCache：子串匹配清除 ───────────────────────────────────────────

describe('invalidateCache —— 子串匹配 / 全量清空', () => {
  it('pattern 子串匹配：仅删匹配项，保留其余', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files/a');
    await cachedFetch('/api/notes/b');

    invalidateCache('/api/files');

    const stats = getCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.entries[0].key).toContain('/api/notes/b');
  });

  it('无 pattern：清空全部', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files/a');
    await cachedFetch('/api/notes/b');

    invalidateCache();

    expect(getCacheStats().size).toBe(0);
  });

  it('pattern 无匹配：不删除任何项', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files/a');

    invalidateCache('/nonexistent-pattern');

    expect(getCacheStats().size).toBe(1);
  });
});

// ─── getCacheStats：诊断信息 ─────────────────────────────────────────────────

describe('getCacheStats —— 诊断信息（size / key 截断 / age / ttl）', () => {
  it('空缓存返回 size 0 与空 entries', () => {
    const stats = getCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.entries).toEqual([]);
  });

  it('键超 80 字符时截断为 80 + …（共 81 字符）', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    // url 足够长使键 >80：'GET:' + url + ':' 总长 > 80
    const longUrl = '/api/' + 'x'.repeat(80);
    await cachedFetch(longUrl);

    const entry = getCacheStats().entries[0];
    expect(entry.key.length).toBe(81);
    expect(entry.key.endsWith('…')).toBe(true);
    expect(entry.key.startsWith('GET:/api/xxxx')).toBe(true);
  });

  it('刚写入项 age=0、ttl 为秒数', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files'); // fileList → 300s

    const entry = getCacheStats().entries[0];
    expect(entry.age).toBe(0);
    expect(entry.ttl).toBe(300);
  });
});

// ─── TTL 过期与 FIFO 淘汰（fake timers 控时） ─────────────────────────────────

describe('TTL 过期与 FIFO 淘汰（fake timers）', () => {
  const BASE = new Date('2024-01-01T00:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers({ now: BASE });
    invalidateCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ttl-1 仍命中、到达 ttl 边界即过期（< 严格小于，非 <=）', async () => {
    mockFetch.mockResolvedValue(mockResponse({ v: 'first' }));

    await cachedFetch('/api/files', undefined, 1000); // ttl=1000ms，写入 ts=BASE
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 前进 999ms：999 < 1000 → 仍新鲜 → 命中
    vi.advanceTimersByTime(999);
    await cachedFetch('/api/files', undefined, 1000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 再前进 1ms 到达 1000：1000 < 1000 为 false → 过期 → 重新 fetch
    vi.advanceTimersByTime(1);
    mockFetch.mockResolvedValue(mockResponse({ v: 'second' }));
    const data = await cachedFetch('/api/files', undefined, 1000);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(data).toEqual({ v: 'second' });
  });

  it('过期后重新 fetch 并以新时间戳刷新缓存（新有效期起点为本次写入）', async () => {
    mockFetch.mockResolvedValue(mockResponse({ n: 1 }));
    await cachedFetch('/api/files', undefined, 1000); // 有效 [BASE, BASE+1000)

    vi.advanceTimersByTime(1500); // 已过期 500ms
    mockFetch.mockResolvedValue(mockResponse({ n: 2 }));
    await cachedFetch('/api/files', undefined, 1000); // 重写 ts=BASE+1500

    // 自重写后再前进 999ms（未到新边界 BASE+1500+1000）→ 应命中
    vi.advanceTimersByTime(999);
    const data = await cachedFetch('/api/files', undefined, 1000);

    expect(mockFetch).toHaveBeenCalledTimes(2); // 仅初始 + 过期重写两次触网
    expect(data).toEqual({ n: 2 });
  });

  it('cacheEvictFifo 主动清理过期项：插入新项前先清掉已过期项', async () => {
    mockFetch.mockResolvedValue(mockResponse({}));
    await cachedFetch('/api/files/a', undefined, 1000); // ttl=1000，ts=BASE
    expect(getCacheStats().size).toBe(1);

    vi.advanceTimersByTime(2000); // a 已过期（2000 >= 1000）

    // 插入 b（不同 url → 不同键 → miss → 触发 cacheEvictFifo 再 set）
    await cachedFetch('/api/files/b', undefined, 60000);

    // 主动清理把过期 a 删掉，仅剩 b（若不清理 size 会是 2）
    const stats = getCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.entries[0].key).toContain('/api/files/b');
  });

  it('FIFO 容量上限 1000：第 1001 项淘汰最旧项（Map 插入序）', async () => {
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(mockResponse({ url }))
    );

    // 写入 1001 项（i=0..1000），全部新鲜（/files → 5min，无过期）
    for (let i = 0; i <= 1000; i++) {
      await cachedFetch(`/api/files/${i}`);
    }

    // 容量上限 1000：最旧的第 0 项被 FIFO 淘汰
    expect(getCacheStats().size).toBe(1000);

    mockFetch.mockClear();
    // 第 1 项仍缓存 → 命中（必须先验证命中项，再验证被淘汰项，否则淘汰项的
    // 重写入会再触发一轮 FIFO 淘汰第 1 项）
    await cachedFetch('/api/files/1');
    expect(mockFetch).not.toHaveBeenCalled();

    // 第 0 项已被淘汰 → miss → 重新 fetch
    await cachedFetch('/api/files/0');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
