/**
 * MobileNav 组件单测（src/components/layout/MobileNav.tsx）
 *
 * 锁定移动端底部导航栏的关键行为：
 * - 渲染 6 个主导航项（首页/文件/收藏/搜索/报表/我的），其中"报表"为本轮新增
 *   入口，指向 /reports，与桌面端 Sidebar 的"报表中心"（PieChart 图标）对齐
 * - 点击任一导航项 → router.push(item.path)
 * - 当前 pathname 命中某项 path → 该项高亮（text-primary），其余为 text-muted-foreground
 * - 收藏角标：favCount > 0 → 渲染角标并展示数字；favCount === 0 → 不渲染角标
 * - 收藏角标封顶：favCount > 99 → 展示 "99+"
 *
 * 桩化：
 * - useAppStore：拦截 selector 调用，mockReturnValue 直接返回 favCount（数字）
 * - next/navigation：usePathname 返回 mockUsePathname()，useRouter 返回 mockRouter
 *   （含 push spy）
 * - lucide-react：保留真实渲染（纯 SVG，无 ResizeObserver 依赖，jsdom 可渲染）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockUseAppStore, mockRouter, mockUsePathname } = vi.hoisted(() => ({
  mockUseAppStore: vi.fn(),
  mockRouter: { push: vi.fn() },
  mockUsePathname: vi.fn(),
}));

vi.mock("@/stores/app-store", () => ({
  useAppStore: (...args: unknown[]) => mockUseAppStore(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => mockRouter,
}));

import { MobileNav } from "@/components/layout/MobileNav";

/** 6 个主导航项的 label（顺序即渲染顺序）。 */
const EXPECTED_LABELS = ["首页", "文件", "收藏", "搜索", "报表", "我的"];

beforeEach(() => {
  mockUseAppStore.mockReset();
  mockUsePathname.mockReset();
  mockRouter.push.mockReset();
  // 默认：无收藏、当前位于 /dashboard
  mockUseAppStore.mockReturnValue(0);
  mockUsePathname.mockReturnValue("/dashboard");
});

afterEach(() => {
  cleanup();
});

/** 通过 label 文本定位其所在 button（label 渲染在 button 内的 <span> 中）。 */
function getNavButton(label: string): HTMLElement {
  return screen.getByText(label).closest("button")!;
}

/** 收藏角标 span（className 含 bg-primary，label span 无此类）。无角标时返回 null。 */
function getFavBadge(button: HTMLElement): HTMLElement | null {
  return button.querySelector("span.bg-primary");
}

describe("MobileNav", () => {
  describe("导航项渲染", () => {
    it("渲染 6 个主导航项（含本轮新增「报表」）", () => {
      render(<MobileNav />);
      EXPECTED_LABELS.forEach((label) => {
        expect(getNavButton(label)).toBeInTheDocument();
      });
      // 按钮总数 = 6
      expect(screen.getAllByRole("button")).toHaveLength(6);
    });

    it("「报表」项位于「搜索」与「我的」之间（顺序锁定）", () => {
      render(<MobileNav />);
      const buttons = screen.getAllByRole("button");
      const labels = buttons.map((b) => b.textContent);
      // textContent 含图标 SVG 无文本 + label span，故等于 label 本身（无角标时）
      expect(labels).toEqual(EXPECTED_LABELS);
    });
  });

  describe("报表入口（本轮新增）", () => {
    it("点击「报表」 → router.push('/reports')", () => {
      render(<MobileNav />);
      fireEvent.click(getNavButton("报表"));
      expect(mockRouter.push).toHaveBeenCalledWith("/reports");
      expect(mockRouter.push).toHaveBeenCalledTimes(1);
    });

    it("pathname === '/reports' → 「报表」项高亮、其余不高亮", () => {
      mockUsePathname.mockReturnValue("/reports");
      render(<MobileNav />);

      const reportsBtn = getNavButton("报表");
      // active 项 className 含 text-primary、不含 text-muted-foreground
      expect(reportsBtn.className).toContain("text-primary");
      expect(reportsBtn.className).not.toContain("text-muted-foreground");

      // 其余 5 项均为 inactive
      ["首页", "文件", "收藏", "搜索", "我的"].forEach((label) => {
        const btn = getNavButton(label);
        expect(btn.className).toContain("text-muted-foreground");
        expect(btn.className).not.toContain("text-primary");
      });
    });
  });

  describe("导航跳转（回归）", () => {
    it("点击各导航项均 push 对应 path", () => {
      render(<MobileNav />);
      const cases: Array<[string, string]> = [
        ["首页", "/dashboard"],
        ["文件", "/files"],
        ["收藏", "/favorites"],
        ["搜索", "/search"],
        ["报表", "/reports"],
        ["我的", "/profile"],
      ];
      cases.forEach(([label, path]) => {
        fireEvent.click(getNavButton(label));
      });
      expect(mockRouter.push.mock.calls).toEqual(
        cases.map(([, path]) => [path]),
      );
    });
  });

  describe("收藏角标", () => {
    it("favCount === 0 → 不渲染角标", () => {
      mockUseAppStore.mockReturnValue(0);
      render(<MobileNav />);
      const favBtn = getNavButton("收藏");
      expect(getFavBadge(favBtn)).toBeNull();
    });

    it("favCount = 3 → 渲染角标并展示 '3'", () => {
      mockUseAppStore.mockReturnValue(3);
      render(<MobileNav />);
      const favBtn = getNavButton("收藏");
      const badge = getFavBadge(favBtn);
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe("3");
    });

    it("favCount > 99 → 角标封顶展示 '99+'", () => {
      mockUseAppStore.mockReturnValue(120);
      render(<MobileNav />);
      const favBtn = getNavButton("收藏");
      const badge = getFavBadge(favBtn);
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe("99+");
    });

    it("非收藏项不渲染角标（即使 favCount > 0）", () => {
      mockUseAppStore.mockReturnValue(5);
      render(<MobileNav />);
      // 报表、首页等均不应有角标
      ["报表", "首页", "文件", "搜索", "我的"].forEach((label) => {
        expect(getFavBadge(getNavButton(label))).toBeNull();
      });
    });
  });

  describe("active 态（回归）", () => {
    it("pathname === '/dashboard' → 仅「首页」高亮", () => {
      mockUsePathname.mockReturnValue("/dashboard");
      render(<MobileNav />);
      expect(getNavButton("首页").className).toContain("text-primary");
      // 报表此时不高亮
      expect(getNavButton("报表").className).toContain("text-muted-foreground");
    });

    it("pathname 未命中任何项 → 全部 inactive", () => {
      mockUsePathname.mockReturnValue("/some/other/page");
      render(<MobileNav />);
      EXPECTED_LABELS.forEach((label) => {
        expect(getNavButton(label).className).toContain("text-muted-foreground");
      });
    });
  });
});
