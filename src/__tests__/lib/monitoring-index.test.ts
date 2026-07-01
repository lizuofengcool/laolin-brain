import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// monitoring/index.ts 纯模块：MetricsCollector / AlertEngine 均为「导出 class」可 new，
// 仅依赖 Date.now / Map / setInterval / console（零 @/lib/db / next/server 依赖）。
// 类测试用 `new MetricsCollector()` / `new AlertEngine(mc)` 每例隔离（无单例污染）。
// evaluateRules 内部用 Date.now() 计算 startedAt 与持续时长，故用 vi.spyOn(Date,'now')
// 以可变 now 变量驱动 pending→firing 状态机。
// getStats 的 duration 过滤 / cleanup 用直接 push 显式 timestamp 的 MetricPoint，
// 避免 Date.now 干扰（data 是 Metric 公开字段，getMetric 返回引用可直接 mutate）。
// sendToChannel 为 TODO 桩（仅 console.log），其 body 无 await 故在 evaluateRules 同步阶段即触发，
// 可直接断言 console.log 调用。
// 单例 registerDefaultMetrics / registerDefaultAlertRules 操作模块级单例 metricsCollector/alertEngine，
// 用 vi.resetModules() + 动态 import 取全新模块（全新单例）隔离。

import { MetricsCollector, AlertEngine } from '@/lib/monitoring';
import type { AlertRule, NotificationChannel, MetricPoint } from '@/lib/monitoring';

type MonitoringModule = typeof import('@/lib/monitoring');

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'r1',
    name: '规则1',
    description: '测试规则',
    metric: 'm',
    condition: '>',
    threshold: 50,
    level: 'warning',
    duration: 0,
    labels: {},
    enabled: true,
    notificationChannels: [],
    ...overrides,
  };
}

function makeChannel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: 'c1',
    type: 'webhook',
    name: 'ch1',
    enabled: true,
    config: {},
    ...overrides,
  };
}

