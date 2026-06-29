/**
 * automation/rules 路由 handler 级集成测试（GET）
 *
 * 锁定 /api/automation/rules GET 路由层的分页校验、认证透传与作用域契约：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - **分页参数校验**：page/pageSize 非数字（'abc' → NaN）或非正数 → 400
 *     { error: 'page 必须 >= 1' | 'pageSize 必须为正整数' }，不触达 count/findMany。
 *     自动化规则为个人级数据（无 role 门控，按 userId+tenantId 双键作用域），门控直接
 *     置于解析后。与 files/storage/tags/comments/notifications 的 isNaN||<1 → 400 约定一致。
 *   - 成功 → count/findMany 以 { userId, tenantId } 双键作用域（防跨租户/跨用户越权）；
 *     findMany orderBy [{ priority: 'desc' }, { createdAt: 'desc' }]、skip/take 分页；
 *     pageSize 上限 100；enabled/trigger 过滤合并进 where；返回 data 经 JSON.parse 还原
 *     conditions/actions；count 抛错 500。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route
 * 的 vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockRuleCount,
  mockRuleFindMany,
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
    mockRuleCount: vi.fn(),
    mockRuleFindMany: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    automationRule: {
      count: (...args: unknown[]) => mockRuleCount(...args),
      findMany: (...args: unknown[]) => mockRuleFindMany(...args),
    },
  },
}));

import { GET } from "@/app/api/automation/rules/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/automation/rules${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 一条规则记录（conditions/actions 为 JSON 字符串，覆盖路由 JSON.parse 还原路径）
const ruleRecord = {
  id: "rule-1",
  tenantId: "tenant-1",
  userId: "user-1",
  name: "图片自动打标签",
  trigger: "file.uploaded",
  conditions: JSON.stringify({ fileType: "image" }),
  actions: JSON.stringify([{ type: "autoTag" }]),
  enabled: true,
  priority: 10,
  runCount: 3,
  lastRunAt: null,
  createdAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-29T00:00:00.000Z",
};

describe("/api/automation/rules 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockRuleCount.mockResolvedValue(1);
    mockRuleFindMany.mockResolvedValue([ruleRecord]);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockRuleCount).not.toHaveBeenCalled();
    expect(mockRuleFindMany).not.toHaveBeenCalled();
  });

  it("成功（默认分页）→ 200，count/findMany 以 { userId, tenantId } 双键作用域，skip=0/take=20，data 还原 conditions/actions", async () => {
    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(200);
    const expectedWhere = { userId: "user-1", tenantId: "tenant-1" };
    expect(mockRuleCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
    const findArg = mockRuleFindMany.mock.calls[0][0] as {
      where: unknown;
      orderBy: unknown;
      skip: number;
      take: number;
    };
    expect(findArg.where).toEqual(expectedWhere);
    expect(findArg.orderBy).toEqual([{ priority: "desc" }, { createdAt: "desc" }]);
    expect(findArg.skip).toBe(0);
    expect(findArg.take).toBe(20);

    const body = res.body as {
      data: Array<Record<string, unknown>>;
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasMore: boolean;
    };
    // conditions/actions 经 JSON.parse 还原
    expect(body.data[0]).toMatchObject({
      id: "rule-1",
      conditions: { fileType: "image" },
      actions: [{ type: "autoTag" }],
      priority: 10,
    });
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.totalPages).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("分页 page=2&pageSize=2，total=5 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
    mockRuleCount.mockResolvedValue(5);
    mockRuleFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?page=2&pageSize=2"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockRuleFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArg.skip).toBe(2);
    expect(findArg.take).toBe(2);
    const body = res.body as { totalPages: number; hasMore: boolean; page: number; pageSize: number };
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.totalPages).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it("pageSize 超过上限被截断为 100", async () => {
    mockRuleCount.mockResolvedValue(0);
    mockRuleFindMany.mockResolvedValue([]);

    const res = (await GET(makeGetRequest("?pageSize=500"))) as MockRes;

    expect(res.status).toBe(200);
    const findArg = mockRuleFindMany.mock.calls[0][0] as { take: number };
    expect(findArg.take).toBe(100);
  });

  it("enabled 过滤 → where.enabled=true", async () => {
    mockRuleCount.mockResolvedValue(0);
    mockRuleFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?enabled=true"));

    expect(mockRuleFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      enabled: true,
    });
  });

  it("trigger 过滤 → where.trigger", async () => {
    mockRuleCount.mockResolvedValue(0);
    mockRuleFindMany.mockResolvedValue([]);

    await GET(makeGetRequest("?trigger=file.uploaded"));

    expect(mockRuleFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      trigger: "file.uploaded",
    });
  });

  // ── 分页参数校验：NaN/非正数 → 400（defense-in-depth，不透传 Prisma skip/take）──
  it("page=abc（NaN）→ 400 {error:'page 必须 >= 1'}，不触达 count/findMany", async () => {
    const res = (await GET(makeGetRequest("?page=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockRuleCount).not.toHaveBeenCalled();
    expect(mockRuleFindMany).not.toHaveBeenCalled();
  });

  it("page=0（非正数）→ 400 {error:'page 必须 >= 1'}", async () => {
    const res = (await GET(makeGetRequest("?page=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "page 必须 >= 1" });
    expect(mockRuleCount).not.toHaveBeenCalled();
  });

  it("pageSize=abc（NaN）→ 400 {error:'pageSize 必须为正整数'}（Math.min(100,NaN)=NaN 也被挡）", async () => {
    const res = (await GET(makeGetRequest("?pageSize=abc"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockRuleFindMany).not.toHaveBeenCalled();
  });

  it("pageSize=0（非正数）→ 400 {error:'pageSize 必须为正整数'}", async () => {
    const res = (await GET(makeGetRequest("?pageSize=0"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "pageSize 必须为正整数" });
    expect(mockRuleFindMany).not.toHaveBeenCalled();
  });

  it("count 抛错 → 500 { error: '获取规则列表失败' }", async () => {
    mockRuleCount.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取规则列表失败" });
  });
});
