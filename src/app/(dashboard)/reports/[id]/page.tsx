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
 * Mock 数据：
 * - 当前轮仅接入页面挂载 + 栅格布局，dataConfig 数据获取留待下一轮。
 * - 内置模板的 chart widget 仅声明 `{ type: 'line' }` 等无 data 配置，ChartWidget 会兜底
 *   "暂无数据"。为让页面有可见图表占位，对 data 缺失/空数组的 chart widget 注入按 type
 *   生成的示例数据（line/bar/area/pie/scatter/radar 各一组），dataConfig 接入后会被真实
 *   数据覆盖。
 *
 * 不负责：
 * - 用户自定义报表的拉取（依赖 /api/reports/[id] 路由 + tenantId 上下文，留待后续轮）
 * - dataConfig.dataSource 数据获取（下一轮）
 * - 响应式断点适配（栅格在小屏会缩窄但不会破坏，由后续轮处理）
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/reports/ReportRenderer";
import { reportManager } from "@/lib/reports";
import type { Report, ReportLayout, ReportWidget } from "@/lib/reports/types";
import type { ChartConfig, ChartType, DataPoint } from "@/lib/visualization/types";

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
 * 已有 data 的 chart（如未来从 API 拉取）保持原样不动。
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

/** 限定 width 到 [1, columns] 区间；缺省/非法值回退到 columns（占满整行）。 */
function clampWidth(width: number | undefined, columns: number): number {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
    return columns;
  }
  return Math.min(Math.max(1, Math.floor(width)), columns);
}

function ReportGrid({ layout }: { layout: ReportLayout }) {
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
        return (
          <div
            key={widget.id}
            data-widget-id={widget.id}
            data-widget-type={widget.type}
            data-widget-span={span}
            style={{ gridColumn: `span ${span}` }}
          >
            <ReportRenderer widget={injectMockData(widget)} />
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

  useEffect(() => {
    if (!id) {
      setReport(null);
      return;
    }
    // 本轮仅接入内置模板；用户自定义报表的拉取（/api/reports/[id]）留待后续轮
    const resolved = templateToReport(id);
    setReport(resolved);
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
        <p className="mt-2 text-xs text-muted-foreground">
          模板内置报表 · 当前为示例数据，真实数据源接入待后续迭代
        </p>
      </div>
      <ReportGrid layout={report.layout} />
    </div>
  );
}
