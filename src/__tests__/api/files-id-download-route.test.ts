/**
 * /api/files/[id]/download 路由 handler 级集成测试（share token 分支）
 *
 * 锁定第一百七十五轮「分享链接刷新免重输密码」修复的下载侧契约：
 *   - 密码保护分享 + 有效 ?session=（绑定到 ?token=）→ 200 文件流（session 令牌免密下载）。
 *   - 密码保护分享 + 无 session 无 password → 403 需要密码。
 *   - 密码保护分享 + 绑定其它 token 的 session → 403（session 校验失败，回退到无 password）。
 *   - 密码保护分享 + ?password= → 403（不再接受 query 密码，统一 ?session= 令牌）。
 *   - 无密码分享 + ?token= → 200。
 *
 * share-session 模块不 mock（使用 setup.ts 的 TOKEN_SECRET 跑真实 HMAC）；
 * fs/promises.readFile mock 为返回固定 Buffer，避免真实磁盘 I/O。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { createHash } from "crypto";
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
    throw new Error("createTenantDb should not be called in share-token download tests");
  },
}));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));

import { GET } from "@/app/api/files/[id]/download/route";

function hashPwd(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

const TOKEN = "share-token-abc12345";
const SHARE_FILE = {
  id: "file-1",
  fileName: "doc.pdf",
  fileType: "pdf",
  fileSize: 1024,
  filePath: "upload/doc.pdf",
  textContent: null,
  thumbnailUrl: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function makeShare(overrides: Partial<{ password: string | null; expiresAt: Date | null }> = {}) {
  return {
    id: "share-1",
    fileId: "file-1",
    token: TOKEN,
    password: overrides.password ?? null,
    expiresAt: overrides.expiresAt ?? null,
    file: SHARE_FILE,
  };
}

function makeDownloadRequest(fileId: string, query: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const url = `http://localhost/api/files/${fileId}/download${query}`;
  return {
    req: new Request(url) as unknown as NextRequest,
    ctx: { params: Promise.resolve({ id: fileId }) },
  };
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/files/[id]/download share-token 分支（?session= 免密下载）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(Buffer.from("fake-pdf-content"));
    // share-token 分支不应触达 authenticateRequest
    mockAuthenticate.mockRejectedValue(new Error("authenticateRequest should not be called for share-token download"));
  });

  it("密码保护分享 + 有效 ?session=（绑定 ?token=）→ 200 文件流", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));
    const session = issueShareSessionToken(TOKEN, null);

    const { req, ctx } = makeDownloadRequest("file-1", `?token=${TOKEN}&session=${encodeURIComponent(session)}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(mockReadFile).toHaveBeenCalled();
  });

  it("密码保护分享 + 无 session 无 password → 403 需要密码", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makeDownloadRequest("file-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("密码保护分享 + 绑定其它 token 的 session → 403（session 校验失败）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));
    const sessionForOther = issueShareSessionToken("other-token-zzz99999", null);

    const { req, ctx } = makeDownloadRequest("file-1", `?token=${TOKEN}&session=${encodeURIComponent(sessionForOther)}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("密码保护分享 + 篡改的 session + 无 password → 403", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));
    const session = issueShareSessionToken(TOKEN, null);
    // 篡改签名段首字符：base64url 首字符承载 6 个有效位，翻转必破坏签名；
    // （末字符仅 2 有效位 + 4 填充位，翻转可能只改填充位 → no-op，故不篡改末字符）。
    const dotIdx = session.indexOf(".");
    const firstSigChar = session[dotIdx + 1];
    const flippedChar = firstSigChar === "A" ? "B" : "A";
    const tampered = session.slice(0, dotIdx + 1) + flippedChar + session.slice(dotIdx + 2);

    const { req, ctx } = makeDownloadRequest("file-1", `?token=${TOKEN}&session=${encodeURIComponent(tampered)}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("密码保护分享 + ?password= → 403（不再接受 query 密码，统一 ?session= 令牌）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makeDownloadRequest("file-1", `?token=${TOKEN}&password=s3cret`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("无密码分享 + ?token= → 200（不要求 session/password）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: null }));

    const { req, ctx } = makeDownloadRequest("file-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(mockReadFile).toHaveBeenCalled();
  });

  it("不存在 token → 404", async () => {
    mockFileShareFindUnique.mockResolvedValue(null);

    const { req, ctx } = makeDownloadRequest("file-1", `?token=nonexistent`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("已过期分享 → 410", async () => {
    mockFileShareFindUnique.mockResolvedValue(
      makeShare({ password: null, expiresAt: new Date("2020-01-01T00:00:00.000Z") })
    );

    const { req, ctx } = makeDownloadRequest("file-1", `?token=${TOKEN}`);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(410);
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
