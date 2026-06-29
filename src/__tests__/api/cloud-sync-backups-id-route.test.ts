/**
 * cloud-sync/backups/[id] 路由 handler 级集成测试
 *
 * 锁定动态路由 [id] 的两层契约：
 *   - POST（恢复备份）：未认证 401 透传；isR2Configured 校验先于 zod 校验（R2 未配置 → 400
 *     不触达 zod）；zod password min 1 → 400 { error: "请求格式无效", details }；
 *     成功 → downloadAndRestoreBackup(auth.tenantId, auth.userId, backupId, password)
 *     返回 { success, message, restored, skipped }；backupId 来自 params.id，body 中
 *     可伪造的 tenantId/userId 一律忽略；downloadAndRestoreBackup 抛错 → 500（取
 *     error.message，与 backups 主路由 POST 一致、与 status/sync/queue/conflicts
 *     的三元 fallback 不同——本路由族用拼字符串风格）。
 *   - DELETE（删除备份）：未认证 401 透传；isR2Configured 未配置 → 400；成功 →
 *     deleteBackup(auth.tenantId, backupId)（无 userId 入参，DELETE 不取 userId）；
 *     deleteBackup 抛错 → 500（取 error.message）。
 *
 * Mock 策略：authenticateRequest / sync-engine / r2-storage / next/server 全部隔离；
 * zod 保持真实运行以覆盖校验路径。params 以 Promise.resolve 提供，对齐 Next.js 16
 * 动态路由签名（params: Promise<{ id: string }>）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockIsR2Configured,
  mockDownloadAndRestoreBackup,
  mockDeleteBackup,
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
    mockDownloadAndRestoreBackup: vi.fn(),
    mockDeleteBackup: vi.fn(),
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
  downloadAndRestoreBackup: (...args: unknown[]) => mockDownloadAndRestoreBackup(...args),
  deleteBackup: (...args: unknown[]) => mockDeleteBackup(...args),
}));

import { POST, DELETE } from "@/app/api/cloud-sync/backups/[id]/route";

function makePostRequest(id: string, body: unknown): NextRequest {
  return new Request(`http://localhost/api/cloud-sync/backups/${id}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeDeleteRequest(id: string): NextRequest {
  return new Request(`http://localhost/api/cloud-sync/backups/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("cloud-sync/backups/[id] 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockIsR2Configured.mockResolvedValue(true);
    mockDownloadAndRestoreBackup.mockResolvedValue({
      restored: 7,
      skipped: 2,
    });
    mockDeleteBackup.mockResolvedValue(undefined);
  });

  describe("POST /api/cloud-sync/backups/[id] — 恢复备份", () => {
    it("未认证 → 401 透传，不触达 isR2Configured 与 downloadAndRestoreBackup", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(401);
      expect(mockIsR2Configured).not.toHaveBeenCalled();
      expect(mockDownloadAndRestoreBackup).not.toHaveBeenCalled();
    });

    it("R2 未配置 → 400，先于 zod 校验，不触达 downloadAndRestoreBackup", async () => {
      mockIsR2Configured.mockResolvedValue(false);

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "云同步未配置，请先配置 Cloudflare R2" });
      expect(mockDownloadAndRestoreBackup).not.toHaveBeenCalled();
    });

    it("R2 未配置 + password 也非法（缺失）→ 仍 400 R2 错误（R2 校验先于 zod）", async () => {
      mockIsR2Configured.mockResolvedValue(false);

      const res = (await POST(makePostRequest("backup-99", {}), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(400);
      // R2 校验先于 zod，故返 R2 错误而非 zod 错误
      expect(res.body).toEqual({ error: "云同步未配置，请先配置 Cloudflare R2" });
    });

    it("R2 已配置 + password 缺失 → 400 zod（min 1），不触达 downloadAndRestoreBackup", async () => {
      const res = (await POST(makePostRequest("backup-99", {}), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "请求格式无效" });
      expect(res.body).toHaveProperty("details");
      expect(mockDownloadAndRestoreBackup).not.toHaveBeenCalled();
    });

    it("R2 已配置 + password 为空字符串 → 400 zod（min 1 拒绝空串）", async () => {
      const res = (await POST(makePostRequest("backup-99", { password: "" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "请求格式无效" });
      expect(mockDownloadAndRestoreBackup).not.toHaveBeenCalled();
    });

    it("成功 → 200，downloadAndRestoreBackup 以 (auth.tenantId, auth.userId, backupId, password) 调用，backupId 取自 params.id", async () => {
      const result = { restored: 5, skipped: 1 };
      mockDownloadAndRestoreBackup.mockResolvedValue(result);

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "备份恢复成功",
        restored: 5,
        skipped: 1,
      });
      // backupId 来自 params.id，不来自 body
      expect(mockDownloadAndRestoreBackup).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "backup-99",
        "secret"
      );
    });

    it("body 中伪造 tenantId/userId/backupId 一律忽略，downloadAndRestoreBackup 仍以 auth 身份 + params.id 调用", async () => {
      await POST(
        makePostRequest("backup-99", {
          password: "secret",
          tenantId: "tenant-evil",
          userId: "user-evil",
          id: "backup-evil",
        }),
        { params: Promise.resolve({ id: "backup-99" }) }
      );

      // auth 身份 + params.id 优先，body 中的 tenantId/userId/id 全部忽略
      expect(mockDownloadAndRestoreBackup).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "backup-99",
        "secret"
      );
      expect(mockDownloadAndRestoreBackup).not.toHaveBeenCalledWith(
        "tenant-evil",
        "user-evil",
        "backup-evil",
        "secret"
      );
    });

    it("downloadAndRestoreBackup 抛错 → 500，message 取 error.message（与 backups 主路由 POST 同拼字符串风格）", async () => {
      mockDownloadAndRestoreBackup.mockRejectedValue(new Error("r2 download failed"));

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(500);
      // POST catch 块拼接 error.message
      expect(res.body).toEqual({ error: "恢复备份失败：r2 download failed" });
    });
  });

  describe("DELETE /api/cloud-sync/backups/[id] — 删除备份", () => {
    it("未认证 → 401 透传，不触达 isR2Configured 与 deleteBackup", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效" }, { status: 401 })
      );

      const res = (await DELETE(makeDeleteRequest("backup-99"), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(401);
      expect(mockIsR2Configured).not.toHaveBeenCalled();
      expect(mockDeleteBackup).not.toHaveBeenCalled();
    });

    it("R2 未配置 → 400，isR2Configured 以 auth.tenantId 调用，不触达 deleteBackup", async () => {
      mockIsR2Configured.mockResolvedValue(false);

      const res = (await DELETE(makeDeleteRequest("backup-99"), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "云同步未配置，请先配置 Cloudflare R2" });
      expect(mockIsR2Configured).toHaveBeenCalledWith("tenant-1");
      expect(mockDeleteBackup).not.toHaveBeenCalled();
    });

    it("成功 → 200，deleteBackup 以 (auth.tenantId, backupId) 调用，无 userId 入参", async () => {
      const res = (await DELETE(makeDeleteRequest("backup-99"), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "备份删除成功",
      });
      // DELETE 仅传 tenantId + backupId，不传 userId（与 POST 的 4 参签名不同）
      expect(mockDeleteBackup).toHaveBeenCalledWith("tenant-1", "backup-99");
      expect(mockDeleteBackup).not.toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "backup-99"
      );
    });

    it("deleteBackup 抛错 → 500，message 取 error.message（与 POST 同拼字符串风格）", async () => {
      mockDeleteBackup.mockRejectedValue(new Error("r2 delete failed"));

      const res = (await DELETE(makeDeleteRequest("backup-99"), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "删除备份失败：r2 delete failed" });
    });
  });
});
