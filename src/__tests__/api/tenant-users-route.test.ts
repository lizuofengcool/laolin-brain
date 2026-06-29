/**
 * tenant/users 路由 handler 级集成测试
 *
 * 锁定 /api/tenant/users 路由族（GET 列表 + PATCH 改角色 + DELETE 移除）的安全与
 * 控制流契约。本路由族用 raw db 手动注入 tenantId（非 TenantDb），与 invitations
 * 路由同属"21 处 $transaction 回调之外、手动 where/data 注入 tenantId 即可保证
 * 租户隔离"的自管约定——db.tenantUser 的 count/findMany/findFirst 均恒含 tenantId，
 * update/delete 走复合唯一键 tenantId_userId（Prisma @@unique([tenantId, userId])）。
 *
 * 路由形态与 invitations 互补：invitations 是"邀请未注册用户加入"（创建 invitation
 * 记录、生成 token、计算 expiresAt），tenant/users 是"管理已加入成员"（直接 CRUD
 * TenantUser 关联记录，无 token、无 expiresAt、无 $transaction）。状态机较 invitations
 * 简单，但角色门控模型更分层：
 *   - GET 列成员：owner/admin 放行（403 for member/viewer）——同 invitations GET。
 *   - PATCH 改角色：**仅 owner 放行**（403 for admin/member/viewer）——比 GET 更严，
 *     admin 不能改角色（防 admin 互相提权/降权），与 invitations POST（owner/admin
 *     均可邀请）形成对照。
 *   - DELETE 移除成员：owner/admin 放行（403 for member/viewer）——同 GET。
 *
 * 三道防线（self-check / not-found / role-target）在各 handler 的顺序差异是核心契约：
 *   - PATCH：400(无效 role) → 403(非 owner) → 400(self) → 404(未命中) → 200(update)
 *     · 顺序锁定：admin + 无效 role → 400 而非 403（role 校验先于 owner 门控）；
 *       admin + 合法 role → 403（owner 门控在 self-check 之前，admin 不触达 self-check）。
 *   - DELETE：403(非 owner/admin) → 400(self) → 404(未命中) → 400(target.role==='owner')
 *     → 200(delete)
 *     · 顺序锁定：member + target=self → 403 而非 400 self（门控先于 self-check）；
 *     · target.role==='owner' 兜底（防 admin 移除租户所有者，导致租户无主）。
 *
 * 复合唯一键契约：update/delete 的 where 用 Prisma 复合唯一键名 tenantId_userId
 * （由 @@unique([tenantId, userId]) 生成），值 {tenantId, userId: targetUserId}——
 * 注意 userId 是 URL [id] 参数（目标用户），非 auth.userId（调用者）。测试全等断言
 * 锁定此形状，防后续误把 auth.userId 当 targetUserId 写入 where。
 *
 * GET 列表的 include.user.select 形状：{id, name, email, createdAt}（不含 password/
 * avatar 等敏感字段），响应 data 经 map 扁平化为 {id, name, email, role, joinedAt,
 * createdAt}——role 取 tu.role（tenantUser 角色，非 user 表字段）、joinedAt 取 tu.joinedAt、
 * createdAt 取 tu.user.createdAt。测试用全等 fixture 锁定映射，防字段错位（如误把
 * tu.user.role 当 role——user 表无 role 字段，将导致 undefined）。
 *
 * search 过滤的特殊形状：where.user = {OR:[{name:{contains,mode:'insensitive'}},
 * {email:{contains,mode:'insensitive'}}]}——user 表无 tenantId 字段（多租户关系经
 * TenantUser 关联表），search 经 where.user 嵌套作用域而非 where.tenantId。测试锁定
 * 此形状，防后续误改为 where.tenantId（user 表无此字段）。
 *
 * 复用第四十三轮 invitations-route.test.ts 的 vi.hoisted + MockNextResponse 范式。
 * 本路由族无 $transaction、无 TenantDb、无 Date 计算，mock 结构最简（单层 db.tenantUser
 * mock 即可覆盖全部三个 handler）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockTenantUserCount,
  mockTenantUserFindMany,
  mockTenantUserFindFirst,
  mockTenantUserUpdate,
  mockTenantUserDelete,
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
    mockTenantUserCount: vi.fn(),
    mockTenantUserFindMany: vi.fn(),
    mockTenantUserFindFirst: vi.fn(),
    mockTenantUserUpdate: vi.fn(),
    mockTenantUserDelete: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    tenantUser: {
      count: (...args: unknown[]) => mockTenantUserCount(...args),
      findMany: (...args: unknown[]) => mockTenantUserFindMany(...args),
      findFirst: (...args: unknown[]) => mockTenantUserFindFirst(...args),
      update: (...args: unknown[]) => mockTenantUserUpdate(...args),
      delete: (...args: unknown[]) => mockTenantUserDelete(...args),
    },
  },
}));

import { GET } from "@/app/api/tenant/users/route";
import { PATCH, DELETE } from "@/app/api/tenant/users/[id]/route";

// 身份 fixture（逐用例按需覆盖 mockAuthenticate 返回值）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};
const adminAuth = {
  userId: "user-2",
  email: "admin@example.com",
  tenantId: "tenant-1",
  role: "admin",
};
const memberAuth = {
  userId: "user-3",
  email: "member@example.com",
  tenantId: "tenant-1",
  role: "member",
};
const viewerAuth = {
  userId: "user-4",
  email: "viewer@example.com",
  tenantId: "tenant-1",
  role: "viewer",
};

// 固定 Date 对象使 joinedAt/createdAt 全等可断言（路由不计算 Date，直接透传 DB 值）
const FIXED_NOW = Date.parse("2026-06-29T00:00:00.000Z");
const tu1 = {
  role: "member",
  joinedAt: new Date(FIXED_NOW - 1000),
  user: {
    id: "user-3",
    name: "Alice",
    email: "alice@example.com",
    createdAt: new Date(FIXED_NOW - 2000),
  },
};
const tu1Mapped = {
  id: "user-3",
  name: "Alice",
  email: "alice@example.com",
  role: "member",
  joinedAt: new Date(FIXED_NOW - 1000),
  createdAt: new Date(FIXED_NOW - 2000),
};

beforeEach(() => {
  vi.clearAllMocks();
  // 默认已认证为 owner
  mockAuthenticate.mockResolvedValue({ ...ownerAuth });
});

function makeGetRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/tenant/users${query}`) as unknown as NextRequest;
}

function makePatchRequest(body: unknown): NextRequest {
  return {
    method: "PATCH",
    url: "http://localhost/api/tenant/users/user-3",
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

function makeDeleteRequest(): NextRequest {
  return new Request(`http://localhost/api/tenant/users/user-3`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

function unauthResponse(): NextResponse {
  return new MockNextResponse({ error: "未提供身份认证令牌" }, { status: 401 }) as unknown as NextResponse;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// ─── GET /api/tenant/users — 获取租户用户列表 ─────────────
describe("GET /api/tenant/users", () => {
  it("未认证 → 401 透传，不触达 db.tenantUser", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(mockTenantUserCount).not.toHaveBeenCalled();
    expect(mockTenantUserFindMany).not.toHaveBeenCalled();
  });

  it("role=member → 403 {error:'没有权限查看用户列表'}，不触达 DB（门控在 count/findMany 之前）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限查看用户列表" });
    expect(mockTenantUserCount).not.toHaveBeenCalled();
    expect(mockTenantUserFindMany).not.toHaveBeenCalled();
  });

  it("role=viewer → 403，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(viewerAuth);

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(403);
    expect(mockTenantUserCount).not.toHaveBeenCalled();
    expect(mockTenantUserFindMany).not.toHaveBeenCalled();
  });

  it("role=admin → 放行（admin 与 owner 均可查用户列表）", async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);
    mockTenantUserCount.mockResolvedValue(0);
    mockTenantUserFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    expect(mockTenantUserCount).toHaveBeenCalledTimes(1);
    expect(mockTenantUserFindMany).toHaveBeenCalledTimes(1);
  });

  it("默认 → count+findMany 同 where {tenantId}，orderBy joinedAt desc，skip=0 take=20，include.user.select，返回扁平化 data + 分页字段", async () => {
    mockTenantUserCount.mockResolvedValue(1);
    mockTenantUserFindMany.mockResolvedValue([tu1]);

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    // 锁定 where 全等形状（手动 tenantId 注入）
    expect(mockTenantUserCount).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(mockTenantUserFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      include: {
        user: {
          select: { id: true, name: true, email: true, createdAt: true },
        },
      },
      orderBy: { joinedAt: "desc" },
      skip: 0,
      take: 20,
    });
    // 锁定 data 扁平化映射（role 取 tu.role、joinedAt 取 tu.joinedAt、createdAt 取 tu.user.createdAt）
    expect(res.body).toEqual({
      data: [tu1Mapped],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasMore: false,
    });
  });

  it("role 过滤 → where {tenantId, role}", async () => {
    mockTenantUserCount.mockResolvedValue(0);
    mockTenantUserFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?role=admin"));

    expect(mockTenantUserCount).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", role: "admin" },
    });
    expect(mockTenantUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-1", role: "admin" } })
    );
  });

  it("search 过滤 → where.user = {OR:[name contains insensitive, email contains insensitive]}（user 表无 tenantId，经 where.user 嵌套）", async () => {
    mockTenantUserCount.mockResolvedValue(0);
    mockTenantUserFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?search=ali"));

    const expectedWhere = {
      tenantId: "tenant-1",
      user: {
        OR: [
          { name: { contains: "ali", mode: "insensitive" } },
          { email: { contains: "ali", mode: "insensitive" } },
        ],
      },
    };
    expect(mockTenantUserCount).toHaveBeenCalledWith({ where: expectedWhere });
    expect(mockTenantUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("role + search 组合 → where {tenantId, role, user:{OR}}", async () => {
    mockTenantUserCount.mockResolvedValue(0);
    mockTenantUserFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?role=member&search=ali"));

    expect(mockTenantUserCount).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        role: "member",
        user: {
          OR: [
            { name: { contains: "ali", mode: "insensitive" } },
            { email: { contains: "ali", mode: "insensitive" } },
          ],
        },
      },
    });
  });

  it("分页 page=2&pageSize=2 → skip=2 take=2，totalPages=ceil(total/pageSize)，hasMore=true", async () => {
    mockTenantUserCount.mockResolvedValue(5);
    mockTenantUserFindMany.mockResolvedValue([tu1, tu1]);

    const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

    expect(mockTenantUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2 })
    );
    const body = res.body as Record<string, unknown>;
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize=500 → Math.min(100, 500) 截断为 100（响应 pageSize + findMany take 双锁定）", async () => {
    mockTenantUserCount.mockResolvedValue(0);
    mockTenantUserFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

    expect(mockTenantUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
    expect((res.body as { pageSize: number }).pageSize).toBe(100);
  });

  it("count 抛错 → 500 {error:'获取用户列表失败'}，findMany 不触达", async () => {
    mockTenantUserCount.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取用户列表失败" });
    expect(mockTenantUserFindMany).not.toHaveBeenCalled();
  });

  it("findMany 抛错 → 500 {error:'获取用户列表失败'}", async () => {
    mockTenantUserCount.mockResolvedValue(1);
    mockTenantUserFindMany.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取用户列表失败" });
  });

  // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockTenantUserCount).not.toHaveBeenCalled();
    expect(mockTenantUserFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockTenantUserCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockTenantUserFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = (await GET(makeGetRequest("?pageSize=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockTenantUserFindMany).not.toHaveBeenCalled();
  });

  it("member + page=abc → 403 而非 400（权限门控优先于分页校验，不泄漏校验细节）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限查看用户列表" });
    expect(mockTenantUserCount).not.toHaveBeenCalled();
  });
});

// ─── PATCH /api/tenant/users/[id] — 修改用户角色 ─────────────
describe("PATCH /api/tenant/users/[id]", () => {
  it("未认证 → 401 透传，不触达 findFirst/update", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const res = (await PATCH(makePatchRequest({ role: "member" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(401);
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
    expect(mockTenantUserUpdate).not.toHaveBeenCalled();
  });

  it("role 缺失 → 400 {error:'无效的角色'}（!role 触发，先于 owner 门控）", async () => {
    const res = (await PATCH(makePatchRequest({}), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "无效的角色" });
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
    expect(mockTenantUserUpdate).not.toHaveBeenCalled();
  });

  it("role='superadmin' → 400 {error:'无效的角色'}（白名单仅 owner/admin/member/viewer）", async () => {
    const res = (await PATCH(makePatchRequest({ role: "superadmin" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "无效的角色" });
  });

  it("admin 身份 + 无效 role → 400 而非 403（role 校验先于 owner 门控，顺序锁定）", async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);

    const res = (await PATCH(makePatchRequest({ role: "bad" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "无效的角色" });
    // owner 门控未达
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
  });

  it("admin 身份 + 合法 role → 403 {error:'没有权限修改用户角色'}（仅 owner 可改角色，admin 不可）", async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);

    const res = (await PATCH(makePatchRequest({ role: "member" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限修改用户角色" });
    // owner 门控在 self-check / findFirst 之前，DB 未触达
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
    expect(mockTenantUserUpdate).not.toHaveBeenCalled();
  });

  it("member 身份 + 合法 role → 403（member/viewer 同样不可改角色）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = (await PATCH(makePatchRequest({ role: "member" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限修改用户角色" });
  });

  it("owner + target=self + 合法 role → 400 {error:'不能修改自己的角色'}（self-check 在 owner 门控之后、findFirst 之前）", async () => {
    // owner 自身 userId='user-1'，target id 设为 'user-1' 触发 self-check
    const res = (await PATCH(makePatchRequest({ role: "member" }), {
      params: Promise.resolve({ id: "user-1" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "不能修改自己的角色" });
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
    expect(mockTenantUserUpdate).not.toHaveBeenCalled();
  });

  it("findFirst 未命中 → 404 {error:'用户不存在'}，findFirst 以 {userId: targetUserId, tenantId} 双键作用域调用", async () => {
    mockTenantUserFindFirst.mockResolvedValue(null);

    const res = (await PATCH(makePatchRequest({ role: "member" }), {
      params: Promise.resolve({ id: "user-missing" }),
    })) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "用户不存在" });
    // 锁定 findFirst where 形状（userId 是 targetUserId 即 URL [id]，非 auth.userId）
    expect(mockTenantUserFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-missing", tenantId: "tenant-1" },
    });
    expect(mockTenantUserUpdate).not.toHaveBeenCalled();
  });

  it("成功 → update where {tenantId_userId:{tenantId, userId:targetUserId}} data {role} → 200 {success, data}", async () => {
    const updated = { id: "tu-1", tenantId: "tenant-1", userId: "user-3", role: "admin", joinedAt: new Date(FIXED_NOW) };
    mockTenantUserFindFirst.mockResolvedValue({ id: "tu-1", role: "member" });
    mockTenantUserUpdate.mockResolvedValue(updated);

    const res = (await PATCH(makePatchRequest({ role: "admin" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    // 锁定 update 复合唯一键 where 形状（userId 是 targetUserId 即 URL [id]）
    expect(mockTenantUserUpdate).toHaveBeenCalledWith({
      where: {
        tenantId_userId: { tenantId: "tenant-1", userId: "user-3" },
      },
      data: { role: "admin" },
    });
    expect(res.body).toEqual({ success: true, data: updated });
  });

  it("role='owner' 在白名单内 → 不触发 400（白名单含 owner，与 invitations POST 白名单排除 owner 形成对照）", async () => {
    // role='owner' 通过白名单校验，但因 target 未命中 findFirst 返回 404
    mockTenantUserFindFirst.mockResolvedValue(null);

    const res = (await PATCH(makePatchRequest({ role: "owner" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "用户不存在" });
    expect(mockTenantUserFindFirst).toHaveBeenCalledTimes(1);
  });

  it("findFirst 抛错 → 500 {error:'修改用户角色失败'}，update 不触达", async () => {
    mockTenantUserFindFirst.mockRejectedValue(new Error("db down"));

    const res = (await PATCH(makePatchRequest({ role: "member" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "修改用户角色失败" });
    expect(mockTenantUserUpdate).not.toHaveBeenCalled();
  });

  it("update 抛错 → 500 {error:'修改用户角色失败'}", async () => {
    mockTenantUserFindFirst.mockResolvedValue({ id: "tu-1", role: "member" });
    mockTenantUserUpdate.mockRejectedValue(new Error("write fail"));

    const res = (await PATCH(makePatchRequest({ role: "member" }), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "修改用户角色失败" });
  });
});

// ─── DELETE /api/tenant/users/[id] — 移除用户 ─────────────
describe("DELETE /api/tenant/users/[id]", () => {
  it("未认证 → 401 透传，不触达 findFirst/delete", async () => {
    mockAuthenticate.mockResolvedValue(unauthResponse());

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(401);
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
    expect(mockTenantUserDelete).not.toHaveBeenCalled();
  });

  it("role=member → 403 {error:'没有权限移除用户'}，不触达 DB（门控在 findFirst 之前）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限移除用户" });
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
    expect(mockTenantUserDelete).not.toHaveBeenCalled();
  });

  it("role=viewer → 403，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(viewerAuth);

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
  });

  it("member + target=self → 403 而非 400 self（owner/admin 门控先于 self-check，顺序锁定）", async () => {
    mockAuthenticate.mockResolvedValue(memberAuth);

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限移除用户" });
  });

  it("admin + target=self → 400 {error:'不能移除自己'}（admin 通过门控后达 self-check）", async () => {
    mockAuthenticate.mockResolvedValue({ ...adminAuth, userId: "user-3" });

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "不能移除自己" });
    expect(mockTenantUserFindFirst).not.toHaveBeenCalled();
  });

  it("findFirst 未命中 → 404 {error:'用户不存在'}，findFirst 以 {userId: targetUserId, tenantId} 双键作用域调用", async () => {
    mockTenantUserFindFirst.mockResolvedValue(null);

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-missing" }),
    })) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "用户不存在" });
    expect(mockTenantUserFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-missing", tenantId: "tenant-1" },
    });
    expect(mockTenantUserDelete).not.toHaveBeenCalled();
  });

  it("target.role='owner' → 400 {error:'不能移除所有者'}（防移除租户所有者导致租户无主，在 findFirst 命中之后）", async () => {
    mockTenantUserFindFirst.mockResolvedValue({ id: "tu-1", role: "owner" });

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "不能移除所有者" });
    expect(mockTenantUserDelete).not.toHaveBeenCalled();
  });

  it("成功 → delete where {tenantId_userId:{tenantId, userId:targetUserId}} → 200 {success, message:'用户已移除'}", async () => {
    mockTenantUserFindFirst.mockResolvedValue({ id: "tu-1", role: "member" });
    mockTenantUserDelete.mockResolvedValue({ id: "tu-1" });

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(200);
    expect(mockTenantUserDelete).toHaveBeenCalledWith({
      where: {
        tenantId_userId: { tenantId: "tenant-1", userId: "user-3" },
      },
    });
    expect(res.body).toEqual({ success: true, message: "用户已移除" });
  });

  it("findFirst 抛错 → 500 {error:'移除用户失败'}，delete 不触达", async () => {
    mockTenantUserFindFirst.mockRejectedValue(new Error("db down"));

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "移除用户失败" });
    expect(mockTenantUserDelete).not.toHaveBeenCalled();
  });

  it("delete 抛错 → 500 {error:'移除用户失败'}", async () => {
    mockTenantUserFindFirst.mockResolvedValue({ id: "tu-1", role: "member" });
    mockTenantUserDelete.mockRejectedValue(new Error("write fail"));

    const res = (await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-3" }),
    })) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "移除用户失败" });
  });
});
