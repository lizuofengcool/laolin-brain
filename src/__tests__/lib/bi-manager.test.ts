/**
 * bi/bi-manager BiManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/bi/bi-manager.ts。该模块为纯内存态的 BI 管器（KPI / 仪表盘 / 业务分析 /
 * 数据预警 / 数据推荐 / 增长分析 单例），唯一运行时外部 import 为 analyticsManager，但该值
 * 在整个模块内从未被引用（死导入），已 vi.mock 隔离以避免拉入 analytics→visualization 传递依赖。
 *
 * 关键控制流：
 * - 单例：private constructor + static getInstance；模块导出 biManager = getInstance()
 * - KPI CRUD：tenantId 隔离（未命中 / 跨租户 → null/false）；createKpi 默认值兜底（|| vs ?? 差异）；
 *   updateKpi 浅合并并强制保留 id/tenantId；getKpis 按 sortOrder||0 升序、可按 category 过滤
 * - calculateKpiValue：
 *   · change = previousValue !== undefined ? current - previous : 0
 *   · changePercent = previousValue && previousValue !== 0 ? change / Math.abs(previousValue) : 0
 *     （previousValue=0 或 undefined 归零；负基线用 Math.abs 防 changePercent 正负翻转）
 *   · trend 阈值 Math.abs(changePercent) > 0.01（0.01 恰好 stable、0.011 up）
 *   · status 先按 criticalThreshold !== undefined + direction 计算 critical/warning；
 *     后被 trend !== stable 无条件覆盖为 improving/declining（即便已 critical 也会被覆盖）：
 *     higher_is_better: up→improving / down→declining；lower_is_better: down→improving / up→declining
 * - 仪表盘 CRUD + getDashboard 副作用（viewCount++、lastViewedAt 更新，返回同引用突变）；
 *   toggleFavorite 突变并返回新布尔；getDashboards 按 updatedAt 降序；updateDashboard version+1 并保留 id/tenantId
 * - createFromTemplate：模板未命中 null；命中则 widgets 映射（id=widget_${i}_${Date.now()}、width||12、config={}）
 * - runAnalysis：switch 分发 user/revenue/retention/conversion/default（growth/behavior 落 default）；
 *   generateAnalysisInsights 按 category 生成固定洞察串；分析结果存入 analyses Map
 * - 预警 CRUD + getAlerts 按 createdAt 降序
 * - generateRecommendations：固定 3 条（insight/optimization/action），id=rec_${Date.now()}_${1|2|3}
 * - calculateGrowth：基于 data.length 的确定性数学
 *
 * 状态策略：BiManager 构造器私有无法 new；每个用例前 vi.resetModules() + await import 取全新单例
 * （fresh class → fresh instance → fresh dashboards/kpis/alerts/analyses Maps）。依赖 Date.now() 的
 * id/时间戳断言用例用 vi.useFakeTimers() + vi.setSystemTime(NOW) 固定时刻；Math.random 在精确 id
 * 断言用例中 spy 固定返回值，期望后缀用同一表达式计算保证匹配。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KpiDefinition, Dashboard, DataAlert } from '@/lib/bi/types';

// 死导入隔离：bi-manager import { analyticsManager } from '../analytics' 但从未使用
vi.mock('@/lib/analytics', () => ({
  analyticsManager: {},
}));

// 基准时刻：2026-07-01 10:00:00 UTC
const NOW = new Date('2026-07-01T10:00:00Z');
const NOW_TS = NOW.getTime();

let BiManager: typeof import('@/lib/bi/bi-manager')['BiManager'];
let biManager: import('@/lib/bi/bi-manager')['BiManager'];

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('@/lib/bi/bi-manager');
  BiManager = mod.BiManager;
  biManager = mod.biManager;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 构造一个完整 KpiDefinition，overrides 覆盖默认值 */
