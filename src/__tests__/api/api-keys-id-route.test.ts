/**
 * api-keys/[id] 路由 handler 级集成测试
 *
 * 锁定 /api/api-keys/[id] 路由层的密钥生命周期与安全契约：
 *   - PATCH：未认证 401 透传；非 owner/admin 403；findFirst 以 {id, tenantId} 双键
 *     作用域调用（防跨租户越权），未命中 404；成功时 updateData 仅含 body 提供的字段
 *     （scopes 以 JSON.stringify 落库），update 以 where.id=keyId 调用（前置 findFirst
 *     已做租户鉴权），response 剥离 secret、scopes 以 JSON.parse 回显；update 异常 500。
 *   - DELETE：未认证 401 透传；非 owner/admin 403；findFirst 以 {id, tenantId} 双键
 *     作用域调用，未命中 404；成功时 delete 以 where.id=keyId 调用，response 含 success
 *     + message；delete 异常 500。
 *
 * 不 mock node 'crypto'（路由文件顶部 import 但 PATCH/DELETE 未触达，仍保持真实运行）；
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用 api-keys-route.test.ts 的
 * vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockApiKeyFindFirst,
  mockApiKeyUpdate,
  mockApiKeyDelete,
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
    mockApiKeyFindFirst: vi.fn(),
    mockApiKeyUpdate: vi.fn(),
    mockApiKeyDelete: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findFirst: (...args: unknown[]) => mockApiKeyFindFirst(...args),
      update: (...args: unknown[]) => mockApiKeyUpdate(...args),
      delete: (...args: unknown[]) => mockApiKeyDelete(...args),
    },
  },
}));

import { PATCH, DELETE } from "@/app/api/api-keys/[id]/route";

// 默认 owner 身份（逐用例按需覆盖）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new Request(`http://localhost/api/api-keys/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeDeleteRequest(id: string): NextRequest {
  return new Request(`http://localhost/api/api-keys/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/api-keys/[id] 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  describe("PATCH /api/api-keys/[id]", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 findFirst/update", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await PATCH(makePatchRequest("ak-1", { name: "x" }), {
        params: Promise.resolve({ id: "ak-1" }),
      })) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockApiKeyFindFirst).not.toHaveBeenCalled();
      expect(mockApiKeyUpdate).not.toHaveBeenCalled();
    });

    it("member 角色 → 403，不触达 findFirst/update", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });

      const res = (await PATCH(makePatchRequest("ak-1", { name: "x" }), {
        params: Promise.resolve({ id: "ak-1" }),
      })) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockApiKeyFindFirst).not.toHaveBeenCalled();
      expect(mockApiKeyUpdate).not.toHaveBeenCalled();
    });

    it("findFirst 未命中 → 404，findFirst 以 {id, tenantId} 双键作用域调用，不触达 update", async () => {
      // 故意命中 null：模拟密钥不存在或跨租户越权访问（tenantId 作用域拦截）
      mockApiKeyFindFirst.mockResolvedValue(null);

      const res = (await PATCH(makePatchRequest("ak-missing", { name: "x" }), {
        params: Promise.resolve({ id: "ak-missing" }),
      })) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "API密钥不存在" });
      // 核心安全契约：findFirst 必须带 tenantId 作用域，防跨租户越权
      expect(mockApiKeyFindFirst).toHaveBeenCalledTimes(1);
      expect(mockApiKeyFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "ak-missing", tenantId: "tenant-1" },
      });
      expect(mockApiKeyUpdate).not.toHaveBeenCalled();
    });

    it("成功全字段更新 → updateData 含 name/scopes(序列化)/enabled/expiresAt，update where.id=keyId，response 剥离 secret 且 scopes parse 回显", async () => {
      // findFirst 命中（带 secret 字段，断言 response 剥离）
      mockApiKeyFindFirst.mockResolvedValue({
        id: "ak-1",
        name: "old-name",
        secret: "hashed-old-secret-should-not-leak",
      });
      // update 回填完整字段
      mockApiKeyUpdate.mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        name: args.data.name ?? "old-name",
        key: "ak_deadbeef",
        secret: "hashed-old-secret-should-not-leak",
        scopes: args.data.scopes ?? "[]",
        expiresAt: args.data.expiresAt ?? null,
        lastUsedAt: null,
        enabled: args.data.enabled ?? true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
      }));

      const res = (await PATCH(
        makePatchRequest("ak-1", {
          name: "new-name",
          scopes: ["read", "admin"],
          enabled: false,
          expiresAt: "2026-12-31T00:00:00.000Z",
        }),
        { params: Promise.resolve({ id: "ak-1" }) }
      )) as MockRes;

      expect(res.status).toBe(200);
      // findFirst 作用域正确
      expect(mockApiKeyFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "ak-1", tenantId: "tenant-1" },
      });
      // update where 仅以 id（前置 findFirst 已做租户鉴权）
      expect(mockApiKeyUpdate).toHaveBeenCalledTimes(1);
      const updateArg = mockApiKeyUpdate.mock.calls[0][0] as {
        where: { id: string };
        data: Record<string, unknown>;
      };
      expect(updateArg.where).toEqual({ id: "ak-1" });
      // updateData 仅含 body 提供的字段，scopes JSON.stringify 落库
      expect(updateArg.data).toEqual({
        name: "new-name",
        scopes: JSON.stringify(["read", "admin"]),
        enabled: false,
        expiresAt: "2026-12-31T00:00:00.000Z",
      });
      // response 剥离 secret，scopes parse 回显
      const body = res.body as { success: boolean; data: Record<string, unknown> };
      expect(body.success).toBe(true);
      expect(body.data).not.toHaveProperty("secret");
      expect(body.data.scopes).toEqual(["read", "admin"]);
      expect(body.data.name).toBe("new-name");
      expect(body.data.enabled).toBe(false);
      expect(body.data.expiresAt).toBe("2026-12-31T00:00:00.000Z");
      expect(body.data.id).toBe("ak-1");
      expect(body.data.key).toBe("ak_deadbeef");
    });

    it("成功部分更新（仅 enabled）→ updateData 仅含 enabled，不动 name/scopes/expiresAt", async () => {
      mockApiKeyFindFirst.mockResolvedValue({ id: "ak-1", name: "keep-name" });
      mockApiKeyUpdate.mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        name: "keep-name",
        key: "ak_deadbeef",
        secret: "hashed",
        scopes: '["read"]',
        expiresAt: null,
        lastUsedAt: null,
        enabled: args.data.enabled ?? true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
      }));

      const res = (await PATCH(
        makePatchRequest("ak-1", { enabled: false }),
        { params: Promise.resolve({ id: "ak-1" }) }
      )) as MockRes;

      expect(res.status).toBe(200);
      const updateArg = mockApiKeyUpdate.mock.calls[0][0] as {
        where: { id: string };
        data: Record<string, unknown>;
      };
      // 部分更新：仅 enabled 进入 updateData，name/scopes/expiresAt 未提供则不写
      expect(updateArg.data).toEqual({ enabled: false });
      expect(updateArg.data).not.toHaveProperty("name");
      expect(updateArg.data).not.toHaveProperty("scopes");
      expect(updateArg.data).not.toHaveProperty("expiresAt");
    });

    it("update 抛错 → 500", async () => {
      mockApiKeyFindFirst.mockResolvedValue({ id: "ak-1", name: "old" });
      mockApiKeyUpdate.mockRejectedValue(new Error("db write fail"));

      const res = (await PATCH(makePatchRequest("ak-1", { name: "x" }), {
        params: Promise.resolve({ id: "ak-1" }),
      })) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "更新API密钥失败" });
    });
  });

  describe("DELETE /api/api-keys/[id]", () => {
    it("未认证 → 401 透传，不触达 findFirst/delete", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await DELETE(makeDeleteRequest("ak-1"), {
        params: Promise.resolve({ id: "ak-1" }),
      })) as MockRes;

      expect(res.status).toBe(401);
      expect(mockApiKeyFindFirst).not.toHaveBeenCalled();
      expect(mockApiKeyDelete).not.toHaveBeenCalled();
    });

    it("member 角色 → 403，不触达 findFirst/delete", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });

      const res = (await DELETE(makeDeleteRequest("ak-1"), {
        params: Promise.resolve({ id: "ak-1" }),
      })) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("权限") });
      expect(mockApiKeyFindFirst).not.toHaveBeenCalled();
      expect(mockApiKeyDelete).not.toHaveBeenCalled();
    });

    it("findFirst 未命中 → 404，findFirst 以 {id, tenantId} 双键作用域调用，不触达 delete", async () => {
      mockApiKeyFindFirst.mockResolvedValue(null);

      const res = (await DELETE(makeDeleteRequest("ak-missing"), {
        params: Promise.resolve({ id: "ak-missing" }),
      })) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "API密钥不存在" });
      // 核心安全契约：findFirst 必须带 tenantId 作用域
      expect(mockApiKeyFindFirst).toHaveBeenCalledTimes(1);
      expect(mockApiKeyFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "ak-missing", tenantId: "tenant-1" },
      });
      expect(mockApiKeyDelete).not.toHaveBeenCalled();
    });

    it("成功 → delete 以 where.id=keyId 调用，response 含 success + message", async () => {
      mockApiKeyFindFirst.mockResolvedValue({ id: "ak-1", name: "to-delete" });
      mockApiKeyDelete.mockResolvedValue({ id: "ak-1" });

      const res = (await DELETE(makeDeleteRequest("ak-1"), {
        params: Promise.resolve({ id: "ak-1" }),
      })) as MockRes;

      expect(res.status).toBe(200);
      // findFirst 作用域正确
      expect(mockApiKeyFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "ak-1", tenantId: "tenant-1" },
      });
      // delete where 仅以 id（前置 findFirst 已做租户鉴权）
      expect(mockApiKeyDelete).toHaveBeenCalledTimes(1);
      expect(mockApiKeyDelete.mock.calls[0][0]).toEqual({ where: { id: "ak-1" } });
      const body = res.body as { success: boolean; message: string };
      expect(body.success).toBe(true);
      expect(body.message).toContain("删除");
    });

    it("delete 抛错 → 500", async () => {
      mockApiKeyFindFirst.mockResolvedValue({ id: "ak-1", name: "old" });
      mockApiKeyDelete.mockRejectedValue(new Error("db delete fail"));

      const res = (await DELETE(makeDeleteRequest("ak-1"), {
        params: Promise.resolve({ id: "ak-1" }),
      })) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "删除API密钥失败" });
    });
  });
});
