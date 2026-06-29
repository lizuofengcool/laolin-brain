/**
 * shares/[id]/access-logs 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/shares/[id]/access-logs GET 路由层的分页校验与认证透传契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 shareManager。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { success:false, error:'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达
 *     shareManager.getAccessLogs。shareManager.getAccessLogs 虽以 `page||1`/`pageSize||20`
 *     兜底 NaN（NaN 为 falsy 触发回退），但路由本地 page/pageSize 仍透传进 hasMore 计算
 *     （`page * pageSize < result.total` → `NaN < total` = false）导致分页标志不一致；
 *     统一在路由边界拒绝。与 files/storage/tags 及 cloud-sync/queue 的 isNaN||<1 → 400 约定一致。
 *   - 成功 → shareManager.getAccessLogs 接收 (id, tenantId, {page,pageSize,action})，路由
 *     回包 { success:true, data:{ logs, pagination:{ total,page,pageSize,totalPages,hasMore } } }。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/shares，复用第三十轮 cloud-sync-config-route
 * 的 vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetAccessLogs,
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
    mockGetAccessLogs: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/shares", () => ({
  shareManager: {
    getAccessLogs: (...args: unknown[]) => mockGetAccessLogs(...args),
  },
}));

import { GET } from "@/app/api/shares/[id]/access-logs/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/shares/share-1/access-logs${query}`;
  return new Request(url) as unknown as NextRequest;
}

// 路由签名 GET(request, { params: Promise<{ id: string }> })，复刻 Next.js 16 动态路由上下文
function makeContext(id = "share-1"): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/shares/[id]/access-logs 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 shareManager", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ success: false, error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest(), makeContext())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: "未提供身份认证令牌" });
    expect(mockGetAccessLogs).not.toHaveBeenCalled();
  });

  it("成功（默认）→ getAccessLogs 接收 (id, tenantId, {page:1,pageSize:20})，回包 pagination（hasMore 取本地 page*pageSize）", async () => {
    mockGetAccessLogs.mockReturnValue({
      logs: [{ id: "log-1" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = (await GET(makeGetRequest(), makeContext())) as MockRes;

    expect(res.status).toBe(200);
    // 核心契约：id 与 tenantId 注入服务，page/pageSize 走默认值
    expect(mockGetAccessLogs.mock.calls[0]).toEqual([
      "share-1",
      "tenant-1",
      { page: 1, pageSize: 20, action: undefined },
    ]);
    const body = res.body as {
      success: boolean;
      data: { logs: unknown[]; pagination: Record<string, unknown> };
    };
    expect(body.success).toBe(true);
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.pagination).toEqual({
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasMore: false,
    });
  });

  // ─── 分页参数 NaN/非正数 → 400（本轮修复锁定，防本地 NaN 透传 hasMore 计算）───
  it("?page=abc → 400 { success:false, error:'page 必须 >= 1' }，不触达 shareManager", async () => {
    const res = (await GET(makeGetRequest("?page=abc"), makeContext())) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "page 必须 >= 1" });
    expect(mockGetAccessLogs).not.toHaveBeenCalled();
  });

  it("?page=0 → 400（page<1）", async () => {
    const res = (await GET(makeGetRequest("?page=0"), makeContext())) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "page 必须 >= 1" });
    expect(mockGetAccessLogs).not.toHaveBeenCalled();
  });

  it("?pageSize=abc → 400 { success:false, error:'pageSize 必须为正整数' }，不触达 shareManager", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"), makeContext())) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "pageSize 必须为正整数" });
    expect(mockGetAccessLogs).not.toHaveBeenCalled();
  });

  it("?pageSize=-5 → 400（负数，防本地 page*-5 透传 hasMore）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=-5"), makeContext())) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "pageSize 必须为正整数" });
    expect(mockGetAccessLogs).not.toHaveBeenCalled();
  });

  it("getAccessLogs 抛错 → 500 { success:false, error:'获取分享访问日志失败' }", async () => {
    mockGetAccessLogs.mockImplementation(() => {
      throw new Error("share store down");
    });

    const res = (await GET(makeGetRequest(), makeContext())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: "获取分享访问日志失败" });
  });
});