function makeKpi(overrides: Partial<KpiDefinition> & { id: string }): KpiDefinition {
  return {
    name: overrides.name ?? `kpi-${overrides.id}`,
    description: overrides.description,
    category: overrides.category ?? 'general',
    unit: overrides.unit,
    formula: overrides.formula,
    dataSource: overrides.dataSource,
    targetValue: overrides.targetValue,
    warningThreshold: overrides.warningThreshold,
    criticalThreshold: overrides.criticalThreshold,
    direction: overrides.direction ?? 'higher_is_better',
    displayFormat: overrides.displayFormat ?? 'number',
    isActive: overrides.isActive ?? true,
    sortOrder: overrides.sortOrder,
    tenantId: overrides.tenantId ?? 'tenant-a',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('bi/bi-manager BiManager', () => {
  // ─── 单例导出 ───────────────────────────────────────────

  describe('单例导出', () => {
    it('biManager 为 BiManager 实例', () => {
      expect(biManager).toBeInstanceOf(BiManager);
    });

    it('getInstance 多次返回同一实例（单例）', () => {
      expect(BiManager.getInstance()).toBe(biManager);
      expect(BiManager.getInstance()).toBe(BiManager.getInstance());
    });

    it('resetModules 后 biManager 为全新实例（状态隔离）', async () => {
      biManager.createKpi({ name: 'before-reset' }, 'tenant-a');
      vi.resetModules();
      const mod2 = await import('@/lib/bi/bi-manager');
      expect(mod2.biManager).not.toBe(biManager);
      expect(mod2.biManager.getKpis('tenant-a')).toHaveLength(0);
    });
  });

  // ─── KPI 管理 ───────────────────────────────────────────

  describe('initializeDefaultKpis', () => {
    it('创建 8 个默认 KPI，名称/分类/sortOrder 与 DEFAULT_KPIS 一致', () => {
      const kpis = biManager.initializeDefaultKpis('tenant-a');
      expect(kpis).toHaveLength(8);
      expect(kpis.map(k => k.name)).toEqual([
        '总用户数', '日活跃用户', '月活跃用户', '用户留存率',
        '总存储量', '文件总数', 'AI调用次数', '收入',
      ]);
      expect(kpis.map(k => k.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(kpis.map(k => k.category)).toEqual(
        ['user', 'user', 'user', 'user', 'storage', 'files', 'ai', 'revenue']
      );
    });

    it('每个 KPI id 以 kpi_ + name 开头且互不相同，tenantId 注入', () => {
      const kpis = biManager.initializeDefaultKpis('tenant-a');
      const ids = kpis.map(k => k.id);
      expect(new Set(ids).size).toBe(8);
      kpis.forEach(k => {
        expect(k.id).toMatch(/^kpi_/);
        expect(k.tenantId).toBe('tenant-a');
        expect(k.createdAt).toBeInstanceOf(Date);
        expect(k.updatedAt).toBeInstanceOf(Date);
      });
    });

    it('写入后可通过 getKpis 读回', () => {
      biManager.initializeDefaultKpis('tenant-a');
      expect(biManager.getKpis('tenant-a')).toHaveLength(8);
    });
  });

  describe('getKpis', () => {
    it('按 tenantId 过滤（跨租户隔离）', () => {
      biManager.createKpi({ name: 'A', sortOrder: 1 }, 'tenant-a');
      biManager.createKpi({ name: 'B', sortOrder: 1 }, 'tenant-b');
      expect(biManager.getKpis('tenant-a').map(k => k.name)).toEqual(['A']);
      expect(biManager.getKpis('tenant-b').map(k => k.name)).toEqual(['B']);
      expect(biManager.getKpis('tenant-c')).toHaveLength(0);
    });

    it('按 sortOrder 升序排列（sortOrder 缺省按 0）', () => {
      biManager.createKpi({ name: 'late', sortOrder: 5 }, 't');
      biManager.createKpi({ name: 'first', sortOrder: 1 }, 't');
      biManager.createKpi({ name: 'mid', sortOrder: 3 }, 't');
      biManager.createKpi({ name: 'no-order' }, 't'); // sortOrder undefined → 0 → 排最前
      expect(biManager.getKpis('t').map(k => k.name)).toEqual(['no-order', 'first', 'mid', 'late']);
    });

    it('category 过滤仅返回匹配分类', () => {
      biManager.createKpi({ name: 'u1', category: 'user' }, 't');
      biManager.createKpi({ name: 's1', category: 'storage' }, 't');
      biManager.createKpi({ name: 'u2', category: 'user' }, 't');
      const users = biManager.getKpis('t', 'user');
      expect(users.map(k => k.name).sort()).toEqual(['u1', 'u2']);
      expect(biManager.getKpis('t', 'storage').map(k => k.name)).toEqual(['s1']);
    });
  });

  describe('getKpi', () => {
    it('命中返回 KPI，未命中返回 null', () => {
      const kpi = biManager.createKpi({ name: 'X' }, 'tenant-a');
      expect(biManager.getKpi(kpi.id, 'tenant-a')).toBe(kpi);
      expect(biManager.getKpi('nope', 'tenant-a')).toBeNull();
    });

    it('跨租户访问返回 null（即使 id 存在）', () => {
      const kpi = biManager.createKpi({ name: 'X' }, 'tenant-a');
      expect(biManager.getKpi(kpi.id, 'tenant-b')).toBeNull();
    });
  });

  describe('createKpi', () => {
    it('id 形如 kpi_${Date.now()}_${random}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.123456789;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const kpi = biManager.createKpi({}, 'tenant-a');
      expect(kpi.id).toBe(`kpi_${NOW_TS}_${expectedSuffix}`);
      expect(kpi.name).toBe('未命名KPI');
      expect(kpi.category).toBe('general');
      expect(kpi.direction).toBe('higher_is_better');
      expect(kpi.displayFormat).toBe('number');
      expect(kpi.isActive).toBe(true);
      expect(kpi.tenantId).toBe('tenant-a');
      expect(kpi.createdAt).toEqual(NOW);
      expect(kpi.updatedAt).toEqual(NOW);
    });

    it('data 透传覆盖默认值', () => {
      const kpi = biManager.createKpi(
        { name: '收入', description: 'd', category: 'revenue', unit: '元',
          formula: 'sum', dataSource: 'orders', targetValue: 1000,
          warningThreshold: 500, criticalThreshold: 200, direction: 'lower_is_better',
          displayFormat: 'currency', isActive: false, sortOrder: 9 },
        't-a'
      );
      expect(kpi).toMatchObject({
        name: '收入', description: 'd', category: 'revenue', unit: '元',
        formula: 'sum', dataSource: 'orders', targetValue: 1000,
        warningThreshold: 500, criticalThreshold: 200, direction: 'lower_is_better',
        displayFormat: 'currency', isActive: false, sortOrder: 9,
      });
    });

    it('name 空串走 || 兜底为未命名KPI，isActive=false 走 ?? 保留 false', () => {
      const kpi = biManager.createKpi({ name: '', isActive: false }, 't');
      expect(kpi.name).toBe('未命名KPI');
      expect(kpi.isActive).toBe(false);
    });
  });

  describe('updateKpi', () => {
    it('命中：浅合并 + updatedAt 刷新，保留 id/tenantId', () => {
      const kpi = biManager.createKpi({ name: 'old', sortOrder: 1 }, 't-a');
      const before = kpi.updatedAt;
      const updated = biManager.updateKpi(kpi.id, { name: 'new', targetValue: 99 }, 't-a');
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('new');
      expect(updated!.targetValue).toBe(99);
      expect(updated!.sortOrder).toBe(1); // 未传字段保留
      expect(updated!.id).toBe(kpi.id);
      expect(updated!.tenantId).toBe('t-a');
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('即便 data 带 id/tenantId 也被强制保留原值', () => {
      const kpi = biManager.createKpi({ name: 'a' }, 't-a');
      const updated = biManager.updateKpi(
        kpi.id, { id: 'forged', tenantId: 'forged', name: 'b' } as Partial<KpiDefinition>, 't-a'
      );
      expect(updated!.id).toBe(kpi.id);
      expect(updated!.tenantId).toBe('t-a');
    });

    it('未命中 / 跨租户返回 null', () => {
      const kpi = biManager.createKpi({ name: 'a' }, 't-a');
      expect(biManager.updateKpi('nope', { name: 'b' }, 't-a')).toBeNull();
      expect(biManager.updateKpi(kpi.id, { name: 'b' }, 't-b')).toBeNull();
    });
  });

  describe('deleteKpi', () => {
    it('命中删除返回 true，再次 getKpi 返回 null', () => {
      const kpi = biManager.createKpi({ name: 'a' }, 't-a');
      expect(biManager.deleteKpi(kpi.id, 't-a')).toBe(true);
      expect(biManager.getKpi(kpi.id, 't-a')).toBeNull();
    });

    it('未命中 / 跨租户返回 false（不删除他人 KPI）', () => {
      const kpi = biManager.createKpi({ name: 'a' }, 't-a');
      expect(biManager.deleteKpi(kpi.id, 't-b')).toBe(false);
      expect(biManager.deleteKpi('nope', 't-a')).toBe(false);
      expect(biManager.getKpi(kpi.id, 't-a')).not.toBeNull(); // 仍在
    });
  });

  // ─── calculateKpiValue（核心控制流） ────────────────────

  describe('calculateKpiValue - change / changePercent 计算', () => {
    it('previousValue 未传 → change=0、changePercent=0、trend=stable', () => {
      const kpi = makeKpi({ id: 'k1' });
      const v = biManager.calculateKpiValue(kpi, 100);
      expect(v.change).toBe(0);
      expect(v.changePercent).toBe(0);
      expect(v.trend).toBe('stable');
      expect(v.previousValue).toBeUndefined();
    });

    it('current>previous → change 正、changePercent 正、trend up', () => {
      const kpi = makeKpi({ id: 'k1' });
      const v = biManager.calculateKpiValue(kpi, 120, 100);
      expect(v.change).toBe(20);
      expect(v.changePercent).toBeCloseTo(0.2, 10);
      expect(v.trend).toBe('up');
    });

    it('current<previous → change 负、changePercent 负、trend down', () => {
      const kpi = makeKpi({ id: 'k1' });
      const v = biManager.calculateKpiValue(kpi, 80, 100);
      expect(v.change).toBe(-20);
      expect(v.changePercent).toBeCloseTo(-0.2, 10);
      expect(v.trend).toBe('down');
    });

    it('previousValue=0 → changePercent 归零（falsy 守卫），trend stable 即使 change≠0', () => {
      const kpi = makeKpi({ id: 'k1' });
      const v = biManager.calculateKpiValue(kpi, 50, 0);
      expect(v.change).toBe(50);
      expect(v.changePercent).toBe(0); // 0 falsy 守卫
      expect(v.trend).toBe('stable');
    });

    it('previousValue 为负 → changePercent 用 Math.abs(previousValue) 防正负翻转', () => {
      const kpi = makeKpi({ id: 'k1' });
      // current=-90, previous=-100 → change=10, changePercent=10/|-100|=0.1 → up
      const v = biManager.calculateKpiValue(kpi, -90, -100);
      expect(v.change).toBe(10);
      expect(v.changePercent).toBeCloseTo(0.1, 10);
      expect(v.trend).toBe('up');
    });

    it('trend 阈值边界：changePercent=0.01 恰好 stable（不严格大于）', () => {
      const kpi = makeKpi({ id: 'k1' });
      // 100→101：changePercent=1/100=0.01，Math.abs(0.01)>0.01 为 false
      const v = biManager.calculateKpiValue(kpi, 101, 100);
      expect(v.changePercent).toBeCloseTo(0.01, 10);
      expect(v.trend).toBe('stable');
    });

    it('trend 阈值边界：changePercent≈0.011 >0.01 → up', () => {
      const kpi = makeKpi({ id: 'k1' });
      const v = biManager.calculateKpiValue(kpi, 101.1, 100);
      expect(v.changePercent).toBeCloseTo(0.011, 10);
      expect(v.trend).toBe('up');
    });
  });

  describe('calculateKpiValue - status 与 trend 覆盖', () => {
    it('higher_is_better 无阈值 + trend up → status=improving（阈值块跳过）', () => {
      const kpi = makeKpi({ id: 'k1' }); // 无 criticalThreshold
      const v = biManager.calculateKpiValue(kpi, 120, 100);
      expect(v.status).toBe('improving');
    });

    it('higher_is_better 无阈值 + trend down → status=declining', () => {
      const kpi = makeKpi({ id: 'k1' });
      const v = biManager.calculateKpiValue(kpi, 80, 100);
      expect(v.status).toBe('declining');
    });

    it('higher_is_better 无阈值 + stable → status=normal', () => {
      const kpi = makeKpi({ id: 'k1' });
      const v = biManager.calculateKpiValue(kpi, 100, 100);
      expect(v.status).toBe('normal');
    });

    it('trend 覆盖 critical：higher_is_better current<critical 但 trend up → improving（非 critical）', () => {
      // criticalThreshold=50, current=30(<critical), previous=25 → trend up → 覆盖为 improving
      const kpi = makeKpi({ id: 'k1', criticalThreshold: 50, warningThreshold: 80 });
      const v = biManager.calculateKpiValue(kpi, 30, 25);
      expect(v.trend).toBe('up');
      expect(v.status).toBe('improving'); // 关键：阈值算出 critical 被 trend 覆盖
    });

    it('trend 覆盖 critical：higher_is_better current<critical 且 trend down → declining', () => {
      const kpi = makeKpi({ id: 'k1', criticalThreshold: 50, warningThreshold: 80 });
      const v = biManager.calculateKpiValue(kpi, 30, 35);
      expect(v.trend).toBe('down');
      expect(v.status).toBe('declining');
    });

    it('stable 时阈值 status 保留：higher_is_better current<critical 且 stable → critical', () => {
      const kpi = makeKpi({ id: 'k1', criticalThreshold: 50, warningThreshold: 80 });
      const v = biManager.calculateKpiValue(kpi, 30, 30);
      expect(v.trend).toBe('stable');
      expect(v.status).toBe('critical');
    });

    it('higher_is_better current 介于 critical 与 warning 之间 且 stable → warning', () => {
      // critical=50, warning=80, current=60：>critical 不 critical，<warning 且 warning 真值 → warning
      const kpi = makeKpi({ id: 'k1', criticalThreshold: 50, warningThreshold: 80 });
      const v = biManager.calculateKpiValue(kpi, 60, 60);
      expect(v.status).toBe('warning');
    });

    it('higher_is_better warningThreshold=0 走 falsy 跳过 warning 分支', () => {
      // critical=50, warning=0(假值), current=60：>critical 不 critical；warning 0 假值跳过 → normal
      const kpi = makeKpi({ id: 'k1', criticalThreshold: 50, warningThreshold: 0 });
      const v = biManager.calculateKpiValue(kpi, 60, 60);
      expect(v.status).toBe('normal');
    });

    it('criticalThreshold=0（defined）进入阈值块：higher_is_better current=-5<0 → critical', () => {
      const kpi = makeKpi({ id: 'k1', criticalThreshold: 0 });
      const v = biManager.calculateKpiValue(kpi, -5, -5);
      expect(v.status).toBe('critical');
    });

    it('lower_is_better current>critical 且 trend up → declining（trend 覆盖）', () => {
      const kpi = makeKpi({ id: 'k1', direction: 'lower_is_better', criticalThreshold: 50 });
      const v = biManager.calculateKpiValue(kpi, 60, 55); // change=+5 → up
      expect(v.trend).toBe('up');
      expect(v.status).toBe('declining');
    });

    it('lower_is_better current<critical（好）且 trend down → improving', () => {
      const kpi = makeKpi({ id: 'k1', direction: 'lower_is_better', criticalThreshold: 50 });
      const v = biManager.calculateKpiValue(kpi, 40, 45); // change=-5 → down
      expect(v.trend).toBe('down');
      expect(v.status).toBe('improving');
    });

    it('lower_is_better current>warning 且 stable → warning', () => {
      const kpi = makeKpi({ id: 'k1', direction: 'lower_is_better',
        criticalThreshold: 60, warningThreshold: 45 });
      const v = biManager.calculateKpiValue(kpi, 48, 48); // 48<critical(60) 不 critical；48>warning(45) → warning
      expect(v.status).toBe('warning');
    });

    it('lower_is_better current>critical 且 stable → critical', () => {
      const kpi = makeKpi({ id: 'k1', direction: 'lower_is_better', criticalThreshold: 50 });
      const v = biManager.calculateKpiValue(kpi, 60, 60);
      expect(v.status).toBe('critical');
    });
  });

  describe('calculateKpiValue - 结果字段', () => {
    it('返回 kpiId/currentValue/previousValue/targetValue/period/asOfDate', () => {
      const kpi = makeKpi({ id: 'k1', targetValue: 1000 });
      const v = biManager.calculateKpiValue(kpi, 200, 150);
      expect(v.kpiId).toBe('k1');
      expect(v.currentValue).toBe(200);
      expect(v.previousValue).toBe(150);
      expect(v.targetValue).toBe(1000);
      expect(v.period).toBe('current');
      expect(v.asOfDate).toBeInstanceOf(Date);
    });
  });

  // ─── 仪表盘管理 ─────────────────────────────────────────

  describe('createDashboard', () => {
    it('默认值兜底：name/type/status/tags/widgets/layout/defaultTimeRange/isFavorite/viewCount/version', () => {
      const d = biManager.createDashboard({}, 'u1', 't-a');
      expect(d.name).toBe('未命名仪表盘');
      expect(d.type).toBe('custom');
      expect(d.status).toBe('draft');
      expect(d.tags).toEqual([]);
      expect(d.widgets).toEqual([]);
      expect(d.layout).toBe('grid');
      expect(d.defaultTimeRange).toBe('7d');
      expect(d.isFavorite).toBe(false);
      expect(d.viewCount).toBe(0);
      expect(d.lastViewedAt).toBeUndefined();
      expect(d.version).toBe(1);
      expect(d.createdBy).toBe('u1');
      expect(d.updatedBy).toBe('u1');
      expect(d.tenantId).toBe('t-a');
      expect(d.id).toMatch(/^dashboard_/);
      expect(d.createdAt).toBeInstanceOf(Date);
    });

    it('data 透传覆盖', () => {
      const d = biManager.createDashboard(
        { name: 'N', type: 'business', status: 'published', category: 'cat',
          tags: ['t1'], widgets: [{ id: 'w1', type: 'kpi', title: 'W', width: 6, config: {} }],
          layout: 'free', defaultTimeRange: '30d', coverImage: 'img', filters: { f: 1 } },
        'u1', 't-a'
      );
      expect(d.name).toBe('N');
      expect(d.type).toBe('business');
      expect(d.status).toBe('published');
      expect(d.category).toBe('cat');
      expect(d.tags).toEqual(['t1']);
      expect(d.widgets).toHaveLength(1);
      expect(d.layout).toBe('free');
      expect(d.defaultTimeRange).toBe('30d');
      expect(d.coverImage).toBe('img');
      expect(d.filters).toEqual({ f: 1 });
    });
  });

  describe('getDashboards', () => {
    it('按 tenantId 过滤 + 按 updatedAt 降序', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const a = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const b = biManager.createDashboard({ name: 'b' }, 'u', 't-a');
      vi.setSystemTime(new Date(NOW_TS + 2000));
      const c = biManager.createDashboard({ name: 'c' }, 'u', 't-a');
      // t-b 隔离
      biManager.createDashboard({ name: 'x' }, 'u', 't-b');
      const list = biManager.getDashboards('t-a');
      expect(list.map(d => d.name)).toEqual(['c', 'b', 'a']);
      expect(biManager.getDashboards('t-b').map(d => d.name)).toEqual(['x']);
      expect(biManager.getDashboards('t-c')).toHaveLength(0);
    });

    it('type 过滤仅返回匹配类型', () => {
      biManager.createDashboard({ name: 'biz', type: 'business' }, 'u', 't');
      biManager.createDashboard({ name: 'cst', type: 'custom' }, 'u', 't');
      biManager.createDashboard({ name: 'biz2', type: 'business' }, 'u', 't');
      const biz = biManager.getDashboards('t', 'business');
      expect(biz.map(d => d.name).sort()).toEqual(['biz', 'biz2']);
    });
  });

  describe('getDashboard', () => {
    it('命中返回仪表盘并自增 viewCount、设置 lastViewedAt（同引用突变）', () => {
      const created = biManager.createDashboard({ name: 'd' }, 'u', 't-a');
      expect(created.viewCount).toBe(0);
      const got1 = biManager.getDashboard(created.id, 't-a');
      expect(got1).not.toBeNull();
      expect(got1!.viewCount).toBe(1);
      expect(got1!.lastViewedAt).toBeInstanceOf(Date);
      // created 与 Map 内同引用，被突变
      expect(created.viewCount).toBe(1);
      const got2 = biManager.getDashboard(created.id, 't-a');
      expect(got2!.viewCount).toBe(2);
      expect(got1).toBe(got2); // 同引用
      expect(got2).toBe(created);
    });

    it('未命中 / 跨租户返回 null', () => {
      const d = biManager.createDashboard({ name: 'd' }, 'u', 't-a');
      expect(biManager.getDashboard('nope', 't-a')).toBeNull();
      expect(biManager.getDashboard(d.id, 't-b')).toBeNull();
    });
  });

  describe('updateDashboard', () => {
    it('命中：浅合并 + version+1 + updatedBy，保留 id/tenantId', () => {
      const d = biManager.createDashboard({ name: 'old' }, 'u1', 't-a');
      const upd = biManager.updateDashboard(d.id, { name: 'new', status: 'published' }, 'u2', 't-a');
      expect(upd).not.toBeNull();
      expect(upd!.name).toBe('new');
      expect(upd!.status).toBe('published');
      expect(upd!.version).toBe(2);
      expect(upd!.updatedBy).toBe('u2');
      expect(upd!.id).toBe(d.id);
      expect(upd!.tenantId).toBe('t-a');
      expect(upd!.createdBy).toBe('u1'); // 未传字段保留
    });

    it('连续 update version 持续 +1', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      biManager.updateDashboard(d.id, { name: 'b' }, 'u', 't-a');
      const upd = biManager.updateDashboard(d.id, { name: 'c' }, 'u', 't-a');
      expect(upd!.version).toBe(3);
    });

    it('即便 data 带 id/tenantId 也被强制保留原值', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      const upd = biManager.updateDashboard(
        d.id, { id: 'forged', tenantId: 'forged', name: 'b' } as Partial<Dashboard>, 'u', 't-a'
      );
      expect(upd!.id).toBe(d.id);
      expect(upd!.tenantId).toBe('t-a');
    });

    it('未命中 / 跨租户返回 null', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      expect(biManager.updateDashboard('nope', { name: 'b' }, 'u', 't-a')).toBeNull();
      expect(biManager.updateDashboard(d.id, { name: 'b' }, 'u', 't-b')).toBeNull();
    });
  });

  describe('deleteDashboard', () => {
    it('命中删除返回 true，再次 get 返回 null', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      expect(biManager.deleteDashboard(d.id, 't-a')).toBe(true);
      expect(biManager.getDashboard(d.id, 't-a')).toBeNull();
    });

    it('未命中 / 跨租户返回 false', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      expect(biManager.deleteDashboard(d.id, 't-b')).toBe(false);
      expect(biManager.deleteDashboard('nope', 't-a')).toBe(false);
      expect(biManager.getDashboard(d.id, 't-a')).not.toBeNull();
    });
  });

  describe('toggleFavorite', () => {
    it('首次切换 false→true 返回 true，再次切换 true→false 返回 false', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      expect(d.isFavorite).toBe(false);
      expect(biManager.toggleFavorite(d.id, 't-a')).toBe(true);
      expect(d.isFavorite).toBe(true);
      expect(biManager.toggleFavorite(d.id, 't-a')).toBe(false);
      expect(d.isFavorite).toBe(false);
    });

    it('切换时 updatedAt 被刷新', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      const before = d.updatedAt;
      biManager.toggleFavorite(d.id, 't-a');
      expect(d.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('未命中 / 跨租户返回 false', () => {
      const d = biManager.createDashboard({ name: 'a' }, 'u', 't-a');
      expect(biManager.toggleFavorite('nope', 't-a')).toBe(false);
      expect(biManager.toggleFavorite(d.id, 't-b')).toBe(false);
    });
  });

  describe('getDashboardTemplates', () => {
    it('返回 DASHBOARD_TEMPLATES 常量数组（含 overview/user-analytics/storage-analytics）', () => {
      const t = biManager.getDashboardTemplates();
      expect(t.map(x => x.id).sort()).toEqual(['overview', 'storage-analytics', 'user-analytics']);
    });
  });

  describe('createFromTemplate', () => {
    it('未命中模板返回 null', () => {
      expect(biManager.createFromTemplate('nonexistent', 'u', 't-a')).toBeNull();
    });

    it('命中 overview：创建仪表盘 + widgets 映射（id/type/title/width/config）', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const d = biManager.createFromTemplate('overview', 'u1', 't-a');
      expect(d).not.toBeNull();
      expect(d!.name).toBe('业务概览');
      expect(d!.description).toBe('核心业务指标总览');
      expect(d!.type).toBe('business');
      expect(d!.category).toBe('overview');
      expect(d!.widgets).toHaveLength(6);
      // 第一个 widget：id=widget_0_${NOW_TS}，type=kpi，title=总用户数，width=6，config={}
      const w0 = d!.widgets[0];
      expect(w0.id).toBe(`widget_0_${NOW_TS}`);
      expect(w0.type).toBe('kpi');
      expect(w0.title).toBe('总用户数');
      expect(w0.width).toBe(6);
      expect(w0.config).toEqual({});
      // created via createDashboard → 默认值
      expect(d!.isFavorite).toBe(false);
      expect(d!.viewCount).toBe(0);
      expect(d!.version).toBe(1);
      expect(d!.createdBy).toBe('u1');
      expect(d!.tenantId).toBe('t-a');
    });

    it('widget id 按索引 i 递增', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const d = biManager.createFromTemplate('user-analytics', 'u', 't-a')!;
      expect(d.widgets.map(w => w.id)).toEqual(
        [0, 1, 2, 3, 4, 5].map(i => `widget_${i}_${NOW_TS}`)
      );
    });
  });

  // ─── 业务分析 ───────────────────────────────────────────

  describe('runAnalysis', () => {
    it('user 分析：results 字段 + insights 固定串', () => {
      const data = new Array(100).fill(0);
      const a = biManager.runAnalysis('user', '用户分析', data, 'u1', 't-a');
      expect(a.id).toMatch(/^analysis_/);
      expect(a.name).toBe('用户分析');
      expect(a.category).toBe('user');
      expect(a.type).toBe('user');
      expect(a.tenantId).toBe('t-a');
      expect(a.createdBy).toBe('u1');
      expect(a.metrics).toEqual([]);
      expect(a.dimensions).toEqual([]);
      expect(a.results).toEqual({
        totalUsers: 100,
        activeUsers: 70,
        newUsers: 20,
        avgSessions: 5.2,
        avgDuration: '15m 30s',
        topFeatures: ['文件上传', '搜索', 'AI功能'],
      });
      expect(a.insights).toEqual([
        '用户活跃度良好，日活占比70%',
        '新用户占比20%，增长趋势稳定',
      ]);
    });

    it('revenue 分析：results 字段 + insights', () => {
      const a = biManager.runAnalysis('revenue', 'r', new Array(10).fill(0), 'u', 't-a');
      expect(a.results).toEqual({
        totalRevenue: 10 * 99,
        mrr: 10 * 29,
        arpu: 29,
        ltv: 348,
        churnRate: 0.05,
        growthRate: 0.15,
      });
      expect(a.insights).toEqual([
        '收入保持稳定增长，月环比增长15%',
        '用户生命周期价值约348元',
      ]);
    });

    it('retention 分析：cohortSize + 4 周期 + insights', () => {
      const a = biManager.runAnalysis('retention', 'ret', new Array(100).fill(0), 'u', 't-a');
      expect(a.results.cohort).toBe('本月新用户');
      expect(a.results.cohortSize).toBe(100);
      expect(a.results.periods).toHaveLength(4);
      expect(a.results.periods.map(p => p.period)).toEqual([0, 1, 7, 30]);
      expect(a.results.periods[0]).toEqual({ period: 0, label: 'Day 0', retained: 100, retentionRate: 1 });
      expect(a.results.overallRetention).toBe(0.25);
      expect(a.results.benchmark).toBe(0.3);
      expect(a.insights).toEqual([
        '7日留存率40%，略低于行业平均',
        '建议优化新用户引导以提升留存',
      ]);
    });

    it('conversion 分析：4 步骤 + 总转化 + insights', () => {
      const a = biManager.runAnalysis('conversion', 'cv', new Array(100).fill(0), 'u', 't-a');
      expect(a.results.steps).toHaveLength(4);
      expect(a.results.steps.map(s => s.name)).toEqual(['访问', '注册', '首次使用', '付费']);
      expect(a.results.totalConversions).toBe(10); // floor(100*0.1)
      expect(a.results.overallConversionRate).toBe(0.1);
      expect(a.results.bottlenecks).toEqual(['注册到首次使用', '首次使用到付费']);
      expect(a.results.suggestions).toHaveLength(3);
      expect(a.insights).toEqual([
        '整体转化率10%，有提升空间',
        '注册到首次使用是主要流失点',
      ]);
    });

    it('growth（switch 未覆盖）走 default：results={data} + 默认洞察', () => {
      const data = [{ x: 1 }, { x: 2 }];
      const a = biManager.runAnalysis('growth', 'g', data, 'u', 't-a');
      expect(a.results).toEqual({ data });
      expect(a.insights).toEqual(['分析完成，查看详细数据了解更多']);
    });

    it('behavior（switch 未覆盖）走 default', () => {
      const a = biManager.runAnalysis('behavior', 'b', [1, 2, 3], 'u', 't-a');
      expect(a.results).toEqual({ data: [1, 2, 3] });
      expect(a.insights).toEqual(['分析完成，查看详细数据了解更多']);
    });

    it('分析存入 analyses Map：再次 runAnalysis 生成不同 id', () => {
      const a1 = biManager.runAnalysis('user', 'a1', [], 'u', 't-a');
      const a2 = biManager.runAnalysis('user', 'a2', [], 'u', 't-a');
      expect(a1.id).not.toBe(a2.id);
    });

    it('空 data 数组：各分析返回确定性数学（0 长度）', () => {
      const a = biManager.runAnalysis('user', 'empty', [], 'u', 't-a');
      expect(a.results.totalUsers).toBe(0);
      expect(a.results.activeUsers).toBe(0);
      expect(a.results.newUsers).toBe(0);
    });
  });

  // ─── 数据预警 ───────────────────────────────────────────

  describe('createAlert', () => {
    it('默认值兜底：name/metric/condition/threshold/frequency/channels/isEnabled/triggerCount', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.987654321;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const a = biManager.createAlert({}, 'u1', 't-a');
      expect(a.id).toBe(`alert_${NOW_TS}_${expectedSuffix}`);
      expect(a.name).toBe('未命名预警');
      expect(a.metric).toBe('');
      expect(a.condition).toBe('above');
      expect(a.threshold).toBe(0);
      expect(a.frequency).toBe('daily');
      expect(a.channels).toEqual(['in_app']);
      expect(a.isEnabled).toBe(true);
      expect(a.lastTriggeredAt).toBeUndefined();
      expect(a.triggerCount).toBe(0);
      expect(a.createdBy).toBe('u1');
      expect(a.tenantId).toBe('t-a');
      expect(a.createdAt).toEqual(NOW);
    });

    it('data 透传覆盖', () => {
      const a = biManager.createAlert(
        { name: 'A', description: 'd', metric: 'cpu', condition: 'below', threshold: 5,
          unit: '%', frequency: 'realtime', channels: ['email', 'webhook'],
          recipients: ['r@x.com'], isEnabled: false },
        'u', 't-a'
      );
      expect(a).toMatchObject({
        name: 'A', description: 'd', metric: 'cpu', condition: 'below', threshold: 5,
        unit: '%', frequency: 'realtime', channels: ['email', 'webhook'],
        recipients: ['r@x.com'], isEnabled: false,
      });
    });
  });

  describe('getAlerts', () => {
    it('按 tenantId 过滤 + 按 createdAt 降序', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const a = biManager.createAlert({ name: 'a' }, 'u', 't-a');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const b = biManager.createAlert({ name: 'b' }, 'u', 't-a');
      vi.setSystemTime(new Date(NOW_TS + 2000));
      const c = biManager.createAlert({ name: 'c' }, 'u', 't-a');
      biManager.createAlert({ name: 'x' }, 'u', 't-b');
      const list = biManager.getAlerts('t-a');
      expect(list.map(x => x.name)).toEqual(['c', 'b', 'a']);
      expect(biManager.getAlerts('t-b').map(x => x.name)).toEqual(['x']);
      expect(biManager.getAlerts('t-c')).toHaveLength(0);
    });
  });

  describe('updateAlert', () => {
    it('命中：浅合并 + updatedAt 刷新，保留 id/tenantId', () => {
      const a = biManager.createAlert({ name: 'old', threshold: 1 }, 'u', 't-a');
      const upd = biManager.updateAlert(a.id, { name: 'new', threshold: 9, isEnabled: false }, 't-a');
      expect(upd).not.toBeNull();
      expect(upd!.name).toBe('new');
      expect(upd!.threshold).toBe(9);
      expect(upd!.isEnabled).toBe(false);
      expect(upd!.metric).toBe(''); // 未传字段保留
      expect(upd!.id).toBe(a.id);
      expect(upd!.tenantId).toBe('t-a');
      expect(upd!.updatedAt.getTime()).toBeGreaterThanOrEqual(a.updatedAt.getTime());
    });

    it('即便 data 带 id/tenantId 也被强制保留原值', () => {
      const a = biManager.createAlert({ name: 'a' }, 'u', 't-a');
      const upd = biManager.updateAlert(
        a.id, { id: 'forged', tenantId: 'forged', name: 'b' } as Partial<DataAlert>, 't-a'
      );
      expect(upd!.id).toBe(a.id);
      expect(upd!.tenantId).toBe('t-a');
    });

    it('未命中 / 跨租户返回 null', () => {
      const a = biManager.createAlert({ name: 'a' }, 'u', 't-a');
      expect(biManager.updateAlert('nope', { name: 'b' }, 't-a')).toBeNull();
      expect(biManager.updateAlert(a.id, { name: 'b' }, 't-b')).toBeNull();
    });
  });

  describe('deleteAlert', () => {
    it('命中删除返回 true', () => {
      const a = biManager.createAlert({ name: 'a' }, 'u', 't-a');
      expect(biManager.deleteAlert(a.id, 't-a')).toBe(true);
      expect(biManager.getAlerts('t-a')).toHaveLength(0);
    });

    it('未命中 / 跨租户返回 false', () => {
      const a = biManager.createAlert({ name: 'a' }, 'u', 't-a');
      expect(biManager.deleteAlert(a.id, 't-b')).toBe(false);
      expect(biManager.deleteAlert('nope', 't-a')).toBe(false);
      expect(biManager.getAlerts('t-a')).toHaveLength(1);
    });
  });

  // ─── 数据推荐 ───────────────────────────────────────────

  describe('generateRecommendations', () => {
    it('返回 3 条推荐，id 形如 rec_${ts}_${1|2|3}，互不相同，tenantId 注入', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const recs = biManager.generateRecommendations([], 't-a');
      expect(recs).toHaveLength(3);
      expect(recs.map(r => r.id)).toEqual([
        `rec_${NOW_TS}_1`,
        `rec_${NOW_TS}_2`,
        `rec_${NOW_TS}_3`,
      ]);
      recs.forEach(r => {
        expect(r.tenantId).toBe('t-a');
        expect(r.createdAt).toEqual(NOW);
        expect(r.relatedMetrics).toHaveLength(2);
        expect(r.suggestedActions).toHaveLength(3);
      });
    });

    it('第 1 条：insight / 提升用户留存 / high / 0.85 / user', () => {
      const recs = biManager.generateRecommendations([], 't-a');
      expect(recs[0]).toMatchObject({
        type: 'insight',
        title: '提升用户留存',
        priority: 'high',
        confidence: 0.85,
        category: 'user',
        impact: { area: '用户留存', expectedImprovement: '15%' },
      });
    });

    it('第 2 条：optimization / 存储优化建议 / medium / 0.9 / storage', () => {
      const recs = biManager.generateRecommendations([], 't-a');
      expect(recs[1]).toMatchObject({
        type: 'optimization',
        title: '存储优化建议',
        priority: 'medium',
        confidence: 0.9,
        category: 'storage',
        impact: { area: '存储成本', expectedImprovement: '20%' },
      });
    });

    it('第 3 条：action / 增加AI功能使用 / medium / 0.75 / ai', () => {
      const recs = biManager.generateRecommendations([], 't-a');
      expect(recs[2]).toMatchObject({
        type: 'action',
        title: '增加AI功能使用',
        priority: 'medium',
        confidence: 0.75,
        category: 'ai',
        impact: { area: '功能采用率', expectedImprovement: '30%' },
      });
    });
  });

  // ─── 增长分析 ───────────────────────────────────────────

  describe('calculateGrowth', () => {
    it('基于 data.length 的确定性数学（N=100）', () => {
      const g = biManager.calculateGrowth(new Array(100).fill(0));
      expect(g).toEqual({
        period: '本月',
        newUsers: 20,
        activeUsers: 70,
        retentionRate: 0.4,
        churnRate: 0.05,
        revenue: 2900,
        arpu: 29,
        ltv: 348,
        growthRate: { users: 0.12, revenue: 0.15, engagement: 0.08 },
      });
    });

    it('N=0 时全为 0（floor(0*x)=0、revenue=0）但 arpu/ltv 固定常量', () => {
      const g = biManager.calculateGrowth([]);
      expect(g.newUsers).toBe(0);
      expect(g.activeUsers).toBe(0);
      expect(g.revenue).toBe(0);
      expect(g.arpu).toBe(29);
      expect(g.ltv).toBe(348);
      expect(g.retentionRate).toBe(0.4);
    });
  });
});
