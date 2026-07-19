/**
 * reports/data-fetcher 单元测试
 *
 * 锁定 fetchWidgetData / fetchReportData 的数据源映射契约：
 *   - 5 种 dataSource (stats:overview/by-type/trend/ai/activity) 与 widget.type
 *     组合的输出形态（chartData / metricValue / 空对象）
 *   - 未声明 dataConfig 的 widget 返回 {}（不抛错）
 *   - 未知 dataSource 返回 {}（不抛错）
 *   - fetchReportData 仅收集声明了 dataConfig 的 widget，且单 widget 抛错被
 *     catch 不污染其他 widget 结果
 *
 * Mock 策略：vi.mock @/lib/stats/stats-service 全部 5 个函数为 vi.fn，
 * 每个用例独立 mockResolvedValue 控制返回数据；不触达 db 层。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReportWidget, Report } from '@/lib/reports/types';
import type { ChartConfig, MetricConfig, TableConfig } from '@/lib/reports/types';

const {
  mockGetOverviewStats,
  mockGetStatsByType,
  mockGetTrendStats,
  mockGetActivityStats,
  mockGetAiStats,
} = vi.hoisted(() => ({
  mockGetOverviewStats: vi.fn(),
  mockGetStatsByType: vi.fn(),
  mockGetTrendStats: vi.fn(),
  mockGetActivityStats: vi.fn(),
  mockGetAiStats: vi.fn(),
}));

vi.mock('@/lib/stats/stats-service', () => ({
  getOverviewStats: (...args: unknown[]) => mockGetOverviewStats(...args),
  getStatsByType: (...args: unknown[]) => mockGetStatsByType(...args),
  getTrendStats: (...args: unknown[]) => mockGetTrendStats(...args),
  getActivityStats: (...args: unknown[]) => mockGetActivityStats(...args),
  getAiStats: (...args: unknown[]) => mockGetAiStats(...args),
}));

import {
  fetchWidgetData,
  fetchReportData,
} from '@/lib/reports/data-fetcher';

const TENANT_ID = 'tenant-1';

beforeEach(() => {
  vi.clearAllMocks();
});

function metricWidget(id: string, dataConfig?: ReportWidget['dataConfig']): ReportWidget {
  return {
    id,
    type: 'metric',
    title: id,
    width: 6,
    config: { value: 0, label: id } as MetricConfig,
    ...(dataConfig ? { dataConfig } : {}),
  };
}

function chartWidget(id: string, chartType: 'line' | 'bar' | 'pie' | 'area', dataConfig?: ReportWidget['dataConfig']): ReportWidget {
  return {
    id,
    type: 'chart',
    title: id,
    width: 12,
    config: { type: chartType } as ChartConfig,
    ...(dataConfig ? { dataConfig } : {}),
  };
}

function tableWidget(id: string, dataConfig?: ReportWidget['dataConfig']): ReportWidget {
  return {
    id,
    type: 'table',
    title: id,
    width: 24,
    config: { columns: [] } as TableConfig,
    ...(dataConfig ? { dataConfig } : {}),
  };
}

describe('fetchWidgetData', () => {
  // ─── 无 dataConfig / 未知 dataSource ───────────────────────────

  it('widget 未声明 dataConfig → 返回 {}', async () => {
    const result = await fetchWidgetData(metricWidget('w1'), TENANT_ID);
    expect(result).toEqual({});
    expect(mockGetOverviewStats).not.toHaveBeenCalled();
  });

  it('未知 dataSource → 返回 {}，不调用任何 stats 函数', async () => {
    const w = metricWidget('w1', { dataSource: 'unknown:foo', fields: ['x'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(result).toEqual({});
    expect(mockGetOverviewStats).not.toHaveBeenCalled();
    expect(mockGetStatsByType).not.toHaveBeenCalled();
    expect(mockGetTrendStats).not.toHaveBeenCalled();
    expect(mockGetActivityStats).not.toHaveBeenCalled();
    expect(mockGetAiStats).not.toHaveBeenCalled();
  });

  // ─── stats:overview ───────────────────────────────────────────

  it('stats:overview + metric widget → 返回 fields[0] 字段值作为 metricValue', async () => {
    mockGetOverviewStats.mockResolvedValue({
      totalStorage: 1024,
      totalFiles: 50,
      totalFolders: 5,
      storageUsagePercent: 10,
    });
    const w = metricWidget('w1', { dataSource: 'stats:overview', fields: ['totalStorage'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(mockGetOverviewStats).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ metricValue: 1024 });
  });

  it('stats:overview + chart widget → 返回 {}（chart 不消费 overview 单对象）', async () => {
    mockGetOverviewStats.mockResolvedValue({ totalStorage: 1024 });
    const w = chartWidget('w1', 'line', { dataSource: 'stats:overview', fields: ['totalStorage'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(result).toEqual({});
  });

  it('stats:overview + metric widget 字段值非 number/string → 返回 {}', async () => {
    mockGetOverviewStats.mockResolvedValue({ totalStorage: null });
    const w = metricWidget('w1', { dataSource: 'stats:overview', fields: ['totalStorage'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(result).toEqual({});
  });

  // ─── stats:by-type ────────────────────────────────────────────

  it('stats:by-type + chart widget → types 映射为 {name:type, value:fields[0]}', async () => {
    mockGetStatsByType.mockResolvedValue({
      types: [
        { type: 'image', count: 10, size: 1024, countPercent: 50, sizePercent: 50 },
        { type: 'pdf', count: 5, size: 512, countPercent: 25, sizePercent: 25 },
      ],
      totalFiles: 15,
      totalSize: 1536,
    });
    const w = chartWidget('w1', 'pie', { dataSource: 'stats:by-type', fields: ['count'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(mockGetStatsByType).toHaveBeenCalledWith(TENANT_ID);
    expect(result.chartData).toEqual([
      { name: 'image', value: 10 },
      { name: 'pdf', value: 5 },
    ]);
  });

  it('stats:by-type + metric widget → 返回 {}（metric 不消费 types 数组）', async () => {
    mockGetStatsByType.mockResolvedValue({ types: [], totalFiles: 0, totalSize: 0 });
    const w = metricWidget('w1', { dataSource: 'stats:by-type', fields: ['count'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(result).toEqual({});
  });

  // ─── stats:trend ──────────────────────────────────────────────

  it('stats:trend + chart widget → dailyStats 映射为 {name:date, value:fields[0]}', async () => {
    mockGetTrendStats.mockResolvedValue({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-02',
      dailyStats: [
        { date: '2026-07-01', newFiles: 3, newStorage: 100, totalFiles: 10, totalStorage: 500 },
        { date: '2026-07-02', newFiles: 5, newStorage: 200, totalFiles: 15, totalStorage: 700 },
      ],
    });
    const w = chartWidget('w1', 'line', { dataSource: 'stats:trend', fields: ['totalStorage'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(mockGetTrendStats).toHaveBeenCalledWith(TENANT_ID, undefined, undefined);
    expect(result.chartData).toEqual([
      { name: '2026-07-01', value: 500 },
      { name: '2026-07-02', value: 700 },
    ]);
  });

  it('stats:trend 透传 dateFrom / dateTo 给 getTrendStats', async () => {
    mockGetTrendStats.mockResolvedValue({ dateFrom: '2026-07-01', dateTo: '2026-07-02', dailyStats: [] });
    const w = chartWidget('w1', 'line', { dataSource: 'stats:trend', fields: ['totalStorage'] });
    await fetchWidgetData(w, TENANT_ID, '2026-07-01', '2026-07-31');
    expect(mockGetTrendStats).toHaveBeenCalledWith(TENANT_ID, '2026-07-01', '2026-07-31');
  });

  // ─── stats:ai ────────────────────────────────────────────────

  it('stats:ai + metric widget → 返回 fields[0] 字段值作为 metricValue', async () => {
    mockGetAiStats.mockResolvedValue({
      totalCalls: 42,
      summaryCalls: 10,
      ocrCalls: 5,
      describeCalls: 3,
      tagCalls: 2,
      qnaCalls: 22,
      quotaUsed: 42,
      quotaTotal: 200,
      quotaPercent: 21,
    });
    const w = metricWidget('w1', { dataSource: 'stats:ai', fields: ['totalCalls'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(mockGetAiStats).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ metricValue: 42 });
  });

  it('stats:ai + chart widget + 多字段 → 聚合为 [{name:中文标签, value:count}] 分布', async () => {
    mockGetAiStats.mockResolvedValue({
      totalCalls: 42,
      summaryCalls: 10,
      ocrCalls: 5,
      describeCalls: 3,
      tagCalls: 2,
      qnaCalls: 22,
      quotaUsed: 42,
      quotaTotal: 200,
      quotaPercent: 21,
    });
    const w = chartWidget('w1', 'pie', {
      dataSource: 'stats:ai',
      fields: ['summaryCalls', 'ocrCalls', 'describeCalls', 'tagCalls', 'qnaCalls'],
    });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(result.chartData).toEqual([
      { name: '摘要', value: 10 },
      { name: 'OCR', value: 5 },
      { name: '描述', value: 3 },
      { name: '标签', value: 2 },
      { name: '问答', value: 22 },
    ]);
  });

  it('stats:ai + chart widget 单字段 → 返回 {}（单字段聚合要求 fields.length > 1）', async () => {
    mockGetAiStats.mockResolvedValue({ summaryCalls: 10 });
    const w = chartWidget('w1', 'pie', { dataSource: 'stats:ai', fields: ['summaryCalls'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(result).toEqual({});
  });

  // ─── stats:activity ──────────────────────────────────────────

  it('stats:activity + chart widget + fields=[userActivity] → 返回 top-N 用户活跃度', async () => {
    mockGetActivityStats.mockResolvedValue({
      dateFrom: '2026-07-13',
      dateTo: '2026-07-20',
      uploadCount: 10,
      deleteCount: 2,
      accessCount: 100,
      userActivity: [
        { userId: 'u1', userName: 'Alice', userEmail: 'a@x.com', accessCount: 30 },
        { userId: 'u2', userName: 'Bob', userEmail: 'b@x.com', accessCount: 20 },
      ],
    });
    const w = chartWidget('w1', 'bar', { dataSource: 'stats:activity', fields: ['userActivity'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(mockGetActivityStats).toHaveBeenCalledWith(TENANT_ID, undefined, undefined);
    expect(result.chartData).toEqual([
      { name: 'Alice', value: 30 },
      { name: 'Bob', value: 20 },
    ]);
  });

  it('stats:activity + chart widget 非 userActivity 字段 → 返回 {}', async () => {
    mockGetActivityStats.mockResolvedValue({ uploadCount: 10, userActivity: [] });
    const w = chartWidget('w1', 'bar', { dataSource: 'stats:activity', fields: ['uploadCount'] });
    const result = await fetchWidgetData(w, TENANT_ID);
    expect(result).toEqual({});
  });
});

describe('fetchReportData', () => {
  it('仅收集声明了 dataConfig 的 widget', async () => {
    mockGetOverviewStats.mockResolvedValue({ totalFiles: 100 });
    mockGetTrendStats.mockResolvedValue({ dateFrom: '2026-07-01', dateTo: '2026-07-02', dailyStats: [] });

    const report: Report = {
      id: 'test-report',
      name: 'Test',
      type: 'data',
      status: 'draft',
      permission: 'private',
      category: 'custom',
      layout: {
        type: 'grid',
        columns: 24,
        gap: 16,
        widgets: [
          // 有 dataConfig → 进入结果
          metricWidget('w1', { dataSource: 'stats:overview', fields: ['totalFiles'] }),
          // 无 dataConfig → 不进入结果
          chartWidget('w2', 'line'),
          // 有 dataConfig → 进入结果
          chartWidget('w3', 'line', { dataSource: 'stats:trend', fields: ['totalStorage'] }),
        ],
      },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'u1',
      updatedBy: 'u1',
      tenantId: TENANT_ID,
    };

    const result = await fetchReportData(report, TENANT_ID);
    expect(Object.keys(result).sort()).toEqual(['w1', 'w3']);
    expect(result.w1).toEqual({ metricValue: 100 });
    expect(result.w3).toEqual({ chartData: [] });
  });

  it('单 widget 抛错被 catch 不污染其他 widget', async () => {
    // w1 抛错；w2 正常返回
    mockGetOverviewStats.mockRejectedValueOnce(new Error('db down'));
    mockGetAiStats.mockResolvedValue({ totalCalls: 5 });

    const report: Report = {
      id: 'test-report',
      name: 'Test',
      type: 'data',
      status: 'draft',
      permission: 'private',
      category: 'custom',
      layout: {
        type: 'grid',
        columns: 24,
        gap: 16,
        widgets: [
          metricWidget('w1', { dataSource: 'stats:overview', fields: ['totalFiles'] }),
          metricWidget('w2', { dataSource: 'stats:ai', fields: ['totalCalls'] }),
        ],
      },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'u1',
      updatedBy: 'u1',
      tenantId: TENANT_ID,
    };

    // 不应抛错
    const result = await fetchReportData(report, TENANT_ID);
    // w1 抛错被吞，不在结果中
    expect(result.w1).toBeUndefined();
    // w2 正常返回
    expect(result.w2).toEqual({ metricValue: 5 });
  });

  it('所有 widget 均无 dataConfig → 返回空对象', async () => {
    const report: Report = {
      id: 'test-report',
      name: 'Test',
      type: 'data',
      status: 'draft',
      permission: 'private',
      category: 'custom',
      layout: {
        type: 'grid',
        columns: 24,
        gap: 16,
        widgets: [metricWidget('w1'), chartWidget('w2', 'line'), tableWidget('w3')],
      },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'u1',
      updatedBy: 'u1',
      tenantId: TENANT_ID,
    };

    const result = await fetchReportData(report, TENANT_ID);
    expect(result).toEqual({});
  });
});
