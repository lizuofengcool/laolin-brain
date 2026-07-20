"use client";

/**
 * 报表详情页 `/reports/[id]`
 *
 * 按 URL 中的 [id] 解析报表，渲染其 ReportLayout.widgets：
 * - 优先匹配 BUILTIN_REPORT_TEMPLATES（内置模板，不需要租户上下文，刷新后仍可用）
 * - 模板未命中时显示"报表不存在"占位
 *
 * 栅格布局：
 * - layout.columns（默认 24）→ CSS `grid-template-columns: repeat(N, minmax(0, 1fr))`
 * - widget.width 1-N → `grid-column: span N`（缺省或越界回退到 N，与"占满整行"语义一致）
 * - layout.gap（默认 16）→ `gap: ${gap}px`
 *
 * 数据加载（本轮接入）：
 * - 模板解析后异步 fetch `/api/reports/[id]/data`，按 widget.id 取回 chartData /
 *   metricValue / tableRows 覆盖 widget.config 的初始值。
 * - 未声明 dataConfig 的 widget 不在响应 data 中 → 继续走 mock 注入（向后兼容）。
 * - 声明 dataConfig 但响应返回空（如统计服务无数据）→ 同样回退 mock 注入，避免空白卡片。
 * - fetch 失败（401/500/网络异常）→ 页面顶部展示错误提示，但保留 mock 数据可见，不阻塞渲染。
 * - 加载中：页面立即以 mock 数据呈现，header 显示"正在拉取真实数据…"，加载完成后替换。
 *
 * 不负责：
 * - 用户自定义报表的拉取（依赖 /api/reports/[id] 路由 + tenantId 上下文，留待后续轮）
 * - 日期范围筛选 UI（API 已支持 dateFrom/dateTo query，但本轮不接入筛选器）
 * - 响应式断点适配（栅格在小屏会缩窄但不会破坏，由后续轮处理）
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/reports/ReportRenderer";
import { reportManager } from "@/lib/reports";
import type { Report, ReportLayout, ReportWidget } from "@/lib/reports/types";
import type {
  ChartConfig,
  ChartType,
  DataPoint,
} from "@/lib/visualization/types";
import type {
  MetricConfig,
  TableConfig,
} from "@/lib/reports/types";

/** 模板内置 chart widget 的 mock 数据条数（覆盖典型趋势/分布图） */
const MOCK_TREND: DataPoint[] = [
  { name: "1月", value: 100 },
  { name: "2月", value: 200 },
  { name: "3月", value: 150 },
  { name: "4月", value: 280 },
  { name: "5月", value: 230 },
  { name: "6月", value: 320 },
  { name: "7月", value: 280 },
];

const MOCK_PIE: DataPoint[] = [
  { name: "文档", value: 1048 },
  { name: "图片", value: 735 },
  { name: "视频", value: 580 },
  { name: "其他", value: 484 },
];

const MOCK_RADAR: DataPoint[] = [
  { name: "销售", value: 120 },
  { name: "管理", value: 80 },
  { name: "技术", value: 100 },
  { name: "客服", value: 90 },
  { name: "研发", value: 110 },
];

const MOCK_SCATTER: DataPoint[] = [
  { x: 10, y: 30 },
  { x: 20, y: 50 },
  { x: 30, y: 80 },
  { x: 40, y: 40 },
  { x: 50, y: 100 },
  { x: 60, y: 70 },
] as unknown as DataPoint[];

function generateMockChartData(type: ChartType): DataPoint[] {
  switch (type) {
    case "pie":
      return MOCK_PIE;
    case "radar":
      return MOCK_RADAR;
    case "scatter":
      return MOCK_SCATTER;
    case "line":
    case "bar":
    case "area":
    case "heatmap":
    case "treemap":
    case "sankey":
    case "funnel":
    case "composed":
    default:
      return MOCK_TREND;
  }
}

/**
 * 对 chart widget 注入示例数据。
 *
 * BUILTIN_REPORT_TEMPLATES 中的 chart widget 仅声明 `{ type: 'line' } as ChartConfig`，
 * 缺 `data` 字段。ChartWidget 已对此兜底"暂无数据"卡片，但页面挂载阶段希望让
 * 用户看到实际图表占位以验证栅格布局与类型分发，故对缺 data 的 chart 注入示例数据。
 *
 * 已有 data 的 chart（如从 API 拉取的真实数据）保持原样不动。
 */
function injectMockData(widget: ReportWidget): ReportWidget {
  if (widget.type !== "chart" || !widget.config) return widget;
  const config = widget.config as ChartConfig;
  if (Array.isArray(config.data) && config.data.length > 0) return widget;
  return {
    ...widget,
    config: {
      ...config,
      data: generateMockChartData(config.type),
    } as ChartConfig,
  };
}

/** 单个 widget 拉取结果（与 /api/reports/[id]/data 响应 data[id] 形态对齐）。 */
interface FetchedWidgetData {
  chartData?: DataPoint[];
  metricValue?: number | string;
  tableRows?: Record<string, unknown>[];
}

/**
 * 把 fetch 返回的真实数据合并进 widget.config，未覆盖字段保留 mock 注入结果。
 *
 * 优先级（高 → 低）：
 *   1. 真实数据（fetched 非空）：chartData / metricValue / tableRows 覆盖对应字段
 *   2. mock 注入（chart 缺 data 时填充示例数据）
 *   3. 模板原始 config（metric 的 value=0 等）
 *
 * 真实数据为空数组/undefined 时不覆盖，避免用空数据替换 mock 后渲染"暂无数据"卡片。
 */
