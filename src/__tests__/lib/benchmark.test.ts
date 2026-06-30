import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';

// benchmark.ts 仅依赖 perf_hooks 的 performance.now()（无 @/lib/db / next/server 依赖）。
// Node 模块为单例：测试中 import 的 performance 与 benchmark.ts 内绑定指向同一对象，
// 故用 vi.spyOn(performance, 'now') 拦截，使其从预定 ticks 序列取值，
// 精确控制每次迭代记录的耗时（end - start），锁定百分位索引与排序行为。

let ticks: number[] = [];

import {
  benchmark,
  formatBenchmarkResult,
  runBenchmarks,
  generateBenchmarkReport,
  measureMemoryUsage,
  TestDataGenerator,
  testDataGenerator,
} from '@/lib/utils/benchmark';
import type { BenchmarkResult } from '@/lib/utils/benchmark';

/**
 * 按 deltas 序列预填 ticks：每轮迭代消费两个 tick（start / end），
 * 记录耗时 = end - start = deltas[i]。基准时间 t 单调推进，避免负耗时。
 */
function setTicks(deltas: number[]): void {
  ticks.length = 0;
  let t = 0;
  for (const d of deltas) {
    ticks.push(t); // start
    ticks.push(t + d); // end
    t += d;
  }
}

beforeEach(() => {
  ticks.length = 0;
  vi.spyOn(performance, 'now').mockImplementation(() =>
    ticks.length ? (ticks.shift() as number) : 0
  );
});

afterEach(() => {
  ticks.length = 0;
  vi.restoreAllMocks();
});

// ─── benchmark：默认配置 / 自定义 iterations+warmup / 调用计数 ─────────────────

describe('benchmark —— 默认配置与 warmup+iterations 调用计数', () => {
  it('默认 iterations=100 / warmup=10，fn 共调用 110 次', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      return 1;
    };
    setTicks(Array.from({ length: 100 }, () => 1));

    const result = await benchmark('default-opts', fn);

    expect(result.iterations).toBe(100);
    expect(calls).toBe(110); // 10 warmup + 100 timed
    expect(result.name).toBe('default-opts');
  });

  it('自定义 iterations=5 / warmup=2，fn 共调用 7 次', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      return 1;
    };
    setTicks([1, 1, 1, 1, 1]);

    const result = await benchmark('custom', fn, { iterations: 5, warmup: 2 });

    expect(result.iterations).toBe(5);
    expect(calls).toBe(7);
  });

  it('warmup=0 时 fn 仅调用 iterations 次', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      return 1;
    };
    setTicks([10, 20, 30]);

    const result = await benchmark('no-warmup', fn, { iterations: 3, warmup: 0 });

    expect(result.iterations).toBe(3);
    expect(calls).toBe(3);
  });

  it('支持同步 fn 与异步 fn（await fn()）', async () => {
    // 异步 fn：每次 resolve 前向数组 push，benchmark 必须等待其 resolve
    const resolved: number[] = [];
    const asyncFn = async () => {
      await Promise.resolve();
      resolved.push(1);
    };
    setTicks([5]);

    const result = await benchmark('async', asyncFn, { iterations: 1, warmup: 0 });

    expect(result.iterations).toBe(1);
    expect(resolved).toHaveLength(1); // 未 await 则此处为 0
  });
});

// ─── benchmark：统计计算（totalTime/average/min/max/opsPerSecond）──────────────

describe('benchmark —— 统计计算与排序', () => {
  it('totalTime=Σtimes / averageTime=totalTime/iterations / opsPerSecond=1000/avg', async () => {
    // iterations=4, deltas 升序 [2,4,6,8] → times 升序 [2,4,6,8]
    setTicks([2, 4, 6, 8]);

    const r = await benchmark('stats', () => 0, { iterations: 4, warmup: 0 });

    expect(r.totalTime).toBe(20); // 2+4+6+8
    expect(r.averageTime).toBe(5); // 20/4
    expect(r.opsPerSecond).toBe(200); // 1000/5
    expect(r.minTime).toBe(2);
    expect(r.maxTime).toBe(8);
  });

  it('times 升序排序（a-b）：降序输入 [8,6,4,2] → min=2 / max=8', async () => {
    setTicks([8, 6, 4, 2]);

    const r = await benchmark('sort', () => 0, { iterations: 4, warmup: 0 });

    // 排序后 times=[2,4,6,8]；若排序方向反了 min/max 会互换
    expect(r.minTime).toBe(2);
    expect(r.maxTime).toBe(8);
    expect(r.averageTime).toBe(5);
  });

  it('单次迭代：min=max=average=p50=p95=p99', async () => {
    setTicks([7]);

    const r = await benchmark('single', () => 0, { iterations: 1, warmup: 0 });

    expect(r.minTime).toBe(7);
    expect(r.maxTime).toBe(7);
    expect(r.averageTime).toBe(7);
    expect(r.p50).toBe(7);
    expect(r.p95).toBe(7);
    expect(r.p99).toBe(7);
    expect(r.opsPerSecond).toBeCloseTo(1000 / 7, 10);
  });
});

