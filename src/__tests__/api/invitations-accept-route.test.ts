/**
 * invitations/accept 路由 handler 级集成测试
 *
 * 锁定 /api/invitations/accept 路由层（GET 预览 / POST 接受）的安全与控制流契约。
 *
 * 核心契约：
 *   - GET（预览，只读）：按 token 反查 invitation，DB 中 pending 但已过期的统一
 *     对外返回 status='expired'。返回 emailMatches 标志当前账号是否与被邀请邮箱
 *     匹配（前端据此决定能否点"接受"）。GET 不做邮箱门控（仅预览），任何已登录
 *     用户持有效 token 均可查看——token 为 randomUUID 不可枚举。
 *   - POST（接受，写入）：须 status='pending' 且 expiresAt > now；accepted/revoked
 *     → 410；过期 → 410；邮箱不匹配 → 403（防冒领）；走 $transaction 原子化
 *     TenantUser.create + Invitation.update；P2002（已是成员）→ 409。
 *   - 跨租户：POST 以 invitation.tenantId 落库成员关系，不使用 auth.tenantId
 *     （邀请可指向用户当前租户之外的租户）。
 *
 * 复用 invitations-route.test.ts 的 vi.hoisted + MockNextResponse 范式。$transaction
 * 回调形式用 mockImplementation 注入 tx 客户端（tenantUser.create + invitation.update）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockInvitationFindUnique,
  mockTenantFindUnique,
  mockTransaction,
  mockTxTenantUserCreate,
  mockTxInvitationUpdate,
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
    mockInvitationFindUnique: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockTransaction: vi.fn(),
    mockTxTenantUserCreate: vi.fn(),
    mockTxInvitationUpdate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    invitation: {
      findUnique: (...args: unknown[]) => mockInvitationFindUnique(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { GET, POST } from "@/app/api/invitations/accept/route";

// 身份 fixture
const matchedAuth = {
  userId: "user-1",
  email: "invitee@example.com",
  tenantId: "tenant-current",
  role: "owner",
};
const mismatchedAuth = {
  userId: "user-2",
  email: "other@example.com",
  tenantId: "tenant-current",
  role: "owner",
};

// 固定系统时间，使 new Date() 可全等断言（GET/POST 内均用 new Date() 判过期）
const NOW = new Date("2026-07-13T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

/** 构造一个 pending 邀请 fixture（未过期，邮箱与 matchedAuth 匹配） */
function pendingInvitation(overrides: Partial<{
  email: string;
  role: string;
  tenantId: string;
  status: string;
  expiresAt: Date;
  id: string;
  token: string;
}> = {}) {
  return {
    id: "inv-1",
    tenantId: "tenant-invited",
    email: "invitee@example.com",
    role: "member",
    status: "pending",
    token: "token-abc",
    invitedBy: "user-inviter",
    expiresAt: new Date(NOW.getTime() + 24 * HOUR),
    acceptedAt: null,
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  // 默认已认证且邮箱匹配
  mockAuthenticate.mockResolvedValue(matchedAuth);
  // 默认租户名
  mockTenantFindUnique.mockResolvedValue({ name: "受邀团队" });
  // 默认事务回调：注入 tx 客户端，create/update 均成功
  mockTxTenantUserCreate.mockResolvedValue({});
  mockTxInvitationUpdate.mockResolvedValue({});
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        tenantUser: { create: mockTxTenantUserCreate },
        invitation: { update: mockTxInvitationUpdate },
      })
  );
});

afterEach(() => {
  vi.useRealTimers();
});

function makeGetRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/invitations/accept${query}`) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return {
    method: "POST",
    url: "http://localhost/api/invitations/accept",
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

function unauthResponse(): NextResponse {
  return new MockNextResponse({ error: "未提供身份认证令牌" }, { status: 401 }) as unknown as NextResponse;
}

const res = (r: unknown) => r as { status: number; body: Record<string, unknown> };

// ─── GET /api/invitations/accept — 预览 ─────────────
describe("GET /api/invitations/accept", () => {
  it("未认证 → 401 透传，不触达 db.invitation", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const r = res(await GET(makeGetRequest("?token=token-abc")));

    expect(r.status).toBe(401);
    expect(mockInvitationFindUnique).not.toHaveBeenCalled();
  });

  it("缺 token → 400 {error:'缺少邀请令牌'}，不触达 db", async () => {
    const r = res(await GET(makeGetRequest("")));

    expect(r.status).toBe(400);
    expect(r.body.error).toBe("缺少邀请令牌");
    expect(mockInvitationFindUnique).not.toHaveBeenCalled();
  });

  it("token 无效（findUnique 返回 null）→ 404 {error:'邀请不存在或令牌无效'}", async () => {
    mockInvitationFindUnique.mockResolvedValue(null);

    const r = res(await GET(makeGetRequest("?token=nope")));

    expect(r.status).toBe(404);
    expect(r.body.error).toBe("邀请不存在或令牌无效");
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });

  it("pending + 未过期 + 邮箱匹配 → 200，返回预览字段且 emailMatches=true，findUnique by token", async () => {
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation());

    const r = res(await GET(makeGetRequest("?token=token-abc")));

    expect(r.status).toBe(200);
    expect(mockInvitationFindUnique).toHaveBeenCalledWith({ where: { token: "token-abc" } });
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: "tenant-invited" },
      select: { name: true },
    });
    expect(r.body).toEqual({
      tenantName: "受邀团队",
      tenantId: "tenant-invited",
      role: "member",
      invitedEmail: "invitee@example.com",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
      emailMatches: true,
    });
  });

  it("邮箱不匹配 → 仍 200 但 emailMatches=false（GET 只读预览，不做邮箱门控）", async () => {
    mockAuthenticate.mockResolvedValue(mismatchedAuth);
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation());

    const r = res(await GET(makeGetRequest("?token=token-abc")));

    expect(r.status).toBe(200);
    expect(r.body.emailMatches).toBe(false);
  });

  it("DB 中 pending 但 expiresAt 已过 → 对外 status='expired'", async () => {
    mockInvitationFindUnique.mockResolvedValue(
      pendingInvitation({ expiresAt: new Date(NOW.getTime() - HOUR) })
    );

    const r = res(await GET(makeGetRequest("?token=token-abc")));

    expect(r.status).toBe(200);
    expect(r.body.status).toBe("expired");
  });

  it("status='accepted' → 对外 status='accepted'（不再判过期）", async () => {
    mockInvitationFindUnique.mockResolvedValue(
      pendingInvitation({ status: "accepted", acceptedAt: new Date(NOW.getTime() - HOUR) })
    );

    const r = res(await GET(makeGetRequest("?token=token-abc")));

    expect(r.status).toBe(200);
    expect(r.body.status).toBe("accepted");
  });

  it("tenant 缺失 → tenantName 回退 '未知团队'", async () => {
    mockTenantFindUnique.mockResolvedValue(null);
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation());

    const r = res(await GET(makeGetRequest("?token=token-abc")));

    expect(r.body.tenantName).toBe("未知团队");
  });

  it("db.invitation.findUnique 抛错 → 500 {error:'获取邀请信息失败'}", async () => {
    mockInvitationFindUnique.mockRejectedValue(new Error("db down"));

    const r = res(await GET(makeGetRequest("?token=token-abc")));

    expect(r.status).toBe(500);
    expect(r.body.error).toBe("获取邀请信息失败");
  });
});

// ─── POST /api/invitations/accept — 接受 ─────────────
describe("POST /api/invitations/accept", () => {
  it("未认证 → 401 透传，不触达 db", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(401);
    expect(mockInvitationFindUnique).not.toHaveBeenCalled();
  });

  it("请求体非 JSON → 400 {error:'请求体无效'}", async () => {
    const bad = {
      method: "POST",
      url: "http://localhost/api/invitations/accept",
      headers: new Headers(),
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as NextRequest;

    const r = res(await POST(bad));

    expect(r.status).toBe(400);
    expect(r.body.error).toBe("请求体无效");
  });

  it("缺 token → 400 {error:'缺少邀请令牌'}", async () => {
    const r = res(await POST(makePostRequest({})));

    expect(r.status).toBe(400);
    expect(r.body.error).toBe("缺少邀请令牌");
  });

  it("token 非 string → 400 {error:'缺少邀请令牌'}", async () => {
    const r = res(await POST(makePostRequest({ token: 123 })));

    expect(r.status).toBe(400);
    expect(r.body.error).toBe("缺少邀请令牌");
  });

  it("token 无效 → 404，不触达事务", async () => {
    mockInvitationFindUnique.mockResolvedValue(null);

    const r = res(await POST(makePostRequest({ token: "nope" })));

    expect(r.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("status='accepted' → 410 '邀请已被接受，无法再次接受'，不触达事务", async () => {
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation({ status: "accepted" }));

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(410);
    expect(r.body.error).toBe("邀请已被接受，无法再次接受");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("status='revoked' → 410 '邀请已被撤销，无法再次接受'", async () => {
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation({ status: "revoked" }));

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(410);
    expect(r.body.error).toBe("邀请已被撤销，无法再次接受");
  });

  it("pending 但已过期 → 410 '邀请已过期'", async () => {
    mockInvitationFindUnique.mockResolvedValue(
      pendingInvitation({ expiresAt: new Date(NOW.getTime() - HOUR) })
    );

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(410);
    expect(r.body.error).toBe("邀请已过期");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("邮箱不匹配 → 403 '此邀请不属于当前账号...'，不触达事务", async () => {
    mockAuthenticate.mockResolvedValue(mismatchedAuth);
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation());

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(403);
    expect(r.body.error).toBe("此邀请不属于当前账号，请使用被邀请的邮箱登录");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("正常接受 → 200 {success,tenantName,role,tenantId}，事务内 create+update 入参正确", async () => {
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation({ role: "admin" }));

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(200);
    // 事务调用一次
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // tx.tenantUser.create：以 invitation.tenantId 为准（非 auth.tenantId）
    expect(mockTxTenantUserCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-invited", userId: "user-1", role: "admin" },
    });
    // tx.invitation.update：status='accepted' + acceptedAt=NOW
    expect(mockTxInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "accepted", acceptedAt: NOW },
    });
    // 事务后查租户名
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: "tenant-invited" },
      select: { name: true },
    });
    expect(r.body).toEqual({
      success: true,
      message: "已成功加入团队",
      tenantName: "受邀团队",
      tenantId: "tenant-invited",
      role: "admin",
    });
  });

  it("P2002（已是成员）→ 409 '您已是该团队的成员'", async () => {
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation());
    mockTxTenantUserCreate.mockRejectedValue({ code: "P2002" });

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(409);
    expect(r.body.error).toBe("您已是该团队的成员");
  });

  it("事务内非 P2002 异常 → 500 {error:'接受邀请失败'}", async () => {
    mockInvitationFindUnique.mockResolvedValue(pendingInvitation());
    mockTransaction.mockRejectedValue(new Error("db down"));

    const r = res(await POST(makePostRequest({ token: "token-abc" })));

    expect(r.status).toBe(500);
    expect(r.body.error).toBe("接受邀请失败");
  });
});
