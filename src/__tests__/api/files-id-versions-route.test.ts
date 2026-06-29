/**
 * files/[id]/versions 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/files/[id]/versions GET 路由层的分页校验、认证透传与作用域契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - 文件不存在或不属于当前用户 → 404 { error: 'File not found' }（tenantDb.file.findFirst
 *     以 { id } 作用域，UserIdDb 校验 file.userId === auth.userId）。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { error: 'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达 count/findMany。
 *     门控置于文件存在性校验之后（404 优先于 400，避免 ?page=abc 掩盖真实的文件缺失
 *     错误），与 comments（fileId 存在性先于分页门控）范式一致。
 *   - 成功 → tenantDb.fileVersion.count/findMany 以 { fileId } 作用域；findMany orderBy
 *     { version: 'desc' }、skip/take 分页；pageSize 上限 100；createTenantDb 以 auth.tenantId
 *     构造；count 抛错 500。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route 的
 * vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 * createTenantDb 用 hand-written wrapper（同 files-route.test.ts 范式）模拟真实 TenantDb。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  mockFileFindFirst,
  mockVersionCount,
  mockVersionFindMany,
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
    mockCreateTenantDb: vi.fn(),
    mockFileFindFirst: vi.fn(),
    mockVersionCount: vi.fn(),
    mockVersionFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  // GET 不触达 raw db（仅 createTenantDb），保留空对象以隔离模块加载。
  db: {},
  // createTenantDb：hand-written wrapper 模拟真实 TenantDb 的 tenantId 注入行为。
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      file: {
        findFirst: (...args: unknown[]) => mockFileFindFirst(...args),
      },
      fileVersion: {
        count: (...args: unknown[]) => mockVersionCount(...args),
        findMany: (...args: unknown[]) => mockVersionFindMany(...args),
      },
    };
  },
}));

import { GET } from "@/app/api/files/[id]/versions/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/files/file-1/versions${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 文件记录（userId 与 auth 对齐，通过归属校验）
const fileRecord = { id: "file-1", userId: "user-1" };

const versionRecord = {
  id: "ver-2",
  fileId: "file-1",
  fileName: "doc-v2.pdf",
  fileSize: 2048,
  filePath: "/upload/user-1/file-1-v2.pdf",
  version: 2,
  createdAt: "2026-06-29T00:00:00.000Z",
};

describe("/api/files/[id]/versions 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 默认：文件存在且归属当前用户 / count=1 / 返回一条版本
    mockFileFindFirst.mockResolvedValue({ ...fileRecord });
    mockVersionCount.mockResolvedValue(1);
    mockVersionFindMany.mockResolvedValue([versionRecord]);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest(), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockFileFindFirst).not.toHaveBeenCalled();
    expect(mockVersionCount).not.toHaveBeenCalled();
  });

  it("文件不存在 → 404 { error: 'File not found' }，不触达 version count/findMany", async () => {
    mockFileFindFirst.mockResolvedValue(null);

    const res = (await GET(makeGetRequest(), { params: Promise.resolve({ id: "other" }) })) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
    expect(mockFileFindFirst.mock.calls[0][0]).toEqual({ where: { id: "other" } });
    expect(mockVersionCount).not.toHaveBeenCalled();
    expect(mockVersionFindMany).not.toHaveBeenCalled();
  });

  it("文件属于其他用户 → 404 { error: 'File not found' }", async () => {
    mockFileFindFirst.mockResolvedValue({ id: "file-1", userId: "user-other" });

    const res = (await GET(makeGetRequest(), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
    expect(mockVersionCount).not.toHaveBeenCalled();
  });

  it("成功（默认分页）→ 200，createTenantDb 以 auth.tenantId 构造，count/findMany 以 { fileId } 作用域，skip=0/take=20", async () => {
    const res = (await GET(makeGetRequest(), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(200);
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockVersionCount.mock.calls[0][0]).toEqual({ where: { fileId: "file-1" } });
    const findArg = mockVersionFindMany.mock.calls[0][0] as {
      where: unknown;
      orderBy: unknown;
      skip: number;
      take: number;
    };
    expect(findArg.where).toEqual({ fileId: "file-1" });
    expect(findArg.orderBy).toEqual({ version: "desc" });
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
    mockVersionCount.mockResolvedValue(5);
    mockVersionFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?page=2&pageSize=2"), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockVersionFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArg.skip).toBe(2);
    expect(findArg.take).toBe(2);
    const body = res.body as { totalPages: number; hasMore: boolean; page: number; pageSize: number };
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize 超过上限被截断为 100", async () => {
    mockVersionCount.mockResolvedValue(0);
    mockVersionFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?pageSize=500"), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockVersionFindMany.mock.calls[0][0] as { take: number };
    expect(findArg.take).toBe(100);
  });

  // ── 分页参数校验：NaN/非正数 → 400（门控置于文件存在性校验之后）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，文件已确认后门控（不触达 count/findMany）", async () => {
    const res = (await GET(makeGetRequest("?page=abc"), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    // 文件存在性校验在门控之前，file.findFirst 已触达
    expect(mockFileFindFirst).toHaveBeenCalled();
    expect(mockVersionCount).not.toHaveBeenCalled();
    expect(mockVersionFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = (await GET(makeGetRequest("?page=0"), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockVersionCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockVersionFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = (await GET(makeGetRequest("?pageSize=0"), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockVersionFindMany).not.toHaveBeenCalled();
  });

  it("文件不存在 + page=abc → 404 优先于 400（文件存在性校验先于分页门控）", async () => {
    mockFileFindFirst.mockResolvedValue(null);

    const res = (await GET(makeGetRequest("?page=abc"), { params: Promise.resolve({ id: "other" }) })) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
    expect(mockVersionCount).not.toHaveBeenCalled();
  });

  it("count 抛错 → 500 { error: 'Failed to fetch versions' }", async () => {
    mockVersionCount.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest(), { params: Promise.resolve({ id: "file-1" }) })) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch versions" });
  });
});
