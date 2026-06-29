/**
 * files/route.ts 主路由 handler 级集成测试 —— POST 前置校验门 + 配额早检专轮（子轮①）
 *
 * 锁定 /api/files 主路由 POST（文件上传）的前置校验链与 5GB 配额早检 $queryRaw 契约。
 * 第五十一轮已补 GET list（files-route.test.ts），本轮补 POST 的"前置校验门 +
 * 配额 $queryRaw 契约"（子轮①）。POST 后段（magic bytes 通过后的 writeFile 落盘 +
 * fileType 落库 + dedup 版本化 + 新建分支 $transaction 配额再检 + AI fetch）涉及面广，
 * 留待子轮②单独处理。
 *
 * POST 前置校验链（按路由顺序短路，每道门在其后继 DB/fs 调用之前返回）：
 *   ① authenticateRequest → 401 透传（不触达 DB/fs）
 *   ② checkBodySize（Content-Length > 100MB）→ 413 "请求体过大，最大允许 100MB"
 *      （在 formData 之前，不触达 $queryRaw/mkdir）
 *   ③ content-type 非 multipart/form-data → 415 "请求必须是 multipart/form-data 格式"
 *      （在 formData 之前，不触达 $queryRaw/mkdir）
 *   ④ formData.get("file") 非 File 实例（缺失 / 字符串）→ 400 "Valid file is required"
 *      （在 size/quota 之前，不触达 $queryRaw/mkdir）
 *   ⑤ file.size > 50MB → 413 "File size exceeds 50MB limit"（在 $queryRaw 之前）
 *   ⑥ db.$queryRaw 5GB 配额早检 → earlyTotalUsed + file.size > 5GB → 413
 *      "Storage quota exceeded (Xmb / 5120MB used)"（在 mkdir 之前）
 *   ⑦ validateMagicBytes（内容与声明类型不匹配）→ 400 "文件内容与声明的类型不匹配"
 *      （在 writeFile / 文本提取 / 缩略图 / dedup / $transaction 之前；mkdir 已触达）
 *   catch-all：$queryRaw 抛错 → 500 "Upload failed"
 *
 * $queryRaw 配额查询契约（与 files-import 同范式）：
 *   - SQL 模板显式带 "userId" / "tenantId" / "isDeleted" = false 三键（活跃文件配额，
 *     不含回收站）。tagged template values[0]=userId、values[1]=tenantId。
 *   - 返回 [{ totalSize: bigint }]，路由 Number(earlyTotalSize) 转换后与 file.size
 *     累加比对 5GB 上限（quotaBytes = 5 * 1024 * 1024 * 1024）。
 *
 * 核心负向契约（前置门短路顺序锁定）：
 *   - 401 / 413-body / 415 / 400-file / 413-size 五道门恒不触达 $queryRaw（配额查询仅在
 *     通过 size 门后执行）。本轮用五道门用例显式断言 mockQueryRaw 未被调用。
 *   - 413-quota 门不触达 mkdir（mkdir 在配额门之后）。本轮用 quota 用例显式断言
 *     mockMkdir 未被调用。
 *   - 400-magic-bytes 门不触达 writeFile / createTenantDb / $transaction（三者均在
 *     magic bytes 门之后）。本轮用 magic-bytes 用例显式断言三者未被调用。
 *
 * Mock 策略：authenticateRequest / next/server / fs/promises 全部隔离；createTenantDb
 * 用 hand-written wrapper（file.findFirst 注入 tenantId）；raw db 的 $queryRaw /
 * $transaction / file.update 用独立 mock；createTenantDb 与 tenantDb.file.findFirst
 * 供"dedup 未触达"负向断言（① 全部前置门在 dedup 之前返回）。
 *
 * 复用第五十一轮 files-route GET 的 vi.hoisted + MockNextResponse 范式 + 第四十一轮
 * files-import 的 $queryRaw tagged template 契约范式 + 第五十轮 files-id 的
 * fs/promises ESM 互操作（default + named）范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db
  mockQueryRaw,      // 配额早检 $queryRaw（正向）
  mockTransaction,   // dedup / 新建分支 $transaction（① 不触达，负向）
  mockRawFileUpdate, // AI summarize fire-and-forget 的 db.file.update（① 不触达，负向）
  // tenantDb（dedup file.findFirst —— ① 前置门全部在 dedup 之前返回，供负向断言）
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
// 同时提供 default（ESM 互操作兜底，对齐第五十轮 files-id 范式）。
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
  // raw db：$queryRaw（配额早检，正向）+ $transaction（dedup/新建分支，① 不触达，负向）+
  // file.update（AI summarize fire-and-forget，① 不触达，负向）。
  db: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    file: {
      update: (...args: unknown[]) => mockRawFileUpdate(...args),
    },
  },
  // createTenantDb：hand-written wrapper（dedup file.findFirst 注入 tenantId）。
  // ① 前置门全部在 dedup 之前返回，mockCreateTenantDb / mockTenantFileFindFirst 恒不被调用。
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

// 5GB 上限（字节）
const FIVE_GB = 5 * 1024 * 1024 * 1024;

type MockRes = InstanceType<typeof MockNextResponse>;

/**
 * 构造 hand-crafted POST 请求。Content-Length 是 fetch forbidden header，无法经
 * Request 构造器显式设置，故用 spy 覆盖 headers.get 使路由的 checkBodySize 受控。
 * formData() 返回受控 FormData（"file" 字段可为 File / 字符串 / 缺失）。
 */