// ─── benchmark：百分位索引 floor(iterations * p) ──────────────────────────────

describe('benchmark —— 百分位索引 Math.floor(iterations * p)', () => {
  it('iterations=100：p50=times[50]=51 / p95=times[95]=96 / p99=times[99]=100', async () => {
    // deltas 升序 [1..100] → times 升序 [1,2,...,100]
    setTicks(Array.from({ length: 100 }, (_, i) => i + 1));

    const r = await benchmark('p100', () => 0, { iterations: 100, warmup: 0 });

    expect(r.minTime).toBe(1);
    expect(r.maxTime).toBe(100);
    expect(r.totalTime).toBe(5050); // Σ1..100
    expect(r.averageTime).toBe(50.5);
    expect(r.p50).toBe(51); // times[floor(100*0.5)] = times[50]
    expect(r.p95).toBe(96); // times[floor(100*0.95)] = times[95]
    expect(r.p99).toBe(100); // times[floor(100*0.99)] = times[99]
  });

  it('iterations=10：floor 生效（9.5→9 / 9.9→9），p95=p99=times[9]=10', async () => {
    // deltas [1..10] → times [1,2,...,10]
    setTicks(Array.from({ length: 10 }, (_, i) => i + 1));

    const r = await benchmark('p10', () => 0, { iterations: 10, warmup: 0 });

    expect(r.p50).toBe(6); // times[floor(5.0)] = times[5]
    expect(r.p95).toBe(10); // times[floor(9.5)] = times[9]，非 round/ceil(→10 越界)
    expect(r.p99).toBe(10); // times[floor(9.9)] = times[9]
  });

  it('iterations=20：p50=times[10]=11 / p95=times[19]=20 / p99=times[19]=20', async () => {
    setTicks(Array.from({ length: 20 }, (_, i) => i + 1));

    const r = await benchmark('p20', () => 0, { iterations: 20, warmup: 0 });

    expect(r.p50).toBe(11); // times[floor(10.0)]
    expect(r.p95).toBe(20); // times[floor(19.0)] = times[19]
    expect(r.p99).toBe(20); // times[floor(19.8)] = times[19]
  });
});

// ─── formatBenchmarkResult：toFixed 精度与行结构 ─────────────────────────────

describe('formatBenchmarkResult —— toFixed 精度与行结构', () => {
  it('totalTime/opsPerSecond 用 toFixed(2)，其余耗时用 toFixed(3)', () => {
    const result: BenchmarkResult = {
      name: 'fmt',
      iterations: 100,
      totalTime: 123.456,
      averageTime: 1.23456,
      minTime: 0.5,
      maxTime: 5.0,
      opsPerSecond: 810.0,
      p50: 1.0,
      p95: 3.0,
      p99: 5.0,
    };

    const out = formatBenchmarkResult(result);

    expect(out).toContain('=== fmt ===');
    expect(out).toContain('迭代次数: 100');
    expect(out).toContain('总耗时: 123.46 ms'); // toFixed(2)
    expect(out).toContain('平均耗时: 1.235 ms'); // toFixed(3)
    expect(out).toContain('最小耗时: 0.500 ms'); // toFixed(3)
    expect(out).toContain('最大耗时: 5.000 ms'); // toFixed(3)
    expect(out).toContain('每秒操作: 810.00 ops/s'); // toFixed(2)
    expect(out).toContain('P50: 1.000 ms'); // toFixed(3)
    expect(out).toContain('P95: 3.000 ms'); // toFixed(3)
    expect(out).toContain('P99: 5.000 ms'); // toFixed(3)
  });

  it('10 行用 \\n 拼接（首行带前导 \\n）', () => {
    const result: BenchmarkResult = {
      name: 'n',
      iterations: 1,
      totalTime: 1,
      averageTime: 1,
      minTime: 1,
      maxTime: 1,
      opsPerSecond: 1000,
      p50: 1,
      p95: 1,
      p99: 1,
    };

    const out = formatBenchmarkResult(result);
    const lines = out.split('\n');

    // 首行 `\n=== n ===` 的前导 \n 使 split 产生 11 段（空串 + 10 行）
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe(''); // 前导 \n
    expect(lines[1]).toBe('=== n ===');
    expect(lines[2]).toBe('迭代次数: 1');
    expect(out.startsWith('\n=== n ===\n迭代次数: 1\n')).toBe(true);
  });
});

// ─── runBenchmarks：顺序执行 / console.log / options 透传 ─────────────────────

