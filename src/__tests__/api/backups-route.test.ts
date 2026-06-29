/**
 * backups 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/backups GET 路由层的分页校验、认证透传、权限与作用域契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - 非 owner/admin 角色 → 403 { error: '没有权限管理备份' }，不触达 count/findMany。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { error: 'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达 count/findMany。
 *     门控置于权限检查之后（403 优先于 400，不向无权用户泄漏校验细节），与
 *     api-keys/system-logs/invitations/webhooks/tenant-users 的 role 门控范式一致。
 *   - 成功 → count/findMany 以 { tenantId } 作用域（备份为租户级管理数据，无 userId
 *     过滤）；findMany orderBy { createdAt: 'desc' }、skip/take 分页；pageSize 上限 100；
 *     status 过滤合并进 where；返回 data 剥离 userId 等敏感字段；count 抛错 500。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route
 * 的 vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockBackupCount,
  mockBackupFindMany,
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
    mockBackupCount: vi.fn(),
    mockBackupFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    backup: {
      count: (...args: unknown[]) => mockBackupCount(...args),
      findMany: (...args: unknown[]) => mockBackupFindMany(...args),
    },
  },
}));

import { GET } from "@/app/api/backups/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/backups${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 一条备份记录（含 userId 字段，断言响应将其剥离）
const backupRecord = {
  id: "bk-1",
  tenantId: "tenant-1",
  userId: "user-1",
  name: "全量备份-20260629",
  type: "full",
  size: 1024000,
  fileCount: 42,
  status: "completed",
  error: null,
  createdAt: "2026-06-29T00:00:00.000Z",
  completedAt: "2026-06-29T01:00:00.000Z",
};

describe("/api/backups 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockBackupCount.mockResolvedValue(1);
    mockBackupFindMany.mockResolvedValue([backupRecord]);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockBackupCount).not.toHaveBeenCalled();
    expect(mockBackupFindMany).not.toHaveBeenCalled();
  });

  it("member 角色 → 403，不触达 count/findMany", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-2",
      email: "member@example.com",
      tenantId: "tenant-1",
      role: "member",
    });

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限管理备份" });
    expect(mockBackupCount).not.toHaveBeenCalled();
    expect(mockBackupFindMany).not.toHaveBeenCalled();
  });

  it("成功（默认分页）→ 200，count/findMany 以 { tenantId } 作用域（无 userId，租户级），skip=0/take=20，data 剥离 userId", async () => {
    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    const expectedWhere = { tenantId: "tenant-1" };
    expect(mockBackupCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
    const findArg = mockBackupFindMany.mock.calls[0][0] as {
      where: { tenantId: string };
      orderBy: unknown;
      skip: number;
      take: number;
    };
    expect(findArg.where).toEqual(expectedWhere);
    expect(findArg.orderBy).toEqual({ createdAt: "desc" });
    expect(findArg.skip).toBe(0);
    expect(findArg.take).toBe(20);

    const body = res.body as {
      data: Array<Record<string, unknown>>;
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasMore: boolean;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "bk-1",
      name: "全量备份-20260629",
      status: "completed",
      fileCount: 42,
    });
    // 响应剥离 userId（即使 DB 行带 userId）
    expect(body.data[0]).not.toHaveProperty("userId");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.totalPages).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("分页 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
    mockBackupCount.mockResolvedValue(5);
    mockBackupFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockBackupFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArg.skip).toBe(2);
    expect(findArg.take).toBe(2);
    const body = res.body as { totalPages: number; hasMore: boolean; page: number; pageSize: number };
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize 超过上限被截断为 100", async () => {
    mockBackupCount.mockResolvedValue(0);
    mockBackupFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockBackupFindMany.mock.calls[0][0] as { take: number };
    expect(findArg.take).toBe(100);
  });

  it("status 过滤 → where.status", async () => {
    mockBackupCount.mockResolvedValue(0);
    mockBackupFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?status=completed"));

    expect(mockBackupFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-1",
      status: "completed",
    });
  });

  // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockBackupCount).not.toHaveBeenCalled();
    expect(mockBackupFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockBackupCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockBackupFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = (await GET(makeGetRequest("?pageSize=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockBackupFindMany).not.toHaveBeenCalled();
  });

  it("member + page=abc → 403 而非 400（权限门控优先于分页校验，不泄漏校验细节）", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-2",
      email: "member@example.com",
      tenantId: "tenant-1",
      role: "member",
    });

    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限管理备份" });
    expect(mockBackupCount).not.toHaveBeenCalled();
  });

  it("count 抛错 → 500 { error: '获取备份列表失败' }", async () => {
    mockBackupCount.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取备份列表失败" });
  });
});
