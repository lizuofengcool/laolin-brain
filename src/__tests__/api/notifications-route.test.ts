/**
 * notifications 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/notifications GET 路由层的分页校验、认证透传与作用域契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { error: 'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达 count/findMany。
 *     通知为个人级数据（无 role 门控，按 userId+tenantId 双键作用域），门控直接置于
 *     解析后。与 files/storage/tags 及 cloud-sync/queue 的 isNaN||<1 → 400 约定一致。
 *   - 成功 → count/findMany 以 { userId, tenantId } 双键作用域（防跨租户/跨用户越权）；
 *     findMany orderBy createdAt desc、skip/take 分页；pageSize 上限 100；type/unreadOnly
 *     过滤合并进 where；count 抛错 500。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route
 * 的 vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockNotificationCount,
  mockNotificationFindMany,
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
    mockNotificationCount: vi.fn(),
    mockNotificationFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    notification: {
      count: (...args: unknown[]) => mockNotificationCount(...args),
      findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
    },
  },
}));

import { GET } from "@/app/api/notifications/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/notifications${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const notificationRecord = {
  id: "ntf-1",
  tenantId: "tenant-1",
  userId: "user-1",
  type: "system",
  title: "欢迎使用",
  content: "系统已就绪",
  isRead: false,
  readAt: null,
  createdAt: "2026-06-29T00:00:00.000Z",
};

describe("/api/notifications 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockNotificationCount.mockResolvedValue(1);
    mockNotificationFindMany.mockResolvedValue([notificationRecord]);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockNotificationCount).not.toHaveBeenCalled();
    expect(mockNotificationFindMany).not.toHaveBeenCalled();
  });

  it("成功（默认分页）→ 200，count/findMany 以 { userId, tenantId } 双键作用域，skip=0/take=20", async () => {
    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    const expectedWhere = { userId: "user-1", tenantId: "tenant-1" };
    expect(mockNotificationCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
    const findArg = mockNotificationFindMany.mock.calls[0][0] as {
      where: unknown;
      orderBy: unknown;
      skip: number;
      take: number;
    };
    expect(findArg.where).toEqual(expectedWhere);
    expect(findArg.orderBy).toEqual({ createdAt: "desc" });
    expect(findArg.skip).toBe(0);
    expect(findArg.take).toBe(20);

    const body = res.body as {
      data: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasMore: boolean;
    };
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.totalPages).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("分页 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
    mockNotificationCount.mockResolvedValue(5);
    mockNotificationFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockNotificationFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArg.skip).toBe(2);
    expect(findArg.take).toBe(2);
    const body = res.body as { totalPages: number; hasMore: boolean; page: number; pageSize: number };
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize 超过上限被截断为 100", async () => {
    mockNotificationCount.mockResolvedValue(0);
    mockNotificationFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockNotificationFindMany.mock.calls[0][0] as { take: number };
    expect(findArg.take).toBe(100);
  });

  it("type 过滤 → where 含 type", async () => {
    mockNotificationCount.mockResolvedValue(0);
    mockNotificationFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?type=mention"));

    expect(mockNotificationFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      type: "mention",
    });
  });

  it("unreadOnly=true → where.isRead=false", async () => {
    mockNotificationCount.mockResolvedValue(0);
    mockNotificationFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?unreadOnly=true"));

    expect(mockNotificationFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      isRead: false,
    });
  });

  // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockNotificationCount).not.toHaveBeenCalled();
    expect(mockNotificationFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockNotificationCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockNotificationFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = (await GET(makeGetRequest("?pageSize=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockNotificationFindMany).not.toHaveBeenCalled();
  });

  it("count 抛错 → 500 { error: '获取通知列表失败' }", async () => {
    mockNotificationCount.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取通知列表失败" });
  });
});
