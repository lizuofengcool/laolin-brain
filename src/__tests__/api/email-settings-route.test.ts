/**
 * email/settings 路由 handler 级集成测试
 *
 * 锁定第一百八十轮"邮件设置按租户加密落库 + 不污染全局单例"在路由层的行为：
 *   - GET：未认证 401 透传；非 owner/admin 403；租户有 DB 配置 → 返回 maskEmailConfig 结果
 *     （脱敏不含 pass）；租户无配置 → 回退 env（只读），configured 按 env 三要素判断；
 *     getEmailConfig 以 auth.tenantId 调用（租户作用域）；getEmailConfig 抛错 500。
 *   - POST：未认证 401；非 owner/admin 403；缺 host/user/pass 400；成功 → saveEmailConfig 以
 *     auth.tenantId + 解析后 config 调用、emailService.invalidateTenant 清缓存、activityLog.create
 *     记录、响应脱敏（无 pass 字段）；saveEmailConfig 抛错 500 且不记日志。
 *
 * Mock 策略：next/server / api-auth / email / email/settings-store / db 全部隔离，不触达真实
 * 加密与数据库；maskEmailConfig 返回固定脱敏对象，便于断言"无 pass"。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockInvalidateTenant,
  mockGetEmailConfig,
  mockSaveEmailConfig,
  mockMaskEmailConfig,
  mockActivityLogCreate,
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
    mockInvalidateTenant: vi.fn(),
    mockGetEmailConfig: vi.fn(),
    mockSaveEmailConfig: vi.fn(),
    mockMaskEmailConfig: vi.fn(),
    mockActivityLogCreate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/email", () => ({
  emailService: { invalidateTenant: (...args: unknown[]) => mockInvalidateTenant(...args) },
}));
vi.mock("@/lib/email/settings-store", () => ({
  getEmailConfig: (...args: unknown[]) => mockGetEmailConfig(...args),
  saveEmailConfig: (...args: unknown[]) => mockSaveEmailConfig(...args),
  maskEmailConfig: (...args: unknown[]) => mockMaskEmailConfig(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    activityLog: { create: (...args: unknown[]) => mockActivityLogCreate(...args) },
  },
}));

import { GET, POST } from "@/app/api/email/settings/route";

const tenantConfig = {
  host: "smtp.tenant.com",
  port: 465,
  secure: true,
  user: "tenant@smtp.com",
  pass: "tenant-secret-pass",
  from: "noreply@tenant.com",
  fromName: "租户团队",
};

// maskEmailConfig 的脱敏契约：返回所有非敏感字段 + hasPass，不含 pass
const masked = {
  configured: true,
  host: tenantConfig.host,
  port: tenantConfig.port,
  secure: tenantConfig.secure,
  user: tenantConfig.user,
  from: tenantConfig.from,
  fromName: tenantConfig.fromName,
  hasPass: true,
};

function makeGetRequest(): NextRequest {
  return new Request("http://localhost/api/email/settings") as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/email/settings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("email/settings 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockMaskEmailConfig.mockReturnValue(masked);
    mockSaveEmailConfig.mockResolvedValue(undefined);
    mockInvalidateTenant.mockReturnValue(undefined);
    mockActivityLogCreate.mockResolvedValue({});
  });

  describe("GET /api/email/settings", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );
      const res = (await GET(makeGetRequest())) as MockRes;
      expect(res.status).toBe(401);
      expect(mockGetEmailConfig).not.toHaveBeenCalled();
    });

    it("非 owner/admin → 403，不读 DB", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-1",
        email: "member@example.com",
        tenantId: "tenant-1",
        role: "member",
      });
      const res = (await GET(makeGetRequest())) as MockRes;
      expect(res.status).toBe(403);
      expect((res.body as { error: string }).error).toBe("没有权限管理邮件设置");
      expect(mockGetEmailConfig).not.toHaveBeenCalled();
    });

    it("租户有 DB 配置 → 返回 maskEmailConfig 结果，按 auth.tenantId 查询", async () => {
      mockGetEmailConfig.mockResolvedValue(tenantConfig);
      const res = (await GET(makeGetRequest())) as MockRes;
      expect(res.status).toBe(200);
      expect(mockGetEmailConfig).toHaveBeenCalledTimes(1);
      expect(mockGetEmailConfig).toHaveBeenCalledWith("tenant-1");
      const body = res.body as { success: boolean; data: typeof masked };
      expect(body.success).toBe(true);
      expect(body.data).toEqual(masked);
      // 脱敏契约：响应 data 不含 pass
      expect((body.data as Record<string, unknown>).pass).toBeUndefined();
    });

    it("租户无 DB 配置 → 回退 env（只读），configured 按 env 三要素判断", async () => {
      mockGetEmailConfig.mockResolvedValue(null);
      const saved: NodeJS.ProcessEnv = { ...process.env };
      process.env.SMTP_HOST = "env.smtp.com";
      process.env.SMTP_USER = "env@user.com";
      process.env.SMTP_PASS = "env-pass";
      process.env.SMTP_PORT = "2525";
      process.env.SMTP_SECURE = "true";
      process.env.SMTP_FROM = "env@from.com";
      process.env.SMTP_FROM_NAME = "ENV 团队";
      try {
        const res = (await GET(makeGetRequest())) as MockRes;
        expect(res.status).toBe(200);
        const data = (res.body as { data: Record<string, unknown> }).data;
        expect(data.configured).toBe(true);
        expect(data.host).toBe("env.smtp.com");
        expect(data.port).toBe(2525);
        expect(data.secure).toBe(true);
        expect(data.user).toBe("env@user.com");
        expect(data.from).toBe("env@from.com");
        expect(data.fromName).toBe("ENV 团队");
        expect(data.hasPass).toBe(true);
        expect(data.pass).toBeUndefined();
      } finally {
        process.env = saved;
      }
    });

    it("租户无配置且 env 缺失 → configured=false，port 回退 587、from 回退 user", async () => {
      mockGetEmailConfig.mockResolvedValue(null);
      const saved: NodeJS.ProcessEnv = { ...process.env };
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_SECURE;
      delete process.env.SMTP_FROM;
      delete process.env.SMTP_FROM_NAME;
      try {
        const res = (await GET(makeGetRequest())) as MockRes;
        const data = (res.body as { data: Record<string, unknown> }).data;
        expect(data.configured).toBe(false);
        expect(data.port).toBe(587);
        expect(data.secure).toBe(false);
        expect(data.fromName).toBe("个人私有第二大脑");
        expect(data.hasPass).toBe(false);
      } finally {
        process.env = saved;
      }
    });

    it("getEmailConfig 抛错 → 500", async () => {
      mockGetEmailConfig.mockRejectedValue(new Error("db down"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = (await GET(makeGetRequest())) as MockRes;
      expect(res.status).toBe(500);
      expect((res.body as { error: string }).error).toBe("获取邮件设置失败");
      errSpy.mockRestore();
    });
  });

  describe("POST /api/email/settings", () => {
    const validBody = {
      host: "smtp.new.com",
      port: 587,
      secure: false,
      user: "new@user.com",
      pass: "new-pass",
      from: "noreply@new.com",
      fromName: "新团队",
    };

    it("未认证 → 401 透传", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );
      const res = (await POST(makePostRequest(validBody))) as MockRes;
      expect(res.status).toBe(401);
      expect(mockSaveEmailConfig).not.toHaveBeenCalled();
    });

    it("非 owner/admin → 403", async () => {
      mockAuthenticate.mockResolvedValue({
        userId: "user-1",
        email: "admin@example.com",
        tenantId: "tenant-1",
        role: "member",
      });
      const res = (await POST(makePostRequest(validBody))) as MockRes;
      expect(res.status).toBe(403);
      expect(mockSaveEmailConfig).not.toHaveBeenCalled();
    });

    it("缺 host → 400，不落库不清缓存", async () => {
      const res = (await POST(
        makePostRequest({ ...validBody, host: "" })
      )) as MockRes;
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe(
        "SMTP服务器地址、用户名和密码不能为空"
      );
      expect(mockSaveEmailConfig).not.toHaveBeenCalled();
      expect(mockInvalidateTenant).not.toHaveBeenCalled();
    });

    it("缺 user → 400", async () => {
      const res = (await POST(
        makePostRequest({ ...validBody, user: "" })
      )) as MockRes;
      expect(res.status).toBe(400);
    });

    it("缺 pass → 400", async () => {
      const res = (await POST(
        makePostRequest({ ...validBody, pass: "" })
      )) as MockRes;
      expect(res.status).toBe(400);
    });

    it("成功 → saveEmailConfig 以 tenantId + 解析后 config 调用、清缓存、记日志、响应脱敏无 pass", async () => {
      const res = (await POST(makePostRequest(validBody))) as MockRes;
      expect(res.status).toBe(200);
      const body = res.body as { success: boolean; message: string; data: typeof masked };
      expect(body.success).toBe(true);
      expect(body.message).toBe("邮件设置已更新");

      // saveEmailConfig 入参：tenantId + config（port 数字、secure 布尔、from 回退、fromName 默认）
      expect(mockSaveEmailConfig).toHaveBeenCalledTimes(1);
      const [tenantArg, configArg] = mockSaveEmailConfig.mock.calls[0];
      expect(tenantArg).toBe("tenant-1");
      expect(configArg).toMatchObject({
        host: "smtp.new.com",
        port: 587,
        secure: false,
        user: "new@user.com",
        pass: "new-pass",
        from: "noreply@new.com",
        fromName: "新团队",
      });

      // 清缓存
      expect(mockInvalidateTenant).toHaveBeenCalledTimes(1);
      expect(mockInvalidateTenant).toHaveBeenCalledWith("tenant-1");

      // 活动日志（不含 pass，仅 host/port/user）
      expect(mockActivityLogCreate).toHaveBeenCalledTimes(1);
      const logData = mockActivityLogCreate.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(logData.data.tenantId).toBe("tenant-1");
      expect(logData.data.userId).toBe("user-1");
      expect(logData.data.action).toBe("email_settings_updated");
      expect(logData.data.details).toBe(
        JSON.stringify({ host: "smtp.new.com", port: 587, user: "new@user.com" })
      );

      // 响应脱敏
      expect(body.data).toEqual(masked);
      expect((body.data as Record<string, unknown>).pass).toBeUndefined();
    });

    it("from/fromName 缺失时回退（from→user，fromName→默认）", async () => {
      const res = (await POST(
        makePostRequest({
          host: "smtp.x.com",
          port: "465",
          secure: "true",
          user: "u@x.com",
          pass: "p",
        })
      )) as MockRes;
      expect(res.status).toBe(200);
      const [, configArg] = mockSaveEmailConfig.mock.calls[0];
      expect(configArg.from).toBe("u@x.com");
      expect(configArg.fromName).toBe("个人私有第二大脑");
      expect(configArg.port).toBe(465);
      expect(configArg.secure).toBe(true);
    });

    it("saveEmailConfig 抛错 → 500，不记活动日志", async () => {
      mockSaveEmailConfig.mockRejectedValue(new Error("db write fail"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = (await POST(makePostRequest(validBody))) as MockRes;
      expect(res.status).toBe(500);
      expect((res.body as { error: string }).error).toBe("更新邮件设置失败");
      expect(mockActivityLogCreate).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("活动日志记录失败不影响成功响应（fire-and-forget 吞错）", async () => {
      mockActivityLogCreate.mockRejectedValue(new Error("log fail"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = (await POST(makePostRequest(validBody))) as MockRes;
      expect(res.status).toBe(200);
      expect(mockSaveEmailConfig).toHaveBeenCalledTimes(1);
      errSpy.mockRestore();
    });
  });
});
