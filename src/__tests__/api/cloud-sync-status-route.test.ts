/**
 * cloud-sync/status 路由 handler 级集成测试
 *
 * 锁定 /api/cloud-sync/status GET handler 的安全与控制流契约：
 *   - 未认证 → 401 透传，不触达任一 sync-engine 服务
 *   - 成功 → 依次顺序 await getSyncStatus(tenantId) + getRecentSyncLogs(tenantId, 5)，
 *     二者均以 auth.tenantId 调用（租户作用域，忽略 query 的 tenantId/userId），
 *     返回 { success: true, data: { status, recentLogs } } 聚合对象
 *   - getSyncStatus 抛错 → 500 { error: <message> }，getRecentSyncLogs 因顺序 await 不触达
 *   - getRecentSyncLogs 抛错 → 500，getSyncStatus 已先行调用
 *
 * Mock 策略：authenticateRequest / sync-engine / next/server 全部隔离，不触达真实数据库。
 * 路由经服务层访问数据（无直接 db 依赖），故无需 mock @/lib/db。复用 cloud-sync-config-route
 * 与 saas-subscription-route 的 vi.hoisted + MockNextResponse 范式，使路由的
 * `auth instanceof NextResponse` 与 mock 的 authenticateRequest 返回值共用同一构造器。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetSyncStatus,
  mockGetRecentSyncLogs,
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
    mockGetSyncStatus: vi.fn(),
    mockGetRecentSyncLogs: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/cloud-sync/sync-engine", () => ({
  getSyncStatus: (...args: unknown[]) => mockGetSyncStatus(...args),
  getRecentSyncLogs: (...args: unknown[]) => mockGetRecentSyncLogs(...args),
}));

import { GET } from "@/app/api/cloud-sync/status/route";

function makeRequest(url: string): NextRequest {
  return new Request(url, { method: "GET" }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleStatus = {
  lastSyncTime: "2026-06-29T00:00:00Z",
  totalFiles: 100,
  syncedFiles: 95,
  pendingFiles: 3,
  conflictFiles: 2,
  isSyncing: false,
  lastError: null,
  overallStatus: "idle" as const,
  queueSize: 3,
};

const sampleLogs = [
  {
    id: "log-1",
    syncType: "incremental",
    status: "success",
    filesSynced: 12,
    filesTotal: 100,
    startedAt: new Date("2026-06-29T00:00:00Z"),
    endedAt: new Date("2026-06-29T00:01:00Z"),
    errorMessage: null,
  },
];

describe("cloud-sync/status 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 authenticateRequest 成功返回 owner 身份；逐用例按需覆盖
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockGetSyncStatus.mockResolvedValue(sampleStatus);
    mockGetRecentSyncLogs.mockResolvedValue(sampleLogs);
  });

  describe("GET /api/cloud-sync/status", () => {
    it("未认证 → 401 透传，不触达任一 sync-engine 服务", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/status"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetSyncStatus).not.toHaveBeenCalled();
      expect(mockGetRecentSyncLogs).not.toHaveBeenCalled();
    });

    it("成功 → 两服务均以 auth.tenantId 调用，返回聚合 { status, recentLogs }", async () => {
      // query 带他租户 tenantId/userId —— 路由须忽略，用 auth.tenantId
      const res = (await GET(
        makeRequest("http://localhost/api/cloud-sync/status?tenantId=tenant-evil&userId=user-evil")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { status: sampleStatus, recentLogs: sampleLogs } });
      // 两服务均以 auth.tenantId 调用（忽略 query 的 tenantId/userId）
      expect(mockGetSyncStatus).toHaveBeenCalledWith("tenant-1");
      // getRecentSyncLogs 第二参固定为 5（路由 hardcode）
      expect(mockGetRecentSyncLogs).toHaveBeenCalledWith("tenant-1", 5);
    });

    it("getSyncStatus 抛错 → 500，getRecentSyncLogs 因顺序 await 不触达", async () => {
      mockGetSyncStatus.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/status"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "db down" });
      expect(mockGetSyncStatus).toHaveBeenCalledWith("tenant-1");
      // 关键：getSyncStatus 抛错时 catch 直接返回，不调 getRecentSyncLogs
      expect(mockGetRecentSyncLogs).not.toHaveBeenCalled();
    });

    it("getRecentSyncLogs 抛错 → 500，getSyncStatus 已先行调用", async () => {
      mockGetRecentSyncLogs.mockRejectedValue(new Error("logs fetch failed"));

      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/status"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "logs fetch failed" });
      // 顺序 await：getSyncStatus 先行成功，随后 getRecentSyncLogs 抛错
      expect(mockGetSyncStatus).toHaveBeenCalledWith("tenant-1");
      expect(mockGetRecentSyncLogs).toHaveBeenCalledWith("tenant-1", 5);
    });
  });
});
