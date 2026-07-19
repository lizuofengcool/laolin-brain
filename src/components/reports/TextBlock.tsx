"use client";

/**
 * TextBlock —— ReportWidget type='text' 的渲染层。
 *
 * 消费 src/lib/reports/types.ts 的 TextConfig：渲染段落文本，支持字号/对齐/颜色。
 *
 * 渲染策略：
 * - 默认字号 md / 默认对齐 left（与 types.ts 中可选字段语义一致）
 * - color 透传为 inline style（与 MetricCard 一致，避免硬编码到 tailwind 类名）
 * - 不带 Card 包装：文本块应在布局中自然流动，标题/描述由 ReportRenderer 统一处理
 *
 * 不负责：富文本/Markdown 渲染（如需可后续扩展为 sanitize-html 渲染）。
 */
import { cn } from "@/lib/utils";
import type { TextConfig } from "@/lib/reports/types";

export interface TextBlockProps {
  config: TextConfig;
  className?: string;
}

const FONT_SIZE_CLASS: Record<NonNullable<TextConfig["fontSize"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
};

const ALIGN_CLASS: Record<NonNullable<TextConfig["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function TextBlock({ config, className }: TextBlockProps) {
  const { content, fontSize = "md", align = "left", color } = config;

  return (
    <p
      className={cn(
        FONT_SIZE_CLASS[fontSize],
        ALIGN_CLASS[align],
        // leading-relaxed 放在字号类之后：Tailwind v4 的 text-* 同时设置 font-size 与
        // line-height，tailwind-merge 会将后置的 line-height 类视为冲突覆盖前置，从而
        // 让 leading-relaxed 真正生效（参考 tailwind-merge 文档 last-wins 规则）。
        "leading-relaxed",
        className,
      )}
      style={color ? { color } : undefined}
    >
      {content}
    </p>
  );
}