function mergeWidgetData(
  widget: ReportWidget,
  fetched?: FetchedWidgetData,
): ReportWidget {
  const merged = injectMockData(widget);
  if (!fetched || !merged.config) return merged;

  if (
    widget.type === "chart" &&
    Array.isArray(fetched.chartData) &&
    fetched.chartData.length > 0
  ) {
    const config = merged.config as ChartConfig;
    return { ...merged, config: { ...config, data: fetched.chartData } };
  }

  if (
    widget.type === "metric" &&
    fetched.metricValue !== undefined &&
    fetched.metricValue !== null
  ) {
    const config = merged.config as MetricConfig;
    return {
      ...merged,
      config: { ...config, value: fetched.metricValue },
    };
  }

  if (
    widget.type === "table" &&
    Array.isArray(fetched.tableRows) &&
    fetched.tableRows.length > 0
  ) {
    const config = merged.config as TableConfig;
    return { ...merged, config: { ...config, rows: fetched.tableRows } };
  }

  return merged;
}

/** 限定 width 到 [1, columns] 区间；缺省/非法值回退到 columns（占满整行）。 */
function clampWidth(width: number | undefined, columns: number): number {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
    return columns;
  }
  return Math.min(Math.max(1, Math.floor(width)), columns);
}

function ReportGrid({
  layout,
  widgetData,
}: {
  layout: ReportLayout;
  widgetData: Record<string, FetchedWidgetData>;
}) {
  const columns = layout.columns ?? 24;
  const gap = layout.gap ?? 16;
  return (
    <div
      data-testid="report-grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${gap}px`,
      }}
    >
      {layout.widgets.map((widget) => {
        const span = clampWidth(widget.width, columns);
        const fetched = widgetData[widget.id];
        return (
          <div
            key={widget.id}
            data-widget-id={widget.id}
            data-widget-type={widget.type}
            data-widget-span={span}
            data-widget-has-real-data={fetched ? "true" : "false"}
            style={{ gridColumn: `span ${span}` }}
          >
            <ReportRenderer widget={mergeWidgetData(widget, fetched)} />
          </div>
        );
      })}
    </div>
  );
}

/** 把内置模板适配为 Report 形态以供页面渲染（模板本身没有 tenant/ createdBy 等字段）。 */
function templateToReport(templateId: string): Report | null {
  const template = reportManager.getTemplate(templateId);
  if (!template) return null;
  const now = new Date();
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    type: template.type,
    status: "published",
    permission: "public",
    category: template.category,
    layout: template.layout,
    parameters: template.parameters,
    dataConfig: undefined,
    coverImage: undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: "system",
    updatedBy: "system",
    tenantId: "builtin",
    isFavorite: false,
    viewCount: 0,
    lastViewedAt: undefined,
  };
}

export default function ReportDetailPage() {
  const params = useParams();
  const rawId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
  // 路径片段已由 Next.js URL-decode；额外 trim 防止手工输入带空格的 id 误命中失败分支
  const id = rawId?.trim() ?? "";

  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [widgetData, setWidgetData] = useState<
    Record<string, FetchedWidgetData>
  >({});
  const [dataState, setDataState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setReport(null);
      setWidgetData({});
      setDataState("idle");
      setDataError(null);
      return;
    }
    // 本轮仅接入内置模板；用户自定义报表的拉取（/api/reports/[id]）留待后续轮
    const resolved = templateToReport(id);
    setReport(resolved);
    // 重置数据状态：切换报表时避免上一张的数据泄漏到下一张
    setWidgetData({});
    setDataError(null);

    if (!resolved) {
      setDataState("idle");
      return;
    }

    // 模板命中后异步拉取真实数据，不阻塞首屏（先以 mock 数据呈现）
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let cancelled = false;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("kb_token") : null;
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    setDataState("loading");

    const runFetch = async () => {
      try {
        const res = await fetch(
          `/api/reports/${encodeURIComponent(id)}/data`,
          { headers, signal: controller.signal },
        );
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body && typeof body === "object" && "error" in body
              ? String((body as { error?: unknown }).error)
              : "") || `HTTP ${res.status}`,
          );
        }
        const json = (await res.json()) as {
          success?: boolean;
          data?: Record<string, FetchedWidgetData>;
          error?: string;
        };
        if (cancelled) return;
        if (!json.success) {
          throw new Error(json.error || "拉取报表数据失败");
        }
        setWidgetData(json.data ?? {});
        setDataState("success");
      } catch (err: unknown) {
        if (cancelled) return;
        // AbortController 触发的 abort 不当作错误展示（组件已卸载或 id 已切换）
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[reports/detail] 拉取数据失败:", err);
        setDataError(
          err instanceof Error ? err.message : "拉取报表数据失败",
        );
        setDataState("error");
      } finally {
        if (!cancelled) clearTimeout(timer);
      }
    };

    runFetch();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);

  if (report === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">加载报表中…</span>
      </div>
    );
  }

  if (report === null) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[40vh] gap-4"
        data-testid="report-not-found"
      >
        <p className="text-muted-foreground">报表不存在或已被删除</p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            返回首页
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="report-detail">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            返回
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{report.name}</h1>
        {report.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
        ) : null}
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="report-data-status"
          data-data-state={dataState}
        >
          {dataState === "loading" && "模板内置报表 · 正在拉取真实数据…"}
          {dataState === "success" && "模板内置报表 · 数据来自统计服务"}
          {dataState === "error" && "模板内置报表 · 数据拉取失败，当前为示例数据"}
          {dataState === "idle" && "模板内置报表 · 当前为示例数据"}
        </p>
        {dataState === "error" && dataError ? (
          <p
            className="mt-2 flex items-center gap-1.5 text-xs text-destructive"
            data-testid="report-data-error"
            role="alert"
          >
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{dataError}</span>
          </p>
        ) : null}
      </div>
      <ReportGrid layout={report.layout} widgetData={widgetData} />
    </div>
  );
}
