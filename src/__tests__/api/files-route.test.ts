/**
 * files/route.ts 主路由 handler 级集成测试 —— GET list 专轮
 *
 * 锁定 /api/files 主路由 GET（文件列表查询）的安全与控制流契约。本路由在
 * 第四十一轮已从 raw db 迁移到 TenantDb（tenantDb.file.findMany 自动注入
 * tenantId）。第五十轮已补 /api/files/[id] 动态路由（GET/PUT/DELETE）测试，
 * 本轮补主路由 GET list，POST（multipart + magic bytes + 配额 + dedup 版本化
 * + AI fetch + $transaction）较复杂，留待下一轮单独处理。
 *
 * 复用第五十轮 files-id-route 的 vi.hoisted + MockNextResponse 范式 +
 * raw db vs tenantDb mock 分离范式（GET 不触达 raw db，但保留负向断言
 * 锁定"路由不绕过 tenantDb"）。
 *
 * 核心安全契约（双重锁定）：
 *   1. **路由不绕过 tenantDb**：mockRawFileFindMany 恒不被调用（负向断言），
 *      mockTenantFileFindMany 承接路由的所有 file.findMany 调用（正向断言）。
 *      若未来重构回 raw db 手动 where，负向断言立即失败。
 *   2. **tenantId 经 wrapper 强制注入**：hand-written createTenantDb mock 模拟
 *      真实 TenantDb 的注入行为（file where 末尾追加 tenantId）。真实 TenantDb
 *      的注入行为由 tenant-isolation.test.ts 单独覆盖；本测试只锁"路由层契约 +
 *      wrapper 注入路径"组合后 tenantId 必现。
 *
 * GET 控制流契约：
 *   - folderId 处理三态：缺失 / "null" 字符串 → where.folderId=null；
 *     具体值 → where.folderId=value。其中"缺失"与"'null' 字符串"合并同处理
 *     （`folderId === "null" || !folderId`），本测试用两用例显式锁定此合并。
 *   - 分页：page 默认 1，limit 默认 100 且 Math.min(limit, 500) 封顶，
 *     skip=(page-1)*limit。本测试用 page=2&limit=10、limit=600（封顶 500）、
 *     limit 缺失（默认 100）三用例锁定。
 *   - 响应转换：tags / keyPoints 经 safeJsonParseArray 解析（null/无效 JSON → []）；
 *     image fileType + thumbnailUrl → 保留 thumbnailUrl（if 分支，虽值为 no-op
 *     但锁路径触达）。
 *
 * Mock 策略：authenticateRequest / next/server 隔离；createTenantDb 用 hand-written
 * wrapper；raw db.file.findMany 独立 mock 供负向断言；safeJsonParseArray 保持真实
 * 运行以覆盖 tags/keyPoints 解析路径。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db（供"路由不绕过 tenantDb"负向断言：GET 不应触达 raw db.file.findMany）
  mockRawFileFindMany,
  // tenantDb wrapper 注入 tenantId 后的实际承接方
  mockTenantFileFindMany,
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
    mockRawFileFindMany: vi.fn(),
    mockTenantFileFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  // raw db：GET 不应触达（负向断言）。保留 file.findMany 供"路由不绕过 tenantDb"断言。
  db: {
    file: {
      findMany: (...args: unknown[]) => mockRawFileFindMany(...args),
    },
  },
  // createTenantDb：hand-written wrapper 模拟真实 TenantDb 的 tenantId 注入行为
  // （file where 末尾追加 tenantId）。
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      file: {
        findMany: (args: { where?: Record<string, unknown> }) =>
          mockTenantFileFindMany({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
      },
    };
  },
}));

import { GET } from "@/app/api/files/route";

// 默认 owner 身份
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

/**
 * 构造 hand-crafted GET 请求。URL query 经 searchParams 传入，对齐真实路由形态。
 */
function makeGetRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/files${query}`, {
    method: "GET",
  }) as unknown as NextRequest;
}

// 默认返回的文件记录（含 tags/keyPoints 字符串，覆盖 safeJsonParseArray 解析路径）
const sampleFiles = [
  {
    id: "file-1",
    userId: "user-1",
    tenantId: "tenant-1",
    fileName: "doc.pdf",
    fileType: "pdf",
    fileSize: 1024,
    filePath: "/upload/user-1/file-1.pdf",
    textContent: "hello",
    thumbnailUrl: null,
    tags: JSON.stringify(["work", "urgent"]),
    keyPoints: JSON.stringify(["point-a"]),
    summary: null,
    storageMode: "cloud",
    isFavorite: false,
    isDeleted: false,
    folderId: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  },
  {
    id: "file-2",
    userId: "user-1",
    tenantId: "tenant-1",
    fileName: "pic.jpg",
    fileType: "image",
    fileSize: 2048,
    filePath: "/upload/user-1/file-2.jpg",
    textContent: null,
    thumbnailUrl: "/api/files/thumbnail/file-2",
    tags: null, // null → 解析为 []
    keyPoints: "not-json", // 无效 JSON → 解析为 []
    summary: null,
    storageMode: "cloud",
    isFavorite: true,
    isDeleted: false,
    folderId: "folder-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
];

describe("/api/files 主路由 GET — 文件列表查询", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockTenantFileFindMany.mockResolvedValue(sampleFiles);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantFileFindMany).not.toHaveBeenCalled();
  });

  it("成功（folderId 缺失）→ 200，where.folderId=null，tags/keyPoints 解析；findMany where 含 wrapper 注入的 tenantId；raw db.file.findMany 恒不被调用", async () => {
    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    // body 为数组，tags/keyPoints 经 safeJsonParseArray 解析
    expect(res.body).toHaveLength(2);
    expect(res.body).toMatchObject([
      { id: "file-1", tags: ["work", "urgent"], keyPoints: ["point-a"] },
      { id: "file-2", tags: [], keyPoints: [] }, // null / 无效 JSON → []
    ]);
    // createTenantDb 以 auth 返回的 tenantId 调用
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    // wrapper 注入 tenantId 到 where；folderId 缺失 → null；orderBy/take/skip 默认值
    expect(mockTenantFileFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        storageMode: "cloud",
        isDeleted: false,
        folderId: null,
        tenantId: "tenant-1",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      skip: 0,
    });
    // 核心负向契约：路由不绕过 tenantDb 直连 raw db.file.findMany
    expect(mockRawFileFindMany).not.toHaveBeenCalled();
  });

  it("folderId === 'null' 字符串 → where.folderId=null（与缺失同处理）", async () => {
    const res = (await GET(makeGetRequest("?folderId=null"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockTenantFileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ folderId: null, tenantId: "tenant-1" }),
      })
    );
  });

  it("folderId 具体值 → where.folderId=value", async () => {
    const res = (await GET(makeGetRequest("?folderId=folder-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockTenantFileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ folderId: "folder-1", tenantId: "tenant-1" }),
      })
    );
  });

  it("分页 page=2&limit=10 → skip=10, take=10", async () => {
    const res = (await GET(makeGetRequest("?page=2&limit=10"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockTenantFileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 10,
      })
    );
  });

  it("limit=600（>500）→ Math.min 封顶为 500", async () => {
    const res = (await GET(makeGetRequest("?limit=600"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockTenantFileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        skip: 0,
      })
    );
  });

  it("limit 缺失（仅 page=1）→ 默认 100，skip=0", async () => {
    const res = (await GET(makeGetRequest("?page=1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockTenantFileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        skip: 0,
      })
    );
  });

  it("image fileType + thumbnailUrl → 保留 thumbnailUrl（if 分支触达）", async () => {
    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    // image 文件保留 thumbnailUrl（if 分支虽值为 no-op，但锁路径触达）
    expect(res.body).toMatchObject([
      { id: "file-1" },
      { id: "file-2", fileType: "image", thumbnailUrl: "/api/files/thumbnail/file-2" },
    ]);
  });

  it("findMany 返回空数组 → 200 + []", async () => {
    mockTenantFileFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("findMany 抛错 → 500 { error: 'Failed to fetch files' }", async () => {
    mockTenantFileFindMany.mockRejectedValue(new Error("db connection lost"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch files" });
  });
});
