/**
 * user/security/login-logs 路由 handler 级集成测试
 *
 * 锁定 /api/user/security/login-logs GET 的安全与控制流契约：
 *
 *   - 未认证 → 401 透传，不触达 DB
 *   - 默认分页 page=1/pageSize=20 → activityLog.findMany skip:0/take:20，
 *     where 以 auth.userId 作用域（action:'login'），忽略 query 中的 userId/tenantId 注入
 *   - ?page=2&pageSize=5 → skip:5/take:5；?pageSize=500 → 截断为 100
 *   - **分页参数校验（本轮修复锁定）**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400，
 *     不触达 DB。原 pageSize=Math.min(100, parseInt(...)) 中 Math.min(100,NaN)=NaN 会透传
 *     Prisma skip/take（被 catch 吞为 500），本轮改为前置 isNaN||<1 → 400 + Math.min(100,...) cap。
 *     与 access-history/comments/billing-orders 等约定一致。
 *   - findMany 抛错 → 500 { error: '获取登录日志失败' }
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用 vi.hoisted 共享 MockNextResponse 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockActivityLogFindMany,
  mockActivityLogCount,
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
    mockActivityLogFindMany: vi.fn(),
    mockActivityLogCount: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    activityLog: {
      findMany: (...args: unknown[]) => mockActivityLogFindMany(...args),
      count: (...args: unknown[]) => mockActivityLogCount(...args),
    },
  },
}));

import { GET } from "@/app/api/user/security/login-logs/route";

function makeRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/user/security/login-logs${query}`) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleLog = {
  id: "log-1",
  action: "login",
  ipAddress: "127.0.0.1",
  userAgent: "curl/8",
  details: JSON.stringify({ ok: true }),
  createdAt: new Date("2026-06-29T00:00:00Z"),
};

describe("/api/user/security/login-logs 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockActivityLogFindMany.mockResolvedValue([sampleLog]);
    mockActivityLogCount.mockResolvedValue(1);
  });

  describe("GET /api/user/security/login-logs", () => {
    it("未认证 → 401 透传，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockActivityLogFindMany).not.toHaveBeenCalled();
      expect(mockActivityLogCount).not.toHaveBeenCalled();
    });

    it("默认分页 page=1/pageSize=20 → findMany skip:0/take:20，where 以 auth.userId 作用域", async () => {
      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(mockActivityLogFindMany.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", action: "login" },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      });
      expect(mockActivityLogCount.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", action: "login" },
      });
      const body = res.body as { data: unknown[]; total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean };
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.totalPages).toBe(1);
      expect(body.hasMore).toBe(false);
      // details 字符串被 JSON.parse 还原
      const entry = body.data[0] as { details: { ok: boolean } };
      expect(entry.details).toEqual({ ok: true });
    });

    it("?page=2&pageSize=5 → skip:5/take:5", async () => {
      const res = (await GET(makeRequest("?page=2&pageSize=5"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(5);
      expect(findArg.take).toBe(5);
      const body = res.body as { page: number; pageSize: number };
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(5);
    });

    it("?pageSize=500 → 截断为 100（Math.min(100, pageSizeRaw)）", async () => {
      const res = (await GET(makeRequest("?pageSize=500"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as { take: number };
      expect(findArg.take).toBe(100);
    });

    it("query 带 userId/tenantId → 仍以 auth.userId 作用域（忽略 query 注入）", async () => {
      const res = (await GET(makeRequest("?userId=user-evil&tenantId=tenant-evil"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockActivityLogFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findArg.where).toEqual({ userId: "user-1", action: "login" });
    });

    // ─── 分页参数 NaN/非正数 → 400（本轮修复锁定，防 Math.min(100,NaN)=NaN 透传 Prisma skip/take）───
    it("?page=abc → 400 { error: 'page 必须 >= 1' }，不触达 DB", async () => {
      const res = (await GET(makeRequest("?page=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockActivityLogFindMany).not.toHaveBeenCalled();
      expect(mockActivityLogCount).not.toHaveBeenCalled();
    });

    it("?page=0 → 400（page<1）", async () => {
      const res = (await GET(makeRequest("?page=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockActivityLogFindMany).not.toHaveBeenCalled();
    });

    it("?pageSize=abc → 400 { error: 'pageSize 必须为正整数' }，不触达 DB（Math.min(100,NaN) 仍为 NaN）", async () => {
      const res = (await GET(makeRequest("?pageSize=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockActivityLogFindMany).not.toHaveBeenCalled();
      expect(mockActivityLogCount).not.toHaveBeenCalled();
    });

    it("?pageSize=-5 → 400（负数，防 take:-5 透传 Prisma）", async () => {
      const res = (await GET(makeRequest("?pageSize=-5"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockActivityLogFindMany).not.toHaveBeenCalled();
    });

    it("findMany 抛错 → 500 { error: '获取登录日志失败' }", async () => {
      mockActivityLogFindMany.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取登录日志失败" });
    });
  });
});
