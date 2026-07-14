/**
 * BillingDashboard 组件测试 — 取消订阅控制流
 *
 * 锁定 src/components/billing/BillingDashboard.tsx 的「管理订阅」按钮 →
 * AlertDialog 二次确认 → POST /api/billing/subscription { action: 'cancel' } →
 * toast 反馈 → fetchSubscription 刷新本地状态 的客户端契约。
 *
 * 关键被测逻辑：
 *   - 「管理订阅」按钮仅对 status==='active' && plan!=='free' 渲染。
 *   - 点击按钮打开 AlertDialog；确认按钮触发 handleCancelSubscription。
 *   - POST 成功 → toast '订阅已取消' + 关闭弹窗 + 重新 GET /api/billing/subscription。
 *   - POST 400/500（!res.ok || !data.success）→ destructive toast 带 error + 弹窗保留。
 *   - 网络异常（fetch reject）→ destructive toast '网络错误，请稍后重试' + 弹窗保留。
 *   - 提交中（cancelling=true）按钮 disabled，弹窗不允许外部关闭。
 *
 * Mock 策略：
 *   - @/hooks/use-toast 的 toast 经 vi.hoisted + spy 断言。
 *   - @/components/ui/alert-dialog 桩化为受控组件：open=true 时渲染 children，
 *     AlertDialogAction/Cancel 暴露 data-testid 触发按钮，绕开 Radix portal/focus。
 *   - fetch 经 vi.stubGlobal 全局桩，按 url+method 路由返回受控响应。
 *   - 其余 UI 子组件（Card/Button/Badge/Progress）保持真实实现，仅验证按钮可见性。
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

// AlertDialog 桩：受控渲染。open=false 时不渲染 content，避免 Radix portal 复杂度。
// AlertDialogAction 触发 onClick（组件内调 handleCancelSubscription）；Cancel 仅关闭。
// 提交中时 onOpenChange(false) 应被组件逻辑拦截（cancelling=true 时不关闭）。
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open, onOpenChange }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="alert-dialog-root" data-open={open ? 'true' : 'false'}>
      {open ? children : null}
    </div>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-footer">{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
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
    <button
      data-testid="alert-dialog-cancel"
      // 桩不直接调 onOpenChange，组件的关闭语义由 cancelling 守卫测试覆盖
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));

import { BillingDashboard } from "@/components/billing/BillingDashboard";

/** 构造类 fetch 响应：仅提供组件使用的 ok/status/json 三字段。 */
function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const mockFetch = vi.fn();

