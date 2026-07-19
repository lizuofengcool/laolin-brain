/**
 * files/route.ts 主路由 handler 级集成测试 —— POST 新建分支专轮（子轮②a）
 *
 * 锁定 /api/files 主路由 POST 的"新建分支"：通过全部前置校验门（子轮①已覆盖）+
 * magic bytes 合法 + writeFile 落盘成功 + dedup file.findFirst 返回 null（无同名
 * 存在文件）→ 进入 db.$transaction(async (tx) => { tx.$queryRaw 配额再检 TOCTOU +
 * tx.file.create }) → 200 响应。
 *
 * 子轮②a 仅覆盖"新建分支"（existingFile === null）。dedup 版本化分支（existingFile
 * 存在 → $transaction 内 fileVersion.create + file.update + unlink 旧文件）留待
 * 子轮②b；AI fetch（process-image / summarize）留待子轮②c。本轮一律用 skipAi=true
 * query param 跳过 AI fire-and-forget，避免与 AI fetch 纠缠。
 *
 * 核心契约（新建分支锁定）：
 *   1. **分支选择**：dedup findFirst 返回 null → 不进入 dedup 分支，进入新建分支
 *      db.$transaction。dedup 分支与新建分支共用 db.$transaction（raw db），区别在
 *      tx 内调用：dedup = fileVersion.create + file.update；新建 = $queryRaw +
 *      file.create。本轮锁定新建分支仅调 tx.$queryRaw + tx.file.create。
 *   2. **TOCTOU 配额再检**：tx.$queryRaw 在事务内重跑与早检 db.$queryRaw 完全一致
 *      的 SQL 模板（同 SELECT COALESCE(SUM("fileSize"),0) ... WHERE "userId"=?
 *      AND "tenantId"=? AND "isDeleted"=false 三键）。本轮显式断言早检与事务内
 *      $queryRaw 的 SQL 模板字符串完全相等，锁定"两次查询口径一致"契约。
 *   3. **file.create data 形态（10 字段）**：tenantId / userId / fileName / fileType /
 *      fileSize / filePath / textContent / thumbnailUrl / storageMode="cloud" /
 *      tags=JSON.stringify([])。
 *   4. **tenantId 显式注入（非 wrapper）**：新建分支走 db.$transaction + tx.file.create
 *      （raw db 事务客户端），tenantId 由路由在 data 中显式设置，**不经 createTenantDb
 *      wrapper 注入**（与 files-import 路由的 tenantDb.file.create wrapper 注入范式不同）。
 *      原因：createTenantDb 构造独立 client，不接受 tx 参数，无法在 $transaction 回调内
 *      复用事务上下文。故路由在事务内显式写 tenantId，本轮锁定此"显式注入"契约。
 *   5. **filePath 路径安全**：safeName = path.basename(file.name)（剥离目录穿越），
 *      uniqueName = `${Date.now()}_${safeName}`，filePath = path.join(uploadDir, uniqueName)，
 *      resolvedPath = path.resolve(filePath)，路由断言 resolvedPath.startsWith(
 *      resolvedUploadDir + path.sep)。本轮用 file.name="../../etc/passwd" 验证穿越被剥离
 *      为 "passwd"，filePath 恒在 uploadDir 之内。
 *
 * 负向契约：
 *   - TOCTOU 再检超限（tx.$queryRaw 返回 5GB）→ throw → 外层 catch → 500
 *     "Upload failed"，tx.file.create 未触达。
 *   - tx.file.create 抛错 → 外层 catch → 500 "Upload failed"。
 *
 * Mock 策略（沿用第五十二轮子轮①范式 + 新增 $transaction executor）：
 *   - authenticateRequest / next/server / fs/promises 隔离同①。
 *   - raw db：$queryRaw（早检，正向）+ $transaction（**executor**：调 mockTransaction
 *     记录、构造 tx={$queryRaw, file.create}、回调 fn(tx)）+ file.update（AI summarize
 *     fire-and-forget，skipAi=true 下不触达，负向）。
 *   - tx（事务客户端）：mockTxQueryRaw（TOCTOU 再检）+ mockTxFileCreate（file.create）。
 *   - createTenantDb：hand-written wrapper（dedup file.findFirst 注入 tenantId）。
 *   - mockRawFileUpdate 供"skipAi=true 跳过 AI summarize"负向断言。
 *
 * 复用第五十二轮①的 vi.hoisted + MockNextResponse + makePostRequest（headers.get spy）
 * + fs/promises ESM 互操作（default + named）+ $queryRaw tagged template 契约范式。
 * 新增 $transaction executor 范式（mock 调用回调并注入 tx 客户端），可复用于子轮②b 的
 * dedup $transaction（届时扩展 tx 携带 fileVersion.count/create + file.update）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db
  mockQueryRaw,       // 早检 $queryRaw（配额预检，正向）
  mockTransaction,    // 新建分支 $transaction（executor，记录 + 回调）
  mockRawFileUpdate,  // AI summarize fire-and-forget 的 tenantDb.file.update（skipAi=true 下不触达，负向）
  // tx（$transaction 回调注入的事务客户端）
  mockTxQueryRaw,     // TOCTOU 配额再检
  mockTxFileCreate,   // 新建 file.create
  // tenantDb（dedup file.findFirst —— 新建分支下 findFirst 返回 null）
  mockTenantFileFindFirst,
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
    mockTxFileCreate: vi.fn(),
    mockTenantFileFindFirst: vi.fn(),
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
    mockUnlink: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
// fs/promises：路由顶部 `import { writeFile, mkdir } from "fs/promises"`（named）+
// dedup 分支 `const { unlink } = await import("fs/promises")`（dynamic named）。
// 新建分支不触达 unlink（unlink 仅 dedup 分支清理旧文件）；提供 default 兜底对齐
// 第五十轮 files-id ESM 互操作范式。
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
  // 回调 fn(tx)）。file.update 经 createTenantDb().file.update（AI summarize fire-and-forget，
  // skipAi=true 下不触达，负向）；tenantDb 内部以 updateMany + tenantId 守卫实现租户隔离写。
  db: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // 记录 $transaction 被调用（供"分支选择"断言：新建分支必触达一次）
      mockTransaction(fn);
      // 构造事务客户端 tx：$queryRaw（TOCTOU 再检）+ file.create（新建）
      const tx = {
        $queryRaw: (...args: unknown[]) => mockTxQueryRaw(...args),
        file: {
          create: (...args: unknown[]) => mockTxFileCreate(...args),
        },
      };
      // 执行回调（fn 抛错时 $transaction reject，由路由外层 catch → 500）
      return fn(tx);
    },
  },
  // createTenantDb：hand-written wrapper（dedup file.findFirst 注入 tenantId）。
  // 新建分支下 findFirst 返回 null → 不进入 dedup 分支。update 供 IIFE 写回 summary。
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      file: {
        findFirst: (args: { where?: Record<string, unknown> }) =>
          mockTenantFileFindFirst({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
        update: (...args: unknown[]) => mockRawFileUpdate(...args),
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

// 5GB 上限（字节）
const FIVE_GB = 5 * 1024 * 1024 * 1024;

type MockRes = InstanceType<typeof MockNextResponse>;

/**
 * 构造 hand-crafted POST 请求。沿用第五十二轮①范式：headers.get spy 覆盖
 * content-length（fetch forbidden header），formData() 返回受控 File。
 * 新增 url 参数以携带 ?skipAi=true（跳过 AI fire-and-forget，避免与 ②c 纠缠）。
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

describe("/api/files 主路由 POST — 新建分支（子轮②a）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 早检 $queryRaw：默认 0 字节已用
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.$queryRaw（TOCTOU 再检）：默认 0 字节已用（与早检一致 → 不超限）
    mockTxQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.file.create：默认返回一个新建 fileRecord
    mockTxFileCreate.mockResolvedValue({
      id: "file-new-1",
      fileName: "hello.txt",
      fileType: "txt",
      fileSize: 5,
      filePath: "/mocked-path",
      textContent: "hello",
      thumbnailUrl: null,
    });
    // dedup findFirst：默认返回 null（无同名文件 → 进入新建分支）
    mockTenantFileFindFirst.mockResolvedValue(null);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("① happy path：txt + skipAi=true → mkdir/writeFile/dedup(null)/$transaction(tx.$queryRaw=0 → tx.file.create) → 200；file.create data 含 tenantId(显式)；filePath 路径安全前缀；tx.$queryRaw SQL 与早检 $queryRaw 完全一致", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    // 响应契约
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-new-1",
      fileName: "hello.txt",
      fileType: "txt",
      fileSize: 5,
      textContent: "hello",
      tags: [],
    });
    // txt 非图片 → previewUrl / aiSkipped 值为 undefined（路由显式写键，值为 undefined）
    expect(res.body.previewUrl).toBeUndefined();
    expect(res.body.aiSkipped).toBeUndefined();

    // mkdir：uploadDir = path.join(cwd, "upload", userId)
    expect(mockMkdir).toHaveBeenCalledTimes(1);
    const uploadDir = path.join(process.cwd(), "upload", "user-1");
    expect(mockMkdir.mock.calls[0][0]).toBe(uploadDir);

    // writeFile：resolvedPath 在 uploadDir 之内，basename = ${ts}_hello.txt
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenPath = mockWriteFile.mock.calls[0][0] as string;
    expect(writtenPath.startsWith(path.resolve(uploadDir) + path.sep)).toBe(true);
    expect(writtenPath.endsWith("_hello.txt")).toBe(true);

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

    // $transaction 调用一次（新建分支触达）
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // tx.$queryRaw TOCTOU 再检契约：tagged template values[0]=userId、values[1]=tenantId
    // SQL 模板含 "userId" / "tenantId" / "isDeleted" = false 三键
    expect(mockTxQueryRaw).toHaveBeenCalledTimes(1);
    const txCall = mockTxQueryRaw.mock.calls[0] as unknown[];
    expect(txCall[1]).toBe("user-1");
    expect(txCall[2]).toBe("tenant-1");
    const txSqlStrings = txCall[0] as readonly string[];
    const txSqlJoined = txSqlStrings.join("${}");
    expect(txSqlJoined).toContain('"userId"');
    expect(txSqlJoined).toContain('"tenantId"');
    expect(txSqlJoined).toContain('"isDeleted" = false');

    // 早检 $queryRaw 与 tx.$queryRaw 的 SQL 一致（同口径 TOCTOU 再检）：
    // 两者仅在模板缩进深度上不同（tx 模板嵌套于 $transaction 回调内，缩进更深），
    // SQL 本身对空白不敏感，故归一化（折叠空白 + trim）后比对语句完全一致。
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const earlyCall = mockQueryRaw.mock.calls[0] as unknown[];
    const earlySqlStrings = earlyCall[0] as readonly string[];
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(normalize(earlySqlStrings.join("${}"))).toBe(normalize(txSqlJoined));
    // 均含三键（再次显式锁定早检口径与事务内一致，不漏 isDeleted=false 把回收站计入配额）
    const earlyJoined = earlySqlStrings.join("${}");
    expect(earlyJoined).toContain('"userId"');
    expect(earlyJoined).toContain('"tenantId"');
    expect(earlyJoined).toContain('"isDeleted" = false');

    // tx.file.create data：10 字段，tenantId 显式（非 wrapper 注入，因新建分支走 db.$transaction）
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate.mock.calls[0][0]).toEqual({
      data: {
        tenantId: "tenant-1",
        userId: "user-1",
        fileName: "hello.txt",
        fileType: "txt",
        fileSize: 5,
        filePath: writtenPath,
        textContent: "hello",
        thumbnailUrl: undefined,
        storageMode: "cloud",
        tags: "[]",
      },
    });

    // AI summarize fire-and-forget 跳过（skipAi=true → 不触达 tenantDb.file.update）
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("② TOCTOU 再检超限：tx.$queryRaw 返回 5GB（并发上传占满配额）→ throw → 外层 catch → 500 { error: 'Upload failed' }；tx.file.create 未触达", async () => {
    // 事务内重检发现已被并发上传占满 5GB（早检时还剩余量，TOCTOU 竞态）
    mockTxQueryRaw.mockResolvedValue([{ totalSize: BigInt(FIVE_GB) }]);
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Upload failed" });
    // $transaction 已触达、tx.$queryRaw TOCTOU 再检已触达
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxQueryRaw).toHaveBeenCalledTimes(1);
    // 配额超限 throw 后控制流短路，tx.file.create 未触达
    expect(mockTxFileCreate).not.toHaveBeenCalled();
  });

  it("③ tx.file.create 抛错 → 外层 catch → 500 { error: 'Upload failed' }（catch-all 兜底）", async () => {
    mockTxFileCreate.mockRejectedValue(new Error("unique constraint violation"));
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Upload failed" });
    // tx.file.create 已触达（TOCTOU 再检通过后才到 file.create，file.create 自身抛错）
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
  });

  it("④ 路径穿越防御：file.name='../../etc/passwd' → path.basename 取 'passwd' → filePath 恒在 uploadDir 之内，无穿越", async () => {
    // File 构造器不清洗 name；file.name 原样 "../../etc/passwd"
    const file = new File(["x"], "../../etc/passwd");
    // file.type 默认 ""，fileType 各分支均不匹配 → "other"（无文本提取、无 AI、无缩略图）

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenPath = mockWriteFile.mock.calls[0][0] as string;
    const uploadDir = path.join(process.cwd(), "upload", "user-1");
    // 路径在 uploadDir 之内（resolvedPath.startsWith(resolvedUploadDir + path.sep)）
    expect(writtenPath.startsWith(path.resolve(uploadDir) + path.sep)).toBe(true);
    // basename 已应用：文件名为 ${ts}_passwd，无 ".." / "etc"
    expect(writtenPath.endsWith("_passwd")).toBe(true);
    expect(writtenPath).not.toContain("..");
    expect(writtenPath).not.toContain("/etc/");
    // fileName 落库为原始值（路由不清洗 fileName，仅清洗 filePath）
    expect(mockTxFileCreate.mock.calls[0][0].data.fileName).toBe("../../etc/passwd");
    // filePath 落库与 writeFile 收到的一致（Linux 下 path.join 与 path.resolve 对绝对 uploadDir 等价）
    expect(mockTxFileCreate.mock.calls[0][0].data.filePath).toBe(writtenPath);
    // fileType="other"（无后缀匹配）
    expect(mockTxFileCreate.mock.calls[0][0].data.fileType).toBe("other");
  });
});
