/**
 * files/route.ts 主路由 handler 级集成测试 —— POST 文档 AI summarize fetch 专轮（子轮②c-doc）
 *
 * 锁定 /api/files 主路由 POST 的"文档 AI summarize fire-and-forget IIFE"分支：txt 文档
 * （fileType="txt" ∈ docTypes）+ textContent 非空（buffer.toString）+ !skipAi +
 * !skipDocAiDueToRateLimit → 新建分支 $transaction（tx.$queryRaw TOCTOU + tx.file.create）
 * 返回 200 后，**后置** fire-and-forget IIFE 异步触达 fetch(/api/ai/summarize) →
 * summaryRes.ok && summaryData.summary → tenantDb.file.update(summary/keyPoints/tags)。
 *
 * 与子轮②c-image 的关键差异：
 *   - ②c-image 的图片 AI fetch 是**阻塞 await**（路由内 await fetch(process-image)），
 *     fetch 结果在响应前覆盖 textContent/tags，响应直接反映 AI 产物。
 *   - ②c-doc 的文档 AI summarize 是**真 fire-and-forget IIFE**（(async()=>{...})() 未 await），
 *     路由先返回响应（textContent=解析文本、tags=[] 初始、无 summary 字段），IIFE 在响应后
 *     异步更新 DB（tenantDb.file.update 写 summary/keyPoints/tags）——**响应不反映 AI 产物**。
 *     故测试需用 vi.waitFor 等待 IIFE 的 tenantDb.file.update 触达（正向用例），或 flush microtask
 *     链后断言 tenantDb.file.update 未触达（负向用例）。
 *
 * 核心契约（文档 AI summarize IIFE 锁定）：
 *   1. **IIFE 触达条件**：docTypes.includes(fileType)（word/pdf/pptx/markdown/txt）&&
 *      textContent（真值，buffer.toString 非空）&& !skipAiParam && !skipDocAiDueToRateLimit。
 *      本轮用 txt 代表 docTypes（其余 doc 类型 textContent 来源不同但 IIFE 路径一致，类型矩阵
 *      留待子轮③）。skipAi=true 时 IIFE 不启动（用例⑤锁定）。
 *   2. **fetch URL/method/body 契约**：URL = `${NEXT_PUBLIC_BASE_URL}/api/ai/summarize`，
 *      method="POST"，headers 含 "Content-Type":"application/json" + Authorization（从请求头
 *      透传），body = JSON.stringify({ content: textContent, fileName, fileType })。
 *   3. **summary 覆盖 tenantDb.file.update**：summaryRes.ok && summaryData.summary（真值）→
 *      tenantDb.file.update({ where:{id:fileRecord.id}, data:{ summary, keyPoints:
 *      JSON.stringify(keyPoints||[]), tags: suggestedTags?.length>0 ? JSON.stringify([...tags,
 *      ...suggestedTags]) : JSON.stringify(tags) } })。用例①锁 suggestedTags 合并分支，
 *      用例②锁无 suggestedTags 的 else 分支（tags=JSON.stringify([])）。
 *   4. **响应形态（fire-and-forget 不反映 AI 产物）**：响应 textContent=buffer.toString（解析
 *      文本）、tags=[]（初始，IIFE 的 tags 合并不入响应）、无 summary 字段、thumbnailUrl=undefined
 *      （非 image）、previewUrl=undefined（非 image）、aiSkipped=undefined（rate-limit 未触发）。
 *
 * 负向契约（tenantDb.file.update 不触达）：
 *   - fetch rejects（网络错误）→ IIFE try/catch 吞错 → tenantDb.file.update 不触达（用例③）。
 *   - summaryRes.ok=false（非 200）→ 跳过 `if (summaryRes.ok)` 块 → 不读 json、不 update（用例④）。
 *   - summaryRes.ok=true 但 summaryData.summary 假值 → 跳过 `if (summaryData.summary)` → 不 update（用例⑤）。
 *   - skipAi=true → IIFE 不启动 → fetch 不触达、tenantDb.file.update 不触达（用例⑥）。
 *
 * Mock 策略（沿用子轮②c-image 范式，txt 无需 parser mock —— buffer.toString 直接取文本）：
 *   - authenticateRequest / next/server / fs/promises / @/lib/db / createTenantDb 隔离同②c-image。
 *   - 不 mock @/lib/parser/image、word、pdf、ppt：txt 路径不经任何 parser（buffer.toString("utf-8")），
 *     且 ②a 已验证这些模块在测试环境可正常加载。
 *   - raw db $queryRaw（早检）+ $transaction（executor，新建分支 tx=$queryRaw+file.create）+
 *     file.update（**tenantDb.file.update，本轮正向 —— IIFE 触达**）。
 *   - global fetch：vi.stubGlobal('fetch', mockFetch)（沿用 file-helpers.test.ts 范式）。
 *   - process.env.NEXT_PUBLIC_BASE_URL：beforeEach 设为 'http://test-host'，afterEach 恢复。
 *
 * IIFE 时序处理范式（本轮核心提炼）：
 *   - 正向用例（tenantDb.file.update 应触达）：`await vi.waitFor(() => expect(mockRawFileUpdate).
 *     toHaveBeenCalledTimes(1))` 轮询等待 IIFE 的 microtask 链（fetch→json→update）排空后断言触达，
 *     再断言 update 调用参数。
 *   - 负向用例（tenantDb.file.update 不应触达）：先 `await new Promise(r=>setTimeout(r,20))` flush
 *     IIFE 的 microtask 链到完成，再断言未触达（不能用 vi.waitFor 轮询 not-called，否则会超时）。
 *   该范式可复用于任何"fire-and-forget IIFE + 后置 DB 写"的 handler 级测试。
 *
 * 复用子轮②a/②c-image 的 vi.hoisted + MockNextResponse + makePostRequest（headers.get spy +
 * auth 选项）+ fs/promises ESM 互操作 + $transaction executor + $queryRaw tagged template +
 * createTenantDb wrapper（dedup findFirst 返回 null → 新建分支）+ global.fetch stub +
 * Authorization 头透传断言 + NEXT_PUBLIC_BASE_URL env 注入/恢复范式。
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
  mockRawFileUpdate,  // tenantDb.file.update（**本轮正向 —— IIFE 触达**；负向用例不触达）
  // tx（$transaction 回调注入的事务客户端）
  mockTxQueryRaw,     // TOCTOU 配额再检
  mockTxFileCreate,   // 新建 file.create
  // tenantDb（dedup file.findFirst —— 新建分支下 findFirst 返回 null）
  mockTenantFileFindFirst,
  // parser（txt 路径不触达 generateThumbnail，但 route.ts 顶部 eager import
  // @/lib/parser/image 会触发 `import sharp from "sharp"`；沙箱未构建 sharp 原生模块，
  // 必须 mock 该模块以隔离。与子轮②c-image 一致。）
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
// txt 路径不触达 generateThumbnail，此处仅防 import-time 失败，断言不依赖其调用。
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
  // file.update 经 createTenantDb().file.update（**本轮正向 —— doc AI summarize IIFE 触达**），
  // tenantDb 内部以 updateMany + tenantId 守卫实现租户隔离写。
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
  },
  // createTenantDb：新建分支下 findFirst 返回 null；update 供 IIFE 写回 summary
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

type MockRes = InstanceType<typeof MockNextResponse>;

// txt 文档内容（buffer.toString("utf-8") 直接作为 textContent，无需 parser）
const DOC_CONTENT = "Hello doc content for summarize";
const DOC_FILE = new File([DOC_CONTENT], "doc.txt", { type: "text/plain" });

const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 构造 hand-crafted POST 请求。沿用子轮②c-image 范式：headers.get spy 覆盖 content-length。
 * auth 选项设置 Authorization 头（doc AI summarize IIFE 会透传该头到 /api/ai/summarize）。
 * url 默认不带 skipAi（使 IIFE 触达）；用例⑥显式传 skipAi=true。
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
 * mockResolvedValue 使 fetch→json→update 全部在 microtask 队列内 resolve，
 * 一个 macrotask（setTimeout）足以排空全部 pending microtasks。
 * 用于负向用例：flush 后断言 tenantDb.file.update 未触达（不可用 vi.waitFor 轮询 not-called）。
 */
