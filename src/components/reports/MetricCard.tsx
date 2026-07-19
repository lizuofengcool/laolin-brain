"use client";

/**
 * MetricCard —— ReportWidget type='metric' 的渲染层。
 *
 * 消费 src/lib/reports/types.ts 的 MetricConfig：将 value/label/prefix/suffix/trend
 * 组合为单个指标卡片，常用于报表头部 KPI 行（参考 BUILTIN_REPORT_TEMPLATES 中
 * storage-overview 的 4 个 metric widget）。
 *
 * 渲染策略：
 * - value 数值走 toLocaleString（千分位），字符串原样输出
 * - trendDirection 优先；缺失时从 trend 符号推断（>0 → up, <0 → down, =0 → none）
 * - trend 为 undefined 时不渲染趋势行（避免空趋势行噪声）
 * - color 透传到 value 行 inline style（不影响 label / trend 颜色）
 *
 * 不负责：数据获取（value 由调用方传入）、与图表联动。
 */
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MetricConfig } from "@/lib/reports/types";

export interface MetricCardProps {
  config: MetricConfig;
  /** 顶层标题（通常来自 ReportWidget.title，与 config.label 可能重复） */
  title?: string;
  description?: string;
  className?: string;
}

type TrendDirection = "up" | "down" | "none";

function resolveTrendDirection(config: MetricConfig): TrendDirection {
  if (config.trendDirection) return config.trendDirection;
  if (typeof config.trend === "number") {
    if (config.trend > 0) return "up";
    if (config.trend < 0) return "down";
    return "none";
  }
  return "none";
}

const TREND_COLOR_CLASS: Record<TrendDirection, string> = {
  up: "text-green-600",
  down: "text-red-600",
  none: "text-muted-foreground",
};

function formatValue(value: number | string): string {
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return String(value);
}

export function MetricCard({
  config,
  title,
  description,
  className,
}: MetricCardProps) {
  const { value, label, prefix, suffix, trend, color } = config;
  const direction = resolveTrendDirection(config);
  const TrendIcon =
    direction === "up" ? ArrowUpIcon : direction === "down" ? ArrowDownIcon : MinusIcon;
  const displayValue = formatValue(value);

  return (
    <Card className={cn("h-full", className)}>
      {(title || description) ? (
        <CardHeader>
          {title ? <CardTitle className="text-sm">{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-1.5">
        <div
          className="flex items-baseline gap-1"
          style={color ? { color } : undefined}
        >
          {prefix ? (
            <span className="text-sm font-medium">{prefix}</span>
          ) : null}
          <span className="text-2xl font-semibold tabular-nums leading-none">
            {displayValue}
          </span>
          {suffix ? (
            <span className="text-sm font-medium">{suffix}</span>
          ) : null}
        </div>
        {label ? (
          <div className="text-xs text-muted-foreground">{label}</div>
        ) : null}
        {typeof trend === "number" ? (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              TREND_COLOR_CLASS[direction],
            )}
            aria-label={`趋势 ${direction} ${Math.abs(trend)}%`}
          >
            <TrendIcon className="h-3 w-3" aria-hidden="true" />
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
