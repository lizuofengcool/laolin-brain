/**
 * trash 路由 handler 级集成测试
 *
 * 锁定 /api/trash 路由层（GET / POST / DELETE）的安全与控制流契约：
 *
 * 核心安全契约：回收站是个人级软删数据，所有 db.file / tx.file 调用的 where 恒以
 * (userId, tenantId, isDeleted:true) 三键作用域——双租户键防跨用户/跨租户越权，
 * isDeleted:true 维度锁定"仅回收站文件可被列/恢复/永久删"语义（活跃文件 isDeleted:false
 * 不可被本路由触达）。folder.findUnique 的 targetFolder 校验亦显式比对 userId+tenantId
 * 双键，防恢复到他人/他租户文件夹。路由 `const { userId, tenantId, role } = auth` 解构
 * role 但全文未引用，故 member 亦可操作自己的回收站——与 storage 一致（个人数据按用户
 * 归属，admin 也不应恢复/删除他人回收站），测试通过"member 仍可恢复"用例显式锁定。
 *
 *   - GET（列回收站）：
 *     · 未认证 401 透传，不触达 DB。
 *     · count + aggregate + findMany 三调用收到同一 where（三键）。
 *     · aggregate _sum.fileSize 为 null → totalSize=0（`|| 0` 锁定）。
 *     · orderBy deletedAt desc；select 8 字段；返回 7 字段含 totalPages/hasMore。
 *     · pageSize 上限 100 截断；分页 skip=(page-1)*pageSize。
 *   - POST（按 URL pathname 分发 restore / empty）：
 *     · pathname 不含 '/restore' → action='empty' → emptyTrash（不读 body、不触达
 *       folder.findUnique / $transaction restore 路径）。**核心契约：URL 路径分发**。
 *     · pathname 含 '/restore' → restore：fileIds 必填非空数组（400）；targetFolderId
 *       存在时 folder.findUnique 校验归属（404）；$transaction 内 tx.file.findMany
 *       验证 id∈fileIds 且三键+isDeleted:true，数量不匹配抛错→500；tx.file.updateMany
 *       where 三键+in、data {isDeleted:false,deletedAt:null}（+folderId 当指定目标）。
 *     · emptyTrash：db.file.count where 三键；db.file.deleteMany where 三键；返回 deletedCount=count。
 *   - DELETE（永久删除）：
 *     · fileIds 必填非空数组（400）；$transaction 内 tx.file.findMany 验证三键+in+isDeleted:true，
 *       数量不匹配抛错→500；tx.file.deleteMany where 三键+in 硬删。
 *
 * $transaction 回调形式：mockTransaction 以 `async (fn) => fn(fakeTx)` 实现，使回调内的
 * tx.file.findMany/updateMany/deleteMany 路由到独立 mock，与 db.file.*（emptyTrash 用）区分。
 * 复用第三十轮 cloud-sync-config-route 的 vi.hoisted 共享 MockNextResponse 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockFileCount,
  mockFileAggregate,
  mockFileFindMany,
  mockFileDeleteMany,
  mockFolderFindUnique,
  mockTransaction,
  mockTxFindMany,
  mockTxUpdateMany,
  mockTxDeleteMany,
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
    mockFileCount: vi.fn(),
    mockFileAggregate: vi.fn(),
    mockFileFindMany: vi.fn(),
    mockFileDeleteMany: vi.fn(),
    mockFolderFindUnique: vi.fn(),
    mockTransaction: vi.fn(),
    mockTxFindMany: vi.fn(),
    mockTxUpdateMany: vi.fn(),
    mockTxDeleteMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    file: {
      count: (...args: unknown[]) => mockFileCount(...args),
      aggregate: (...args: unknown[]) => mockFileAggregate(...args),
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
      deleteMany: (...args: unknown[]) => mockFileDeleteMany(...args),
    },
    folder: {
      findUnique: (...args: unknown[]) => mockFolderFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { GET, POST, DELETE } from "@/app/api/trash/route";

// $transaction 回调内的 fakeTx：路由内 tx.file.* 路由到独立 mock
const fakeTx = {
  file: {
    findMany: (...args: unknown[]) => mockTxFindMany(...args),
    updateMany: (...args: unknown[]) => mockTxUpdateMany(...args),
    deleteMany: (...args: unknown[]) => mockTxDeleteMany(...args),
  },
};

// 默认 owner 身份（逐用例按需覆盖 role）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/trash${query}`;
  return new Request(url) as unknown as NextRequest;
}

function makePostRequest(pathname: string, body?: unknown): NextRequest {
  const url = `http://localhost${pathname}`;
  return new Request(url, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeDeleteRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/trash", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/trash 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // $transaction 回调形式：将 fakeTx 注入回调
    mockTransaction.mockImplementation(async (fn: unknown) => {
      const callback = fn as (tx: typeof fakeTx) => Promise<unknown>;
      return callback(fakeTx);
    });
  });

  describe("GET /api/trash — 列回收站", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockFileCount).not.toHaveBeenCalled();
      expect(mockFileAggregate).not.toHaveBeenCalled();
      expect(mockFileFindMany).not.toHaveBeenCalled();
    });

    it("默认 → count + aggregate + findMany 收到同一 where 三键 {userId,tenantId,isDeleted:true}；orderBy deletedAt desc；select 8 字段；返回 7 字段", async () => {
      mockFileCount.mockResolvedValue(5);
      mockFileAggregate.mockResolvedValue({ _sum: { fileSize: 2048 } });
      mockFileFindMany.mockResolvedValue([
        { id: "f-1", fileName: "a.txt", deletedAt: new Date("2026-01-01") },
      ]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      const expectedWhere = {
        userId: "user-1",
        tenantId: "tenant-1",
        isDeleted: true,
      };
      // 核心契约：三调用同一 where 三键
      expect(mockFileCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
      expect(mockFileAggregate.mock.calls[0][0]).toEqual({
        where: expectedWhere,
        _sum: { fileSize: true },
      });
      expect(mockFileFindMany.mock.calls[0][0]).toEqual({
        where: expectedWhere,
        orderBy: { deletedAt: "desc" },
        skip: 0,
        take: 20,
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          thumbnailUrl: true,
          folderId: true,
          deletedAt: true,
          createdAt: true,
        },
      });
      // 返回字段
      expect(res.body).toEqual({
        data: [
          { id: "f-1", fileName: "a.txt", deletedAt: new Date("2026-01-01") },
        ],
        total: 5,
        totalSize: 2048,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        hasMore: false,
      });
    });

    it("fileType 过滤 → where 含 fileType", async () => {
      mockFileCount.mockResolvedValue(0);
      mockFileAggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
      mockFileFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?fileType=image")) as MockRes;

      expect(mockFileCount.mock.calls[0][0]).toEqual({
        where: {
          userId: "user-1",
          tenantId: "tenant-1",
          isDeleted: true,
          fileType: "image",
        },
      });
    });

    it("search 过滤 → where.fileName contains", async () => {
      mockFileCount.mockResolvedValue(0);
      mockFileAggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
      mockFileFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?search=report")) as MockRes;

      expect(mockFileCount.mock.calls[0][0]).toEqual({
        where: {
          userId: "user-1",
          tenantId: "tenant-1",
          isDeleted: true,
          fileName: { contains: "report" },
        },
      });
    });

    it("fileType + search 叠加 → where 含三者", async () => {
      mockFileCount.mockResolvedValue(0);
      mockFileAggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
      mockFileFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?fileType=pdf&search=draft")) as MockRes;

      expect(mockFileCount.mock.calls[0][0]).toEqual({
        where: {
          userId: "user-1",
          tenantId: "tenant-1",
          isDeleted: true,
          fileType: "pdf",
          fileName: { contains: "draft" },
        },
      });
    });

    it("分页 page=2&pageSize=2 → skip=2/take=2/totalPages=3/hasMore=true；pageSize=500 截断为 100", async () => {
      mockFileCount.mockResolvedValue(5);
      mockFileAggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockFileFindMany.mock.calls[0][0]).toMatchObject({
        skip: 2,
        take: 2,
      });
      expect(res.body).toMatchObject({
        page: 2,
        pageSize: 2,
        totalPages: 3,
        hasMore: true,
      });
    });

    it("pageSize=500 → 截断为 100（Math.min 锁定）；响应 pageSize=100", async () => {
      mockFileCount.mockResolvedValue(0);
      mockFileAggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

      expect(res.status).toBe(200);
      // findMany take 走截断后的 pageSize=100
      expect(mockFileFindMany.mock.calls[0][0]).toMatchObject({ take: 100 });
      // 响应体回显截断后的 pageSize
      expect(res.body).toMatchObject({ pageSize: 100 });
    });

    it("_sum.fileSize 为 null → totalSize=0（`|| 0` 锁定）", async () => {
      mockFileCount.mockResolvedValue(1);
      mockFileAggregate.mockResolvedValue({ _sum: { fileSize: null } });
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalSize: 0 });
    });

    it("count 抛错 → 500 { error: '获取回收站列表失败' }", async () => {
      mockFileCount.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取回收站列表失败" });
      expect(mockFileFindMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/trash — URL pathname 分发", () => {
    it("pathname /api/trash（不含 /restore）→ action='empty' → 走 emptyTrash，不读 body、不触达 folder.findUnique / $transaction restore 路径", async () => {
      mockFileCount.mockResolvedValue(3);
      mockFileDeleteMany.mockResolvedValue({ count: 3 });

      // body 为 restore 形态，但 empty 分支不应读取
      const res = (await POST(
        makePostRequest("/api/trash", { fileIds: ["f-1"] })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, deletedCount: 3 });
      // emptyTrash 用 db.file.count where 三键
      expect(mockFileCount.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", tenantId: "tenant-1", isDeleted: true },
      });
      // emptyTrash 用 db.file.deleteMany where 三键（非 tx.file.deleteMany）
      expect(mockFileDeleteMany.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", tenantId: "tenant-1", isDeleted: true },
      });
      // restore 路径不应触达
      expect(mockFolderFindUnique).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockTxFindMany).not.toHaveBeenCalled();
      expect(mockTxUpdateMany).not.toHaveBeenCalled();
    });

    it("未认证 → 401 透传（restore pathname）", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await POST(
        makePostRequest("/api/trash/restore", { fileIds: ["f-1"] })
      )) as MockRes;

      expect(res.status).toBe(401);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("pathname /api/trash/restore + 缺 fileIds → 400 { error: 'fileIds is required' }", async () => {
      const res = (await POST(
        makePostRequest("/api/trash/restore", {})
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "fileIds is required" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("pathname /api/trash/restore + fileIds 空数组 → 400", async () => {
      const res = (await POST(
        makePostRequest("/api/trash/restore", { fileIds: [] })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "fileIds is required" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("targetFolderId 指定但文件夹不存在 → 404 { error: '目标文件夹不存在或无权访问' }", async () => {
      mockFolderFindUnique.mockResolvedValue(null);

      const res = (await POST(
        makePostRequest("/api/trash/restore", {
          fileIds: ["f-1"],
          targetFolderId: "folder-missing",
        })
      )) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "目标文件夹不存在或无权访问" });
      // folder.findUnique where 单键 + select 3 字段
      expect(mockFolderFindUnique.mock.calls[0][0]).toEqual({
        where: { id: "folder-missing" },
        select: { id: true, userId: true, tenantId: true },
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("targetFolderId 指定但文件夹 userId 不属于当前用户 → 404", async () => {
      mockFolderFindUnique.mockResolvedValue({
        id: "folder-1",
        userId: "other-user",
        tenantId: "tenant-1",
      });

      const res = (await POST(
        makePostRequest("/api/trash/restore", {
          fileIds: ["f-1"],
          targetFolderId: "folder-1",
        })
      )) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "目标文件夹不存在或无权访问" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("targetFolderId 指定但文件夹 tenantId 不匹配 → 404", async () => {
      mockFolderFindUnique.mockResolvedValue({
        id: "folder-1",
        userId: "user-1",
        tenantId: "other-tenant",
      });

      const res = (await POST(
        makePostRequest("/api/trash/restore", {
          fileIds: ["f-1"],
          targetFolderId: "folder-1",
        })
      )) as MockRes;

      expect(res.status).toBe(404);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("$transaction 内 findMany 返回数量不匹配 → throw → 500 { error: '部分文件不在回收站或无权访问' }", async () => {
      mockTxFindMany.mockResolvedValue([{ id: "f-1", folderId: null }]);

      const res = (await POST(
        makePostRequest("/api/trash/restore", {
          fileIds: ["f-1", "f-2"], // 2 个 id，但 findMany 只返回 1 个
        })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "部分文件不在回收站或无权访问" });
      // updateMany 不应触达
      expect(mockTxUpdateMany).not.toHaveBeenCalled();
    });

    it("成功（无 targetFolderId）→ tx.file.findMany where 三键+in select {id,folderId}；tx.file.updateMany where 三键+in data {isDeleted:false,deletedAt:null}；返回 {success:true,restoredCount}", async () => {
      mockTxFindMany.mockResolvedValue([
        { id: "f-1", folderId: null },
        { id: "f-2", folderId: null },
      ]);
      mockTxUpdateMany.mockResolvedValue({ count: 2 });

      const res = (await POST(
        makePostRequest("/api/trash/restore", { fileIds: ["f-1", "f-2"] })
      )) as MockRes;

      expect(res.status).toBe(200);
      // 核心契约：tx.file.findMany where 三键 + id in
      expect(mockTxFindMany.mock.calls[0][0]).toEqual({
        where: {
          id: { in: ["f-1", "f-2"] },
          userId: "user-1",
          tenantId: "tenant-1",
          isDeleted: true,
        },
        select: { id: true, folderId: true },
      });
      // 核心契约：tx.file.updateMany where 三键 + id in；data isDeleted:false + deletedAt:null（无 folderId）
      expect(mockTxUpdateMany.mock.calls[0][0]).toEqual({
        where: {
          id: { in: ["f-1", "f-2"] },
          userId: "user-1",
          tenantId: "tenant-1",
          isDeleted: true,
        },
        data: { isDeleted: false, deletedAt: null },
      });
      expect(res.body).toEqual({ success: true, restoredCount: 2 });
    });

    it("成功（有 targetFolderId）→ updateMany data 含 folderId", async () => {
      mockFolderFindUnique.mockResolvedValue({
        id: "folder-1",
        userId: "user-1",
        tenantId: "tenant-1",
      });
      mockTxFindMany.mockResolvedValue([{ id: "f-1", folderId: null }]);
      mockTxUpdateMany.mockResolvedValue({ count: 1 });

      const res = (await POST(
        makePostRequest("/api/trash/restore", {
          fileIds: ["f-1"],
          targetFolderId: "folder-1",
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockTxUpdateMany.mock.calls[0][0]).toMatchObject({
        data: { isDeleted: false, deletedAt: null, folderId: "folder-1" },
      });
      expect(res.body).toEqual({ success: true, restoredCount: 1 });
    });

    it("member 角色 → 仍可恢复自己的回收站（role 未参与作用域）", async () => {
      mockAuthenticate.mockResolvedValue({
        ...ownerAuth,
        role: "member",
      });
      mockTxFindMany.mockResolvedValue([{ id: "f-1", folderId: null }]);
      mockTxUpdateMany.mockResolvedValue({ count: 1 });

      const res = (await POST(
        makePostRequest("/api/trash/restore", { fileIds: ["f-1"] })
      )) as MockRes;

      expect(res.status).toBe(200);
      // member 的 userId 仍参与 where 作用域
      expect(mockTxFindMany.mock.calls[0][0]).toMatchObject({
        where: { userId: "user-1", tenantId: "tenant-1", isDeleted: true },
      });
    });
  });

  describe("POST /api/trash/empty — 清空回收站", () => {
    it("pathname /api/trash/empty → action='empty'（不含 /restore）→ emptyTrash 成功：count + deleteMany where 三键", async () => {
      mockFileCount.mockResolvedValue(4);
      mockFileDeleteMany.mockResolvedValue({ count: 4 });

      const res = (await POST(
        makePostRequest("/api/trash/empty", {})
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, deletedCount: 4 });
      const expectedWhere = {
        userId: "user-1",
        tenantId: "tenant-1",
        isDeleted: true,
      };
      expect(mockFileCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
      expect(mockFileDeleteMany.mock.calls[0][0]).toEqual({
        where: expectedWhere,
      });
      // 不触达 transaction restore 路径
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("emptyTrash count 抛错 → 500 { error: '清空回收站失败' }", async () => {
      mockFileCount.mockRejectedValue(new Error("db down"));

      const res = (await POST(
        makePostRequest("/api/trash/empty", {})
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "清空回收站失败" });
      expect(mockFileDeleteMany).not.toHaveBeenCalled();
    });

    it("emptyTrash deleteMany 抛错 → 500 { error: '清空回收站失败' }", async () => {
      mockFileCount.mockResolvedValue(2);
      mockFileDeleteMany.mockRejectedValue(new Error("db down"));

      const res = (await POST(
        makePostRequest("/api/trash/empty", {})
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "清空回收站失败" });
    });
  });

  describe("DELETE /api/trash — 永久删除", () => {
    it("未认证 → 401 透传，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await DELETE(makeDeleteRequest({ fileIds: ["f-1"] }))) as MockRes;

      expect(res.status).toBe(401);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("缺 fileIds → 400 { error: 'fileIds is required' }", async () => {
      const res = (await DELETE(makeDeleteRequest({}))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "fileIds is required" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("fileIds 空数组 → 400", async () => {
      const res = (await DELETE(makeDeleteRequest({ fileIds: [] }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "fileIds is required" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("$transaction 内 findMany 返回数量不匹配 → throw → 500 { error: '部分文件不在回收站或无权访问' }", async () => {
      mockTxFindMany.mockResolvedValue([{ id: "f-1" }]);

      const res = (await DELETE(
        makeDeleteRequest({ fileIds: ["f-1", "f-2"] })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "部分文件不在回收站或无权访问" });
      expect(mockTxDeleteMany).not.toHaveBeenCalled();
    });

    it("成功 → tx.file.findMany where 三键+in select {id}；tx.file.deleteMany where 三键+in；返回 {success:true,deletedCount}", async () => {
      mockTxFindMany.mockResolvedValue([{ id: "f-1" }, { id: "f-2" }]);
      mockTxDeleteMany.mockResolvedValue({ count: 2 });

      const res = (await DELETE(
        makeDeleteRequest({ fileIds: ["f-1", "f-2"] })
      )) as MockRes;

      expect(res.status).toBe(200);
      // 核心契约：tx.file.findMany where 三键 + id in + select {id}
      expect(mockTxFindMany.mock.calls[0][0]).toEqual({
        where: {
          id: { in: ["f-1", "f-2"] },
          userId: "user-1",
          tenantId: "tenant-1",
          isDeleted: true,
        },
        select: { id: true },
      });
      // 核心契约：tx.file.deleteMany where 三键 + id in（硬删）
      expect(mockTxDeleteMany.mock.calls[0][0]).toEqual({
        where: {
          id: { in: ["f-1", "f-2"] },
          userId: "user-1",
          tenantId: "tenant-1",
          isDeleted: true,
        },
      });
      expect(res.body).toEqual({ success: true, deletedCount: 2 });
    });

    it("deleteMany 抛错 → 500 { error: '永久删除失败' }（error.message 兜底）", async () => {
      mockTxFindMany.mockResolvedValue([{ id: "f-1" }]);
      mockTxDeleteMany.mockRejectedValue(new Error("fk constraint"));

      const res = (await DELETE(makeDeleteRequest({ fileIds: ["f-1"] }))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "fk constraint" });
    });
  });
});
