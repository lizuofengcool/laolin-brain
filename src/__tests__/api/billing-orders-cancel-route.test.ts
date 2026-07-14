/**
 * billing/orders/[id]/cancel 路由 handler 级集成测试
 *
 * 锁定 src/app/api/billing/orders/[id]/cancel/route.ts 的 POST 控制流契约：
 *   1. 未认证（authenticateRequest 返回 NextResponse）→ 透传 401，不触达 cancelOrder
 *   2. 成功：cancelOrder(tenantId, orderId) → 200 { success: true, order }
 *   3. cancelOrder 抛「订单不存在」→ 400 + error message（跨租户 orderId 不命中）
 *   4. cancelOrder 抛「仅待支付订单可取消」→ 400（已支付订单需走退款流程）
 *   5. cancelOrder 抛未知 Error → 500 + 兜底「取消订单失败」（不泄露内部信息）
 *   6. cancelOrder 抛非 Error 值 → 500 + 兜底「取消订单失败」
 *   7. 调用契约：cancelOrder 以 (tenantId, orderId) 调用，orderId 取自动态路由参数
 *
 * Mock 策略：next/server / @/lib/api-auth / @/lib/billing/subscription 全部隔离，
 * 不触达真实数据库。复用 api-keys-id-route 的 vi.hoisted + MockNextResponse 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCancelOrder,
} = vi.hoisted(() => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body?: unknown, init?: { status?: number } | undefined) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number } | undefined) {
      return new MockNextResponse(body, init);
    }
  }
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockCancelOrder: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/billing/subscription", () => ({
  cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
}));

import { POST } from "@/app/api/billing/orders/[id]/cancel/route";

const AUTH_USER = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makePostRequest(id: string): NextRequest {
  return new Request(`http://localhost/api/billing/orders/${id}/cancel`, {
    method: "POST",
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const cancelledOrder = {
  id: "order-1",
  tenantId: "tenant-1",
  orderNo: "KB123ABC",
  amount: 3900,
  status: "cancelled",
  plan: "pro",
  interval: "month",
};

describe("POST /api/billing/orders/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...AUTH_USER });
    mockCancelOrder.mockResolvedValue(cancelledOrder);
  });

  it("成功：cancelOrder(tenantId, orderId) → 200 { success, order }", async () => {
    const res = (await POST(makePostRequest("order-1"), {
      params: Promise.resolve({ id: "order-1" }),
    })) as MockRes;

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockCancelOrder).toHaveBeenCalledWith("tenant-1", "order-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, order: cancelledOrder });
  });

  it("未认证 → 透传 401，不触达 cancelOrder", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await POST(makePostRequest("order-1"), {
      params: Promise.resolve({ id: "order-1" }),
    })) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it("订单不存在（跨租户 orderId 不命中）→ 400 + error message", async () => {
    mockCancelOrder.mockRejectedValue(new Error("订单不存在"));

    const res = (await POST(makePostRequest("order-other"), {
      params: Promise.resolve({ id: "order-other" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "订单不存在" });
  });

  it("非待支付订单 → 400「仅待支付订单可取消」", async () => {
    mockCancelOrder.mockRejectedValue(new Error("仅待支付订单可取消"));

    const res = (await POST(makePostRequest("order-1"), {
      params: Promise.resolve({ id: "order-1" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "仅待支付订单可取消" });
  });

  it("cancelOrder 抛未知 Error → 500 + 兜底「取消订单失败」（不泄露内部信息）", async () => {
    mockCancelOrder.mockRejectedValue(new Error("db connection lost"));

    const res = (await POST(makePostRequest("order-1"), {
      params: Promise.resolve({ id: "order-1" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "取消订单失败" });
  });

  it("cancelOrder 抛非 Error 值 → 500 + 兜底「取消订单失败」", async () => {
    mockCancelOrder.mockRejectedValue("boom");

    const res = (await POST(makePostRequest("order-1"), {
      params: Promise.resolve({ id: "order-1" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "取消订单失败" });
  });

  it("orderId 取自动态路由参数（不同 id 透传）", async () => {
    await POST(makePostRequest("order-xyz"), {
      params: Promise.resolve({ id: "order-xyz" }),
    });

    expect(mockCancelOrder).toHaveBeenCalledWith("tenant-1", "order-xyz");
  });
});
