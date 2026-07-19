"use client";

/**
 * ReportRenderer —— ReportWidget 渲染分发器。
 *
 * 按 `ReportWidget.type` 分发到具体渲染组件：
 * - metric → MetricCard（自带 Card 包装）
 * - table  → TableWidget（自带 title/description 渲染）
 * - text   → TextBlock（无 Card 包装，自然流动）
 * - divider → Separator（可选 title 作为分隔标签）
 * - chart  → 占位卡片（recharts 接入在下一阶段，worklog 已规划拆轮）
 *
 * 兜底：
 * - metric/table 缺 config → 渲染"组件缺少配置"卡片，避免运行时崩溃
 * - 未知 type → 同上兜底卡片
 *
 * 不负责：
 * - 数据获取（config 由调用方传入，dataConfig 不在此处执行）
 * - 栅格布局（width/height 由外层 grid 容器决定）
 * - chart 实际渲染（待下一轮接入 recharts）
 */
import type {
  ReportWidget,
  MetricConfig,
  TextConfig,
  TableConfig,
} from "@/lib/reports/types";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TableWidget } from "./TableWidget";
import { MetricCard } from "./MetricCard";
import { TextBlock } from "./TextBlock";

export interface ReportRendererProps {
  widget: ReportWidget;
  className?: string;
}

export function ReportRenderer({ widget, className }: ReportRendererProps) {
  const { type, title, description, config } = widget;

  if (type === "divider") {
    return (
      <div className={cn("py-2", className)} role="separator" aria-orientation="horizontal">
        {title ? (
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
            <Separator className="flex-1" />
          </div>
        ) : (
          <Separator />
        )}
      </div>
    );
  }

  if (type === "text") {
    if (!config) {
      return <MissingConfig widget={widget} className={className} />;
    }
    return <TextBlock config={config as TextConfig} className={className} />;
  }

  if (type === "table") {
    if (!config) {
      return <MissingConfig widget={widget} className={className} />;
    }
    return (
      <TableWidget
        config={config as TableConfig}
        title={title}
        description={description}
        className={className}
      />
    );
  }

  if (type === "metric") {
    if (!config) {
      return <MissingConfig widget={widget} className={className} />;
    }
    return (
      <MetricCard
        config={config as MetricConfig}
        title={title}
        description={description}
        className={className}
      />
    );
  }

  if (type === "chart") {
    return <ChartPlaceholder widget={widget} className={className} />;
  }

  return <MissingConfig widget={widget} className={className} />;
}

function MissingConfig({
  widget,
  className,
}: {
  widget: ReportWidget;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        {widget.title ? (
          <CardTitle className="text-sm">{widget.title}</CardTitle>
        ) : null}
        <CardDescription>组件缺少配置</CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        widget.type = {widget.type}
      </CardContent>
    </Card>
  );
}

function ChartPlaceholder({
  widget,
  className,
}: {
  widget: ReportWidget;
  className?: string;
}) {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        {widget.title ? (
          <CardTitle className="text-sm">{widget.title}</CardTitle>
        ) : null}
        {widget.description ? (
          <CardDescription>{widget.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          图表渲染待接入（recharts）
        </div>
      </CardContent>
    </Card>
  );
}