describe('runBenchmarks —— 顺序执行并 console.log 每项结果', () => {
  it('逐项运行，每项 console.log 一次格式化结果，返回等长数组', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setTicks([1, 1, 1, 1]); // 2 项 × iterations=1（warmup=0）→ 4 次 now

    const results = await runBenchmarks([
      { name: 'a', fn: () => 0, options: { iterations: 1, warmup: 0 } },
      { name: 'b', fn: () => 0, options: { iterations: 1, warmup: 0 } },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('a');
    expect(results[1].name).toBe('b');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toContain('=== a ===');
    expect(spy.mock.calls[1][0]).toContain('=== b ===');
  });

  it('options 透传至 benchmark（iterations 反映在结果）', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setTicks([1, 1, 1]); // 3 次 now = iterations=3（warmup=0）

    const [r] = await runBenchmarks([
      { name: 'x', fn: () => 0, options: { iterations: 3, warmup: 0 } },
    ]);

    expect(r.iterations).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('空数组返回空数组且不 console.log', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const results = await runBenchmarks([]);

    expect(results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── generateBenchmarkReport：markdown 结构 ──────────────────────────────────

describe('generateBenchmarkReport —— markdown 报表结构', () => {
  it('空结果：仅标题 + 表头 + 空详细段', () => {
    const report = generateBenchmarkReport([]);

    expect(report.startsWith('# 性能基准测试报告')).toBe(true);
    expect(report).toContain('## 测试结果汇总');
    expect(report).toContain('| 测试项 | 平均耗时(ms) | P95(ms) | P99(ms) | 每秒操作 |');
    expect(report).toContain('|--------|-------------|---------|---------|----------|');
    expect(report).toContain('## 详细结果');
    // 无数据行
    expect(report).not.toContain('### ');
  });

  it('含结果：表格行 + 详细小节，含 toFixed 精度', () => {
    const result: BenchmarkResult = {
      name: 'bench-A',
      iterations: 50,
      totalTime: 250.5,
      averageTime: 5.01,
      minTime: 1,
      maxTime: 9,
      opsPerSecond: 199.6,
      p50: 5,
      p95: 8,
      p99: 9,
    };

    const report = generateBenchmarkReport([result]);

    // 表格行
    expect(report).toContain(
      '| bench-A | 5.010 | 8.000 | 9.000 | 199.60 |'
    );
    // 详细小节
    expect(report).toContain('### bench-A');
    expect(report).toContain('- 迭代次数: 50');
    expect(report).toContain('- 总耗时: 250.50 ms'); // toFixed(2)
    expect(report).toContain('- 平均耗时: 5.010 ms'); // toFixed(3)
    expect(report).toContain('- 最小耗时: 1.000 ms');
    expect(report).toContain('- 最大耗时: 9.000 ms');
    expect(report).toContain('- 每秒操作: 199.60 ops/s');
    expect(report).toContain('- P50: 5.000 ms');
    expect(report).toContain('- P95: 8.000 ms');
    expect(report).toContain('- P99: 9.000 ms');
  });

  it('生成时间为合法 ISO 字符串', () => {
    const report = generateBenchmarkReport([]);

    const match = report.match(/生成时间: (.+)/);
    expect(match).not.toBeNull();
    const ts = new Date(match![1]);
    expect(ts.toString()).not.toBe('Invalid Date');
  });

  it('多结果：每个生成一行表格 + 一个小节', () => {
    const a: BenchmarkResult = {
      name: 'a', iterations: 1, totalTime: 1, averageTime: 1, minTime: 1,
      maxTime: 1, opsPerSecond: 1000, p50: 1, p95: 1, p99: 1,
    };
    const b: BenchmarkResult = {
      name: 'b', iterations: 1, totalTime: 2, averageTime: 2, minTime: 2,
      maxTime: 2, opsPerSecond: 500, p50: 2, p95: 2, p99: 2,
    };

    const report = generateBenchmarkReport([a, b]);

    expect(report).toContain('### a');
    expect(report).toContain('### b');
    expect(report.match(/\| a \|/g)).toHaveLength(1);
    expect(report.match(/\| b \|/g)).toHaveLength(1);
  });
});

// ─── measureMemoryUsage：除以 1024/1024 转换为 MB ────────────────────────────

describe('measureMemoryUsage —— process.memoryUsage 除以 1024/1024', () => {
  it('所有字段除以 1024/1024 转为 MB', () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 1048576, // 1 MB
      heapTotal: 2097152, // 2 MB
      heapUsed: 3145728, // 3 MB
      external: 4194304, // 4 MB
      arrayBuffers: 524288, // 0.5 MB
    } as NodeJS.MemoryUsage);

    const mem = measureMemoryUsage();

    expect(mem.rss).toBe(1);
    expect(mem.heapTotal).toBe(2);
    expect(mem.heapUsed).toBe(3);
    expect(mem.external).toBe(4);
    expect(mem.arrayBuffers).toBe(0.5);
  });

  it('返回字段集合为 rss/heapTotal/heapUsed/external/arrayBuffers', () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0,
    } as NodeJS.MemoryUsage);

    const mem = measureMemoryUsage();

    expect(Object.keys(mem).sort()).toEqual(
      ['arrayBuffers', 'external', 'heapTotal', 'heapUsed', 'rss']
    );
  });
});

