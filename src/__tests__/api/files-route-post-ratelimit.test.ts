/**
 * files/route.ts 主路由 handler 级集成测试 —— POST rate-limit 触发 aiSkipped:true 专轮（子轮②d）
 *
 * 锁定 /api/files 主路由 POST 的"AI 处理速率限制"分支：当某 userId 在 5 分钟窗口内累计
 * 10 次 AI 处理后，第 11 次上传触发 checkAiRateLimit 返回 false → skipAiDueToRateLimit=true
 * （image 分支）/ skipDocAiDueToRateLimit=true（doc 分支）→ aiSkipped=true → AI fetch 不触达，
 * 但文件存储主流程（mkdir/writeFile/$transaction/file.create）不受影响仍正常完成。
 *
 * 核心难点 —— 模块级 Map 状态隔离：
 *   route.ts 的 `aiProcessingTimestamps` 是**模块级 Map<string, number[]>**（line 59），非导出，
 *   无法从测试侧直接 reset。timestamp 仅在 AI 处理实际进行时被 push（image line 242 阻塞块内、
 *   doc line 379 IIFE 内），checkAiRateLimit 自身只 filter+check 不 push。触发 rate-limit 需
 *   Map 中该 userId 已有 ≥10 条 recent timestamp。
 *
 * 隔离策略（本轮核心提炼 —— 模块级 Map seeding 范式）：
 *   1. vitest 默认 isolate:true，每个测试文件独立 module registry → aiProcessingTimestamps 在
 *      本文件内 fresh，不跨文件污染（②c-image/②c-doc 用 user-1 累积的 timestamp 不渗入本文件）。
 *   2. beforeAll 用 userId="user-ratelimit" 连做 10 次 image 上传（不带 skipAi）填充 Map：
 *      每次 image 上传 line 230 checkAiRateLimit 通过（<10）→ line 242 push 1 条 timestamp。
 *      第 10 次上传时 line 230 通过（9<10）push 第 10 条，但 line 372 doc-branch checkAiRateLimit
 *      返 false（10≥10）设 aiSkipped=true（image 不在 docTypes 故无 IIFE 副作用，仅响应字段）。
 *      种子响应不参与断言，只关心 Map 累积到 10 条。
 *   3. 种子完成后 Map["user-ratelimit"] 恰好 10 条 recent timestamp。后续用 user-ratelimit 的
 *      上传 line 230/372 checkAiRateLimit 均 false → aiSkipped=true（rate-limit 锁定）。rate-limit
 *      分支不 push（AI 块不进入/IIFE 不启动），故 10 条计数稳定，多轮 rate-limit 用例可复用同一种子。
 *   4. 对照用例用 fresh userId="user-fresh"（Map 中无条目 → 0<10 通过 → 不 rate-limit），证明
 *      aiSkipped=true 确由 rate-limit 触发而非其他因素（causation 锁定）。
 *
 * 核心契约（rate-limit 触发 aiSkipped:true 锁定）：
 *   1. **image rate-limit**：user-ratelimit 第 11 次 image 上传 → line 230 checkAiRateLimit false →
 *      skipAiDueToRateLimit=true → aiSkipped=true → line 240 AI 块不进入 → fetch 不触达、无 timestamp
 *      push。但 generateThumbnail（line 227，在 rate-limit 检查 line 230 之前）仍触达；文件存储
 *      $transaction/file.create 仍完成。响应 aiSkipped:true、textContent:undefined（无 OCR）、
 *      tags:[]、thumbnailUrl 生成、previewUrl 生成。
 *   2. **doc rate-limit**：user-ratelimit doc 上传 → 非 image 跳过 image 块 → line 372
 *      checkAiRateLimit false → skipDocAiDueToRateLimit=true → aiSkipped=true → line 375 IIFE 条件
 *      `!skipDocAiDueToRateLimit` false → IIFE 不启动 → fetch 不触达、db.file.update 不触达、
 *      无 timestamp push。响应 aiSkipped:true、textContent=buffer.toString（解析文本，IIFE 未覆盖）、
 *      tags:[]、无 summary 字段。
 *   3. **control（fresh userId）**：user-fresh image 上传 → 0<10 通过 → aiSkipped 保持 false →
 *      响应 aiSkipped:undefined（false→undefined）；fetch 触达。证明同构上传在未达 limit 时不触发
 *      aiSkipped，反向锁定 rate-limit 是 aiSkipped:true 的唯一成因。
 *
 * 负向契约：
 *   - rate-limit 不阻断主流程：image/doc rate-limit 用例均 200 + file.create 触达（文件仍落库）。
 *   - rate-limit 不触达 AI fetch：image 用例 fetch 未调；doc 用例 fetch 未调 + db.file.update 未调
 *     （IIFE 未启动）。用 settleIife() flush microtask 链后断言 db.file.update 未触达（不可用
 *     vi.waitFor 轮询 not-called）。
 *   - generateThumbnail 不受 rate-limit 影响（在 rate-limit 检查之前）。
 *
 * Mock 策略（沿用 ②c-image/②c-doc 范式）：
 *   - next/server / @/lib/api-auth / @/lib/parser/image（隔离 sharp）/ fs/promises（ESM 互操作 default+
 *     named）/ @/lib/db（raw $queryRaw + $transaction executor + file.update + createTenantDb wrapper）
 *     隔离同 ②c-image/②c-doc。
 *   - global fetch：vi.stubGlobal('fetch', mockFetch)；beforeEach mockReset 清种子 impl，各用例自设。
 *   - process.env.NEXT_PUBLIC_BASE_URL：beforeAll 设 'http://test-host'，afterEach 恢复。
 *   - 种子用 mockFetch.mockResolvedValue({ok:true, json: ocrText+tags}) 使 image 种子走通 AI 块 push。
 *
 * 复用 ②a/②c-image/②c-doc 的 vi.hoisted + MockNextResponse + makePostRequest（headers.get spy + auth）+
 * $transaction executor + $queryRaw tagged template + createTenantDb wrapper + global.fetch stub +
 * Authorization 透传 + NEXT_PUBLIC_BASE_URL env 注入/恢复 + settleIife（flush microtask）范式。
 * 新增"模块级 Map seeding 范式"（beforeAll 填充 + fresh-key 对照），可复用于任何"模块级计数器/
 * 限流 Map"的 handler 级测试。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db
  mockQueryRaw,       // 早检 $queryRaw（配额预检，正向）
  mockTransaction,    // 新建分支 $transaction（executor，记录 + 回调）
  mockRawFileUpdate,  // db.file.update（doc AI summarize IIFE；rate-limit 用例不触达，负向）
  // tx（$transaction 回调注入的事务客户端）
  mockTxQueryRaw,     // TOCTOU 配额再检
  mockTxFileCreate,   // 新建 file.create（echo data）
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
// mock @/lib/parser/image：隔离 sharp 原生模块（route.ts 顶部 eager import 会触发 sharp 加载）。
// doc 用例不触达 generateThumbnail，此处仅防 import-time 失败；image 用例断言其触达。
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
  // + file.update（db.file.update，doc IIFE；rate-limit 用例不触达，负向）
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

// 默认 owner 身份模板（userId 由各用例/种子覆写）
const baseAuth = {
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};
// rate-limit 用例统一用此 userId（beforeAll 种子填充其 Map 至 10 条）
const RL_USER = "user-ratelimit";
// 对照用例用此 fresh userId（Map 中无条目 → 不 rate-limit）
const FRESH_USER = "user-fresh";

type MockRes = InstanceType<typeof MockNextResponse>;

// 合法 jpeg magic bytes 头（[0xFF, 0xD8, 0xFF]）+ 少量填充，通过 validateMagicBytes 门
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

// txt 文档内容（buffer.toString("utf-8") 直接作为 textContent，无需 parser）
const DOC_CONTENT = "Hello doc content for rate-limit test";
const DOC_FILE = new File([DOC_CONTENT], "doc.txt", { type: "text/plain" });

const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

// rate-limit 阈值：checkAiRateLimit 在 recent.length < LIMIT 时通过（返 true），≥LIMIT 时 false。
// route.ts line 66 硬编码 LIMIT=10。种子需 push 恰好 10 条使第 11 次触发 false。
const AI_RATE_LIMIT = 10;

/**
 * 构造 hand-crafted POST 请求。沿用 ②c-image 范式：headers.get spy 覆盖 content-length。
 * auth 选项设置 Authorization 头（image AI fetch 会透传该头）。
 * url 默认不带 skipAi（rate-limit 测试**必须不传 skipAi**——skipAi=true 会跳过 AI 块但不设
 * aiSkipped，使 rate-limit 语义无法被观测）。
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

/**
 * flush fire-and-forget IIFE 的 microtask 链到完成。
 * 用于 doc rate-limit 负向用例：flush 后断言 db.file.update 未触达（不可用 vi.waitFor 轮询
 * not-called）。沿用 ②c-doc 范式。
 */
