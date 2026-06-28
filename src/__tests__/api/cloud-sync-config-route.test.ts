/**
 * cloud-sync/config 路由 handler 级集成测试
 *
 * 锁定第二十八轮 storageConfig.config 落库加密在路由层的行为：
 *   - GET：未认证 401 透传；configured 按 auth.tenantId 查询（租户作用域）；DB 异常 500
 *   - POST：未认证 401 透传；非 owner/admin 403；zod 校验失败 400；
 *     testR2Connection 以明文 config 调用且失败时 400 且不落库；
 *     成功时 encryptConfig 以明文 config 调用，storageConfig.upsert 的 config 字段为加密值
 *     （不含明文 secretAccessKey），tenant.storageProvider 切换为 r2，二者在同一 $transaction；
 *     $transaction 抛错时 500。
 *
 * Mock 策略：authenticateRequest / r2-storage / config-crypto / db / next/server 全部隔离，
 * 不触达真实网络与数据库；zod 保持真实运行以覆盖校验路径。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

// vi.hoisted：共享 MockNextResponse 类，使路由的 `auth instanceof NextResponse`
// 与 mock 的 authenticateRequest 返回值共用同一构造器（instanceof 必须命中）。
const {
  MockNextResponse,
  mockAuthenticate,
  mockIsR2Configured,
  mockTestR2Connection,
  mockEncryptConfig,
  mockStorageConfigUpsert,
  mockTenantUpdate,
  mockTransaction,
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
    mockIsR2Configured: vi.fn(),
    mockTestR2Connection: vi.fn(),
    mockEncryptConfig: vi.fn(),
    mockStorageConfigUpsert: vi.fn(),
    mockTenantUpdate: vi.fn(),
    mockTransaction: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/cloud-sync/r2-storage", () => ({
  isR2Configured: (...args: unknown[]) => mockIsR2Configured(...args),
  testR2Connection: (...args: unknown[]) => mockTestR2Connection(...args),
}));
vi.mock("@/lib/cloud-sync/config-crypto", () => ({
  encryptConfig: (...args: unknown[]) => mockEncryptConfig(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    storageConfig: { upsert: (...args: unknown[]) => mockStorageConfigUpsert(...args) },
    tenant: { update: (...args: unknown[]) => mockTenantUpdate(...args) },
  },
}));

import { GET, POST } from "@/app/api/cloud-sync/config/route";

const sampleConfig = {
  accountId: "acc-1",
  accessKeyId: "AKIAEXAMPLEKEY",
  secretAccessKey: "super-secret-key-do-not-leak",
  bucketName: "bucket-1",
};

function makeGetRequest(): NextRequest {
  return new Request("http://localhost/api/cloud-sync/config") as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/cloud-sync/config", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("cloud-sync/config 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 authenticateRequest 成功返回 owner 身份；逐用例按需覆盖
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    // 默认加密返回固定串，便于断言落库值
    mockEncryptConfig.mockReturnValue("v1:mock-encrypted-payload");
    // 默认 upsert/update 返回占位结果，避免 $transaction 数组构造抛错
    mockStorageConfigUpsert.mockResolvedValue({ id: "sc-1" });
    mockTenantUpdate.mockResolvedValue({ id: "tenant-1" });
    mockTransaction.mockResolvedValue([{ id: "sc-1" }, { id: "tenant-1" }]);
  });

  describe("GET /api/cloud-sync/config", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockIsR2Configured).not.toHaveBeenCalled();
    });

    it("已配置 → 200 { configured: true }，isR2Configured 以 auth.tenantId 调用", async () => {
      mockIsR2Configured.mockResolvedValue(true);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ configured: true });
      expect(mockIsR2Configured).toHaveBeenCalledWith("tenant-1");
    });

    it("未配置 → 200 { configured: false }", async () => {
      mockIsR2Configured.mockResolvedValue(false);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ configured: false });
    });

    it("isR2Configured 抛错 → 500", async () => {
      mockIsR2Configured.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取云同步配置失败" });
    });
  });

  describe("POST /api/cloud-sync/config", () => {
    it("未认证 → 401 透传", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await POST(makePostRequest(sampleConfig))) as MockRes;

      expect(res.status).toBe(401);
      expect(mockTestR2Connection).not.toHaveBeenCalled();
      expect(mockStorageConfigUpsert).not.toHaveBeenCalled();
    });

    it("非 owner/admin（member）→ 403，不触达连接测试与落库", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-2",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });

      const res = (await POST(makePostRequest(sampleConfig))) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.stringContaining("owner/admin") });
      expect(mockTestR2Connection).not.toHaveBeenCalled();
      expect(mockEncryptConfig).not.toHaveBeenCalled();
      expect(mockStorageConfigUpsert).not.toHaveBeenCalled();
    });

    it("body 缺字段（zod 校验失败）→ 400，不触达连接测试与落库", async () => {
      const bad = { accountId: "acc-1", accessKeyId: "k", bucketName: "b" }; // 缺 secretAccessKey

      const res = (await POST(makePostRequest(bad))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "配置格式无效" });
      expect(mockTestR2Connection).not.toHaveBeenCalled();
      expect(mockEncryptConfig).not.toHaveBeenCalled();
      expect(mockStorageConfigUpsert).not.toHaveBeenCalled();
    });

    it("testR2Connection 返回 false → 400，以明文 config 调用且不落库", async () => {
      mockTestR2Connection.mockResolvedValue(false);

      const res = (await POST(makePostRequest(sampleConfig))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: expect.stringContaining("R2") });
      // 连接测试须以明文配置调用，而非加密值
      expect(mockTestR2Connection).toHaveBeenCalledWith(sampleConfig);
      expect(mockEncryptConfig).not.toHaveBeenCalled();
      expect(mockStorageConfigUpsert).not.toHaveBeenCalled();
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it("admin 角色亦允许配置（与 owner 同权）", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-3",
        email: "admin@example.com",
        tenantId: "tenant-1",
        role: "admin",
      });
      mockTestR2Connection.mockResolvedValue(true);

      const res = (await POST(makePostRequest(sampleConfig))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
    });

    it("成功 → 加密落库 + 切换 storageProvider=r2，二者在同一 $transaction", async () => {
      mockTestR2Connection.mockResolvedValue(true);

      const res = (await POST(makePostRequest(sampleConfig))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "云同步配置成功，连接测试通过" });

      // 连接测试以明文配置调用
      expect(mockTestR2Connection).toHaveBeenCalledWith(sampleConfig);
      // 加密以明文配置调用
      expect(mockEncryptConfig).toHaveBeenCalledWith(sampleConfig);

      // upsert 落库的 config 字段为加密值，且不含明文敏感字段
      expect(mockStorageConfigUpsert).toHaveBeenCalledTimes(1);
      const upsertArg = mockStorageConfigUpsert.mock.calls[0][0] as {
        where: { tenantId_provider: { tenantId: string; provider: string } };
        create: { tenantId: string; provider: string; config: string; isDefault: boolean };
        update: { config: string; isDefault: boolean };
      };
      expect(upsertArg.where.tenantId_provider).toEqual({ tenantId: "tenant-1", provider: "r2" });
      expect(upsertArg.create.config).toBe("v1:mock-encrypted-payload");
      expect(upsertArg.update.config).toBe("v1:mock-encrypted-payload");
      expect(upsertArg.create.config).not.toContain(sampleConfig.secretAccessKey);
      expect(upsertArg.create.tenantId).toBe("tenant-1");
      expect(upsertArg.create.provider).toBe("r2");
      expect(upsertArg.create.isDefault).toBe(true);

      // tenant.storageProvider 切换为 r2
      expect(mockTenantUpdate).toHaveBeenCalledTimes(1);
      const updateArg = mockTenantUpdate.mock.calls[0][0] as {
        where: { id: string };
        data: { storageProvider: string };
      };
      expect(updateArg.where).toEqual({ id: "tenant-1" });
      expect(updateArg.data).toEqual({ storageProvider: "r2" });

      // 两者在同一事务
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.mock.calls[0][0]).toHaveLength(2);
    });

    it("$transaction 抛错 → 500", async () => {
      mockTestR2Connection.mockResolvedValue(true);
      mockTransaction.mockRejectedValue(new Error("tx failed"));

      const res = (await POST(makePostRequest(sampleConfig))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "配置云同步失败" });
    });
  });
});
