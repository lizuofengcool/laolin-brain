/**
 * cloud-sync/backups 路由 handler 级集成测试
 *
 * 锁定路由层契约：
 *   - GET：未认证 401 透传；isR2Configured 返 false → 400 且不触达 listBackups；
 *     isR2Configured 返 true → listBackups(auth.tenantId) 返回 { backups, total }；
 *     isR2Configured/listBackups 抛错 → 500（GET 用固定 message，不取 error.message）。
 *   - POST：未认证 401 透传；isR2Configured 校验先于 zod 校验（R2 未配置 → 400 不触达 zod）；
 *     zod 校验 password min 6 → 400 { error: "请求格式无效", details }；
 *     成功 → uploadBackup(auth.tenantId, auth.userId, password) 返回 { success, message, backup }；
 *     body 中可伪造的 tenantId/userId 一律忽略；uploadBackup 抛错 → 500（POST 取 error.message）。
 *
 * Mock 策略：authenticateRequest / sync-engine / r2-storage / next/server 全部隔离；
 * zod 保持真实运行以覆盖校验路径。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockIsR2Configured,
  mockListBackups,
  mockUploadBackup,
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
    mockListBackups: vi.fn(),
    mockUploadBackup: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/cloud-sync/r2-storage", () => ({
  isR2Configured: (...args: unknown[]) => mockIsR2Configured(...args),
}));
vi.mock("@/lib/cloud-sync/sync-engine", () => ({
  listBackups: (...args: unknown[]) => mockListBackups(...args),
  uploadBackup: (...args: unknown[]) => mockUploadBackup(...args),
}));

import { GET, POST } from "@/app/api/cloud-sync/backups/route";

function makeGetRequest(): NextRequest {
  return new Request("http://localhost/api/cloud-sync/backups") as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/cloud-sync/backups", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("cloud-sync/backups 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockIsR2Configured.mockResolvedValue(true);
    mockListBackups.mockResolvedValue([]);
    mockUploadBackup.mockResolvedValue({
      id: "backup-1",
      tenantId: "tenant-1",
      createdAt: new Date("2026-06-29T00:00:00Z"),
      size: 1024,
    });
  });

  describe("GET /api/cloud-sync/backups", () => {
    it("未认证 → 401 透传，不触达 isR2Configured 与 listBackups", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(mockIsR2Configured).not.toHaveBeenCalled();
      expect(mockListBackups).not.toHaveBeenCalled();
    });

    it("R2 未配置 → 400，isR2Configured 以 auth.tenantId 调用，listBackups 不触达", async () => {
      mockIsR2Configured.mockResolvedValue(false);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "云同步未配置，请先配置 Cloudflare R2" });
      expect(mockIsR2Configured).toHaveBeenCalledWith("tenant-1");
      expect(mockListBackups).not.toHaveBeenCalled();
    });

    it("R2 已配置 → 200，listBackups 以 auth.tenantId 调用，返回 { backups, total }", async () => {
      const backups = [
        { id: "b-1", tenantId: "tenant-1", createdAt: new Date(), size: 1024 },
        { id: "b-2", tenantId: "tenant-1", createdAt: new Date(), size: 2048 },
      ];
      mockListBackups.mockResolvedValue(backups);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ backups, total: 2 });
      expect(mockListBackups).toHaveBeenCalledWith("tenant-1");
    });

    it("isR2Configured 抛错 → 500，固定 message 不取 error.message", async () => {
      mockIsR2Configured.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      // GET catch 块用固定 message，不取 error.message
      expect(res.body).toEqual({ error: "获取备份列表失败" });
      expect(res.body).not.toEqual({ error: "db down" });
    });

    it("listBackups 抛错 → 500，固定 message 不取 error.message", async () => {
      mockListBackups.mockRejectedValue(new Error("r2 list failed"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取备份列表失败" });
    });
  });

  describe("POST /api/cloud-sync/backups", () => {
    it("未认证 → 401 透传，不触达 isR2Configured 与 uploadBackup", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效" }, { status: 401 })
      );

      const res = (await POST(makePostRequest({ password: "secret123" }))) as MockRes;

      expect(res.status).toBe(401);
      expect(mockIsR2Configured).not.toHaveBeenCalled();
      expect(mockUploadBackup).not.toHaveBeenCalled();
    });

    it("R2 未配置 → 400，先于 zod 校验，不触达 uploadBackup", async () => {
      mockIsR2Configured.mockResolvedValue(false);

      const res = (await POST(makePostRequest({ password: "secret123" }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "云同步未配置，请先配置 Cloudflare R2" });
      expect(mockUploadBackup).not.toHaveBeenCalled();
    });

    it("R2 未配置 + password 也非法 → 仍 400 R2 错误（R2 校验先于 zod）", async () => {
      mockIsR2Configured.mockResolvedValue(false);

      const res = (await POST(makePostRequest({ password: "x" }))) as MockRes;

      expect(res.status).toBe(400);
      // R2 校验先于 zod，故返 R2 错误而非 zod 错误
      expect(res.body).toEqual({ error: "云同步未配置，请先配置 Cloudflare R2" });
    });

    it("R2 已配置 + password 缺失 → 400 zod，不触达 uploadBackup", async () => {
      const res = (await POST(makePostRequest({}))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "请求格式无效" });
      expect(res.body).toHaveProperty("details");
      expect(mockUploadBackup).not.toHaveBeenCalled();
    });

    it("R2 已配置 + password 过短（< 6）→ 400 zod", async () => {
      const res = (await POST(makePostRequest({ password: "12345" }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "请求格式无效" });
      expect(mockUploadBackup).not.toHaveBeenCalled();
    });

    it("成功 → 200，uploadBackup 以 (auth.tenantId, auth.userId, password) 调用", async () => {
      const backup = {
        id: "backup-99",
        tenantId: "tenant-1",
        createdAt: new Date("2026-06-29T00:00:00Z"),
        size: 4096,
      };
      mockUploadBackup.mockResolvedValue(backup);

      const res = (await POST(makePostRequest({ password: "secret123" }))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "备份上传成功",
        backup,
      });
      expect(mockUploadBackup).toHaveBeenCalledWith("tenant-1", "user-1", "secret123");
    });

    it("body 中伪造 tenantId/userId 一律忽略，uploadBackup 仍以 auth 身份调用", async () => {
      await POST(
        makePostRequest({
          password: "secret123",
          tenantId: "tenant-evil",
          userId: "user-evil",
        })
      );

      expect(mockUploadBackup).toHaveBeenCalledWith("tenant-1", "user-1", "secret123");
      expect(mockUploadBackup).not.toHaveBeenCalledWith(
        "tenant-evil",
        "user-evil",
        "secret123"
      );
    });

    it("uploadBackup 抛错 → 500，message 取 error.message（POST 与 GET 错误格式不同）", async () => {
      mockUploadBackup.mockRejectedValue(new Error("r2 upload failed"));

      const res = (await POST(makePostRequest({ password: "secret123" }))) as MockRes;

      expect(res.status).toBe(500);
      // POST catch 块拼接 error.message，与 GET 的固定 message 不同
      expect(res.body).toEqual({ error: "创建备份失败：r2 upload failed" });
    });
  });
});
