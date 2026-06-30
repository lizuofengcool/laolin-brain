import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// monitoring.ts 仅依赖 node 'os' 内置 + process 全局（无 @/lib/db / next/server 依赖）。
// MetricsCollector / AlertManager 类未导出，仅导出单例 metricsCollector / alertManager：
// - metricsCollector 提供 reset()，beforeEach 重置即可隔离。
// - alertManager 无 reset()，且模块导入时即注册 3 条默认规则（cpu.usage>80 / memory.usage>85 /
//   requests.errorRate>5）。为避免跨测试规则/历史污染，AlertManager 用例在 beforeEach 中
//   vi.resetModules() + 动态 import 获取全新模块（全新 alertManager，恰 3 条默认规则）。
// - getSystemMetrics 的 CPU 使用率公式 `100 - ~~((totalIdle/totalTick)*100)` 用 vi.spyOn(os, 'cpus')
//   控制 os.cpus() 返回值。源码 `import os from "os"`（default）拿到的是 require('os') 即
//   module.exports 单例；测试同用 default import 共享同一对象，vi.spyOn 直接生效（同 benchmark
//   测试 vi.spyOn(performance,'now') 模式）。~~ 为双按位取非（截断），用 33.5 这种 trunc≠round
//   的值锁定截断语义。
// - performHealthCheck 内部分别调用 getSystemMetrics()（取 memory / cpu）与
//   metricsCollector.getApplicationMetrics()（取 errorRate），故用 os spy + metricsCollector.reset
//   联合驱动各检查项分支与整体状态优先级（critical > unhealthy > degraded > healthy）。

import os from 'os';
import {
  metricsCollector,
  getSystemMetrics,
  performHealthCheck,
  metricsMiddleware,
} from '@/lib/monitoring/monitoring';
import type {
  SystemMetrics,
  ApplicationMetrics,
  AlertRule,
} from '@/lib/monitoring/monitoring';

type MonitoringModule = typeof import('@/lib/monitoring/monitoring');

// 设置 os.* spy 默认返回「全 healthy」基线：cpu idle=50/user=50 → usage=50，
// totalmem=100/freemem=50 → used=50/usage=50%。具体用例可按需覆盖。
function setOsDefaults(): void {
  vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 50, user: 50 } } as never]);
  vi.spyOn(os, 'totalmem').mockReturnValue(100);
  vi.spyOn(os, 'freemem').mockReturnValue(50);
  vi.spyOn(os, 'loadavg').mockReturnValue([0, 0, 0]);
}

// 构造 checkAlerts 所需的 (SystemMetrics & ApplicationMetrics) 联合对象。
// checkAlerts 仅读取 cpu.usage / memory.usage / disk.usage / requests.errorRate / requests.perSecond。
function makeMetrics(
  overrides: Partial<{
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    errorRate: number;
    perSecond: number;
  }> = {}
): SystemMetrics & ApplicationMetrics {
  return {
    cpu: { usage: overrides.cpuUsage ?? 50, cores: 1, loadAverage: [] },
    memory: {
      usage: overrides.memoryUsage ?? 50,
      total: 100,
      used: 50,
      free: 50,
    },
    disk: { usage: overrides.diskUsage ?? 50, total: 100, used: 50, free: 50 },
    requests: {
      errorRate: overrides.errorRate ?? 0,
      perSecond: overrides.perSecond ?? 10,
      total: 0,
      success: 0,
      failed: 0,
    },
  } as SystemMetrics & ApplicationMetrics;
}

