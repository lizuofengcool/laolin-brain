/**
 * OrderHistory 组件测试 — pending 订单操作控制流
 *
 * 锁定 src/components/billing/OrderHistory.tsx 的「立即支付」/「取消订单」按钮
 * 客户端契约（详情弹窗内 pending 订单操作区）：
 *   - pending 订单详情弹窗渲染「立即支付」+「取消订单」按钮；非 pending 不渲染。
 *   - 「取消订单」→ AlertDialog 二次确认 → POST /api/billing/orders/:id/cancel →
 *     toast 反馈 + 关闭弹窗 + 重新 GET /api/billing/orders 刷新列表。
 *   - POST 失败（!res.ok || !data.success）→ destructive toast + 弹窗保留。
 *   - 网络异常（fetch reject）→ destructive toast「网络错误，请稍后重试」。
 *   - 提交中（cancelling=true）→ 确认按钮文案「处理中…」+ disabled。
 *   - 「立即支付」→ 关闭详情弹窗 + 打开 PaymentDialog（带 plan/interval/amount +
 *     reuseOrderId 透传订单 id，使 /api/payment/create 走 reusePendingOrder 复用既有
 *     pending 订单而非新建，避免原订单悬挂）。
 *
 * Mock 策略：
 *   - @/hooks/use-toast 的 toast 经 vi.hoisted + spy 断言。
 *   - @/components/ui/alert-dialog 桩化为受控组件（open 驱动渲染、Action/Cancel
 *     暴露 data-testid 触发按钮），绕开 Radix portal/focus 复杂度。
 *   - @/components/ui/dialog 桩化：open=true 时渲染 children。
 *   - @/components/ui/select 桩化为透传 stub（jsdom 下 Radix Select 受 portal 限制）。
 *   - @/components/billing/PaymentDialog 桩化为带 data-* 的 div，便于断言入参。
 *   - fetch 经 vi.stubGlobal 全局桩，按 url+method 路由返回受控响应。
 *   - 其余 UI 子组件（Card/Button/Badge/Table/Pagination）保持真实实现。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

// ---- hoisted mocks ----
const { toastSpy } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastSpy(...args),
}));

// AlertDialog 桩：受控渲染。open=false 时不渲染 content。
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: {
    children: React.ReactNode;
    open: boolean;
  }) => (
    <div data-testid="alert-dialog-root" data-open={open ? 'true' : 'false'}>
      {open ? children : null}
    </div>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-footer">{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({ children, onClick, disabled }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button
      data-testid="alert-dialog-action"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, disabled }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button data-testid="alert-dialog-cancel" disabled={disabled}>{children}</button>
  ),
}));

// Dialog 桩：open=true 时渲染 children，使详情弹窗内容在 jsdom 下可触达。
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="dialog-root" data-open={open ? 'true' : 'false'}>
      {open ? children : null}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Radix Select 桩：透传 children，jsdom 下不受 portal 限制。
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
}));

// PaymentDialog 桩：暴露入参为 data-*，便于断言立即支付接线。
vi.mock("@/components/billing/PaymentDialog", () => ({
  PaymentDialog: ({ open, planId, planName, interval, amount, reuseOrderId }: {
    open: boolean;
    planId: string;
    planName: string;
    interval: string;
    amount: number;
    reuseOrderId?: string;
  }) => (
    <div
      data-testid="payment-dialog"
      data-open={open ? 'true' : 'false'}
      data-plan-id={planId}
      data-plan-name={planName}
      data-interval={interval}
      data-amount={String(amount)}
      data-reuse-order-id={reuseOrderId ?? ''}
    />
  ),
}));

import { OrderHistory } from "@/components/billing/OrderHistory";

/** 构造类 fetch 响应：仅提供组件使用的 ok/status/json 三字段。 */
function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const mockFetch = vi.fn();

/** 构造一个 pending 订单 fixture。 */
function pendingOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order-1",
    orderNo: "KB123ABC",
    amount: 3900,
    status: "pending",
    payMethod: "alipay",
    plan: "pro",
    interval: "month",
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/** 默认 GET /api/billing/orders 响应：单条 pending 订单。 */
function ordersGetBody(orders: unknown[] = [pendingOrder()]) {
  return { orders, total: orders.length, page: 1, pageSize: 10, totalPages: 1 };
}

