/**
 * activity-logs 路由 handler 级集成测试
 *
 * 锁定 /api/activity-logs GET 路由层的安全与权限契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - 普通用户（member/viewer 等非 admin/owner）→ 仅能看自己的日志：
 *     count/findMany 的 where 必须同时含 tenantId 与 userId（防 member 越权读他人日志、
 *     防多租户越权）。
 *   - 管理员（admin/owner）→ 看租户全部日志：where 仅含 tenantId，不带 userId 过滤。
 *   - 过滤器 action / resourceType / dateFrom / dateTo 正确合并进 where（dateFrom+dateTo
 *     同时存在时 where.createdAt 含 gte+lte）。
 *   - 分页：默认 page=1/pageSize=20；page=2&pageSize=2&total=5 → skip=2/take=2/
 *     totalPages=3/hasMore=true；pageSize 超过上限被截断为 100。
 *   - count 抛错 → 500 { error: '获取活动日志失败' }。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route 的
 * vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockActivityLogCount,
  mockActivityLogFindMany,
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
    mockActivityLogCount: vi.fn(),
    mockActivityLogFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    activityLog: {
      count: (...args: unknown[]) => mockActivityLogCount(...args),
      findMany: (...args: unknown[]) => mockActivityLogFindMany(...args),
    },
  },
}));

import { GET } from "@/app/api/activity-logs/route";

// 默认 owner 身份（逐用例按需覆盖）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/activity-logs${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/activity-logs 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  describe("GET /api/activity-logs", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockActivityLogCount).not.toHaveBeenCalled();
      expect(mockActivityLogFindMany).not.toHaveBeenCalled();
    });

    it("member 角色 → 仅看自己的日志：count/findMany 的 where 同时含 tenantId 与 userId", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });
      mockActivityLogCount.mockResolvedValue(1);
      mockActivityLogFindMany.mockResolvedValue([
        {
          id: "log-1",
          tenantId: "tenant-1",
          userId: "user-2",
          action: "login",
          resourceType: "user",
          resourceId: "user-2",
          details: null,
          ipAddress: "127.0.0.1",
          userAgent: "test",
          createdAt: "2026-06-29T00:00:00.000Z",
        },
      ]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      // 核心安全契约：member 的 where 必须同时含 tenantId 与 userId（防越权读他人日志）
      expect(mockActivityLogCount).toHaveBeenCalledTimes(1);
      expect(mockActivityLogCount.mock.calls[0][0]).toEqual({
        where: { tenantId: "tenant-1", userId: "user-2" },
      });
      expect(mockActivityLogFindMany).toHaveBeenCalledTimes(1);
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as {
        where: { tenantId: string; userId: string };
        orderBy: unknown;
        skip: number;
        take: number;
      };
      expect(findArg.where).toEqual({ tenantId: "tenant-1", userId: "user-2" });
      expect(findArg.orderBy).toEqual({ createdAt: "desc" });
      expect(findArg.skip).toBe(0);
      expect(findArg.take).toBe(20);
    });

    it("admin 角色 → 看租户全部日志：where 仅含 tenantId，不带 userId 过滤", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-admin",
        email: "admin@example.com",
        tenantId: "tenant-1",
        role: "admin",
      });
      mockActivityLogCount.mockResolvedValue(3);
      mockActivityLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(mockActivityLogCount.mock.calls[0][0]).toEqual({
        where: { tenantId: "tenant-1" },
      });
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(findArg.where).toEqual({ tenantId: "tenant-1" });
      expect(findArg.where).not.toHaveProperty("userId");
    });

    it("owner 角色 + action/resourceType 过滤 → where 合并 action 与 resourceType（仍以 tenantId 作用域）", async () => {
      mockActivityLogCount.mockResolvedValue(2);
      mockActivityLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?action=create&resourceType=file"))) as MockRes;

      expect(res.status).toBe(200);
      const expectedWhere = {
        tenantId: "tenant-1",
        action: "create",
        resourceType: "file",
      };
      expect(mockActivityLogCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findArg.where).toEqual(expectedWhere);
    });

    it("dateFrom + dateTo 同时存在 → where.createdAt 含 gte 与 lte（Date 实例）", async () => {
      mockActivityLogCount.mockResolvedValue(0);
      mockActivityLogFindMany.mockResolvedValue([]);

      const res = (await GET(
        makeGetRequest("?dateFrom=2026-06-01&dateTo=2026-06-30")
      )) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as {
        where: { tenantId: string; createdAt: { gte: Date; lte: Date } };
      };
      expect(findArg.where.tenantId).toBe("tenant-1");
      expect(findArg.where.createdAt.gte).toBeInstanceOf(Date);
      expect(findArg.where.createdAt.lte).toBeInstanceOf(Date);
      expect(findArg.where.createdAt.gte.toISOString()).toBe(new Date("2026-06-01").toISOString());
      expect(findArg.where.createdAt.lte.toISOString()).toBe(new Date("2026-06-30").toISOString());
    });

    it("member 角色 + action 过滤 → where 同时含 tenantId/userId/action（member 作用域与业务过滤叠加）", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });
      mockActivityLogCount.mockResolvedValue(1);
      mockActivityLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?action=download"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockActivityLogCount.mock.calls[0][0]).toEqual({
        where: { tenantId: "tenant-1", userId: "user-2", action: "download" },
      });
    });

    it("分页 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
      mockActivityLogCount.mockResolvedValue(5);
      mockActivityLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(2);
      expect(findArg.take).toBe(2);
      const body = res.body as {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      expect(body.total).toBe(5);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(2);
      expect(body.totalPages).toBe(3);
      expect(body.hasMore).toBe(true);
    });

    it("pageSize 超过上限被截断为 100", async () => {
      mockActivityLogCount.mockResolvedValue(0);
      mockActivityLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as { take: number };
      expect(findArg.take).toBe(100);
    });

    it("默认分页 page=1/pageSize=20，total=0 → data 空 / totalPages=0 / hasMore=false", async () => {
      mockActivityLogCount.mockResolvedValue(0);
      mockActivityLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as {
        data: unknown[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      expect(body.data).toEqual([]);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.totalPages).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it("count 抛错 → 500 { error: '获取活动日志失败' }", async () => {
      mockActivityLogCount.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取活动日志失败" });
    });
  });
});
