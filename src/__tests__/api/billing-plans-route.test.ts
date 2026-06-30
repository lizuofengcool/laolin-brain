/**
 * billing/plans 路由 handler 级集成测试
 *
 * 锁定 src/app/api/billing/plans/route.ts 的控制流契约，覆盖 worklog 第七十四轮
 * "下一轮候选"第 1 项：GET /api/billing/plans 将 PLANS 记录转换为数组并计算
 * yearlyDiscount 折扣百分比。
 *
 * 路由控制流分支：
 *   1. 成功路径：Object.entries(PLANS).map → 每个套餐输出
 *      { id, name, description, price{monthly,yearly,yearlyDiscount}, features }，
 *      返回 { plans: [...] }，status 200
 *   2. yearlyDiscount 计算（核心被测逻辑）：
 *      · monthly > 0 → round((1 - yearly/(monthly*12)) * 100)（普通付费套餐折扣）
 *      · monthly > 0 且 yearly == monthly*12 → 0（付费但无年付折扣）
 *      · monthly == 0 → 0（免费套餐走 `monthly > 0 ? ... : 0` 的 false 分支）
 *   3. 异常路径：PLANS 迭代过程抛错 → catch → 500 { error: "获取套餐列表失败" }
 *
 * Mock 策略：next/server 与 @/lib/billing/subscription 全部隔离，不触达真实数据库。
 * PLANS 以受控 fixture 提供（free/pro/fullprice 三档），使 yearlyDiscount 三条
 * 分支具真实语义而非自证；fixture 经共享可变对象暴露，异常用例通过注入抛错 getter
 * 触发 Object.entries 取值异常，beforeEach 负责重置。复用 payment-status-route 的
 * vi.hoisted + MockNextResponse 范式。
 *
 * 注意：该路由无认证、无数据库依赖，纯函数式转换 PLANS；故无 401/404 分支。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { MockNextResponse, sharedPlans, PLANS_FIXTURE } = vi.hoisted(() => {
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

  // 受控 fixture：覆盖 yearlyDiscount 三条分支
  // - free: monthly=0 → 0（免费套餐 false 分支）
  // - pro: monthly=3900, yearly=39000 → round((1-39000/46800)*100) = round(16.67) = 17
  // - fullprice: monthly=1000, yearly=12000 → round((1-12000/12000)*100) = 0（付费无折扣）
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
        storageQuota: BigInt(50 * 1024),
        aiQuota: 500,
        maxUsers: 5,
        versionHistory: true,
        advancedSearch: true,
        prioritySupport: true,
        customBranding: false,
        apiAccess: true,
      },
    },
    fullprice: {
      id: 'fullprice',
      name: '全价版',
      description: '无年付折扣套餐',
      price: { monthly: 1000, yearly: 12000 },
      features: {
        storageQuota: BigInt(10 * 1024),
        aiQuota: 100,
        maxUsers: 3,
        versionHistory: true,
        advancedSearch: false,
        prioritySupport: false,
        customBranding: false,
        apiAccess: false,
      },
    },
  };

  // 共享可变对象：路由持有其引用，Object.entries 每次请求实时读取；
  // 异常用例可注入抛错 getter，beforeEach 重置为干净 fixture。
  const sharedPlans: Record<string, unknown> = {};

  return { MockNextResponse, sharedPlans, PLANS_FIXTURE };
});

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('@/lib/billing/subscription', () => ({ PLANS: sharedPlans }));

import { GET } from '@/app/api/billing/plans/route';

type MockRes = InstanceType<typeof MockNextResponse>;

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/billing/plans', {
    method: 'GET',
  }) as unknown as NextRequest;
}

/** beforeEach 调用：清空 sharedPlans 并重新填充干净 fixture，保证用例间隔离。 */
function resetPlans() {
  for (const key of Object.keys(sharedPlans)) {
    delete sharedPlans[key];
  }
  for (const [key, value] of Object.entries(PLANS_FIXTURE)) {
    sharedPlans[key] = value;
  }
}

describe('GET /api/billing/plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPlans();
  });

  // ---- 分支 1：成功路径，转换契约 ----
  it('将 PLANS 转换为数组并返回 { plans }，字段映射正确', async () => {
    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { plans: Array<Record<string, unknown>> };
    expect(body.plans).toHaveLength(3);

    // 按 id 索引便于断言（Object.entries 顺序即定义顺序：free, pro, fullprice）
    const byId = new Map(body.plans.map((p) => [p.id as string, p]));
    expect(byId.has('free')).toBe(true);
    expect(byId.has('pro')).toBe(true);
    expect(byId.has('fullprice')).toBe(true);

    // 字段映射：仅透传 id/name/description/features，price 拆分为 monthly/yearly/yearlyDiscount
    const free = byId.get('free')!;
    expect(free.name).toBe('免费版');
    expect(free.description).toBe('免费套餐');
    expect(free.features).toEqual(PLANS_FIXTURE.free.features);
    expect(free.price).toEqual({ monthly: 0, yearly: 0, yearlyDiscount: 0 });
  });

  // ---- 分支 2：yearlyDiscount 计算（核心被测逻辑）----
  it('免费套餐（monthly=0）yearlyDiscount 为 0（走 false 分支，不除零）', async () => {
    const res = (await GET(makeRequest())) as MockRes;

    const body = res.body as { plans: Array<{ id: string; price: { yearlyDiscount: number } }> };
    const free = body.plans.find((p) => p.id === 'free')!;
    expect(free.price.yearlyDiscount).toBe(0);
  });

  it('付费套餐有年付折扣时 yearlyDiscount = round((1 - yearly/(monthly*12)) * 100)', async () => {
    const res = (await GET(makeRequest())) as MockRes;

    const body = res.body as { plans: Array<{ id: string; price: { yearlyDiscount: number } }> };
    const pro = body.plans.find((p) => p.id === 'pro')!;
    // 39000 / (3900*12) = 39000/46800 ≈ 0.8333 → (1-0.8333)*100 ≈ 16.67 → round = 17
    expect(pro.price.yearlyDiscount).toBe(17);
  });

  it('付费套餐 yearly == monthly*12 时 yearlyDiscount 为 0（付费但无折扣）', async () => {
    const res = (await GET(makeRequest())) as MockRes;

    const body = res.body as { plans: Array<{ id: string; price: { yearlyDiscount: number } }> };
    const fullprice = body.plans.find((p) => p.id === 'fullprice')!;
    // 12000 / (1000*12) = 1 → (1-1)*100 = 0
    expect(fullprice.price.yearlyDiscount).toBe(0);
  });

  it('price 字段同时包含 monthly/yearly/yearlyDiscount 三个字段', async () => {
    const res = (await GET(makeRequest())) as MockRes;

    const body = res.body as { plans: Array<{ id: string; price: Record<string, number> }> };
    for (const plan of body.plans) {
      expect(Object.keys(plan.price).sort()).toEqual(
        ['monthly', 'yearly', 'yearlyDiscount'].sort(),
      );
    }
  });

  // ---- 分支 3：异常路径 ----
  it('PLANS 迭代取值抛错时返回 500 { error: "获取套餐列表失败" }', async () => {
    // 注入 enumerable 属性，其 getter 在 Object.entries 取值时抛错 → 触发 catch
    Object.defineProperty(sharedPlans, 'broken', {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error('plan access boom');
      },
    });

    const res = (await GET(makeRequest())) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: '获取套餐列表失败' });
  });
});
