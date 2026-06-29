/**
 * faces/groups 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/faces/groups GET 路由层的分页校验、认证透传与作用域契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { error: 'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达 count/findMany。
 *     人脸分组为个人级数据（无 role 门控，按 userId+tenantId 双键作用域），门控直接
 *     置于解析后。与 files/storage/tags/comments/notifications 的 isNaN||<1 → 400 约定一致。
 *   - 成功 → count/findMany 以 { userId, tenantId } 双键作用域（防跨租户/跨用户越权）；
 *     findMany include faces（select fileId, take 100）；默认 pageSize=50；sortBy 默认
 *     'photoCount' 时 orderBy 回退为 { createdAt: 'desc' }，结果在 JS 层按 photoCount/faceCount
 *     重排；pageSize 上限 100；count 抛错 500。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route
 * 的 vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGroupCount,
  mockGroupFindMany,
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
    mockGroupCount: vi.fn(),
    mockGroupFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    faceGroup: {
      count: (...args: unknown[]) => mockGroupCount(...args),
      findMany: (...args: unknown[]) => mockGroupFindMany(...args),
    },
  },
}));

import { GET } from "@/app/api/faces/groups/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/faces/groups${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 一条分组记录（faces 含两条记录但同属一个 fileId → photoCount=1 / faceCount=2，覆盖去重逻辑）
const groupRecord = {
  id: "grp-1",
  tenantId: "tenant-1",
  userId: "user-1",
  name: "人物A",
  thumbnail: "https://example.com/t.png",
  faces: [{ fileId: "file-1" }, { fileId: "file-1" }],
  createdAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-29T00:00:00.000Z",
};

describe("/api/faces/groups 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockGroupCount.mockResolvedValue(1);
    mockGroupFindMany.mockResolvedValue([groupRecord]);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockGroupCount).not.toHaveBeenCalled();
    expect(mockGroupFindMany).not.toHaveBeenCalled();
  });

  it("成功（默认分页）→ 200，count/findMany 以 { userId, tenantId } 双键作用域，skip=0/take=50，data 含 faceCount/photoCount 去重计算", async () => {
    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    const expectedWhere = { userId: "user-1", tenantId: "tenant-1" };
    expect(mockGroupCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
    const findArg = mockGroupFindMany.mock.calls[0][0] as {
      where: unknown;
      skip: number;
      take: number;
      include: unknown;
      orderBy: unknown;
    };
    expect(findArg.where).toEqual(expectedWhere);
    // sortBy 默认 'photoCount' → orderBy 回退 { createdAt: 'desc' }
    expect(findArg.orderBy).toEqual({ createdAt: "desc" });
    expect(findArg.skip).toBe(0);
    // 默认 pageSize=50
    expect(findArg.take).toBe(50);
    expect(findArg.include).toEqual({
      faces: { select: { fileId: true }, take: 100 },
    });

    const body = res.body as {
      data: Array<Record<string, unknown>>;
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasMore: boolean;
    };
    expect(body.data).toHaveLength(1);
    // 两条 face 记录同 fileId → photoCount=1（去重）/ faceCount=2
    expect(body.data[0]).toMatchObject({
      id: "grp-1",
      faceCount: 2,
      photoCount: 1,
    });
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.totalPages).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("分页 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
    mockGroupCount.mockResolvedValue(5);
    mockGroupFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockGroupFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArg.skip).toBe(2);
    expect(findArg.take).toBe(2);
    const body = res.body as { totalPages: number; hasMore: boolean; page: number; pageSize: number };
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize 超过上限被截断为 100", async () => {
    mockGroupCount.mockResolvedValue(0);
    mockGroupFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockGroupFindMany.mock.calls[0][0] as { take: number };
    expect(findArg.take).toBe(100);
  });

  it("search 过滤 → where.OR contains name", async () => {
    mockGroupCount.mockResolvedValue(0);
    mockGroupFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?search=人物"));

    expect(mockGroupFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      OR: [{ name: { contains: "人物", mode: "insensitive" } }],
    });
  });

  // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockGroupCount).not.toHaveBeenCalled();
    expect(mockGroupFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockGroupCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockGroupFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = (await GET(makeGetRequest("?pageSize=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockGroupFindMany).not.toHaveBeenCalled();
  });

  it("count 抛错 → 500 { error: '获取人脸分组失败' }", async () => {
    mockGroupCount.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取人脸分组失败" });
  });
});