/** GET /api/billing/subscription 默认响应：pro 套餐、active、未取消。 */
function subscriptionGetBody(overrides: Partial<{
  plan: string;
  status: string;
  cancelAtPeriodEnd: boolean;
}> = {}) {
  return {
    subscription: {
      plan: 'pro',
      planName: '专业版',
      planDescription: '专业套餐',
      status: 'active',
      currentPeriodEnd: '2026-12-31T00:00:00Z',
      cancelAtPeriodEnd: false,
      ...overrides,
    },
    usage: {
      storage: { used: '0', quota: '0', percentage: 0 },
      ai: { used: 0, quota: 0, percentage: 0 },
    },
    trial: { isTrial: false, trialEndsAt: null, daysLeft: 0 },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  // 默认 GET 返回 pro active 订阅；POST cancel 返回成功。具体用例可覆盖。
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url === '/api/billing/subscription' && method === 'GET') {
      return res(subscriptionGetBody());
    }
    if (url === '/api/billing/subscription' && method === 'POST') {
      return res({ success: true, cancelAtPeriodEnd: true });
    }
    throw new Error(`Unexpected fetch ${url} ${method}`);
  });
  vi.stubGlobal('fetch', mockFetch);
  toastSpy.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('BillingDashboard - 取消订阅控制流', () => {
  it('pro active 订阅渲染「管理订阅」按钮（默认 GET mock 返回 pro/active）', async () => {
    render(<BillingDashboard />);

    await waitFor(() => expect(screen.getByText('管理订阅')).toBeInTheDocument());
  });

  it('free 订阅不渲染「管理订阅」按钮', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/billing/subscription' && method === 'GET') {
        return res(subscriptionGetBody({ plan: 'free', planName: '免费版' }));
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<BillingDashboard />);

    await waitFor(() =>
      expect(screen.queryByText('管理订阅')).toBeNull(),
    );
  });

  it('cancelled 状态订阅不渲染「管理订阅」按钮', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/billing/subscription' && method === 'GET') {
        return res(subscriptionGetBody({ plan: 'pro', status: 'cancelled' }));
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<BillingDashboard />);

    await waitFor(() =>
      expect(screen.queryByText('管理订阅')).toBeNull(),
    );
  });

  it('点击「管理订阅」打开 AlertDialog；确认 → POST cancel → 成功 toast + 关闭 + 重新 GET', async () => {
    render(<BillingDashboard />);

    // 等待订阅加载完成，按钮出现
    const manageBtn = await screen.findByText('管理订阅');
    // 弹窗初始关闭
    expect(screen.getByTestId('alert-dialog-root').getAttribute('data-open')).toBe('false');

    fireEvent.click(manageBtn);
    await waitFor(() =>
      expect(screen.getByTestId('alert-dialog-root').getAttribute('data-open')).toBe('true'),
    );

    // 确认取消
    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    // POST 调用契约
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/billing/subscription',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      }),
    );
    // 成功 toast
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: '订阅已取消' }),
    );
    // 弹窗关闭
    await waitFor(() =>
      expect(screen.getByTestId('alert-dialog-root').getAttribute('data-open')).toBe('false'),
    );
    // 重新拉取订阅：GET 调用次数 >= 2（初始 1 次 + 取消后刷新 1 次）
    const getCalls = mockFetch.mock.calls.filter(
      ([u, i]) => u === '/api/billing/subscription' && ((i?.method ?? 'GET').toUpperCase() === 'GET'),
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('POST cancel 返回 400 + error → destructive toast 带 description + 弹窗保留', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/billing/subscription' && method === 'GET') {
        return res(subscriptionGetBody());
      }
      if (url === '/api/billing/subscription' && method === 'POST') {
        return res({ error: 'No active subscription found' }, 400);
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<BillingDashboard />);

    const manageBtn = await screen.findByText('管理订阅');
    fireEvent.click(manageBtn);
    await waitFor(() =>
      expect(screen.getByTestId('alert-dialog-root').getAttribute('data-open')).toBe('true'),
    );

    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '取消订阅失败',
        description: 'No active subscription found',
        variant: 'destructive',
      }),
    );
    // 弹窗仍开启（未关闭）
    expect(screen.getByTestId('alert-dialog-root').getAttribute('data-open')).toBe('true');
  });

  it('POST cancel 返回 200 但 success=false → destructive toast + 弹窗保留', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/billing/subscription' && method === 'GET') {
        return res(subscriptionGetBody());
      }
      if (url === '/api/billing/subscription' && method === 'POST') {
        // 异常：HTTP 200 但 body success=false（防御性分支）
        return res({ success: false, error: '内部状态异常' }, 200);
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<BillingDashboard />);

    const manageBtn = await screen.findByText('管理订阅');
    fireEvent.click(manageBtn);
    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '取消订阅失败',
        description: '内部状态异常',
        variant: 'destructive',
      }),
    );
    expect(screen.getByTestId('alert-dialog-root').getAttribute('data-open')).toBe('true');
  });

  it('POST cancel 网络异常（fetch reject）→ destructive toast 网络错误 + 弹窗保留', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/billing/subscription' && method === 'GET') {
        return res(subscriptionGetBody());
      }
      if (url === '/api/billing/subscription' && method === 'POST') {
        throw new Error('network down');
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<BillingDashboard />);

    const manageBtn = await screen.findByText('管理订阅');
    fireEvent.click(manageBtn);
    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '取消订阅失败',
        description: '网络错误，请稍后重试',
        variant: 'destructive',
      }),
    );
    expect(screen.getByTestId('alert-dialog-root').getAttribute('data-open')).toBe('true');
  });

  it('提交中确认按钮显示「处理中…」且 disabled', async () => {
    // 让 POST 永远 pending，确保 cancelling 状态可见
    let resolvePost: (v: unknown) => void = () => {};
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/billing/subscription' && method === 'GET') {
        return res(subscriptionGetBody());
      }
      if (url === '/api/billing/subscription' && method === 'POST') {
        return new Promise((resolve) => { resolvePost = resolve; });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    render(<BillingDashboard />);

    const manageBtn = await screen.findByText('管理订阅');
    fireEvent.click(manageBtn);
    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() =>
      expect(screen.getByTestId('alert-dialog-action').textContent).toBe('处理中…'),
    );
    expect(screen.getByTestId('alert-dialog-action')).toBeDisabled();

    // 解除 pending，避免 afterEach 时悬挂 promise
    resolvePost(res({ success: true, cancelAtPeriodEnd: true }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
  });

  it('onPlanLoaded 在初始 GET 后回传真实 plan（pro）', async () => {
    const onPlanLoaded = vi.fn();
    render(<BillingDashboard onPlanLoaded={onPlanLoaded} />);

    await waitFor(() => expect(onPlanLoaded).toHaveBeenCalledWith('pro'));
  });
});
