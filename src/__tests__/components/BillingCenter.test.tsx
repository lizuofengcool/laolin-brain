/**
 * BillingCenter 组件测试
 *
 * 锁定订阅/升级流程的客户端控制流（src/components/billing/BillingCenter.tsx）：
 *   - BillingDashboard 挂载后经 onPlanLoaded 回传真实 plan → 驱动 PlanComparison
 *     的 currentPlanId（修复历史 currentPlanId 硬编码 'free' 的 bug）。
 *   - handleSelectPlan('free', ...)：POST /api/billing/subscription 降级到免费版；
 *     成功 → toast + 切回 overview；失败 → destructive toast + 留在 plans。
 *   - handleSelectPlan('pro'|'enterprise', ...)：付费套餐经支付回调已更新服务端，
 *     客户端仅刷新本地状态 + 成功 toast + 切回 overview（不发 POST）。
 *   - 标签导航：handleUpgradeClick/handleOrdersClick/handleBackToOverview 切 tab。
 *
 * 子组件 BillingDashboard / PlanComparison / OrderHistory 经 vi.mock 桩化，
 * 暴露回调触发按钮，隔离 BillingCenter 自身的状态机。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
const { toastSpy } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastSpy(...args),
}));

// BillingDashboard 桩：渲染触发 onPlanLoaded / onUpgradeClick / onOrdersClick 的按钮
vi.mock("@/components/billing/BillingDashboard", () => ({
  BillingDashboard: (props: {
    onPlanLoaded?: (plan: string) => void;
    onUpgradeClick?: () => void;
    onOrdersClick?: () => void;
  }) => (
    <div data-testid="billing-dashboard-stub">
      <button onClick={() => props.onPlanLoaded?.("pro")} data-testid="load-pro">
        load-pro
      </button>
      <button onClick={() => props.onUpgradeClick?.()} data-testid="go-upgrade">
        go-upgrade
      </button>
      <button onClick={() => props.onOrdersClick?.()} data-testid="go-orders">
        go-orders
      </button>
    </div>
  ),
}));

// PlanComparison 桩：显示当前 currentPlanId，并提供触发 onSelectPlan 的按钮
vi.mock("@/components/billing/PlanComparison", () => ({
  PlanComparison: (props: {
    currentPlanId?: string;
    onSelectPlan?: (planId: string, interval: "month" | "year") => void;
  }) => (
    <div data-testid="plan-comparison-stub">
      <span data-testid="current-plan">{props.currentPlanId ?? ""}</span>
      <button
        onClick={() => props.onSelectPlan?.("free", "month")}
        data-testid="select-free"
      >
        select-free
      </button>
      <button
        onClick={() => props.onSelectPlan?.("pro", "year")}
        data-testid="select-pro"
      >
        select-pro
      </button>
    </div>
  ),
}));

vi.mock("@/components/billing/OrderHistory", () => ({
  OrderHistory: (props: { onBack?: () => void }) => (
    <div data-testid="order-history-stub">
      <button onClick={() => props.onBack?.()} data-testid="go-back">
        go-back
      </button>
    </div>
  ),
}));

import { BillingCenter } from "@/components/billing/BillingCenter";

/** 构造类 fetch 响应：仅提供组件使用的 ok/status/json 三字段。 */
function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  // 默认 POST /api/billing/subscription 返回成功（具体用例可覆盖）
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (
      url === "/api/billing/subscription" &&
      (init?.method ?? "GET").toUpperCase() === "POST"
    ) {
      return res({ success: true, subscription: { plan: "free" } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", mockFetch);
  toastSpy.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("BillingCenter - 订阅/升级控制流", () => {
  it("onPlanLoaded 回传的 plan 驱动 PlanComparison 的 currentPlanId", async () => {
    render(<BillingCenter />);

    // overview 标签默认渲染 BillingDashboard 桩
    expect(screen.getByTestId("billing-dashboard-stub")).toBeInTheDocument();
    // 触发 plan 回传（模拟 BillingDashboard 拉到 pro 订阅）
    fireEvent.click(screen.getByTestId("load-pro"));

    // 切到 plans 标签，验证 currentPlanId 已同步
    fireEvent.click(screen.getByTestId("go-upgrade"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-comparison-stub")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("current-plan").textContent).toBe("pro");
  });

  it("选择 free 套餐：POST /api/billing/subscription 成功 → toast + 切回 overview", async () => {
    render(<BillingCenter />);

    // 切到 plans 标签
    fireEvent.click(screen.getByTestId("go-upgrade"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-comparison-stub")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("select-free"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    // POST 调用契约
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/billing/subscription",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "free", interval: "month" }),
      }),
    );
    // toast 文案
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "已切换到免费版" }),
    );
    // 切回 overview（BillingDashboard 桩重新可见，PlanComparison 桩卸载）
    await waitFor(() =>
      expect(screen.getByTestId("billing-dashboard-stub")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("plan-comparison-stub")).toBeNull();
  });

  it("选择付费套餐（支付成功后）：不发 POST → 成功 toast + 切回 overview", async () => {
    render(<BillingCenter />);

    fireEvent.click(screen.getByTestId("go-upgrade"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-comparison-stub")).toBeInTheDocument(),
    );

    mockFetch.mockClear();
    fireEvent.click(screen.getByTestId("select-pro"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    // 付费套餐走支付链路，此处不应直接 POST 变更订阅
    expect(mockFetch).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "套餐升级成功" }),
    );
    // 切回 overview
    await waitFor(() =>
      expect(screen.getByTestId("billing-dashboard-stub")).toBeInTheDocument(),
    );
  });

  it("选择 free 套餐 POST 失败：destructive toast + 留在 plans 标签", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (
        url === "/api/billing/subscription" &&
        (init?.method ?? "GET").toUpperCase() === "POST"
      ) {
        return res({ error: "余额异常" }, 400);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<BillingCenter />);

    fireEvent.click(screen.getByTestId("go-upgrade"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-comparison-stub")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("select-free"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "切换套餐失败",
        description: "余额异常",
        variant: "destructive",
      }),
    );
    // 仍在 plans 标签
    expect(screen.getByTestId("plan-comparison-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("billing-dashboard-stub")).toBeNull();
  });

  it("选择 free 套餐网络异常：destructive toast + 留在 plans 标签", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    render(<BillingCenter />);

    fireEvent.click(screen.getByTestId("go-upgrade"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-comparison-stub")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("select-free"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "切换套餐失败",
        description: "网络错误，请稍后重试",
        variant: "destructive",
      }),
    );
    expect(screen.getByTestId("plan-comparison-stub")).toBeInTheDocument();
  });

  it("标签导航：orders 标签 → back → overview", async () => {
    render(<BillingCenter />);

    // 切到 orders
    fireEvent.click(screen.getByTestId("go-orders"));
    await waitFor(() =>
      expect(screen.getByTestId("order-history-stub")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("billing-dashboard-stub")).toBeNull();

    // 点 back 回 overview
    fireEvent.click(screen.getByTestId("go-back"));
    await waitFor(() =>
      expect(screen.getByTestId("billing-dashboard-stub")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("order-history-stub")).toBeNull();
  });
});
