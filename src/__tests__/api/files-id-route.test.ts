/**
 * files/[id] 路由 handler 级集成测试
 *
 * 锁定 /api/files/[id] 路由层（GET / PUT / DELETE）的安全与控制流契约。本路由在
 * 第四十一轮已从 raw db 迁移到 TenantDb（findFirst / update / folder.findFirst /
 * fileVersion.findMany 全部走 tenantDb，仅 DELETE 的级联 $transaction 保留 db 直连
 * 因 FileEmbedding/FaceInstance 无 TenantDb 代理且 Prisma schema 已 onDelete:Cascade
 * 兜底）。本轮补测与第四十一轮迁移形成"先迁移后补测"的闭环，复用第四十轮 trash-route
 * 的 vi.hoisted + MockNextResponse 范式 + 第四十一轮 files-import 的 raw db vs
 * tenantDb mock 分离范式 + 第四十九轮 cloud-sync-backups-id 的动态路由 params: Promise 范式。
 *
 * 核心安全契约（双重锁定）：
 *   1. **路由不绕过 tenantDb**：通过"分离 raw db mock 与 tenantDb mock"实现——
 *      mockRawFileFindFirst 恒不被调用（负向断言），mockTenantFileFindFirst /
 *      mockTenantFileUpdate / mockTenantFolderFindFirst / mockTenantFileVersionFindMany
 *      承接路由的所有 file/folder/fileVersion 调用（正向断言）。若未来重构回 raw db
 *      手动 where，负向断言立即失败。DELETE 的级联 deleteMany 仍走 raw db
 *      （fileEmbedding/faceInstance/file），属预期——本测试单独正向断言此三调用。
 *   2. **tenantId 经 wrapper 强制注入**：hand-written createTenantDb mock 模拟真实
 *      TenantDb 的注入行为（file/folder where 末尾追加 tenantId；fileVersion where
 *      追加 file:{tenantId} 嵌套）。真实 TenantDb 的注入行为由 tenant-isolation.test.ts
 *      单独覆盖；本测试只锁"路由层契约 + wrapper 注入路径"组合后 tenantId 必现。
 *
 * 三 method 所有权校验差异（核心契约）：
 *   - GET：file 不存在 → 404 "File not found"；file 存在但 userId 不匹配 → **403**
 *     "无权访问此文件"（GET 显式区分不存在 vs 无权，泄露文件存在性给同租户他用户）。
 *   - PUT：!file || file.userId !== userId → 统一 **404** "文件不存在"（PUT 不区分，
 *     防止通过响应码探测他人文件存在性，与 GET 的 403 形成对照——本测试用同用户/他用户
 *     两用例显式锁定此差异）。
 *   - DELETE：!file || file.userId !== userId → 统一 **404** "文件不存在"（与 PUT 同范式）。
 *
 * PUT 字段校验链（按 body 字段出现顺序，遇首个非法即 400 短路）：
 *   tags 非数组 / isFavorite 非布尔 / isDeleted 非布尔 / deletedAt 非有效日期且非 null /
 *   fileHash 非 64 字符 hex 且非 null / folderId 非本人 / fileName > 255 / textContent > 1MB。
 *   folderId 特殊：值 "null" → folderId=null 跳过 folder 校验；其他字符串走
 *   tenantDb.folder.findFirst 校验归属（不存在或 userId 不匹配 → 400 "目标文件夹不存在"）。
 *
 * DELETE 路径安全非对称（核心契约）：
 *   - 主文件 file.filePath 越界（path.resolve 不以 ./upload 为前缀）→ **400**
 *     "Invalid file path"，短路不触达 $transaction。
 *   - 版本 v.filePath 越界 → **静默 continue**（跳过 unlink，不阻断后续），$transaction
 *     仍执行。本测试用"主文件路径合法 + 版本路径越界 → 200 success"用例显式锁定此非对称。
 *
 * DELETE 级联契约：db.$transaction([fileEmbedding.deleteMany, faceInstance.deleteMany,
 *   file.deleteMany])，三者 where 均含 fileId/id + tenantId（防越权删他租户数据）。
 *
 * Mock 策略：authenticateRequest / next/server / fs/promises.unlink 全部隔离；
 * createTenantDb 用 hand-written wrapper；raw db 的 file/fileEmbedding/faceInstance/
 * $transaction 用独立 mock；safeJsonParseArray 保持真实运行以覆盖 tags 解析路径。
 * params 以 Promise.resolve 提供，对齐 Next.js 16 动态路由签名。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db（DELETE 级联用，正向断言；file.findFirst 供"路由不绕过 tenantDb"负向断言）
  mockRawFileFindFirst,
  mockRawFileEmbeddingDeleteMany,
  mockRawFaceInstanceDeleteMany,
  mockRawFileDeleteMany,
  mockTransaction,
  // tenantDb wrapper 注入 tenantId 后的实际承接方
  mockTenantFileFindFirst,
  mockTenantFileUpdate,
  mockTenantFolderFindFirst,
  mockTenantFileVersionFindMany,
  // fs/promises.unlink（DELETE 主文件 + 版本文件 unlink）
  mockUnlink,
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
    // raw db
    mockRawFileFindFirst: vi.fn(),
    mockRawFileEmbeddingDeleteMany: vi.fn(),
    mockRawFaceInstanceDeleteMany: vi.fn(),
    mockRawFileDeleteMany: vi.fn(),
    mockTransaction: vi.fn(),
    // tenantDb
    mockTenantFileFindFirst: vi.fn(),
    mockTenantFileUpdate: vi.fn(),
    mockTenantFolderFindFirst: vi.fn(),
    mockTenantFileVersionFindMany: vi.fn(),
    // fs
    mockUnlink: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("fs/promises", () => ({
  default: { unlink: (...args: unknown[]) => mockUnlink(...args) },
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));
vi.mock("@/lib/db", () => ({
  // raw db：DELETE 级联用（正向断言）；file.findFirst 供"路由不绕过 tenantDb"负向断言。
  db: {
    file: {
      findFirst: (...args: unknown[]) => mockRawFileFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockRawFileDeleteMany(...args),
    },
    fileEmbedding: {
      deleteMany: (...args: unknown[]) => mockRawFileEmbeddingDeleteMany(...args),
    },
    faceInstance: {
      deleteMany: (...args: unknown[]) => mockRawFaceInstanceDeleteMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
  // createTenantDb：hand-written wrapper 模拟真实 TenantDb 的 tenantId 注入行为
  // （file/folder where 末尾追加 tenantId；fileVersion where 追加 file:{tenantId} 嵌套）。
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      file: {
        findFirst: (args: { where?: Record<string, unknown> }) =>
          mockTenantFileFindFirst({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
        update: (args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) =>
          mockTenantFileUpdate({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
      },
      folder: {
        findFirst: (args: { where?: Record<string, unknown> }) =>
          mockTenantFolderFindFirst({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
      },
      fileVersion: {
        findMany: (args: { where?: Record<string, unknown> }) =>
          mockTenantFileVersionFindMany({
            ...args,
            where: { ...(args.where || {}), file: { tenantId } },
          }),
      },
    };
  },
}));

import { GET, PUT, DELETE } from "@/app/api/files/[id]/route";

// 默认 owner 身份
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

// 上传目录绝对路径（与路由 path.resolve('./upload') 一致，避免 cwd 硬编码）
const uploadDir = path.resolve("./upload");
const safeFilePath = path.join(uploadDir, "user-1", "file-99.txt");
const evilFilePath = "/etc/passwd"; // 绝对路径，不在 upload 目录下
// 同级前缀目录：resolvedPath 以 uploadDir 字符串为前缀，但非 uploadDir + path.sep 子树。
// 旧 startsWith(uploadDir) 误过，新 startsWith(uploadDir + path.sep) 拦截——锁定 path.sep 修复
const siblingEvilFilePath = path.join(`${uploadDir}-evil`, "secret.txt");
const siblingEvilVersionPath = path.join(`${uploadDir}-evil`, "v1.txt");

type MockRes = InstanceType<typeof MockNextResponse>;

/**
 * 构造 hand-crafted 请求。PUT/DELETE 经 Request 构造器即可（json() / 无 body）。
 * URL 含动态 [id]，对齐真实路由形态。
 */
