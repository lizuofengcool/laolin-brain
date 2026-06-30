/**
 * admin/tenants 路由 handler 级集成测试
 *
 * 锁定 /api/admin/tenants GET 的安全与控制流契约：
 *
 *   - 非 platform admin → requirePlatformAdmin 返回 403 透传，不触达 getTenantList
 *   - 默认分页 page=1/pageSize=20 → getTenantList(1, 20, { status, plan, search } 全 undefined)
 *   - ?page=2&pageSize=5&status=active&plan=pro&search=acme → 全部透传 getTenantList
 *   - ?pageSize=500 → 截断为 100（Math.min(100, pageSizeRaw)）
 *   - **分页参数校验（本轮修复锁定）**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400，
 *     不触达 getTenantList。原 page/pageSize 无守卫直接透传 getTenantList → db.tenant.findMany
 *     → Prisma skip:(NaN-1)*pageSize / take:NaN 的未定义行为（被 catch 吞为 500），
 *     本轮改为前置 isNaN||<1 → 400 + Math.min(100,...) cap。与 admin/orders/billing-orders 约定一致。
 *   - getTenantList 抛错 → 500 { error: '获取租户列表失败' }
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/admin/admin-service，复用 vi.hoisted 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockRequirePlatformAdmin,
  mockGetTenantList,
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
    mockRequirePlatformAdmin: vi.fn(),
    mockGetTenantList: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  requirePlatformAdmin: (...args: unknown[]) => mockRequirePlatformAdmin(...args),
}));
vi.mock("@/lib/admin/admin-service", () => ({
  getTenantList: (...args: unknown[]) => mockGetTenantList(...args),
  updateTenantStatus: vi.fn(),
  updateTenantPlan: vi.fn(),
}));

import { GET } from "@/app/api/admin/tenants/route";

function makeRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/admin/tenants${query}`) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleResult = {
  tenants: [{ id: "t-1", name: "Acme", plan: "pro", status: "active", userCount: 5 }],
  total: 1,
  page: 1,
  pageSize: 20,
};

describe("/api/admin/tenants 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformAdmin.mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      tenantId: "platform",
      role: "platform_admin",
    });
    mockGetTenantList.mockResolvedValue(sampleResult);
  });

  describe("GET /api/admin/tenants", () => {
    it("非 platform admin → 403 透传，不触达 getTenantList", async () => {
      mockRequirePlatformAdmin.mockResolvedValue(
        MockNextResponse.json({ error: "需要平台管理员权限" }, { status: 403 })
      );

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "需要平台管理员权限" });
      expect(mockGetTenantList).not.toHaveBeenCalled();
    });

    it("默认分页 page=1/pageSize=20 → getTenantList(1, 20, { 全 undefined })", async () => {
      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetTenantList).toHaveBeenCalledWith(1, 20, {
        status: undefined,
        plan: undefined,
        search: undefined,
      });
      expect(res.body).toEqual(sampleResult);
    });

    it("?page=2&pageSize=5&status=active&plan=pro&search=acme → 全部透传 getTenantList", async () => {
      const res = (await GET(
        makeRequest("?page=2&pageSize=5&status=active&plan=pro&search=acme")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetTenantList).toHaveBeenCalledWith(2, 5, {
        status: "active",
        plan: "pro",
        search: "acme",
      });
    });

    it("?pageSize=500 → 截断为 100（Math.min(100, pageSizeRaw)）", async () => {
      const res = (await GET(makeRequest("?pageSize=500"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetTenantList).toHaveBeenCalledWith(
        1,
        100,
        { status: undefined, plan: undefined, search: undefined }
      );
    });

    // ─── 分页参数 NaN/非正数 → 400（本轮修复锁定，防 NaN 透传 getTenantList → Prisma skip/take）───
    it("?page=abc → 400 { error: 'page 必须 >= 1' }，不触达 getTenantList", async () => {
      const res = (await GET(makeRequest("?page=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockGetTenantList).not.toHaveBeenCalled();
    });

    it("?page=0 → 400（page<1）", async () => {
      const res = (await GET(makeRequest("?page=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockGetTenantList).not.toHaveBeenCalled();
    });

    it("?pageSize=abc → 400 { error: 'pageSize 必须为正整数' }，不触达 getTenantList", async () => {
      const res = (await GET(makeRequest("?pageSize=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockGetTenantList).not.toHaveBeenCalled();
    });

    it("?pageSize=-5 → 400（负数，防 take:-5 透传 Prisma）", async () => {
      const res = (await GET(makeRequest("?pageSize=-5"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockGetTenantList).not.toHaveBeenCalled();
    });

    it("getTenantList 抛错 → 500 { error: '获取租户列表失败' }", async () => {
      mockGetTenantList.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取租户列表失败" });
    });
  });
});
