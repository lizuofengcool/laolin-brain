/**
 * api-keys 路由 handler 级集成测试
 *
 * 锁定 /api/api-keys 路由层的安全与权限契约：
 *   - GET：未认证 401 透传；非 owner/admin 403；成功时 count/findMany 以 auth.tenantId
 *     作用域调用（防多租户越权），返回列表严格剥离 secret 字段；分页参数解析与 pageSize
 *     上限 100；count 异常 500。
 *   - POST：未认证 401 透传；非 owner/admin 403；缺 name 400；成功时核心安全契约——
 *     落库的 secret 为明文 apiSecret 的 sha256 哈希（create.data.secret === sha256(返回的
 *     明文 secret)），response 仅此一次返回明文 secret 且与落库值不同；key 为 'ak_' 前缀；
 *     scopes 以 JSON.stringify 落库、response 以 JSON.parse 回显；expiresAt 按 expiresInDays
 *     计算或为 null；create 以 auth.tenantId/userId 作用域调用；create 异常 500。
 *
 * 不 mock node 'crypto'（randomBytes/createHash 真实运行），以真实 exercise 哈希契约；
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route 的
 * vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "crypto";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockApiKeyCount,
  mockApiKeyFindMany,
  mockApiKeyCreate,
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
    mockApiKeyCount: vi.fn(),
    mockApiKeyFindMany: vi.fn(),
    mockApiKeyCreate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      count: (...args: unknown[]) => mockApiKeyCount(...args),
      findMany: (...args: unknown[]) => mockApiKeyFindMany(...args),
      create: (...args: unknown[]) => mockApiKeyCreate(...args),
    },
  },
}));

import { GET, POST } from "@/app/api/api-keys/route";

// 默认 owner 身份（逐用例按需覆盖）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/api-keys${query}`;
  return new Request(url) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/api-keys", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/api-keys 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  describe("GET /api/api-keys", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockApiKeyCount).not.toHaveBeenCalled();
      expect(mockApiKeyFindMany).not.toHaveBeenCalled();
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
      expect(mockApiKeyCount).not.toHaveBeenCalled();
      expect(mockApiKeyFindMany).not.toHaveBeenCalled();
    });

    it("成功 → 200 分页结构，count/findMany 以 auth.tenantId 作用域调用，列表剥离 secret", async () => {
      mockApiKeyCount.mockResolvedValue(5);
      // 故意在 DB 行中带 secret，断言响应将其剥离
      mockApiKeyFindMany.mockResolvedValue([
        {
          id: "ak-1",
          name: "ci-key",
          key: "ak_deadbeef",
          secret: "hashed-secret-should-not-leak",
          scopes: '["read","write"]',
          expiresAt: null,
          lastUsedAt: null,
          enabled: true,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      ]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      // count / findMany 均以 auth.tenantId 作用域（防多租户越权）
      expect(mockApiKeyCount).toHaveBeenCalledTimes(1);
      expect(mockApiKeyCount.mock.calls[0][0]).toEqual({ where: { tenantId: "tenant-1" } });
      expect(mockApiKeyFindMany).toHaveBeenCalledTimes(1);
      const findArg = mockApiKeyFindMany.mock.calls[0][0] as {
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
      // scopes 经 JSON.parse 回显
      expect(body.data[0].scopes).toEqual(["read", "write"]);
      // 列表严格不含 secret（即使 DB 行带 secret）
      expect(body.data[0]).not.toHaveProperty("secret");
      // 分页元数据
      expect(body.total).toBe(5);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.totalPages).toBe(1);
      expect(body.hasMore).toBe(false);
    });

    it("分页参数 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
      mockApiKeyCount.mockResolvedValue(5);
      mockApiKeyFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockApiKeyFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(2);
      expect(findArg.take).toBe(2);
      const body = res.body as { totalPages: number; hasMore: boolean; page: number; pageSize: number };
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(2);
      expect(body.totalPages).toBe(3);
      expect(body.hasMore).toBe(true);
    });

    it("pageSize 超过上限被截断为 100", async () => {
      mockApiKeyCount.mockResolvedValue(0);
      mockApiKeyFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockApiKeyFindMany.mock.calls[0][0] as { take: number };
      expect(findArg.take).toBe(100);
    });

    // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
    it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
      const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockApiKeyCount).not.toHaveBeenCalled();
      expect(mockApiKeyFindMany).not.toHaveBeenCalled();
    });

    it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
      const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "page 必须 >= 1" });
      expect(mockApiKeyCount).not.toHaveBeenCalled();
    });

    it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
      const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockApiKeyFindMany).not.toHaveBeenCalled();
    });

    it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
      const res = (await GET(makeGetRequest("?pageSize=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
      expect(mockApiKeyFindMany).not.toHaveBeenCalled();
    });

    it("member + page=abc → 403 而非 400（权限门控优先于分页校验，不泄漏校验细节）", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });

      const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockApiKeyCount).not.toHaveBeenCalled();
    });

    it("count 抛错 → 500", async () => {
      mockApiKeyCount.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取API密钥列表失败" });
    });
  });

  describe("POST /api/api-keys", () => {
    it("未认证 → 401 透传，不触达 create", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await POST(makePostRequest({ name: "k" }))) as MockRes;

      expect(res.status).toBe(401);
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("member 角色 → 403，不触达 create", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });

      const res = (await POST(makePostRequest({ name: "k" }))) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("缺 name → 400，不触达 create", async () => {
      const res = (await POST(makePostRequest({ scopes: ["read"] }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "name is required" });
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("成功（无 expiresInDays）→ secret 哈希落库 / 明文仅返回一次 / key ak_ 前缀 / scopes 序列化 / expiresAt null / 作用域正确", async () => {
      // create 回填的字段需与路由读取的字段对齐（name/key/scopes/expiresAt/enabled/createdAt）
      mockApiKeyCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: "ak-new",
        name: args.data.name,
        key: args.data.key,
        secret: args.data.secret,
        scopes: args.data.scopes,
        expiresAt: args.data.expiresAt,
        enabled: true,
        createdAt: "2026-06-28T00:00:00.000Z",
      }));

      const res = (await POST(makePostRequest({ name: "ci-key", scopes: ["read", "write"] }))) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as {
        success: boolean;
        data: { key: string; secret: string; scopes: string[]; expiresAt: string | null; name: string };
        message: string;
      };
      expect(body.success).toBe(true);

      // ── 核心安全契约：落库 secret = sha256(返回的明文 secret) ──
      const plaintextSecret = body.data.secret;
      const expectedHash = createHash("sha256").update(plaintextSecret).digest("hex");
      expect(mockApiKeyCreate).toHaveBeenCalledTimes(1);
      const createData = mockApiKeyCreate.mock.calls[0][0].data as {
        tenantId: string;
        userId: string;
        name: string;
        key: string;
        secret: string;
        scopes: string;
        expiresAt: Date | null;
      };
      expect(createData.secret).toBe(expectedHash); // 落库的是明文的 sha256
      expect(createData.secret).not.toBe(plaintextSecret); // 绝不能把明文落库
      expect(plaintextSecret).toMatch(/^[0-9a-f]{64}$/); // 明文为 32 字节 hex
      expect(createData.secret).toMatch(/^[0-9a-f]{64}$/); // 哈希亦为 64 hex

      // key 前缀
      expect(createData.key).toMatch(/^ak_[0-9a-f]{48}$/); // 'ak_' + 24 字节 hex
      expect(body.data.key).toBe(createData.key);

      // scopes 序列化落库、response 回 parse
      expect(createData.scopes).toBe(JSON.stringify(["read", "write"]));
      expect(body.data.scopes).toEqual(["read", "write"]);

      // 无 expiresInDays → expiresAt null
      expect(createData.expiresAt).toBeNull();
      expect(body.data.expiresAt).toBeNull();

      // 作用域：tenantId / userId 来自 auth 权威值
      expect(createData.tenantId).toBe("tenant-1");
      expect(createData.userId).toBe("user-1");

      // message 提示一次性保存
      expect(body.message).toContain("保存");
    });

    it("成功（带 expiresInDays=7）→ expiresAt 约为未来 7 天，scopes 往返", async () => {
      const DAY = 7 * 24 * 60 * 60 * 1000;
      const before = Date.now();
      mockApiKeyCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: "ak-new",
        name: args.data.name,
        key: args.data.key,
        secret: args.data.secret,
        scopes: args.data.scopes,
        expiresAt: args.data.expiresAt,
        enabled: true,
        createdAt: "2026-06-28T00:00:00.000Z",
      }));

      const res = (await POST(
        makePostRequest({ name: "expiring-key", scopes: ["admin"], expiresInDays: 7 })
      )) as MockRes;
      const after = Date.now();

      expect(res.status).toBe(200);
      const createData = mockApiKeyCreate.mock.calls[0][0].data as { expiresAt: Date };
      expect(createData.expiresAt).toBeInstanceOf(Date);
      const expiresMs = createData.expiresAt.getTime();
      // 允许 ±2s 计时松弛
      expect(expiresMs).toBeGreaterThanOrEqual(before + DAY - 2000);
      expect(expiresMs).toBeLessThanOrEqual(after + DAY + 2000);
    });

    it("create 抛错 → 500", async () => {
      mockApiKeyCreate.mockRejectedValue(new Error("unique violation"));

      const res = (await POST(makePostRequest({ name: "k" }))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "创建API密钥失败" });
    });

    // ── expiresInDays 值域校验：非数字 / 非正整数 / 超上限 → 400，不触达 create ──
    // 防止 'abc' → NaN、布尔、对象等透传到 Date 算术产生 Invalid Date，以及负数/超大值
    // 导致 expiresAt 落在过去或过于遥远的未来。与 files/[id]/share/route.ts 的 expiresIn
    // typeof+range 校验约定一致。未提供（undefined）→ 无过期（保持既有 truthy-check 语义）。
    it("expiresInDays='abc'（字符串）→ 400，不触达 create", async () => {
      const res = (await POST(
        makePostRequest({ name: "k", expiresInDays: "abc" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "expiresInDays 必须为 1-3650 之间的正整数" });
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("expiresInDays=1.5（小数）→ 400，不触达 create", async () => {
      const res = (await POST(
        makePostRequest({ name: "k", expiresInDays: 1.5 })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "expiresInDays 必须为 1-3650 之间的正整数" });
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("expiresInDays=0（非正数）→ 400，不触达 create", async () => {
      const res = (await POST(
        makePostRequest({ name: "k", expiresInDays: 0 })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "expiresInDays 必须为 1-3650 之间的正整数" });
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("expiresInDays=-7（负数）→ 400，不触达 create", async () => {
      const res = (await POST(
        makePostRequest({ name: "k", expiresInDays: -7 })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "expiresInDays 必须为 1-3650 之间的正整数" });
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("expiresInDays=3651（超上限）→ 400，不触达 create", async () => {
      const res = (await POST(
        makePostRequest({ name: "k", expiresInDays: 3651 })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "expiresInDays 必须为 1-3650 之间的正整数" });
      expect(mockApiKeyCreate).not.toHaveBeenCalled();
    });

    it("expiresInDays=null → 视同未提供，无过期（expiresAt null），create 触达", async () => {
      // 显式 null 与 undefined 行为一致：truthy-check 走 null 分支，无过期
      mockApiKeyCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: "ak-new",
        name: args.data.name,
        key: args.data.key,
        secret: args.data.secret,
        scopes: args.data.scopes,
        expiresAt: args.data.expiresAt,
        enabled: true,
        createdAt: "2026-06-28T00:00:00.000Z",
      }));

      const res = (await POST(
        makePostRequest({ name: "k", expiresInDays: null })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockApiKeyCreate).toHaveBeenCalledTimes(1);
      const createData = mockApiKeyCreate.mock.calls[0][0].data as { expiresAt: Date | null };
      expect(createData.expiresAt).toBeNull();
    });
  });
});
