/**
 * 报表数据 fetcher
 *
 * 根据 ReportWidget.dataConfig.dataSource 拉取真实业务数据，转换为 ChartConfig.data
 * 所需的 DataPoint[]（chart widget）/ 单值（metric widget）/ 行数据（table widget）。
 *
 * 数据源命名空间（与 BUILTIN_REPORT_TEMPLATES 中声明对齐）：
 *   - 'stats:overview' → getOverviewStats 返回的单对象，metric 取 fields[0]
 *   - 'stats:by-type'  → getStatsByType.types 数组，pie/bar 按 fields[0] 取维度
 *   - 'stats:trend'    → getTrendStats.dailyStats 数组，按 fields[0] 取时间序列
 *   - 'stats:ai'       → getAiStats 单对象；metric 取 fields[0]，pie 多字段聚合为分布
 *   - 'stats:activity' → getActivityStats；fields=['userActivity'] 时返回 top-N 用户活跃度
 *
 * 设计原则：
 *   - fetcher 是纯数据搬运：不构造 NextResponse、不鉴权（由调用方 /api/reports/[id]/data 路由负责）
 *   - 未声明 dataConfig 的 widget 返回空对象（{}），调用方按需回退到 mock 数据
 *   - 未知 dataSource 返回空对象而非抛错，避免单个 widget 数据源配置错误导致整张报表 500
 */
import type { ReportWidget, Report } from './types';
import type { DataPoint } from '../visualization/types';
import {
  getOverviewStats,
  getStatsByType,
  getTrendStats,
  getActivityStats,
  getAiStats,
} from '../stats/stats-service';

/** 单个 widget 拉取结果。三种形态互斥：chart 用 chartData、metric 用 metricValue、table 用 tableRows。 */
export interface FetchedWidgetData {
  /** chart widget 的 DataPoint[]，会替换 ChartConfig.data */
  chartData?: DataPoint[];
  /** metric widget 的值，会替换 MetricConfig.value */
  metricValue?: number | string;
  /** table widget 的行数据，会替换 TableConfig.rows */
  tableRows?: Record<string, unknown>[];
}

/** AI 调用类型 → 中文标签映射，用于 pie 图展示「功能使用分布」。 */
const AI_CALL_LABELS: Record<string, string> = {
  summaryCalls: '摘要',
  ocrCalls: 'OCR',
  describeCalls: '描述',
  tagCalls: '标签',
  qnaCalls: '问答',
};

/**
 * 拉取单个 widget 的真实数据。
 *
 * 实现说明：
 * - metric + stats:overview / stats:ai：从单对象中取 fields[0] 字段值作为 metricValue
 * - chart + stats:trend：dailyStats 映射为 {name: date, value: <field>} 时间序列
 * - chart + stats:by-type：types 映射为 {name: type, value: <field>} 分布数据
 * - chart + stats:ai + 多 fields：聚合为 [{name: 摘要/OCR/..., value: count}, ...] 分布
 * - chart + stats:activity + fields=['userActivity']：返回 top-N 用户活跃度分布
 * - table：暂未实现（BUILTIN_REPORT_TEMPLATES 中 table widget 未声明 dataConfig），返回 {}
 *
 * 任意未识别组合返回 {}，由调用方决定回退策略。
 */
export async function fetchWidgetData(
  widget: ReportWidget,
  tenantId: string,
  dateFrom?: string | null,
  dateTo?: string | null,
): Promise<FetchedWidgetData> {
  if (!widget.dataConfig) return {};
  const { dataSource, fields } = widget.dataConfig;
  const field = fields[0];

  switch (dataSource) {
    case 'stats:overview': {
      const data = await getOverviewStats(tenantId);
      if (widget.type === 'metric' && field) {
        const value = (data as Record<string, unknown>)[field];
        if (typeof value === 'number' || typeof value === 'string') {
          return { metricValue: value };
        }
      }
      return {};
    }

    case 'stats:by-type': {
      const data = await getStatsByType(tenantId);
      const metricField = field || 'count';
      if (widget.type === 'chart') {
        return {
          chartData: data.types.map((t) => ({
            name: t.type,
            value: typeof (t as Record<string, unknown>)[metricField] === 'number'
              ? (t as Record<string, unknown>)[metricField] as number
              : 0,
          })),
        };
      }
      return {};
    }

    case 'stats:trend': {
      const data = await getTrendStats(tenantId, dateFrom, dateTo);
      const metricField = field || 'totalStorage';
      if (widget.type === 'chart') {
        return {
          chartData: data.dailyStats.map((d) => ({
            name: d.date,
            value: typeof (d as Record<string, unknown>)[metricField] === 'number'
              ? (d as Record<string, unknown>)[metricField] as number
              : 0,
          })),
        };
      }
      return {};
    }

    case 'stats:ai': {
      const data = await getAiStats(tenantId);
      if (widget.type === 'metric' && field) {
        const value = (data as Record<string, unknown>)[field];
        if (typeof value === 'number' || typeof value === 'string') {
          return { metricValue: value };
        }
      }
      // 多字段 pie：聚合为功能使用分布
      if (widget.type === 'chart' && fields.length > 1) {
        return {
          chartData: fields.map((f) => ({
            name: AI_CALL_LABELS[f] ?? f,
            value: typeof (data as Record<string, unknown>)[f] === 'number'
              ? (data as Record<string, unknown>)[f] as number
              : 0,
          })),
        };
      }
      return {};
    }

    case 'stats:activity': {
      const data = await getActivityStats(tenantId, dateFrom, dateTo);
      if (widget.type === 'chart' && field === 'userActivity') {
        return {
          chartData: data.userActivity.map((u) => ({
            name: u.userName,
            value: u.accessCount,
          })),
        };
      }
      return {};
    }

    default:
      return {};
  }
}

/**
 * 拉取整张报表所有 widget 的数据。
 *
 * 顺序遍历 layout.widgets，对声明了 dataConfig 的 widget 调用 fetchWidgetData。
 * 未声明 dataConfig 的 widget 不出现在返回 Map 中（调用方按需回退到 mock）。
 *
 * 任意 widget 抛错时被 catch 并跳过（不污染其他 widget 的结果），日志输出 widgetId
 * 与错误信息便于排查。返回 Map 的 key 为 widget.id。
 */
export async function fetchReportData(
  report: Report,
  tenantId: string,
  dateFrom?: string | null,
  dateTo?: string | null,
): Promise<Record<string, FetchedWidgetData>> {
  const result: Record<string, FetchedWidgetData> = {};
  for (const widget of report.layout.widgets) {
    if (!widget.dataConfig) continue;
    try {
      result[widget.id] = await fetchWidgetData(widget, tenantId, dateFrom, dateTo);
    } catch (error) {
      console.error(
        `[reports/data-fetcher] 拉取 widget 数据失败 reportId=${report.id} widgetId=${widget.id}:`,
        error,
      );
    }
  }
  return result;
}
