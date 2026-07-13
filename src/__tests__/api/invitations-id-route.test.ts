/**
 * invitations/[id] 路由 handler 级集成测试
 *
 * 锁定 /api/invitations/[id]（DELETE 撤销）与 /api/invitations/[id]/resend
 * （POST 重发）的安全与控制流契约。
 *
 * 核心安全契约（手动 tenantId 注入，与 invitations-route / accept 一致）：
 *   - DELETE/POST：role 门控仅 owner/admin（403 for member/viewer），门控在
 *     findFirst 之前（不触达 DB）。
 *   - 跨租户守卫：findFirst where 恒含 {id, tenantId}，他租户 id 等价于"不存在" → 404，
 *     不泄漏邀请存在性。测试用 where 全等断言锁死 {id, tenantId} 双键作用域。
 *   - 仅 status='pending' 可撤销/重发；accepted/revoked/expired → 410，不触达 update。
 *   - 撤销为软撤销：update data {status:'revoked'}，不 delete（保留审计记录）。
 *   - 重发刷新 expiresAt 至 now + expiresInHours（默认 72h，可经 body 自定义 1-8760），
 *     复用原 token 不轮换（避免已投递旧链接失效）；逻辑过期（status=pending 但
 *     expiresAt 已过）的邀请允许重发——status 检查只看 pending 不看 expiresAt。
 *   - 邮件投递 fire-and-forget：sendEmail reject 不中断主流程，仍返回 200。
 *
 * 复用 invitations-route.test.ts 的 vi.hoisted + MockNextResponse + 固定 Date.now 范式。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockInvitationFindFirst,
  mockInvitationUpdate,
  mockTenantFindUnique,
  mockSendEmail,
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
    mockInvitationFindFirst: vi.fn(),
    mockInvitationUpdate: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockSendEmail: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/email", () => ({
  emailService: {
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    invitation: {
      findFirst: (...args: unknown[]) => mockInvitationFindFirst(...args),
      update: (...args: unknown[]) => mockInvitationUpdate(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
    },
  },
}));

import { DELETE } from "@/app/api/invitations/[id]/route";
import { POST as resendPOST } from "@/app/api/invitations/[id]/resend/route";

// 身份 fixture
const ownerAuth = { userId: "user-1", email: "owner@example.com", tenantId: "tenant-1", role: "owner" };
const adminAuth = { userId: "user-2", email: "admin@example.com", tenantId: "tenant-1", role: "admin" };
const memberAuth = { userId: "user-3", email: "member@example.com", tenantId: "tenant-1", role: "member" };
const viewerAuth = { userId: "user-4", email: "viewer@example.com", tenantId: "tenant-1", role: "viewer" };

// 固定 Date.now() 使 expiresAt 全等可断言（new Date(num) 直接用 num，不经 Date.now()）
const FIXED_NOW = Date.parse("2026-07-14T00:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

// pending 邀请 fixture（含 token / email / role，供重发邮件断言复用）
const pendingInvitation = {
  id: "inv-1",
  tenantId: "tenant-1",
  email: "invitee@example.com",
  role: "member",
  status: "pending",
  token: "11111111-2222-3333-4444-555555555555",
  invitedBy: "user-1",
  expiresAt: new Date(FIXED_NOW - 1000), // 已逻辑过期，但仍 pending（验证重发可刷新）
  createdAt: new Date(FIXED_NOW - 2 * 24 * HOUR_MS),
  updatedAt: new Date(FIXED_NOW - 2 * 24 * HOUR_MS),
};

let dateNowSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  mockAuthenticate.mockResolvedValue(ownerAuth);
  mockTenantFindUnique.mockResolvedValue({ name: "测试租户" });
  mockSendEmail.mockResolvedValue(true);
});

afterEach(() => {
  dateNowSpy?.mockRestore();
});

function makeDeleteRequest(id: string): NextRequest {
  return new Request(`http://localhost/api/invitations/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

function makeResendRequest(id: string, body?: unknown): NextRequest {
  return new Request(`http://localhost/api/invitations/${id}/resend`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function unauthResponse() {
  return new MockNextResponse({ error: "未提供身份认证令牌" }, { status: 401 });
}

type MockRes = InstanceType<typeof MockNextResponse>;

// ─── DELETE /api/invitations/[id] — 撤销邀请 ─────────────
describe("DELETE /api/invitations/[id]（撤销）", () => {
  it("未认证 → 401 透传，不触达 findFirst/update", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(401);
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
  });

  it("role=member → 403，不触达 DB（门控在 findFirst 之前）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe("没有权限撤销邀请");
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
  });

  it("role=viewer → 403，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(viewerAuth);

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
  });

  it("role=admin → 放行（admin 与 owner 均可撤销）", async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);
    mockInvitationFindFirst.mockResolvedValue({ ...pendingInvitation, status: "pending" });
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, status: "revoked" });

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(200);
  });

  it("findFirst 未命中（不存在/跨租户）→ 404，findFirst 以 {id, tenantId} 双键作用域调用，不触达 update", async () => {
    mockInvitationFindFirst.mockResolvedValue(null);

    const res = (await DELETE(makeDeleteRequest("inv-missing"), {
      params: Promise.resolve({ id: "inv-missing" }),
    })) as MockRes;

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("邀请不存在");
    expect(mockInvitationFindFirst).toHaveBeenCalledWith({
      where: { id: "inv-missing", tenantId: "tenant-1" },
    });
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
  });

  it("status='accepted' → 410，不触达 update", async () => {
    mockInvitationFindFirst.mockResolvedValue({ ...pendingInvitation, status: "accepted" });

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(410);
    expect((res.body as { error: string }).error).toBe("邀请已被接受，无法撤销");
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
  });

  it("status='revoked' → 410，不触达 update", async () => {
    mockInvitationFindFirst.mockResolvedValue({ ...pendingInvitation, status: "revoked" });

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(410);
    expect((res.body as { error: string }).error).toBe("邀请已被撤销，无法撤销");
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
  });

  it("status='pending' → 200，update data={status:'revoked'}，where.id 不含 tenantId（findFirst 已租户鉴权）", async () => {
    mockInvitationFindFirst.mockResolvedValue({ ...pendingInvitation, status: "pending" });
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, status: "revoked" });

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "邀请已撤销",
    });
    expect(mockInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "revoked" },
    });
  });

  it("update 抛错 → 500", async () => {
    mockInvitationFindFirst.mockResolvedValue({ ...pendingInvitation, status: "pending" });
    mockInvitationUpdate.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = (await DELETE(makeDeleteRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toBe("撤销邀请失败");
    errorSpy.mockRestore();
  });
});

// ─── POST /api/invitations/[id]/resend — 重发邀请 ─────────────
describe("POST /api/invitations/[id]/resend（重发）", () => {
  it("未认证 → 401 透传，不触达 findFirst/update/sendEmail", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(401);
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("role=member → 403，不触达 DB/sendEmail", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe("没有权限重发邀请");
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("findFirst 未命中 → 404，不触达 update/sendEmail", async () => {
    mockInvitationFindFirst.mockResolvedValue(null);

    const res = (await resendPOST(makeResendRequest("inv-missing"), {
      params: Promise.resolve({ id: "inv-missing" }),
    })) as MockRes;

    expect(res.status).toBe(404);
    expect(mockInvitationFindFirst).toHaveBeenCalledWith({
      where: { id: "inv-missing", tenantId: "tenant-1" },
    });
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("status='revoked' → 410，不触达 update/sendEmail", async () => {
    mockInvitationFindFirst.mockResolvedValue({ ...pendingInvitation, status: "revoked" });

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(410);
    expect((res.body as { error: string }).error).toBe("邀请已被撤销，无法重发");
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("status='accepted' → 410", async () => {
    mockInvitationFindFirst.mockResolvedValue({ ...pendingInvitation, status: "accepted" });

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(410);
    expect((res.body as { error: string }).error).toBe("邀请已被接受，无法重发");
  });

  it("逻辑过期（status=pending 但 expiresAt 已过）→ 允许重发（status 检查只看 pending）", async () => {
    // pendingInvitation.expiresAt = FIXED_NOW - 1000（已过），status=pending
    mockInvitationFindFirst.mockResolvedValue(pendingInvitation);
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS) });

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    expect(mockInvitationUpdate).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("默认 72h → update data={expiresAt: now+72h}，sendEmail 复用原 token 且 variables 全等", async () => {
    mockInvitationFindFirst.mockResolvedValue(pendingInvitation);
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS) });

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: "邀请已重发" });

    const expectedExpiresAt = new Date(FIXED_NOW + 72 * HOUR_MS);
    expect(mockInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { expiresAt: expectedExpiresAt },
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      "invitee@example.com",
      "invitation",
      {
        email: "invitee@example.com",
        tenantName: "测试租户",
        role: "成员",
        inviteUrl: `http://localhost:3000/invite?token=${pendingInvitation.token}`,
        expiresAt: expectedExpiresAt.toISOString(),
      },
      "tenant-1",
      "user-1"
    );
  });

  it("自定义 expiresInHours=24 → update data={expiresAt: now+24h}，sendEmail variables.expiresAt 一致", async () => {
    mockInvitationFindFirst.mockResolvedValue(pendingInvitation);
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, expiresAt: new Date(FIXED_NOW + 24 * HOUR_MS) });

    await resendPOST(makeResendRequest("inv-1", { expiresInHours: 24 }), {
      params: Promise.resolve({ id: "inv-1" }),
    });

    const expectedExpiresAt = new Date(FIXED_NOW + 24 * HOUR_MS);
    expect(mockInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { expiresAt: expectedExpiresAt },
    });
    const callArgs = mockSendEmail.mock.calls[0] as [string, string, { expiresAt: string }];
    expect(callArgs[2].expiresAt).toBe(expectedExpiresAt.toISOString());
  });

  it("expiresInHours=0 → 400，不触达 findFirst/update/sendEmail", async () => {
    const res = (await resendPOST(makeResendRequest("inv-1", { expiresInHours: 0 }), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("expiresInHours 必须为 1-8760 之间的正整数");
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("expiresInHours=8761（超上限）→ 400", async () => {
    const res = (await resendPOST(makeResendRequest("inv-1", { expiresInHours: 8761 }), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
  });

  it("expiresInHours=1.5（非整数）→ 400", async () => {
    const res = (await resendPOST(makeResendRequest("inv-1", { expiresInHours: 1.5 }), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(400);
  });

  it("expiresInHours='72'（字符串）→ 400", async () => {
    const res = (await resendPOST(makeResendRequest("inv-1", { expiresInHours: "72" }), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(400);
  });

  it("无 body → 默认 72h，不报错", async () => {
    mockInvitationFindFirst.mockResolvedValue(pendingInvitation);
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS) });

    // makeResendRequest(undefined) → body 为 undefined（request.json() 将 reject）
    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    expect(mockInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS) },
    });
  });

  it("非法 JSON body → 默认 72h，不报错", async () => {
    mockInvitationFindFirst.mockResolvedValue(pendingInvitation);
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS) });

    const req = new Request("http://localhost/api/invitations/inv-1/resend", {
      method: "POST",
      body: "not-json{",
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextRequest;

    const res = (await resendPOST(req, {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    expect(mockInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS) },
    });
  });

  it("sendEmail reject → 不中断主流程，仍返回 200（fire-and-forget）", async () => {
    mockInvitationFindFirst.mockResolvedValue(pendingInvitation);
    mockInvitationUpdate.mockResolvedValue({ ...pendingInvitation, expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS) });
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("Failed to send invitation email:", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("update 抛错 → 500，不调用 sendEmail", async () => {
    mockInvitationFindFirst.mockResolvedValue(pendingInvitation);
    mockInvitationUpdate.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = (await resendPOST(makeResendRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toBe("重发邀请失败");
    expect(mockSendEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
