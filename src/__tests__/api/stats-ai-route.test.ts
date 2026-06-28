/**
 * /api/stats?type=ai 路由 handler 级集成测试
 *
 * 锁定 getAiStats 的按类型(summary/ocr/describe/tags)聚合契约：
 *   - 401 透传：authenticateRequest 返回 NextResponse 时不触达 db。
 *   - 非 owner/admin → 403，不触达 db。
 *   - 配额窗口激活（aiResetDate 在未来）：聚合 AiUsageLog.groupBy 按 operation 拆分，
 *     where 以 { tenantId, createdAt: { gte: windowStart } } 作用域（windowStart =
 *     aiResetDate - 24h，与 checkAiQuotaAndTenant 的 24h 重置口径一致）；totalCalls 取
 *     Tenant.aiUsed、quotaPercent = round(aiUsed/aiQuota*100)。
 *   - 配额窗口未激活（aiResetDate 已过期）：不查询 groupBy，各类型计次与 quotaUsed
 *     一并按 0 报告，保持口径一致（只读端点不写回清零）。
 *
 * 复用第三十~三十三轮 vi.hoisted 共享 MockNextResponse + 全模块隔离范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockTenantFindUnique,
  mockAiUsageLogGroupBy,
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
    async json(): Promise<unknown> {
      return this.body;
    }
  }
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockAiUsageLogGroupBy: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    tenant: { findUnique: (...args: unknown[]) => mockTenantFindUnique(...args) },
    aiUsageLog: { groupBy: (...args: unknown[]) => mockAiUsageLogGroupBy(...args) },
  },
}));

import { GET } from "@/app/api/stats/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

function makeGetRequest(type: string | null): NextRequest {
  const url =
    type === null
      ? "http://localhost/api/stats"
      : `http://localhost/api/stats?type=${type}`;
  return new Request(url) as unknown as NextRequest;
}

function auth401(): MockRes {
  return new MockNextResponse({ error: "未授权" }, { status: 401 });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticate.mockResolvedValue(ownerAuth);
});

describe("/api/stats?type=ai —— getAiStats 按类型聚合", () => {
  it("401 透传：authenticateRequest 返回 NextResponse 时不触达 db", async () => {
    mockAuthenticate.mockResolvedValue(auth401());
    const res = (await GET(makeGetRequest("ai"))) as MockRes;
    expect(res.status).toBe(401);
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
    expect(mockAiUsageLogGroupBy).not.toHaveBeenCalled();
  });

  it("非 owner/admin → 403，不触达 db", async () => {
    mockAuthenticate.mockResolvedValue({ ...ownerAuth, role: "member" });
    const res = (await GET(makeGetRequest("ai"))) as MockRes;
    expect(res.status).toBe(403);
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
    expect(mockAiUsageLogGroupBy).not.toHaveBeenCalled();
  });

  it("配额窗口激活：groupBy 按 operation 拆分，totalCalls=aiUsed，windowStart=aiResetDate-24h", async () => {
    // 窗口在未来 1 小时到期 → 激活；aiUsed=5、aiQuota=200 → percent=3
    const aiResetDate = new Date(Date.now() + 60 * 60 * 1000);
    mockTenantFindUnique.mockResolvedValue({
      aiQuota: 200,
      aiUsed: 5,
      aiResetDate,
    });
    mockAiUsageLogGroupBy.mockResolvedValue([
      { operation: "summary", _count: { _all: 2 } },
      { operation: "ocr", _count: { _all: 1 } },
      { operation: "describe", _count: { _all: 1 } },
      { operation: "tags", _count: { _all: 1 } },
    ]);

    const res = (await GET(makeGetRequest("ai"))) as MockRes;
    expect(res.status).toBe(200);

    // findUnique 以 tenantId 查询配额
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: { aiQuota: true, aiUsed: true, aiResetDate: true },
    });

    // groupBy 以 { tenantId, createdAt: { gte: windowStart } } 作用域
    expect(mockAiUsageLogGroupBy).toHaveBeenCalledTimes(1);
    const groupArg = mockAiUsageLogGroupBy.mock.calls[0][0] as {
      by: string[];
      where: { tenantId: string; createdAt: { gte: Date } };
      _count: Record<string, unknown>;
    };
    expect(groupArg.by).toEqual(["operation"]);
    expect(groupArg.where.tenantId).toBe("tenant-1");
    // windowStart = aiResetDate - 24h，允许 1s 容差
    const expectedWindowStart = new Date(aiResetDate.getTime() - 24 * 60 * 60 * 1000);
    expect(groupArg.where.createdAt.gte.getTime()).toBeCloseTo(
      expectedWindowStart.getTime(),
      -1000,
    );

    const body = (await res.json()) as { success: boolean; data: Record<string, number> };
    expect(body.success).toBe(true);
    const data = body.data;
    expect(data).toMatchObject({
      totalCalls: 5,
      summaryCalls: 2,
      ocrCalls: 1,
      describeCalls: 1,
      tagCalls: 1,
      quotaUsed: 5,
      quotaTotal: 200,
      quotaPercent: 3,
    });
  });

  it("配额窗口未激活（aiResetDate 已过期）：不查 groupBy，各计次按 0 报告", async () => {
    mockTenantFindUnique.mockResolvedValue({
      aiQuota: 200,
      aiUsed: 5, // 历史残留值，但窗口已过期 → 按 0 口径报告
      aiResetDate: new Date(Date.now() - 60 * 60 * 1000), // 1 小时前过期
    });

    const res = (await GET(makeGetRequest("ai"))) as MockRes;
    expect(res.status).toBe(200);
    expect(mockAiUsageLogGroupBy).not.toHaveBeenCalled();

    const body = (await res.json()) as { success: boolean; data: Record<string, number> };
    expect(body.data).toMatchObject({
      totalCalls: 0,
      summaryCalls: 0,
      ocrCalls: 0,
      describeCalls: 0,
      tagCalls: 0,
      quotaUsed: 0,
      quotaTotal: 200,
      quotaPercent: 0,
    });
  });
});
