/**
 * files/route.ts 主路由 handler 级集成测试 —— POST 图片 AI process-image fetch 专轮（子轮②c-image）
 *
 * 锁定 /api/files 主路由 POST 的"图片 AI process-image fetch"分支：jpeg magic bytes 合法 +
 * generateThumbnail 生成缩略图 + dedup findFirst 返回 null（新建分支）+ **不传 skipAi** →
 * 进入图片 AI 块（BLOCKING `await fetch(process-image)`，非 fire-and-forget——尽管源码注释写
 * "fire and forget"，实际是阻塞 await，失败被 try/catch 吞掉不阻断主流程）→ OCR ocrText
 * 覆盖 textContent、AI tags 覆盖 tags → 新建分支 $transaction（tx.$queryRaw TOCTOU +
 * tx.file.create）→ 200 响应。
 *
 * 子轮②c-image 仅覆盖"图片 AI process-image fetch"（新建分支 + image 类型）。doc AI
 * summarize fetch（fire-and-forget IIFE，仅 doc 类型 + 新建分支）留待子轮②c-doc；rate-limit
 * 触发 aiSkipped:true 留待后续（checkAiRateLimit 用模块级 Map，跨用例累积，需独立专轮处理
 * 状态隔离）。本轮一律不传 skipAi（除用例④显式 skipAi=true 锁定跳过门），使图片 AI fetch 触达。
 *
 * 核心契约（图片 AI process-image fetch 锁定）：
 *   1. **fetch 触达条件**：fileType==="image" && !skipAiParam && !skipAiDueToRateLimit →
 *      触达 fetch(process-image)。skipAi=true 时不触达（用例④锁定）。
 *   2. **fetch URL/method/body 契约**：URL = `${NEXT_PUBLIC_BASE_URL}/api/ai/process-image`，
 *      method="POST"，headers 含 "Content-Type":"application/json" + Authorization（从请求头
 *      透传），body = JSON.stringify({ imageBase64 })。imageBase64 为 buffer 的 base64 编码
 *      （btoa over String.fromCharCode）。
 *   3. **OCR ocrText 覆盖 textContent**：aiRes.ok && aiData.ocrText → textContent = ocrText
 *      （覆盖图片原本无文本提取的 undefined）。aiData.tags.length>0 → tags = aiData.tags。
 *   4. **tx.file.create data 含 AI 产物**：新建分支 $transaction 内 tx.file.create data 的
 *      textContent=ocrText、thumbnailUrl=generateThumbnail 返回值、tags=JSON.stringify(aiTags)、
 *      fileType="image"。
 *   5. **响应形态**：thumbnailUrl=fileRecord.thumbnailUrl、previewUrl=`/api/files/${id}/preview`
 *      （image 类型）、tags=aiTags（数组）、aiSkipped=undefined（false → `aiSkipped ? true : undefined`）。
 *
 * 负向契约：
 *   - fetch rejects（网络错误）→ try/catch 吞掉 → 响应仍 200，textContent=undefined（图片无文本
 *      提取）、tags=[]、thumbnailUrl 仍生成（generateThumbnail 在 fetch 之前）。
 *   - fetch 返回 ok:false（非 200）→ aiRes.ok=false → 不读 json、不覆盖 textContent/tags →
 *      响应 200，textContent=undefined、tags=[]。
 *   - skipAi=true → fetch 不触达；generateThumbnail 仍触达（skipAi 不跳过缩略图）；
 *      aiSkipped 保持 false（skipAi 只 console.log 不设 aiSkipped；仅 rate-limit 设 aiSkipped）。
 *   - 图片不在 docTypes → db.file.update（doc AI summarize fire-and-forget）不触达（负向）。
 *
 * Mock 策略（沿用子轮②a/②b 范式 + 新增 generateThumbnail 与 global.fetch stub）：
 *   - authenticateRequest / next/server / fs/promises 隔离同②a。
 *   - @/lib/parser/image：mock generateThumbnail（返回固定 thumbnailUrl 字符串）。
 *   - @/lib/db：raw db $queryRaw（早检，正向）+ $transaction（executor，新建分支 tx=$queryRaw+
 *     file.create）+ file.update（db.file.update，图片不在 docTypes → 不触达，负向）；
 *     createTenantDb wrapper（dedup findFirst 返回 null → 新建分支）。
 *   - global fetch：vi.stubGlobal('fetch', mockFetch)（沿用 file-helpers.test.ts 范式）。
 *   - process.env.NEXT_PUBLIC_BASE_URL：beforeEach 设为 'http://test-host'，afterEach 恢复。
 *
 * 复用子轮②a 的 vi.hoisted + MockNextResponse + makePostRequest（headers.get spy）+
 * fs/promises ESM 互操作 + $transaction executor + $queryRaw tagged template 契约范式。
 * 新增 generateThumbnail mock + global.fetch stub + Authorization 头透传断言范式，可复用于
 * 子轮②c-doc（summarize fetch，届时 fetch URL 改 /api/ai/summarize，body 改 content）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db
  mockQueryRaw,       // 早检 $queryRaw（配额预检，正向）
  mockTransaction,    // 新建分支 $transaction（executor，记录 + 回调）
  mockRawFileUpdate,  // db.file.update（doc AI summarize；图片不在 docTypes → 不触达，负向）
  // tx（$transaction 回调注入的事务客户端）
  mockTxQueryRaw,     // TOCTOU 配额再检
  mockTxFileCreate,   // 新建 file.create
  // tenantDb（dedup file.findFirst —— 新建分支下 findFirst 返回 null）
  mockTenantFileFindFirst,
  // parser
  mockGenerateThumbnail,
  // fs/promises
  mockMkdir,
  mockWriteFile,
  mockUnlink,
  // global fetch
  mockFetch,
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
    mockGenerateThumbnail: vi.fn(),
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
    mockUnlink: vi.fn(),
    mockFetch: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/parser/image", () => ({
  generateThumbnail: (...args: unknown[]) => mockGenerateThumbnail(...args),
}));
// fs/promises：路由顶部 named import（mkdir/writeFile）+ dedup 分支 dynamic import（unlink）。
// 新建分支不触达 unlink；提供 default 兜底对齐第五十轮 ESM 互操作范式。
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
  // raw db：$queryRaw（早检）+ $transaction（executor，新建分支 tx=$queryRaw+file.create）
  // + file.update（db.file.update，图片不在 docTypes → 不触达，负向）
  db: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      mockTransaction(fn);
      const tx = {
        $queryRaw: (...args: unknown[]) => mockTxQueryRaw(...args),
        file: {
          create: (...args: unknown[]) => mockTxFileCreate(...args),
        },
      };
      return fn(tx);
    },
    file: {
      update: (...args: unknown[]) => mockRawFileUpdate(...args),
    },
  },
  // createTenantDb：新建分支下 findFirst 返回 null
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

// 合法 jpeg magic bytes 头（[0xFF, 0xD8, 0xFF]）+ 少量填充，通过 validateMagicBytes 门
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const JPEG_BASE64 = Buffer.from(JPEG_BYTES).toString("base64");

const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 构造 hand-crafted POST 请求。沿用子轮②a 范式：headers.get spy 覆盖 content-length。
 * 新增 auth 选项以设置 Authorization 头（图片 AI fetch 会透传该头）。
 * url 默认不带 skipAi（使图片 AI fetch 触达）；用例④显式传 skipAi=true。
 */