beforeEach(() => {
  metricsCollector.reset();
  setOsDefaults();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── MetricsCollector.recordRequest —— 计数 / 错误 / 端点统计 ─────────────────────

describe('MetricsCollector.recordRequest —— 总计/错误/端点统计', () => {
  it('单次 200：total=1, success=1, failed=0, errorRate=0', () => {
    metricsCollector.recordRequest('/api/a', 10, 200);
    const m = metricsCollector.getApplicationMetrics();
    expect(m.requests.total).toBe(1);
    expect(m.requests.success).toBe(1);
    expect(m.requests.failed).toBe(0);
    expect(m.requests.errorRate).toBe(0);
  });

  it('单次 500：failed=1, errorRate=100（statusCode>=400 计为错误）', () => {
    metricsCollector.recordRequest('/api/a', 10, 500);
    const m = metricsCollector.getApplicationMetrics();
    expect(m.requests.total).toBe(1);
    expect(m.requests.failed).toBe(1);
    expect(m.requests.success).toBe(0);
    expect(m.requests.errorRate).toBe(100);
  });

  it('边界：399 不计错误，400 计错误（>=400）', () => {
    metricsCollector.recordRequest('/api/a', 1, 399);
    metricsCollector.recordRequest('/api/b', 1, 400);
    const m = metricsCollector.getApplicationMetrics();
    expect(m.requests.total).toBe(2);
    expect(m.requests.failed).toBe(1);
    expect(m.requests.errorRate).toBe(50);
  });

  it('errorRate = errors/total*100（3/10=30）', () => {
    for (let i = 0; i < 7; i++) metricsCollector.recordRequest('/api/a', 1, 200);
    for (let i = 0; i < 3; i++) metricsCollector.recordRequest('/api/a', 1, 500);
    expect(metricsCollector.getApplicationMetrics().requests.errorRate).toBe(30);
  });

  it('端点统计：requests=count, avgResponseTime=totalTime/count, errorRate=errors/count*100', () => {
    metricsCollector.recordRequest('/api/a', 100, 200);
    metricsCollector.recordRequest('/api/a', 200, 200);
    metricsCollector.recordRequest('/api/a', 50, 500);
    const ep = metricsCollector.getApplicationMetrics().endpoints['/api/a'];
    expect(ep.requests).toBe(3);
    expect(ep.avgResponseTime).toBe(350 / 3); // (100+200+50)/3
    expect(ep.errorRate).toBe((1 / 3) * 100);
  });

  it('多端点分别统计', () => {
    metricsCollector.recordRequest('/api/a', 10, 200);
    metricsCollector.recordRequest('/api/b', 20, 500);
    const m = metricsCollector.getApplicationMetrics();
    expect(Object.keys(m.endpoints).sort()).toEqual(['/api/a', '/api/b']);
    expect(m.endpoints['/api/a'].requests).toBe(1);
    expect(m.endpoints['/api/b'].requests).toBe(1);
    expect(m.endpoints['/api/b'].errorRate).toBe(100);
  });

  it('端点首条记录初始化 statusCodes 子表（间接经 recordRequest 计数）', () => {
    metricsCollector.recordRequest('/api/a', 1, 200);
    metricsCollector.recordRequest('/api/a', 1, 200);
    metricsCollector.recordRequest('/api/a', 1, 500);
    // 同一端点累计 3 次，avgResponseTime 反映累计 totalTime
    const ep = metricsCollector.getApplicationMetrics().endpoints['/api/a'];
    expect(ep.requests).toBe(3);
    expect(ep.avgResponseTime).toBe(1); // (1+1+1)/3
  });
});

// ─── MetricsCollector.getApplicationMetrics —— 派生字段 / 未实现占位 ───────────────

describe('MetricsCollector.getApplicationMetrics —— 派生字段与未实现占位', () => {
  it('perSecond = totalRequests / uptime（uptime=(now-startTime)/1000）：5 请求 / 1 秒 = 5', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    metricsCollector.reset(); // startTime = 1_000_000
    for (let i = 0; i < 5; i++) metricsCollector.recordRequest('/api/a', 1, 200);
    now.mockReturnValue(1_001_000); // uptime = (1001000-1000000)/1000 = 1
    expect(metricsCollector.getApplicationMetrics().requests.perSecond).toBe(5);
  });

  it('perSecond 守卫：uptime=0 时返回 0（不除零）', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    metricsCollector.reset(); // startTime = now = 1_000_000 → uptime = 0
    metricsCollector.recordRequest('/api/a', 1, 200);
    expect(metricsCollector.getApplicationMetrics().requests.perSecond).toBe(0);
  });

  it('success = total - errors', () => {
    metricsCollector.recordRequest('/api/a', 1, 200);
    metricsCollector.recordRequest('/api/a', 1, 200);
    metricsCollector.recordRequest('/api/a', 1, 500);
    const m = metricsCollector.getApplicationMetrics();
    expect(m.requests.total).toBe(3);
    expect(m.requests.failed).toBe(1);
    expect(m.requests.success).toBe(2); // 3 - 1
  });

  it('responseTime 统计恒为 0（average/p50/p95/p99/max 未实现）', () => {
    metricsCollector.recordRequest('/api/a', 123, 200);
    expect(metricsCollector.getApplicationMetrics().responseTime).toEqual({
      average: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
    });
  });

  it('顶层 statusCodes 恒为空对象（返回值未填充）', () => {
    metricsCollector.recordRequest('/api/a', 1, 200);
    metricsCollector.recordRequest('/api/a', 1, 500);
    expect(metricsCollector.getApplicationMetrics().statusCodes).toEqual({});
  });

  it('timestamp 为 Date 实例', () => {
    expect(metricsCollector.getApplicationMetrics().timestamp).toBeInstanceOf(Date);
  });

  it('空收集器：total=0, errorRate=0, endpoints={}, perSecond=0', () => {
    const m = metricsCollector.getApplicationMetrics();
    expect(m.requests.total).toBe(0);
    expect(m.requests.errorRate).toBe(0);
    expect(m.endpoints).toEqual({});
    expect(m.requests.perSecond).toBe(0); // uptime>0 但 total=0 → 0/uptime=0
  });
});

