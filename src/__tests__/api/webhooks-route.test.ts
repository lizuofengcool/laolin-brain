/**
 * webhooks 路由 handler 级集成测试
 *
 * 锁定 /api/webhooks 与 /api/webhooks/[id] 路由层的安全与权限契约：
 *   - GET /api/webhooks：未认证 401 透传；非 owner/admin 403；成功时 count/findMany 以
 *     auth.tenantId 作用域调用（防多租户越权），返回列表严格剥离 secret（仅回 hasSecret
 *     布尔），events 经 JSON.parse 回显；分页参数解析与 pageSize 上限 100；count 异常 500。
 *   - POST /api/webhooks：未认证 401 透传；非 owner/admin 403（注意权限检查在 name/url 必填
 *     与 URL 格式校验之后，故 member 用例须传合法 body 才能抵达 403）；缺 name 400；无效 URL
 *     400；generateSecret=false → secret=null 落库且响应 secret=null、无 message；
 *     generateSecret=true → secret 为 32 字节 hex（64 字符）且**明文落库**（webhook 与
 *     api-keys 不同，不哈希），响应明文 secret === 落库 secret（仅此一次返回），message 含
 *     "保存"；events 以 JSON.stringify 落库、响应 JSON.parse 回显；create 以 auth
 *     tenantId/userId 作用域调用；create 异常 500。
 *   - PATCH /api/webhooks/[id]：未认证 401 透传；非 owner/admin 403（权限检查在 findFirst
 *     之前）；findFirst 返回 null → 404；url 字段无效 → 400；成功时 findFirst 以
 *     {id, tenantId} 作用域调用（防跨租户越权），update.data 仅含传入字段（events 经
 *     JSON.stringify），响应剥离 secret（仅 hasSecret 布尔），events JSON.parse 回显；
 *     update 异常 500。
 *   - DELETE /api/webhooks/[id]：未认证 401 透传；非 owner/admin 403；findFirst 返回
 *     null → 404；成功时 delete 以 {id} 调用，响应 success + message；delete 异常 500。
 *
 * 不 mock node 'crypto'（randomBytes 真实运行），以真实 exercise secret 生成契约；
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十~三十一轮 cloud-sync-config /
 * api-keys route 测试的 vi.hoisted 共享 MockNextResponse 范式（使路由
 * `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockWebhookCount,
  mockWebhookFindMany,
  mockWebhookCreate,
  mockWebhookFindFirst,
  mockWebhookUpdate,
  mockWebhookDelete,
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
    mockWebhookCount: vi.fn(),
    mockWebhookFindMany: vi.fn(),
    mockWebhookCreate: vi.fn(),
    mockWebhookFindFirst: vi.fn(),
    mockWebhookUpdate: vi.fn(),
    mockWebhookDelete: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    webhook: {
      count: (...args: unknown[]) => mockWebhookCount(...args),
      findMany: (...args: unknown[]) => mockWebhookFindMany(...args),
      create: (...args: unknown[]) => mockWebhookCreate(...args),
      findFirst: (...args: unknown[]) => mockWebhookFindFirst(...args),
      update: (...args: unknown[]) => mockWebhookUpdate(...args),
      delete: (...args: unknown[]) => mockWebhookDelete(...args),
    },
  },
}));

import { GET, POST } from "@/app/api/webhooks/route";
import { PATCH, DELETE } from "@/app/api/webhooks/[id]/route";

// 默认 owner 身份（逐用例按需覆盖）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/webhooks${query}`;
  return new Request(url) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/webhooks", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

type PatchCtx = { params: Promise<{ id: string }> };

function makePatchRequest(
  body: unknown,
  id = "wh-1"
): { req: NextRequest; ctx: PatchCtx } {
  return {
    req: new Request(`http://localhost/api/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextRequest,
    ctx: { params: Promise.resolve({ id }) },
  };
}

function makeDeleteRequest(id = "wh-1"): { req: NextRequest; ctx: PatchCtx } {
  return {
    req: new Request(`http://localhost/api/webhooks/${id}`, {
      method: "DELETE",
    }) as unknown as NextRequest,
    ctx: { params: Promise.resolve({ id }) },
  };
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/webhooks 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  describe("GET /api/webhooks", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockWebhookCount).not.toHaveBeenCalled();
      expect(mockWebhookFindMany).not.toHaveBeenCalled();
    });

    it("member 角色 → 403，不触达 count/findMany", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockWebhookCount).not.toHaveBeenCalled();
      expect(mockWebhookFindMany).not.toHaveBeenCalled();
    });

    it("成功 → 200 分页结构，count/findMany 以 auth.tenantId 作用域调用，列表剥离 secret", async () => {
      mockWebhookCount.mockResolvedValue(5);
      // 故意在 DB 行中带 secret，断言响应仅回 hasSecret 布尔、不含 secret 明文
      mockWebhookFindMany.mockResolvedValue([
        {
          id: "wh-1",
          name: "ci-hook",
          url: "https://example.com/hook",
          events: '["file.created","file.updated"]',
          secret: "plaintext-secret-should-not-leak",
          enabled: true,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      ]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      // count / findMany 均以 auth.tenantId 作用域（防多租户越权）
      expect(mockWebhookCount).toHaveBeenCalledTimes(1);
      expect(mockWebhookCount.mock.calls[0][0]).toEqual({ where: { tenantId: "tenant-1" } });
      expect(mockWebhookFindMany).toHaveBeenCalledTimes(1);
      const findArg = mockWebhookFindMany.mock.calls[0][0] as {
        where: { tenantId: string };
        orderBy: unknown;
        skip: number;
        take: number;
      };
      expect(findArg.where).toEqual({ tenantId: "tenant-1" });
      expect(findArg.orderBy).toEqual({ createdAt: "desc" });
      // 默认分页 page=1 / pageSize=20
      expect(findArg.skip).toBe(0);
      expect(findArg.take).toBe(20);

      const body = res.body as {
        data: Array<Record<string, unknown>>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      // events 经 JSON.parse 回显
      expect(body.data[0].events).toEqual(["file.created", "file.updated"]);
      // 列表严格不含 secret 明文（即使 DB 行带 secret），仅回 hasSecret 布尔
      expect(body.data[0]).not.toHaveProperty("secret");
      expect(body.data[0].hasSecret).toBe(true);
      // 分页元数据
      expect(body.total).toBe(5);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.totalPages).toBe(1);
      expect(body.hasMore).toBe(false);
    });

    it("分页参数 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
      mockWebhookCount.mockResolvedValue(5);
      mockWebhookFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockWebhookFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(2);
      expect(findArg.take).toBe(2);
      const body = res.body as {
        totalPages: number;
        hasMore: boolean;
        page: number;
        pageSize: number;
      };
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(2);
      expect(body.totalPages).toBe(3);
      expect(body.hasMore).toBe(true);
    });

    it("pageSize 超过上限被截断为 100", async () => {
      mockWebhookCount.mockResolvedValue(0);
      mockWebhookFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockWebhookFindMany.mock.calls[0][0] as { take: number };
      expect(findArg.take).toBe(100);
    });

    it("count 抛错 → 500", async () => {
      mockWebhookCount.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取Webhook列表失败" });
    });
  });

  describe("POST /api/webhooks", () => {
    it("未认证 → 401 透传，不触达 create", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await POST(
        makePostRequest({ name: "wh", url: "https://example.com/hook" })
      )) as MockRes;

      expect(res.status).toBe(401);
      expect(mockWebhookCreate).not.toHaveBeenCalled();
    });

    it("member 角色（合法 body）→ 403，不触达 create", async () => {
      // POST 权限检查在 name/url 必填与 URL 格式校验之后，须传合法 body 才能抵达 403
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });

      const res = (await POST(
        makePostRequest({ name: "wh", url: "https://example.com/hook" })
      )) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockWebhookCreate).not.toHaveBeenCalled();
    });

    it("缺 name → 400，不触达 create", async () => {
      const res = (await POST(
        makePostRequest({ url: "https://example.com/hook" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "name and url are required" });
      expect(mockWebhookCreate).not.toHaveBeenCalled();
    });

    it("无效 URL 格式 → 400，不触达 create", async () => {
      const res = (await POST(
        makePostRequest({ name: "wh", url: "not-a-url" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "无效的URL格式" });
      expect(mockWebhookCreate).not.toHaveBeenCalled();
    });

    it("成功（generateSecret=false）→ secret=null 落库且响应 secret=null，无 message", async () => {
      mockWebhookCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: "wh-new",
        name: args.data.name,
        url: args.data.url,
        events: args.data.events,
        secret: args.data.secret,
        enabled: true,
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
      }));

      const res = (await POST(
        makePostRequest({
          name: "ci-hook",
          url: "https://example.com/hook",
          events: ["file.created"],
          generateSecret: false,
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      // create 入参：tenantId/userId 来自 auth 权威值；secret=null；events 序列化落库
      expect(mockWebhookCreate).toHaveBeenCalledTimes(1);
      const createData = mockWebhookCreate.mock.calls[0][0].data as {
        tenantId: string;
        userId: string;
        name: string;
        url: string;
        events: string;
        secret: string | null;
      };
      expect(createData.tenantId).toBe("tenant-1");
      expect(createData.userId).toBe("user-1");
      expect(createData.name).toBe("ci-hook");
      expect(createData.url).toBe("https://example.com/hook");
      expect(createData.events).toBe(JSON.stringify(["file.created"]));
      expect(createData.secret).toBeNull();

      const body = res.body as {
        success: boolean;
        data: { secret: string | null; events: string[]; name: string };
        message: string | undefined;
      };
      expect(body.success).toBe(true);
      expect(body.data.secret).toBeNull();
      expect(body.data.events).toEqual(["file.created"]);
      // 无 secret 时 message 为 undefined（JSON 序列化时被省略）
      expect(body.message).toBeUndefined();
    });

    it("成功（generateSecret=true）→ secret 为 64 hex 明文落库且仅此一次返回，message 含保存提示", async () => {
      mockWebhookCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: "wh-new",
        name: args.data.name,
        url: args.data.url,
        events: args.data.events,
        secret: args.data.secret,
        enabled: true,
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
      }));

      const res = (await POST(
        makePostRequest({
          name: "ci-hook",
          url: "https://example.com/hook",
          events: ["file.created"],
          generateSecret: true,
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockWebhookCreate).toHaveBeenCalledTimes(1);
      const createData = mockWebhookCreate.mock.calls[0][0].data as {
        secret: string;
        events: string;
        tenantId: string;
        userId: string;
      };
      const body = res.body as {
        success: boolean;
        data: { secret: string; events: string[] };
        message: string;
      };

      // ── 核心契约：webhook secret 为 32 字节 hex（64 字符），明文落库且响应明文 === 落库明文 ──
      // （与 api-keys 不同：webhook 不哈希，secret 仅在创建时返回一次，GET/PATCH 永不回传）
      expect(createData.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(body.data.secret).toBe(createData.secret); // 响应明文 === 落库明文
      expect(body.data.events).toEqual(["file.created"]);
      expect(createData.tenantId).toBe("tenant-1");
      expect(createData.userId).toBe("user-1");

      // message 提示一次性保存
      expect(body.message).toContain("保存");
    });

    it("create 抛错 → 500", async () => {
      mockWebhookCreate.mockRejectedValue(new Error("unique violation"));

      const res = (await POST(
        makePostRequest({ name: "wh", url: "https://example.com/hook" })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "创建Webhook失败" });
    });
  });

  describe("PATCH /api/webhooks/[id]", () => {
    it("未认证 → 401 透传，不触达 findFirst/update", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );
      const { req, ctx } = makePatchRequest({ name: "updated" });

      const res = (await PATCH(req, ctx)) as MockRes;

      expect(res.status).toBe(401);
      expect(mockWebhookFindFirst).not.toHaveBeenCalled();
      expect(mockWebhookUpdate).not.toHaveBeenCalled();
    });

    it("member 角色 → 403，不触达 findFirst/update（权限检查在 findFirst 之前）", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });
      const { req, ctx } = makePatchRequest({ name: "updated" });

      const res = (await PATCH(req, ctx)) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockWebhookFindFirst).not.toHaveBeenCalled();
      expect(mockWebhookUpdate).not.toHaveBeenCalled();
    });

    it("findFirst 返回 null → 404，不触达 update", async () => {
      mockWebhookFindFirst.mockResolvedValue(null);
      const { req, ctx } = makePatchRequest({ name: "updated" });

      const res = (await PATCH(req, ctx)) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Webhook不存在" });
      // findFirst 以 {id, tenantId} 作用域调用（防跨租户越权）
      expect(mockWebhookFindFirst).toHaveBeenCalledTimes(1);
      expect(mockWebhookFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "wh-1", tenantId: "tenant-1" },
      });
      expect(mockWebhookUpdate).not.toHaveBeenCalled();
    });

    it("url 字段无效 → 400，不触达 update", async () => {
      mockWebhookFindFirst.mockResolvedValue({
        id: "wh-1",
        name: "old",
        url: "https://example.com/old",
        events: "[]",
        secret: null,
        enabled: true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      });
      const { req, ctx } = makePatchRequest({ url: "not-a-url" });

      const res = (await PATCH(req, ctx)) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "无效的URL格式" });
      expect(mockWebhookUpdate).not.toHaveBeenCalled();
    });

    it("成功 → findFirst 以 {id,tenantId} 作用域，update.data 仅含传入字段且 events 序列化，响应剥离 secret", async () => {
      mockWebhookFindFirst.mockResolvedValue({
        id: "wh-1",
        name: "old",
        url: "https://example.com/old",
        events: "[]",
        secret: "old-secret",
        enabled: true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      });
      // update 返回的对象带 secret，断言响应仅回 hasSecret 布尔、不含明文
      mockWebhookUpdate.mockResolvedValue({
        id: "wh-1",
        name: "updated",
        url: "https://example.com/new",
        events: '["file.deleted"]',
        secret: "plaintext-secret-should-not-leak",
        enabled: false,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
      });
      const { req, ctx } = makePatchRequest({
        name: "updated",
        url: "https://example.com/new",
        events: ["file.deleted"],
        enabled: false,
      });

      const res = (await PATCH(req, ctx)) as MockRes;

      expect(res.status).toBe(200);
      // findFirst 以 {id, tenantId} 作用域（防跨租户越权）
      expect(mockWebhookFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "wh-1", tenantId: "tenant-1" },
      });
      // update 以 {id} 为 where；data 仅含传入字段，events 经 JSON.stringify
      expect(mockWebhookUpdate).toHaveBeenCalledTimes(1);
      const updateArg = mockWebhookUpdate.mock.calls[0][0] as {
        where: { id: string };
        data: Record<string, unknown>;
      };
      expect(updateArg.where).toEqual({ id: "wh-1" });
      expect(updateArg.data).toEqual({
        name: "updated",
        url: "https://example.com/new",
        events: JSON.stringify(["file.deleted"]),
        enabled: false,
      });

      const body = res.body as {
        success: boolean;
        data: Record<string, unknown>;
      };
      expect(body.success).toBe(true);
      // 响应剥离 secret 明文（仅 hasSecret 布尔），events 经 JSON.parse 回显
      expect(body.data).not.toHaveProperty("secret");
      expect(body.data.hasSecret).toBe(true);
      expect(body.data.events).toEqual(["file.deleted"]);
      expect(body.data.name).toBe("updated");
      expect(body.data.enabled).toBe(false);
    });

    it("update 抛错 → 500", async () => {
      mockWebhookFindFirst.mockResolvedValue({
        id: "wh-1",
        name: "old",
        url: "https://example.com/old",
        events: "[]",
        secret: null,
        enabled: true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      });
      mockWebhookUpdate.mockRejectedValue(new Error("db write fail"));
      const { req, ctx } = makePatchRequest({ name: "updated" });

      const res = (await PATCH(req, ctx)) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "更新Webhook失败" });
    });
  });

  describe("DELETE /api/webhooks/[id]", () => {
    it("未认证 → 401 透传，不触达 findFirst/delete", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );
      const { req, ctx } = makeDeleteRequest();

      const res = (await DELETE(req, ctx)) as MockRes;

      expect(res.status).toBe(401);
      expect(mockWebhookFindFirst).not.toHaveBeenCalled();
      expect(mockWebhookDelete).not.toHaveBeenCalled();
    });

    it("member 角色 → 403，不触达 findFirst/delete", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });
      const { req, ctx } = makeDeleteRequest();

      const res = (await DELETE(req, ctx)) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockWebhookFindFirst).not.toHaveBeenCalled();
      expect(mockWebhookDelete).not.toHaveBeenCalled();
    });

    it("findFirst 返回 null → 404，不触达 delete", async () => {
      mockWebhookFindFirst.mockResolvedValue(null);
      const { req, ctx } = makeDeleteRequest();

      const res = (await DELETE(req, ctx)) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Webhook不存在" });
      // findFirst 以 {id, tenantId} 作用域调用（防跨租户越权）
      expect(mockWebhookFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "wh-1", tenantId: "tenant-1" },
      });
      expect(mockWebhookDelete).not.toHaveBeenCalled();
    });

    it("成功 → delete 以 {id} 调用，响应 success + message", async () => {
      mockWebhookFindFirst.mockResolvedValue({
        id: "wh-1",
        name: "old",
        url: "https://example.com/old",
        events: "[]",
        secret: null,
        enabled: true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      });
      mockWebhookDelete.mockResolvedValue({});
      const { req, ctx } = makeDeleteRequest();

      const res = (await DELETE(req, ctx)) as MockRes;

      expect(res.status).toBe(200);
      // findFirst 以 {id, tenantId} 作用域；delete 以 {id} 为 where
      expect(mockWebhookFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "wh-1", tenantId: "tenant-1" },
      });
      expect(mockWebhookDelete).toHaveBeenCalledTimes(1);
      expect(mockWebhookDelete.mock.calls[0][0]).toEqual({ where: { id: "wh-1" } });
      const body = res.body as { success: boolean; message: string };
      expect(body.success).toBe(true);
      expect(body.message).toBe("Webhook已删除");
    });

    it("delete 抛错 → 500", async () => {
      mockWebhookFindFirst.mockResolvedValue({
        id: "wh-1",
        name: "old",
        url: "https://example.com/old",
        events: "[]",
        secret: null,
        enabled: true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      });
      mockWebhookDelete.mockRejectedValue(new Error("db delete fail"));
      const { req, ctx } = makeDeleteRequest();

      const res = (await DELETE(req, ctx)) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "删除Webhook失败" });
    });
  });
});
