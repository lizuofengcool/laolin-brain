"use client";

/**
 * ChartWidget —— ReportWidget type='chart' 的渲染层。
 *
 * 消费 src/lib/visualization/types.ts 的 ChartConfig：把 `type` 映射到 recharts
 * 的具体图表组件，并消费 `data` + `series` 渲染单/多系列。
 *
 * 支持的图表类型：
 * - line   → LineChart + Line（每 series 一条折线）
 * - bar    → BarChart + Bar（mode='stacked' 时 stackId='a'；mode='horizontal' 时 layout 翻转）
 * - area   → AreaChart + Area（与 line 同结构，多 fillOpacity）
 * - pie    → PieChart + Pie + Cell（按 colors 数组循环上色）
 * - scatter→ ScatterChart + Scatter（每 series 一个 Scatter，data 按 {x,y} 解析）
 * - radar  → RadarChart + Radar + PolarGrid/AngleAxis/RadiusAxis
 *
 * 不支持的类型（heatmap / treemap / sankey / funnel / composed）→ 渲染
 * "暂不支持 ${type} 图表类型" 兜底卡片，避免运行时崩溃。
 *
 * 渲染策略：
 * - series 缺失时默认 `[{ key: 'value', name: 'value', dataKey: 'value' }]`，
 *   与 BUILTIN_REPORT_TEMPLATES 中单系列 chart（如 `{ type: 'line' }`）兼容。
 * - data 缺失或空数组 → 渲染"暂无数据"兜底卡片。
 * - grid/legend/tooltip 默认 visible，可通过 `config.grid.visible=false` 等显式关闭。
 * - 主题色：`theme.colors` 优先，否则用 `CHART_COLORS.default`；series.color 优先于主题色。
 * - 高度：`config.height` 优先（>0），否则默认 240px。
 *
 * 不负责：
 * - 数据获取（data 由调用方传入，dataConfig 不在此处执行）
 * - 栅格布局（width 由外层 grid 容器决定）
 */
import type { ReactNode, ReactElement, ComponentType } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CHART_COLORS,
  type ChartConfig,
  type ChartSeries,
  type DataPoint,
} from "@/lib/visualization/types";

export interface ChartWidgetProps {
  config: ChartConfig;
  /** 顶层标题（通常来自 ReportWidget.title，与 config.title 可能重复） */
  title?: string;
  description?: string;
  className?: string;
}

const DEFAULT_HEIGHT = 240;
const SUPPORTED_TYPES = new Set([
  "line",
  "bar",
  "area",
  "pie",
  "scatter",
  "radar",
]);

/**
 * 默认单系列：兼容 BUILTIN_REPORT_TEMPLATES 中只声明 `{ type: 'line' }` 而无 series
 * 的 chart widget，按 DataPoint.value 作为唯一数据通道。
 */
const DEFAULT_SERIES: ChartSeries[] = [
  { key: "value", name: "value", dataKey: "value" },
];

function resolveSeries(series?: ChartSeries[]): ChartSeries[] {
  if (series && series.length > 0) return series;
  return DEFAULT_SERIES;
}

function resolveColors(theme?: ChartConfig["theme"]): string[] {
  if (theme?.colors && theme.colors.length > 0) return theme.colors;
  return CHART_COLORS.default;
}

/**
 * 渲染 Card 包装 + 标题/描述 + 图表内容。
 * 标题/描述都缺失时不渲染 CardHeader，避免空白头部噪声。
 */