// ─── MetricsCollector.reset ──────────────────────────────────────────────────────

describe('MetricsCollector.reset —— 清空全部统计', () => {
  it('reset 后 total=0, endpoints={}, errorRate=0', () => {
    metricsCollector.recordRequest('/api/a', 1, 500);
    expect(metricsCollector.getApplicationMetrics().requests.total).toBe(1);
    metricsCollector.reset();
    const m = metricsCollector.getApplicationMetrics();
    expect(m.requests.total).toBe(0);
    expect(m.requests.errorRate).toBe(0);
    expect(m.endpoints).toEqual({});
  });

  it('reset 刷新 startTime（reset 后 perSecond 基于 new startTime）', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    metricsCollector.reset();
    metricsCollector.recordRequest('/api/a', 1, 200);
    now.mockReturnValue(1_002_000); // uptime=2s
    expect(metricsCollector.getApplicationMetrics().requests.perSecond).toBe(0.5); // 1/2
  });
});

// ─── getSystemMetrics —— CPU/内存/磁盘/网络/进程 ─────────────────────────────────

describe('getSystemMetrics —— CPU 使用率公式 / 内存 / 磁盘网络 / 进程', () => {
  it('CPU = 100 - ~~((totalIdle/totalTick)*100)，单核 idle=50/user=50 → 50', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 50, user: 50 } } as never]);
    vi.spyOn(os, 'loadavg').mockReturnValue([1, 2, 3]);
    const m = getSystemMetrics();
    expect(m.cpu.usage).toBe(50);
    expect(m.cpu.cores).toBe(1);
    expect(m.cpu.loadAverage).toEqual([1, 2, 3]);
  });

  it('CPU idle=0/user=100 → usage=100（满载）', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 0, user: 100 } } as never]);
    expect(getSystemMetrics().cpu.usage).toBe(100);
  });

  it('CPU idle=100/user=0 → usage=0（全空闲）', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 100, user: 0 } } as never]);
    expect(getSystemMetrics().cpu.usage).toBe(0);
  });

  it('CPU 双核聚合：2×{idle:50,user:50} → totalIdle=100/totalTick=200 → usage=50, cores=2', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([
      { times: { idle: 50, user: 50 } } as never,
      { times: { idle: 50, user: 50 } } as never,
    ]);
    const m = getSystemMetrics();
    expect(m.cpu.usage).toBe(50);
    expect(m.cpu.cores).toBe(2);
  });

  it('CPU ~~ 截断（非 round）：idle=67/user=133 → 33.5% → ~~33=33 → usage=67（round 会得 66）', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 67, user: 133 } } as never]);
    expect(getSystemMetrics().cpu.usage).toBe(67);
  });

  it('内存：total=totalmem, free=freemem, used=total-free, usage=(used/total)*100', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 50, user: 50 } } as never]);
    vi.spyOn(os, 'totalmem').mockReturnValue(1000);
    vi.spyOn(os, 'freemem').mockReturnValue(200);
    const m = getSystemMetrics();
    expect(m.memory.total).toBe(1000);
    expect(m.memory.free).toBe(200);
    expect(m.memory.used).toBe(800);
    expect(m.memory.usage).toBe(80);
  });

  it('磁盘与网络恒为 0（未实现）', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 50, user: 50 } } as never]);
    const m = getSystemMetrics();
    expect(m.disk).toEqual({ total: 0, used: 0, free: 0, usage: 0 });
    expect(m.network).toEqual({ connections: 0, bytesIn: 0, bytesOut: 0 });
  });

  it('进程：uptime=process.uptime(), memoryUsage=process.memoryUsage().rss, cpuUsage=0', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 50, user: 50 } } as never]);
    vi.spyOn(process, 'uptime').mockReturnValue(12345);
    vi.spyOn(process, 'memoryUsage').mockReturnValue({ rss: 999 } as NodeJS.MemoryUsage);
    const m = getSystemMetrics();
    expect(m.process.uptime).toBe(12345);
    expect(m.process.memoryUsage).toBe(999);
    expect(m.process.cpuUsage).toBe(0);
  });

  it('timestamp 为 Date 实例', () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 50, user: 50 } } as never]);
    expect(getSystemMetrics().timestamp).toBeInstanceOf(Date);
  });
});

