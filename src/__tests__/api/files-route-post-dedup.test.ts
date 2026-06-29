/**
 * files/route.ts 主路由 handler 级集成测试 —— POST dedup 版本化分支专轮（子轮②b）
 *
 * 锁定 /api/files 主路由 POST 的"dedup 版本化分支"：通过全部前置校验门（子轮①已覆盖）+
 * magic bytes 合法 + writeFile 落盘成功 + dedup file.findFirst 返回 existingFile（同名
 * 存在文件）→ 进入 db.$transaction(async (tx) => { tx.fileVersion.count +
 * tx.fileVersion.create（快照旧文件）+ tx.file.update（写入新文件字段） }) → unlink 旧
 * filePath → 200 响应 { isVersionUpdate: true }。
 *
 * 子轮②b 仅覆盖"dedup 版本化分支"（existingFile !== null）。新建分支（existingFile === null
 * → $transaction 内 $queryRaw TOCTOU + file.create）已由子轮②a 闭环；AI fetch
 * （process-image / summarize）留待子轮②c。本轮一律用 skipAi=true 跳过 AI fire-and-forget。
 *
 * 核心契约（dedup 版本化分支锁定）：
 *   1. **分支选择**：dedup findFirst 返回 existingFile → 进入 dedup 分支 db.$transaction。
 *      与新建分支共用 db.$transaction（raw db），但 tx 内调用不同：
 *        - dedup 分支：tx.fileVersion.count + tx.fileVersion.create + tx.file.update
 *        - 新建分支：tx.$queryRaw（TOCTOU）+ tx.file.create
 *      本轮锁定 dedup 分支仅调 tx.fileVersion.count/create + tx.file.update，且
 *      tx.$queryRaw **不触达**（dedup 分支无 TOCTOU 配额再检——配额早检已在分支前完成）。
 *   2. **fileVersion.create 快照旧文件**：data 全部取自 existingFile（非新上传文件）：
 *      fileId / fileName / fileSize / filePath / textContent / thumbnailUrl 均为 existingFile
 *      的字段值，version = versionCount + 1。这是"版本快照保留旧文件状态"契约——版本记录
 *      的是被覆盖前的旧文件，而非新上传的内容。
 *   3. **file.update 写入新文件字段**：where.id = existingFile.id；data 取自新上传文件：
 *      fileName = file.name / fileType / fileSize = file.size / filePath（新落盘路径）/
 *      textContent（新提取）/ thumbnailUrl（新生成）；tags 走合并逻辑
 *      `tags.length > 0 ? JSON.stringify(tags) : existingFile.tags`——skipAi=true 下 tags=[]
 *      → data.tags = existingFile.tags（保留旧 tags）。
 *   4. **unlink 清理旧磁盘文件**：dedup 分支事务后 `await import('fs/promises')` 动态取
 *      unlink，对 existingFile.filePath 调用 unlink 并 `.catch(() => {})` 兜底——即便旧
 *      文件已丢失（ENOENT）也不影响 200 响应。本轮锁定 unlink 收到 existingFile.filePath
 *      （非新 filePath），且 unlink 抛错时响应仍 200。
 *   5. **响应 isVersionUpdate: true + tags 回退**：响应 tags 走
 *      `tags.length > 0 ? tags : safeJsonParseArray(existingFile.tags)`——skipAi=true 下
 *      tags=[] → 响应 tags = safeJsonParseArray(existingFile.tags)（旧 tags 解析为数组）。
 *      previewUrl 仅 image 类型生成（/api/files/${fileRecord.id}/preview）。
 *   6. **aiSkipped 直传（非三元）**：dedup 分支响应 `aiSkipped` 直传（不像新建分支
 *      `aiSkipped ? true : undefined`）。skipAi=true + 未触达 rate limit 时 aiSkipped=false
 *      → 响应 aiSkipped: false（非 undefined）。此为 dedup 与新建分支的响应形态差异。
 *
 * Mock 策略（沿用子轮②a 范式 + 扩展 tx 携带 fileVersion + file.update）：
 *   - authenticateRequest / next/server / fs/promises / @/lib/parser/image 隔离。
 *   - raw db：$queryRaw（早检，正向）+ $transaction（**executor**：记录、构造 tx、回调 fn(tx)）
 *     + file.update（AI summarize fire-and-forget，dedup 分支提前 return 不触达，负向）。
 *   - tx（事务客户端）：$queryRaw（dedup 不触达，负向）+ fileVersion.{count,create} +
 *     file.update（dedup 三连）。
 *   - createTenantDb：hand-written wrapper（dedup file.findFirst 注入 tenantId）。
 *   - mockGenerateThumbnail：图片缩略图（仅 image 用例触达）。
 *
 * 复用子轮②a 的 vi.hoisted + MockNextResponse + makePostRequest（headers.get spy）+
 * fs/promises ESM 互操作（default + named）+ $transaction executor 范式。新增 tx 携带
 * fileVersion.{count,create} + file.update 的 dedup 事务客户端构造范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db
  mockQueryRaw,          // 早检 $queryRaw（配额预检，正向）— dedup 分支仍走早检
  mockTransaction,       // dedup $transaction（executor，记录 + 回调）
  mockRawFileUpdate,     // AI summarize fire-and-forget（dedup 提前 return，不触达，负向）
  // tx（$transaction 回调注入的事务客户端）
  mockTxQueryRaw,        // TOCTOU 再检（dedup 分支不触达，负向）
  mockTxFileVersionCount,   // dedup: tx.fileVersion.count
  mockTxFileVersionCreate,  // dedup: tx.fileVersion.create（快照旧文件）
  mockTxFileUpdate,         // dedup: tx.file.update（写入新文件字段）
  // tenantDb（dedup file.findFirst —— 返回 existingFile）
  mockTenantFileFindFirst,
  // parser
  mockGenerateThumbnail,    // 图片缩略图（仅 image 用例触达）
  // fs/promises
  mockMkdir,
  mockWriteFile,
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
    mockQueryRaw: vi.fn(),
    mockTransaction: vi.fn(),
    mockRawFileUpdate: vi.fn(),
    mockTxQueryRaw: vi.fn(),
    mockTxFileVersionCount: vi.fn(),
    mockTxFileVersionCreate: vi.fn(),
    mockTxFileUpdate: vi.fn(),
    mockTenantFileFindFirst: vi.fn(),
    mockGenerateThumbnail: vi.fn(),
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
    mockUnlink: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
// @/lib/parser/image：仅 image 用例触达 generateThumbnail；txt/other 用例不触达（负向）。
vi.mock("@/lib/parser/image", () => ({
  generateThumbnail: (...args: unknown[]) => mockGenerateThumbnail(...args),
}));
// fs/promises：路由顶部 `import { writeFile, mkdir } from "fs/promises"`（named）+
// dedup 分支 `const { unlink } = await import("fs/promises")`（dynamic named）。
// 提供 default + named 两种形态对齐子轮②a ESM 互操作范式。
vi.mock("fs/promises", () => ({
  default: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));
vi.mock("@/lib/db", () => ({
  // raw db：$queryRaw（早检，正向）+ $transaction（**executor**：记录调用、构造 tx、
  // 回调 fn(tx)）+ file.update（AI summarize fire-and-forget，dedup 分支提前 return 不触达，负向）。
  db: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // 记录 $transaction 被调用（供"分支选择"断言：dedup 分支必触达一次）
      mockTransaction(fn);
      // 构造事务客户端 tx：dedup 三连（fileVersion.count/create + file.update）+
      // $queryRaw（dedup 不触达，保留以断言负向）。
      const tx = {
        $queryRaw: (...args: unknown[]) => mockTxQueryRaw(...args),
        fileVersion: {
          count: (...args: unknown[]) => mockTxFileVersionCount(...args),
          create: (...args: unknown[]) => mockTxFileVersionCreate(...args),
        },
        file: {
          update: (...args: unknown[]) => mockTxFileUpdate(...args),
        },
      };
      // 执行回调（fn 抛错时 $transaction reject，由路由外层 catch → 500）
      return fn(tx);
    },
    file: {
      update: (...args: unknown[]) => mockRawFileUpdate(...args),
    },
  },
  // createTenantDb：hand-written wrapper（dedup file.findFirst 注入 tenantId）。
  // dedup 分支下 findFirst 返回 existingFile → 进入版本化分支。
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      file: {
        findFirst: (args: { where?: Record<string, unknown> }) =>
          mockTenantFileFindFirst({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
      },
    };
  },
}));

import { POST } from "@/app/api/files/route";

// 默认 owner 身份
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

// 旧文件 fixture（txt）：dedup findFirst 命中后作为 existingFile 进入版本化分支
const existingFileTxt = {
  id: "file-existing-1",
  tenantId: "tenant-1",
  userId: "user-1",
  fileName: "hello.txt",
  fileType: "txt",
  fileSize: 100,
  filePath: "/mock/upload/user-1/old_hello.txt",
  textContent: "old content",
  thumbnailUrl: null,
  tags: '["old-tag"]',
  isDeleted: false,
};

// tx.file.update 返回的 fileRecord（txt）：路由响应字段均取自此对象
const updatedFileRecordTxt = {
  id: "file-existing-1",
  fileName: "hello.txt",
  fileType: "txt",
  fileSize: 5,
  filePath: "/mock/upload/user-1/updated_hello.txt",
  textContent: "hello",
  thumbnailUrl: null,
};

/**
 * 构造 hand-crafted POST 请求。沿用子轮②a 范式：headers.get spy 覆盖
 * content-length（fetch forbidden header），formData() 返回受控 File。
 * url 携带 ?skipAi=true（跳过 AI fire-and-forget，避免与 ②c 纠缠）。
 */
