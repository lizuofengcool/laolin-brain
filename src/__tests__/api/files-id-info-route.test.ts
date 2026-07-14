/**
 * files/[id]/info 路由 handler 级集成测试
 *
 * 锁定 /api/files/[id]/info 路由层（GET）的安全与控制流契约。本轮新增：
 *   1. **路径穿越防御**：includeContent=true 时回退从文件系统读取文本内容的分支，
 *      必须校验 file.filePath 经 path.resolve 后位于 upload 目录内
 *      （startsWith(uploadDir + path.sep) || === uploadDir），与 download/preview/restore
 *      一致。原实现直接 fs.existsSync/readFileSync(file.filePath) 无守卫——若 DB
 *      中 filePath 被篡改为 /etc/passwd，会把系统文件内容回填到响应里。本测试用
 *      "完全越界 + 同级前缀目录"两类恶意路径显式锁定 readFile 恒不被调用。
 *   2. **异步 I/O**：原 fs.existsSync/readFileSync 为同步 API，阻塞 Node 事件循环；
 *      本轮改为 fs/promises.readFile。本测试通过 mock fs/promises.readFile 并断言
 *      fs（同步 fs）default 不被 import 使用，锁定异步路径（间接：断言 readFile
 *      被调用、调用参数为 filePath）。
 *
 * 内容来源优先级（核心契约）：
 *   - file.textContent 非空 → 直接用 DB 内容，readFile 恒不调用。
 *   - file.textContent 空 + file.filePath 非空 + 路径在 upload 内 → readFile(filePath)。
 *   - file.textContent 空 + 路径越界 → 静默跳过，不回填 textContent，readFile 不调用，响应仍 200。
 *
 * 路径安全边界（与 download/preview/restore 同范式，path.sep 锁定）：
 *   - resolvedPath === uploadDir → 合法（upload 根目录本身，边界用例）。
 *   - resolvedPath = uploadDir + path.sep + ... → 合法（upload 子树）。
 *   - resolvedPath = "/etc/passwd"（完全越界）→ 非法，跳过读取。
 *   - resolvedPath = uploadDir + "-evil" + path.sep + "secret.txt"（同级前缀目录，
 *     旧 startsWith(uploadDir) 会误过，新 startsWith(uploadDir + path.sep) 拦截）→ 非法，跳过。
 *
 * 其余契约：未认证 → 401 透传；findFirst 返回 null → 404 "文件不存在"；
 * isText=false 时即使 includeContent=true 也不触达 fs（仅文本文件可读内容）。
 *
 * Mock 策略：authenticateRequest / next/server / fs/promises.readFile 隔离；
 * createTenantDb 用 hand-written wrapper 仅暴露 file.findFirst（info 路由唯一 DB 调用）；
 * path 保持真实运行（path.resolve 行为是契约核心）。params 以 Promise.resolve 提供对齐 Next 16。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  mockTenantFileFindFirst,
  mockReadFile,
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
    mockTenantFileFindFirst: vi.fn(),
    mockReadFile: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
// fs/promises：路由顶部 named import（readFile）。提供 default 兜底对齐仓库 ESM 互操作范式。
vi.mock("fs/promises", () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));
vi.mock("@/lib/db", () => ({
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      file: {
        // info 路由 where 含 { id, userId, isDeleted:false }；wrapper 仅透传，不注入
        // tenantId（与 files-id-route.test 的注入 wrapper 不同——此处聚焦路径安全，
        // tenantId 注入契约由 tenant-isolation.test / files-id-route.test 覆盖）
        findFirst: (args: { where?: Record<string, unknown> }) =>
          mockTenantFileFindFirst(args),
      },
    };
  },
}));

import { GET } from "@/app/api/files/[id]/info/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

// 上传目录绝对路径（与路由 path.resolve(path.join(process.cwd(),'upload')) 一致）
const uploadDir = path.resolve(path.join(process.cwd(), "upload"));
const safeFilePath = path.join(uploadDir, "user-1", "notes.md");
const siblingEvilPath = path.join(`${uploadDir}-evil`, "secret.txt");

type MockRes = InstanceType<typeof MockNextResponse>;

function makeInfoRequest(id: string, includeContent = false): NextRequest {
  const url = new URL(`http://localhost/api/files/${id}/info`);
  if (includeContent) url.searchParams.set("includeContent", "true");
  return new Request(url, { method: "GET" }) as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** 构造一个归属 owner 的文本文件记录（isTextFile 经扩展名 .md 判定） */
