/**
 * cloud-sync/backups/[id] 路由 handler 级集成测试
 *
 * 锁定动态路由 [id] 的两层契约：
 *   - POST（恢复备份）：未认证 401 透传；isR2Configured 校验先于 zod 校验（R2 未配置 → 400
 *     不触达 zod）；zod password min 1 → 400 { error: "请求格式无效", details }；
 *     成功 → downloadAndRestoreBackup(auth.tenantId, auth.userId, backupId, password)
 *     返回 { success, message, restored, skipped }；backupId 来自 params.id，body 中
 *     可伪造的 tenantId/userId 一律忽略；downloadAndRestoreBackup 抛错按错误类型分流：
 *     存储层 NoSuchKey/NotFound/404 → 404 { error: "备份不存在" }；GCM 解密认证失败
 *     （密码错误）→ 401 { error: "加密密码错误" }；其余通用错误 → 500（取 error.message，
 *     与 backups 主路由 POST 一致、与 status/sync/queue/conflicts 的三元 fallback
 *     不同——本路由族用拼字符串风格）。
 *   - DELETE（删除备份）：未认证 401 透传；isR2Configured 未配置 → 400；成功 →
 *     deleteBackup(auth.tenantId, backupId)（无 userId 入参，DELETE 不取 userId）；
 *     deleteBackup 抛存储层 NoSuchKey/NotFound/404 → 404 { error: "备份不存在" }；
 *     其余通用错误 → 500（取 error.message）。
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

    it("downloadAndRestoreBackup 抛通用错误 → 500，message 取 error.message（与 backups 主路由 POST 同拼字符串风格）", async () => {
      mockDownloadAndRestoreBackup.mockRejectedValue(new Error("r2 download failed"));

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(500);
      // POST catch 块拼接 error.message
      expect(res.body).toEqual({ error: "恢复备份失败：r2 download failed" });
    });

    it("downloadAndRestoreBackup 抛存储层 NoSuchKey（R2/S3 name 字段）→ 404 { error: '备份不存在' }", async () => {
      const notFound = new Error("The specified key does not exist.");
      notFound.name = "NoSuchKey";
      mockDownloadAndRestoreBackup.mockRejectedValue(notFound);

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "备份不存在" });
    });

    it("downloadAndRestoreBackup 抛存储层 $metadata.httpStatusCode=404（S3 SDK 风格）→ 404", async () => {
      const notFound = new Error("Not Found");
      notFound.name = "NotFound";
      (notFound as unknown as { $metadata: { httpStatusCode: number } }).$metadata = {
        httpStatusCode: 404,
      };
      mockDownloadAndRestoreBackup.mockRejectedValue(notFound);

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "备份不存在" });
    });

    it("downloadAndRestoreBackup 抛存储层 Aliyun OSS code=NoSuchKey → 404", async () => {
      const notFound = new Error("NoSuchKey");
      (notFound as unknown as { code: string }).code = "NoSuchKey";
      (notFound as unknown as { status: number }).status = 404;
      mockDownloadAndRestoreBackup.mockRejectedValue(notFound);

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "备份不存在" });
    });

    it("downloadAndRestoreBackup 抛 GCM 认证失败（code=ERR_CRYPTO_AUTHENTICATION_FAILED，密码错误）→ 401 { error: '加密密码错误' }", async () => {
      const decryptError = new Error(
        "Unsupported state or unable to authenticate data"
      );
      (decryptError as unknown as { code: string }).code =
        "ERR_CRYPTO_AUTHENTICATION_FAILED";
      mockDownloadAndRestoreBackup.mockRejectedValue(decryptError);

      const res = (await POST(makePostRequest("backup-99", { password: "wrong-pw" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "加密密码错误" });
    });

    it("downloadAndRestoreBackup 抛 GCM 认证失败（旧版 Node 无 code，仅 message 子串）→ 401", async () => {
      // 旧版 Node 的 decipher.final() 抛 Error 不带 code，仅 message 含认证失败短语
      const decryptError = new Error(
        "Unsupported state or unable to authenticate data"
      );
      mockDownloadAndRestoreBackup.mockRejectedValue(decryptError);

      const res = (await POST(makePostRequest("backup-99", { password: "wrong-pw" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "加密密码错误" });
    });

    it("downloadAndRestoreBackup 抛校验和失败（解密成功但数据损坏，非密码错误）→ 500（非 401）", async () => {
      // 解密成功（密码正确）但 checksum 不匹配，属数据完整性问题，不归 401
      mockDownloadAndRestoreBackup.mockRejectedValue(
        new Error("备份数据校验失败，数据可能已损坏或密码错误")
      );

      const res = (await POST(makePostRequest("backup-99", { password: "secret" }), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: "恢复备份失败：备份数据校验失败，数据可能已损坏或密码错误",
      });
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

    it("deleteBackup 抛通用错误 → 500，message 取 error.message（与 POST 同拼字符串风格）", async () => {
      mockDeleteBackup.mockRejectedValue(new Error("r2 delete failed"));

      const res = (await DELETE(makeDeleteRequest("backup-99"), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "删除备份失败：r2 delete failed" });
    });

    it("deleteBackup 抛存储层 NoSuchKey/NotFound/404 → 404 { error: '备份不存在' }（防御个别 SDK 抛错场景）", async () => {
      // R2/S3/OSS 的 deleteObject 对不存在的 key 通常幂等不抛错，
      // 但个别 SDK/配置下可能抛 NoSuchKey，路由应映射为 404 而非 500。
      const notFound = new Error("The specified key does not exist.");
      notFound.name = "NoSuchKey";
      (notFound as unknown as { $metadata: { httpStatusCode: number } }).$metadata = {
        httpStatusCode: 404,
      };
      mockDeleteBackup.mockRejectedValue(notFound);

      const res = (await DELETE(makeDeleteRequest("backup-99"), {
        params: Promise.resolve({ id: "backup-99" }),
      })) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "备份不存在" });
    });
  });
});