function makePostRequest(opts: {
  file?: File | string | null;
  contentType?: string | null;
  contentLength?: number;
  url?: string;
} = {}): NextRequest {
  const fd = new FormData();
  if (opts.file !== null && opts.file !== undefined) {
    fd.append("file", opts.file as File | string);
  }
  const headers = new Headers();
  if (opts.contentType !== null) {
    headers.set(
      "content-type",
      opts.contentType ?? "multipart/form-data; boundary=----test"
    );
  }
  const req = {
    method: "POST",
    url: opts.url ?? "http://localhost/api/files?skipAi=true",
    headers,
    formData: async () => fd,
  } as unknown as NextRequest;
  if (opts.contentLength !== undefined) {
    const originalGet = headers.get.bind(headers);
    vi.spyOn(headers, "get").mockImplementation((name: string) => {
      if (name.toLowerCase() === "content-length") return String(opts.contentLength);
      return originalGet(name);
    });
  }
  return req;
}

describe("/api/files 主路由 POST — dedup 版本化分支（子轮②b）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 早检 $queryRaw：默认 0 字节已用（不超限，进入 dedup 分支）
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // dedup findFirst：默认命中 existingFileTxt
    mockTenantFileFindFirst.mockResolvedValue({ ...existingFileTxt });
    // tx.fileVersion.count：默认 2（已存在 2 个历史版本 → 新版本号 3）
    mockTxFileVersionCount.mockResolvedValue(2);
    // tx.fileVersion.create：返回新建版本记录
    mockTxFileVersionCreate.mockResolvedValue({ id: "fv-3", version: 3 });
    // tx.file.update：返回更新后的 fileRecord（txt）
    mockTxFileUpdate.mockResolvedValue({ ...updatedFileRecordTxt });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockGenerateThumbnail.mockResolvedValue("/api/files/thumbnail/new");
  });

  it("① happy path：txt + skipAi=true + dedup 命中(versionCount=2) → $transaction(fileVersion.count=2 → fileVersion.create(快照旧文件,version=3) + file.update(新文件字段,tags 回退)) → unlink 旧 filePath → 200 isVersionUpdate:true；tx.$queryRaw 不触达", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    // 响应契约：isVersionUpdate + tags 回退 + aiSkipped 直传(false)
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-existing-1",
      fileName: "hello.txt",
      fileType: "txt",
      fileSize: 5,
      filePath: "/mock/upload/user-1/updated_hello.txt",
      textContent: "hello",
      isVersionUpdate: true,
      aiSkipped: false,
    });
    // txt 非图片 → previewUrl undefined；thumbnailUrl = fileRecord.thumbnailUrl(null) || previewUrl(undefined) → undefined
    expect(res.body.previewUrl).toBeUndefined();
    expect(res.body.thumbnailUrl).toBeUndefined();
    // tags 回退：skipAi=true 下 tags=[] → 响应 tags = safeJsonParseArray(existingFile.tags) = ["old-tag"]
    expect(res.body.tags).toEqual(["old-tag"]);

    // 早检 $queryRaw：dedup 分支仍走配额早检（在分支选择之前）
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);

    // dedup：createTenantDb(tenantId) + file.findFirst({where:{userId, fileName, isDeleted:false, tenantId 注入}})
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockTenantFileFindFirst).toHaveBeenCalledTimes(1);
    expect(mockTenantFileFindFirst.mock.calls[0][0]).toEqual({
      where: {
        userId: "user-1",
        fileName: "hello.txt",
        isDeleted: false,
        tenantId: "tenant-1",
      },
    });

    // $transaction 调用一次（dedup 分支触达）
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // tx.$queryRaw 不触达（dedup 分支无 TOCTOU 配额再检——与新建分支关键差异）
    expect(mockTxQueryRaw).not.toHaveBeenCalled();

    // tx.fileVersion.count：where.fileId = existingFile.id
    expect(mockTxFileVersionCount).toHaveBeenCalledTimes(1);
    expect(mockTxFileVersionCount.mock.calls[0][0]).toEqual({
      where: { fileId: "file-existing-1" },
    });

    // tx.fileVersion.create：快照旧文件（全部字段取自 existingFile，非新上传文件）
    expect(mockTxFileVersionCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileVersionCreate.mock.calls[0][0]).toEqual({
      data: {
        fileId: "file-existing-1",
        fileName: "hello.txt",          // existingFile.fileName
        fileSize: 100,                   // existingFile.fileSize（旧文件大小，非新 file.size=5）
        filePath: "/mock/upload/user-1/old_hello.txt",  // existingFile.filePath（旧路径）
        textContent: "old content",      // existingFile.textContent（旧内容）
        thumbnailUrl: null,              // existingFile.thumbnailUrl
        version: 3,                      // versionCount(2) + 1
      },
    });

    // tx.file.update：where.id = existingFile.id；data 写入新文件字段 + tags 回退
    expect(mockTxFileUpdate).toHaveBeenCalledTimes(1);
    const writtenPath = mockWriteFile.mock.calls[0][0] as string;
    expect(mockTxFileUpdate.mock.calls[0][0]).toEqual({
      where: { id: "file-existing-1" },
      data: {
        fileName: "hello.txt",          // file.name（新）
        fileType: "txt",                // 新判定
        fileSize: 5,                     // file.size（新）
        filePath: writtenPath,           // 新落盘路径
        textContent: "hello",            // 新提取
        thumbnailUrl: undefined,         // 非图片
        tags: '["old-tag"]',             // tags=[] → existingFile.tags（保留旧 tags）
      },
    });

    // unlink 清理旧磁盘文件：收到 existingFile.filePath（非新 writtenPath）
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink.mock.calls[0][0]).toBe("/mock/upload/user-1/old_hello.txt");
    expect(mockUnlink.mock.calls[0][0]).not.toBe(writtenPath);

    // AI summarize fire-and-forget 不触达（dedup 分支提前 return，不到新建分支的 AI 块）
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
    // 非图片 → generateThumbnail 不触达
    expect(mockGenerateThumbnail).not.toHaveBeenCalled();
  });

  it("② versionCount=0 → version=1（首次版本化：旧文件无历史版本）→ fileVersion.create data.version=1；响应 isVersionUpdate:true", async () => {
    mockTxFileVersionCount.mockResolvedValue(0);
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isVersionUpdate: true });
    // fileVersion.count 查到 0 → create version = 0 + 1 = 1（首次版本化）
    expect(mockTxFileVersionCount).toHaveBeenCalledTimes(1);
    expect(mockTxFileVersionCreate.mock.calls[0][0].data.version).toBe(1);
    // 其余字段仍取自 existingFile（快照旧文件契约不变）
    expect(mockTxFileVersionCreate.mock.calls[0][0].data.fileId).toBe("file-existing-1");
    expect(mockTxFileVersionCreate.mock.calls[0][0].data.fileSize).toBe(100);
  });

  it("③ image dedup + skipAi=true → generateThumbnail 生成新缩略图；file.update data.thumbnailUrl=新值；响应 previewUrl=/api/files/${id}/preview、thumbnailUrl=fileRecord.thumbnailUrl；fileVersion.create 快照旧 thumbnailUrl", async () => {
    // image 旧文件 fixture：thumbnailUrl="/old-thumb"、textContent="old ocr text"、tags='["image-tag"]'
    const existingFileImage = {
      ...existingFileTxt,
      id: "file-img-1",
      fileName: "photo.jpg",
      fileType: "image",
      fileSize: 200,
      filePath: "/mock/upload/user-1/old_photo.jpg",
      textContent: "old ocr text",
      thumbnailUrl: "/old-thumb",
      tags: '["image-tag"]',
    };
    mockTenantFileFindFirst.mockResolvedValue(existingFileImage);
    // tx.file.update 返回 image fileRecord：thumbnailUrl 为新生成的 /new-thumb
    mockTxFileUpdate.mockResolvedValue({
      id: "file-img-1",
      fileName: "photo.jpg",
      fileType: "image",
      fileSize: 5,
      filePath: "/mock/upload/user-1/updated_photo.jpg",
      textContent: null,
      thumbnailUrl: "/api/files/thumbnail/new",
    });
    // 合法 jpeg magic bytes：[0xFF, 0xD8, 0xFF]
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00]);
    const file = new File([jpegBytes], "photo.jpg", { type: "image/jpeg" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    // 响应：previewUrl 生成、thumbnailUrl = fileRecord.thumbnailUrl（|| previewUrl）
    expect(res.body).toMatchObject({
      id: "file-img-1",
      fileType: "image",
      isVersionUpdate: true,
      previewUrl: "/api/files/file-img-1/preview",
      thumbnailUrl: "/api/files/thumbnail/new",
      aiSkipped: false,
    });
    // tags 回退到旧 tags（skipAi=true 下 tags=[]）
    expect(res.body.tags).toEqual(["image-tag"]);

    // generateThumbnail 被调用（image 分支）
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(mockGenerateThumbnail.mock.calls[0][2]).toBe("user-1"); // userId 参数

    // fileVersion.create 快照旧文件：thumbnailUrl 为旧值 "/old-thumb"（非新值）
    expect(mockTxFileVersionCreate.mock.calls[0][0].data).toMatchObject({
      fileId: "file-img-1",
      fileName: "photo.jpg",
      fileSize: 200,
      filePath: "/mock/upload/user-1/old_photo.jpg",
      textContent: "old ocr text",
      thumbnailUrl: "/old-thumb",
      version: 3,
    });

    // file.update data：thumbnailUrl 为新生成的 /api/files/thumbnail/new；textContent 为 undefined（image 无文本提取 + skipAi 跳过 OCR）
    expect(mockTxFileUpdate.mock.calls[0][0]).toEqual({
      where: { id: "file-img-1" },
      data: {
        fileName: "photo.jpg",
        fileType: "image",
        fileSize: 5,
        filePath: mockWriteFile.mock.calls[0][0],
        textContent: undefined,
        thumbnailUrl: "/api/files/thumbnail/new",
        tags: '["image-tag"]',
      },
    });

    // unlink 清理旧 image filePath
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink.mock.calls[0][0]).toBe("/mock/upload/user-1/old_photo.jpg");
  });

  it("④ unlink 抛错(ENOENT) → .catch(() => {}) 兜底 → 响应仍 200 isVersionUpdate:true（旧文件丢失不阻断版本化）", async () => {
    mockUnlink.mockRejectedValue(new Error("ENOENT: no such file"));
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    // unlink 抛错被 .catch(() => {}) 吞掉，响应仍 200 + isVersionUpdate:true
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isVersionUpdate: true, id: "file-existing-1" });
    // unlink 确实被调用且抛错（.catch 兜底不改变控制流）
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink.mock.calls[0][0]).toBe("/mock/upload/user-1/old_hello.txt");
    // 事务仍正常完成（fileVersion.create + file.update 均触达）
    expect(mockTxFileVersionCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileUpdate).toHaveBeenCalledTimes(1);
  });
});
