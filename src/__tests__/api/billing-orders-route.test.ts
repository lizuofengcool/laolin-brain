/**
 * billing/orders 路由 handler 级集成测试
 *
 * 锁定 /api/billing/orders GET 的安全与控制流契约：
 *
 *   - 未认证 → 401 透传，不触达 DB
 *   - 默认分页 page=1/pageSize=20 → order.findMany skip:0/take:20，
 *     where 以 auth.tenantId 作用域（status 未传或 'all' 时不并入 where）
 *   - ?page=2&pageSize=5 → skip:5/take:5；?pageSize=500 → 截断为 100
 *   - ?status=paid → where 含 status:'paid'；?status=all → 不并入 where（与未传等价）
 *   - query 带 tenantId → 仍以 auth.tenantId 作用域（忽略 query 注入）
 *   - **分页参数校验（本轮修复锁定）**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400，
 *     不触达 DB。原 page/pageSize 无守卫直接透传 db.order.findMany → Prisma skip/take 的未定义行为
 *     （被 catch 吞为 500），本轮改为前置 isNaN||<1 → 400 + Math.min(100,...) cap。
 *     与 admin/tenants/admin/orders 约定一致。
 *   - findMany 抛错 → 500 { error: '获取订单列表失败' }
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db / @/lib/billing/subscription（路由顶部
 * import { getOrders } 但 GET 未使用，mock 为 vi.fn 以避免模块加载副作用），复用 vi.hoisted 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockOrderFindMany,
  mockOrderCount,
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
    mockOrderFindMany: vi.fn(),
    mockOrderCount: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
      count: (...args: unknown[]) => mockOrderCount(...args),
    },
  },
}));
vi.mock("@/lib/billing/subscription", () => ({
  getOrders: vi.fn(),
}));

import { GET } from "@/app/api/billing/orders/route";

function makeRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/billing/orders${query}`) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleOrder = {
  id: "o-1",
  orderNo: "NO123",
  tenantId: "tenant-1",
  status: "paid",
  amount: 9900,
  createdAt: new Date("2026-06-29T00:00:00Z"),
};

describe("/api/billing/orders 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockOrderFindMany.mockResolvedValue([sampleOrder]);
    mockOrderCount.mockResolvedValue(1);
  });

  describe("GET /api/billing/orders", () => {
    it("未认证 → 401 透传，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockOrderFindMany).not.toHaveBeenCalled();
      expect(mockOrderCount).not.toHaveBeenCalled();
    });

    it("默认分页 page=1/pageSize=20 → findMany skip:0/take:20，where 仅 tenantId（status 缺省）", async () => {
      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(mockOrderFindMany.mock.calls[0][0]).toEqual({
        where: { tenantId: "tenant-1" },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      });
      expect(mockOrderCount.mock.calls[0][0]).toEqual({ where: { tenantId: "tenant-1" } });
      const body = res.body as { orders: unknown[]; total: number; page: number; pageSize: number; totalPages: number };
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.totalPages).toBe(1);
    });

    it("?page=2&pageSize=5 → skip:5/take:5", async () => {
      const res = (await GET(makeRequest("?page=2&pageSize=5"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockOrderFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(5);
      expect(findArg.take).toBe(5);
    });

    it("?pageSize=500 → 截断为 100（Math.min(100, pageSizeRaw)）", async () => {
      const res = (await GET(makeRequest("?pageSize=500"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockOrderFindMany.mock.calls[0][0] as { take: number };
      expect(findArg.take).toBe(100);
    });

    it("?status=paid → where 含 status:'paid'", async () => {
      const res = (await GET(makeRequest("?status=paid"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockOrderFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findArg.where).toEqual({ tenantId: "tenant-1", status: "paid" });
    });

    it("?status=all → 不并入 where（与未传等价）", async () => {
      const res = (await GET(makeRequest("?status=all"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockOrderFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findArg.where).toEqual({ tenantId: "tenant-1" });
    });

    it("query 带 tenantId → 仍以 auth.tenantId 作用域（忽略 query 注入）", async () => {
      const res = (await GET(makeRequest("?tenantId=tenant-evil"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockOrderFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findArg.where).toEqual({ tenantId: "tenant-1" });
    });

    // ─── 分页参数 NaN/非正数 → 400（本轮修复锁定，防 NaN 透传 Prisma skip/take）───
    it("?page=abc → 400 { error: 'page 必须 >= 1' }，不触达 DB", async () => {
      const res = (await GET(makeRequest("?page=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockOrderFindMany).not.toHaveBeenCalled();
      expect(mockOrderCount).not.toHaveBeenCalled();
    });

    it("?page=0 → 400（page<1）", async () => {
      const res = (await GET(makeRequest("?page=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockOrderFindMany).not.toHaveBeenCalled();
    });

    it("?pageSize=abc → 400 { error: 'pageSize 必须为正整数' }，不触达 DB", async () => {
      const res = (await GET(makeRequest("?pageSize=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockOrderFindMany).not.toHaveBeenCalled();
      expect(mockOrderCount).not.toHaveBeenCalled();
    });

    it("?pageSize=-5 → 400（负数，防 take:-5 透传 Prisma）", async () => {
      const res = (await GET(makeRequest("?pageSize=-5"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockOrderFindMany).not.toHaveBeenCalled();
    });

    it("findMany 抛错 → 500 { error: '获取订单列表失败' }", async () => {
      mockOrderFindMany.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取订单列表失败" });
    });
  });
});
