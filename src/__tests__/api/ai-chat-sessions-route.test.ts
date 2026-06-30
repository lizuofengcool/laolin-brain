/**
 * ai/chat/sessions 路由 handler 级集成测试
 *
 * 锁定 /api/ai/chat/sessions GET 的安全与控制流契约：
 *
 *   - 未认证 → 401 透传，不触达 getChatSessions
 *   - 默认 limit=20 → getChatSessions(userId, tenantId, 20)
 *   - ?limit=5 → getChatSessions(userId, tenantId, 5)
 *   - ?limit=500 → 封顶 100（Math.min(100, limitRaw)）
 *   - **limit 校验（本轮修复锁定）**：limit 非数字（'abc' → NaN）或非正数 → 400，不触达 getChatSessions。
 *     原 limit 无守卫直接透传 getChatSessions → Array.slice(0, limit)（NaN → slice(0,0) 静默返回空、
 *     负数 → 从尾部截取产生非预期子集），本轮改为前置 isNaN||<1 → 400 + Math.min(100,...) cap。
 *     与 recommendations/cloud-sync/queue/tags 约定一致。
 *   - getChatSessions 抛错 → 500 { error: '获取对话列表失败' }
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/ai/document-qna，复用 vi.hoisted 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetChatSessions,
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
    mockGetChatSessions: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/ai/document-qna", () => ({
  getChatSessions: (...args: unknown[]) => mockGetChatSessions(...args),
  createChatSession: vi.fn(),
  getChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  addChatMessage: vi.fn(),
}));

import { GET } from "@/app/api/ai/chat/sessions/route";

function makeRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/ai/chat/sessions${query}`) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleSession = {
  id: "sess-1",
  userId: "user-1",
  tenantId: "tenant-1",
  title: "Q&A",
  updatedAt: "2026-06-29T00:00:00Z",
};

describe("/api/ai/chat/sessions 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockGetChatSessions.mockResolvedValue([sampleSession]);
  });

  describe("GET /api/ai/chat/sessions", () => {
    it("未认证 → 401 透传，不触达 getChatSessions", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetChatSessions).not.toHaveBeenCalled();
    });

    it("默认 limit=20 → getChatSessions(userId, tenantId, 20)", async () => {
      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetChatSessions).toHaveBeenCalledWith("user-1", "tenant-1", 20);
      const body = res.body as { success: boolean; data: unknown[]; total: number };
      expect(body.success).toBe(true);
      expect(body.total).toBe(1);
    });

    it("?limit=5 → getChatSessions(userId, tenantId, 5)", async () => {
      const res = (await GET(makeRequest("?limit=5"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetChatSessions).toHaveBeenCalledWith("user-1", "tenant-1", 5);
    });

    it("?limit=500 → 封顶 100（Math.min(100, limitRaw)）", async () => {
      const res = (await GET(makeRequest("?limit=500"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetChatSessions).toHaveBeenCalledWith("user-1", "tenant-1", 100);
    });

    // ─── limit NaN/非正数 → 400（本轮修复锁定，防 NaN/负数透传 Array.slice 产生静默空/尾部截取）───
    it("?limit=abc → 400 { error: 'limit 必须为正整数' }，不触达 getChatSessions", async () => {
      const res = (await GET(makeRequest("?limit=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "limit 必须为正整数" });
      expect(mockGetChatSessions).not.toHaveBeenCalled();
    });

    it("?limit=-5 → 400（负数，防 slice(0,-5) 从尾部截取）", async () => {
      const res = (await GET(makeRequest("?limit=-5"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "limit 必须为正整数" });
      expect(mockGetChatSessions).not.toHaveBeenCalled();
    });

    it("?limit=0 → 400（零，防 slice(0,0) 静默返回空）", async () => {
      const res = (await GET(makeRequest("?limit=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "limit 必须为正整数" });
      expect(mockGetChatSessions).not.toHaveBeenCalled();
    });

    it("getChatSessions 抛错 → 500 { error: '获取对话列表失败' }", async () => {
      mockGetChatSessions.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取对话列表失败" });
    });
  });
});
