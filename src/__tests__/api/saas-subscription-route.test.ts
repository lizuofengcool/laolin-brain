/**
 * saas/subscription 路由 handler 级集成测试
 *
 * 锁定 /api/saas/subscription 三个 handler 的安全与控制流契约：
 *   - GET：未认证 401 透传；成功时按 auth.tenantId 依次调用 getCurrentSubscription /
 *     checkTenantStatus / isSubscriptionExpiringSoon 三个服务（租户作用域，顺序 await），
 *     返回聚合对象 { subscription, tenantStatus, expiringSoon }；任一服务抛错 → 500，
 *     且因顺序 await，前序服务抛错时后续服务不触达
 *   - DELETE：未认证 401 透传；成功时按 auth.tenantId 调用 cancelSubscription，
 *     返回 { success: true, message, subscription: result }；抛错 → 500
 *   - POST：未认证 401 透传；?action=resume 时按 auth.tenantId 调用 reactivateSubscription，
 *     返回 { success: true, message, subscription: result }；无 action 或非 resume 的 action →
 *     400 { error: '未知操作' } 且不触达 reactivateSubscription；resume 分支抛错 → 500
 *
 * Mock 策略：authenticateRequest / tenant.service / billing.service / next/server 全部隔离，
 * 不触达真实数据库。路由经服务层访问数据（无直接 db 依赖），故无需 mock @/lib/db。
 * 复用 cloud-sync-config-route.test.ts 的 vi.hoisted + MockNextResponse 范式，使路由的
 * `auth instanceof NextResponse` 与 mock 的 authenticateRequest 返回值共用同一构造器。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetCurrentSubscription,
  mockCheckTenantStatus,
  mockCancelSubscription,
  mockReactivateSubscription,
  mockIsSubscriptionExpiringSoon,
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
    mockGetCurrentSubscription: vi.fn(),
    mockCheckTenantStatus: vi.fn(),
    mockCancelSubscription: vi.fn(),
    mockReactivateSubscription: vi.fn(),
    mockIsSubscriptionExpiringSoon: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/saas/tenant.service", () => ({
  getCurrentSubscription: (...args: unknown[]) => mockGetCurrentSubscription(...args),
  checkTenantStatus: (...args: unknown[]) => mockCheckTenantStatus(...args),
}));
vi.mock("@/lib/saas/billing.service", () => ({
  cancelSubscription: (...args: unknown[]) => mockCancelSubscription(...args),
  reactivateSubscription: (...args: unknown[]) => mockReactivateSubscription(...args),
  isSubscriptionExpiringSoon: (...args: unknown[]) => mockIsSubscriptionExpiringSoon(...args),
}));

import { GET, DELETE, POST } from "@/app/api/saas/subscription/route";

function makeRequest(url: string, method: string = "GET"): NextRequest {
  return new Request(url, { method }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const FIXED_END = new Date("2026-07-15T00:00:00Z");

describe("saas/subscription 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 authenticateRequest 成功返回 owner 身份；逐用例按需覆盖
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
  });

  describe("GET /api/saas/subscription", () => {
    it("未认证 → 401 透传，不触达任一订阅服务", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest("http://localhost/api/saas/subscription"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
      expect(mockCheckTenantStatus).not.toHaveBeenCalled();
      expect(mockIsSubscriptionExpiringSoon).not.toHaveBeenCalled();
    });

    it("成功 → 三个服务均以 auth.tenantId 调用，返回聚合对象", async () => {
      const subscription = {
        id: "sub-1",
        tenantId: "tenant-1",
        plan: "pro",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: FIXED_END,
      };
      const tenantStatus = { active: true, plan: "pro", currentPeriodEnd: FIXED_END };
      const expiringSoon = { expiring: false };
      mockGetCurrentSubscription.mockResolvedValue(subscription);
      mockCheckTenantStatus.mockResolvedValue(tenantStatus);
      mockIsSubscriptionExpiringSoon.mockResolvedValue(expiringSoon);

      const res = (await GET(makeRequest("http://localhost/api/saas/subscription"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ subscription, tenantStatus, expiringSoon });
      // 三个服务均以 auth.tenantId 调用（租户作用域，不跨租户读取订阅状态）
      expect(mockGetCurrentSubscription).toHaveBeenCalledWith("tenant-1");
      expect(mockCheckTenantStatus).toHaveBeenCalledWith("tenant-1");
      expect(mockIsSubscriptionExpiringSoon).toHaveBeenCalledWith("tenant-1");
    });

    it("无活跃订阅（subscription=null）→ 仍 200，三个服务均触达", async () => {
      mockGetCurrentSubscription.mockResolvedValue(null);
      mockCheckTenantStatus.mockResolvedValue({ active: true, plan: "free" });
      mockIsSubscriptionExpiringSoon.mockResolvedValue({ expiring: false });

      const res = (await GET(makeRequest("http://localhost/api/saas/subscription"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        subscription: null,
        tenantStatus: { active: true, plan: "free" },
        expiringSoon: { expiring: false },
      });
      // 即使无活跃订阅，GET 仍依次调用三个服务（不做 short-circuit）
      expect(mockGetCurrentSubscription).toHaveBeenCalledTimes(1);
      expect(mockCheckTenantStatus).toHaveBeenCalledTimes(1);
      expect(mockIsSubscriptionExpiringSoon).toHaveBeenCalledTimes(1);
    });

    it("getCurrentSubscription 抛错 → 500，后续两服务因顺序 await 不触达", async () => {
      mockGetCurrentSubscription.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest("http://localhost/api/saas/subscription"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取订阅信息失败" });
      expect(mockCheckTenantStatus).not.toHaveBeenCalled();
      expect(mockIsSubscriptionExpiringSoon).not.toHaveBeenCalled();
    });

    it("checkTenantStatus 抛错 → 500，isSubscriptionExpiringSoon 不触达", async () => {
      mockGetCurrentSubscription.mockResolvedValue(null);
      mockCheckTenantStatus.mockRejectedValue(new Error("status check failed"));

      const res = (await GET(makeRequest("http://localhost/api/saas/subscription"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取订阅信息失败" });
      expect(mockIsSubscriptionExpiringSoon).not.toHaveBeenCalled();
    });

    it("isSubscriptionExpiringSoon 抛错 → 500", async () => {
      mockGetCurrentSubscription.mockResolvedValue(null);
      mockCheckTenantStatus.mockResolvedValue({ active: true, plan: "free" });
      mockIsSubscriptionExpiringSoon.mockRejectedValue(new Error("boom"));

      const res = (await GET(makeRequest("http://localhost/api/saas/subscription"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取订阅信息失败" });
    });
  });

  describe("DELETE /api/saas/subscription", () => {
    it("未认证 → 401 透传，不触达 cancelSubscription", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await DELETE(
        makeRequest("http://localhost/api/saas/subscription", "DELETE")
      )) as MockRes;

      expect(res.status).toBe(401);
      expect(mockCancelSubscription).not.toHaveBeenCalled();
    });

    it("成功 → cancelSubscription 以 auth.tenantId 调用，返回 success + subscription(result)", async () => {
      mockCancelSubscription.mockResolvedValue(true);

      const res = (await DELETE(
        makeRequest("http://localhost/api/saas/subscription", "DELETE")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "订阅已取消，将在当前周期结束后失效",
        subscription: true,
      });
      expect(mockCancelSubscription).toHaveBeenCalledWith("tenant-1");
    });

    it("cancelSubscription 抛错 → 500", async () => {
      mockCancelSubscription.mockRejectedValue(new Error("cancel failed"));

      const res = (await DELETE(
        makeRequest("http://localhost/api/saas/subscription", "DELETE")
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "取消订阅失败" });
    });
  });

  describe("POST /api/saas/subscription", () => {
    it("未认证 → 401 透传，不触达 reactivateSubscription", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await POST(
        makeRequest("http://localhost/api/saas/subscription?action=resume", "POST")
      )) as MockRes;

      expect(res.status).toBe(401);
      expect(mockReactivateSubscription).not.toHaveBeenCalled();
    });

    it("?action=resume → reactivateSubscription 以 auth.tenantId 调用，返回 success + subscription(result)", async () => {
      mockReactivateSubscription.mockResolvedValue(true);

      const res = (await POST(
        makeRequest("http://localhost/api/saas/subscription?action=resume", "POST")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "订阅已恢复",
        subscription: true,
      });
      expect(mockReactivateSubscription).toHaveBeenCalledWith("tenant-1");
    });

    it("无 action → 400 未知操作，不触达 reactivateSubscription", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/saas/subscription", "POST")
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "未知操作" });
      expect(mockReactivateSubscription).not.toHaveBeenCalled();
    });

    it("未知 action（非 resume）→ 400 未知操作，不触达 reactivateSubscription", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/saas/subscription?action=upgrade", "POST")
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "未知操作" });
      expect(mockReactivateSubscription).not.toHaveBeenCalled();
    });

    it("?action=resume 且 reactivateSubscription 抛错 → 500", async () => {
      mockReactivateSubscription.mockRejectedValue(new Error("reactivate failed"));

      const res = (await POST(
        makeRequest("http://localhost/api/saas/subscription?action=resume", "POST")
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "操作订阅失败" });
    });
  });
});
