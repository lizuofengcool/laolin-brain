/**
 * /api/files/[id]/share 路由 handler 级集成测试（GET + POST 密码验证）
 *
 * 锁定第一百七十四轮安全修复契约 + 第一百七十五轮刷新免重输密码契约：
 *
 * GET（密码验证已移除）：
 *   - 无密码分享 → 200 回包文件信息。
 *   - 密码保护分享 → 403 passwordRequired，**即使带 ?password= query param 也忽略**
 *     （修复前 GET 接受 ?password=，密码会泄漏到 URL/访问日志/Referer/浏览器历史）。
 *   - 密码保护分享 + 有效 X-Share-Session 令牌 → 200 + downloadUrl 含 &session=（刷新免重输密码）。
 *   - 密码保护分享 + 无效/篡改/绑定其它 token 的 X-Share-Session → 403 passwordRequired。
 *   - 不存在 token → 404；已过期 → 410。
 *
 * POST 密码验证（未认证分支）+ 按 token 暴破防护：
 *   - 正确密码 → 200 回包文件信息 + sessionToken（HMAC 令牌）+ clearSharePasswordLimit 被调用。
 *   - 错误密码 → 403 + recordSharePasswordFailure 被调用。
 *   - 空/非字符串密码 → 400，不触达限流/密码比对。
 *   - 不存在 token → 404；已过期 → 410；无密码分享 → 400。
 *   - checkSharePasswordLimit 返回 success=false → 429 + Retry-After，不触达密码比对。
 *
 * 复用 vi.hoisted + MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 * share-session 模块不 mock（使用 setup.ts 的 TOKEN_SECRET 跑真实 HMAC）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { issueShareSessionToken } from "@/lib/share-session";

const {
  MockNextResponse,
  mockAuthenticate,
  mockFileShareFindUnique,
  mockCheckSharePasswordLimit,
  mockRecordSharePasswordFailure,
  mockClearSharePasswordLimit,
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
    mockAuthenticate: vi.fn(),
    mockFileShareFindUnique: vi.fn(),
    mockCheckSharePasswordLimit: vi.fn(),
    mockRecordSharePasswordFailure: vi.fn(),
    mockClearSharePasswordLimit: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    fileShare: {
      findUnique: (...args: unknown[]) => mockFileShareFindUnique(...args),
    },
  },
  createTenantDb: () => {
    throw new Error("createTenantDb should not be called in these tests");
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkSharePasswordLimit: (...args: unknown[]) => mockCheckSharePasswordLimit(...args),
  recordSharePasswordFailure: (...args: unknown[]) => mockRecordSharePasswordFailure(...args),
  clearSharePasswordLimit: (...args: unknown[]) => mockClearSharePasswordLimit(...args),
}));

import { GET, POST } from "@/app/api/files/[id]/share/route";

// 复用路由内的 SHA-256 哈希，使 mock 的 share.password 与输入密码哈希一致
function hashPwd(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

const TOKEN = "share-token-abc12345";
const SHARE_FILE = {
  id: "file-1",
  fileName: "doc.pdf",
  fileType: "pdf",
  fileSize: 1024,
  textContent: "hello",
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

function makeGetRequest(
  token: string,
  query = "",
  headers: Record<string, string> = {}
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const url = `http://localhost/api/files/${token}/share${query}`;
  return {
    req: new Request(url, { headers }) as unknown as NextRequest,
    ctx: { params: Promise.resolve({ id: token }) },
  };
}

function makePostRequest(token: string, body: unknown): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new Request(`http://localhost/api/files/${token}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return { req, ctx: { params: Promise.resolve({ id: token }) } };
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 默认：限流放行（success=true，剩余 10 次）
const LIMIT_OK = { success: true, remaining: 10, resetTime: Date.now() + 15 * 60 * 1000 };
const LIMIT_BLOCKED = { success: false, remaining: 0, resetTime: Date.now() + 15 * 60 * 1000 };

describe("/api/files/[id]/share GET（密码验证已移除，仅无密码分享可访问）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );
    mockCheckSharePasswordLimit.mockReturnValue(LIMIT_OK);
  });

  it("无密码分享 → 200 回包文件信息", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: null }));

    const { req, ctx } = makeGetRequest(TOKEN);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { id: string; fileName: string; downloadUrl: string };
    expect(body.id).toBe("file-1");
    expect(body.fileName).toBe("doc.pdf");
    expect(body.downloadUrl).toContain("/api/files/file-1/download?token=");
  });

  it("密码保护分享 → 403 passwordRequired（不带密码）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makeGetRequest(TOKEN);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码", passwordRequired: true });
  });

  it("密码保护分享 + ?password= 正确密码 → 仍 403 passwordRequired（GET 不再接受 query 密码）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makeGetRequest(TOKEN, "?password=s3cret");
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码", passwordRequired: true });
  });

  it("不存在 token → 404", async () => {
    mockFileShareFindUnique.mockResolvedValue(null);

    const { req, ctx } = makeGetRequest("nonexistent-token");
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "分享链接不存在" });
  });

  it("已过期分享 → 410 expired", async () => {
    mockFileShareFindUnique.mockResolvedValue(
      makeShare({ password: null, expiresAt: new Date("2020-01-01T00:00:00.000Z") })
    );

    const { req, ctx } = makeGetRequest(TOKEN);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: "链接已过期", expired: true });
  });
});

describe("/api/files/[id]/share GET + X-Share-Session（第一百七十五轮：刷新免重输密码）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );
    mockCheckSharePasswordLimit.mockReturnValue(LIMIT_OK);
  });

  it("密码保护分享 + 有效 X-Share-Session（同 token）→ 200 + downloadUrl 含 &session=", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));
    const session = issueShareSessionToken(TOKEN, null);

    const { req, ctx } = makeGetRequest(TOKEN, "", { "X-Share-Session": session });
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { id: string; downloadUrl: string };
    expect(body.id).toBe("file-1");
    expect(body.downloadUrl).toContain("&session=");
  });

  it("密码保护分享 + 无 X-Share-Session → 403 passwordRequired", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makeGetRequest(TOKEN);
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码", passwordRequired: true });
  });

  it("密码保护分享 + 篡改的 X-Share-Session → 403 passwordRequired", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));
    const session = issueShareSessionToken(TOKEN, null);
    const tampered = session.slice(0, -1) + (session.endsWith("A") ? "B" : "A");

    const { req, ctx } = makeGetRequest(TOKEN, "", { "X-Share-Session": tampered });
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码", passwordRequired: true });
  });

  it("密码保护分享 + 绑定其它 token 的 X-Share-Session → 403 passwordRequired", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));
    // 为另一个 token 签发的令牌，不能用于本 token
    const session = issueShareSessionToken("other-token-zzz99999", null);

    const { req, ctx } = makeGetRequest(TOKEN, "", { "X-Share-Session": session });
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "需要密码", passwordRequired: true });
  });

  it("无密码分享 + 携带 X-Share-Session → 200（session 被忽略，不影响无密码分支）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: null }));
    const session = issueShareSessionToken(TOKEN, null);

    const { req, ctx } = makeGetRequest(TOKEN, "", { "X-Share-Session": session });
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    // 无密码分享的 downloadUrl 不带 session
    const body = res.body as { downloadUrl: string };
    expect(body.downloadUrl).not.toContain("&session=");
  });
});

describe("/api/files/[id]/share POST 密码验证（未认证）+ 按 token 暴破防护", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 未认证 → authenticateRequest 返回 NextResponse（触发密码验证分支）
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );
    mockCheckSharePasswordLimit.mockReturnValue(LIMIT_OK);
  });

  it("正确密码 → 200 回包文件信息 + sessionToken + clearSharePasswordLimit 被调用", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makePostRequest(TOKEN, { password: "s3cret" });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { fileName: string; sessionToken: string; downloadUrl: string };
    expect(body.fileName).toBe("doc.pdf");
    // 第一百七十五轮契约：POST 验证成功签发 session 令牌 + downloadUrl 带 session
    expect(typeof body.sessionToken).toBe("string");
    expect(body.sessionToken.length).toBeGreaterThan(0);
    expect(body.downloadUrl).toContain("&session=");
    expect(mockClearSharePasswordLimit).toHaveBeenCalledWith(TOKEN);
    expect(mockRecordSharePasswordFailure).not.toHaveBeenCalled();
  });

  it("POST 签发的 sessionToken 可被 GET X-Share-Session 验证通过（端到端契约）", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req: postReq, ctx: postCtx } = makePostRequest(TOKEN, { password: "s3cret" });
    const postRes = (await POST(postReq, postCtx)) as MockRes;
    const issued = (postRes.body as { sessionToken: string }).sessionToken;

    // 用签发的令牌作为 GET 的 X-Share-Session header
    const { req, ctx } = makeGetRequest(TOKEN, "", { "X-Share-Session": issued });
    const res = (await GET(req, ctx)) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { id: string; downloadUrl: string };
    expect(body.id).toBe("file-1");
    expect(body.downloadUrl).toContain("&session=");
  });

  it("错误密码 → 403 + recordSharePasswordFailure 被调用", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makePostRequest(TOKEN, { password: "wrong" });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "密码错误", passwordRequired: true });
    expect(mockRecordSharePasswordFailure).toHaveBeenCalledWith(TOKEN);
    expect(mockClearSharePasswordLimit).not.toHaveBeenCalled();
  });

  it("空字符串密码 → 400，不触达限流/密码比对", async () => {
    const { req, ctx } = makePostRequest(TOKEN, { password: "" });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "密码不能为空", passwordRequired: true });
    expect(mockFileShareFindUnique).not.toHaveBeenCalled();
    expect(mockCheckSharePasswordLimit).not.toHaveBeenCalled();
  });

  it("非字符串密码 → 400，不触达限流/密码比对", async () => {
    const { req, ctx } = makePostRequest(TOKEN, { password: 12345 });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(400);
    expect(mockFileShareFindUnique).not.toHaveBeenCalled();
    expect(mockCheckSharePasswordLimit).not.toHaveBeenCalled();
  });

  it("不存在 token → 404，不触达限流", async () => {
    mockFileShareFindUnique.mockResolvedValue(null);

    const { req, ctx } = makePostRequest("nonexistent", { password: "s3cret" });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(404);
    expect(mockCheckSharePasswordLimit).not.toHaveBeenCalled();
  });

  it("已过期分享 → 410，不触达限流", async () => {
    mockFileShareFindUnique.mockResolvedValue(
      makeShare({ password: hashPwd("s3cret"), expiresAt: new Date("2020-01-01T00:00:00.000Z") })
    );

    const { req, ctx } = makePostRequest(TOKEN, { password: "s3cret" });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(410);
    expect(mockCheckSharePasswordLimit).not.toHaveBeenCalled();
  });

  it("无密码分享 → 400（该链接不需要密码），不触达限流", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: null }));

    const { req, ctx } = makePostRequest(TOKEN, { password: "s3cret" });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "该链接不需要密码" });
    expect(mockCheckSharePasswordLimit).not.toHaveBeenCalled();
  });

  it("checkSharePasswordLimit 返回 success=false → 429 + Retry-After，不触达密码比对", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));
    mockCheckSharePasswordLimit.mockReturnValue(LIMIT_BLOCKED);

    const { req, ctx } = makePostRequest(TOKEN, { password: "s3cret" });
    const res = (await POST(req, ctx)) as MockRes;

    expect(res.status).toBe(429);
    expect((res.body as { passwordRequired: boolean }).passwordRequired).toBe(true);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    // 不触达密码比对（不记录失败、不清除）
    expect(mockRecordSharePasswordFailure).not.toHaveBeenCalled();
    expect(mockClearSharePasswordLimit).not.toHaveBeenCalled();
  });

  it("checkSharePasswordLimit 以 token 为 key 调用", async () => {
    mockFileShareFindUnique.mockResolvedValue(makeShare({ password: hashPwd("s3cret") }));

    const { req, ctx } = makePostRequest(TOKEN, { password: "s3cret" });
    await POST(req, ctx);

    expect(mockCheckSharePasswordLimit).toHaveBeenCalledWith(TOKEN);
  });
});
