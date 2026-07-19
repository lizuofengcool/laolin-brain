/**
 * 报表列表页 `/reports` 单测
 *
 * 锁定列表页挂载轮的关键行为：
 * - 渲染页面标题"报表中心" + 说明
 * - 渲染所有 BUILTIN_REPORT_TEMPLATES 为卡片（数量一致）
 * - 每个卡片有指向 /reports/[id] 的"查看"链接
 * - 显示模板名称 / 描述 / 分类徽章（中文）/ 组件数量
 * - 推荐模板（isRecommended=true）显示"推荐"徽章；非推荐模板不显示
 * - 返回按钮链接到首页 /
 * - grid 容器使用响应式断点（grid-cols-1 / md:grid-cols-2 / lg:grid-cols-3）
 *
 * 桩化 lucide-react 图标，避免真实 SVG 渲染
 * 桩化 next/navigation Link：渲染为带 data-href 的 <a> 以便断言目标路径
 * 不桩化 reportManager：BUILTIN_REPORT_TEMPLATES 是纯内存常量，单测直接消费真实数据
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  Link: (props: { href: string; children: React.ReactNode }) => (
    <a href={props.href} data-testid="nav-link" data-href={props.href}>
      {props.children}
    </a>
  ),
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  PieChart: () => <span data-testid="icon-pie-chart" />,
  Star: () => <span data-testid="icon-star" />,
}));

import ReportsListPage from "@/app/(dashboard)/reports/page";
import { BUILTIN_REPORT_TEMPLATES, REPORT_CATEGORIES } from "@/lib/reports/types";

afterEach(() => {
  cleanup();
});

describe("报表列表页 /reports", () => {
  it("渲染页面标题 + 说明", () => {
    render(<ReportsListPage />);
    expect(screen.getByText("报表中心")).toBeInTheDocument();
    expect(screen.getByText(/选择一个内置报表模板/)).toBeInTheDocument();
  });

  it("渲染所有内置模板为卡片", () => {
    render(<ReportsListPage />);
    const cards = screen.getAllByTestId("report-template-card");
    expect(cards).toHaveLength(BUILTIN_REPORT_TEMPLATES.length);
  });

  it("每个卡片透出 data-template-id", () => {
    render(<ReportsListPage />);
    const cards = screen.getAllByTestId("report-template-card");
    const ids = cards.map((c) => c.getAttribute("data-template-id"));
    BUILTIN_REPORT_TEMPLATES.forEach((t) => {
      expect(ids).toContain(t.id);
    });
  });

  it("每个卡片显示模板名称", () => {
    render(<ReportsListPage />);
    BUILTIN_REPORT_TEMPLATES.forEach((t) => {
      expect(screen.getByText(t.name)).toBeInTheDocument();
    });
  });

  it("每个卡片有指向 /reports/[id] 的查看链接", () => {
    render(<ReportsListPage />);
    const links = screen.getAllByTestId("report-view-link");
    BUILTIN_REPORT_TEMPLATES.forEach((t) => {
      const match = links.find((el) => el.getAttribute("href") === `/reports/${t.id}`);
      expect(match).toBeDefined();
    });
  });

  it("推荐模板显示推荐徽章（数量一致）", () => {
    render(<ReportsListPage />);
    const recommendedCount = BUILTIN_REPORT_TEMPLATES.filter((t) => t.isRecommended).length;
    // 当前 BUILTIN_REPORT_TEMPLATES 仅 storage-overview 标记 isRecommended=true
    expect(recommendedCount).toBeGreaterThan(0);
    const badges = screen.getAllByText("推荐");
    expect(badges).toHaveLength(recommendedCount);
  });

  it("显示分类徽章（中文标签）", () => {
    render(<ReportsListPage />);
    BUILTIN_REPORT_TEMPLATES.forEach((t) => {
      const expected = REPORT_CATEGORIES[t.category as keyof typeof REPORT_CATEGORIES];
      if (expected) {
        expect(screen.getByText(expected)).toBeInTheDocument();
      }
    });
  });

  it("显示组件数量（每个卡片内单独出现）", () => {
    render(<ReportsListPage />);
    // 多个模板可能有相同 widget 数量（如 storage-overview / ai-usage 都是 6），
    // 故按 template.id 定位具体卡片再断言其内部包含对应文本
    BUILTIN_REPORT_TEMPLATES.forEach((t) => {
      const card = document
        .querySelector(`[data-template-id="${t.id}"]`);
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain(`${t.layout.widgets.length} 个组件`);
    });
  });

  it("grid 容器使用响应式断点（1/2/3 列）", () => {
    render(<ReportsListPage />);
    const grid = screen.getByTestId("reports-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-3");
  });

  it("返回按钮链接到首页 /", () => {
    render(<ReportsListPage />);
    // Button asChild + Link 经 Radix Slot 递归合并到内层 <a>，data-testid 会被覆盖；
    // 改按可见文本"返回"定位 <a>，再断言 href
    const backLink = screen.getByText("返回").closest("a");
    expect(backLink).not.toBeNull();
    expect(backLink?.getAttribute("href")).toBe("/");
  });

  it("页面根容器透出 data-testid=reports-list-page", () => {
    render(<ReportsListPage />);
    expect(screen.getByTestId("reports-list-page")).toBeInTheDocument();
  });
});
