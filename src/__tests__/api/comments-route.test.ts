/**
 * comments 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/comments GET 路由层的分页校验、认证透传与作用域契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - 缺 fileId → 400 { error: 'fileId is required' }。
 *   - fileId 不属于当前租户 → 404 { error: '文件不存在' }（file.findFirst 以
 *     { id, tenantId } 作用域，防跨租户枚举评论）。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { error: 'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达 count/findMany。
 *     评论为文件级数据（无 role 门控），门控置于 stats/export 分支与文件存在性校验
 *     之后：?action=stats/export 不使用分页（早返回）；?fileId=缺失/不存在 优先
 *     400/404；?page=abc 仅在已确认文件后拒绝。与 files/storage/tags 及
 *     cloud-sync/queue 的 isNaN||<1 → 400 约定一致。
 *   - 成功 → count/findMany 以 { tenantId, fileId, parentId } 作用域；findMany orderBy
 *     createdAt desc、skip/take 分页；pageSize 上限 100；返回 data 含 userName（来自
 *     user.findMany 映射）；count 抛错 500。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db / @/lib/comments，复用第三十轮
 * cloud-sync-config-route 的 vi.hoisted 共享 MockNextResponse 范式（使路由
 * `auth instanceof NextResponse` 命中）。@/lib/comments 的 commentManager 在 list
 * 路径不被调用，仅 stub 以隔离模块加载。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockFileFindFirst,
  mockCommentCount,
  mockCommentFindMany,
  mockUserFindMany,
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
    mockFileFindFirst: vi.fn(),
    mockCommentCount: vi.fn(),
    mockCommentFindMany: vi.fn(),
    mockUserFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    file: {
      findFirst: (...args: unknown[]) => mockFileFindFirst(...args),
    },
    comment: {
      count: (...args: unknown[]) => mockCommentCount(...args),
      findMany: (...args: unknown[]) => mockCommentFindMany(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
  },
}));
vi.mock("@/lib/comments", () => ({
  commentManager: {
    getStats: vi.fn(),
    exportComments: vi.fn(),
  },
}));

import { GET } from "@/app/api/comments/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/comments${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 一条评论记录（userId 与下方 user 记录对应，用于验证 userName 映射）
const commentRecord = {
  id: "cmt-1",
  tenantId: "tenant-1",
  fileId: "file-1",
  parentId: null,
  userId: "user-2",
  content: "第一条评论",
  likes: 3,
  isEdited: false,
  editedAt: null,
  createdAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-29T00:00:00.000Z",
};

const userRecord = {
  id: "user-2",
  name: "张三",
  email: "zhangsan@example.com",
  avatar: "https://example.com/a.png",
};

describe("/api/comments 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // list 路径默认：文件存在 / count=1 / 返回一条评论 / 对应用户存在
    mockFileFindFirst.mockResolvedValue({ id: "file-1" });
    mockCommentCount.mockResolvedValue(1);
    mockCommentFindMany.mockResolvedValue([commentRecord]);
    mockUserFindMany.mockResolvedValue([userRecord]);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest("?fileId=file-1"))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockFileFindFirst).not.toHaveBeenCalled();
    expect(mockCommentCount).not.toHaveBeenCalled();
  });

  it("缺 fileId → 400 { error: 'fileId is required' }，不触达 file/count", async () => {
    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "fileId is required" });
    expect(mockFileFindFirst).not.toHaveBeenCalled();
    expect(mockCommentCount).not.toHaveBeenCalled();
  });

  it("fileId 不属于当前租户 → 404 { error: '文件不存在' }，file.findFirst 以 { id, tenantId } 作用域", async () => {
    mockFileFindFirst.mockResolvedValue(null);

    const res = (await GET(makeGetRequest("?fileId=other"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "文件不存在" });
    expect(mockFileFindFirst.mock.calls[0][0]).toEqual({
      where: { id: "other", tenantId: "tenant-1" },
      select: { id: true },
    });
    expect(mockCommentCount).not.toHaveBeenCalled();
  });

  it("成功（默认分页）→ 200，count/findMany 以 { tenantId, fileId, parentId:null } 作用域，skip=0/take=20，data 含 userName 映射", async () => {
    const res = (await GET(makeGetRequest("?fileId=file-1"))) as MockRes;

    expect(res.status).toBe(200);
    const expectedWhere = { tenantId: "tenant-1", fileId: "file-1", parentId: null };
    expect(mockCommentCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
    const findArg = mockCommentFindMany.mock.calls[0][0] as {
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
      data: Array<Record<string, unknown>>;
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasMore: boolean;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "cmt-1",
      content: "第一条评论",
      userName: "张三",
      userEmail: "zhangsan@example.com",
      userAvatar: "https://example.com/a.png",
      likes: 3,
    });
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.totalPages).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("分页 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
    mockCommentCount.mockResolvedValue(5);
    mockCommentFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?fileId=file-1&page=2&pageSize=2"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockCommentFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArg.skip).toBe(2);
    expect(findArg.take).toBe(2);
    const body = res.body as { totalPages: number; hasMore: boolean; page: number; pageSize: number };
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize 超过上限被截断为 100", async () => {
    mockCommentCount.mockResolvedValue(0);
    mockCommentFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?fileId=file-1&pageSize=500"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockCommentFindMany.mock.calls[0][0] as { take: number };
    expect(findArg.take).toBe(100);
  });

  // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany（文件已确认后门控）", async () => {
    const res = (await GET(makeGetRequest("?fileId=file-1&page=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    // 文件存在性校验在门控之前，file.findFirst 已触达
    expect(mockFileFindFirst).toHaveBeenCalled();
    expect(mockCommentCount).not.toHaveBeenCalled();
    expect(mockCommentFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = (await GET(makeGetRequest("?fileId=file-1&page=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockCommentCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = (await GET(makeGetRequest("?fileId=file-1&pageSize=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockCommentFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = (await GET(makeGetRequest("?fileId=file-1&pageSize=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockCommentFindMany).not.toHaveBeenCalled();
  });

  it("fileId 不存在 + page=abc → 404 优先于 400（文件存在性校验先于分页门控）", async () => {
    mockFileFindFirst.mockResolvedValue(null);

    const res = (await GET(makeGetRequest("?fileId=other&page=abc"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "文件不存在" });
    expect(mockCommentCount).not.toHaveBeenCalled();
  });

  it("count 抛错 → 500 { error: '获取评论列表失败' }", async () => {
    mockCommentCount.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest("?fileId=file-1"))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取评论列表失败" });
  });
});