async function settleIife(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("/api/files 主路由 POST — 文档 AI summarize fetch（子轮②c-doc）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 早检 $queryRaw：默认 0 字节已用
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.$queryRaw（TOCTOU 再检）：默认 0 字节已用
    mockTxQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.file.create：echo back args.data 字段，使响应反映路由实际传入 file.create 的值。
    // 路由响应直接返回 fileRecord.{textContent,...}（line 419-430），echo 模式确保响应反映路由数据
    // 而非 mock 硬编码。fileRecord.id 供 IIFE 的 tenantDb.file.update where 子句使用。
    mockTxFileCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "file-doc-1",
      fileName: args.data.fileName,
      fileType: args.data.fileType,
      fileSize: args.data.fileSize,
      filePath: args.data.filePath,
      textContent: args.data.textContent,
      thumbnailUrl: args.data.thumbnailUrl,
    }));
    // dedup findFirst：默认 null（新建分支）
    mockTenantFileFindFirst.mockResolvedValue(null);
    // generateThumbnail：txt 路径不触达，设默认值仅为完整性（与②c-image 范式一致）
    mockGenerateThumbnail.mockResolvedValue("/thumb/doc.jpg");
    // tenantDb.file.update：默认返回 undefined（IIFE await undefined 立即 resolve，无副作用）
    mockRawFileUpdate.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    // global fetch：stub 为 mockFetch（沿用 file-helpers.test.ts 的 vi.stubGlobal 范式）。
    // mockReset 清掉上轮 mockResolvedValue/mockRejectedValue，各用例自设返回值。
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
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

  it("① happy path：txt 文档 + 无 skipAi + summarize 返回 {summary, keyPoints, suggestedTags} → 新建 $transaction 返回 200 → 后置 IIFE fetch(/api/ai/summarize) 触达 → tenantDb.file.update(summary/keyPoints/合并 tags)；响应不反映 AI 产物（textContent=解析文本、tags=[]、无 summary）", async () => {
    // summarize 返回 summary + keyPoints + suggestedTags（触发 tags 合并分支）
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: "Doc summary text",
        keyPoints: ["k1", "k2"],
        suggestedTags: ["t1", "t2"],
      }),
    });

    const req = makePostRequest({ file: DOC_FILE, auth: "Bearer test-token" });
    const res = (await POST(req)) as MockRes;

    // 响应契约（fire-and-forget：响应不反映 AI 产物）
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-doc-1",
      fileName: "doc.txt",
      fileType: "txt",
      fileSize: DOC_CONTENT.length,
      textContent: DOC_CONTENT, // buffer.toString("utf-8")
      thumbnailUrl: undefined,    // 非 image
      previewUrl: undefined,      // 非 image
      tags: [],                   // 初始，IIFE 的 tags 合并不入响应
    });
    // aiSkipped=false → 响应 aiSkipped=undefined（rate-limit 未触发）
    expect(res.body.aiSkipped).toBeUndefined();

    // 新建分支 $transaction 触达一次
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxQueryRaw).toHaveBeenCalledTimes(1);
    // tx.file.create data：textContent=解析文本、thumbnailUrl=undefined、tags="[]"、storageMode="cloud"
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: {
        tenantId: "tenant-1",
        userId: "user-1",
        fileName: "doc.txt",
        fileType: "txt",
        fileSize: DOC_CONTENT.length,
        textContent: DOC_CONTENT,
        thumbnailUrl: undefined,
        storageMode: "cloud",
        tags: "[]",
      },
    });

    // fetch /api/ai/summarize：URL = ${BASE_URL}/api/ai/summarize，method=POST，
    // headers 含 Content-Type + Authorization 透传，body = { content, fileName, fileType }
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchUrl).toBe("http://test-host/api/ai/summarize");
    expect(fetchOpts.method).toBe("POST");
    expect((fetchOpts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((fetchOpts.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-token");
    const body = JSON.parse(fetchOpts.body as string) as {
      content: string;
      fileName: string;
      fileType: string;
    };
    expect(body).toEqual({
      content: DOC_CONTENT,
      fileName: "doc.txt",
      fileType: "txt",
    });

    // 后置 IIFE：vi.waitFor 等待 tenantDb.file.update 触达（fire-and-forget，响应后才异步执行）
    await vi.waitFor(() => {
      expect(mockRawFileUpdate).toHaveBeenCalledTimes(1);
    });
    // tenantDb.file.update 参数：where.id=fileRecord.id、summary 覆盖、keyPoints=JSON.stringify、
    // tags 合并分支（suggestedTags?.length>0 → JSON.stringify([...[], ...suggestedTags])）
    expect(mockRawFileUpdate).toHaveBeenCalledWith({
      where: { id: "file-doc-1" },
      data: {
        summary: "Doc summary text",
        keyPoints: JSON.stringify(["k1", "k2"]),
        tags: JSON.stringify(["t1", "t2"]),
      },
    });
  });

  it("② summarize 返回 summary + keyPoints（无 suggestedTags）→ tenantDb.file.update tags 走 else 分支（tags=JSON.stringify([])）；其余同①", async () => {
    // summarize 返回 summary + keyPoints，但**无 suggestedTags** → 锁 else 分支
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: "Summary only",
        keyPoints: ["only-point"],
        // suggestedTags 缺失
      }),
    });

    const res = (await POST(makePostRequest({ file: DOC_FILE }))) as MockRes;

    expect(res.status).toBe(200);
    // fetch 触达（body 与①一致，此处不重复断言 URL）
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(mockRawFileUpdate).toHaveBeenCalledTimes(1);
    });
    // else 分支：suggestedTags?.length>0 为 false → tags = JSON.stringify(tags) = JSON.stringify([])
    expect(mockRawFileUpdate).toHaveBeenCalledWith({
      where: { id: "file-doc-1" },
      data: {
        summary: "Summary only",
        keyPoints: JSON.stringify(["only-point"]),
        tags: JSON.stringify([]), // '[]'
      },
    });
  });

  it("③ summarize fetch rejects（网络错误）→ IIFE try/catch 吞错 → tenantDb.file.update 不触达；响应仍 200（fire-and-forget 不阻断主流程）", async () => {
    mockFetch.mockRejectedValue(new Error("network unreachable"));

    const res = (await POST(makePostRequest({ file: DOC_FILE }))) as MockRes;

    // 响应仍 200（IIFE 异常被吞，不影响主流程）
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileType: "txt",
      textContent: DOC_CONTENT,
      tags: [],
    });
    // fetch 已触达（只是抛错被 IIFE catch 吞掉）
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // flush IIFE microtask 链到完成，再断言 tenantDb.file.update 未触达
    await settleIife();
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("④ summarize 返回 ok:false（500）→ summaryRes.ok=false → 跳过 if(summaryRes.ok) 块 → 不读 json、不 update；响应 200", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const res = (await POST(makePostRequest({ file: DOC_FILE }))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // ok:false → 不进入 json() 读取分支，tenantDb.file.update 不触达
    await settleIife();
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("⑤ summarize 返回 ok:true 但 summaryData.summary 假值 → 跳过 if(summaryData.summary) → 不 update；响应 200", async () => {
    // ok:true 但 summary 为空字符串（假值）→ 不进入 if(summaryData.summary) 分支
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ summary: "", keyPoints: ["x"] }),
    });

    const res = (await POST(makePostRequest({ file: DOC_FILE }))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // summary 假值 → tenantDb.file.update 不触达
    await settleIife();
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("⑥ skipAi=true → IIFE 不启动 → fetch 不触达、tenantDb.file.update 不触达；响应 200 + aiSkipped=undefined（skipAi 仅 console.log 不设 aiSkipped）", async () => {
    const res = (await POST(
      makePostRequest({ file: DOC_FILE, url: "http://localhost/api/files?skipAi=true" })
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileType: "txt",
      textContent: DOC_CONTENT,
      tags: [],
    });
    // skipAi=true → IIFE 不启动 → fetch 不触达
    expect(mockFetch).not.toHaveBeenCalled();
    // aiSkipped=false → 响应 aiSkipped=undefined（skipAi 只 console.log，不设 aiSkipped；
    // 仅 rate-limit 会设 aiSkipped=true，本轮不触发 rate-limit）
    expect(res.body.aiSkipped).toBeUndefined();
    // tenantDb.file.update 不触达（IIFE 未启动）
    await settleIife();
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });
});