describe('MetricsCollector', () => {
  let mc: MetricsCollector;

  beforeEach(() => {
    mc = new MetricsCollector();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- registerMetric ---
  it('registerMetric 注册新指标并填充字段', () => {
    mc.registerMetric('m', 'counter', '计数', ['route'], 'ms');
    const m = mc.getMetric('m')!;
    expect(m.name).toBe('m');
    expect(m.type).toBe('counter');
    expect(m.description).toBe('计数');
    expect(m.unit).toBe('ms');
    expect(m.labels).toEqual(['route']);
    expect(m.data).toEqual([]);
  });

  it('registerMetric 默认 unit=undefined labels=[]', () => {
    mc.registerMetric('m', 'gauge', 'desc');
    const m = mc.getMetric('m')!;
    expect(m.unit).toBeUndefined();
    expect(m.labels).toEqual([]);
  });

  it('registerMetric 重复注册为 no-op（has 判定后 return，不覆盖）', () => {
    mc.registerMetric('m', 'counter', '原desc', ['a'], 's');
    mc.registerMetric('m', 'gauge', '新desc', ['b'], 'ms');
    const m = mc.getMetric('m')!;
    expect(m.type).toBe('counter'); // 未被覆盖
    expect(m.description).toBe('原desc');
    expect(m.labels).toEqual(['a']);
    expect(m.unit).toBe('s');
  });

  // --- record ---
  it('record 记录数据点（value/timestamp=Date.now()/labels）', () => {
    mc.registerMetric('m', 'gauge', 'd');
    const before = Date.now();
    mc.record('m', 42, { route: '/x' });
    const after = Date.now();
    const m = mc.getMetric('m')!;
    expect(m.data.length).toBe(1);
    expect(m.data[0].value).toBe(42);
    expect(m.data[0].labels).toEqual({ route: '/x' });
    expect(m.data[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(m.data[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('record 默认 labels={} 当省略', () => {
    mc.registerMetric('m', 'gauge', 'd');
    mc.record('m', 1);
    expect(mc.getMetric('m')!.data[0].labels).toEqual({});
  });

  it('record 未知指标 console.warn 且不抛错', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mc.record('nope', 1);
    expect(warn).toHaveBeenCalledWith('Metric not found: nope');
    expect(mc.getMetric('nope')).toBeUndefined();
  });

  it('record 超过 maxDataPoints(1000) 时 slice(-1000) 保留末尾', () => {
    mc.registerMetric('m', 'counter', 'd');
    for (let i = 1; i <= 1001; i++) {
      mc.record('m', i);
    }
    const data = mc.getMetric('m')!.data;
    expect(data.length).toBe(1000);
    expect(data[0].value).toBe(2); // 丢弃 value=1，保留末尾 1000 个
    expect(data[data.length - 1].value).toBe(1001);
    expect(mc.getValue('m')).toBe(1001);
  });

  // --- increment ---
  it('increment 默认 value=1 调 record', () => {
    mc.registerMetric('m', 'counter', 'd');
    mc.increment('m');
    expect(mc.getValue('m')).toBe(1);
  });

  it('increment 自定义 value 与 labels 透传', () => {
    mc.registerMetric('m', 'counter', 'd', ['route']);
    mc.increment('m', { route: '/a' }, 5);
    expect(mc.getValue('m')).toBe(5);
    expect(mc.getValue('m', { route: '/a' })).toBe(5);
  });

  // --- getMetric / getAllMetrics ---
  it('getMetric 未注册返回 undefined', () => {
    expect(mc.getMetric('nope')).toBeUndefined();
  });

  it('getAllMetrics 返回全部已注册指标数组', () => {
    mc.registerMetric('a', 'gauge', 'd');
    mc.registerMetric('b', 'counter', 'd');
    const all = mc.getAllMetrics();
    expect(all.length).toBe(2);
    expect(all.map((m) => m.name).sort()).toEqual(['a', 'b']);
  });

  // --- getValue ---
  it('getValue 未注册返回 null', () => {
    expect(mc.getValue('nope')).toBeNull();
  });

  it('getValue 已注册但无数据返回 null', () => {
    mc.registerMetric('m', 'gauge', 'd');
    expect(mc.getValue('m')).toBeNull();
  });

  it('getValue 无 labels 返回最后一个数据点的值', () => {
    mc.registerMetric('m', 'gauge', 'd');
    mc.record('m', 10);
    mc.record('m', 20);
    mc.record('m', 30);
    expect(mc.getValue('m')).toBe(30);
  });

  it('getValue 带 labels 返回最后一个匹配点的值', () => {
    mc.registerMetric('m', 'gauge', 'd', ['route']);
    mc.record('m', 10, { route: '/a' });
    mc.record('m', 20, { route: '/b' });
    mc.record('m', 30, { route: '/a' });
    expect(mc.getValue('m', { route: '/a' })).toBe(30); // 最后一个 /a
    expect(mc.getValue('m', { route: '/b' })).toBe(20);
  });

  it('getValue 带 labels 无匹配返回 null', () => {
    mc.registerMetric('m', 'gauge', 'd', ['route']);
    mc.record('m', 10, { route: '/a' });
    expect(mc.getValue('m', { route: '/z' })).toBeNull();
  });

  // --- getStats ---
  it('getStats 未注册返回 null', () => {
    expect(mc.getStats('nope')).toBeNull();
  });

  it('getStats 已注册无数据返回 null', () => {
    mc.registerMetric('m', 'gauge', 'd');
    expect(mc.getStats('m')).toBeNull();
  });

  it('getStats 基本 min/max/avg/sum/count', () => {
    mc.registerMetric('m', 'gauge', 'd');
    mc.record('m', 10);
    mc.record('m', 20);
    mc.record('m', 30);
    const s = mc.getStats('m')!;
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
    expect(s.sum).toBe(60);
    expect(s.count).toBe(3);
    expect(s.avg).toBe(20);
  });

  it('getStats 百分位用 values[Math.floor(count*p)] 索引（升序，count=4）', () => {
    // count=4: p50=floor(4*0.5)=2 → sorted[2]=30; p95=floor(4*0.95)=3 → sorted[3]=40; p99=floor(4*0.99)=3 → 40
    mc.registerMetric('m', 'gauge', 'd');
    [10, 20, 30, 40].forEach((v) => mc.record('m', v));
    const s = mc.getStats('m')!;
    const sorted = [10, 20, 30, 40];
    expect(s.p50).toBe(sorted[Math.floor(4 * 0.5)]); // 30
    expect(s.p95).toBe(sorted[Math.floor(4 * 0.95)]); // 40
    expect(s.p99).toBe(sorted[Math.floor(4 * 0.99)]); // 40
  });

  it('getStats 百分位索引（count=10）', () => {
    // p50=floor(5)=5 → sorted[5]=6; p95=floor(9.5)=9 → sorted[9]=10; p99=floor(9.9)=9 → 10
    mc.registerMetric('m', 'gauge', 'd');
    for (let i = 1; i <= 10; i++) mc.record('m', i);
    const s = mc.getStats('m')!;
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(s.p50).toBe(sorted[Math.floor(10 * 0.5)]); // 6
    expect(s.p95).toBe(sorted[Math.floor(10 * 0.95)]); // 10
    expect(s.p99).toBe(sorted[Math.floor(10 * 0.99)]); // 10
  });

  it('getStats 按标签过滤后统计', () => {
    mc.registerMetric('m', 'gauge', 'd', ['route']);
    mc.record('m', 10, { route: '/a' });
    mc.record('m', 100, { route: '/b' });
    mc.record('m', 20, { route: '/a' });
    const s = mc.getStats('m', { route: '/a' })!;
    expect(s.count).toBe(2);
    expect(s.min).toBe(10);
    expect(s.max).toBe(20);
    expect(s.sum).toBe(30);
  });

  it('getStats 标签过滤后无数据返回 null', () => {
    mc.registerMetric('m', 'gauge', 'd', ['route']);
    mc.record('m', 10, { route: '/a' });
    expect(mc.getStats('m', { route: '/z' })).toBeNull();
  });

  it('getStats duration 过滤保留 timestamp >= now - duration*1000 的点', () => {
    mc.registerMetric('m', 'gauge', 'd');
    const pts: MetricPoint[] = [
      { value: 1, timestamp: 1000, labels: {} },
      { value: 2, timestamp: 2000, labels: {} },
      { value: 3, timestamp: 3000, labels: {} },
    ];
    mc.getMetric('m')!.data.push(...pts);
    // now=3500, duration=1 → since=3500-1000=2500 → 保留 timestamp>=2500 → [3]
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => 3500);
    const s = mc.getStats('m', undefined, 1)!;
    spy.mockRestore();
    expect(s.count).toBe(1);
    expect(s.sum).toBe(3);
  });

  it('getStats duration 过滤后无数据返回 null', () => {
    mc.registerMetric('m', 'gauge', 'd');
    mc.getMetric('m')!.data.push({ value: 1, timestamp: 1000, labels: {} });
    // now=3000, duration=1 → since=2000 → 1000<2000 排除
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => 3000);
    expect(mc.getStats('m', undefined, 1)).toBeNull();
    spy.mockRestore();
  });

  // --- cleanup ---
  it('cleanup 删除早于 cutoff(now - olderThan*1000) 的数据点', () => {
    mc.registerMetric('m', 'gauge', 'd');
    mc.getMetric('m')!.data.push(
      { value: 1, timestamp: 1000, labels: {} },
      { value: 2, timestamp: 2000, labels: {} },
      { value: 3, timestamp: 3000, labels: {} },
    );
    // olderThan=1.5 → cutoff=3000-1500=1500 → 保留 >=1500 → [2000,3000]
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => 3000);
    mc.cleanup(1.5);
    spy.mockRestore();
    const d = mc.getMetric('m')!.data;
    expect(d.length).toBe(2);
    expect(d.map((p) => p.value)).toEqual([2, 3]);
  });

  it('cleanup 跨多指标清理', () => {
    mc.registerMetric('a', 'gauge', 'd');
    mc.registerMetric('b', 'gauge', 'd');
    mc.getMetric('a')!.data.push({ value: 1, timestamp: 1000, labels: {} });
    mc.getMetric('b')!.data.push({ value: 2, timestamp: 3000, labels: {} });
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => 3000);
    mc.cleanup(1); // cutoff=2000 → a(1000) 删, b(3000) 留
    spy.mockRestore();
    expect(mc.getMetric('a')!.data.length).toBe(0);
    expect(mc.getMetric('b')!.data.length).toBe(1);
  });

  // --- reset ---
  it('reset(name) 仅清空指定指标数据（保留注册）', () => {
    mc.registerMetric('a', 'gauge', 'd');
    mc.registerMetric('b', 'gauge', 'd');
    mc.record('a', 1);
    mc.record('b', 2);
    mc.reset('a');
    expect(mc.getMetric('a')!.data).toEqual([]);
    expect(mc.getMetric('b')!.data.length).toBe(1); // b 不受影响
    expect(mc.getMetric('a')).toBeDefined(); // 注册保留
  });

  it('reset() 无参清空全部指标数据', () => {
    mc.registerMetric('a', 'gauge', 'd');
    mc.registerMetric('b', 'gauge', 'd');
    mc.record('a', 1);
    mc.record('b', 2);
    mc.reset();
    expect(mc.getMetric('a')!.data).toEqual([]);
    expect(mc.getMetric('b')!.data).toEqual([]);
    expect(mc.getAllMetrics().length).toBe(2); // 注册保留
  });

  it('reset(unknown) 不抛错', () => {
    expect(() => mc.reset('nope')).not.toThrow();
  });
});

describe('AlertEngine（条件评估与状态机）', () => {
  let mc: MetricsCollector;
  let engine: AlertEngine;
  let now: number;

  beforeEach(() => {
    mc = new MetricsCollector();
    mc.registerMetric('m', 'gauge', 'd');
    engine = new AlertEngine(mc);
    now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- registerRule / registerChannel ---
  it('registerRule 注册规则（evaluateRules 可见）', () => {
    engine.registerRule(makeRule({ id: 'r1' }));
    mc.record('m', 60);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('registerChannel 注册渠道（firing 时触发 sendToChannel console.log）', () => {
    engine.registerChannel(makeChannel({ id: 'c1' }));
    engine.registerRule(makeRule({ id: 'r1', notificationChannels: ['c1'] }));
    mc.record('m', 60);
    engine.evaluateRules(); // duration=0 → firing → sendToChannel 同步 console.log
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Sending firing alert to webhook'),
    );
  });

  // --- evaluateCondition（经 evaluateRules）6 条件运算符 + default ---
  it('条件 ">" value>threshold（50>50 false / 51>50 true）', () => {
    engine.registerRule(makeRule({ condition: '>', threshold: 50 }));
    mc.record('m', 50);
    expect(engine.evaluateRules().length).toBe(0);
    mc.record('m', 51);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('条件 ">=" value>=threshold', () => {
    engine.registerRule(makeRule({ condition: '>=', threshold: 50 }));
    mc.record('m', 49);
    expect(engine.evaluateRules().length).toBe(0);
    mc.record('m', 50);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('条件 "<" value<threshold', () => {
    engine.registerRule(makeRule({ condition: '<', threshold: 50 }));
    mc.record('m', 50);
    expect(engine.evaluateRules().length).toBe(0);
    mc.record('m', 49);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('条件 "<=" value<=threshold', () => {
    engine.registerRule(makeRule({ condition: '<=', threshold: 50 }));
    mc.record('m', 51);
    expect(engine.evaluateRules().length).toBe(0);
    mc.record('m', 50);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('条件 "==" value===threshold', () => {
    engine.registerRule(makeRule({ condition: '==', threshold: 50 }));
    mc.record('m', 49);
    expect(engine.evaluateRules().length).toBe(0);
    mc.record('m', 50);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('条件 "=" 是 "==" 的别名（===）', () => {
    engine.registerRule(makeRule({ condition: '=', threshold: 50 }));
    mc.record('m', 50);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('条件 "!=" value!==threshold', () => {
    engine.registerRule(makeRule({ condition: '!=', threshold: 50 }));
    mc.record('m', 50);
    expect(engine.evaluateRules().length).toBe(0);
    mc.record('m', 51);
    expect(engine.evaluateRules().length).toBe(1);
  });

  it('未知条件 console.warn 且返回 false（不触发）', () => {
    engine.registerRule(makeRule({ condition: '>>', threshold: 50 }));
    mc.record('m', 100);
    expect(engine.evaluateRules().length).toBe(0);
    expect(console.warn).toHaveBeenCalledWith('Unknown condition: >>');
  });

  it('condition.trim() 去除空白（"  >  " → ">"）', () => {
    engine.registerRule(makeRule({ condition: '  >  ', threshold: 50 }));
    mc.record('m', 60); // 60>50 true
    expect(engine.evaluateRules().length).toBe(1);
  });

  // --- evaluateRules 状态机 ---
  it('duration=0 立即 firing（alert 推入 newAlerts 且 status 变 firing）', () => {
    engine.registerRule(makeRule({ duration: 0 }));
    mc.record('m', 60);
    const alerts = engine.evaluateRules();
    expect(alerts.length).toBe(1);
    expect(alerts[0].status).toBe('firing'); // duration=0 → triggerAlert 同步置 firing
    expect(alerts[0].level).toBe('warning');
    expect(alerts[0].ruleId).toBe('r1');
    expect(alerts[0].threshold).toBe(50);
    expect(alerts[0].value).toBe(60);
    expect(alerts[0].startedAt).toBe(now);
    expect(engine.getActiveAlerts().length).toBe(1);
  });

  it('duration>0 首次进入 pending（未达持续时间）', () => {
    engine.registerRule(makeRule({ duration: 10 }));
    mc.record('m', 60);
    const alerts = engine.evaluateRules();
    expect(alerts.length).toBe(1);
    expect(alerts[0].status).toBe('pending');
    expect(engine.getActiveAlerts().length).toBe(1); // pending 也算 active
  });

  it('pending 达到 duration 后转 firing', () => {
    engine.registerRule(makeRule({ duration: 10 }));
    mc.record('m', 60);
    engine.evaluateRules(); // pending @ startedAt=now=1000
    now = 1000;
    engine.evaluateRules(); // duration=(1000-1000)/1000=0 < 10 → 仍 pending
    expect(engine.getActiveAlerts()[0].status).toBe('pending');
    now = 11000; // (11000-1000)/1000=10 >= 10 → triggerAlert → firing
    engine.evaluateRules();
    expect(engine.getActiveAlerts()[0].status).toBe('firing');
  });

  it('pending 未达 duration 即恢复 → 删除告警', () => {
    engine.registerRule(makeRule({ duration: 10 }));
    mc.record('m', 60);
    engine.evaluateRules(); // pending
    expect(engine.getActiveAlerts().length).toBe(1);
    mc.record('m', 40); // 不再触发
    engine.evaluateRules(); // pending → alerts.delete
    expect(engine.getActiveAlerts().length).toBe(0);
  });

  it('firing 恢复 → resolved 并发送 resolved 通知', () => {
    engine.registerChannel(makeChannel({ id: 'c1' }));
    engine.registerRule(makeRule({ duration: 0, notificationChannels: ['c1'] }));
    mc.record('m', 60);
    engine.evaluateRules(); // firing @ startedAt=1000
    mc.record('m', 40); // 不再触发
    now = 2000;
    engine.evaluateRules(); // firing → resolved, duration=(2000-1000)/1000=1
    const hist = engine.getAlertHistory();
    expect(hist.length).toBe(1);
    expect(hist[0].status).toBe('resolved');
    expect(hist[0].resolvedAt).toBe(2000);
    expect(hist[0].duration).toBe(1);
    expect(engine.getActiveAlerts().length).toBe(0); // resolved 不算 active
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Sending resolved alert to webhook'),
    );
  });

  it('已 firing 仍触发 → 不产生新告警（newAlerts 空）', () => {
    engine.registerRule(makeRule({ duration: 0 }));
    mc.record('m', 60);
    engine.evaluateRules(); // firing
    const alerts2 = engine.evaluateRules(); // 仍 firing，无新告警
    expect(alerts2.length).toBe(0);
    expect(engine.getActiveAlerts().length).toBe(1);
  });

  it('metric 不存在（getValue=null）→ 跳过不告警', () => {
    engine.registerRule(makeRule({ metric: 'nope' }));
    expect(engine.evaluateRules().length).toBe(0);
  });

  it('rule.enabled=false → 跳过', () => {
    engine.registerRule(makeRule({ enabled: false }));
    mc.record('m', 60);
    expect(engine.evaluateRules().length).toBe(0);
  });

  it('message 模板：${name}: 当前值 ${value}，阈值 ${condition} ${threshold}', () => {
    engine.registerRule(makeRule({ name: 'CPU高', condition: '>', threshold: 50 }));
    mc.record('m', 60);
    const [alert] = engine.evaluateRules();
    expect(alert.message).toContain('CPU高');
    expect(alert.message).toContain('当前值 60');
    expect(alert.message).toContain('阈值 > 50');
  });

  it('alert id 形如 ${ruleId}-${Date.now()}', () => {
    engine.registerRule(makeRule({ id: 'r1' }));
    mc.record('m', 60);
    const [alert] = engine.evaluateRules();
    expect(alert.id).toBe(`r1-${now}`);
  });

  // --- sendNotification 渠道筛选 ---
  it('渠道 enabled=false → 跳过（不调用 sendToChannel）', () => {
    engine.registerChannel(makeChannel({ id: 'c1', enabled: false }));
    engine.registerRule(makeRule({ notificationChannels: ['c1'] }));
    mc.record('m', 60);
    engine.evaluateRules();
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Sending firing alert'),
    );
  });

  it('notificationChannels 引用不存在的渠道 → 跳过', () => {
    engine.registerRule(makeRule({ notificationChannels: ['missing'] }));
    mc.record('m', 60);
    engine.evaluateRules();
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Sending firing alert'),
    );
  });

  it('sendToChannel 桩不抛错（console.error 未被调用）', () => {
    // sendToChannel 为 TODO 桩仅 console.log，不会进 catch 分支
    engine.registerChannel(makeChannel({ id: 'c1' }));
    engine.registerRule(makeRule({ notificationChannels: ['c1'] }));
    mc.record('m', 60);
    engine.evaluateRules();
    expect(console.error).not.toHaveBeenCalled();
  });

  // --- getActiveAlerts / getAlertHistory ---
  it('getActiveAlerts 返回 firing + pending（排除 resolved）', () => {
    engine.registerRule(makeRule({ id: 'r1', duration: 0 }));
    engine.registerRule(makeRule({ id: 'r2', duration: 10 }));
    mc.record('m', 60);
    engine.evaluateRules(); // r1 firing, r2 pending
    const active = engine.getActiveAlerts();
    expect(active.length).toBe(2);
    expect(active.map((a) => a.status).sort()).toEqual(['firing', 'pending']);
  });

  it('getAlertHistory 按 startedAt 降序', () => {
    engine.registerRule(makeRule({ id: 'r1', duration: 0 }));
    mc.record('m', 60);
    now = 1000;
    engine.evaluateRules(); // r1 alert startedAt=1000
    engine.registerRule(makeRule({ id: 'r2', duration: 0 }));
    now = 2000;
    engine.evaluateRules(); // r1 已 firing 无新告警；r2 新告警 startedAt=2000
    const hist = engine.getAlertHistory();
    expect(hist.length).toBe(2);
    expect(hist[0].startedAt).toBe(2000); // desc 首
    expect(hist[1].startedAt).toBe(1000);
  });

  it('getAlertHistory(limit) slice(0, limit)，默认 100', () => {
    engine.registerRule(makeRule({ id: 'r1', duration: 0 }));
    mc.record('m', 60);
    now = 1000;
    engine.evaluateRules();
    engine.registerRule(makeRule({ id: 'r2', duration: 0 }));
    now = 2000;
    engine.evaluateRules();
    expect(engine.getAlertHistory(1).length).toBe(1);
    expect(engine.getAlertHistory(1)[0].startedAt).toBe(2000); // desc slice(0,1)
    expect(engine.getAlertHistory().length).toBe(2); // 默认 limit=100
  });

  // --- silenceRule ---
  it('silenceRule 设置 rule.silencedUntil = now + duration*1000', () => {
    // registerRule 存的是 rule 引用，故可外部观测 silencedUntil 变更
    const rule = makeRule({ id: 'r1' });
    engine.registerRule(rule);
    now = 5000;
    engine.silenceRule('r1', 30);
    expect(rule.silencedUntil).toBe(5000 + 30 * 1000); // 35000
  });

  it('silenceRule 未知规则 → 不抛错', () => {
    expect(() => engine.silenceRule('nope', 30)).not.toThrow();
  });

  it('silencedUntil 不影响 evaluateRules（当前实现未检查该字段，锁定行为）', () => {
    engine.registerRule(makeRule({ duration: 0 }));
    engine.silenceRule('r1', 3600);
    mc.record('m', 60);
    expect(engine.evaluateRules().length).toBe(1); // 仍触发
  });
});

describe('AlertEngine start/stop 定时检查', () => {
  let mc: MetricsCollector;
  let engine: AlertEngine;

  beforeEach(() => {
    mc = new MetricsCollector();
    engine = new AlertEngine(mc);
    vi.useFakeTimers();
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('start 启动 setInterval 周期调用 evaluateRules', () => {
    const spy = vi.spyOn(engine, 'evaluateRules').mockReturnValue([]);
    engine.start(60000);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60000);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('start 默认 intervalMs=60000', () => {
    const spy = vi.spyOn(engine, 'evaluateRules').mockReturnValue([]);
    engine.start();
    vi.advanceTimersByTime(59999);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('start 重复调用为 no-op（已有 interval 直接 return）', () => {
    const spy = vi.spyOn(engine, 'evaluateRules').mockReturnValue([]);
    engine.start(60000);
    engine.start(60000); // no-op
    vi.advanceTimersByTime(60000);
    expect(spy).toHaveBeenCalledTimes(1); // 只一个 interval
  });

  it('stop 清除 interval，不再触发', () => {
    const spy = vi.spyOn(engine, 'evaluateRules').mockReturnValue([]);
    engine.start(60000);
    engine.stop();
    vi.advanceTimersByTime(120000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stop 无 interval 时为 no-op', () => {
    expect(() => engine.stop()).not.toThrow();
  });
});

describe('单例 registerDefaultMetrics / registerDefaultAlertRules', () => {
  let mod: MonitoringModule;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('@/lib/monitoring');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registerDefaultMetrics 注册 12 个默认指标', () => {
    mod.registerDefaultMetrics();
    expect(mod.metricsCollector.getAllMetrics().length).toBe(12);
  });

  it('registerDefaultMetrics 幂等（重复注册不增加）', () => {
    mod.registerDefaultMetrics();
    mod.registerDefaultMetrics();
    expect(mod.metricsCollector.getAllMetrics().length).toBe(12);
  });

  it('registerDefaultMetrics 包含 system_cpu_usage(gauge,%) 与 http_requests_total(counter,labels)', () => {
    mod.registerDefaultMetrics();
    const cpu = mod.metricsCollector.getMetric('system_cpu_usage')!;
    expect(cpu.type).toBe('gauge');
    expect(cpu.unit).toBe('%');
    const reqs = mod.metricsCollector.getMetric('http_requests_total')!;
    expect(reqs.type).toBe('counter');
    expect(reqs.labels).toEqual(['method', 'route', 'status']);
  });

  it('registerDefaultAlertRules 注册 high_disk_usage（disk>90,duration=60,critical）经触发验证', () => {
    mod.registerDefaultMetrics();
    mod.registerDefaultAlertRules();
    let now = 1000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    mod.metricsCollector.record('system_disk_usage', 95); // > 90 触发
    mod.alertEngine.evaluateRules(); // duration=60 → pending
    expect(mod.alertEngine.getActiveAlerts().length).toBe(1);
    expect(mod.alertEngine.getActiveAlerts()[0].status).toBe('pending');
    now = 61000; // 60s 后
    mod.alertEngine.evaluateRules(); // pending → firing
    expect(mod.alertEngine.getActiveAlerts()[0].status).toBe('firing');
    expect(mod.alertEngine.getActiveAlerts()[0].level).toBe('critical');
    spy.mockRestore();
  });

  it('单例 alertEngine 与 metricsCollector 共享同一实例（record 后 evaluateRules 可读到）', () => {
    mod.registerDefaultMetrics();
    mod.registerDefaultAlertRules();
    let now = 1000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    mod.metricsCollector.record('system_memory_usage', 90); // > 85, duration=300
    mod.alertEngine.evaluateRules();
    expect(mod.alertEngine.getActiveAlerts().length).toBe(1); // alertEngine 读到 metricsCollector 的值
    spy.mockRestore();
  });
});