// ─── performHealthCheck —— 检查项分支 / 整体状态优先级 / 版本 ──────────────────────

describe('performHealthCheck —— 检查项分支与整体状态优先级', () => {
  it('全 healthy（cpu=50, mem=50, errorRate=0）→ status=healthy，4 项均 healthy', async () => {
    // os 默认基线即 healthy；metricsCollector 已 reset → errorRate=0
    const result = await performHealthCheck();
    expect(result.status).toBe('healthy');
    expect(result.checks.map((c) => c.name).sort()).toEqual([
      'api_errors',
      'cpu',
      'database',
      'memory',
    ]);
    expect(result.checks.every((c) => c.status === 'healthy')).toBe(true);
  });

  it('memory degraded（usage=75，>70 且 <=90）→ overall=degraded，message 含 75.0%', async () => {
    vi.spyOn(os, 'totalmem').mockReturnValue(100);
    vi.spyOn(os, 'freemem').mockReturnValue(25); // used=75
    const result = await performHealthCheck();
    const mem = result.checks.find((c) => c.name === 'memory')!;
    expect(mem.status).toBe('degraded');
    expect(mem.message).toContain('75.0%');
    expect(result.status).toBe('degraded');
  });

  it('memory critical（usage=95，>90）→ overall=critical', async () => {
    vi.spyOn(os, 'totalmem').mockReturnValue(100);
    vi.spyOn(os, 'freemem').mockReturnValue(5); // used=95
    const result = await performHealthCheck();
    expect(result.checks.find((c) => c.name === 'memory')!.status).toBe('critical');
    expect(result.status).toBe('critical');
  });

  it('cpu degraded（usage=75）→ overall=degraded', async () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 25, user: 75 } } as never]);
    const result = await performHealthCheck();
    const cpu = result.checks.find((c) => c.name === 'cpu')!;
    expect(cpu.status).toBe('degraded');
    expect(result.status).toBe('degraded');
  });

  it('cpu critical（usage=99）→ overall=critical', async () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 1, user: 99 } } as never]);
    const result = await performHealthCheck();
    expect(result.checks.find((c) => c.name === 'cpu')!.status).toBe('critical');
    expect(result.status).toBe('critical');
  });

  it('api_errors degraded（errorRate=10，>5 且 <=10）→ overall=degraded', async () => {
    for (let i = 0; i < 9; i++) metricsCollector.recordRequest('/api/a', 1, 200);
    metricsCollector.recordRequest('/api/a', 1, 500); // 1/10 = 10%
    const result = await performHealthCheck();
    const api = result.checks.find((c) => c.name === 'api_errors')!;
    expect(api.status).toBe('degraded');
    expect(api.message).toContain('10.0%');
    expect(result.status).toBe('degraded');
  });

  it('api_errors critical（errorRate=20，>10）→ overall=critical', async () => {
    for (let i = 0; i < 8; i++) metricsCollector.recordRequest('/api/a', 1, 200);
    for (let i = 0; i < 2; i++) metricsCollector.recordRequest('/api/a', 1, 500); // 2/10=20%
    const result = await performHealthCheck();
    expect(result.checks.find((c) => c.name === 'api_errors')!.status).toBe('critical');
    expect(result.status).toBe('critical');
  });

  it('database 检查恒 healthy 且带 responseTime（>=0）', async () => {
    const result = await performHealthCheck();
    const db = result.checks.find((c) => c.name === 'database')!;
    expect(db.status).toBe('healthy');
    expect(typeof db.responseTime).toBe('number');
    expect(db.responseTime!).toBeGreaterThanOrEqual(0);
  });

  it('整体状态优先级：critical 优先于 degraded（memory critical + cpu degraded → critical）', async () => {
    vi.spyOn(os, 'cpus').mockReturnValue([{ times: { idle: 25, user: 75 } } as never]); // cpu=75 degraded
    vi.spyOn(os, 'totalmem').mockReturnValue(100);
    vi.spyOn(os, 'freemem').mockReturnValue(5); // mem=95 critical
    const result = await performHealthCheck();
    expect(result.checks.find((c) => c.name === 'memory')!.status).toBe('critical');
    expect(result.checks.find((c) => c.name === 'cpu')!.status).toBe('degraded');
    expect(result.status).toBe('critical');
  });

  it('version = process.env.npm_package_version（已设值时）', async () => {
    const orig = process.env.npm_package_version;
    process.env.npm_package_version = '9.9.9';
    try {
      expect((await performHealthCheck()).version).toBe('9.9.9');
    } finally {
      if (orig === undefined) delete process.env.npm_package_version;
      else process.env.npm_package_version = orig;
    }
  });

  it('version 缺省回退 "1.0.0"', async () => {
    const orig = process.env.npm_package_version;
    delete process.env.npm_package_version;
    try {
      expect((await performHealthCheck()).version).toBe('1.0.0');
    } finally {
      if (orig !== undefined) process.env.npm_package_version = orig;
    }
  });

  it('uptime = process.uptime()', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(777);
    expect((await performHealthCheck()).uptime).toBe(777);
  });

  it('timestamp 为 Date 实例', async () => {
    expect((await performHealthCheck()).timestamp).toBeInstanceOf(Date);
  });
});

