/**
 * system-logs 路由 handler 级集成测试
 *
 * 锁定 /api/system-logs 路由层（GET/POST）的安全与权限契约：
 *
 * 核心安全契约（GET）：系统日志是租户级管理数据，查询以 tenantId 单键作用域
 * （where 恒含 tenantId、绝不含 userId——与 access-history 的双键作用域不同），
 * 但访问受角色门控：仅 owner/admin 可读，member → 403。where 形状与 role 门控
 * 共同构成"按租户作用域 + 按角色授权"的分层契约，缺一即越权。
 *
 * 核心安全契约（POST）：内部日志写入不走 authenticateRequest，而以
 * x-internal-key 与 INTERNAL_API_KEY 环境变量做常量时间（timingSafeEqual）匹配。
 * 未配置 INTERNAL_API_KEY 或缺/错 key 均 fail-closed → 403，防任意未认证请求向
 * 任意租户/全局注入日志（污染审计、DoS 日志查询）。
 *
 *   - GET：
 *     · 未认证 401 透传，不触达 DB。
 *     · member 角色 → 403 { error: '没有权限查看系统日志' }，不触达 DB。
 *     · owner/admin → where 仅含 tenantId（无 userId），count 与 findMany 收到同一 where；
 *       findMany orderBy createdAt desc、skip/take 分页。
 *     · level/module/dateFrom/dateTo 过滤合并进 where；dateFrom+dateTo → createdAt 含
 *       gte 与 lte（均为 Date 实例）；dateFrom 单独 → createdAt 仅含 gte（spread-from-undefined）。
 *     · 分页默认 page=1/pageSize=20、pageSize 上限 100；count 抛错 500。
 *     · 返回 data 仅映射 id/level/module/message/details/createdAt（剥离 tenantId 等内部字段）。
 *   - POST：
 *     · INTERNAL_API_KEY 未配置 / 缺 x-internal-key / key 长度不同 / key 同长度内容不符
 *       → 均 403，不触达 create。
 *     · 缺 message → 400 { error: 'message is required' }。
 *     · 有效请求 → create data 含 level/module/message/details(JSON.stringify)/tenantId；
 *       body 缺 tenantId → data.tenantId = null；create 抛错 500。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route 的
 * vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 * 不 mock crypto——POST 的 timingSafeEqual 走真实实现以验证常量时间比较契约。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockSystemLogCount,
  mockSystemLogFindMany,
  mockSystemLogCreate,
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
    mockSystemLogCount: vi.fn(),
    mockSystemLogFindMany: vi.fn(),
    mockSystemLogCreate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    systemLog: {
      count: (...args: unknown[]) => mockSystemLogCount(...args),
      findMany: (...args: unknown[]) => mockSystemLogFindMany(...args),
      create: (...args: unknown[]) => mockSystemLogCreate(...args),
    },
  },
}));

import { GET, POST } from "@/app/api/system-logs/route";

// 默认 owner 身份（逐用例按需覆盖 role）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/system-logs${query}`;
  return new Request(url) as unknown as NextRequest;
}

function makePostRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost/api/system-logs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 一条 systemLog 记录（含 tenantId 内部字段，用于验证返回 data 是否剥离）
const logRecord = {
  id: "log-1",
  tenantId: "tenant-1",
  level: "error",
  module: "auth",
  message: "登录失败",
  details: '{"reason":"bad password"}',
  createdAt: "2026-06-29T00:00:00.000Z",
};

const INTERNAL_KEY = "test-internal-key-1234567890";

describe("/api/system-logs 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // POST 默认不配置 INTERNAL_API_KEY（GET 不依赖它）；POST 用例按需 stubEnv
    delete process.env.INTERNAL_API_KEY;
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  describe("GET /api/system-logs", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockSystemLogCount).not.toHaveBeenCalled();
      expect(mockSystemLogFindMany).not.toHaveBeenCalled();
    });

    it("member 角色 → 403 { error: '没有权限查看系统日志' }，不触达 DB（role 门控前置）", async () => {
      mockAuthenticate.mockResolvedValue({ ...ownerAuth, role: "member" });

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "没有权限查看系统日志" });
      expect(mockSystemLogCount).not.toHaveBeenCalled();
      expect(mockSystemLogFindMany).not.toHaveBeenCalled();
    });

    it("owner 默认（无过滤）→ where 仅含 tenantId（无 userId），count 与 findMany 收到同一 where；orderBy createdAt desc；分页 skip=0/take=20", async () => {
      mockSystemLogCount.mockResolvedValue(1);
      mockSystemLogFindMany.mockResolvedValue([logRecord]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      // 核心契约：where 仅 tenantId 单键作用域（系统日志是租户级，非用户级）
      const expectedWhere = { tenantId: "tenant-1" };
      expect(mockSystemLogCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
      expect(mockSystemLogFindMany.mock.calls[0][0]).toEqual({
        where: expectedWhere,
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      });
    });

    it("admin 角色 → 通过 role 门控（与 owner 同路径），不返回 403", async () => {
      mockAuthenticate.mockResolvedValue({ ...ownerAuth, role: "admin" });
      mockSystemLogCount.mockResolvedValue(0);
      mockSystemLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(mockSystemLogFindMany).toHaveBeenCalled();
    });

    it("level 过滤 → where 含 tenantId + level", async () => {
      mockSystemLogCount.mockResolvedValue(0);
      mockSystemLogFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?level=error"));

      expect(mockSystemLogCount.mock.calls[0][0]).toEqual({
        where: { tenantId: "tenant-1", level: "error" },
      });
      expect(mockSystemLogFindMany.mock.calls[0][0].where).toEqual({
        tenantId: "tenant-1",
        level: "error",
      });
    });

    it("module 过滤 → where 含 tenantId + module", async () => {
      mockSystemLogCount.mockResolvedValue(0);
      mockSystemLogFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?module=auth"));

      expect(mockSystemLogCount.mock.calls[0][0].where).toEqual({
        tenantId: "tenant-1",
        module: "auth",
      });
    });

    it("level + module 叠加 → where 同时含 tenantId + level + module", async () => {
      mockSystemLogCount.mockResolvedValue(0);
      mockSystemLogFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?level=warn&module=billing"));

      expect(mockSystemLogFindMany.mock.calls[0][0].where).toEqual({
        tenantId: "tenant-1",
        level: "warn",
        module: "billing",
      });
    });

    it("dateFrom + dateTo 同时 → where.createdAt 含 gte 与 lte（均为 Date 实例）", async () => {
      mockSystemLogCount.mockResolvedValue(0);
      mockSystemLogFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?dateFrom=2026-06-01&dateTo=2026-06-30"));

      const where = mockSystemLogFindMany.mock.calls[0][0].where as {
        tenantId: string;
        createdAt: { gte: Date; lte: Date };
      };
      expect(where.tenantId).toBe("tenant-1");
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lte).toBeInstanceOf(Date);
      expect(where.createdAt.gte.toISOString()).toBe(new Date("2026-06-01").toISOString());
      expect(where.createdAt.lte.toISOString()).toBe(new Date("2026-06-30").toISOString());
    });

    it("dateFrom 单独 → where.createdAt 仅含 gte（spread-from-undefined 行为锁定）", async () => {
      mockSystemLogCount.mockResolvedValue(0);
      mockSystemLogFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?dateFrom=2026-06-01"));

      const where = mockSystemLogFindMany.mock.calls[0][0].where as {
        tenantId: string;
        createdAt: { gte: Date };
      };
      expect(where.createdAt).toEqual({ gte: expect.any(Date) });
      expect(where.createdAt).not.toHaveProperty("lte");
    });

    it("分页 page=2&pageSize=2 → skip=2/take=2/totalPages/hasMore=true；pageSize 超上限截断为 100", async () => {
      mockSystemLogCount.mockResolvedValue(5);
      mockSystemLogFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockSystemLogFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(2);
      expect(findArg.take).toBe(2);
      const body = res.body as {
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(2);
      expect(body.totalPages).toBe(3);
      expect(body.hasMore).toBe(true);

      // pageSize 截断
      await GET(makeGetRequest("?pageSize=500"));
      const cappedArg = mockSystemLogFindMany.mock.calls[1][0] as { take: number };
      expect(cappedArg.take).toBe(100);
    });

    // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
    it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
      const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockSystemLogCount).not.toHaveBeenCalled();
      expect(mockSystemLogFindMany).not.toHaveBeenCalled();
    });

    it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
      const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockSystemLogCount).not.toHaveBeenCalled();
    });

    it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
      const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockSystemLogFindMany).not.toHaveBeenCalled();
    });

    it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
      const res = (await GET(makeGetRequest("?pageSize=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockSystemLogFindMany).not.toHaveBeenCalled();
    });

    it("member + page=abc → 403 而非 400（权限门控优先于分页校验，不泄漏校验细节）", async () => {
      mockAuthenticate.mockResolvedValue({ ...ownerAuth, role: "member" });

      const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "没有权限查看系统日志" });
      expect(mockSystemLogCount).not.toHaveBeenCalled();
    });

    it("默认分页 page=1/pageSize=20，total=0 → data 空 / totalPages=0 / hasMore=false", async () => {
      mockSystemLogCount.mockResolvedValue(0);
      mockSystemLogFindMany.mockResolvedValue([]);

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

    it("返回 data 仅映射 id/level/module/message/details/createdAt（剥离 tenantId 等内部字段）", async () => {
      mockSystemLogCount.mockResolvedValue(1);
      mockSystemLogFindMany.mockResolvedValue([logRecord]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as { data: Record<string, unknown>[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toEqual({
        id: "log-1",
        level: "error",
        module: "auth",
        message: "登录失败",
        details: '{"reason":"bad password"}',
        createdAt: "2026-06-29T00:00:00.000Z",
      });
      // 核心契约：返回体不泄漏 tenantId
      expect(body.data[0]).not.toHaveProperty("tenantId");
    });

    it("count 抛错 → 500 { error: '获取系统日志失败' }", async () => {
      mockSystemLogCount.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取系统日志失败" });
    });
  });

  describe("POST /api/system-logs", () => {
    it("INTERNAL_API_KEY 未配置 → 403 fail-closed，不触达 create", async () => {
      delete process.env.INTERNAL_API_KEY;

      const res = (await POST(
        makePostRequest({ message: "x" }, { "x-internal-key": "anything" })
      )) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: "未授权：内部日志写入需要有效的 x-internal-key",
      });
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it("缺 x-internal-key header → 403，不触达 create", async () => {
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;

      const res = (await POST(makePostRequest({ message: "x" }))) as MockRes;

      expect(res.status).toBe(403);
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it("x-internal-key 长度不同 → 403（短路由 short-circuit，不触达 create）", async () => {
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;

      const res = (await POST(
        makePostRequest({ message: "x" }, { "x-internal-key": "short" })
      )) as MockRes;

      expect(res.status).toBe(403);
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it("x-internal-key 同长度但内容不符 → 403（timingSafeEqual 返回 false），不触达 create", async () => {
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;
      // 同长度但内容不同
      const wrongKey = INTERNAL_KEY.slice(0, -1) + "X";

      const res = (await POST(
        makePostRequest({ message: "x" }, { "x-internal-key": wrongKey })
      )) as MockRes;

      expect(res.status).toBe(403);
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it("缺 message → 400 { error: 'message is required' }，不触达 create", async () => {
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;

      const res = (await POST(
        makePostRequest({ level: "info" }, { "x-internal-key": INTERNAL_KEY })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "message is required" });
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it("有效 + 完整 body → create data 含 level/module/message/details(JSON.stringify)/tenantId；返回 success", async () => {
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;
      mockSystemLogCreate.mockResolvedValue({});

      const res = (await POST(
        makePostRequest(
          {
            level: "warn",
            module: "billing",
            message: "扣费失败",
            details: { orderId: "ord-1" },
            tenantId: "tenant-9",
          },
          { "x-internal-key": INTERNAL_KEY }
        )
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "日志已记录" });
      expect(mockSystemLogCreate.mock.calls[0][0]).toEqual({
        data: {
          tenantId: "tenant-9",
          level: "warn",
          module: "billing",
          message: "扣费失败",
          details: JSON.stringify({ orderId: "ord-1" }),
        },
      });
    });

    it("body 缺省 level/module/details/tenantId → create data 以默认值落库（level=info/module=system/details=null/tenantId=null）", async () => {
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;
      mockSystemLogCreate.mockResolvedValue({});

      const res = (await POST(
        makePostRequest({ message: "hello" }, { "x-internal-key": INTERNAL_KEY })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockSystemLogCreate.mock.calls[0][0]).toEqual({
        data: {
          tenantId: null,
          level: "info",
          module: "system",
          message: "hello",
          details: null,
        },
      });
    });

    it("create 抛错 → 500 { error: '记录日志失败' }", async () => {
      process.env.INTERNAL_API_KEY = INTERNAL_KEY;
      mockSystemLogCreate.mockRejectedValue(new Error("db down"));

      const res = (await POST(
        makePostRequest({ message: "hello" }, { "x-internal-key": INTERNAL_KEY })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "记录日志失败" });
    });
  });
});
