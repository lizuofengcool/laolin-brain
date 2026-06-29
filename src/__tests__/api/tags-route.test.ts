/**
 * tags 路由 handler 级集成测试
 *
 * 锁定 /api/tags 路由层（GET）的安全、聚合与分页契约：
 *
 * 核心安全契约：标签是文件级派生数据，db.file.findMany 的 where 恒以
 * (userId, tenantId) 双键 + isDeleted:false 作用域（与 storage/access-history 一致）。
 *
 * GET 控制流契约：
 *   - db.file.findMany where {userId,tenantId,isDeleted:false} select {tags:true}。
 *   - 标签经 safeJsonParseArray 解析（null/无效 JSON → []）后按出现次数聚合计数。
 *   - search 过滤（大小写不敏感 includes）；sortBy=name 按 localeCompare、否则按 count；
 *     sortOrder=asc 升序否则降序。
 *   - limit 默认 50，Math.min(100, limit) 封顶；slice(0, limit) 截断；
 *     返回 { data, total, hasMore: tags.length > limit }。
 *   - **limit 校验**：非数字（'abc' → NaN）或非正数 → 400 'limit 必须为正整数'，
 *     不触达 DB。原 Math.min(100, NaN)=NaN 透传 slice(0,NaN) 会静默返回空列表
 *     （hasMore: tags.length > NaN = false），本轮修复锁定。与 faces/queue 约定一致。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，safeJsonParseArray 保持真实运行
 * 以覆盖 tags 解析路径。复用 storage-route 的 vi.hoisted + MockNextResponse 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockFileFindMany,
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
    mockFileFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    file: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
    },
  },
}));

import { GET } from "@/app/api/tags/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/tags${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/tags 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it("成功（默认）→ file.findMany where 双键+isDeleted:false select tags；按 count 降序聚合；返回 data/total/hasMore", async () => {
    // 三个文件：work 出现 2 次，urgent 1 次，personal 1 次
    mockFileFindMany.mockResolvedValue([
      { tags: JSON.stringify(["work", "urgent"]) },
      { tags: JSON.stringify(["work"]) },
      { tags: JSON.stringify(["personal"]) },
      { tags: null }, // null → [] 跳过
      { tags: "not-json" }, // 无效 JSON → [] 跳过
    ]);

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    expect(mockFileFindMany.mock.calls[0][0]).toEqual({
      where: { userId: "user-1", tenantId: "tenant-1", isDeleted: false },
      select: { tags: true },
    });
    const body = res.body as {
      data: Array<{ name: string; count: number }>;
      total: number;
      hasMore: boolean;
    };
    // 按 count 降序：work(2) > urgent(1) = personal(1)，后两者按插入序（稳定排序）
    expect(body.data).toEqual([
      { name: "work", count: 2 },
      { name: "urgent", count: 1 },
      { name: "personal", count: 1 },
    ]);
    expect(body.total).toBe(3);
    expect(body.hasMore).toBe(false); // 3 > 50 → false
  });

  it("sortBy=name&sortOrder=asc → 按 name localeCompare 升序", async () => {
    mockFileFindMany.mockResolvedValue([
      { tags: JSON.stringify(["zebra"]) },
      { tags: JSON.stringify(["apple"]) },
      { tags: JSON.stringify(["mango"]) },
    ]);

    const res = (await GET(makeGetRequest("?sortBy=name&sortOrder=asc"))) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { data: Array<{ name: string }> };
    expect(body.data.map(t => t.name)).toEqual(["apple", "mango", "zebra"]);
  });

  it("search 过滤（大小写不敏感 includes）", async () => {
    mockFileFindMany.mockResolvedValue([
      { tags: JSON.stringify(["work-urgent"]) },
      { tags: JSON.stringify(["URGENT-task"]) },
      { tags: JSON.stringify(["personal"]) },
    ]);

    const res = (await GET(makeGetRequest("?search=urgent"))) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { data: Array<{ name: string }>; total: number };
    expect(body.data.map(t => t.name)).toEqual(["work-urgent", "URGENT-task"]);
    expect(body.total).toBe(2);
  });

  it("limit=2 → slice(0,2) 截断，hasMore=true", async () => {
    mockFileFindMany.mockResolvedValue([
      { tags: JSON.stringify(["a"]) },
      { tags: JSON.stringify(["b"]) },
      { tags: JSON.stringify(["c"]) },
    ]);

    const res = (await GET(makeGetRequest("?limit=2"))) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[]; total: number; hasMore: boolean };
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("limit=200（>100）→ Math.min 封顶 100", async () => {
    mockFileFindMany.mockResolvedValue([{ tags: JSON.stringify(["only"]) }]);

    const res = (await GET(makeGetRequest("?limit=200"))) as MockRes;

    expect(res.status).toBe(200);
    // 仅 1 个标签，封顶 100 后仍返回全部，hasMore=false
    const body = res.body as { data: unknown[]; hasMore: boolean };
    expect(body.data).toHaveLength(1);
    expect(body.hasMore).toBe(false);
  });

  // ─── limit NaN/非正数 → 400（本轮修复锁定，防 slice(0,NaN) 静默返回空列表）───
  it("?limit=abc → 400 { error: 'limit 必须为正整数' }，不触达 DB", async () => {
    const res = (await GET(makeGetRequest("?limit=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "limit 必须为正整数" });
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it("?limit=0 → 400（limit<1）", async () => {
    const res = (await GET(makeGetRequest("?limit=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "limit 必须为正整数" });
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it("?limit=-5 → 400（负数，防 slice(0,-5) 截断尾部）", async () => {
    const res = (await GET(makeGetRequest("?limit=-5"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "limit 必须为正整数" });
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it("findMany 抛错 → 500 { error: '获取标签列表失败' }", async () => {
    mockFileFindMany.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取标签列表失败" });
  });
});
