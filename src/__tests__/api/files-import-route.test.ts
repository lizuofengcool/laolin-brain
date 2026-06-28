/**
 * files/import 路由 handler 级集成测试
 *
 * 锁定 /api/files/import 路由层（POST）的安全与控制流契约。本路由在第四十一轮已从
 * raw db 迁移到 TenantDb（4/5 db 调用改走 tenantDb.folder.findUnique/findFirst/create
 * + tenantDb.file.create，仅 $queryRaw 保留 db 直连因 TenantDb 不代理 raw SQL）。本轮
 * 补测与第四十一轮迁移形成"先迁移后补测"的闭环。
 *
 * 核心安全契约（双重锁定）：
 *   1. **路由不绕过 tenantDb**：通过"分离 raw db mock 与 tenantDb mock"实现——
 *      mockRawFolder 系列 + mockRawFileCreate 恒不被调用（负向断言），
 *      mockTenantFolder 系列 + mockTenantFileCreate 承接路由的所有 folder/file 调用
 *      （正向断言）。若未来重构回 raw db 手动 where，负向断言立即失败。
 *   2. **tenantId 经 wrapper 强制注入**：hand-written createTenantDb mock 模拟真实 TenantDb
 *      的注入行为（where/data 末尾追加 tenantId），测试断言 mockTenantFolder 系列 +
 *      mockTenantFileCreate 收到的 where/data 含 tenantId。真实 TenantDb 的注入行为由
 *      tenant-isolation.test.ts 单独覆盖；本测试只锁"路由层契约 + wrapper 注入路径"组合后
 *      tenantId 必现。
 *
 * 前置校验三道（按顺序短路）：
 *   - ①Content-Length > 50MB → 413（在 request.json 之前，避免读大 body）。
 *   - ②files 缺失或非数组 → 400 { error: 'files 必须是一个数组' }。
 *   - ③files.length > 500 → 400 { error: '单次最多导入500个文件' }。
 *
 * $queryRaw 配额查询契约：
 *   - SQL 模板内显式带 "userId" / "tenantId" / "isDeleted" = false 三键（活跃文件配额，
 *     不含回收站）。mockQueryRaw 收到的 tagged template values[0]=userId、values[1]=tenantId。
 *   - 返回 [{ totalSize: bigint }]，路由 Number(currentTotal) 转换后与 totalImportSize
 *     累加比对 5GB 上限。$queryRaw 抛错 → 500 { error: '数据导入失败' }（catch-all）。
 *
 * folder 导入控制流：
 *   - name 校验（缺失/非字符串/>255 → continue 跳过，不调 findUnique/create）。
 *   - parentId 校验走 tenantDb.folder.findUnique({where:{id}})：wrapper 注入 tenantId，
 *     跨租户/不存在均返回 null（DB 层强制）；JS 侧再比对 parentFolder.userId !== userId
 *     → 设 parentId=null（防跨用户挂载到他人文件夹下）。
 *   - tenantDb.folder.create({data:{userId,name,parentId,createdAt}})：wrapper 注入 tenantId。
 *   - per-item try/catch 容错：单个 folder.create 抛错不阻断后续；folders 不计入 importedCount。
 *
 * file 导入控制流（按顺序短路）：
 *   - fileName 校验（同 name 规则）。
 *   - fileSize 累加 + 配额超限 break（停止后续 file，已成功的保留）。
 *   - fileSize 值校验（非数/负/>5GB → continue 跳过）。
 *   - textContent > 5MB → 跳过。
 *   - tags > 50 项 或 单 tag > 100 字符 → 跳过。
 *   - folderId 校验走 tenantDb.folder.findFirst({where:{id,userId},select:{id}})：wrapper
 *     注入 tenantId，不存在 → 设 folderId=null（silently ignore invalid folder reference）。
 *   - tenantDb.file.create({data:{userId,fileName,fileType,...,createdAt}})：wrapper 注入
 *     tenantId。fileType 不在白名单 → 落为 "other"。
 *   - per-item try/catch 容错：单个 file.create 抛错 → importedCount 不增，后续 file 继续。
 *
 * 响应契约：{ success:true, importedCount, skippedCount: files.length - importedCount,
 * message: `成功导入 ${importedCount} 个文件` }。
 *
 * 复用第四十轮 trash-route.test.ts 的 vi.hoisted + MockNextResponse 范式。raw db 与
 * tenantDb 用独立 mock 分离，使"路由是否绕过 tenantDb"可显式负向断言。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  mockRawFolderFindFirst,
  mockRawFolderFindUnique,
  mockRawFolderCreate,
  mockRawFileCreate,
  mockQueryRaw,
  mockTenantFolderFindUnique,
  mockTenantFolderFindFirst,
  mockTenantFolderCreate,
  mockTenantFileCreate,
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
    // raw db（仅 $queryRaw 被路由直接使用；folder/file 方法供"路由不应绕过 tenantDb"负向断言）
    mockRawFolderFindFirst: vi.fn(),
    mockRawFolderFindUnique: vi.fn(),
    mockRawFolderCreate: vi.fn(),
    mockRawFileCreate: vi.fn(),
    mockQueryRaw: vi.fn(),
    // tenantDb wrapper 注入 tenantId 后的实际承接方
    mockTenantFolderFindUnique: vi.fn(),
    mockTenantFolderFindFirst: vi.fn(),
    mockTenantFolderCreate: vi.fn(),
    mockTenantFileCreate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  // raw db：仅 $queryRaw 被路由直接使用（配额查询）；folder/file 方法供"路由不应绕过
  // tenantDb"的负向断言使用（mockRawFolder*/mockRawFileCreate 恒不被调用）。
  db: {
    folder: {
      findFirst: (...args: unknown[]) => mockRawFolderFindFirst(...args),
      findUnique: (...args: unknown[]) => mockRawFolderFindUnique(...args),
      create: (...args: unknown[]) => mockRawFolderCreate(...args),
    },
    file: {
      create: (...args: unknown[]) => mockRawFileCreate(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
  // createTenantDb：hand-written wrapper 模拟真实 TenantDb 的 tenantId 注入行为
  // （where/data 末尾追加 tenantId）。路由层契约（用 tenantDb 不用 raw db）+ wrapper
  // 注入契约（tenantId 出现在 where/data）双重锁定。真实 TenantDb 的注入行为由
  // tenant-isolation.test.ts 单独覆盖，此处不重复测试 wrapper 实现细节。
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      folder: {
        findUnique: (args: { where?: Record<string, unknown> }) =>
          mockTenantFolderFindUnique({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
        findFirst: (args: { where?: Record<string, unknown> }) =>
          mockTenantFolderFindFirst({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
        create: (args: { data?: Record<string, unknown> }) =>
          mockTenantFolderCreate({
            ...args,
            data: { ...(args.data || {}), tenantId },
          }),
      },
      file: {
        create: (args: { data?: Record<string, unknown> }) =>
          mockTenantFileCreate({
            ...args,
            data: { ...(args.data || {}), tenantId },
          }),
      },
    };
  },
}));

import { POST } from "@/app/api/files/import/route";

// 默认 owner 身份
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

// 5GB 上限（字节）
const FIVE_GB = 5 * 1024 * 1024 * 1024;

/**
 * 构造 POST 请求。Content-Length 是 fetch forbidden header，无法经 Request 构造器
 * 显式设置（undici 会用实际 body 大小覆盖），故用 hand-crafted 对象 + spy 覆盖
 * headers.get，使路由的 `request.headers.get("content-length")` 返回受控值。
 * 同时提供 json() 供路由读取 body。
 */
function makeRequest(opts: { body?: unknown; contentLength?: number } = {}): NextRequest {
  const headers = new Headers();
  const req = {
    method: "POST",
    url: "http://localhost/api/files/import",
    headers,
    json: async () => opts.body ?? {},
  } as unknown as NextRequest;
  if (opts.contentLength !== undefined) {
    vi.spyOn(headers, "get").mockImplementation((name: string) => {
      if (name.toLowerCase() === "content-length") return String(opts.contentLength);
      return null;
    });
  }
  return req;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/files/import 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 默认配额查询返回 0 字节已用
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // 默认 folder/file create 成功
    mockTenantFolderCreate.mockResolvedValue({ id: "folder-new" });
    mockTenantFileCreate.mockResolvedValue({ id: "file-new" });
    // 默认 folder 查找返回 null（parent/folder 不存在）
    mockTenantFolderFindUnique.mockResolvedValue(null);
    mockTenantFolderFindFirst.mockResolvedValue(null);
  });

  describe("前置校验三道（按顺序短路）", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await POST(makeRequest({ body: { files: [] } }))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockCreateTenantDb).not.toHaveBeenCalled();
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it("Content-Length > 50MB → 413 { error: 'Request body exceeds 50MB limit' }，在 request.json 之前短路", async () => {
      const res = (await POST(
        makeRequest({ body: { files: [] }, contentLength: 50 * 1024 * 1024 + 1 })
      )) as MockRes;

      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: "Request body exceeds 50MB limit" });
      // 413 在 $queryRaw 之前短路
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it("files 缺失 → 400 { error: 'files 必须是一个数组' }", async () => {
      const res = (await POST(makeRequest({ body: {} }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "files 必须是一个数组" });
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it("files 非数组 → 400", async () => {
      const res = (await POST(makeRequest({ body: { files: "not-array" } }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "files 必须是一个数组" });
    });

    it("files.length > 500 → 400 { error: '单次最多导入500个文件' }", async () => {
      const files = Array.from({ length: 501 }, () => ({ fileName: "f" }));

      const res = (await POST(makeRequest({ body: { files } }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "单次最多导入500个文件" });
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });
  });

  describe("$queryRaw 配额查询契约", () => {
    it("默认 → $queryRaw 收到含 userId+tenantId 的 SQL 模板（isDeleted=false）；返回 200 {success, importedCount:0, skippedCount:0}", async () => {
      const res = (await POST(makeRequest({ body: { files: [] } }))) as MockRes;

      expect(res.status).toBe(200);
      // $queryRaw 是 tagged template：calls[0] = [strings, ...values]
      // values[0]=userId, values[1]=tenantId（按 SQL 模板插值顺序）
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      const call = mockQueryRaw.mock.calls[0] as unknown[];
      expect(call[1]).toBe("user-1");   // userId 插值
      expect(call[2]).toBe("tenant-1"); // tenantId 插值
      // SQL 模板字符串含三键：userId / tenantId / isDeleted = false（活跃文件配额）
      const sqlStrings = call[0] as readonly string[];
      const sqlJoined = sqlStrings.join("${}");
      expect(sqlJoined).toContain('"userId"');
      expect(sqlJoined).toContain('"tenantId"');
      expect(sqlJoined).toContain('"isDeleted" = false');
      // 响应契约
      expect(res.body).toEqual({
        success: true,
        importedCount: 0,
        skippedCount: 0,
        message: "成功导入 0 个文件",
      });
    });

    it("$queryRaw 抛错 → 500 { error: '数据导入失败' }（catch-all 兜底）", async () => {
      mockQueryRaw.mockRejectedValue(new Error("db connection lost"));

      const res = (await POST(makeRequest({ body: { files: [] } }))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "数据导入失败" });
      // 抛错后不触达任何 tenantDb 调用
      expect(mockTenantFolderCreate).not.toHaveBeenCalled();
      expect(mockTenantFileCreate).not.toHaveBeenCalled();
    });
  });

  describe("createTenantDb + tenantId 注入契约", () => {
    it("createTenantDb 以 auth.tenantId 构造；raw db 的 folder/file 方法恒不被调用（路由不绕过 tenantDb）", async () => {
      await POST(makeRequest({ body: { files: [] } })) as MockRes;

      // 正向：createTenantDb 收到 auth.tenantId
      expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
      // 核心负向契约：路由不得绕过 tenantDb 直连 raw db 的 folder/file
      expect(mockRawFolderFindFirst).not.toHaveBeenCalled();
      expect(mockRawFolderFindUnique).not.toHaveBeenCalled();
      expect(mockRawFolderCreate).not.toHaveBeenCalled();
      expect(mockRawFileCreate).not.toHaveBeenCalled();
    });
  });

  describe("folder 导入", () => {
    it("parentId 存在且归属当前用户 → findUnique({where:{id,tenantId}}) + create({data:{userId,name,parentId,createdAt,tenantId}})", async () => {
      mockTenantFolderFindUnique.mockResolvedValue({ id: "parent-1", userId: "user-1" });

      const res = (await POST(
        makeRequest({
          body: {
            files: [],
            folders: [{ name: "新文件夹", parentId: "parent-1", createdAt: "2026-01-01T00:00:00Z" }],
          },
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      // findUnique 收到 wrapper 注入 tenantId 后的 where
      expect(mockTenantFolderFindUnique).toHaveBeenCalledWith({
        where: { id: "parent-1", tenantId: "tenant-1" },
      });
      // create 收到 wrapper 注入 tenantId 后的 data
      expect(mockTenantFolderCreate).toHaveBeenCalledTimes(1);
      expect(mockTenantFolderCreate.mock.calls[0][0]).toEqual({
        data: {
          userId: "user-1",
          name: "新文件夹",
          parentId: "parent-1",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          tenantId: "tenant-1",
        },
      });
    });

    it("parentId 不存在（findUnique 返回 null）→ create 时 parentId=null", async () => {
      mockTenantFolderFindUnique.mockResolvedValue(null);

      await POST(
        makeRequest({
          body: {
            files: [],
            folders: [{ name: "孤儿文件夹", parentId: "nonexistent" }],
          },
        })
      ) as MockRes;

      expect(mockTenantFolderFindUnique).toHaveBeenCalledWith({
        where: { id: "nonexistent", tenantId: "tenant-1" },
      });
      expect(mockTenantFolderCreate.mock.calls[0][0]).toEqual({
        data: {
          userId: "user-1",
          name: "孤儿文件夹",
          parentId: null,
          createdAt: expect.any(Date),
          tenantId: "tenant-1",
        },
      });
    });

    it("parentId 跨用户（userId 不匹配）→ create 时 parentId=null（防跨用户挂载）", async () => {
      mockTenantFolderFindUnique.mockResolvedValue({ id: "parent-1", userId: "other-user" });

      await POST(
        makeRequest({
          body: {
            files: [],
            folders: [{ name: "f", parentId: "parent-1" }],
          },
        })
      ) as MockRes;

      // wrapper 仍注入 tenantId（DB 层已强制），但 JS 侧 userId 比对失败 → parentId=null
      expect(mockTenantFolderCreate.mock.calls[0][0]).toEqual({
        data: {
          userId: "user-1",
          name: "f",
          parentId: null,
          createdAt: expect.any(Date),
          tenantId: "tenant-1",
        },
      });
    });

    it("folder.name 缺失/非字符串/>255 → continue 跳过（不调 findUnique / create）", async () => {
      await POST(
        makeRequest({
          body: {
            files: [],
            folders: [
              { parentId: "p1" },                        // name 缺失
              { name: 123, parentId: "p2" },             // name 非字符串
              { name: "x".repeat(256), parentId: "p3" }, // name > 255
            ],
          },
        })
      ) as MockRes;

      expect(mockTenantFolderFindUnique).not.toHaveBeenCalled();
      expect(mockTenantFolderCreate).not.toHaveBeenCalled();
    });

    it("folder.create 抛错 → per-item 容错（不阻断后续；folders 不计入 importedCount）", async () => {
      mockTenantFolderCreate.mockRejectedValue(new Error("unique constraint"));

      const res = (await POST(
        makeRequest({
          body: {
            files: [],
            folders: [{ name: "f" }],
          },
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockTenantFolderCreate).toHaveBeenCalledTimes(1);
      // folders 不计入 importedCount；files 为空 → importedCount=0、skippedCount=0
      expect(res.body).toMatchObject({ importedCount: 0, skippedCount: 0 });
    });
  });

  describe("file 导入", () => {
    it("默认成功 → folder.findFirst({where:{id,userId,tenantId},select:{id}}) + file.create({data:{userId,fileName,...,tenantId}})", async () => {
      mockTenantFolderFindFirst.mockResolvedValue({ id: "folder-1" });

      const res = (await POST(
        makeRequest({
          body: {
            files: [
              {
                fileName: "doc.pdf",
                fileType: "pdf",
                fileSize: 1024,
                textContent: "hello",
                folderId: "folder-1",
                tags: ["t1", "t2"],
                keyPoints: ["p1"],
                isFavorite: true,
                summary: "s",
                createdAt: "2026-01-01T00:00:00Z",
              },
            ],
          },
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      // folderId 校验：findFirst 收到 wrapper 注入 tenantId 后的 where
      expect(mockTenantFolderFindFirst).toHaveBeenCalledWith({
        where: { id: "folder-1", userId: "user-1", tenantId: "tenant-1" },
        select: { id: true },
      });
      // file.create 收到 wrapper 注入 tenantId 后的 data（13 字段：12 路由字段 + tenantId）
      expect(mockTenantFileCreate).toHaveBeenCalledTimes(1);
      expect(mockTenantFileCreate.mock.calls[0][0]).toEqual({
        data: {
          userId: "user-1",
          fileName: "doc.pdf",
          fileType: "pdf",
          fileSize: 1024,
          textContent: "hello",
          storageMode: "cloud",
          folderId: "folder-1",
          tags: JSON.stringify(["t1", "t2"]),
          isFavorite: true,
          summary: "s",
          keyPoints: JSON.stringify(["p1"]),
          createdAt: new Date("2026-01-01T00:00:00Z"),
          tenantId: "tenant-1",
        },
      });
      expect(res.body).toMatchObject({ importedCount: 1, skippedCount: 0 });
    });

    it("fileType 不在白名单 → fileType 落为 'other'", async () => {
      await POST(
        makeRequest({
          body: { files: [{ fileName: "f.bin", fileType: "executable" }] },
        })
      ) as MockRes;

      expect(mockTenantFileCreate.mock.calls[0][0].data.fileType).toBe("other");
    });

    it("folderId 不存在（findFirst 返回 null）→ file.create 时 folderId=null（silently ignore）", async () => {
      mockTenantFolderFindFirst.mockResolvedValue(null);

      await POST(
        makeRequest({
          body: { files: [{ fileName: "f", folderId: "nonexistent" }] },
        })
      ) as MockRes;

      expect(mockTenantFolderFindFirst).toHaveBeenCalledWith({
        where: { id: "nonexistent", userId: "user-1", tenantId: "tenant-1" },
        select: { id: true },
      });
      expect(mockTenantFileCreate.mock.calls[0][0].data.folderId).toBe(null);
    });

    it("fileName 缺失/非字符串/>255 → continue 跳过（不调 file.create）", async () => {
      await POST(
        makeRequest({
          body: {
            files: [
              { fileSize: 10 },                  // fileName 缺失
              { fileName: 123 },                 // fileName 非字符串
              { fileName: "x".repeat(256) },     // fileName > 255
            ],
          },
        })
      ) as MockRes;

      expect(mockTenantFileCreate).not.toHaveBeenCalled();
    });

    it("fileSize 为负 → continue 跳过", async () => {
      await POST(
        makeRequest({ body: { files: [{ fileName: "f", fileSize: -1 }] } })
      ) as MockRes;

      expect(mockTenantFileCreate).not.toHaveBeenCalled();
    });

    it("fileSize > 5GB → continue 跳过", async () => {
      await POST(
        makeRequest({ body: { files: [{ fileName: "f", fileSize: FIVE_GB + 1 }] } })
      ) as MockRes;

      expect(mockTenantFileCreate).not.toHaveBeenCalled();
    });

    it("textContent > 5MB → continue 跳过", async () => {
      await POST(
        makeRequest({
          body: { files: [{ fileName: "f", textContent: "x".repeat(5 * 1024 * 1024 + 1) }] },
        })
      ) as MockRes;

      expect(mockTenantFileCreate).not.toHaveBeenCalled();
    });

    it("tags > 50 项 → continue 跳过", async () => {
      const tags = Array.from({ length: 51 }, () => "t");

      await POST(
        makeRequest({ body: { files: [{ fileName: "f", tags }] } })
      ) as MockRes;

      expect(mockTenantFileCreate).not.toHaveBeenCalled();
    });

    it("单个 tag > 100 字符 → continue 跳过", async () => {
      await POST(
        makeRequest({
          body: { files: [{ fileName: "f", tags: ["x".repeat(101)] }] },
        })
      ) as MockRes;

      expect(mockTenantFileCreate).not.toHaveBeenCalled();
    });

    it("配额超限 → break（后续 file 不创建，importedCount 仅含已成功的）", async () => {
      // 当前已用 5368709020 字节（距 5GB 上限差 100 字节）
      mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(5368709020) }]);

      const res = (await POST(
        makeRequest({
          body: {
            files: [
              { fileName: "f1", fileSize: 50 },   // 50 ≤ 100 余量 → 成功
              { fileName: "f2", fileSize: 200 },  // 50+200=250 > 100 余量 → break
              { fileName: "f3", fileSize: 10 },   // 不触达（break 后跳出循环）
            ],
          },
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      // 仅 f1 创建，f2 配额超限 break、f3 未触达
      expect(mockTenantFileCreate).toHaveBeenCalledTimes(1);
      expect(mockTenantFileCreate.mock.calls[0][0].data.fileName).toBe("f1");
      // importedCount=1, skippedCount = files.length(3) - importedCount(1) = 2
      expect(res.body).toMatchObject({ importedCount: 1, skippedCount: 2 });
    });

    it("file.create 抛错 → per-item 容错（importedCount 不增，后续 file 继续）", async () => {
      mockTenantFileCreate
        .mockRejectedValueOnce(new Error("disk full"))
        .mockResolvedValueOnce({ id: "f2" });

      const res = (await POST(
        makeRequest({
          body: { files: [{ fileName: "f1" }, { fileName: "f2" }] },
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      // f1 抛错被 catch、f2 成功 → 两次 create 调用
      expect(mockTenantFileCreate).toHaveBeenCalledTimes(2);
      // importedCount=1（仅 f2）, skippedCount = 2 - 1 = 1
      expect(res.body).toMatchObject({ importedCount: 1, skippedCount: 1 });
    });
  });
});
