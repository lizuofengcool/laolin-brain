/**
 * saas/tenant.service.ts 单测
 *
 * 锁定 src/lib/saas/tenant.service.ts 的配额检查、AI 配额跨天重置、租户状态
 * 分支、套餐切换配额写入等核心控制流。该模块在文件顶部 `new PrismaClient()`
 * 直接实例化（非经 @/lib/db 注入），且 import 了 ../auth 的 hashPassword /
 * verifyPassword（在本文件中未被任何函数使用，属遗留 import），故通过
 * vi.mock('@prisma/client') 替换构造器、vi.mock('@/lib/auth') 提供桩以切断
 * bcryptjs 加载链，使被测函数的逻辑分支可独立断言。
 *
 * 覆盖目标（按 worklog 第七十八轮"下一轮候选"第 2 项 saas/tenant.service.ts
 * 纯函数补强）：
 *   1. createTenant：trialEndsAt(now+trialDays*DAY，trialDays=0→null)、
 *      currentPeriodEnd(now+30d)、默认 free/14d、pro 配额写入、subscription
 *      currentPeriodEnd 取自 tenant.create 返回值
 *   2. checkStorageQuota：租户不存在→{allowed:false,0n,0n}；
 *      used+size<=quota→true；>quota→false；恰好等于(<=)→true；返回 bigint
 *   3. checkAiQuota：租户不存在；新天重置分支(aiResetDate null / 不同日)→
 *      tenant.update(aiUsed:0,aiResetDate:now) 且 allowed:true/remaining:quota；
 *      同日 aiUsed<aiQuota→allowed:true/remaining=quota-used；同日 aiUsed>=aiQuota→
 *      allowed:false/remaining=0(Math.max)
 *   4. consumeAiQuota：not allowed→false 不 update；allowed 同日→increment amount(默认1)；
 *      自定义 amount
 *   5. checkTenantStatus：不存在→{active:false,'租户不存在',plan:'free'}；
 *      suspended→'账户已暂停'；cancelled→'账户已取消'；正常→active:true；
 *      free+trialEndsAt 已过期仍 active:true（试用期分支为 no-op）
 *   6. changePlan：写入 plan/storageQuota/aiQuota 取自 PLAN_CONFIGS
 *   7. getCurrentSubscription：findFirst(status:active, orderBy createdAt desc)
 *   8. getTenant/checkTenantAccess/getUserTenants/addUserToTenant/updateStorageUsed
 *      透传与映射契约
 *
 * Mock 要点：
 *   - @prisma/client: PrismaClient 构造器返回 mockPrisma 单例（普通 function，
 *     使 `new PrismaClient()` 可作构造器调用）
 *   - @/lib/auth: 提供 hashPassword/verifyPassword 桩（tenant.service 遗留 import
 *     未使用，桩化以切断 bcryptjs 加载链）
 *   - vi.useFakeTimers + setSystemTime 固定 now=2026-06-30T00:00:00Z，使
 *      trialEndsAt / currentPeriodEnd / aiResetDate 跨天判断可精确断言
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    tenantUser: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('@prisma/client', () => ({
  // 用普通 function 而非 vi.fn，使 `new PrismaClient()` 可作为构造器调用
  // （function 构造器内 return 对象会覆盖 new 出的实例，故返回 mockPrisma 单例）
  PrismaClient: function PrismaClient() {
    return mockPrisma;
  },
}));

vi.mock('@/lib/auth', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

import {
  createTenant,
  getTenant,
  checkTenantAccess,
  getUserTenants,
  addUserToTenant,
  checkStorageQuota,
  updateStorageUsed,
  checkAiQuota,
  consumeAiQuota,
  changePlan,
  getCurrentSubscription,
  checkTenantStatus,
  PLAN_CONFIGS,
} from '@/lib/saas/tenant.service';

const TENANT_ID = 'tenant-001';
const USER_ID = 'user-001';
// 固定 now：2026-06-30T00:00:00.000Z，使 trialEndsAt / currentPeriodEnd / 跨天可断言
const NOW = new Date('2026-06-30T00:00:00.000Z');
const DAY = 1000 * 60 * 60 * 24;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('saas/tenant.service - createTenant', () => {
  it('默认 free/14d：trialEndsAt=now+14d、currentPeriodEnd=now+30d、subscription price=0', async () => {
    const createdTenant = {
      id: 't-new',
      plan: 'free',
      storageQuota: PLAN_CONFIGS.free.storageQuota,
      aiQuota: PLAN_CONFIGS.free.aiQuota,
      currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
    };
    mockPrisma.tenant.create.mockResolvedValue(createdTenant);
    mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-new' });

    const res = await createTenant('ACME');

    expect(res).toEqual(createdTenant);
    const tCall = mockPrisma.tenant.create.mock.calls[0][0];
    expect(tCall.data.name).toBe('ACME');
    expect(tCall.data.plan).toBe('free');
    expect(tCall.data.storageQuota).toBe(PLAN_CONFIGS.free.storageQuota);
    expect(tCall.data.aiQuota).toBe(PLAN_CONFIGS.free.aiQuota);
    expect(tCall.data.trialEndsAt).toEqual(new Date(NOW.getTime() + 14 * DAY));
    expect(tCall.data.currentPeriodEnd).toEqual(new Date(NOW.getTime() + 30 * DAY));

    const sCall = mockPrisma.subscription.create.mock.calls[0][0];
    expect(sCall.data.tenantId).toBe('t-new');
    expect(sCall.data.plan).toBe('free');
    expect(sCall.data.price).toBe(0);
    expect(sCall.data.interval).toBe('month');
    expect(sCall.data.currentPeriodStart).toEqual(NOW);
    expect(sCall.data.startedAt).toEqual(NOW);
    // subscription.currentPeriodEnd 取自 tenant.create 返回值
    expect(sCall.data.currentPeriodEnd).toEqual(createdTenant.currentPeriodEnd);
  });

  it('trialDays=0：trialEndsAt 为 null', async () => {
    mockPrisma.tenant.create.mockResolvedValue({ id: 't2', currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY) });
    mockPrisma.subscription.create.mockResolvedValue({ id: 's2' });

    await createTenant('NoTrial', 'free', 0);

    expect(mockPrisma.tenant.create.mock.calls[0][0].data.trialEndsAt).toBeNull();
  });

  it('pro 套餐：storageQuota/aiQuota 取自 PLAN_CONFIGS.pro，subscription price=39', async () => {
    mockPrisma.tenant.create.mockResolvedValue({ id: 't3', currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY) });
    mockPrisma.subscription.create.mockResolvedValue({ id: 's3' });

    await createTenant('ProCorp', 'pro', 14);

    const tCall = mockPrisma.tenant.create.mock.calls[0][0].data;
    expect(tCall.plan).toBe('pro');
    expect(tCall.storageQuota).toBe(PLAN_CONFIGS.pro.storageQuota);
    expect(tCall.aiQuota).toBe(PLAN_CONFIGS.pro.aiQuota);
    expect(mockPrisma.subscription.create.mock.calls[0][0].data.price).toBe(39);
  });

  it('currentPeriodEnd = now + 30 天（30*24*60*60*1000）', async () => {
    mockPrisma.tenant.create.mockResolvedValue({ id: 't4', currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY) });
    mockPrisma.subscription.create.mockResolvedValue({ id: 's4' });

    await createTenant('X');

    expect(mockPrisma.tenant.create.mock.calls[0][0].data.currentPeriodEnd).toEqual(
      new Date(NOW.getTime() + 30 * DAY)
    );
  });
});

describe('saas/tenant.service - checkStorageQuota', () => {
  const GB = BigInt(1024 ** 3);

  it('租户不存在：返回 { allowed:false, used:0n, quota:0n }', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    const res = await checkStorageQuota(TENANT_ID, 100);

    expect(res.allowed).toBe(false);
    expect(res.used).toBe(BigInt(0));
    expect(res.quota).toBe(BigInt(0));
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      select: { storageQuota: true, storageUsed: true },
    });
  });

  it('used + size <= quota：allowed=true（未超）', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      storageQuota: GB, // 1GB
      storageUsed: BigInt(500) * BigInt(1024 * 1024), // 500MB
    });

    const res = await checkStorageQuota(TENANT_ID, 100 * 1024 * 1024); // +100MB

    expect(res.allowed).toBe(true);
    expect(res.used).toBe(BigInt(500) * BigInt(1024 * 1024));
    expect(res.quota).toBe(GB);
  });

  it('used + size > quota：allowed=false（超限）', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      storageQuota: GB,
      storageUsed: BigInt(900) * BigInt(1024 * 1024), // 900MB
    });

    const res = await checkStorageQuota(TENANT_ID, 200 * 1024 * 1024); // +200MB → 1100MB > 1024MB

    expect(res.allowed).toBe(false);
  });

  it('used + size 恰好等于 quota：allowed=true（<= 临界）', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      storageQuota: GB,
      storageUsed: BigInt(924) * BigInt(1024 * 1024), // 924MB
    });

    const res = await checkStorageQuota(TENANT_ID, 100 * 1024 * 1024); // +100MB → 1024MB == 1GB

    expect(res.allowed).toBe(true);
  });

  it('返回 used/quota 为 bigint 原值透传', async () => {
    const used = BigInt('123456789');
    const quota = BigInt('9876543210');
    mockPrisma.tenant.findUnique.mockResolvedValue({ storageQuota: quota, storageUsed: used });

    const res = await checkStorageQuota(TENANT_ID, 1);

    expect(typeof res.used).toBe('bigint');
    expect(typeof res.quota).toBe('bigint');
    expect(res.used).toBe(used);
    expect(res.quota).toBe(quota);
  });
});

describe('saas/tenant.service - checkAiQuota', () => {
  it('租户不存在：返回 { allowed:false, used:0, quota:0, remaining:0 }', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    const res = await checkAiQuota(TENANT_ID);

    expect(res).toEqual({ allowed: false, used: 0, quota: 0, remaining: 0 });
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      select: { aiQuota: true, aiUsed: true, aiResetDate: true },
    });
    expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
  });

  it('新天重置（aiResetDate 为 null）：调 tenant.update 重置 aiUsed=0/aiResetDate=now，返回 allowed:true/remaining=quota', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 500,
      aiUsed: 499,
      aiResetDate: null,
    });

    const res = await checkAiQuota(TENANT_ID);

    expect(res).toEqual({ allowed: true, used: 0, quota: 500, remaining: 500 });
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { aiUsed: 0, aiResetDate: NOW },
    });
  });

  it('新天重置（aiResetDate 为不同日）：同样触发 update 重置', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 50,
      aiUsed: 50,
      aiResetDate: new Date(NOW.getTime() - 5 * DAY), // 5 天前，不同日
    });

    const res = await checkAiQuota(TENANT_ID);

    expect(res.allowed).toBe(true);
    expect(res.used).toBe(0);
    expect(res.remaining).toBe(50);
    expect(mockPrisma.tenant.update).toHaveBeenCalledTimes(1);
  });

  it('同日 aiUsed < aiQuota：allowed=true，remaining=quota-used，不触发 update', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 500,
      aiUsed: 100,
      aiResetDate: new Date(NOW), // 同一时刻 → 同日
    });

    const res = await checkAiQuota(TENANT_ID);

    expect(res).toEqual({ allowed: true, used: 100, quota: 500, remaining: 400 });
    expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
  });

  it('同日 aiUsed >= aiQuota：allowed=false，remaining=0（Math.max 兜底）', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 500,
      aiUsed: 500,
      aiResetDate: new Date(NOW),
    });

    const res = await checkAiQuota(TENANT_ID);

    expect(res.allowed).toBe(false);
    expect(res.used).toBe(500);
    expect(res.remaining).toBe(0);
    expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
  });

  it('同日 aiUsed 超过 aiQuota（脏数据）：remaining 仍为 0 而非负数', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 50,
      aiUsed: 80,
      aiResetDate: new Date(NOW),
    });

    const res = await checkAiQuota(TENANT_ID);

    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });
});

describe('saas/tenant.service - consumeAiQuota', () => {
  it('checkAiQuota 返回 not allowed：返回 false，不调 tenant.update', async () => {
    // 同日且 aiUsed >= aiQuota → checkAiQuota 同日分支不 update 且 allowed:false
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 500,
      aiUsed: 500,
      aiResetDate: new Date(NOW),
    });

    const res = await consumeAiQuota(TENANT_ID);

    expect(res).toBe(false);
    expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
  });

  it('allowed 同日：tenant.update 以 increment=1（默认 amount）递增，返回 true', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 500,
      aiUsed: 100,
      aiResetDate: new Date(NOW),
    });
    mockPrisma.tenant.update.mockResolvedValue({});

    const res = await consumeAiQuota(TENANT_ID);

    expect(res).toBe(true);
    expect(mockPrisma.tenant.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { aiUsed: { increment: 1 } },
    });
  });

  it('自定义 amount=5：increment=5', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      aiQuota: 500,
      aiUsed: 10,
      aiResetDate: new Date(NOW),
    });
    mockPrisma.tenant.update.mockResolvedValue({});

    const res = await consumeAiQuota(TENANT_ID, 5);

    expect(res).toBe(true);
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { aiUsed: { increment: 5 } },
    });
  });
});

describe('saas/tenant.service - checkTenantStatus', () => {
  it('租户不存在：返回 { active:false, reason:"租户不存在", plan:"free" }', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    const res = await checkTenantStatus(TENANT_ID);

    expect(res).toEqual({ active: false, reason: '租户不存在', plan: 'free' });
  });

  it('status=suspended：返回 active:false / reason:"账户已暂停" / 透传 plan', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      status: 'suspended',
      plan: 'pro',
      trialEndsAt: null,
      currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY),
    });

    const res = await checkTenantStatus(TENANT_ID);

    expect(res).toEqual({
      active: false,
      reason: '账户已暂停',
      plan: 'pro',
    });
  });

  it('status=cancelled：返回 active:false / reason:"账户已取消"', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      status: 'cancelled',
      plan: 'enterprise',
      trialEndsAt: null,
      currentPeriodEnd: null,
    });

    const res = await checkTenantStatus(TENANT_ID);

    expect(res).toEqual({
      active: false,
      reason: '账户已取消',
      plan: 'enterprise',
    });
  });

  it('正常活跃租户：返回 active:true 及 plan/trialEndsAt/currentPeriodEnd 透传', async () => {
    const trialEndsAt = new Date(NOW.getTime() + 7 * DAY);
    const currentPeriodEnd = new Date(NOW.getTime() + 30 * DAY);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      status: 'active',
      plan: 'pro',
      trialEndsAt,
      currentPeriodEnd,
    });

    const res = await checkTenantStatus(TENANT_ID);

    expect(res.active).toBe(true);
    expect(res.plan).toBe('pro');
    expect(res.trialEndsAt).toEqual(trialEndsAt);
    expect(res.currentPeriodEnd).toEqual(currentPeriodEnd);
    expect(res).not.toHaveProperty('reason');
  });

  it('free + trialEndsAt 已过期：试用期分支为 no-op，仍返回 active:true（锁定当前行为）', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      status: 'active',
      plan: 'free',
      trialEndsAt: new Date(NOW.getTime() - 1 * DAY), // 昨天，已过期
      currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
    });

    const res = await checkTenantStatus(TENANT_ID);

    expect(res.active).toBe(true);
    expect(res.plan).toBe('free');
  });
});

describe('saas/tenant.service - changePlan', () => {
  it('切换到 pro：写入 plan/storageQuota/aiQuota 取自 PLAN_CONFIGS.pro', async () => {
    const updated = { id: TENANT_ID, plan: 'pro' };
    mockPrisma.tenant.update.mockResolvedValue(updated);

    const res = await changePlan(TENANT_ID, 'pro');

    expect(res).toEqual(updated);
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: {
        plan: 'pro',
        storageQuota: PLAN_CONFIGS.pro.storageQuota,
        aiQuota: PLAN_CONFIGS.pro.aiQuota,
      },
    });
  });

  it('切换到 enterprise：写入 enterprise 配额', async () => {
    mockPrisma.tenant.update.mockResolvedValue({ id: TENANT_ID, plan: 'enterprise' });

    await changePlan(TENANT_ID, 'enterprise');

    const args = mockPrisma.tenant.update.mock.calls[0][0];
    expect(args.data.plan).toBe('enterprise');
    expect(args.data.storageQuota).toBe(PLAN_CONFIGS.enterprise.storageQuota);
    expect(args.data.aiQuota).toBe(PLAN_CONFIGS.enterprise.aiQuota);
  });
});

describe('saas/tenant.service - getCurrentSubscription', () => {
  it('按 tenantId + status:active 查询，orderBy createdAt desc，透传结果', async () => {
    const sub = { id: 'sub-1', tenantId: TENANT_ID, plan: 'pro', status: 'active' };
    mockPrisma.subscription.findFirst.mockResolvedValue(sub);

    const res = await getCurrentSubscription(TENANT_ID);

    expect(res).toEqual(sub);
    expect(mockPrisma.subscription.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('无活跃订阅返回 null', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue(null);

    const res = await getCurrentSubscription(TENANT_ID);

    expect(res).toBeNull();
  });
});

describe('saas/tenant.service - getTenant / checkTenantAccess / getUserTenants / addUserToTenant / updateStorageUsed', () => {
  it('getTenant：按 id 调 findUnique 透传结果', async () => {
    const tenant = { id: TENANT_ID, name: 'ACME', plan: 'pro' };
    mockPrisma.tenant.findUnique.mockResolvedValue(tenant);

    const res = await getTenant(TENANT_ID);

    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: TENANT_ID } });
    expect(res).toEqual(tenant);
  });

  it('getTenant：不存在返回 null', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    expect(await getTenant('missing')).toBeNull();
  });

  it('checkTenantAccess：存在成员关系返回 true', async () => {
    mockPrisma.tenantUser.findUnique.mockResolvedValue({ tenantId: TENANT_ID, userId: USER_ID, role: 'owner' });

    const res = await checkTenantAccess(TENANT_ID, USER_ID);

    expect(res).toBe(true);
    expect(mockPrisma.tenantUser.findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID } },
    });
  });

  it('checkTenantAccess：无成员关系返回 false', async () => {
    mockPrisma.tenantUser.findUnique.mockResolvedValue(null);
    expect(await checkTenantAccess(TENANT_ID, USER_ID)).toBe(false);
  });

  it('getUserTenants：findMany include tenant + 映射为 {...tenant, role, joinedAt}', async () => {
    const joinedAt = new Date(NOW.getTime() - 10 * DAY);
    mockPrisma.tenantUser.findMany.mockResolvedValue([
      {
        tenant: { id: 't-a', name: 'A', plan: 'pro' },
        role: 'owner',
        joinedAt,
      },
      {
        tenant: { id: 't-b', name: 'B', plan: 'free' },
        role: 'member',
        joinedAt: new Date(NOW.getTime() - 2 * DAY),
      },
    ]);

    const res = await getUserTenants(USER_ID);

    expect(mockPrisma.tenantUser.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      include: { tenant: true },
      orderBy: { joinedAt: 'desc' },
    });
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({ id: 't-a', name: 'A', plan: 'pro', role: 'owner', joinedAt });
    expect(res[1].id).toBe('t-b');
    expect(res[1].role).toBe('member');
  });

  it('getUserTenants：无成员关系返回空数组', async () => {
    mockPrisma.tenantUser.findMany.mockResolvedValue([]);
    expect(await getUserTenants(USER_ID)).toEqual([]);
  });

  it('addUserToTenant：默认 role=member，upsert where tenantId_userId', async () => {
    mockPrisma.tenantUser.upsert.mockResolvedValue({});

    await addUserToTenant(TENANT_ID, USER_ID);

    expect(mockPrisma.tenantUser.upsert).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID } },
      update: { role: 'member' },
      create: { tenantId: TENANT_ID, userId: USER_ID, role: 'member' },
    });
  });

  it('addUserToTenant：自定义 role=admin', async () => {
    mockPrisma.tenantUser.upsert.mockResolvedValue({});

    await addUserToTenant(TENANT_ID, USER_ID, 'admin');

    const args = mockPrisma.tenantUser.upsert.mock.calls[0][0];
    expect(args.update.role).toBe('admin');
    expect(args.create.role).toBe('admin');
  });

  it('updateStorageUsed：tenant.update 以 increment delta(bigint) 递增', async () => {
    mockPrisma.tenant.update.mockResolvedValue({});
    const delta = BigInt(2048);

    await updateStorageUsed(TENANT_ID, delta);

    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { storageUsed: { increment: delta } },
    });
  });
});
