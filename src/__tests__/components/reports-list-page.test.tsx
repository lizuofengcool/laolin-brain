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
 * - 搜索框 + 分类下拉（filter bar）渲染
 * - 搜索按 name / description 过滤（大小写、首尾空格无关），无匹配显示空态
 * - 分类下拉选项 = "全部分类" + 模板实际出现的分类（去重）
 * - 分类过滤 / 重置 / 搜索+分类组合过滤
 *
 * 桩化 lucide-react 图标，避免真实 SVG 渲染
 * 桩化 next/navigation Link：渲染为带 data-href 的 <a> 以便断言目标路径
 * 不桩化 reportManager：BUILTIN_REPORT_TEMPLATES 是纯内存常量，单测直接消费真实数据
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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
  Search: () => <span data-testid="icon-search" />,
  Star: () => <span data-testid="icon-star" />,
}));

// Radix Select 在 jsdom 下受 portal/pointer 限制，mock 为透传 stub：
// Select 捕获 onValueChange 到共享 selectHandler；SelectItem 渲染为带
// data-testid 的 button，点击调用 onValueChange 触发分类切换。
// 页面同一时刻仅一个 Select 渲染，无多 Select 串扰。
const { selectHandler } = vi.hoisted(() => ({
  selectHandler: {
    value: "",
    onValueChange: (_v: string) => {},
  } as { value: string; onValueChange: (v: string) => void },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => {
    selectHandler.value = value;
    selectHandler.onValueChange = onValueChange;
    return children;
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button
      type="button"
      data-testid={`category-option-${value}`}
      onClick={() => selectHandler.onValueChange(value)}
    >
      {children}
    </button>
  ),
  SelectTrigger: ({
    children,
    "data-testid": testId,
  }: {
    children: React.ReactNode;
    "data-testid"?: string;
  }) => <div data-testid={testId ?? "select-trigger"}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder ?? ""}</span>
  ),
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
        // 分类标签同时出现在卡片徽章与分类下拉选项中，用 getAllByText 断言至少出现
        const matches = screen.getAllByText(expected);
        expect(matches.length).toBeGreaterThanOrEqual(1);
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

  // ---- 搜索 + 分类筛选（前端纯过滤，无 API 改动）----

  it("渲染搜索框与分类下拉（filter bar）", () => {
    render(<ReportsListPage />);
    expect(screen.getByTestId("reports-filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("reports-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("reports-category-select")).toBeInTheDocument();
  });

  it("分类下拉含'全部分类' + 模板实际出现的分类", () => {
    render(<ReportsListPage />);
    // "全部"哨兵选项 + 4 个模板分类（storage/files/users/ai，去重）
    expect(screen.getByTestId("category-option-__all__")).toBeInTheDocument();
    expect(screen.getByTestId("category-option-storage")).toBeInTheDocument();
    expect(screen.getByTestId("category-option-files")).toBeInTheDocument();
    expect(screen.getByTestId("category-option-users")).toBeInTheDocument();
    expect(screen.getByTestId("category-option-ai")).toBeInTheDocument();
  });

  it("输入关键词按 name 过滤模板", () => {
    render(<ReportsListPage />);
    const input = screen.getByTestId("reports-search-input");
    // "存储" 仅命中 storage-overview（name=存储概览）
    fireEvent.change(input, { target: { value: "存储" } });
    const cards = screen.getAllByTestId("report-template-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-template-id")).toBe("storage-overview");
  });

  it("输入关键词按 description 过滤模板", () => {
    render(<ReportsListPage />);
    const input = screen.getByTestId("reports-search-input");
    // "登录" 仅出现在 user-activity 的 description
    fireEvent.change(input, { target: { value: "登录" } });
    const cards = screen.getAllByTestId("report-template-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-template-id")).toBe("user-activity");
  });

  it("关键词大小写与首尾空格无关", () => {
    render(<ReportsListPage />);
    const input = screen.getByTestId("reports-search-input");
    // ai-usage name="AI使用分析"；输入 "  ai  " 应匹配（小写 + 首尾空格 trim）
    fireEvent.change(input, { target: { value: "  ai  " } });
    const cards = screen.getAllByTestId("report-template-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-template-id")).toBe("ai-usage");
  });

  it("关键词无匹配时显示空态并隐藏网格", () => {
    render(<ReportsListPage />);
    const input = screen.getByTestId("reports-search-input");
    fireEvent.change(input, { target: { value: "zzzzzz" } });
    expect(screen.getByTestId("reports-empty")).toBeInTheDocument();
    expect(screen.getByText("未匹配到报表模板")).toBeInTheDocument();
    expect(screen.queryByTestId("reports-grid")).toBeNull();
  });

  it("清空搜索框恢复全部模板", () => {
    render(<ReportsListPage />);
    const input = screen.getByTestId("reports-search-input");
    fireEvent.change(input, { target: { value: "存储" } });
    expect(screen.getAllByTestId("report-template-card")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getAllByTestId("report-template-card")).toHaveLength(
      BUILTIN_REPORT_TEMPLATES.length
    );
  });

  it("选择分类过滤模板（仅显示该分类）", () => {
    render(<ReportsListPage />);
    fireEvent.click(screen.getByTestId("category-option-storage"));
    const cards = screen.getAllByTestId("report-template-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-template-id")).toBe("storage-overview");
  });

  it("选择分类后再切回'全部分类'恢复全部模板", () => {
    render(<ReportsListPage />);
    fireEvent.click(screen.getByTestId("category-option-storage"));
    expect(screen.getAllByTestId("report-template-card")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("category-option-__all__"));
    expect(screen.getAllByTestId("report-template-card")).toHaveLength(
      BUILTIN_REPORT_TEMPLATES.length
    );
  });

  it("搜索 + 分类组合过滤", () => {
    render(<ReportsListPage />);
    // "活跃" 同时命中 file-activity（文件活跃度）与 user-activity（用户活跃度）
    const input = screen.getByTestId("reports-search-input");
    fireEvent.change(input, { target: { value: "活跃" } });
    expect(screen.getAllByTestId("report-template-card")).toHaveLength(2);
    // 叠加分类 files → 仅 file-activity
    fireEvent.click(screen.getByTestId("category-option-files"));
    const cards = screen.getAllByTestId("report-template-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-template-id")).toBe("file-activity");
  });
});
