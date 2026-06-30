/**
 * billing/subscription 路由 handler 级集成测试
 *
 * 锁定 src/app/api/billing/subscription/route.ts 的 GET 控制流契约，覆盖 worklog
 * 第七十四轮"下一轮候选"第 2 项：聚合 getCurrentSubscription / db.tenant.findUnique /
 * checkTrialStatus 三源数据，计算 storage/ai 用量百分比并回填套餐信息。
 *
 * 路由控制流分支：
 *   1. 未认证（authenticateRequest 返回 NextResponse）→ 透传 401，不触达服务/DB
 *   2. 成功路径：依次 await getCurrentSubscription(tenantId) → db.tenant.findUnique →
 *      checkTrialStatus(tenantId)，按 PLANS[subscription.plan]||PLANS.free 回填
 *      planName/planDescription 与 plan 块；返回 { subscription, usage, trial, plan }
 *   3. tenant 为 null（findUnique 未命中）→ usage 回退默认值：
 *      storage.used="0"、storage.quota=plan.features.storageQuota.toString()、percentage=0；
 *      ai.used=0、ai.quota=plan.features.aiQuota、percentage=0
 *   4. storageQuota=0（tenant 命中但配额为 0）→ storage.percentage=0（避免除零），
 *      used/quota 仍取 tenant 值（"0" 为非空字符串属 truthy，不触发 || 回退）
 *   5. aiQuota=0（tenant 命中但配额为 0）→ ai.percentage=0；ai.quota 因 `0 || plan...`
 *      的 falsy 回退为 plan.features.aiQuota（锁定真实控制流，非理想语义）
 *   6. subscription.plan 不在 PLANS（如 'ghost'）→ plan 回退 PLANS.free
 *   7. 异常路径与顺序锁定（顺序 await，前序抛错时后续不触达）：
 *      · getCurrentSubscription 抛错 → 500，db.findUnique/checkTrialStatus 不调用
 *      · db.tenant.findUnique 抛错 → 500，checkTrialStatus 不调用
 *      · checkTrialStatus 抛错 → 500
 *
 * 关键被测逻辑：
 *   - storage.percentage BigInt 运算：Number((storageUsed * 100n / storageQuota).toString())
 *   - ai.percentage Math.round 四舍五入：(aiUsed/aiQuota)*100（如 1/3*100=33.33→33）
 *
 * Mock 策略：next/server / @/lib/api-auth / @/lib/billing/subscription /
 * @/lib/db 全部隔离，不触达真实数据库与网络。PLANS 以受控 fixture 提供（free/pro，
 * storageQuota 为 BigInt），getCurrentSubscription/checkTrialStatus 以 vi.fn mock。
 * 复用 payment-status-route 的 vi.hoisted + MockNextResponse 范式。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetCurrentSubscription,
  mockCheckTrialStatus,
  mockTenantFindUnique,
  PLANS_FIXTURE,
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

  // 受控 PLANS fixture：free/pro 两档，storageQuota 为 BigInt（路由做 BigInt 运算）
  const PLANS_FIXTURE = {
    free: {
      id: 'free',
      name: '免费版',
      description: '免费套餐',
      price: { monthly: 0, yearly: 0 },
      features: {
        storageQuota: BigInt(1024),
        aiQuota: 50,
        maxUsers: 1,
        versionHistory: false,
        advancedSearch: false,
        prioritySupport: false,
        customBranding: false,
        apiAccess: false,
      },
    },
    pro: {
      id: 'pro',
      name: '专业版',
      description: '专业套餐',
      price: { monthly: 3900, yearly: 39000 },
      features: {
        storageQuota: BigInt(50 * 1024), // 51200
        aiQuota: 500,
        maxUsers: 5,
        versionHistory: true,
        advancedSearch: true,
        prioritySupport: true,
        customBranding: false,
        apiAccess: true,
      },
    },
  };

  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockGetCurrentSubscription: vi.fn(),
    mockCheckTrialStatus: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    PLANS_FIXTURE,
  };
});

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock('@/lib/billing/subscription', () => ({
  getCurrentSubscription: (...args: unknown[]) => mockGetCurrentSubscription(...args),
  checkTrialStatus: (...args: unknown[]) => mockCheckTrialStatus(...args),
  PLANS: PLANS_FIXTURE,
}));
vi.mock('@/lib/db', () => ({
  db: {
    tenant: { findUnique: (...args: unknown[]) => mockTenantFindUnique(...args) },
  },
}));

import { GET } from '@/app/api/billing/subscription/route';

type MockRes = InstanceType<typeof MockNextResponse>;

const AUTH_USER = { userId: 'user-1', email: 'u@x.com', tenantId: 'tenant-1', role: 'owner' };

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/billing/subscription', {
    method: 'GET',
  }) as unknown as NextRequest;
}

/** getCurrentSubscription 默认返回：pro 套餐、active、有到期日。 */
function makeSubscription(overrides: Partial<{
  plan: string;
  status: string;
  currentPeriodEnd: Date | null;
  features: unknown;
}> = {}) {
  return {
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
    features: PLANS_FIXTURE.pro.features,
    ...overrides,
  };
}

