/**
 * cloud-sync/queue 路由 handler 级集成测试
 *
 * 锁定 /api/cloud-sync/queue GET / DELETE 两个 handler 的安全与控制流契约：
 *
 * GET：
 *   - 未认证 → 401 透传，不触达 getSyncQueue
 *   - 无 query → getSyncQueue(tenantId, undefined, 50)（status 缺省 undefined，limit 缺省 50）
 *   - ?status=pending → getSyncQueue(tenantId, 'pending', 50)（status 透传，limit 仍 50）
 *   - ?limit=100 → getSyncQueue(tenantId, undefined, 100)（limit 解析为 int 10）
 *   - ?status=completed&limit=10 → getSyncQueue(tenantId, 'completed', 10)（二者皆透传）
 *   - getSyncQueue 抛错 → 500
 *   - 关键：所有调用均以 auth.tenantId（忽略 query 中的 tenantId/userId 注入）
 *
 * DELETE：
 *   - 未认证 → 401 透传，不触达 cleanupCompletedQueue
 *   - 成功 → cleanupCompletedQueue(tenantId, 7)（olderThanDays 路由 hardcode 为 7），
 *     返回 { success: true, data: { cleaned } }
 *   - cleanupCompletedQueue 抛错 → 500
 *
 * Mock 策略：authenticateRequest / sync-engine / next/server 全部隔离，不触达真实数据库。
 * 路由经服务层访问数据（无直接 db 依赖），故无需 mock @/lib/db。复用 cloud-sync-config-route
 * 与 saas-subscription-route 的 vi.hoisted + MockNextResponse 范式。
 *
 * 注意：route 用 `parseInt(searchParams.get('limit') || '50', 10)` 解析 limit。
 * 未锁定的潜在逻辑空隙（记录备查，不立项）：limit 为非数字字符串（如 'abc'）时 parseInt 返回 NaN，
 * NaN 透传给 getSyncQueue —— 本轮不锁此 NaN 透传行为，避免锁定潜在 buggy 行为阻碍后续修复。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetSyncQueue,
  mockCleanupCompletedQueue,
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
    mockGetSyncQueue: vi.fn(),
    mockCleanupCompletedQueue: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/cloud-sync/sync-engine", () => ({
  getSyncQueue: (...args: unknown[]) => mockGetSyncQueue(...args),
  cleanupCompletedQueue: (...args: unknown[]) => mockCleanupCompletedQueue(...args),
}));

import { GET, DELETE } from "@/app/api/cloud-sync/queue/route";

function makeRequest(url: string, method: string = "GET"): NextRequest {
  return new Request(url, { method }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleQueue = [
  {
    id: "q-1",
    tenantId: "tenant-1",
    fileId: "file-1",
    operation: "upload",
    status: "pending",
    priority: 0,
    createdAt: new Date("2026-06-29T00:00:00Z"),
  },
];

describe("cloud-sync/queue 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockGetSyncQueue.mockResolvedValue(sampleQueue);
    mockCleanupCompletedQueue.mockResolvedValue(3);
  });

  describe("GET /api/cloud-sync/queue", () => {
    it("未认证 → 401 透传，不触达 getSyncQueue", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/queue"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetSyncQueue).not.toHaveBeenCalled();
    });

    it("无 query → getSyncQueue(tenantId, undefined, 50)（status 缺省 undefined，limit 缺省 50）", async () => {
      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/queue"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: sampleQueue });
      expect(mockGetSyncQueue).toHaveBeenCalledWith("tenant-1", undefined, 50);
    });

    it("?status=pending → getSyncQueue(tenantId, 'pending', 50)（status 透传）", async () => {
      const res = (await GET(
        makeRequest("http://localhost/api/cloud-sync/queue?status=pending")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetSyncQueue).toHaveBeenCalledWith("tenant-1", "pending", 50);
    });

    it("?limit=100 → getSyncQueue(tenantId, undefined, 100)（limit 解析为 int 10）", async () => {
      const res = (await GET(
        makeRequest("http://localhost/api/cloud-sync/queue?limit=100")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetSyncQueue).toHaveBeenCalledWith("tenant-1", undefined, 100);
    });

    it("?status=completed&limit=10 → getSyncQueue(tenant-1, 'completed', 10)（二者皆透传）", async () => {
      const res = (await GET(
        makeRequest("http://localhost/api/cloud-sync/queue?status=completed&limit=10")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetSyncQueue).toHaveBeenCalledWith("tenant-1", "completed", 10);
    });

    it("query 带 tenantId/userId → 仍以 auth.tenantId 调用（忽略 query 注入）", async () => {
      const res = (await GET(
        makeRequest("http://localhost/api/cloud-sync/queue?tenantId=tenant-evil&userId=user-evil")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetSyncQueue).toHaveBeenCalledWith("tenant-1", undefined, 50);
    });

    it("getSyncQueue 抛错 → 500 { error: <message> }", async () => {
      mockGetSyncQueue.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/queue"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "db down" });
    });
  });

  describe("DELETE /api/cloud-sync/queue", () => {
    it("未认证 → 401 透传，不触达 cleanupCompletedQueue", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await DELETE(makeRequest("http://localhost/api/cloud-sync/queue", "DELETE"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockCleanupCompletedQueue).not.toHaveBeenCalled();
    });

    it("成功 → cleanupCompletedQueue(tenantId, 7)，返回 { cleaned }", async () => {
      const res = (await DELETE(makeRequest("http://localhost/api/cloud-sync/queue", "DELETE"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { cleaned: 3 } });
      // olderThanDays 路由 hardcode 为 7（非 query 可配）
      expect(mockCleanupCompletedQueue).toHaveBeenCalledWith("tenant-1", 7);
    });

    it("cleanupCompletedQueue 抛错 → 500 { error: <message> }", async () => {
      mockCleanupCompletedQueue.mockRejectedValue(new Error("cleanup failed"));

      const res = (await DELETE(makeRequest("http://localhost/api/cloud-sync/queue", "DELETE"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "cleanup failed" });
    });
  });
});
