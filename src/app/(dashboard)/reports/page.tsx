"use client";

/**
 * 报表中心列表页 `/reports`
 *
 * 渲染 BUILTIN_REPORT_TEMPLATES 为卡片网格：
 * - 顶部提供搜索框（按 name / description 过滤）+ 分类下拉（按 category 过滤）
 *   过滤为前端纯过滤，无 API 改动
 * - 每个卡片显示模板 name / description / category / widget count / 推荐徽章
 * - 点击卡片"查看"按钮跳转到 /reports/[id] 详情页（沿用上轮的 ReportRenderer + 24 列栅格）
 *
 * 不负责：
 * - 用户自定义报表的拉取（依赖 /api/reports 路由 + tenantId 上下文，留待后续轮）
 * - 报表创建/订阅管理（留待后续轮）
 * - dataConfig 数据获取（详情页层面处理，下一轮）
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PieChart, Search, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportManager } from "@/lib/reports";
import { REPORT_CATEGORIES, type ReportTemplate } from "@/lib/reports/types";

/** 分类下拉"全部"选项的哨兵值（不会与任何真实 category key 冲突）。 */
const ALL_CATEGORY = "__all__";

/** 把 category key（如 'storage'）映射为中文标签（如 '存储分析'）；未知 category 回退原值。 */
function categoryLabel(category: string): string {
  return REPORT_CATEGORIES[category as keyof typeof REPORT_CATEGORIES] ?? category;
}

/** 模板 widget 数量描述：1 个 → "1 个组件"，N 个 → "N 个组件"。 */
function widgetCountLabel(template: ReportTemplate): string {
  const n = template.layout.widgets.length;
  return `${n} 个组件`;
}

function TemplateCard({ template }: { template: ReportTemplate }) {
  return (
    <Card
      data-testid="report-template-card"
      data-template-id={template.id}
      className="flex flex-col h-full hover:shadow-md transition-shadow"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{template.name}</span>
            </CardTitle>
            {template.description ? (
              <CardDescription className="mt-1 line-clamp-2">
                {template.description}
              </CardDescription>
            ) : null}
          </div>
          {template.isRecommended ? (
            <Badge variant="secondary" className="shrink-0">
              <Star className="h-3 w-3 mr-1" aria-hidden="true" />
              推荐
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{categoryLabel(template.category)}</Badge>
          <span>{widgetCountLabel(template)}</span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/reports/${template.id}`} data-testid="report-view-link">
            查看
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ReportsListPage() {
  const templates = reportManager.getTemplates();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORY);

  // 分类下拉选项：取模板中实际出现的分类（去重 + 保持模板出现顺序），
  // 避免列出 REPORT_CATEGORIES 中无模板的空分类。
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const t of templates) {
      if (!seen.has(t.category)) {
        seen.add(t.category);
        ordered.push(t.category);
      }
    }
    return ordered;
  }, [templates]);

  // 前端纯过滤：关键词按 name / description（大小写/首尾空格无关）+ 分类精确匹配。
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== ALL_CATEGORY && t.category !== category) return false;
      if (!keyword) return true;
      const name = t.name.toLowerCase();
      const desc = (t.description ?? "").toLowerCase();
      return name.includes(keyword) || desc.includes(keyword);
    });
  }, [templates, search, category]);

  const hasFilter = search.trim() !== "" || category !== ALL_CATEGORY;

  return (
    <div className="space-y-6" data-testid="reports-list-page">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            返回
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">报表中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选择一个内置报表模板查看详情 · 真实数据源接入待后续迭代
        </p>
      </div>

      {/* 搜索 + 分类筛选（前端纯过滤，无 API 改动） */}
      <div
        className="flex flex-col sm:flex-row gap-3"
        data-testid="reports-filter-bar"
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            data-testid="reports-search-input"
            type="text"
            placeholder="搜索报表名称或描述"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="搜索报表"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger
            data-testid="reports-category-select"
            className="sm:w-48 w-full"
            aria-label="按分类筛选"
          >
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORY}>全部分类</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center min-h-[40vh] gap-2 text-muted-foreground"
          data-testid="reports-empty"
        >
          <PieChart className="h-12 w-12 opacity-30" aria-hidden="true" />
          <p className="text-sm">{hasFilter ? "未匹配到报表模板" : "暂无报表模板"}</p>
        </div>
      ) : (
        <div
          data-testid="reports-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filtered.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