/** tenant 基线：storageUsed/storageQuota 为 BigInt，aiUsed/aiQuota 为 number。 */
function makeTenant(overrides: Partial<{
  storageUsed: bigint;
  storageQuota: bigint;
  aiUsed: number;
  aiQuota: number;
  plan: string;
}> = {}) {
  return {
    storageUsed: BigInt(500),
    storageQuota: BigInt(2000),
    aiUsed: 1,
    aiQuota: 3,
    plan: 'pro',
    ...overrides,
  };
}

describe('GET /api/billing/subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(AUTH_USER);
    mockGetCurrentSubscription.mockResolvedValue(makeSubscription());
    mockTenantFindUnique.mockResolvedValue(makeTenant());
    mockCheckTrialStatus.mockResolvedValue({ isTrial: false, trialEndsAt: null, daysLeft: 0 });
  });

  // ---- 分支 1：未认证 ----
  it('未认证时透传 authenticateRequest 的 401，不触达服务/DB', async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: '未提供身份认证令牌' }, { status: 401 }),
    );

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: '未提供身份认证令牌' });
    expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
    expect(mockCheckTrialStatus).not.toHaveBeenCalled();
  });

  // ---- 分支 2：成功路径，聚合契约 ----
  it('依次调用 getCurrentSubscription/findUnique/checkTrialStatus，返回聚合对象', async () => {
    const periodEnd = new Date('2026-12-31T00:00:00Z');
    mockGetCurrentSubscription.mockResolvedValue(makeSubscription({ currentPeriodEnd: periodEnd }));
    mockTenantFindUnique.mockResolvedValue(makeTenant({
      storageUsed: BigInt(500), storageQuota: BigInt(2000), aiUsed: 1, aiQuota: 3,
    }));
    const trial = { isTrial: true, trialEndsAt: new Date('2026-07-15T00:00:00Z'), daysLeft: 14 };
    mockCheckTrialStatus.mockResolvedValue(trial);

    const res = (await GET(makeRequest())) as MockRes;

    // 调用契约
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentSubscription).toHaveBeenCalledWith('tenant-1');
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      select: {
        storageUsed: true,
        storageQuota: true,
        aiUsed: true,
        aiQuota: true,
        plan: true,
      },
    });
    expect(mockCheckTrialStatus).toHaveBeenCalledWith('tenant-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subscription: {
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: periodEnd,
        features: PLANS_FIXTURE.pro.features,
        planName: '专业版',
        planDescription: '专业套餐',
      },
      usage: {
        storage: {
          used: '500',
          quota: '2000',
          percentage: 25, // 500 * 100n / 2000n = 25
        },
        ai: {
          used: 1,
          quota: 3,
          percentage: 33, // round(1/3 * 100) = round(33.33) = 33
        },
      },
      trial,
      plan: {
        id: 'pro',
        name: '专业版',
        description: '专业套餐',
        price: { monthly: 3900, yearly: 39000 },
        features: PLANS_FIXTURE.pro.features,
      },
    });
  });

  // ---- 分支 3：tenant 为 null，usage 回退默认值 ----
  it('tenant 未命中（null）时 usage 回退默认值（storage.used="0"、quota 取 plan、percentage=0）', async () => {
    mockGetCurrentSubscription.mockResolvedValue(makeSubscription({ plan: 'pro' }));
    mockTenantFindUnique.mockResolvedValue(null);

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as {
      usage: {
        storage: { used: string; quota: string; percentage: number };
        ai: { used: number; quota: number; percentage: number };
      };
    };
    // storage：used 回退 "0"，quota 回退 plan.features.storageQuota.toString()，percentage 0
    expect(body.usage.storage).toEqual({
      used: '0',
      quota: PLANS_FIXTURE.pro.features.storageQuota.toString(),
      percentage: 0,
    });
    // ai：used 回退 0，quota 回退 plan.features.aiQuota，percentage 0
    expect(body.usage.ai).toEqual({
      used: 0,
      quota: PLANS_FIXTURE.pro.features.aiQuota,
      percentage: 0,
    });
  });

  // ---- 分支 4：storageQuota=0，避免 BigInt 除零 ----
  it('storageQuota=0 时 storage.percentage=0（避免除零），used/quota 仍取 tenant 值', async () => {
    mockTenantFindUnique.mockResolvedValue(
      makeTenant({ storageUsed: BigInt(500), storageQuota: BigInt(0), aiUsed: 1, aiQuota: 3 }),
    );

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { usage: { storage: { used: string; quota: string; percentage: number } } };
    // "0" 为非空字符串属 truthy，不触发 || plan 回退
    expect(body.usage.storage).toEqual({ used: '500', quota: '0', percentage: 0 });
  });

  // ---- 分支 5：aiQuota=0，percentage=0 且 quota 因 falsy 回退 plan ----
  it('aiQuota=0 时 ai.percentage=0，ai.quota 因 `0 || plan` 回退为 plan.features.aiQuota', async () => {
    mockTenantFindUnique.mockResolvedValue(
      makeTenant({ storageUsed: BigInt(500), storageQuota: BigInt(2000), aiUsed: 5, aiQuota: 0 }),
    );

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { usage: { ai: { used: number; quota: number; percentage: number } } };
    // 锁定真实控制流：aiQuota=0 为 falsy，触发 `|| plan.features.aiQuota` 回退
    expect(body.usage.ai).toEqual({
      used: 5,
      quota: PLANS_FIXTURE.pro.features.aiQuota,
      percentage: 0,
    });
  });

  // ---- 分支 6：subscription.plan 不在 PLANS → 回退 PLANS.free ----
  it('subscription.plan 不在 PLANS 时 plan 回退 PLANS.free（planName 取 free）', async () => {
    mockGetCurrentSubscription.mockResolvedValue(
      makeSubscription({ plan: 'ghost', features: PLANS_FIXTURE.free.features }),
    );

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as {
      subscription: { plan: string; planName: string; planDescription: string };
      plan: { id: string; name: string };
    };
    // subscription.plan 透传 mock 值 'ghost'，但 planName/plan 块取自 PLANS.free 回退
    expect(body.subscription.plan).toBe('ghost');
    expect(body.subscription.planName).toBe('免费版');
    expect(body.subscription.planDescription).toBe('免费套餐');
    expect(body.plan.id).toBe('free');
    expect(body.plan.name).toBe('免费版');
  });

  // ---- 分支 7：异常路径与顺序锁定 ----
  it('getCurrentSubscription 抛错 → 500，findUnique/checkTrialStatus 不调用', async () => {
    mockGetCurrentSubscription.mockRejectedValue(new Error('sub boom'));

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: '获取订阅信息失败' });
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
    expect(mockCheckTrialStatus).not.toHaveBeenCalled();
  });

  it('db.tenant.findUnique 抛错 → 500，checkTrialStatus 不调用', async () => {
    mockTenantFindUnique.mockRejectedValue(new Error('db boom'));

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: '获取订阅信息失败' });
    // getCurrentSubscription 在前已调用；checkTrialStatus 在后不应触达
    expect(mockGetCurrentSubscription).toHaveBeenCalled();
    expect(mockCheckTrialStatus).not.toHaveBeenCalled();
  });

  it('checkTrialStatus 抛错 → 500', async () => {
    mockCheckTrialStatus.mockRejectedValue(new Error('trial boom'));

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: '获取订阅信息失败' });
    expect(mockGetCurrentSubscription).toHaveBeenCalled();
    expect(mockTenantFindUnique).toHaveBeenCalled();
  });

  // ---- 认证调用契约 ----
  it('authenticateRequest 接收原 request', async () => {
    const req = makeRequest();
    await GET(req);

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockAuthenticate).toHaveBeenCalledWith(req);
  });
});