/** 在订单行内找到 Eye 详情按钮（点击触发 viewOrderDetail）。 */
async function openDetailForOrder(orderNo: string) {
  const cell = await screen.findByText(orderNo);
  const row = cell.closest("tr") as HTMLElement;
  const eyeButton = within(row).getByRole("button");
  fireEvent.click(eyeButton);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.startsWith("/api/billing/orders") && method === "GET") {
      return res(ordersGetBody());
    }
    if (url.startsWith("/api/billing/orders/") && url.endsWith("/cancel") && method === "POST") {
      return res({ success: true, order: pendingOrder({ status: "cancelled" }) });
    }
    throw new Error(`Unexpected fetch ${url} ${method}`);
  });
  vi.stubGlobal("fetch", mockFetch);
  toastSpy.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("OrderHistory - pending 订单操作", () => {
  it("pending 订单详情弹窗渲染「立即支付」+「取消订单」按钮", async () => {
    render(<OrderHistory />);

    await openDetailForOrder("KB123ABC");

    await waitFor(() => expect(screen.getByText("立即支付")).toBeInTheDocument());
    expect(screen.getByText("取消订单")).toBeInTheDocument();
  });

  it("paid 订单详情弹窗不渲染操作按钮", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/billing/orders") && method === "GET") {
        return res(ordersGetBody([pendingOrder({ status: "paid" })]));
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<OrderHistory />);

    await openDetailForOrder("KB123ABC");

    await waitFor(() => expect(screen.queryByText("立即支付")).toBeNull());
    expect(screen.queryByText("取消订单")).toBeNull();
  });

  it("取消订单：确认 → POST cancel → 成功 toast + 关闭弹窗 + 重新 GET orders", async () => {
    render(<OrderHistory />);

    await openDetailForOrder("KB123ABC");
    fireEvent.click(screen.getByText("取消订单"));
    fireEvent.click(screen.getByTestId("alert-dialog-action"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "订单已取消" }));
    });
    // POST cancel 发起
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/billing/orders/order-1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
    // 取消后重新拉取订单列表（GET 调用次数 >= 2：初始 + 刷新）
    const getCalls = mockFetch.mock.calls.filter(
      ([u, init]) => String(u).startsWith("/api/billing/orders") && (init?.method ?? "GET").toUpperCase() === "GET",
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
    // 弹窗关闭
    await waitFor(() => {
      expect(screen.getByTestId("alert-dialog-root").getAttribute("data-open")).toBe("false");
    });
  });

  it("取消订单：POST 返回 400（!res.ok）→ destructive toast + 弹窗保留", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/billing/orders") && method === "GET") {
        return res(ordersGetBody());
      }
      if (url.endsWith("/cancel") && method === "POST") {
        return res({ success: false, error: "仅待支付订单可取消" }, 400);
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<OrderHistory />);

    await openDetailForOrder("KB123ABC");
    fireEvent.click(screen.getByText("取消订单"));
    fireEvent.click(screen.getByTestId("alert-dialog-action"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
        title: "取消订单失败",
        description: "仅待支付订单可取消",
        variant: "destructive",
      }));
    });
    // 弹窗保留
    expect(screen.getByTestId("alert-dialog-root").getAttribute("data-open")).toBe("true");
  });

  it("取消订单：网络异常（fetch reject）→ destructive toast「网络错误」", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/billing/orders") && method === "GET") {
        return res(ordersGetBody());
      }
      if (url.endsWith("/cancel") && method === "POST") {
        throw new Error("network down");
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<OrderHistory />);

    await openDetailForOrder("KB123ABC");
    fireEvent.click(screen.getByText("取消订单"));
    fireEvent.click(screen.getByTestId("alert-dialog-action"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
        title: "取消订单失败",
        description: "网络错误，请稍后重试",
        variant: "destructive",
      }));
    });
  });

  it("提交中：POST 永久 pending → 确认按钮文案「处理中…」+ disabled", async () => {
    // POST cancel 永不 resolve，保持 cancelling=true
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/billing/orders") && method === "GET") {
        return res(ordersGetBody());
      }
      if (url.endsWith("/cancel") && method === "POST") {
        return new Promise(() => {}); // 永久 pending
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<OrderHistory />);

    await openDetailForOrder("KB123ABC");
    fireEvent.click(screen.getByText("取消订单"));
    fireEvent.click(screen.getByTestId("alert-dialog-action"));

    await waitFor(() => {
      const action = screen.getByTestId("alert-dialog-action");
      expect(action.textContent).toBe("处理中…");
      expect(action).toBeDisabled();
    });
  });

  it("立即支付：点击 → 打开 PaymentDialog（带 plan/interval/amount/reuseOrderId）+ 关闭详情弹窗", async () => {
    render(<OrderHistory />);

    await openDetailForOrder("KB123ABC");
    fireEvent.click(screen.getByText("立即支付"));

    // PaymentDialog 打开且入参正确，reuseOrderId 透传订单 id（复用而非新建）
    await waitFor(() => {
      const pd = screen.getByTestId("payment-dialog");
      expect(pd.getAttribute("data-open")).toBe("true");
      expect(pd.getAttribute("data-plan-id")).toBe("pro");
      expect(pd.getAttribute("data-plan-name")).toBe("专业版");
      expect(pd.getAttribute("data-interval")).toBe("month");
      expect(pd.getAttribute("data-amount")).toBe("3900");
      expect(pd.getAttribute("data-reuse-order-id")).toBe("order-1");
    });
    // 详情弹窗关闭
    expect(screen.getByTestId("dialog-root").getAttribute("data-open")).toBe("false");
  });
});
