/**
 * saas/tenant 路由 handler 级集成测试
 *
 * 锁定 /api/saas/tenant GET handler 的安全与控制流契约：
 *   - 未认证 → 401 透传，不触达任一 tenant 服务
 *   - 成功 → 依次顺序 await getTenant / checkTenantStatus / getCurrentSubscription，三者均以
 *     auth.tenantId 调用（租户作用域，忽略 query 中的 tenantId/userId），返回聚合对象
 *     { tenant, status, subscription }
 *   - getTenant 返回 null → 404 { error: '租户不存在' }，且因顺序 await + 提前 return，
 *     checkTenantStatus / getCurrentSubscription 不触达（short-circuit，不为不存在租户查状态/订阅）
 *   - getTenant / checkTenantStatus / getCurrentSubscription 任一抛错 → 500
 *     { error: '获取租户信息失败' }，且前序服务抛错时后续服务因顺序 await 不触达
 *
 * Mock 策略：authenticateRequest / tenant.service / next/server 全部隔离，不触达真实数据库。
 * 路由经服务层访问数据（无直接 db 依赖），故无需 mock @/lib/db。复用 saas-subscription-route
 * 的 vi.hoisted + MockNextResponse 范式。注意 getCurrentSubscription 在本路由从
 * @/lib/saas/tenant.service 导入（与 subscription 路由同源），非 billing.service。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetTenant,
  mockCheckTenantStatus,
  mockGetCurrentSubscription,
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
    mockGetTenant: vi.fn(),
    mockCheckTenantStatus: vi.fn(),
    mockGetCurrentSubscription: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/saas/tenant.service", () => ({
  getTenant: (...args: unknown[]) => mockGetTenant(...args),
  checkTenantStatus: (...args: unknown[]) => mockCheckTenantStatus(...args),
  getCurrentSubscription: (...args: unknown[]) => mockGetCurrentSubscription(...args),
}));

import { GET } from "@/app/api/saas/tenant/route";

function makeRequest(url: string, method: string = "GET"): NextRequest {
  return new Request(url, { method }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const FIXED_END = new Date("2026-07-15T00:00:00Z");

describe("saas/tenant 路由", () => {
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

  describe("GET /api/saas/tenant", () => {
    it("未认证 → 401 透传，不触达任一 tenant 服务", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest("http://localhost/api/saas/tenant"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetTenant).not.toHaveBeenCalled();
      expect(mockCheckTenantStatus).not.toHaveBeenCalled();
      expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
    });

    it("成功 → 三服务均以 auth.tenantId 调用，返回聚合对象 { tenant, status, subscription }", async () => {
      const tenant = {
        id: "tenant-1",
        name: "Acme Inc",
        plan: "pro",
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      };
      const status = { active: true, plan: "pro", currentPeriodEnd: FIXED_END };
      const subscription = {
        id: "sub-1",
        tenantId: "tenant-1",
        plan: "pro",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: FIXED_END,
      };
      mockGetTenant.mockResolvedValue(tenant);
      mockCheckTenantStatus.mockResolvedValue(status);
      mockGetCurrentSubscription.mockResolvedValue(subscription);

      // query 带他租户 tenantId/userId —— 路由须忽略，用 auth.tenantId
      const res = (await GET(
        makeRequest("http://localhost/api/saas/tenant?tenantId=tenant-evil&userId=user-evil")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tenant, status, subscription });
      // 三服务均以 auth.tenantId 调用（忽略 query 的 tenantId/userId）
      expect(mockGetTenant).toHaveBeenCalledWith("tenant-1");
      expect(mockCheckTenantStatus).toHaveBeenCalledWith("tenant-1");
      expect(mockGetCurrentSubscription).toHaveBeenCalledWith("tenant-1");
    });

    it("getTenant 返回 null → 404 租户不存在，后续两服务因 short-circuit 不触达", async () => {
      mockGetTenant.mockResolvedValue(null);

      const res = (await GET(makeRequest("http://localhost/api/saas/tenant"))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "租户不存在" });
      expect(mockGetTenant).toHaveBeenCalledWith("tenant-1");
      // 关键：租户不存在时提前 return 404，不为不存在租户查状态/订阅
      expect(mockCheckTenantStatus).not.toHaveBeenCalled();
      expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
    });

    it("getTenant 抛错 → 500 获取租户信息失败，后续两服务不触达", async () => {
      mockGetTenant.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest("http://localhost/api/saas/tenant"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取租户信息失败" });
      expect(mockCheckTenantStatus).not.toHaveBeenCalled();
      expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
    });

    it("checkTenantStatus 抛错 → 500，getCurrentSubscription 不触达", async () => {
      mockGetTenant.mockResolvedValue({ id: "tenant-1", name: "Acme", plan: "pro" });
      mockCheckTenantStatus.mockRejectedValue(new Error("status check failed"));

      const res = (await GET(makeRequest("http://localhost/api/saas/tenant"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取租户信息失败" });
      expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
    });

    it("getCurrentSubscription 抛错 → 500", async () => {
      mockGetTenant.mockResolvedValue({ id: "tenant-1", name: "Acme", plan: "pro" });
      mockCheckTenantStatus.mockResolvedValue({ active: true, plan: "pro" });
      mockGetCurrentSubscription.mockRejectedValue(new Error("sub fetch failed"));

      const res = (await GET(makeRequest("http://localhost/api/saas/tenant"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取租户信息失败" });
    });
  });
});
