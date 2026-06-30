/**
 * invitations 路由 handler 级集成测试
 *
 * 锁定 /api/invitations 路由层（GET / POST）的安全与控制流契约。本路由用 raw db
 * 手动注入 tenantId（非 TenantDb），与第四十一轮"21 处 $transaction 回调均显式
 * tenantId 作用域、文档化自管约定"一致——invitations 的 db 调用全部在 $transaction
 * 之外，手动 where/data 注入 tenantId 即可保证租户隔离。
 *
 * 核心安全契约（手动 tenantId 注入，全等断言锁死）：
 *   - GET：db.invitation.count / findMany 的 where 恒含 tenantId（单键或 +status）。
 *   - POST：db.invitation.findFirst（pending 检查）的 where 恒含 tenantId+email+
 *     status:'pending'+expiresAt:{gt:now}；db.invitation.create 的 data 恒含 tenantId。
 *   - **duplicate user 检查的租户作用域走 include 过滤而非 where.tenantId**：
 *     db.user.findFirst({where:{email}, include:{tenantMemberships:{where:{tenantId}}}})，
 *     user 表本身无 tenantId 字段（多租户关系经 TenantUser 关联表），租户归属由 include
 *     的 filtered relation where 限定。测试锁定 include.tenantMemberships.where.tenantId
 *     形状，防后续误改为 where.tenantId（user 表无此字段，将导致查询异常或跨租户误判）。
 *
 * 角色门控模型（与 trash/storage/system-logs 对照）：
 *   - GET 列邀请：仅 owner/admin 可查（403 for member/viewer），属"租户级管理数据 +
 *     role 门控"，与 system-logs 一致（区别于 trash/storage 的个人数据无门控）。
 *   - POST 创建邀请：仅 owner/admin 可发（403 for member/viewer），同 GET。
 *   - **role 门控顺序差异**：GET 的 role 门控在最前（auth 后即门控，不触达 DB）；
 *     POST 的 role 门控在 email/role 校验之后（先 400 校验、后 403 门控）——测试用
 *     "member 身份 + 缺 email → 400 而非 403"锁定此顺序契约，防后续误把门控前移。
 *
 * invited-role 白名单契约：['admin','member','viewer']，**'owner' 不可被邀请**
 * （owner 是租户创建者，不可经邀请产生）。测试用 role:'owner' → 400 锁定。
 *
 * token 生成契约：randomUUID() 产生 UUIDv4 格式字符串，写入 invitation.token。
 * 测试用 UUID 正则断言 token 形状 + 断言 create.data.token 为同一字符串（不 mock
 * crypto 模块，避免内置模块 mock 风险；正则锁定"是 randomUUID 输出"契约）。
 *
 * expiresAt 计算契约：new Date(Date.now() + expiresInHours*60*60*1000)。测试用
 * vi.spyOn(Date,'now') 固定时间戳，使 expiresAt 可全等断言（默认 72h / 自定义 24h）。
 * pending 检查的 `expiresAt:{gt:new Date()}` 因 new Date() 不经 Date.now() 方法（V8
 * 内部 CurrentTime），用 expect.any(Date) 断言形状。
 *
 * 复用第四十轮 trash-route.test.ts 的 vi.hoisted + MockNextResponse 范式。本路由无
 * $transaction、无 TenantDb，mock 结构较 trash/files-import 简单（单层 db mock 即可）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockInvitationCount,
  mockInvitationFindMany,
  mockUserFindFirst,
  mockInvitationFindFirst,
  mockInvitationCreate,
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
    mockInvitationCount: vi.fn(),
    mockInvitationFindMany: vi.fn(),
    mockUserFindFirst: vi.fn(),
    mockInvitationFindFirst: vi.fn(),
    mockInvitationCreate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    invitation: {
      count: (...args: unknown[]) => mockInvitationCount(...args),
      findMany: (...args: unknown[]) => mockInvitationFindMany(...args),
      findFirst: (...args: unknown[]) => mockInvitationFindFirst(...args),
      create: (...args: unknown[]) => mockInvitationCreate(...args),
    },
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
  },
}));

import { GET, POST } from "@/app/api/invitations/route";

// 身份 fixture（逐用例按需覆盖 mockAuthenticate 返回值）
const ownerAuth = { userId: "user-1", email: "owner@example.com", tenantId: "tenant-1", role: "owner" };
const adminAuth = { userId: "user-2", email: "admin@example.com", tenantId: "tenant-1", role: "admin" };
const memberAuth = { userId: "user-3", email: "member@example.com", tenantId: "tenant-1", role: "member" };
const viewerAuth = { userId: "user-4", email: "viewer@example.com", tenantId: "tenant-1", role: "viewer" };

// 固定 Date.now() 使 expiresAt 全等可断言（new Date(num) 直接用 num，不经 Date.now()）
const FIXED_NOW = Date.parse("2026-06-29T00:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let dateNowSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  // 默认已认证为 owner
  mockAuthenticate.mockResolvedValue(ownerAuth);
});

afterEach(() => {
  dateNowSpy?.mockRestore();
});

function makeGetRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/invitations${query}`) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return {
    method: "POST",
    url: "http://localhost/api/invitations",
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

function unauthResponse(): NextResponse {
  return new MockNextResponse({ error: "未提供身份认证令牌" }, { status: 401 }) as unknown as NextResponse;
}

// ─── GET /api/invitations — 获取邀请列表 ─────────────
describe("GET /api/invitations", () => {
  it("未认证 → 401 透传，不触达 db.invitation", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
    expect(mockInvitationCount).not.toHaveBeenCalled();
    expect(mockInvitationFindMany).not.toHaveBeenCalled();
  });

  it("role=member → 403 {error:'没有权限查看邀请列表'}，不触达 DB（门控在 count/findMany 之前）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(403);
    expect((res as { body: { error: string } }).body.error).toBe("没有权限查看邀请列表");
    expect(mockInvitationCount).not.toHaveBeenCalled();
    expect(mockInvitationFindMany).not.toHaveBeenCalled();
  });

  it("role=viewer → 403，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(viewerAuth);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(403);
    expect(mockInvitationCount).not.toHaveBeenCalled();
    expect(mockInvitationFindMany).not.toHaveBeenCalled();
  });

  it("role=admin → 放行（admin 与 owner 均可查邀请列表）", async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);
    mockInvitationCount.mockResolvedValue(0);
    mockInvitationFindMany.mockResolvedValue([]);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(mockInvitationCount).toHaveBeenCalledTimes(1);
    expect(mockInvitationFindMany).toHaveBeenCalledTimes(1);
  });

  it("默认 → count+findMany 同 where {tenantId}，orderBy createdAt desc，skip=0 take=20，返回分页字段", async () => {
    mockInvitationCount.mockResolvedValue(0);
    mockInvitationFindMany.mockResolvedValue([]);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(mockInvitationCount).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(mockInvitationFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    const body = (res as { body: Record<string, unknown> }).body;
    expect(body).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      hasMore: false,
    });
  });

  it("status 过滤 → where {tenantId, status}", async () => {
    mockInvitationCount.mockResolvedValue(1);
    mockInvitationFindMany.mockResolvedValue([{ id: "inv-1" }]);

    await GET(makeGetRequest("?status=accepted"));

    expect(mockInvitationCount).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", status: "accepted" } });
    expect(mockInvitationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-1", status: "accepted" } })
    );
  });

  it("分页 page=2&pageSize=2 → skip=2 take=2，totalPages=ceil(total/pageSize)，hasMore=true", async () => {
    mockInvitationCount.mockResolvedValue(5);
    mockInvitationFindMany.mockResolvedValue([{ id: "inv-3" }, { id: "inv-4" }]);

    const res = await GET(makeGetRequest("?page=2&pageSize=2"));

    expect(mockInvitationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2 })
    );
    const body = (res as { body: Record<string, unknown> }).body;
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize=500 → Math.min(100, 500) 截断为 100（响应 pageSize + findMany take 双锁定）", async () => {
    mockInvitationCount.mockResolvedValue(0);
    mockInvitationFindMany.mockResolvedValue([]);

    const res = await GET(makeGetRequest("?pageSize=500"));

    expect(mockInvitationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
    expect((res as { body: { pageSize: number } }).body.pageSize).toBe(100);
  });

  it("count 抛错 → 500 {error:'获取邀请列表失败'}，findMany 不触达", async () => {
    mockInvitationCount.mockRejectedValue(new Error("db down"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(500);
    expect((res as { body: { error: string } }).body.error).toBe("获取邀请列表失败");
    expect(mockInvitationFindMany).not.toHaveBeenCalled();
  });

  it("findMany 抛错 → 500 {error:'获取邀请列表失败'}", async () => {
    mockInvitationCount.mockResolvedValue(1);
    mockInvitationFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(500);
    expect((res as { body: { error: string } }).body.error).toBe("获取邀请列表失败");
  });

  // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
    const res = await GET(makeGetRequest("?page=abc"));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("page 必须 >= 1");
    expect(mockInvitationCount).not.toHaveBeenCalled();
    expect(mockInvitationFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = await GET(makeGetRequest("?page=0"));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("page 必须 >= 1");
    expect(mockInvitationCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = await GET(makeGetRequest("?pageSize=abc"));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("pageSize 必须为正整数");
    expect(mockInvitationFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = await GET(makeGetRequest("?pageSize=0"));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("pageSize 必须为正整数");
    expect(mockInvitationFindMany).not.toHaveBeenCalled();
  });

  it("member + page=abc → 403 而非 400（权限门控优先于分页校验，不泄漏校验细节）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = await GET(makeGetRequest("?page=abc"));

    expect(res.status).toBe(403);
    expect((res as { body: { error: string } }).body.error).toBe("没有权限查看邀请列表");
    expect(mockInvitationCount).not.toHaveBeenCalled();
  });
});

// ─── POST /api/invitations — 创建邀请 ─────────────
describe("POST /api/invitations", () => {
  it("未认证 → 401 透传，不触达任何 DB 调用", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const res = await POST(makePostRequest({ email: "a@b.com", role: "member" }));

    expect(res.status).toBe(401);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("email 缺失 + member 身份 → 400 {error:'邮箱不能为空'}（email 校验先于 role 门控）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = await POST(makePostRequest({}));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("邮箱不能为空");
    // 门控未达，DB 未触达
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("role='owner' → 400 {error:'无效的角色'}（owner 不可被邀请，白名单仅 admin/member/viewer）", async () => {
    const res = await POST(makePostRequest({ email: "a@b.com", role: "owner" }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("无效的角色");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("role='superadmin' → 400 {error:'无效的角色'}", async () => {
    const res = await POST(makePostRequest({ email: "a@b.com", role: "superadmin" }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("无效的角色");
  });

  it("member 身份 + 合法 email + 合法 role → 403 {error:'没有权限邀请用户'}（门控在 email/role 校验之后）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = await POST(makePostRequest({ email: "a@b.com", role: "member" }));

    expect(res.status).toBe(403);
    expect((res as { body: { error: string } }).body.error).toBe("没有权限邀请用户");
    // 门控阻断，DB 未触达
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("viewer 身份 → 403 {error:'没有权限邀请用户'}", async () => {
    mockAuthenticate.mockResolvedValue(viewerAuth);

    const res = await POST(makePostRequest({ email: "a@b.com", role: "viewer" }));

    expect(res.status).toBe(403);
    expect((res as { body: { error: string } }).body.error).toBe("没有权限邀请用户");
  });

  it("用户已存在且已在本租户 → user.findFirst include filtered relation where tenantId 返回 length>0 → 400 {error:'该用户已经在租户中'}", async () => {
    mockUserFindFirst.mockResolvedValue({
      id: "u-existing",
      email: "taken@example.com",
      tenantMemberships: [{ tenantId: "tenant-1" }],
    });

    const res = await POST(makePostRequest({ email: "taken@example.com", role: "member" }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("该用户已经在租户中");
    // 锁定 duplicate user 检查的租户作用域走 include 过滤（user 表无 tenantId 字段）
    expect(mockUserFindFirst).toHaveBeenCalledWith({
      where: { email: "taken@example.com" },
      include: { tenantMemberships: { where: { tenantId: "tenant-1" } } },
    });
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("用户存在但不在本租户（tenantMemberships 空数组）→ 放行继续 pending 检查并创建", async () => {
    mockUserFindFirst.mockResolvedValue({
      id: "u-other-tenant",
      email: "global@example.com",
      tenantMemberships: [],
    });
    mockInvitationFindFirst.mockResolvedValue(null);
    mockInvitationCreate.mockResolvedValue({ id: "inv-1", email: "global@example.com" });

    const res = await POST(makePostRequest({ email: "global@example.com", role: "member" }));

    expect(res.status).toBe(200);
    expect(mockInvitationCreate).toHaveBeenCalledTimes(1);
  });

  it("pending 邀请已存在 → invitation.findFirst where {tenantId,email,status:'pending',expiresAt:{gt:now}} → 400 {error:'该邮箱已有未过期的邀请'}", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    mockInvitationFindFirst.mockResolvedValue({ id: "inv-existing" });

    const res = await POST(makePostRequest({ email: "a@b.com", role: "member" }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("该邮箱已有未过期的邀请");
    // 锁定 pending 检查 where 形状（new Date() 不经 Date.now()，用 expect.any(Date)）
    expect(mockInvitationFindFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        email: "a@b.com",
        status: "pending",
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("owner + 全新邮箱 + role 默认 member + expiresInHours 默认 72 → create data 含 tenantId/email/role/token(UUID)/invitedBy/expiresAt(now+72h) → 200 {success,data,message}", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    mockInvitationFindFirst.mockResolvedValue(null);
    const created = { id: "inv-new", tenantId: "tenant-1", email: "new@example.com", role: "member" };
    mockInvitationCreate.mockResolvedValue(created);

    const res = await POST(makePostRequest({ email: "new@example.com" }));

    expect(res.status).toBe(200);
    // 锁定 create data 全等形状（token 用 UUID 正则，expiresAt 因 Date.now 固定可全等）
    expect(mockInvitationCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        email: "new@example.com",
        role: "member",
        token: expect.stringMatching(UUID_RE),
        invitedBy: "user-1",
        expiresAt: new Date(FIXED_NOW + 72 * HOUR_MS),
      },
    });
    const body = (res as { body: Record<string, unknown> }).body;
    expect(body).toEqual({ success: true, data: created, message: "邀请已发送" });
  });

  it("owner + role='admin' + expiresInHours=24 → create data role='admin', expiresAt=now+24h", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    mockInvitationFindFirst.mockResolvedValue(null);
    mockInvitationCreate.mockResolvedValue({ id: "inv-2" });

    await POST(makePostRequest({ email: "admin2@example.com", role: "admin", expiresInHours: 24 }));

    expect(mockInvitationCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        email: "admin2@example.com",
        role: "admin",
        token: expect.stringMatching(UUID_RE),
        invitedBy: "user-1",
        expiresAt: new Date(FIXED_NOW + 24 * HOUR_MS),
      },
    });
  });

  it("admin 身份亦可邀请 → 成功（admin 与 owner 均可创建邀请）", async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);
    mockUserFindFirst.mockResolvedValue(null);
    mockInvitationFindFirst.mockResolvedValue(null);
    mockInvitationCreate.mockResolvedValue({ id: "inv-3" });

    const res = await POST(makePostRequest({ email: "x@example.com", role: "viewer" }));

    expect(res.status).toBe(200);
    expect(mockInvitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitedBy: "user-2", role: "viewer" }),
      })
    );
  });

  it("user.findFirst 抛错 → 500 {error:'创建邀请失败'}，invitation.findFirst/create 不触达", async () => {
    mockUserFindFirst.mockRejectedValue(new Error("db down"));

    const res = await POST(makePostRequest({ email: "a@b.com", role: "member" }));

    expect(res.status).toBe(500);
    expect((res as { body: { error: string } }).body.error).toBe("创建邀请失败");
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("invitation.create 抛错 → 500 {error:'创建邀请失败'}", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    mockInvitationFindFirst.mockResolvedValue(null);
    mockInvitationCreate.mockRejectedValue(new Error("write fail"));

    const res = await POST(makePostRequest({ email: "a@b.com", role: "member" }));

    expect(res.status).toBe(500);
    expect((res as { body: { error: string } }).body.error).toBe("创建邀请失败");
  });

  // ── expiresInHours 值域校验：非数字 / 非正整数 / 超上限 → 400，不触达 DB ──
  // 防止 'abc' → NaN、布尔、对象等透传到 Date 算术产生 Invalid Date，以及负数/0 导致
  // expiresAt 落在过去或当前时刻（邀请立即过期）。与 files/[id]/share/route.ts 的
  // expiresIn typeof+range 校验约定一致（同单位为小时，同上限 8760）。默认 72 小时合法。
  // 校验置于 role 门控之后、db.user.findFirst 之前：owner/admin 才能触达校验，
  // 与 GET 分页校验置于 role 门控之后的顺序约定一致（不向 member/viewer 泄漏校验细节）。
  it("expiresInHours='abc'（字符串）→ 400，不触达 user/invitation DB", async () => {
    const res = await POST(makePostRequest({ email: "a@b.com", expiresInHours: "abc" }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("expiresInHours 必须为 1-8760 之间的正整数");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationFindFirst).not.toHaveBeenCalled();
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("expiresInHours=1.5（小数）→ 400，不触达 DB", async () => {
    const res = await POST(makePostRequest({ email: "a@b.com", expiresInHours: 1.5 }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("expiresInHours 必须为 1-8760 之间的正整数");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("expiresInHours=0（非正数）→ 400，不触达 DB（防 expiresAt=now 立即过期）", async () => {
    const res = await POST(makePostRequest({ email: "a@b.com", expiresInHours: 0 }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("expiresInHours 必须为 1-8760 之间的正整数");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("expiresInHours=-1（负数）→ 400，不触达 DB（防 expiresAt 落在过去）", async () => {
    const res = await POST(makePostRequest({ email: "a@b.com", expiresInHours: -1 }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("expiresInHours 必须为 1-8760 之间的正整数");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("expiresInHours=8761（超上限）→ 400，不触达 DB", async () => {
    const res = await POST(makePostRequest({ email: "a@b.com", expiresInHours: 8761 }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("expiresInHours 必须为 1-8760 之间的正整数");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("expiresInHours=null → 400（destructuring 默认仅 undefined 触发，null 透传为非法）", async () => {
    // body.expiresInHours=null 时解构默认 72 不触发，expiresInHours=null，
    // typeof null !== 'number' → 400。锁定此行为，防止 null 透传到算术产生 0/NaN。
    const res = await POST(makePostRequest({ email: "a@b.com", expiresInHours: null }));

    expect(res.status).toBe(400);
    expect((res as { body: { error: string } }).body.error).toBe("expiresInHours 必须为 1-8760 之间的正整数");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("member + expiresInHours='abc' → 403 而非 400（role 门控优先于 expiresInHours 校验，不泄漏校验细节）", async () => {
    // 与 GET "member + page=abc → 403" 顺序约定一致：权限 403 优先于字段校验 400。
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = await POST(makePostRequest({ email: "a@b.com", expiresInHours: "abc" }));

    expect(res.status).toBe(403);
    expect((res as { body: { error: string } }).body.error).toBe("没有权限邀请用户");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });
});
