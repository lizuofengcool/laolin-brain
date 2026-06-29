/**
 * files/route.ts 主路由 handler 级集成测试 —— POST 文件类型判定矩阵专轮（子轮③）
 *
 * 锁定 /api/files 主路由 POST 的"文件类型判定 + parser 派发 + magic bytes 校验"矩阵。
 * 覆盖 ②a（txt 前置门）/ ②b（image/jpeg dedup）/ ②c-image（image AI fetch）/ ②c-doc
 * （txt doc AI summarize IIFE）之外的文档类型：.pdf / .docx / .pptx / .md。本轮聚焦
 * **fileType 判定（file.type + file.name 双路径）+ parser 派发（parseWord/parsePdf/parsePptx
 * 调用契约）+ magic bytes 门（PDF [25 50 44 46] / ZIP [50 4B 03 04]）+ parser 异常容错**。
 *
 * 范围界定：本轮一律传 `skipAi=true` 隔离 doc AI summarize fire-and-forget IIFE（IIFE 触达
 * 条件 + db.file.update 契约已由 ②c-doc 6 例锁定），使本轮专注 fileType/parser/magic 矩阵。
 * skipAi=true 下 IIFE 不启动（`!skipAiParam` 短路），db.file.update 恒不触达（负向）。
 *
 * 核心契约（文件类型判定矩阵锁定）：
 *   1. **fileType 判定优先级**：file.type 先于 file.name。image/* → image；
 *      application/vnd.openxmlformats...wordprocessingml.document 或 .docx → word；
 *      application/pdf 或 .pdf → pdf；application/vnd...presentationml.presentation 或
 *      .pptx → pptx；.md/.markdown/text/markdown → markdown；.txt/text/plain → txt；
 *      其余 → other。
 *   2. **parser 派发契约**：word→parseWord(buffer)、pdf→parsePdf(buffer)、pptx→parsePptx(buffer)；
 *      markdown/txt→buffer.toString("utf-8")（无 parser）；other/image→无 textContent 提取。
 *      三 parser 均收 Buffer 入参，返 Promise<string>，textContent=返回值。
 *   3. **magic bytes 门**：pdf 期望 [0x25,0x50,0x44,0x46]；docx/pptx 共用 ZIP [0x50,0x4B,
 *      0x03,0x04]；markdown/txt 无 magic（跳过校验）。magic 门在 mkdir 之后、writeFile/parser
 *      之前——不匹配返 400，不触达 writeFile/parser/createTenantDb/$transaction。
 *   4. **parser 异常容错**：parser reject/throw → try/catch（line 218）吞错 → textContent
 *      保持 undefined → 仍 200 创建文件（不阻断主流程）。
 *   5. **file.name 兜底派发**：file.type 为 application/octet-stream 等通用类型时，靠
 *      file.name.endsWith(".pdf"/".docx"/".pptx") 兜底判定 fileType（防 content-type 丢失）。
 *
 * 负向契约：
 *   - magic 门不触达 parser（gate order：parsePdf/parseWord/parsePptx 在 try 块 line 208，
 *      magic 门 line 184 在其之前）→ 用例⑦显式断言 parsePdf 未被调用。
 *   - magic 门不触达 writeFile / createTenantDb / $transaction（三者均在 magic 之后）。
 *   - 非 word/pdf/pptx 类型不触达对应 parser（用例①-④ 互斥断言：当前类型 parser 被调，
 *      其余两 parser 未被调）。
 *   - skipAi=true → doc AI summarize IIFE 不启动 → db.file.update 恒不触达（全轮负向）。
 *
 * Mock 策略（沿用 ②a/②b/②c-image/②c-doc 范式）：
 *   - next/server / @/lib/api-auth / fs/promises 隔离同前。
 *   - @/lib/parser/{word,pdf,ppt}：mock parseWord/parsePdf/parsePptx（隔离 mammoth/pdf-parse/
 *     纯 JS ZIP 解析）。@/lib/parser/image：mock generateThumbnail（隔离 sharp，本轮非 image
 *     类型不触达，负向）。
 *   - @/lib/db：raw db $queryRaw（早检，正向）+ $transaction（executor，新建分支 tx=$queryRaw+
 *     file.create echo）+ file.update（doc AI summarize；skipAi=true → 不触达，负向）；
 *     createTenantDb wrapper（dedup findFirst 返 null → 新建分支）。
 *
 * 复用 ②c-image 的 mockImplementation echo data 范式（tx.file.create echo args.data 使响应
 * 反映路由实际传入值）；复用 ②a 的 makePostRequest（headers.get spy）+ $queryRaw tagged
 * template 契约 + $transaction executor 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db
  mockQueryRaw,       // 早检 $queryRaw（配额预检，正向）
  mockTransaction,    // 新建分支 $transaction（executor，记录 + 回调）
  mockRawFileUpdate,  // db.file.update（doc AI summarize；skipAi=true → 不触达，负向）
  // tx（$transaction 回调注入的事务客户端）
  mockTxQueryRaw,     // TOCTOU 配额再检
  mockTxFileCreate,   // 新建 file.create（echo data）
  // tenantDb（dedup file.findFirst —— 新建分支下 findFirst 返回 null）
  mockTenantFileFindFirst,
  // parsers
  mockParseWord,
  mockParsePdf,
  mockParsePptx,
  mockGenerateThumbnail,
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
    mockParseWord: vi.fn(),
    mockParsePdf: vi.fn(),
    mockParsePptx: vi.fn(),
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
vi.mock("@/lib/parser/word", () => ({
  parseWord: (...args: unknown[]) => mockParseWord(...args),
}));
vi.mock("@/lib/parser/pdf", () => ({
  parsePdf: (...args: unknown[]) => mockParsePdf(...args),
}));
vi.mock("@/lib/parser/ppt", () => ({
  parsePptx: (...args: unknown[]) => mockParsePptx(...args),
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
  // + file.update（doc AI summarize；skipAi=true → 不触达，负向）
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

// PDF magic bytes [25 50 44 46]（"%PDF"）
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
// ZIP magic bytes [50 4B 03 04]（docx/pptx 共用 OOXML 容器）
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
// PNG magic bytes [89 50 4E 47]（用于 magic 门负向：声明 pdf 但内容是 png）
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 全轮传 skipAi=true 隔离 doc AI summarize IIFE（IIFE 契约已由 ②c-doc 锁定）
const SKIP_AI_URL = "http://localhost/api/files?skipAi=true";

/**
 * 构造 hand-crafted POST 请求。沿用 ②a 范式：headers.get spy 覆盖 content-length。
 * url 默认带 skipAi=true（隔离 IIFE）；content-type 默认 multipart/form-data。
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
    url: opts.url ?? SKIP_AI_URL,
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

describe("/api/files 主路由 POST — 文件类型判定矩阵 + parser 派发（子轮③）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 早检 $queryRaw：默认 0 字节已用
    mockQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.$queryRaw（TOCTOU 再检）：默认 0 字节已用
    mockTxQueryRaw.mockResolvedValue([{ totalSize: BigInt(0) }]);
    // tx.file.create：echo back args.data 字段，使响应反映路由实际传入 file.create 的值。
    // 沿用 ②c-image echo 范式：textContent 来自路由（parser 返回值 / buffer.toString），
    // echo 使响应 textContent 反映路由实际赋值（用例⑥ parser 抛错 → textContent=undefined →
    // 响应 undefined）。
    mockTxFileCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "file-new-1",
      fileName: args.data.fileName,
      fileType: args.data.fileType,
      fileSize: args.data.fileSize,
      filePath: args.data.filePath,
      textContent: args.data.textContent,
      thumbnailUrl: args.data.thumbnailUrl,
    }));
    // dedup findFirst：默认 null（新建分支）
    mockTenantFileFindFirst.mockResolvedValue(null);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("① .pdf via file.type（application/pdf）+ PDF magic bytes [25 50 44 46] → fileType=pdf → parsePdf(buffer) → textContent=返回值 → 新建 $transaction(file.create fileType=pdf textContent=解析文本) → 200；parseWord/parsePptx 不触达；db.file.update 不触达（skipAi=true）", async () => {
    mockParsePdf.mockResolvedValue("PDF extracted text");
    const file = new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "file-new-1",
      fileName: "doc.pdf",
      fileType: "pdf",
      textContent: "PDF extracted text",
      previewUrl: undefined, // 非 image
      aiSkipped: undefined,   // skipAi=true → aiSkipped=false → undefined
    });

    // parsePdf 被调用一次，入参为 Buffer，内容等于 PDF_BYTES
    expect(mockParsePdf).toHaveBeenCalledTimes(1);
    const parseArg = mockParsePdf.mock.calls[0][0];
    expect(Buffer.isBuffer(parseArg)).toBe(true);
    expect((parseArg as Buffer).equals(Buffer.from(PDF_BYTES))).toBe(true);
    // 其余 parser 不触达（互斥）
    expect(mockParseWord).not.toHaveBeenCalled();
    expect(mockParsePptx).not.toHaveBeenCalled();
    // 非 image → generateThumbnail 不触达
    expect(mockGenerateThumbnail).not.toHaveBeenCalled();

    // 新建分支 $transaction + tx.file.create data 契约
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: {
        tenantId: "tenant-1",
        userId: "user-1",
        fileName: "doc.pdf",
        fileType: "pdf",
        fileSize: PDF_BYTES.length,
        textContent: "PDF extracted text",
        storageMode: "cloud",
        tags: JSON.stringify([]), // skipAi=true → tags 初始 []
      },
    });

    // 负向：skipAi=true → doc AI summarize IIFE 不启动 → db.file.update 不触达
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("② .docx via file.type（wordprocessingml）+ ZIP magic bytes [50 4B 03 04] → fileType=word → parseWord(buffer) → textContent=返回值 → 200；parsePdf/parsePptx 不触达", async () => {
    mockParseWord.mockResolvedValue("Word extracted text");
    const file = new File(
      [ZIP_BYTES],
      "doc.docx",
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
    );

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileName: "doc.docx",
      fileType: "word",
      textContent: "Word extracted text",
    });

    expect(mockParseWord).toHaveBeenCalledTimes(1);
    const parseArg = mockParseWord.mock.calls[0][0];
    expect(Buffer.isBuffer(parseArg)).toBe(true);
    expect((parseArg as Buffer).equals(Buffer.from(ZIP_BYTES))).toBe(true);
    expect(mockParsePdf).not.toHaveBeenCalled();
    expect(mockParsePptx).not.toHaveBeenCalled();
    expect(mockGenerateThumbnail).not.toHaveBeenCalled();

    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: { fileType: "word", textContent: "Word extracted text" },
    });
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("③ .pptx via file.type（presentationml）+ ZIP magic bytes [50 4B 03 04] → fileType=pptx → parsePptx(buffer) → textContent=返回值 → 200；parseWord/parsePdf 不触达", async () => {
    mockParsePptx.mockResolvedValue("PPT extracted text");
    const file = new File(
      [ZIP_BYTES],
      "pres.pptx",
      { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
    );

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileName: "pres.pptx",
      fileType: "pptx",
      textContent: "PPT extracted text",
    });

    expect(mockParsePptx).toHaveBeenCalledTimes(1);
    const parseArg = mockParsePptx.mock.calls[0][0];
    expect(Buffer.isBuffer(parseArg)).toBe(true);
    expect((parseArg as Buffer).equals(Buffer.from(ZIP_BYTES))).toBe(true);
    expect(mockParseWord).not.toHaveBeenCalled();
    expect(mockParsePdf).not.toHaveBeenCalled();
    expect(mockGenerateThumbnail).not.toHaveBeenCalled();

    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: { fileType: "pptx", textContent: "PPT extracted text" },
    });
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("④ .md via file.type（text/markdown）→ fileType=markdown → 无 parser 派发 → textContent=buffer.toString('utf-8') → 200；三 parser 均不触达；无 magic 校验（text/markdown magic=[]）", async () => {
    const mdContent = "# Title\n\n正文内容 markdown";
    const mdBytes = new TextEncoder().encode(mdContent);
    const file = new File([mdBytes], "readme.md", { type: "text/markdown" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileName: "readme.md",
      fileType: "markdown",
      // textContent = buffer.toString("utf-8")，反映原始 markdown 文本
      textContent: mdContent,
    });

    // markdown 走 buffer.toString，不触达任何 parser
    expect(mockParseWord).not.toHaveBeenCalled();
    expect(mockParsePdf).not.toHaveBeenCalled();
    expect(mockParsePptx).not.toHaveBeenCalled();
    expect(mockGenerateThumbnail).not.toHaveBeenCalled();

    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: { fileType: "markdown", textContent: mdContent },
    });
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("⑤ file.name 兜底派发：file.type=application/octet-stream（通用类型）+ file.name=report.pdf + PDF magic bytes → fileType=pdf（via name.endsWith('.pdf')）→ parsePdf 触达 → 200", async () => {
    mockParsePdf.mockResolvedValue("PDF text via name fallback");
    const file = new File([PDF_BYTES], "report.pdf", { type: "application/octet-stream" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileName: "report.pdf",
      fileType: "pdf", // name 兜底判定为 pdf
      textContent: "PDF text via name fallback",
    });

    // file.type 通用 → 靠 name.endsWith(".pdf") 兜底判定 fileType=pdf → parsePdf 触达
    expect(mockParsePdf).toHaveBeenCalledTimes(1);
    expect(mockParseWord).not.toHaveBeenCalled();
    expect(mockParsePptx).not.toHaveBeenCalled();

    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: { fileType: "pdf", textContent: "PDF text via name fallback" },
    });
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("⑥ parser 抛错容错：.pdf + parsePdf rejects → try/catch（line 218）吞错 → textContent=undefined → 仍 200 创建文件（不阻断主流程）", async () => {
    mockParsePdf.mockRejectedValue(new Error("pdf-parse boom"));
    const file = new File([PDF_BYTES], "broken.pdf", { type: "application/pdf" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    // parser 抛错被吞，主流程继续，仍 200
    expect(res.status).toBe(200);
    expect(mockParsePdf).toHaveBeenCalledTimes(1);
    // textContent 保持 undefined（parser 抛错未赋值）
    expect(res.body).toMatchObject({
      fileName: "broken.pdf",
      fileType: "pdf",
      textContent: undefined,
    });
    // file.create data.textContent=undefined（echo 反映路由实际赋值）
    expect(mockTxFileCreate.mock.calls[0][0]).toMatchObject({
      data: { fileType: "pdf", textContent: undefined },
    });
    // 主流程未阻断：$transaction / file.create 仍触达
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxFileCreate).toHaveBeenCalledTimes(1);
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });

  it("⑦ magic bytes 门：声明 application/pdf 但内容是 PNG [89 50 4E 47] → validateMagicBytes 期望 [25 50 44 46] 不匹配 → 400 { error: '文件内容与声明的类型不匹配' }；parsePdf/writeFile/createTenantDb/$transaction 均不触达（gate order：magic 在 parser/writeFile 之前）；mkdir 已触达（magic 在 mkdir 之后）", async () => {
    mockParsePdf.mockResolvedValue("should not be called");
    // PNG 内容声明为 application/pdf
    const file = new File([PNG_BYTES], "fake.pdf", { type: "application/pdf" });

    const res = (await POST(makePostRequest({ file }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "文件内容与声明的类型不匹配" });

    // magic 门在 mkdir 之后（mkdir line 158，magic line 184）→ mkdir 已触达
    expect(mockMkdir).toHaveBeenCalledTimes(1);
    // magic 门在 parser 之前（parser line 208）→ parsePdf 不触达
    expect(mockParsePdf).not.toHaveBeenCalled();
    expect(mockParseWord).not.toHaveBeenCalled();
    expect(mockParsePptx).not.toHaveBeenCalled();
    // magic 门在 writeFile 之后？否——writeFile line 202 在 magic line 184 之后 → 不触达
    expect(mockWriteFile).not.toHaveBeenCalled();
    // magic 门在 createTenantDb（line 271）/ $transaction（line 340）之前 → 不触达
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockTxFileCreate).not.toHaveBeenCalled();
    expect(mockRawFileUpdate).not.toHaveBeenCalled();
  });
});
