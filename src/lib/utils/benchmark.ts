/**
 * 性能基准测试工具
 * 用于测试API、数据库等性能指标
 */

import { performance } from "perf_hooks";

// 性能测试结果
export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
  p50: number;
  p95: number;
  p99: number;
}

// 性能测试配置
export interface BenchmarkOptions {
  iterations?: number;
  warmup?: number;
  timeout?: number;
}

/**
 * 运行性能基准测试
 */
export async function benchmark(
  name: string,
  fn: () => Promise<any> | any,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const { iterations = 100, warmup = 10 } = options;

  // 预热
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // 运行测试
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  // 计算统计数据
  times.sort((a, b) => a - b);

  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const averageTime = totalTime / iterations;
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const opsPerSecond = 1000 / averageTime;

  // 百分位数
  const p50 = times[Math.floor(iterations * 0.5)];
  const p95 = times[Math.floor(iterations * 0.95)];
  const p99 = times[Math.floor(iterations * 0.99)];

  return {
    name,
    iterations,
    totalTime,
    averageTime,
    minTime,
    maxTime,
    opsPerSecond,
    p50,
    p95,
    p99,
  };
}

/**
 * 格式化性能测试结果
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  const lines = [
    `\n=== ${result.name} ===`,
    `迭代次数: ${result.iterations}`,
    `总耗时: ${result.totalTime.toFixed(2)} ms`,
    `平均耗时: ${result.averageTime.toFixed(3)} ms`,
    `最小耗时: ${result.minTime.toFixed(3)} ms`,
    `最大耗时: ${result.maxTime.toFixed(3)} ms`,
    `每秒操作: ${result.opsPerSecond.toFixed(2)} ops/s`,
    `P50: ${result.p50.toFixed(3)} ms`,
    `P95: ${result.p95.toFixed(3)} ms`,
    `P99: ${result.p99.toFixed(3)} ms`,
  ];

  return lines.join("\n");
}

/**
 * 批量运行性能测试
 */
export async function runBenchmarks(
  benchmarks: Array<{
    name: string;
    fn: () => Promise<any> | any;
    options?: BenchmarkOptions;
  }>
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const { name, fn, options } of benchmarks) {
    const result = await benchmark(name, fn, options);
    results.push(result);
    console.log(formatBenchmarkResult(result));
  }

  return results;
}

/**
 * 生成性能测试报告
 */
export function generateBenchmarkReport(results: BenchmarkResult[]): string {
  const lines = [
    "# 性能基准测试报告",
    "",
    `生成时间: ${new Date().toISOString()}`,
    "",
    "## 测试结果汇总",
    "",
    "| 测试项 | 平均耗时(ms) | P95(ms) | P99(ms) | 每秒操作 |",
    "|--------|-------------|---------|---------|----------|",
  ];

  for (const result of results) {
    lines.push(
      `| ${result.name} | ${result.averageTime.toFixed(3)} | ${result.p95.toFixed(3)} | ${result.p99.toFixed(3)} | ${result.opsPerSecond.toFixed(2)} |`
    );
  }

  lines.push("", "## 详细结果", "");

  for (const result of results) {
    lines.push(
      `### ${result.name}`,
      "",
      `- 迭代次数: ${result.iterations}`,
      `- 总耗时: ${result.totalTime.toFixed(2)} ms`,
      `- 平均耗时: ${result.averageTime.toFixed(3)} ms`,
      `- 最小耗时: ${result.minTime.toFixed(3)} ms`,
      `- 最大耗时: ${result.maxTime.toFixed(3)} ms`,
      `- 每秒操作: ${result.opsPerSecond.toFixed(2)} ops/s`,
      `- P50: ${result.p50.toFixed(3)} ms`,
      `- P95: ${result.p95.toFixed(3)} ms`,
      `- P99: ${result.p99.toFixed(3)} ms`,
      ""
    );
  }

  return lines.join("\n");
}

/**
 * 内存使用监控
 */
export function measureMemoryUsage(): {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
} {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss / 1024 / 1024, // MB
    heapTotal: mem.heapTotal / 1024 / 1024,
    heapUsed: mem.heapUsed / 1024 / 1024,
    external: mem.external / 1024 / 1024,
    arrayBuffers: mem.arrayBuffers / 1024 / 1024,
  };
}

/**
 * 测试数据生成器
 */
export class TestDataGenerator {
  private counter = 0;

  /**
   * 生成随机字符串
   */
  randomString(length: number = 10): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 生成测试文件名
   */
  generateFileName(extension: string = "txt"): string {
    this.counter++;
    return `test-file-${this.counter}-${this.randomString(8)}.${extension}`;
  }

  /**
   * 生成测试文件内容
   */
  generateFileContent(size: number = 1024): string {
    return this.randomString(size);
  }

  /**
   * 生成测试用户数据
   */
  generateUser(): {
    email: string;
    name: string;
    password: string;
  } {
    this.counter++;
    return {
      email: `test-user-${this.counter}-${this.randomString(6)}@example.com`,
      name: `测试用户${this.counter}`,
      password: "Test@123456",
    };
  }

  /**
   * 生成批量测试数据
   */
  generateBatch<T>(count: number, generator: (index: number) => T): T[] {
    const items: T[] = [];
    for (let i = 0; i < count; i++) {
      items.push(generator(i));
    }
    return items;
  }
}

// 导出默认实例
export const testDataGenerator = new TestDataGenerator();