// ─── TestDataGenerator：随机串 / 文件名 / 内容 / 用户 / 批量 ─────────────────

describe('TestDataGenerator —— randomString', () => {
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  it('默认长度 10', () => {
    const g = new TestDataGenerator();
    const s = g.randomString();
    expect(s).toHaveLength(10);
  });

  it('自定义长度', () => {
    const g = new TestDataGenerator();
    expect(g.randomString(0)).toBe('');
    expect(g.randomString(20)).toHaveLength(20);
    expect(g.randomString(100)).toHaveLength(100);
  });

  it('所有字符均取自 charset', () => {
    const g = new TestDataGenerator();
    for (let i = 0; i < 50; i++) {
      const s = g.randomString(30);
      for (const ch of s) {
        expect(CHARSET).toContain(ch);
      }
    }
  });
});

describe('TestDataGenerator —— generateFileName（counter 自增 + 扩展名）', () => {
  it('默认扩展名 txt，格式 test-file-{counter}-{rand8}.txt', () => {
    const g = new TestDataGenerator();
    const name = g.generateFileName();
    expect(name).toMatch(/^test-file-1-[A-Za-z0-9]{8}\.txt$/);
  });

  it('counter 在实例内自增', () => {
    const g = new TestDataGenerator();
    const n1 = g.generateFileName();
    const n2 = g.generateFileName();
    const n3 = g.generateFileName();
    expect(n1).toMatch(/^test-file-1-/);
    expect(n2).toMatch(/^test-file-2-/);
    expect(n3).toMatch(/^test-file-3-/);
  });

  it('自定义扩展名', () => {
    const g = new TestDataGenerator();
    expect(g.generateFileName('json')).toMatch(/\.json$/);
    expect(g.generateFileName('pdf')).toMatch(/\.pdf$/);
  });
});

describe('TestDataGenerator —— generateFileContent（默认 1024）', () => {
  it('默认 size=1024', () => {
    const g = new TestDataGenerator();
    expect(g.generateFileContent()).toHaveLength(1024);
  });

  it('自定义 size', () => {
    const g = new TestDataGenerator();
    expect(g.generateFileContent(50)).toHaveLength(50);
    expect(g.generateFileContent(0)).toBe('');
  });
});

describe('TestDataGenerator —— generateUser（counter 自增 + 固定字段）', () => {
  it('email/name/password 格式正确', () => {
    const g = new TestDataGenerator();
    const u = g.generateUser();
    expect(u.email).toMatch(/^test-user-1-[A-Za-z0-9]{6}@example\.com$/);
    expect(u.name).toBe('测试用户1');
    expect(u.password).toBe('Test@123456');
  });

  it('counter 自增', () => {
    const g = new TestDataGenerator();
    g.generateUser();
    const u2 = g.generateUser();
    expect(u2.name).toBe('测试用户2');
    expect(u2.email).toMatch(/^test-user-2-/);
  });
});

describe('TestDataGenerator —— counter 跨方法共享', () => {
  it('generateFileName 与 generateUser 共用同一 counter', () => {
    const g = new TestDataGenerator();
    g.generateFileName(); // counter → 1
    g.generateUser(); // counter → 2
    const name = g.generateFileName(); // counter → 3

    expect(name).toMatch(/^test-file-3-/);
  });
});

describe('TestDataGenerator —— generateBatch', () => {
  it('按 index 0..count-1 调用 generator 并收集结果', () => {
    const g = new TestDataGenerator();
    const items = g.generateBatch(5, (i) => `item-${i}`);

    expect(items).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
  });

  it('count=0 返回空数组', () => {
    const g = new TestDataGenerator();
    expect(g.generateBatch(0, () => 'x')).toEqual([]);
  });

  it('生成对象批量', () => {
    const g = new TestDataGenerator();
    const items = g.generateBatch(3, (i) => ({ id: i, label: `L${i}` }));

    expect(items).toEqual([
      { id: 0, label: 'L0' },
      { id: 1, label: 'L1' },
      { id: 2, label: 'L2' },
    ]);
  });
});

describe('testDataGenerator —— 默认导出实例', () => {
  it('是 TestDataGenerator 实例', () => {
    expect(testDataGenerator).toBeInstanceOf(TestDataGenerator);
  });

  it('默认实例的 randomString 可正常工作', () => {
    expect(testDataGenerator.randomString(5)).toHaveLength(5);
  });
});
