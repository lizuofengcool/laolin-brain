/**
 * cloud-sync/sync 路由 handler 级集成测试
 *
 * 锁定 /api/cloud-sync/sync POST handler 的安全与控制流契约：
 *   - 未认证 → 401 透传，不触达 triggerSync
 *   - body 缺 password → 400 { error: '请提供加密密码' }，不触达 triggerSync
 *   - 成功 → triggerSync 以 (auth.tenantId, auth.userId, password) 调用，
 *     返回 { success: true, data: result }（result 即 triggerSync 返回值原样回传）
 *   - triggerSync 抛错 → 500 { error: <message> }
 *   - body.tenantId/userId 被忽略（可信身份只来自 auth），triggerSync 仍以 auth.tenantId/userId 调用
 *
 * Mock 策略：authenticateRequest / sync-engine / next/server 全部隔离，不触达真实数据库与对象存储。
 * 路由经服务层访问数据（无直接 db 依赖），故无需 mock @/lib/db。复用 cloud-sync-config-route
 * 与 saas-subscription-route 的 vi.hoisted + MockNextResponse 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockTriggerSync,
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
    mockTriggerSync: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/cloud-sync/sync-engine", () => ({
  triggerSync: (...args: unknown[]) => mockTriggerSync(...args),
}));

import { POST } from "@/app/api/cloud-sync/sync/route";

function makeRequest(body?: unknown): NextRequest {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost/api/cloud-sync/sync", init) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleResult = {
  uploaded: 5,
  downloaded: 3,
  conflicts: 1,
  errors: 0,
  total: 9,
};

describe("cloud-sync/sync 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockTriggerSync.mockResolvedValue(sampleResult);
  });

  describe("POST /api/cloud-sync/sync", () => {
    it("未认证 → 401 透传，不触达 triggerSync", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await POST(makeRequest({ password: "p@ssw0rd" }))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "令牌无效或已过期" });
      expect(mockTriggerSync).not.toHaveBeenCalled();
    });

    it("body 缺 password → 400 请提供加密密码，不触达 triggerSync", async () => {
      const res = (await POST(makeRequest({}))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "请提供加密密码" });
      expect(mockTriggerSync).not.toHaveBeenCalled();
    });

    it("body password 为空字符串 → 400（!password truthy 即拒）", async () => {
      const res = (await POST(makeRequest({ password: "" }))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "请提供加密密码" });
      expect(mockTriggerSync).not.toHaveBeenCalled();
    });

    it("成功 → triggerSync 以 (auth.tenantId, auth.userId, password) 调用，原样回传 result", async () => {
      const res = (await POST(makeRequest({ password: "p@ssw0rd" }))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: sampleResult });
      expect(mockTriggerSync).toHaveBeenCalledWith("tenant-1", "user-1", "p@ssw0rd");
    });

    it("body 带 tenantId/userId → triggerSync 仍以 auth.tenantId/userId 调用（忽略 body 注入）", async () => {
      const res = (await POST(
        makeRequest({ password: "p@ssw0rd", tenantId: "tenant-evil", userId: "user-evil" })
      )) as MockRes;

      expect(res.status).toBe(200);
      // 关键：triggerSync 用 auth.tenantId/userId，不取 body 注入值
      expect(mockTriggerSync).toHaveBeenCalledWith("tenant-1", "user-1", "p@ssw0rd");
    });

    it("triggerSync 抛错 → 500 { error: <message> }", async () => {
      mockTriggerSync.mockRejectedValue(new Error("r2 connection refused"));

      const res = (await POST(makeRequest({ password: "p@ssw0rd" }))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "r2 connection refused" });
    });
  });
});