// ─── metricsMiddleware —— 解析 pathname+status 并记录 ────────────────────────────

describe('metricsMiddleware —— 解析 pathname+status 并记录到 metricsCollector', () => {
  it('从 request.url 取 pathname 作 endpoint，从 response.status 取 statusCode', () => {
    const req = { url: 'http://localhost/api/foo' } as Request;
    const res = { status: 200 } as Response;
    metricsMiddleware(req, res, 42);
    const m = metricsCollector.getApplicationMetrics();
    expect(m.endpoints['/api/foo'].requests).toBe(1);
    expect(m.endpoints['/api/foo'].avgResponseTime).toBe(42);
    expect(m.requests.total).toBe(1);
    expect(m.requests.failed).toBe(0);
  });

  it('response.status>=400 计为错误', () => {
    const req = { url: 'http://localhost/api/bar' } as Request;
    const res = { status: 500 } as Response;
    metricsMiddleware(req, res, 10);
    const m = metricsCollector.getApplicationMetrics();
    expect(m.requests.failed).toBe(1);
    expect(m.requests.errorRate).toBe(100);
    expect(m.endpoints['/api/bar'].errorRate).toBe(100);
  });
});

// ─── AlertManager（动态 import 全新模块，3 条默认规则） ──────────────────────────

describe('AlertManager —— 规则管理 / checkAlerts 条件匹配 / 告警生命周期', () => {
  let alertManager: MonitoringModule['alertManager'];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/lib/monitoring/monitoring');
    alertManager = mod.alertManager;
  });

  function addRule(
    overrides: Partial<Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>> & {
      metric: string;
      condition: AlertRule['condition'];
      threshold: number;
    }
  ) {
    return alertManager.addRule({
      name: 'test-rule',
      level: 'warn',
      enabled: true,
      notifications: {},
      ...overrides,
    });
  }

  // ---- 规则管理 ----

  it('模块导入即注册 3 条默认规则（cpu.usage / memory.usage / requests.errorRate）', () => {
    const rules = alertManager.getRules();
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.metric).sort()).toEqual([
      'cpu.usage',
      'memory.usage',
      'requests.errorRate',
    ]);
  });

  it('addRule 生成 id（rule_<ts>_<rand>）+ createdAt/updatedAt，并加入 getRules()', () => {
    const rule = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 90 });
    expect(rule.id).toMatch(/^rule_\d+_[a-z0-9]+$/);
    expect(rule.createdAt).toBeInstanceOf(Date);
    expect(rule.updatedAt).toBeInstanceOf(Date);
    expect(rule.name).toBe('test-rule');
    expect(alertManager.getRules().some((r) => r.id === rule.id)).toBe(true);
  });

  // ---- checkAlerts metric switch ----

  it('checkAlerts metric=cpu.usage → 读 metrics.cpu.usage', () => {
    const r = addRule({ metric: 'cpu.usage', condition: 'gt', threshold: 1 });
    const t = alertManager.checkAlerts(makeMetrics({ cpuUsage: 90 })).find((a) => a.ruleId === r.id);
    expect(t).toBeDefined();
    expect(t!.value).toBe(90);
    expect(t!.metric).toBe('cpu.usage');
  });

  it('checkAlerts metric=memory.usage → 读 metrics.memory.usage', () => {
    const r = addRule({ metric: 'memory.usage', condition: 'gt', threshold: 1 });
    const t = alertManager.checkAlerts(makeMetrics({ memoryUsage: 70 })).find((a) => a.ruleId === r.id);
    expect(t).toBeDefined();
    expect(t!.value).toBe(70);
  });

  it('checkAlerts metric=disk.usage → 读 metrics.disk.usage', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 60 })).find((a) => a.ruleId === r.id);
    expect(t).toBeDefined();
    expect(t!.value).toBe(60);
  });

  it('checkAlerts metric=requests.errorRate → 读 metrics.requests.errorRate', () => {
    const r = addRule({ metric: 'requests.errorRate', condition: 'gt', threshold: 1 });
    const t = alertManager.checkAlerts(makeMetrics({ errorRate: 8 })).find((a) => a.ruleId === r.id);
    expect(t).toBeDefined();
    expect(t!.value).toBe(8);
  });

  it('checkAlerts metric=requests.perSecond → 读 metrics.requests.perSecond', () => {
    const r = addRule({ metric: 'requests.perSecond', condition: 'gt', threshold: 1 });
    const t = alertManager.checkAlerts(makeMetrics({ perSecond: 100 })).find((a) => a.ruleId === r.id);
    expect(t).toBeDefined();
    expect(t!.value).toBe(100);
  });

  it('checkAlerts 未知 metric → 跳过（不触发，default continue）', () => {
    const r = addRule({ metric: 'unknown.metric', condition: 'gt', threshold: 1 });
    const triggered = alertManager.checkAlerts(makeMetrics());
    expect(triggered.find((a) => a.ruleId === r.id)).toBeUndefined();
  });

  it('checkAlerts enabled=false 的规则 → 跳过', () => {
    const r = addRule({
      metric: 'disk.usage',
      condition: 'gt',
      threshold: 10,
      enabled: false,
    });
    const triggered = alertManager.checkAlerts(makeMetrics({ diskUsage: 95 }));
    expect(triggered.find((a) => a.ruleId === r.id)).toBeUndefined();
  });

  // ---- checkAlerts condition operators（disk.usage 固定 50） ----

  it('gt：50>40 触发；50>60 不触发', () => {
    const fire = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 40 });
    const nofire = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 60 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 50 }));
    expect(t.find((a) => a.ruleId === fire.id)).toBeDefined();
    expect(t.find((a) => a.ruleId === nofire.id)).toBeUndefined();
  });

  it('lt：50<60 触发；50<40 不触发', () => {
    const fire = addRule({ metric: 'disk.usage', condition: 'lt', threshold: 60 });
    const nofire = addRule({ metric: 'disk.usage', condition: 'lt', threshold: 40 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 50 }));
    expect(t.find((a) => a.ruleId === fire.id)).toBeDefined();
    expect(t.find((a) => a.ruleId === nofire.id)).toBeUndefined();
  });

  it('gte：50>=50 触发；50>=51 不触发', () => {
    const fire = addRule({ metric: 'disk.usage', condition: 'gte', threshold: 50 });
    const nofire = addRule({ metric: 'disk.usage', condition: 'gte', threshold: 51 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 50 }));
    expect(t.find((a) => a.ruleId === fire.id)).toBeDefined();
    expect(t.find((a) => a.ruleId === nofire.id)).toBeUndefined();
  });

  it('lte：50<=50 触发；50<=49 不触发', () => {
    const fire = addRule({ metric: 'disk.usage', condition: 'lte', threshold: 50 });
    const nofire = addRule({ metric: 'disk.usage', condition: 'lte', threshold: 49 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 50 }));
    expect(t.find((a) => a.ruleId === fire.id)).toBeDefined();
    expect(t.find((a) => a.ruleId === nofire.id)).toBeUndefined();
  });

  it('eq：50===50 触发；50===51 不触发', () => {
    const fire = addRule({ metric: 'disk.usage', condition: 'eq', threshold: 50 });
    const nofire = addRule({ metric: 'disk.usage', condition: 'eq', threshold: 51 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 50 }));
    expect(t.find((a) => a.ruleId === fire.id)).toBeDefined();
    expect(t.find((a) => a.ruleId === nofire.id)).toBeUndefined();
  });

  it('neq：50!==51 触发；50!==50 不触发', () => {
    const fire = addRule({ metric: 'disk.usage', condition: 'neq', threshold: 51 });
    const nofire = addRule({ metric: 'disk.usage', condition: 'neq', threshold: 50 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 50 }));
    expect(t.find((a) => a.ruleId === fire.id)).toBeDefined();
    expect(t.find((a) => a.ruleId === nofire.id)).toBeUndefined();
  });

  // ---- 告警记录字段 / message / id ----

  it('告警 id=alert_<ruleId>_<ts>，status=active，level/threshold 透传', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 90, level: 'error' });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 95 })).find((a) => a.ruleId === r.id)!;
    expect(t.id).toMatch(/^alert_rule_\d+_[a-z0-9]+_\d+$/);
    expect(t.status).toBe('active');
    expect(t.level).toBe('error');
    expect(t.threshold).toBe(90);
    expect(t.ruleName).toBe('test-rule');
    expect(t.triggeredAt).toBeInstanceOf(Date);
  });

  it('message = `${name}: ${metric} = ${value.toFixed(2)} (阈值: ${threshold})`（95 → 95.00）', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 90 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 95 })).find((a) => a.ruleId === r.id)!;
    expect(t.message).toBe('test-rule: disk.usage = 95.00 (阈值: 90)');
  });

  it('message value.toFixed(2) 四舍五入（50.556 → 50.56，非截断）', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    const t = alertManager.checkAlerts(makeMetrics({ diskUsage: 50.556 })).find((a) => a.ruleId === r.id)!;
    expect(t.message).toContain('50.56');
    expect(t.value).toBe(50.556);
  });

  // ---- 生命周期：active / history / acknowledge / resolve ----

  it('触发后进入 activeAlerts（getActiveAlerts）与 history（getAlertHistory）', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    const [t] = alertManager.checkAlerts(makeMetrics({ diskUsage: 95 }));
    expect(alertManager.getActiveAlerts().some((a) => a.id === t.id)).toBe(true);
    expect(alertManager.getAlertHistory().some((a) => a.id === t.id)).toBe(true);
  });

  it('acknowledgeAlert：存在 → 置 acknowledged + acknowledgedBy + acknowledgedAt，返回 true', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    const [t] = alertManager.checkAlerts(makeMetrics({ diskUsage: 95 }));
    expect(alertManager.acknowledgeAlert(t.id, 'user1')).toBe(true);
    const active = alertManager.getActiveAlerts().find((a) => a.id === t.id)!;
    expect(active.status).toBe('acknowledged');
    expect(active.acknowledgedBy).toBe('user1');
    expect(active.acknowledgedAt).toBeInstanceOf(Date);
  });

  it('acknowledgeAlert：userId 缺省为 undefined', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    const [t] = alertManager.checkAlerts(makeMetrics({ diskUsage: 95 }));
    expect(alertManager.acknowledgeAlert(t.id)).toBe(true);
    expect(
      alertManager.getActiveAlerts().find((a) => a.id === t.id)!.acknowledgedBy
    ).toBeUndefined();
  });

  it('acknowledgeAlert：不存在 → 返回 false', () => {
    expect(alertManager.acknowledgeAlert('nonexistent', 'user1')).toBe(false);
  });

  it('resolveAlert：存在 → 置 resolved + resolvedAt，从 activeAlerts 移除，返回 true', () => {
    const r = addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    const [t] = alertManager.checkAlerts(makeMetrics({ diskUsage: 95 }));
    expect(alertManager.resolveAlert(t.id)).toBe(true);
    expect(alertManager.getActiveAlerts().some((a) => a.id === t.id)).toBe(false);
    const hist = alertManager.getAlertHistory().find((a) => a.id === t.id)!;
    expect(hist.status).toBe('resolved');
    expect(hist.resolvedAt).toBeInstanceOf(Date);
  });

  it('resolveAlert：不存在 → 返回 false', () => {
    expect(alertManager.resolveAlert('nonexistent')).toBe(false);
  });

  it('getAlertHistory(limit)：slice(-limit)，limit=1 返回最近 1 条', () => {
    addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1, name: 'h1' });
    addRule({ metric: 'memory.usage', condition: 'gt', threshold: 1, name: 'h2' });
    // 默认规则（cpu.usage>80 / memory.usage>85 / errorRate>5）在 cpuUsage=50 / memoryUsage=50 /
    // errorRate=0 下不触发；仅 h1(disk=95>1) 与 h2(memory=50>1) 触发 → 2 条新告警
    alertManager.checkAlerts(makeMetrics({ cpuUsage: 50, memoryUsage: 50, diskUsage: 95 }));
    const hist = alertManager.getAlertHistory();
    expect(hist.length).toBe(2);
    const last1 = alertManager.getAlertHistory(1);
    expect(last1).toHaveLength(1);
    expect(last1[0]).toEqual(hist[1]); // 末尾即最后一条
  });

  it('getAlertHistory() 默认 limit=100（>= 历史总量时返回全部）', () => {
    addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    alertManager.checkAlerts(makeMetrics({ diskUsage: 95 }));
    expect(alertManager.getAlertHistory()).toHaveLength(1);
  });

  it('getAlertHistory(0)：slice(-0)===slice(0) 返回全部（-0 不小于 0 的边界）', () => {
    addRule({ metric: 'disk.usage', condition: 'gt', threshold: 1 });
    alertManager.checkAlerts(makeMetrics({ diskUsage: 95 }));
    expect(alertManager.getAlertHistory(0)).toHaveLength(1);
  });
});