function makeGetRequest(id: string): NextRequest {
  return new Request(`http://localhost/api/files/${id}`, {
    method: "GET",
  }) as unknown as NextRequest;
}

function makePutRequest(id: string, body: unknown): NextRequest {
  return new Request(`http://localhost/api/files/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeDeleteRequest(id: string): NextRequest {
  return new Request(`http://localhost/api/files/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/files/[id] 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 默认 tenantDb.file.findFirst 返回归属当前用户的文件
    mockTenantFileFindFirst.mockResolvedValue({
      id: "file-99",
      userId: "user-1",
      tenantId: "tenant-1",
      fileName: "doc.pdf",
      fileType: "pdf",
      fileSize: 1024,
      filePath: safeFilePath,
      textContent: "hello",
      thumbnailUrl: null,
      tags: JSON.stringify(["t1", "t2"]),
      keyPoints: JSON.stringify(["p1"]),
      summary: null,
      storageMode: "cloud",
      isFavorite: false,
      isDeleted: false,
      deletedAt: null,
      folderId: null,
      fileHash: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    mockTenantFileUpdate.mockResolvedValue(undefined);
    mockTenantFolderFindFirst.mockResolvedValue(null);
    mockTenantFileVersionFindMany.mockResolvedValue([]);
    mockUnlink.mockResolvedValue(undefined);
    // 默认 $transaction 接收 promise 数组并全部 await
    mockTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });
    mockRawFileEmbeddingDeleteMany.mockResolvedValue({ count: 0 });
    mockRawFaceInstanceDeleteMany.mockResolvedValue({ count: 0 });
    mockRawFileDeleteMany.mockResolvedValue({ count: 1 });
  });

  describe("GET /api/files/[id] — 单文件查询", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockCreateTenantDb).not.toHaveBeenCalled();
      expect(mockTenantFileFindFirst).not.toHaveBeenCalled();
    });

    it("file 不存在（findFirst 返回 null）→ 404 { error: 'File not found' }", async () => {
      mockTenantFileFindFirst.mockResolvedValue(null);

      const res = (await GET(makeGetRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "File not found" });
    });

    it("file 存在但 userId 不匹配 → 403 { error: '无权访问此文件' }（GET 独有 403，与 PUT/DELETE 的 404 不同）", async () => {
      mockTenantFileFindFirst.mockResolvedValue({
        id: "file-99",
        userId: "other-user", // 非当前用户
        tenantId: "tenant-1",
        fileName: "secret.pdf",
        tags: null,
      });

      const res = (await GET(makeGetRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "无权访问此文件" });
    });

    it("成功 → 200，body 含 tags 解析；findFirst where 含 wrapper 注入的 tenantId；raw db.file.findFirst 恒不被调用", async () => {
      const res = (await GET(makeGetRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      // tags 经 safeJsonParseArray 解析为数组
      expect(res.body).toMatchObject({ id: "file-99", tags: ["t1", "t2"] });
      // wrapper 注入 tenantId 到 where
      expect(mockTenantFileFindFirst).toHaveBeenCalledWith({
        where: { id: "file-99", tenantId: "tenant-1" },
      });
      // 核心负向契约：路由不绕过 tenantDb 直连 raw db.file.findFirst
      expect(mockRawFileFindFirst).not.toHaveBeenCalled();
    });

    it("findFirst 抛错 → 500 { error: 'Failed to fetch file' }", async () => {
      mockTenantFileFindFirst.mockRejectedValue(new Error("db connection lost"));

      const res = (await GET(makeGetRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to fetch file" });
    });
  });

  describe("PUT /api/files/[id] — 更新文件元数据", () => {
    it("未认证 → 401 透传，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await PUT(makePutRequest("file-99", { tags: [] }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(401);
      expect(mockTenantFileFindFirst).not.toHaveBeenCalled();
      expect(mockTenantFileUpdate).not.toHaveBeenCalled();
    });

    it("file 不存在（findFirst 返回 null）→ 404 { error: '文件不存在' }（PUT 不区分不存在 vs 无权）", async () => {
      mockTenantFileFindFirst.mockResolvedValue(null);

      const res = (await PUT(makePutRequest("file-99", { tags: [] }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "文件不存在" });
      expect(mockTenantFileUpdate).not.toHaveBeenCalled();
    });

    it("file 存在但 userId 不匹配 → 404 { error: '文件不存在' }（与 GET 的 403 不同，PUT 统一 404 防探测）", async () => {
      mockTenantFileFindFirst.mockResolvedValue({
        id: "file-99",
        userId: "other-user",
        tenantId: "tenant-1",
        fileName: "secret.pdf",
      });

      const res = (await PUT(makePutRequest("file-99", { tags: [] }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "文件不存在" });
      expect(mockTenantFileUpdate).not.toHaveBeenCalled();
    });

    it("tags 非数组 → 400 { error: 'tags 必须是数组' }，不触达 update", async () => {
      const res = (await PUT(makePutRequest("file-99", { tags: "not-array" }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "tags 必须是数组" });
      expect(mockTenantFileUpdate).not.toHaveBeenCalled();
    });

    it("folderId 非本人（folder.findFirst 返回 null）→ 400 { error: '目标文件夹不存在' }", async () => {
      mockTenantFolderFindFirst.mockResolvedValue(null);

      const res = (await PUT(makePutRequest("file-99", { folderId: "folder-other" }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "目标文件夹不存在" });
      // folder 校验走 tenantDb（wrapper 注入 tenantId）
      expect(mockTenantFolderFindFirst).toHaveBeenCalledWith({
        where: { id: "folder-other", tenantId: "tenant-1" },
      });
      expect(mockTenantFileUpdate).not.toHaveBeenCalled();
    });

    it("folderId === 'null' → folderId 设为 null，跳过 folder 校验，update 成功", async () => {
      const res = (await PUT(makePutRequest("file-99", { folderId: "null" }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      // folderId 'null' 字符串特殊处理 → null，不触达 folder.findFirst
      expect(mockTenantFolderFindFirst).not.toHaveBeenCalled();
      // update 收到 where:{id,tenantId} + data:{folderId:null}
      expect(mockTenantFileUpdate).toHaveBeenCalledWith({
        where: { id: "file-99", tenantId: "tenant-1" },
        data: { folderId: null },
      });
    });

    it("fileHash 非 64 字符 hex → 400", async () => {
      const res = (await PUT(makePutRequest("file-99", { fileHash: "not-hex" }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(mockTenantFileUpdate).not.toHaveBeenCalled();
    });

    it("textContent > 1MB → 400 { error: 'textContent 不能超过1MB' }", async () => {
      const res = (await PUT(
        makePutRequest("file-99", { textContent: "x".repeat(1 * 1024 * 1024 + 1) }),
        ctx("file-99")
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "textContent 不能超过1MB" });
      expect(mockTenantFileUpdate).not.toHaveBeenCalled();
    });

    it("成功（多字段）→ update 收到 where:{id,tenantId} + data；findFirst 再读；返回 {...file, tags: parsed}", async () => {
      // update 后再 findFirst 返回更新后的文件
      const updatedFile = {
        id: "file-99",
        userId: "user-1",
        tenantId: "tenant-1",
        fileName: "renamed.pdf",
        fileType: "pdf",
        fileSize: 1024,
        filePath: safeFilePath,
        tags: JSON.stringify(["new-tag"]),
        isFavorite: true,
      };
      mockTenantFileFindFirst
        .mockResolvedValueOnce({ // 第一次：所有权校验
          id: "file-99",
          userId: "user-1",
          tenantId: "tenant-1",
          fileName: "doc.pdf",
        })
        .mockResolvedValueOnce(updatedFile); // 第二次：update 后再读

      const res = (await PUT(
        makePutRequest("file-99", { fileName: "renamed.pdf", isFavorite: true, tags: ["new-tag"] }),
        ctx("file-99")
      )) as MockRes;

      expect(res.status).toBe(200);
      // update 收到 wrapper 注入 tenantId 的 where + 多字段 data
      expect(mockTenantFileUpdate).toHaveBeenCalledWith({
        where: { id: "file-99", tenantId: "tenant-1" },
        data: {
          fileName: "renamed.pdf",
          isFavorite: true,
          tags: JSON.stringify(["new-tag"]),
        },
      });
      // 返回再读的结果，tags 经 safeJsonParseArray 解析
      expect(res.body).toMatchObject({ id: "file-99", fileName: "renamed.pdf", tags: ["new-tag"], isFavorite: true });
      // 核心负向契约：路由不绕过 tenantDb
      expect(mockRawFileFindFirst).not.toHaveBeenCalled();
    });

    it("update 抛错 → 500 { error: 'Failed to update file' }", async () => {
      mockTenantFileUpdate.mockRejectedValue(new Error("write conflict"));

      const res = (await PUT(makePutRequest("file-99", { tags: [] }), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to update file" });
    });
  });

  describe("DELETE /api/files/[id] — 删除文件", () => {
    it("未认证 → 401 透传，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(401);
      expect(mockTenantFileFindFirst).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("file 不存在（findFirst 返回 null）→ 404 { error: '文件不存在' }", async () => {
      mockTenantFileFindFirst.mockResolvedValue(null);

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "文件不存在" });
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("file 存在但 userId 不匹配 → 404 { error: '文件不存在' }（与 PUT 同范式，统一 404）", async () => {
      mockTenantFileFindFirst.mockResolvedValue({
        id: "file-99",
        userId: "other-user",
        tenantId: "tenant-1",
        fileName: "secret.pdf",
        filePath: null,
      });

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "文件不存在" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("file.filePath 越界（不在 ./upload 下）→ 400 { error: 'Invalid file path' }，不触达 $transaction（主文件路径安全 400）", async () => {
      mockTenantFileFindFirst.mockResolvedValue({
        id: "file-99",
        userId: "user-1",
        tenantId: "tenant-1",
        fileName: "evil.pdf",
        filePath: evilFilePath, // /etc/passwd，不在 upload 目录下
      });

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid file path" });
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("file.filePath 为 upload 同级前缀目录（upload-evil/secret.txt）→ 旧 startsWith(uploadDir) 误过，新 startsWith(uploadDir+path.sep) 拦截 400，不触达 $transaction", async () => {
      // resolvedPath 以 uploadDir 字符串为前缀但非 uploadDir + path.sep 子树：
      // 锁定 path.sep 修复（防止 /app/upload-evil/x 在 uploadDir=/app/upload 时误过）
      mockTenantFileFindFirst.mockResolvedValue({
        id: "file-99",
        userId: "user-1",
        tenantId: "tenant-1",
        fileName: "evil.pdf",
        filePath: siblingEvilFilePath,
      });

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid file path" });
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("成功 → unlink(filePath) + fileVersion.findMany + $transaction([fileEmbedding/faceInstance/file deleteMany])；返回 { success: true }", async () => {
      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      // unlink 主文件（filePath 在 upload 目录下）
      expect(mockUnlink).toHaveBeenCalledWith(safeFilePath);
      // fileVersion 经 tenantDb（wrapper 注入 file:{tenantId} 嵌套）
      expect(mockTenantFileVersionFindMany).toHaveBeenCalledWith({
        where: { fileId: "file-99", file: { tenantId: "tenant-1" } },
        select: { filePath: true },
      });
      // 级联 $transaction：三者 where 均含 fileId/id + tenantId
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockRawFileEmbeddingDeleteMany).toHaveBeenCalledWith({
        where: { fileId: "file-99", tenantId: "tenant-1" },
      });
      expect(mockRawFaceInstanceDeleteMany).toHaveBeenCalledWith({
        where: { fileId: "file-99", file: { tenantId: "tenant-1" } },
      });
      expect(mockRawFileDeleteMany).toHaveBeenCalledWith({
        where: { id: "file-99", tenantId: "tenant-1" },
      });
      // 核心负向契约：所有权校验走 tenantDb，不绕过直连 raw db.file.findFirst
      expect(mockRawFileFindFirst).not.toHaveBeenCalled();
    });

    it("version filePath 越界 → 静默 continue（不 unlink 版本文件），$transaction 仍执行（版本路径安全静默 skip 与主文件 400 非对称）", async () => {
      mockTenantFileVersionFindMany.mockResolvedValue([
        { filePath: evilFilePath }, // 版本路径越界 → continue 跳过 unlink
        { filePath: path.join(uploadDir, "user-1", "v1.txt") }, // 合法 → unlink
      ]);

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      // 主文件 unlink 1 次 + 合法版本 unlink 1 次 = 2 次（越界版本跳过）
      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenCalledWith(safeFilePath); // 主文件
      expect(mockUnlink).toHaveBeenCalledWith(path.join(uploadDir, "user-1", "v1.txt")); // 合法版本
      // $transaction 仍执行（版本路径越界不阻断级联删除）
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it("version filePath 为 upload 同级前缀目录（upload-evil/v1.txt）→ 旧 startsWith(uploadDir) 误过会误删，新 startsWith(uploadDir+path.sep) 拦截 continue 跳过 unlink", async () => {
      // 主文件路径合法，仅版本路径为同级前缀目录：
      // 锁定版本清理路径的 path.sep 修复（防止误删 /app/upload-evil/x 下的版本文件）
      mockTenantFileVersionFindMany.mockResolvedValue([
        { filePath: siblingEvilVersionPath }, // 同级前缀 → continue 跳过 unlink
      ]);

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      // 仅主文件 unlink 1 次（同级前缀版本跳过）
      expect(mockUnlink).toHaveBeenCalledTimes(1);
      expect(mockUnlink).toHaveBeenCalledWith(safeFilePath);
      expect(mockUnlink).not.toHaveBeenCalledWith(siblingEvilVersionPath);
      // $transaction 仍执行
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it("$transaction 抛错 → 500 { error: 'Failed to delete file' }", async () => {
      mockTransaction.mockRejectedValue(new Error("tx aborted"));

      const res = (await DELETE(makeDeleteRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to delete file" });
    });
  });
});