function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-99",
    userId: "user-1",
    tenantId: "tenant-1",
    fileName: "notes.md",
    fileType: "document",
    fileSize: 100,
    filePath: safeFilePath,
    textContent: null,
    folderId: null,
    isFavorite: false,
    tags: JSON.stringify(["t1"]),
    keyPoints: JSON.stringify(["p1"]),
    summary: null,
    storageMode: "local",
    syncStatus: null,
    lastSyncAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("/api/files/[id]/info 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockTenantFileFindFirst.mockResolvedValue(makeFile());
    mockReadFile.mockResolvedValue("line1\nline2\n");
  });

  describe("GET /api/files/[id]/info — 元数据与认证", () => {
    it("未认证 → 401 透传 authenticateRequest，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeInfoRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockCreateTenantDb).not.toHaveBeenCalled();
      expect(mockTenantFileFindFirst).not.toHaveBeenCalled();
    });

    it("findFirst 返回 null → 404 { error: '文件不存在' }", async () => {
      mockTenantFileFindFirst.mockResolvedValue(null);

      const res = (await GET(makeInfoRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "文件不存在" });
    });

    it("成功（无 includeContent）→ 200，返回元数据；findFirst where 含 {id,userId,isDeleted:false}；readFile 恒不调用", async () => {
      const res = (await GET(makeInfoRequest("file-99"), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: { id: "file-99", fileName: "notes.md", isTextFile: true },
      });
      expect(mockTenantFileFindFirst).toHaveBeenCalledWith({
        where: { id: "file-99", userId: "user-1", isDeleted: false },
      });
      // 无 includeContent → 不触达文件系统
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("isText=false（image）+ includeContent=true → readFile 恒不调用（仅文本文件可读内容）", async () => {
      mockTenantFileFindFirst.mockResolvedValue(
        makeFile({ fileName: "photo.jpg", fileType: "image" })
      );

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  describe("GET ?includeContent=true — 内容来源优先级", () => {
    it("file.textContent 非空 → 用 DB 内容，readFile 不调用；回填 textContent/行数/字符数", async () => {
      mockTenantFileFindFirst.mockResolvedValue(
        makeFile({ textContent: "hello\nworld" })
      );

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        textContent: "hello\nworld",
        textLineCount: 2,
        textCharCount: 11,
      });
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("textContent 空 + filePath 在 upload 内 → readFile(filePath,'utf-8')，回填内容", async () => {
      mockReadFile.mockResolvedValue("from disk\nline2");

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body.data.textContent).toBe("from disk\nline2");
      expect(res.body.data.textLineCount).toBe(2);
      expect(res.body.data.textCharCount).toBe("from disk\nline2".length);
      // 异步 fs/promises.readFile 被调用（而非同步 fs.readFileSync）
      expect(mockReadFile).toHaveBeenCalledTimes(1);
      expect(mockReadFile).toHaveBeenCalledWith(safeFilePath, "utf-8");
    });

    it("textContent 空 + content > 1MB → 截断到 1MB，textTruncated=true，行/字符数仍按原文统计", async () => {
      const big = "x".repeat(1024 * 1024 + 10);
      mockReadFile.mockResolvedValue(big);

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body.data.textTruncated).toBe(true);
      expect(res.body.data.textContent.length).toBe(1024 * 1024);
      expect(res.body.data.textCharCount).toBe(big.length);
    });
  });

  describe("GET ?includeContent=true — 路径穿越防御（纵深防御核心）", () => {
    it("filePath 完全越界（/etc/passwd）→ readFile 恒不调用，响应仍 200，不泄露内容", async () => {
      mockTenantFileFindFirst.mockResolvedValue(
        makeFile({ filePath: "/etc/passwd" })
      );

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      // 元数据正常返回，但 textContent 不被回填（不泄露系统文件内容）
      expect(res.body.data).toMatchObject({ id: "file-99", fileName: "notes.md" });
      expect(res.body.data).not.toHaveProperty("textContent");
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("filePath 为 upload 同级前缀目录（upload-evil/secret.txt）→ 旧 startsWith(uploadDir) 误过，新 startsWith(uploadDir+path.sep) 拦截，readFile 不调用", async () => {
      // uploadDir = <cwd>/upload；本路径 = <cwd>/upload-evil/secret.txt
      // 不以 uploadDir + path.sep 为前缀，但以 uploadDir 字符串为前缀 → 锁定 path.sep 修复
      mockTenantFileFindFirst.mockResolvedValue(
        makeFile({ filePath: siblingEvilPath })
      );

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty("textContent");
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("filePath 等于 upload 根目录本身（边界用例）→ 合法，readFile 调用（===uploadDir 放行）", async () => {
      mockTenantFileFindFirst.mockResolvedValue(
        makeFile({ filePath: uploadDir })
      );
      mockReadFile.mockResolvedValue("root-content");

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body.data.textContent).toBe("root-content");
      expect(mockReadFile).toHaveBeenCalledWith(uploadDir, "utf-8");
    });

    it("readFile 抛错（文件不存在于磁盘/云存储已迁移）→ 200，textContent=null，textReadError 回填，不 500", async () => {
      mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const res = (await GET(makeInfoRequest("file-99", true), ctx("file-99"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body.data.textContent).toBeNull();
      expect(res.body.data.textReadError).toBe("读取文件内容失败");
    });
  });
});