function makePostRequest(opts: {
  file?: File | string | null;
  contentType?: string | null; // null → 不设 content-type 头
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
    url: opts.url ?? "http://localhost/api/files",
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

/**
 * 构造 size 被覆盖的 File（避免为 50MB 用例真实分配 50MB 内存）。
 * File.prototype.size 是 accessor，在实例上 defineProperty 数据属性可遮蔽原型 getter。
 * 仅用于 size 门用例（arrayBuffer 不会被调用——size 门在 arrayBuffer 之前返回）。
 */
function makeFileWithSize(
  name: string,
  type: string,
  fakeSize: number,
  content = "x"
): File {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "size", { value: fakeSize, configurable: true });
  return file;
}

describe("/api/files 主路由 POST — 前置校验门 + 配额早检（子轮①）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 默认配额查询返回 0 字节已用（quota 门用例单独覆盖）
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("① 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB/fs", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await POST(makePostRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("② Content-Length > 100MB → 413 { error: '请求体过大，最大允许 100MB' }，在 formData/$queryRaw 之前短路", async () => {
    const res = (await POST(
      makePostRequest({ contentLength: 100 * 1024 * 1024 + 1 })
    )) as MockRes;

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "请求体过大，最大允许 100MB" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it("③ content-type 非 multipart/form-data → 415 { error: '请求必须是 multipart/form-data 格式' }，在 formData/$queryRaw 之前短路", async () => {
    const res = (await POST(
      makePostRequest({ contentType: "application/json" })
    )) as MockRes;

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: "请求必须是 multipart/form-data 格式" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it("④ formData.get('file') 为 null（字段缺失）→ 400 { error: 'Valid file is required' }，在 size/quota 之前短路", async () => {
    const res = (await POST(makePostRequest({ file: null }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Valid file is required" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it("④ formData.get('file') 为字符串（非 File 实例）→ 400 { error: 'Valid file is required' }", async () => {
    const res = (await POST(makePostRequest({ file: "not-a-file" }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Valid file is required" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it("⑤ file.size > 50MB → 413 { error: 'File size exceeds 50MB limit' }，在 $queryRaw 之前短路", async () => {
    const bigFile = makeFileWithSize("big.jpg", "image/jpeg", 50 * 1024 * 1024 + 1);

    const res = (await POST(makePostRequest({ file: bigFile }))) as MockRes;

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "File size exceeds 50MB limit" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it("⑥ db.$queryRaw 5GB 配额早检超限 → 413 { error: 'Storage quota exceeded (5120MB / 5120MB used)' }，在 mkdir 之前短路", async () => {
    // 已用满 5GB，再传 1 字节即超限（usedMB/quotaMB 均 = 5120）
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(FIVE_GB) }]);
    const smallFile = new File(["x"], "small.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file: smallFile }))) as MockRes;

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Storage quota exceeded (5120MB / 5120MB used)",
    });
    // $queryRaw 被调用一次（配额早检）
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    // mkdir 未触达（配额门在 mkdir 之前）
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("⑦ magic bytes 与声明类型不匹配（PNG 内容声明 image/jpeg）→ 400 { error: '文件内容与声明的类型不匹配' }，在 writeFile/dedup/transaction 之前短路", async () => {
    // PNG 魔数 [89 50 4E 47 ...]，声明 image/jpeg 期望 [FF D8 FF]
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const evilFile = new File([pngBytes], "photo.jpg", { type: "image/jpeg" });

    const res = (await POST(makePostRequest({ file: evilFile }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "文件内容与声明的类型不匹配" });
    // 配额早检已触达（在 magic bytes 之前）
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    // mkdir 已触达（在 magic bytes 之前）
    expect(mockMkdir).toHaveBeenCalledTimes(1);
    // magic bytes 门之后的所有副作用均未触达
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateTenantDb).not.toHaveBeenCalled(); // dedup 未触达
    expect(mockTransaction).not.toHaveBeenCalled(); // dedup/new-file $transaction 未触达
  });

  it("catch-all：$queryRaw 抛错 → 500 { error: 'Upload failed' }；$queryRaw 收到含 userId/tenantId/isDeleted=false 的 SQL 模板，values[0]=userId values[1]=tenantId", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db connection lost"));
    const smallFile = new File(["x"], "small.txt", { type: "text/plain" });

    const res = (await POST(makePostRequest({ file: smallFile }))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Upload failed" });
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    // $queryRaw tagged template 调用契约（即使抛错，调用参数仍被记录）
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const call = mockQueryRaw.mock.calls[0] as unknown[];
    // tagged template: [strings, ...values] —— values[0]=userId、values[1]=tenantId
    expect(call[1]).toBe("user-1");
    expect(call[2]).toBe("tenant-1");
    const sqlStrings = call[0] as readonly string[];
    const sqlJoined = sqlStrings.join("${}");
    expect(sqlJoined).toContain('"userId"');
    expect(sqlJoined).toContain('"tenantId"');
    expect(sqlJoined).toContain('"isDeleted" = false');
  });
});