async function settleIife(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("/api/files 主路由 POST — rate-limit 触发 aiSkipped:true（子轮②d）", () => {
  // ===== beforeAll：种子填充 aiProcessingTimestamps["user-ratelimit"] 至 10 条 =====
  // vitest isolate:true 保证本文件 route 模块（含模块级 Map）fresh。beforeAll 在所有用例前
  // 执行一次，种子 push 的 timestamp 跨 beforeEach 持久（vi.clearAllMocks 只清 mock 调用记录，
  // 不影响 route 模块内 Map 状态）。rate-limit 用例复用同一种子（rate-limit 分支不 push，10 条
  // 计数稳定）；对照用例用 fresh userId 不受种子影响。
  beforeAll(async () => {
    // 种子 mock 配置
    mockAuthenticate.mockResolvedValue({ ...baseAuth, userId: RL_USER });
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    mockTxQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    mockTxFileCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "file-seed",
      fileName: args.data.fileName,
      fileType: args.data.fileType,
      fileSize: args.data.fileSize,
      filePath: args.data.filePath,
      textContent: args.data.textContent,
      thumbnailUrl: args.data.thumbnailUrl,
    }));
    mockTenantFileFindFirst.mockResolvedValue(null);
    mockGenerateThumbnail.mockResolvedValue("/thumb/seed.jpg");
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockRawFileUpdate.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", mockFetch);
    // 种子 image 上传需走通 AI 块（line 240）才能 push timestamp（line 242）。
    // mockFetch 返 ok:true + ocrText 使 await fetch 通过，textContent/tags 被覆盖（无关断言）。
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocrText: "seed-ocr", tags: ["seed-tag"] }),
    });
    process.env.NEXT_PUBLIC_BASE_URL = "http://test-host";

    // 连做 AI_RATE_LIMIT(10) 次 image 上传填充 Map。
    // 每次 line 230 checkAiRateLimit 通过（<10）→ line 242 push 1 条。
    // 第 10 次 line 372 doc-branch checkAiRateLimit 返 false 设 aiSkipped=true（种子响应不断言）。
    for (let i = 0; i < AI_RATE_LIMIT; i++) {
      const file = new File([JPEG_BYTES], `seed-${i}.jpg`, { type: "image/jpeg" });
      const res = (await POST(makePostRequest({ file, auth: "Bearer seed-token" }))) as MockRes;
      if (res.status !== 200) {
        throw new Error(`rate-limit seed upload ${i} failed: status=${res.status}`);
      }
    }
  });

  beforeEach(() => {
    // clearAllMocks 清 mock 调用记录（不影响 route 模块内 Map 状态——种子 10 条持久）。
    vi.clearAllMocks();
    // 默认 mock 配置（各用例可覆写 userId / mockFetch 返回值）
    mockAuthenticate.mockResolvedValue({ ...baseAuth, userId: RL_USER });
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    mockTxQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    mockTxFileCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "file-new-1",
      fileName: args.data.fileName,
      fileType: args.data.fileType,
      fileSize: args.data.fileSize,
      filePath: args.data.filePath,
      textContent: args.data.textContent,
      thumbnailUrl: args.data.thumbnailUrl,
    }));
    mockTenantFileFindFirst.mockResolvedValue(null);
    mockGenerateThumbnail.mockResolvedValue("/thumb/photo.jpg");
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockRawFileUpdate.mockResolvedValue(undefined);
    // mockReset 清种子 mockFetch impl；各用例自设（rate-limit 用例 fetch 不应被调，可不设返回值，
    // 但 stub 仍保留以防路由误调时 hit real network）。
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    process.env.NEXT_PUBLIC_BASE_URL = "http://test-host";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    }
  });

  it("① image rate-limit：user-ratelimit 第 11 次 image 上传 → checkAiRateLimit false → aiSkipped=true → fetch 不触达；generateThumbnail 仍触达（在 rate-limit 检查之前）；文件存储 $transaction/file.create 仍完成；响应 aiSkipped:true、textContent:undefined（无 OCR）、tags:[]", async () => {
    // mockAuthenticate 默认返 RL_USER（beforeEach 已设）；不覆写。
    // mockFetch 不设返回值——rate-limit 下不应被调；若误调将返 undefined→aiRes.ok throw→被
    // try/catch 吞，但下方 expect(mockFetch).not.toHaveBeenCalled() 会捕获违规。
    const file = new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" });
    const res = (await POST(makePostRequest({ file, auth: "Bearer rl-token" }))) as MockRes;

    // 响应契约：rate-limit 触发 → aiSkipped:true（line 429: aiSkipped ? true : undefined → true）
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-new-1",
      fileName: "photo.jpg",
      fileType: "image",
      textContent: undefined, // AI 块不进入 → 无 OCR 覆盖 → 图片无文本提取
      thumbnailUrl: "/thumb/photo.jpg", // generateThumbnail 仍生成（line 227，在 rate-limit 检查前）
      previewUrl: "/api/files/file-new-1/preview",
      tags: [], // AI 块不进入 → tags 初始 []
    });
    expect(res.body.aiSkipped).toBe(true);

    // 负向：rate-limit → AI 块不进入 → fetch 不触达、无 timestamp push
    expect(mockFetch).not.toHaveBeenCalled();

    // 正向：generateThumbnail 仍触达（line 227 在 line 230 checkAiRateLimit 之前）
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(mockGenerateThumbnail.mock.calls[0][1]).toBe("photo.jpg");
    expect(mockGenerateThumbnail.mock.calls[0][2]).toBe(RL_USER);

    // 正向：rate-limit 不阻断主流程 → mkdir/writeFile/$transaction/file.create 仍完成
    expect(mockMkdir).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    // tx.file.create data：textContent=undefined（无 OCR）、thumbnailUrl 生成、tags="[]"、fileType=image
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: {
        tenantId: "tenant-1",
        userId: RL_USER,
        fileName: "photo.jpg",
        fileType: "image",
        thumbnailUrl: "/thumb/photo.jpg",
        textContent: undefined,
        tags: "[]",
        storageMode: "cloud",
      },
    });

    // 负向：image 不在 docTypes → db.file.update（doc IIFE）本就不触达（与 rate-limit 无关）
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("② doc rate-limit：user-ratelimit doc 上传 → 非 image 跳过 image 块 → line 372 checkAiRateLimit false → skipDocAiDueToRateLimit=true → aiSkipped=true → IIFE 不启动 → fetch 不触达、db.file.update 不触达；响应 aiSkipped:true、textContent=buffer.toString、tags:[]、无 summary", async () => {
    // mockAuthenticate 默认返 RL_USER（beforeEach 已设）。
    // mockFetch 不设返回值——IIFE 不启动 → fetch 不应被调。
    const res = (await POST(makePostRequest({ file: DOC_FILE }))) as MockRes;

    // 响应契约：doc rate-limit → aiSkipped:true；textContent=解析文本（IIFE 未覆盖）；tags=[]（初始）
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-new-1",
      fileName: "doc.txt",
      fileType: "txt",
      fileSize: DOC_CONTENT.length,
      textContent: DOC_CONTENT, // buffer.toString("utf-8")；IIFE 未启动未覆盖
      thumbnailUrl: undefined,  // 非 image
      previewUrl: undefined,    // 非 image
      tags: [],                 // 初始，IIFE tags 合并不入响应
    });
    expect(res.body.aiSkipped).toBe(true);

    // 负向：rate-limit → IIFE 不启动 → fetch 不触达
    expect(mockFetch).not.toHaveBeenCalled();
    // flush IIFE microtask 链（即便 IIFE 未启动，flush 确保无 stray microtask）后断言 db.file.update 未触达
    await settleIife();
    expect(mockRawFileUpdate).not.toHaveBeenCalled();

    // 正向：rate-limit 不阻断主流程 → 文件仍落库
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: {
        fileType: "txt",
        textContent: DOC_CONTENT,
        tags: "[]",
        storageMode: "cloud",
      },
    });

    // 负向：doc 非 image → generateThumbnail 不触达
    expect(mockGenerateThumbnail).not.toHaveBeenCalled();
  });

  it("③ control（fresh userId）：user-fresh image 上传 → 0<10 通过 → aiSkipped 保持 false → 响应 aiSkipped:undefined；fetch 触达（不 rate-limit）。证明同构上传在未达 limit 时不触发 aiSkipped，反向锁定 rate-limit 是 aiSkipped:true 的唯一成因", async () => {
    // 覆写 mockAuthenticate 返 fresh userId（Map 中无条目 → 0<10 通过）
    mockAuthenticate.mockResolvedValue({ ...baseAuth, userId: FRESH_USER });
    // mockFetch 返 ok:true + ocrText/tags（control 用例 image AI 块应进入 → fetch 触达）
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocrText: "fresh-ocr", tags: ["fresh-tag"] }),
    });

    const file = new File([JPEG_BYTES], "fresh.jpg", { type: "image/jpeg" });
    const res = (await POST(makePostRequest({ file, auth: "Bearer fresh-token" }))) as MockRes;

    // 响应契约：fresh userId → 不 rate-limit → aiSkipped=false → 响应 aiSkipped:undefined
    // （line 429: aiSkipped ? true : undefined）
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-new-1",
      fileName: "fresh.jpg",
      fileType: "image",
      textContent: "fresh-ocr", // AI 块进入 → OCR 覆盖 textContent
      thumbnailUrl: "/thumb/photo.jpg",
      previewUrl: "/api/files/file-new-1/preview",
      tags: ["fresh-tag"], // AI tags 覆盖
    });
    expect(res.body.aiSkipped).toBeUndefined(); // false → undefined（与用例①的 true 形成对照）

    // 正向：fresh userId → AI 块进入 → fetch 触达（与用例①的 not-called 形成对照）
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchUrl).toBe("http://test-host/api/ai/process-image");
    expect(fetchOpts.method).toBe("POST");
    expect((fetchOpts.headers as Record<string, string>)["Authorization"]).toBe("Bearer fresh-token");

    // 正向：generateThumbnail 触达（与用例①一致——无论 rate-limit 与否都触达）
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(mockGenerateThumbnail.mock.calls[0][2]).toBe(FRESH_USER);

    // 正向：文件存储主流程完成
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: {
        userId: FRESH_USER,
        fileType: "image",
        textContent: "fresh-ocr",
        tags: JSON.stringify(["fresh-tag"]),
      },
    });
  });
});