function wrapInCard(
  title: string | undefined,
  description: string | undefined,
  className: string | undefined,
  chartHeight: number,
  children: ReactElement,
) {
  return (
    <Card className={cn("h-full", className)}>
      {title || description ? (
        <CardHeader>
          {title ? <CardTitle className="text-sm">{title}</CardTitle> : null}
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent>
        <div style={{ width: "100%", height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 渲染兜底占位卡片（不支持类型 / 空数据）。结构与正常图表一致，仅内容替换为提示文案。
 */
function renderFallback(
  title: string | undefined,
  description: string | undefined,
  className: string | undefined,
  chartHeight: number,
  message: string,
) {
  return (
    <Card className={cn("h-full", className)}>
      {title || description ? (
        <CardHeader>
          {title ? <CardTitle className="text-sm">{title}</CardTitle> : null}
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent>
        <div
          className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
          style={{ height: chartHeight }}
        >
          {message}
        </div>
      </CardContent>
    </Card>
  );
}

interface CartesianChartProps {
  data: DataPoint[];
  layout?: "horizontal" | "vertical";
  children?: ReactNode;
}

/**
 * 渲染 line/area/bar 共享的 Cartesian 框架：CartesianGrid + XAxis + YAxis + Tooltip + Legend。
 * mode='horizontal' 时 XAxis/YAxis 类型翻转（类别走 Y 轴），与 recharts 的 layout="vertical"
 * 语义对齐（参考 src/components/dashboard/StorageCharts.tsx 的横向 BarChart 用法）。
 */
function renderCartesianFrame({
  ChartKind,
  data,
  xKey,
  isHorizontal,
  showGrid,
  showTooltip,
  showLegend,
  gridColor,
  textColor,
  children,
}: {
  ChartKind: ComponentType<CartesianChartProps>;
  data: DataPoint[];
  xKey: string;
  isHorizontal: boolean;
  showGrid: boolean;
  showTooltip: boolean;
  showLegend: boolean;
  gridColor?: string;
  textColor?: string;
  children: ReactNode;
}) {
  const commonAxisProps = { tick: { fontSize: 12 }, stroke: textColor };
  return (
    <ChartKind data={data} layout={isHorizontal ? "vertical" : "horizontal"}>
      {showGrid ? <CartesianGrid strokeDasharray="3 3" stroke={gridColor} /> : null}
      {isHorizontal ? (
        <>
          <XAxis type="number" {...commonAxisProps} />
          <YAxis
            type="category"
            dataKey={xKey}
            width={80}
            {...commonAxisProps}
          />
        </>
      ) : (
        <>
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} />
        </>
      )}
      {showTooltip ? <Tooltip /> : null}
      {showLegend ? <Legend /> : null}
      {children}
    </ChartKind>
  );
}

export function ChartWidget({
  config,
  title,
  description,
  className,
}: ChartWidgetProps) {
  const {
    type,
    data = [],
    series,
    xAxis,
    legend,
    tooltip,
    grid,
    height,
    mode,
    theme,
    animation = true,
  } = config;

  const chartHeight =
    typeof height === "number" && height > 0 ? height : DEFAULT_HEIGHT;
  const showGrid = grid?.visible !== false;
  const showLegend = legend?.visible !== false;
  const showTooltip = tooltip?.visible !== false;
  const isStacked = mode === "stacked";
  const isHorizontal = mode === "horizontal";
  const xKey = xAxis?.key ?? "name";
  const gridColor = theme?.gridColor;
  const textColor = theme?.textColor;

  // 不支持的类型 → 兜底
  if (!SUPPORTED_TYPES.has(type)) {
    return renderFallback(
      title,
      description,
      className,
      chartHeight,
      `暂不支持 ${type} 图表类型`,
    );
  }

  // 数据缺失 → 兜底
  if (!data || data.length === 0) {
    return renderFallback(
      title,
      description,
      className,
      chartHeight,
      "暂无数据",
    );
  }

  const seriesList = resolveSeries(series);
  const colors = resolveColors(theme);

  if (type === "line") {
    return wrapInCard(title, description, className, chartHeight,
      renderCartesianFrame({
        ChartKind: LineChart,
        data,
        xKey,
        isHorizontal,
        showGrid,
        showTooltip,
        showLegend,
        gridColor,
        textColor,
        children: seriesList.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.dataKey ?? s.key}
            name={s.name}
            stroke={s.color ?? colors[i % colors.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={animation}
          />
        )),
      }),
    );
  }

  if (type === "area") {
    return wrapInCard(title, description, className, chartHeight,
      renderCartesianFrame({
        ChartKind: AreaChart,
        data,
        xKey,
        isHorizontal,
        showGrid,
        showTooltip,
        showLegend,
        gridColor,
        textColor,
        children: seriesList.map((s, i) => {
          const color = s.color ?? colors[i % colors.length];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.dataKey ?? s.key}
              name={s.name}
              stroke={color}
              fill={color}
              fillOpacity={0.3}
              stackId={isStacked ? "a" : undefined}
              isAnimationActive={animation}
            />
          );
        }),
      }),
    );
  }

  if (type === "bar") {
    return wrapInCard(title, description, className, chartHeight,
      renderCartesianFrame({
        ChartKind: BarChart,
        data,
        xKey,
        isHorizontal,
        showGrid,
        showTooltip,
        showLegend,
        gridColor,
        textColor,
        children: seriesList.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.dataKey ?? s.key}
            name={s.name}
            fill={s.color ?? colors[i % colors.length]}
            stackId={isStacked ? "a" : undefined}
            radius={[4, 4, 0, 0]}
            isAnimationActive={animation}
          />
        )),
      }),
    );
  }

  if (type === "scatter") {
    return wrapInCard(title, description, className, chartHeight,
      <ScatterChart>
        {showGrid ? (
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        ) : null}
        <XAxis
          type="number"
          dataKey="x"
          name="x"
          tick={{ fontSize: 12 }}
          stroke={textColor}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="y"
          tick={{ fontSize: 12 }}
          stroke={textColor}
        />
        {showTooltip ? <Tooltip cursor={{ strokeDasharray: "3 3" }} /> : null}
        {showLegend ? <Legend /> : null}
        {seriesList.map((s, i) => (
          <Scatter
            key={s.key}
            name={s.name}
            data={data}
            fill={s.color ?? colors[i % colors.length]}
            isAnimationActive={animation}
          />
        ))}
      </ScatterChart>,
    );
  }

  if (type === "radar") {
    return wrapInCard(title, description, className, chartHeight,
      <RadarChart data={data}>
        {showGrid ? <PolarGrid stroke={gridColor} /> : null}
        <PolarAngleAxis
          dataKey={xKey}
          tick={{ fontSize: 12 }}
          stroke={textColor}
        />
        <PolarRadiusAxis tick={{ fontSize: 12 }} stroke={textColor} />
        {showTooltip ? <Tooltip /> : null}
        {showLegend ? <Legend /> : null}
        {seriesList.map((s, i) => {
          const color = s.color ?? colors[i % colors.length];
          return (
            <Radar
              key={s.key}
              name={s.name}
              dataKey={s.dataKey ?? s.key}
              stroke={color}
              fill={color}
              fillOpacity={0.3}
              isAnimationActive={animation}
            />
          );
        })}
      </RadarChart>,
    );
  }

  // pie：按 DataPoint.{name, value} 渲染，Cell 按 colors 循环上色
  const pieData = data.map((d) => ({
    name: d.name,
    value: Number(d.value ?? 0),
  }));
  return wrapInCard(title, description, className, chartHeight,
    <PieChart>
      {showTooltip ? <Tooltip /> : null}
      {showLegend ? <Legend /> : null}
      <Pie
        data={pieData}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius="80%"
        isAnimationActive={animation}
      >
        {pieData.map((entry, i) => (
          <Cell key={entry.name} fill={colors[i % colors.length]} />
        ))}
      </Pie>
    </PieChart>,
  );
}
