/**
 * faces/groups/[id]/photos 路由 handler 级集成测试（GET 分组照片）
 *
 * 锁定租户隔离契约（本轮修复重点）：原实现 `db.faceGroup.findUnique({ where: { id } })` +
 * `db.faceInstance.findMany({ where: { groupId } })` + `db.file.findMany({ where: { userId } })`
 * 均不按 tenantId 作用域，多租户用户知道 groupId 即可枚举他租户人脸实例与文件。修复后
 * 改走 `createTenantDb(tenantId)`，faceGroup/faceInstance/file 访问器自动注入 tenantId。
 *
 * 覆盖：
 *   - 未认证 → 401 透传，不触达 DB。
 *   - 分页校验：page=abc/0 → 400 'page 必须 >= 1'；limit=0/abc/>100 → 400 'limit 必须在 1-100 之间'。
 *   - 分组不在当前租户（findFirst 返回 null）→ 404，faceInstance/file 不触达（租户隔离）。
 *   - 分组在租户但非所有者 → 404，faceInstance/file 不触达。
 *   - 成功 → createTenantDb 收到 tenantId；faceGroup.findFirst({ where:{id} })；
 *     faceInstance.findMany({ where:{groupId}, select:{fileId:true}, take:5000 })；
 *     file.findMany 以 { id:{in}, userId, isDeleted:false } 作用域 + orderBy/skip/take 分页；
 *     fileId 去重 → total；tags 经 safeJsonParseArray 解析。
 *   - 分页 page=2&limit=1 → skip=1/take=1。
 *   - file.findMany 抛错 → 500 '获取照片失败'。
 *
 * 复用 faces-groups-route.test.ts 的 vi.hoisted 共享 MockNextResponse 范式；@/lib/db 仅 mock
 * `createTenantDb`（返回 tenantDb 代理：faceGroup.findFirst / faceInstance.findMany / file.findMany），
 * 不需 `db`（photos 路由不触达全局 db）。safeJsonParseArray 为纯函数，加载真实实现。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  mockGroupFindFirst,
  mockFaceInstanceFindMany,
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
  // tenantDb 代理：route 经 createTenantDb(tenantId) 取得后调用其 faceGroup/faceInstance/file 访问器
  const tenantDb = {
    faceGroup: {
      findFirst: (...args: unknown[]) => mockGroupFindFirst(...args),
    },
    faceInstance: {
      findMany: (...args: unknown[]) => mockFaceInstanceFindMany(...args),
    },
    file: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
    },
  };
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockCreateTenantDb: vi.fn().mockReturnValue(tenantDb),
    mockGroupFindFirst: vi.fn(),
    mockFaceInstanceFindMany: vi.fn(),
    mockFileFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  createTenantDb: (...args: unknown[]) => mockCreateTenantDb(...args),
}));

import { GET } from "@/app/api/faces/groups/[id]/photos/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

const ownedGroup = {
  id: "grp-1",
  tenantId: "tenant-1",
  userId: "user-1",
  name: "人物A",
  thumbnail: "file-1",
};

// 两条 faceInstance（同 fileId 去重为一）+ 一条不同 fileId → uniqueFileIds=2
const faceInstances = [
  { fileId: "file-1" },
  { fileId: "file-1" },
  { fileId: "file-2" },
];

function makeGetRequest(id: string, query = ""): NextRequest {
  return new Request(`http://localhost/api/faces/groups/${id}/photos${query}`) as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/faces/groups/[id]/photos 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockCreateTenantDb.mockReturnValue({
      faceGroup: {
        findFirst: (...args: unknown[]) => mockGroupFindFirst(...args),
      },
      faceInstance: {
        findMany: (...args: unknown[]) => mockFaceInstanceFindMany(...args),
      },
      file: {
        findMany: (...args: unknown[]) => mockFileFindMany(...args),
      },
    });
    mockGroupFindFirst.mockResolvedValue({ ...ownedGroup });
    mockFaceInstanceFindMany.mockResolvedValue(faceInstances);
    mockFileFindMany.mockResolvedValue([
      {
        id: "file-1",
        tenantId: "tenant-1",
        userId: "user-1",
        fileName: "a.jpg",
        fileType: "image",
        fileSize: 1024,
        tags: '["人脸A"]',
        isDeleted: false,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]);
  });

  it("未认证 → 401 透传，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockFaceInstanceFindMany).not.toHaveBeenCalled();
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it("page=abc（NaN）→ 400 'page 必须 >= 1'，不触达 DB", async () => {
    const res = (await GET(makeGetRequest("grp-1", "?page=abc"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
  });

  it("page=0 → 400 'page 必须 >= 1'", async () => {
    const res = (await GET(makeGetRequest("grp-1", "?page=0"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
  });

  it("limit=0 → 400 'limit 必须在 1-100 之间'", async () => {
    const res = (await GET(makeGetRequest("grp-1", "?limit=0"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "limit 必须在 1-100 之间" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
  });

  it("limit=200（>100）→ 400 'limit 必须在 1-100 之间'", async () => {
    const res = (await GET(makeGetRequest("grp-1", "?limit=200"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "limit 必须在 1-100 之间" });
  });

  it("分组不在当前租户（findFirst 返回 null）→ 404，faceInstance/file 不触达（租户隔离）", async () => {
    mockGroupFindFirst.mockResolvedValue(null);

    const res = (await GET(makeGetRequest("grp-x"), ctx("grp-x"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "分组不存在" });
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockGroupFindFirst).toHaveBeenCalledWith({ where: { id: "grp-x" } });
    expect(mockFaceInstanceFindMany).not.toHaveBeenCalled();
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it("分组在租户但非所有者 → 404，faceInstance/file 不触达", async () => {
    mockGroupFindFirst.mockResolvedValue({ ...ownedGroup, userId: "other-user" });

    const res = (await GET(makeGetRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "分组不存在" });
    expect(mockFaceInstanceFindMany).not.toHaveBeenCalled();
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it("成功 → 200，三段查询经 tenantDb 作用域；fileId 去重 total=2；tags 解析", async () => {
    const res = (await GET(makeGetRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(200);
    // 租户隔离：createTenantDb 收到 auth.tenantId，三段查询均经 tenantDb（非全局 db）
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockGroupFindFirst).toHaveBeenCalledWith({ where: { id: "grp-1" } });
    expect(mockFaceInstanceFindMany).toHaveBeenCalledWith({
      where: { groupId: "grp-1" },
      select: { fileId: true },
      take: 5000,
    });
    const fileArg = mockFileFindMany.mock.calls[0][0] as {
      where: { id: { in: string[] }; userId: string; isDeleted: boolean };
      orderBy: { createdAt: string };
      skip: number;
      take: number;
    };
    expect(fileArg.where).toEqual({
      id: { in: ["file-1", "file-2"] },
      userId: "user-1",
      isDeleted: false,
    });
    expect(fileArg.orderBy).toEqual({ createdAt: "desc" });
    expect(fileArg.skip).toBe(0);
    expect(fileArg.take).toBe(20);

    const body = res.body as {
      photos: Array<Record<string, unknown>>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    expect(body.photos).toHaveLength(1);
    expect(body.photos[0]).toMatchObject({ id: "file-1", fileName: "a.jpg" });
    // tags 经 safeJsonParseArray 解析
    expect(body.photos[0].tags).toEqual(["人脸A"]);
    // uniqueFileIds 去重后为 2
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.totalPages).toBe(1);
  });

  it("分页 page=2&limit=1 → skip=1/take=1，totalPages=2", async () => {
    const res = (await GET(makeGetRequest("grp-1", "?page=2&limit=1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(200);
    const fileArg = mockFileFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(fileArg.skip).toBe(1);
    expect(fileArg.take).toBe(1);
    const body = res.body as { totalPages: number; page: number; limit: number };
    expect(body.page).toBe(2);
    expect(body.limit).toBe(1);
    // total=2, limit=1 → totalPages=2
    expect(body.totalPages).toBe(2);
  });

  it("file.findMany 抛错 → 500 '获取照片失败'", async () => {
    mockFileFindMany.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取照片失败" });
  });
});