function makePostRequest(opts: {
  file?: File | string | null;
  contentType?: string | null;
  contentLength?: number;
  url?: string;
  auth?: string;
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
  if (opts.auth !== undefined) {
    headers.set("authorization", opts.auth);
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

describe("/api/files 主路由 POST — 图片 AI process-image fetch（子轮②c-image）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 早检 $queryRaw：默认 0 字节已用
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.$queryRaw（TOCTOU 再检）：默认 0 字节已用
    mockTxQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.file.create：echo back args.data 字段，使响应反映路由实际传入 file.create 的值。
    // 路由响应直接返回 fileRecord.{textContent,thumbnailUrl,...}（line 419-430），
    // 若 mock 硬编码 textContent 会泄露到测试 ②③④（fetch 失败/ok:false/skipAi 应为 undefined）。
    // echo 模式下：路由 data.textContent=ocrText（用例①）→ 响应 ocrText；
    // data.textContent=undefined（用例 ②③④）→ 响应 undefined。tags 来自路由局部变量（line 428），
    // 不经 fileRecord，无需 echo。
    mockTxFileCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "file-img-1",
      fileName: args.data.fileName,
      fileType: args.data.fileType,
      fileSize: args.data.fileSize,
      filePath: args.data.filePath,
      textContent: args.data.textContent,
      thumbnailUrl: args.data.thumbnailUrl,
    }));
    // dedup findFirst：默认 null（新建分支）
    mockTenantFileFindFirst.mockResolvedValue(null);
    // generateThumbnail：默认返回缩略图 URL
    mockGenerateThumbnail.mockResolvedValue("/thumb/photo.jpg");
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    // global fetch：stub 为 mockFetch（沿用 file-helpers.test.ts 的 vi.stubGlobal 范式）。
    // mockReset 清掉上轮 mockResolvedValue/mockRejectedValue，各用例自设返回值。
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    // BASE_URL：设为已知值以便断言 fetch URL
    process.env.NEXT_PUBLIC_BASE_URL = "http://test-host";
  });

  afterEach(() => {
    // 恢复 global fetch，避免污染其他测试文件
    vi.unstubAllGlobals();
    if (originalBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    }
  });

  it("① happy path：jpeg + 无 skipAi + process-image 返回 {ocrText, tags} → generateThumbnail + fetch(process-image) 阻塞 await → textContent=ocrText, tags=aiTags → 新建 $transaction(tx.file.create data 含 AI 产物) → 200；fetch URL/method/body/Authorization 透传；db.file.update 不触达（图片不在 docTypes）", async () => {
    // process-image 返回 OCR 文本 + AI tags
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocrText: "OCR text from image", tags: ["photo", "nature"] }),
    });

    const file = new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" });
    const req = makePostRequest({ file, auth: "Bearer test-token" });

    const res = (await POST(req)) as MockRes;

    // 响应契约：200 + AI 产物 + image previewUrl/thumbnailUrl + aiSkipped=undefined（false→undefined）
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-img-1",
      fileName: "photo.jpg",
      fileType: "image",
      textContent: "OCR text from image",
      thumbnailUrl: "/thumb/photo.jpg",
      previewUrl: "/api/files/file-img-1/preview",
      tags: ["photo", "nature"],
    });
    // aiSkipped=false → 响应 aiSkipped=undefined（line 429: aiSkipped ? true : undefined）
    expect(res.body.aiSkipped).toBeUndefined();

    // generateThumbnail：在 fetch 之前调用，收到 buffer + fileName + userId
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(mockGenerateThumbnail.mock.calls[0][1]).toBe("photo.jpg");
    expect(mockGenerateThumbnail.mock.calls[0][2]).toBe("user-1");

    // fetch process-image：URL = ${BASE_URL}/api/ai/process-image，method=POST，
    // headers 含 Content-Type + Authorization 透传，body = { imageBase64 }
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchUrl).toBe("http://test-host/api/ai/process-image");
    expect(fetchOpts.method).toBe("POST");
    expect((fetchOpts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((fetchOpts.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-token");
    const body = JSON.parse(fetchOpts.body as string) as { imageBase64: string };
    // imageBase64 为 JPEG_BYTES 的 base64 编码（btoa over String.fromCharCode == Buffer.toString('base64')）
    expect(body.imageBase64).toBe(JPEG_BASE64);

    // 新建分支 $transaction 触达一次
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // tx.$queryRaw TOCTOU 再检触达
    expect(mockTxQueryRaw).toHaveBeenCalledTimes(1);

    // tx.file.create data：textContent=ocrText（AI 覆盖）、thumbnailUrl=generateThumbnail 返回值、
    // tags=JSON.stringify(aiTags)、fileType="image"、storageMode="cloud"
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: {
        tenantId: "tenant-1",
        userId: "user-1",
        fileName: "photo.jpg",
        fileType: "image",
        fileSize: JPEG_BYTES.length,
        textContent: "OCR text from image",
        thumbnailUrl: "/thumb/photo.jpg",
        storageMode: "cloud",
        tags: JSON.stringify(["photo", "nature"]),
      },
    });

    // 负向：图片不在 docTypes → db.file.update（doc AI summarize fire-and-forget）不触达
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("② process-image fetch rejects（网络错误）→ try/catch 吞错 → 响应仍 200；textContent=undefined（图片无文本提取）、tags=[]；generateThumbnail 仍触达（在 fetch 之前）", async () => {
    mockFetch.mockRejectedValue(new Error("network unreachable"));

    const file = new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    // fetch 抛错被 try/catch 吞掉，响应仍 200
    expect(res.status).toBe(200);
    // textContent 未被覆盖（图片无文本提取，初始 undefined）；tags 未被覆盖（初始 []）
    expect(res.body).toMatchObject({
      fileType: "image",
      textContent: undefined,
      tags: [],
    });

    // generateThumbnail 仍触达（在 fetch 之前，不受 fetch 失败影响）
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    // fetch 已触达（只是抛错被吞）
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // tx.file.create data：textContent=undefined、tags=JSON.stringify([])、thumbnailUrl 仍生成
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: {
        textContent: undefined,
        thumbnailUrl: "/thumb/photo.jpg",
        tags: "[]",
      },
    });
  });

  it("③ process-image 返回 ok:false（500）→ aiRes.ok=false → 不读 json、不覆盖 textContent/tags → 响应 200；textContent=undefined、tags=[]", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const file = new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    // aiRes.ok=false → 不进入 json() 读取分支，textContent/tags 保持初始值
    expect(res.body).toMatchObject({
      fileType: "image",
      textContent: undefined,
      tags: [],
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // tx.file.create data：textContent=undefined、tags="[]"、thumbnailUrl 仍生成
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: { textContent: undefined, tags: "[]", thumbnailUrl: "/thumb/photo.jpg" },
    });
  });

  it("④ skipAi=true → fetch 不触达；generateThumbnail 仍触达（skipAi 不跳过缩略图）；aiSkipped=undefined（skipAi 只 console.log 不设 aiSkipped）", async () => {
    const file = new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" });

    const res = (await POST(makePostRequest({ file, url: "http://localhost/api/files?skipAi=true" }))) as MockRes;

    expect(res.status).toBe(200);
    // skipAi=true → 图片 AI fetch 不触达，textContent=undefined、tags=[]
    expect(res.body).toMatchObject({
      fileType: "image",
      textContent: undefined,
      tags: [],
    });
    // fetch 未触达（skipAi=true 跳过图片 AI）
    expect(mockFetch).not.toHaveBeenCalled();
    // generateThumbnail 仍触达（skipAi 不跳过缩略图生成）
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    // aiSkipped=false → 响应 aiSkipped=undefined（skipAi 只 console.log，不设 aiSkipped；
    // 仅 rate-limit 会设 aiSkipped=true，本轮不触发 rate-limit）
    expect(res.body.aiSkipped).toBeUndefined();
    // tx.file.create 仍触达（新建分支，thumbnailUrl 生成，textContent=undefined）
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: { fileType: "image", thumbnailUrl: "/thumb/photo.jpg", textContent: undefined, tags: "[]" },
    });
  });
});
