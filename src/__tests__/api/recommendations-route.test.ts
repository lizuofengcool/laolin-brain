/**
 * recommendations 路由 handler 级集成测试
 *
 * 锁定 /api/recommendations GET 的安全与控制流契约：
 *
 *   - 未认证 → 401 透传，不触达推荐服务
 *   - 默认 type=home/limit=10 → getHomeRecommendations(userId, tenantId, 10)
 *   - ?type=related&fileId=f1&limit=5 → getRelatedRecommendations(f1, userId, tenantId, 5)
 *   - ?type=search&q=test&limit=5 → getSearchRecommendations('test', userId, tenantId, 5)
 *   - ?type=daily&limit=5 → getDailyRecommendations(userId, tenantId, 5)
 *   - ?type=invalid → 400 { error: '无效的推荐类型' }
 *   - ?type=related 缺 fileId → 400 { error: '缺少fileId参数' }
 *   - ?type=search 缺 q → 400 { error: '缺少查询词' }
 *   - **limit 校验（本轮修复锁定）**：limit 非数字（'abc' → NaN）或非正数 → 400，不触达推荐服务。
 *     原 limit 无守卫直接透传 getHomeRecommendations 等 → db.file.findMany → Prisma take:NaN
 *     （getRelatedRecommendations 更有 take: limit*3 → NaN*3=NaN）的未定义行为，
 *     本轮改为前置 isNaN||<1 → 400 + Math.min(100,...) cap。与 cloud-sync/queue/tags 约定一致。
 *   - ?limit=500 → 封顶 100；getHomeRecommendations 抛错 → 500
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/ai/recommendation，复用 vi.hoisted 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetHome,
  mockGetRelated,
  mockGetSearch,
  mockGetDaily,
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
    mockGetHome: vi.fn(),
    mockGetRelated: vi.fn(),
    mockGetSearch: vi.fn(),
    mockGetDaily: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/ai/recommendation", () => ({
  getHomeRecommendations: (...args: unknown[]) => mockGetHome(...args),
  getRelatedRecommendations: (...args: unknown[]) => mockGetRelated(...args),
  getSearchRecommendations: (...args: unknown[]) => mockGetSearch(...args),
  getDailyRecommendations: (...args: unknown[]) => mockGetDaily(...args),
  getUserInterestTags: vi.fn(),
  recordUserAction: vi.fn(),
}));

import { GET } from "@/app/api/recommendations/route";

function makeRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/recommendations${query}`) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleRec = [{ fileId: "file-1", fileName: "a.pdf", score: 0.9, reasons: ["tag"] }];

describe("/api/recommendations 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockGetHome.mockResolvedValue(sampleRec);
    mockGetRelated.mockResolvedValue(sampleRec);
    mockGetSearch.mockResolvedValue(sampleRec);
    mockGetDaily.mockResolvedValue(sampleRec);
  });

  describe("GET /api/recommendations", () => {
    it("未认证 → 401 透传，不触达推荐服务", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetHome).not.toHaveBeenCalled();
    });

    it("默认 type=home/limit=10 → getHomeRecommendations(userId, tenantId, 10)", async () => {
      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetHome).toHaveBeenCalledWith("user-1", "tenant-1", 10);
      const body = res.body as { success: boolean; data: unknown[]; type: string; count: number };
      expect(body.success).toBe(true);
      expect(body.type).toBe("home");
      expect(body.count).toBe(1);
    });

    it("?type=related&fileId=f1&limit=5 → getRelatedRecommendations(f1, user, tenant, 5)", async () => {
      const res = (await GET(makeRequest("?type=related&fileId=f1&limit=5"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetRelated).toHaveBeenCalledWith("f1", "user-1", "tenant-1", 5);
    });

    it("?type=search&q=test&limit=5 → getSearchRecommendations('test', user, tenant, 5)", async () => {
      const res = (await GET(makeRequest("?type=search&q=test&limit=5"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetSearch).toHaveBeenCalledWith("test", "user-1", "tenant-1", 5);
    });

    it("?type=daily&limit=5 → getDailyRecommendations(user, tenant, 5)", async () => {
      const res = (await GET(makeRequest("?type=daily&limit=5"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetDaily).toHaveBeenCalledWith("user-1", "tenant-1", 5);
    });

    it("?type=invalid → 400 { error: '无效的推荐类型' }", async () => {
      const res = (await GET(makeRequest("?type=invalid"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "无效的推荐类型" });
      expect(mockGetHome).not.toHaveBeenCalled();
    });

    it("?type=related 缺 fileId → 400 { error: '缺少fileId参数' }", async () => {
      const res = (await GET(makeRequest("?type=related"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "缺少fileId参数" });
      expect(mockGetRelated).not.toHaveBeenCalled();
    });

    it("?type=search 缺 q → 400 { error: '缺少查询词' }", async () => {
      const res = (await GET(makeRequest("?type=search"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "缺少查询词" });
      expect(mockGetSearch).not.toHaveBeenCalled();
    });

    it("?limit=500 → 封顶 100（Math.min(100, limitRaw)）", async () => {
      const res = (await GET(makeRequest("?limit=500"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockGetHome).toHaveBeenCalledWith("user-1", "tenant-1", 100);
    });

    // ─── limit NaN/非正数 → 400（本轮修复锁定，防 NaN 透传 Prisma take:NaN / take:limit*3=NaN）───
    it("?limit=abc → 400 { error: 'limit 必须为正整数' }，不触达推荐服务", async () => {
      const res = (await GET(makeRequest("?limit=abc"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "limit 必须为正整数" });
      expect(mockGetHome).not.toHaveBeenCalled();
    });

    it("?limit=-5 → 400（负数不透传）", async () => {
      const res = (await GET(makeRequest("?limit=-5"))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "limit 必须为正整数" });
      expect(mockGetHome).not.toHaveBeenCalled();
    });

    it("?limit=0 → 400（零不透传）", async () => {
      const res = (await GET(makeRequest("?limit=0"))) as MockRes;

      expect(res.status).toBe(400);
      expect(mockGetHome).not.toHaveBeenCalled();
    });

    it("getHomeRecommendations 抛错 → 500 { error: '获取推荐失败' }", async () => {
      mockGetHome.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取推荐失败" });
    });
  });
});
