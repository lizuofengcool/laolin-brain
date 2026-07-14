/**
 * /api/ai/providers 路由 handler 级集成测试
 *
 * 核心安全契约：AiProviderConfig.apiKey 必须以 AES-256-GCM 密文落库（schema 已标注
 * "加密存储"），不得明文存储。本测试用真实的 encryptSecret/decryptSecret（dev 回退密钥）
 * 验证路由层的加密往返，而非 mock 加密函数——以确保路由确实调用了加密、而非绕过。
 *
 * 锁定：
 *   - GET：未认证 401 透传；成功时 findMany 以 auth.tenantId/userId 作用域调用；
 *     返回的 apiKey 为"解密后掩码"（首6****末4），既不是密文也不是完整明文；
 *     历史明文行同样正确掩码；密文损坏时回退 "****" 不抛错；hasKey 与 apiKey 是否非空一致。
 *   - POST：未认证 401 透传；缺 provider 400；成功时落库的 apiKey 为 v1: 密文且 != 明文；
 *     未传 apiKey 时 update 不覆盖既有 key；空 apiKey 落库为 null；upsert 抛错 500。
 *   - DELETE：缺参 400；成功以 tenantId/userId 作用域删除。
 *
 * 复用 api-keys-route.test.ts 的 vi.hoisted + MockNextResponse 范式（使路由
 * `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { encryptSecret } from "@/lib/cloud-sync/config-crypto";

const {
  MockNextResponse,
  mockAuthenticate,
  mockProviderFindMany,
  mockProviderUpsert,
  mockProviderDeleteMany,
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
    mockProviderFindMany: vi.fn(),
    mockProviderUpsert: vi.fn(),
    mockProviderDeleteMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    aiProviderConfig: {
      findMany: (...args: unknown[]) => mockProviderFindMany(...args),
      upsert: (...args: unknown[]) => mockProviderUpsert(...args),
      deleteMany: (...args: unknown[]) => mockProviderDeleteMany(...args),
    },
  },
}));

import { GET, POST, DELETE } from "@/app/api/ai/providers/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/ai/providers${query}`) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/ai/providers", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeDeleteRequest(query = ""): NextRequest {
  const url = `http://localhost/api/ai/providers${query}`;
  const req = new Request(url, { method: "DELETE" }) as unknown as NextRequest & { nextUrl: URL };
  // DELETE 路由用 request.nextUrl.searchParams，标准 Request 无 nextUrl，注入之
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(url);
  return req;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/ai/providers 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(ownerAuth);
  });

  describe("GET", () => {
    it("未认证时透传 401", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 }) as unknown as never,
      );
      const res = (await GET(makeGetRequest())) as MockRes;
      expect(res.status).toBe(401);
      expect(mockProviderFindMany).not.toHaveBeenCalled();
    });

    it("成功时以 tenantId/userId 作用域查询，apiKey 解密后掩码返回（非密文）", async () => {
      const plainKey = "sk-demo-key-1234567890abcdef";
      const storedCipher = encryptSecret(plainKey);
      mockProviderFindMany.mockResolvedValue([
        {
          id: "cfg-1",
          name: "openai",
          provider: "openai",
          apiKey: storedCipher,
          baseUrl: "https://api.openai.com",
          model: "gpt-4",
          isDefault: true,
          updatedAt: new Date(),
        },
      ]);

      const res = (await GET(makeGetRequest())) as MockRes;
      expect(mockProviderFindMany).toHaveBeenCalledWith({
        where: { userId: ownerAuth.userId, tenantId: ownerAuth.tenantId },
        select: expect.objectContaining({ apiKey: true }),
      });
      const body = res.body as { configs: Array<{ apiKey: string | null; hasKey: boolean }> };
      expect(body.configs).toHaveLength(1);
      // 掩码为首6 + **** + 末4，既不是完整明文也不是密文
      expect(body.configs[0].apiKey).toBe(`${plainKey.slice(0, 6)}****${plainKey.slice(-4)}`);
      expect(body.configs[0].apiKey).not.toContain(storedCipher);
      expect(body.configs[0].hasKey).toBe(true);
    });

    it("历史明文 apiKey 行同样正确掩码（向后兼容）", async () => {
      const legacyKey = "sk-legacy-plaintext-key";
      mockProviderFindMany.mockResolvedValue([
        { id: "cfg-2", name: "deepseek", provider: "deepseek", apiKey: legacyKey, baseUrl: null, model: null, isDefault: false, updatedAt: new Date() },
      ]);
      const res = (await GET(makeGetRequest())) as MockRes;
      const body = res.body as { configs: Array<{ apiKey: string | null; hasKey: boolean }> };
      expect(body.configs[0].apiKey).toBe(`${legacyKey.slice(0, 6)}****${legacyKey.slice(-4)}`);
      expect(body.configs[0].hasKey).toBe(true);
    });

    it("密文损坏时 apiKey 回退 **** 不抛错，hasKey 仍为 true", async () => {
      mockProviderFindMany.mockResolvedValue([
        { id: "cfg-3", name: "openai", provider: "openai", apiKey: "v1:!!!tampered", baseUrl: null, model: null, isDefault: false, updatedAt: new Date() },
      ]);
      const res = (await GET(makeGetRequest())) as MockRes;
      const body = res.body as { configs: Array<{ apiKey: string | null; hasKey: boolean }> };
      expect(body.configs[0].apiKey).toBe("****");
      expect(body.configs[0].hasKey).toBe(true);
    });

    it("apiKey 为 null 时返回 null 且 hasKey false", async () => {
      mockProviderFindMany.mockResolvedValue([
        { id: "cfg-4", name: "ollama", provider: "ollama", apiKey: null, baseUrl: "http://localhost:11434", model: "llama3", isDefault: false, updatedAt: new Date() },
      ]);
      const res = (await GET(makeGetRequest())) as MockRes;
      const body = res.body as { configs: Array<{ apiKey: string | null; hasKey: boolean }> };
      expect(body.configs[0].apiKey).toBeNull();
      expect(body.configs[0].hasKey).toBe(false);
    });
  });

  describe("POST", () => {
    it("未认证时透传 401", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 }) as unknown as never,
      );
      const res = (await POST(makePostRequest({ provider: "openai" }))) as MockRes;
      expect(res.status).toBe(401);
      expect(mockProviderUpsert).not.toHaveBeenCalled();
    });

    it("缺 provider 时返回 400", async () => {
      const res = (await POST(makePostRequest({ apiKey: "sk-demo" }))) as MockRes;
      expect(res.status).toBe(400);
      expect(mockProviderUpsert).not.toHaveBeenCalled();
    });

    it("落库的 apiKey 为 v1: 密文且 != 明文；响应掩码、hasKey true", async () => {
      const plainKey = "sk-demo-key-1234567890abcdef";
      // upsert 返回落库后的行（apiKey 为密文）
      let captured: Record<string, unknown> = {};
      mockProviderUpsert.mockImplementation(async (args: any) => {
        captured = args;
        return {
          id: "cfg-new",
          tenantId: ownerAuth.tenantId,
          userId: ownerAuth.userId,
          name: "openai",
          provider: "openai",
          apiKey: args.create?.apiKey ?? args.update?.apiKey ?? null,
          baseUrl: null,
          model: null,
          isDefault: false,
          isEnabled: true,
          config: null,
          priority: 0,
          quotaUsed: 0,
          lastUsedAt: null,
          updatedAt: new Date(),
        };
      });

      const res = (await POST(makePostRequest({ provider: "openai", apiKey: plainKey }))) as MockRes;
      // create.apiKey 为密文
      const createApiKey = (captured as { create?: { apiKey?: string | null } }).create?.apiKey;
      expect(typeof createApiKey).toBe("string");
      expect(createApiKey!.startsWith("v1:")).toBe(true);
      expect(createApiKey).not.toBe(plainKey);
      expect(createApiKey).not.toContain(plainKey);
      // update.apiKey 同样为密文（显式传了 apiKey）
      const updateApiKey = (captured as { update?: { apiKey?: string | null } }).update?.apiKey;
      expect(updateApiKey).toBe(createApiKey);
      // 响应掩码
      const body = res.body as { config: { apiKey: string | null; hasKey: boolean } };
      expect(body.config.apiKey).toBe(`${plainKey.slice(0, 6)}****${plainKey.slice(-4)}`);
      expect(body.config.hasKey).toBe(true);
    });

    it("未传 apiKey 时 update 不覆盖既有 key，create 落库 null", async () => {
      let captured: Record<string, unknown> = {};
      mockProviderUpsert.mockImplementation(async (args: any) => {
        captured = args;
        return { id: "cfg-x", apiKey: null, name: "openai", provider: "openai" };
      });

      await POST(makePostRequest({ provider: "openai", model: "gpt-4o" }));

      const update = (captured as { update?: Record<string, unknown> }).update;
      const create = (captured as { create?: Record<string, unknown> }).create;
      expect(update).not.toHaveProperty("apiKey");
      expect(create?.apiKey).toBeNull();
    });

    it("空字符串 apiKey 落库为 null（不加密空值）", async () => {
      let captured: Record<string, unknown> = {};
      mockProviderUpsert.mockImplementation(async (args: any) => {
        captured = args;
        return { id: "cfg-y", apiKey: null, name: "openai", provider: "openai" };
      });

      await POST(makePostRequest({ provider: "openai", apiKey: "" }));

      const update = (captured as { update?: Record<string, unknown> }).update;
      expect(update?.apiKey).toBeNull();
    });

    it("upsert 抛错时返回 500", async () => {
      mockProviderUpsert.mockRejectedValue(new Error("db down"));
      const res = (await POST(makePostRequest({ provider: "openai", apiKey: "sk-demo" }))) as MockRes;
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("缺 name 与 provider 时返回 400", async () => {
      const res = (await DELETE(makeDeleteRequest())) as MockRes;
      expect(res.status).toBe(400);
      expect(mockProviderDeleteMany).not.toHaveBeenCalled();
    });

    it("按 name 以 tenantId/userId 作用域删除", async () => {
      mockProviderDeleteMany.mockResolvedValue({ count: 1 });
      const res = (await DELETE(makeDeleteRequest("?name=openai"))) as MockRes;
      expect(mockProviderDeleteMany).toHaveBeenCalledWith({
        where: { userId: ownerAuth.userId, tenantId: ownerAuth.tenantId, name: "openai" },
      });
      const body = res.body as { success: boolean };
      expect(body.success).toBe(true);
    });

    it("按 provider 以 tenantId/userId 作用域删除", async () => {
      mockProviderDeleteMany.mockResolvedValue({ count: 2 });
      await DELETE(makeDeleteRequest("?provider=openai"));
      expect(mockProviderDeleteMany).toHaveBeenCalledWith({
        where: { userId: ownerAuth.userId, tenantId: ownerAuth.tenantId, provider: "openai" },
      });
    });
  });
});
