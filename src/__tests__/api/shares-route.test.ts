/**
 * shares 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/shares GET 路由层的分页校验与认证透传契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 shareManager。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { success:false, error:'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达
 *     shareManager.queryShares。shareManager.queryShares 无 `|| 默认值` 兜底（解构默认值
 *     page=1/pageSize=20 仅对 undefined 生效，不挡 NaN），NaN 透传会导致 slice(NaN,NaN)
 *     静默返回空列表 + page/pageSize/totalPages 字段为 NaN，本轮修复锁定为前置 400。
 *     与 files/storage/tags 及 cloud-sync/queue 的 isNaN||<1 → 400 约定一致。
 *   - 成功 → shareManager.queryShares 接收 tenantId + 解析后的查询参数，路由原样回包
 *     { success:true, data:{ shares, pagination:{ total,page,pageSize,totalPages,hasMore } } }。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/shares，复用第三十轮 cloud-sync-config-route
 * 的 vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockQueryShares,
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
    mockQueryShares: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/shares", () => ({
  shareManager: {
    queryShares: (...args: unknown[]) => mockQueryShares(...args),
  },
}));

import { GET } from "@/app/api/shares/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/shares${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/shares 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 shareManager", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ success: false, error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: "未提供身份认证令牌" });
    expect(mockQueryShares).not.toHaveBeenCalled();
  });

  it("成功（默认）→ queryShares 接收 tenantId + 默认 page=1/pageSize=20，原样回包 pagination", async () => {
    mockQueryShares.mockReturnValue({
      shares: [{ id: "share-1" }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasMore: false,
    });

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    // 核心契约：tenantId 由 auth 注入，page/pageSize 走默认值
    expect(mockQueryShares.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant-1",
      page: 1,
      pageSize: 20,
    });
    const body = res.body as {
      success: boolean;
      data: { shares: unknown[]; pagination: Record<string, unknown> };
    };
    expect(body.success).toBe(true);
    expect(body.data.shares).toHaveLength(1);
    expect(body.data.pagination).toEqual({
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasMore: false,
    });
  });

  // ─── 分页参数 NaN/非正数 → 400（本轮修复锁定，防 NaN 透传 queryShares → slice(NaN,NaN) 空列表）───
  it("?page=abc → 400 { success:false, error:'page 必须 >= 1' }，不触达 shareManager", async () => {
    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "page 必须 >= 1" });
    expect(mockQueryShares).not.toHaveBeenCalled();
  });

  it("?page=0 → 400（page<1）", async () => {
    const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "page 必须 >= 1" });
    expect(mockQueryShares).not.toHaveBeenCalled();
  });

  it("?pageSize=abc → 400 { success:false, error:'pageSize 必须为正整数' }，不触达 shareManager", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "pageSize 必须为正整数" });
    expect(mockQueryShares).not.toHaveBeenCalled();
  });

  it("?pageSize=-5 → 400（负数，防 slice(start, start-5) 误截断）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=-5"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "pageSize 必须为正整数" });
    expect(mockQueryShares).not.toHaveBeenCalled();
  });

  it("queryShares 抛错 → 500 { success:false, error:'获取分享列表失败' }", async () => {
    mockQueryShares.mockImplementation(() => {
      throw new Error("share store down");
    });

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: "获取分享列表失败" });
  });
});
