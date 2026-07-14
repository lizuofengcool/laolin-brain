/**
 * /api/files/[id]/preview 路由 handler 级集成测试（share token 分支）
 *
 * 锁定第一百八十二轮「preview 路由移除 ?password= 查询泄漏、统一 ?session= 令牌」修复的契约：
 *   - 密码保护分享 + 有效 ?session=（绑定到 ?token=）→ 200 图片流 + Content-Type。
 *   - 密码保护分享 + 无 session → 403 需要密码。
 *   - 密码保护分享 + ?password= → 403（不再接受 query 密码，统一 ?session= 令牌）。
 *   - 密码保护分享 + 绑定其它 token 的 session → 403（session 校验失败）。
 *   - 无密码分享 + ?token= → 200。
 *   - 非图片文件 + ?token= → 400。
 *   - SVG + ?token= → 200 且携带 CSP 头（防 <img> 内 XSS）。
 *   - 不存在 token → 404；已过期分享 → 410。
 *
 * share-session 模块不 mock（使用 setup.ts 的 TOKEN_SECRET 跑真实 HMAC）；
 * fs/promises.readFile mock 为返回固定 Buffer，避免真实磁盘 I/O。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { issueShareSessionToken } from "@/lib/share-session";

const {
  MockNextResponse,
  mockFileShareFindUnique,
  mockReadFile,
  mockAuthenticate,
} = vi.hoisted(() => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> } | undefined) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> } | undefined) {
      return new MockNextResponse(body, init);
    }
  }
  return {
    MockNextResponse,
    mockFileShareFindUnique: vi.fn(),
    mockReadFile: vi.fn(),
    mockAuthenticate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
// fs/promises：路由顶部 named import（readFile）。提供 default 兜底对齐仓库 ESM 互操作范式。
vi.mock("fs/promises", () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    fileShare: {
      findUnique: (...args: unknown[]) => mockFileShareFindUnique(...args),
    },
  },
  createTenantDb: () => {
    throw new Error("createTenantDb should not be called in share-token preview tests");
  },
}));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));

import { GET } from "@/app/api/files/[id]/preview/route";

const TOKEN = "share-token-preview-xyz";

function makeShareFile(overrides: Partial<{ fileName: string; fileType: string; filePath: string }> = {}) {
  return {
    id: "file-img-1",
    fileName: overrides.fileName ?? "photo.png",
    fileType: overrides.fileType ?? "image",
    fileSize: 2048,
    filePath: overrides.filePath ?? "upload/photo.png",
    textContent: null,
    thumbnailUrl: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function makeShare(overrides: Partial<{ password: string | null; expiresAt: Date | null; file: ReturnType<typeof makeShareFile> }> = {}) {
  return {
    id: "share-1",
    fileId: "file-img-1",
    token: TOKEN,
    password: overrides.password ?? null,
    expiresAt: overrides.expiresAt ?? null,
    file: overrides.file ?? makeShareFile(),
  };
}

function makePreviewRequest(fileId: string, query: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const url = `http://localhost/api/files/${fileId}/preview${query}`;
  return {
    req: new Request(url) as unknown as NextRequest,
    ctx: { params: Promise.resolve({ id: fileId }) },
  };
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/files/[id]/preview share-token 分支（?session= 免密预览）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(Buffer.from("fake-png-bytes"));
    // share-token 分支不应触达 authenticateRequest
    mockAuthenticate.mockRejectedValue(new Error("authenticateRequest should not be called for share-token preview"));
  });

  it("密码保护分享 + 有效 ?session=（绑定 ?token=）→ 200 图片流 + image/png Content-Type", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: "hashed-pwd" }));
    const session = issueShareSessionToken(TOKEN, null);

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}&session=${encodeURIComponent(session)}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(mockReadFile).toHaveBeenCalled();
  });

  it("密码保护分享 + 无 session → 403 需要密码", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: "hashed-pwd" }));

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("密码保护分享 + ?password= → 403（不再接受 query 密码，统一 ?session= 令牌）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: "hashed-pwd" }));

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}&password=s3cret`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("密码保护分享 + 绑定其它 token 的 session → 403（session 校验失败）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: "hashed-pwd" }));
    const sessionForOther = issueShareSessionToken("other-token-zzz99999", null);

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}&session=${encodeURIComponent(sessionForOther)}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("密码保护分享 + 篡改签名的 session → 403", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: "hashed-pwd" }));
    const session = issueShareSessionToken(TOKEN, null);
    // 篡改签名段首字符（base64url 首字符承载 6 个有效位，翻转必破坏签名）。
    const dotIdx = session.indexOf(".");
    const firstSigChar = session[dotIdx + 1];
    const flippedChar = firstSigChar === "A" ? "B" : "A";
    const tampered = session.slice(0, dotIdx + 1) + flippedChar + session.slice(dotIdx + 2);

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}&session=${encodeURIComponent(tampered)}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("无密码分享 + ?token= → 200（不要求 session/password）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: null }));

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(mockReadFile).toHaveBeenCalled();
  });

  it("非图片文件 + ?token= → 400 Not an image file", async () => {
    mockFileShareFindUnique.mockResolvedValue(
      makeShare({ file: makeShareFile({ fileType: "pdf", fileName: "doc.pdf" }) })
    );

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Not an image file" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("SVG + ?token= → 200 + Content-Security-Policy 头（防 <img> 内 XSS）", async () => {
    mockFileShareFindUnique.mockResolvedValue(
      makeShare({ file: makeShareFile({ fileName: "logo.svg" }) })
    );

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toBe("script-src 'none'; style-src 'none'");
  });

  it("不存在 token → 404", async () => {
    mockFileShareFindUnique.mockResolvedValue(null);

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=nonexistent`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("已过期分享 → 410", async () => {
    mockFileShareFindUnique.mockResolvedValue(
      makeShare({ expiresAt: new Date("2020-01-01T00:00:00.000Z") })
    );

    const { req, ctx } = makePreviewRequest("file-img-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(410);
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
