/**
 * saas/billing.service.ts 单测
 *
 * 锁定 src/lib/saas/billing.service.ts 的金额计算、订阅到期边界、支付成功回调
 * 订阅周期计算等核心控制流。该模块在文件顶部 `new PrismaClient()` 直接实例化
 * （非经 @/lib/db 注入），且依赖 ./tenant.service 的 PLAN_CONFIGS /
 * getCurrentSubscription，故通过 vi.mock('@prisma/client') 替换构造器、
 * vi.mock('@/lib/saas/tenant.service') 提供 PLAN_CONFIGS 真实价目与可控的
 * getCurrentSubscription 桩，使被测函数的逻辑分支可独立断言。
 *
 * 覆盖目标（按 worklog 第七十七轮"下一轮候选"第 2 项 saas/billing.service.ts
 * 纯函数补强）：
 *   1. createOrder 金额计算：planConfig.price * 100 * quantity；年付 ×10；
 *      orderNo 前缀 KB；落库 status=pending；data 字段透传；返回值即 create 结果
 *   2. isSubscriptionExpiringSoon 边界：无订阅→false；daysLeft<=7 && >0→true；
 *      临界 7/8、0、负数、半天空 ceil 行为；返回字段契约
 *   3. handlePaymentSuccess 订阅周期计算：续费同套餐 / 换套餐 / 新订阅三分支；
 *      baseDate 选择（currentPeriodEnd>now 用旧周期尾，否则用 now）；
 *      months = year?12:1 × quantity；已支付幂等；订单不存在；事务抛错回退
 *   4. getOrder/getOrderByNo/getTenantOrders 透传与 limit/offset/total
 *   5. cancelSubscription/reactivateSubscription 无订阅→false、前置条件校验
 *   6. getPaymentParams 订单不存在/已支付/成功 payUrl 拼装
 *
 * Mock 要点：
 *   - @prisma/client: PrismaClient 构造器返回 mockPrisma 单例；$transaction
 *     默认以 mockPrisma 作为 tx 回调参数（与实现中 tx === prisma 行为一致）
 *   - @/lib/saas/tenant.service: 提供与源码一致的 PLAN_CONFIGS 价目（free:0 /
 *     pro:39 / enterprise:199）及可控的 getCurrentSubscription 桩；changePlan 占位
 *   - 使用 vi.useFakeTimers + setSystemTime 固定 now，使 daysLeft 与周期计算可断言
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockPrisma, mockGetCurrentSubscription } = vi.hoisted(() => {
  const mockPrisma = {
    order: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    tenant: {
      update: vi.fn(),
    },
    // $transaction 默认把回调的 tx 参数指向 mockPrisma 自身（实现中 tx 方法
    // 名与 prisma 一致，故可复用），需要时单测可覆盖为 reject 以走错误分支。
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  };
  const mockGetCurrentSubscription = vi.fn();
  return { mockPrisma, mockGetCurrentSubscription };
});

vi.mock('@prisma/client', () => ({
  // 用普通 function 而非 vi.fn，使 `new PrismaClient()` 可作为构造器调用
  // （function 构造器内 return 对象会覆盖 new 出的实例，故返回 mockPrisma 单例）
  PrismaClient: function PrismaClient() {
    return mockPrisma;
  },
}));

vi.mock('@/lib/saas/tenant.service', () => ({
  // 价目与 src/lib/saas/tenant.service.ts PLAN_CONFIGS 保持一致，确保金额计算真实
  PLAN_CONFIGS: {
    free: { name: '免费版', price: 0, storageQuota: 1 * 1024 ** 3, aiQuota: 50, maxFiles: 1000, features: [] },
    pro: { name: '专业版', price: 39, storageQuota: 50 * 1024 ** 3, aiQuota: 500, maxFiles: 50000, features: [] },
    enterprise: { name: '企业版', price: 199, storageQuota: 500 * 1024 ** 3, aiQuota: 5000, maxFiles: -1, features: [] },
  },
  getCurrentSubscription: (...args: unknown[]) => mockGetCurrentSubscription(...(args as [string])),
  changePlan: vi.fn(),
}));

import {
  createOrder,
  getOrder,
  getOrderByNo,
  getTenantOrders,
  handlePaymentSuccess,
  cancelSubscription,
  reactivateSubscription,
  isSubscriptionExpiringSoon,
  getPaymentParams,
} from '@/lib/saas/billing.service';

const TENANT_ID = 'tenant-001';
// 固定 now：2026-06-30T00:00:00.000Z，使 daysLeft / 周期计算可精确断言
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

describe('saas/billing.service - createOrder 金额计算', () => {
  it('pro 月付 qty=1：amount = 39*100*1 = 3900', async () => {
    const created = { id: 'o1', orderNo: 'KB123', amount: 3900, status: 'pending' };
    mockPrisma.order.create.mockResolvedValue(created);

    const res = await createOrder(TENANT_ID, 'pro', 'month', 1);

    expect(res).toEqual(created);
    const call = mockPrisma.order.create.mock.calls[0][0];
    expect(call.data.tenantId).toBe(TENANT_ID);
    expect(call.data.amount).toBe(3900);
    expect(call.data.plan).toBe('pro');
    expect(call.data.interval).toBe('month');
    expect(call.data.quantity).toBe(1);
    expect(call.data.status).toBe('pending');
  });

  it('pro 年付 qty=1：amount = 3900 * 10 = 39000（买10送2）', async () => {
    mockPrisma.order.create.mockResolvedValue({ id: 'o2' });
    await createOrder(TENANT_ID, 'pro', 'year', 1);
    expect(mockPrisma.order.create.mock.calls[0][0].data.amount).toBe(39000);
  });

  it('enterprise 月付 qty=2：amount = 199*100*2 = 39800', async () => {
    mockPrisma.order.create.mockResolvedValue({ id: 'o3' });
    await createOrder(TENANT_ID, 'enterprise', 'month', 2);
    expect(mockPrisma.order.create.mock.calls[0][0].data.amount).toBe(39800);
  });

  it('enterprise 年付 qty=3：amount = 199*100*3*10 = 597000', async () => {
    mockPrisma.order.create.mockResolvedValue({ id: 'o4' });
    await createOrder(TENANT_ID, 'enterprise', 'year', 3);
    expect(mockPrisma.order.create.mock.calls[0][0].data.amount).toBe(597000);
  });

  it('free 套餐：amount = 0', async () => {
    mockPrisma.order.create.mockResolvedValue({ id: 'o5' });
    await createOrder(TENANT_ID, 'free', 'month', 1);
    expect(mockPrisma.order.create.mock.calls[0][0].data.amount).toBe(0);
  });

  it('interval 默认 month、quantity 默认 1', async () => {
    mockPrisma.order.create.mockResolvedValue({ id: 'o6' });
    await createOrder(TENANT_ID, 'pro');
    const data = mockPrisma.order.create.mock.calls[0][0].data;
    expect(data.interval).toBe('month');
    expect(data.quantity).toBe(1);
    expect(data.amount).toBe(3900);
  });

  it('orderNo 格式为 KB + 时间戳 + 6 位大写字母数字随机串', async () => {
    mockPrisma.order.create.mockResolvedValue({ id: 'o7' });
    await createOrder(TENANT_ID, 'pro', 'month', 1);
    const { orderNo } = mockPrisma.order.create.mock.calls[0][0].data;
    expect(orderNo).toMatch(/^KB\d+[A-Z0-9]{6}$/);
    expect(orderNo.startsWith('KB')).toBe(true);
  });

  it('两次调用生成不同 orderNo（随机段不同）', async () => {
    mockPrisma.order.create.mockResolvedValue({ id: 'o8' });
    await createOrder(TENANT_ID, 'pro', 'month', 1);
    await createOrder(TENANT_ID, 'pro', 'month', 1);
    const no1 = mockPrisma.order.create.mock.calls[0][0].data.orderNo;
    const no2 = mockPrisma.order.create.mock.calls[1][0].data.orderNo;
    expect(no1).not.toBe(no2);
  });
});

describe('saas/billing.service - isSubscriptionExpiringSoon 边界', () => {
  it('无活跃订阅：返回 { expiring: false }，无 daysLeft/currentPeriodEnd', async () => {
    mockGetCurrentSubscription.mockResolvedValue(null);
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res).toEqual({ expiring: false });
    expect(res).not.toHaveProperty('daysLeft');
  });

  it('daysLeft = 7（恰 7 天）：expiring = true（<=7 且 >0 临界）', async () => {
    mockGetCurrentSubscription.mockResolvedValue({
      currentPeriodEnd: new Date(NOW.getTime() + 7 * DAY),
    });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.expiring).toBe(true);
    expect(res.daysLeft).toBe(7);
  });

  it('daysLeft = 8：expiring = false（>7）', async () => {
    mockGetCurrentSubscription.mockResolvedValue({
      currentPeriodEnd: new Date(NOW.getTime() + 8 * DAY),
    });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.expiring).toBe(false);
    expect(res.daysLeft).toBe(8);
  });

  it('daysLeft = 1：expiring = true', async () => {
    mockGetCurrentSubscription.mockResolvedValue({
      currentPeriodEnd: new Date(NOW.getTime() + 1 * DAY),
    });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.expiring).toBe(true);
    expect(res.daysLeft).toBe(1);
  });

  it('daysLeft = 0（恰好到期）：expiring = false（>0 不成立）', async () => {
    mockGetCurrentSubscription.mockResolvedValue({
      currentPeriodEnd: new Date(NOW.getTime()),
    });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.expiring).toBe(false);
    expect(res.daysLeft).toBe(0);
  });

  it('daysLeft 为负（已过期）：expiring = false', async () => {
    mockGetCurrentSubscription.mockResolvedValue({
      currentPeriodEnd: new Date(NOW.getTime() - 3 * DAY),
    });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.expiring).toBe(false);
    expect(res.daysLeft).toBe(-3);
  });

  it('6.5 天：ceil(6.5)=7 → expiring = true（向上取整临界）', async () => {
    mockGetCurrentSubscription.mockResolvedValue({
      currentPeriodEnd: new Date(NOW.getTime() + 6.5 * DAY),
    });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.daysLeft).toBe(7);
    expect(res.expiring).toBe(true);
  });

  it('7.5 天：ceil(7.5)=8 → expiring = false', async () => {
    mockGetCurrentSubscription.mockResolvedValue({
      currentPeriodEnd: new Date(NOW.getTime() + 7.5 * DAY),
    });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.daysLeft).toBe(8);
    expect(res.expiring).toBe(false);
  });

  it('返回 currentPeriodEnd 透传订阅原值', async () => {
    const end = new Date(NOW.getTime() + 5 * DAY);
    mockGetCurrentSubscription.mockResolvedValue({ currentPeriodEnd: end });
    const res = await isSubscriptionExpiringSoon(TENANT_ID);
    expect(res.currentPeriodEnd).toEqual(end);
  });

  it('调用 getCurrentSubscription 时传入 tenantId', async () => {
    mockGetCurrentSubscription.mockResolvedValue(null);
    await isSubscriptionExpiringSoon(TENANT_ID);
    expect(mockGetCurrentSubscription).toHaveBeenCalledWith(TENANT_ID);
  });
});

describe('saas/billing.service - handlePaymentSuccess 订阅周期计算', () => {
  const ORDER_PENDING = {
    id: 'order-1',
    tenantId: TENANT_ID,
    orderNo: 'KB-NO-1',
    status: 'pending',
    plan: 'pro',
    interval: 'month',
    quantity: 1,
  };

  it('订单不存在：返回 { success: false }，不进入事务', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const res = await handlePaymentSuccess('KB-NO-X', 'tx-1', 'alipay');
    expect(res).toEqual({ success: false });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('订单已支付（幂等）：返回当前订阅，不进入事务', async () => {
    const paidOrder = { ...ORDER_PENDING, status: 'paid' };
    mockPrisma.order.findUnique.mockResolvedValue(paidOrder);
    const sub = { id: 'sub-1', plan: 'pro' };
    mockGetCurrentSubscription.mockResolvedValue(sub);

    const res = await handlePaymentSuccess('KB-NO-1', 'tx-1', 'alipay');

    expect(res).toEqual({ success: true, order: paidOrder, subscription: sub });
    expect(mockGetCurrentSubscription).toHaveBeenCalledWith(TENANT_ID);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('订单已支付但无订阅：subscription 字段为 undefined', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ ...ORDER_PENDING, status: 'paid' });
    mockGetCurrentSubscription.mockResolvedValue(null);
    const res = await handlePaymentSuccess('KB-NO-1', 'tx-1', 'alipay');
    expect(res.success).toBe(true);
    expect(res.subscription).toBeUndefined();
  });

  it('续费同套餐：baseDate 用旧周期尾（>now），newPeriodEnd = 旧尾 + 1 月', async () => {
    const oldEnd = new Date('2026-08-01T00:00:00.000Z'); // > now
    mockPrisma.order.findUnique.mockResolvedValue(ORDER_PENDING);
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-old',
      plan: 'pro',
      currentPeriodEnd: oldEnd,
    });
    const updatedOrder = { ...ORDER_PENDING, status: 'paid' };
    mockPrisma.order.update.mockResolvedValue(updatedOrder);
    const renewedSub = { id: 'sub-old', plan: 'pro', currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z') };
    mockPrisma.subscription.update.mockResolvedValue(renewedSub);

    const res = await handlePaymentSuccess('KB-NO-1', 'tx-1', 'alipay');

    expect(res.success).toBe(true);
    // 续费路径：调用 subscription.update，未调用 create / tenant.update
    expect(mockPrisma.subscription.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
    expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    const updateArgs = mockPrisma.subscription.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe('sub-old');
    // baseDate = oldEnd(2026-08-01) + 1 月 → 2026-09-01
    expect(new Date(updateArgs.data.currentPeriodEnd).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(updateArgs.data.cancelAtPeriodEnd).toBe(false);
  });

  it('续费同套餐：旧周期尾 < now 时 baseDate 用 now', async () => {
    const oldEnd = new Date('2026-06-15T00:00:00.000Z'); // < now(2026-06-30)
    mockPrisma.order.findUnique.mockResolvedValue(ORDER_PENDING);
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-old',
      plan: 'pro',
      currentPeriodEnd: oldEnd,
    });
    mockPrisma.order.update.mockResolvedValue({ ...ORDER_PENDING, status: 'paid' });
    mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-old' });

    await handlePaymentSuccess('KB-NO-1', 'tx-1', 'alipay');

    const updateArgs = mockPrisma.subscription.update.mock.calls[0][0];
    // baseDate = now(2026-06-30) + 1 月 → 2026-07-30
    expect(new Date(updateArgs.data.currentPeriodEnd).toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('续费同套餐年付 qty=2：newPeriodEnd = baseDate + 24 月', async () => {
    const oldEnd = new Date('2026-08-01T00:00:00.000Z');
    mockPrisma.order.findUnique.mockResolvedValue({ ...ORDER_PENDING, interval: 'year', quantity: 2 });
    mockPrisma.subscription.findFirst.mockResolvedValue({ id: 'sub-old', plan: 'pro', currentPeriodEnd: oldEnd });
    mockPrisma.order.update.mockResolvedValue({ ...ORDER_PENDING, status: 'paid' });
    mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-old' });

    await handlePaymentSuccess('KB-NO-1', 'tx-1', 'alipay');

    const updateArgs = mockPrisma.subscription.update.mock.calls[0][0];
    // 2026-08-01 + 24 月 → 2028-08-01
    expect(new Date(updateArgs.data.currentPeriodEnd).toISOString()).toBe('2028-08-01T00:00:00.000Z');
  });

  it('换套餐：取消旧订阅 + 创建新订阅 + 更新租户配额', async () => {
    const oldEnd = new Date('2026-08-01T00:00:00.000Z');
    const order = { ...ORDER_PENDING, plan: 'enterprise' }; // 旧订阅 plan=pro → 换套餐
    mockPrisma.order.findUnique.mockResolvedValue(order);
    mockPrisma.subscription.findFirst.mockResolvedValue({ id: 'sub-old', plan: 'pro', currentPeriodEnd: oldEnd });
    mockPrisma.order.update.mockResolvedValue({ ...order, status: 'paid' });
    const newSub = { id: 'sub-new', plan: 'enterprise' };
    mockPrisma.subscription.create.mockResolvedValue(newSub);

    const res = await handlePaymentSuccess('KB-NO-1', 'tx-1', 'wechat');

    expect(res.success).toBe(true);
    expect(res.subscription).toEqual(newSub);
    // 1) 取消旧订阅（status:cancelled, endedAt）
    const cancelCall = mockPrisma.subscription.update.mock.calls.find(
      (c) => c[0].where.id === 'sub-old'
    );
    expect(cancelCall).toBeDefined();
    expect(cancelCall![0].data.status).toBe('cancelled');
    expect(cancelCall![0].data.endedAt).toEqual(NOW);
    // 2) 创建新订阅：plan=enterprise, price=PLAN_CONFIGS.enterprise.price(199), status=active
    const createArgs = mockPrisma.subscription.create.mock.calls[0][0];
    expect(createArgs.data.plan).toBe('enterprise');
    expect(createArgs.data.price).toBe(199);
    expect(createArgs.data.status).toBe('active');
    expect(createArgs.data.tenantId).toBe(TENANT_ID);
    // baseDate=旧周期尾(2026-08-01, > now) + 1 月 → 2026-09-01
    expect(new Date(createArgs.data.currentPeriodEnd).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    // 3) 更新租户配额：plan/storageQuota/aiQuota/currentPeriodEnd
    const tenantArgs = mockPrisma.tenant.update.mock.calls[0][0];
    expect(tenantArgs.where.id).toBe(TENANT_ID);
    expect(tenantArgs.data.plan).toBe('enterprise');
    expect(tenantArgs.data.storageQuota).toBe(500 * 1024 ** 3);
    expect(tenantArgs.data.aiQuota).toBe(5000);
  });

  it('新订阅（无旧订阅）：直接 create + 更新租户配额，不调用 update', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(ORDER_PENDING);
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.order.update.mockResolvedValue({ ...ORDER_PENDING, status: 'paid' });
    mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-new', plan: 'pro' });

    const res = await handlePaymentSuccess('KB-NO-1', 'tx-1', 'alipay');

    expect(res.success).toBe(true);
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    expect(mockPrisma.subscription.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tenant.update).toHaveBeenCalledTimes(1);
  });

  it('订单状态更新：tx.order.update 写入 paid/payMethod/payTime/transactionId', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(ORDER_PENDING);
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.order.update.mockResolvedValue({ ...ORDER_PENDING, status: 'paid' });
    mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-new' });

    await handlePaymentSuccess('KB-NO-1', 'trade-123', 'wechat');

    const orderUpdateArgs = mockPrisma.order.update.mock.calls[0][0];
    expect(orderUpdateArgs.where.id).toBe('order-1');
    expect(orderUpdateArgs.data.status).toBe('paid');
    expect(orderUpdateArgs.data.payMethod).toBe('wechat');
    expect(orderUpdateArgs.data.transactionId).toBe('trade-123');
    expect(orderUpdateArgs.data.payTime).toEqual(NOW);
  });

  it('事务抛错：catch 后返回 { success: false }', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(ORDER_PENDING);
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('tx boom'));

    const res = await handlePaymentSuccess('KB-NO-1', 'tx-1', 'alipay');

    expect(res).toEqual({ success: false });
  });
});

describe('saas/billing.service - 订单查询', () => {
  it('getOrder：按 id 调 order.findUnique 并透传结果', async () => {
    const order = { id: 'o1', status: 'paid' };
    mockPrisma.order.findUnique.mockResolvedValue(order);
    const res = await getOrder('o1');
    expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({ where: { id: 'o1' } });
    expect(res).toEqual(order);
  });

  it('getOrder：订单不存在返回 null', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const res = await getOrder('missing');
    expect(res).toBeNull();
  });

  it('getOrderByNo：按 orderNo 调 order.findUnique', async () => {
    const order = { id: 'o1', orderNo: 'KB123' };
    mockPrisma.order.findUnique.mockResolvedValue(order);
    const res = await getOrderByNo('KB123');
    expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({ where: { orderNo: 'KB123' } });
    expect(res).toEqual(order);
  });

  it('getTenantOrders：并行 findMany + count，透传 limit/offset，返回 { orders, total }', async () => {
    const orders = [{ id: 'o1' }, { id: 'o2' }];
    mockPrisma.order.findMany.mockResolvedValue(orders);
    mockPrisma.order.count.mockResolvedValue(42);

    const res = await getTenantOrders(TENANT_ID, 10, 5);

    expect(res).toEqual({ orders, total: 42 });
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: 5,
    });
    expect(mockPrisma.order.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
  });

  it('getTenantOrders：limit/offset 默认 20/0', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.order.count.mockResolvedValue(0);
    await getTenantOrders(TENANT_ID);
    const args = mockPrisma.order.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.skip).toBe(0);
  });
});

describe('saas/billing.service - cancelSubscription / reactivateSubscription', () => {
  it('cancelSubscription：无活跃订阅返回 false，不调用 update', async () => {
    mockGetCurrentSubscription.mockResolvedValue(null);
    const res = await cancelSubscription(TENANT_ID);
    expect(res).toBe(false);
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it('cancelSubscription：有订阅则置 cancelAtPeriodEnd=true 并返回 true', async () => {
    mockGetCurrentSubscription.mockResolvedValue({ id: 'sub-1', cancelAtPeriodEnd: false });
    mockPrisma.subscription.update.mockResolvedValue({});
    const res = await cancelSubscription(TENANT_ID);
    expect(res).toBe(true);
    const args = mockPrisma.subscription.update.mock.calls[0][0];
    expect(args.where.id).toBe('sub-1');
    expect(args.data.cancelAtPeriodEnd).toBe(true);
    expect(args.data.canceledAt).toEqual(NOW);
  });

  it('reactivateSubscription：无订阅返回 false', async () => {
    mockGetCurrentSubscription.mockResolvedValue(null);
    const res = await reactivateSubscription(TENANT_ID);
    expect(res).toBe(false);
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it('reactivateSubscription：订阅未取消（cancelAtPeriodEnd=false）返回 false', async () => {
    mockGetCurrentSubscription.mockResolvedValue({ id: 'sub-1', cancelAtPeriodEnd: false });
    const res = await reactivateSubscription(TENANT_ID);
    expect(res).toBe(false);
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it('reactivateSubscription：已取消订阅恢复 cancelAtPeriodEnd=false / canceledAt=null', async () => {
    mockGetCurrentSubscription.mockResolvedValue({ id: 'sub-1', cancelAtPeriodEnd: true });
    mockPrisma.subscription.update.mockResolvedValue({});
    const res = await reactivateSubscription(TENANT_ID);
    expect(res).toBe(true);
    const args = mockPrisma.subscription.update.mock.calls[0][0];
    expect(args.where.id).toBe('sub-1');
    expect(args.data.cancelAtPeriodEnd).toBe(false);
    expect(args.data.canceledAt).toBeNull();
  });
});

describe('saas/billing.service - getPaymentParams', () => {
  it('订单不存在：返回 { success: false, error: "订单不存在" }', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const res = await getPaymentParams('o1', 'alipay');
    expect(res).toEqual({ success: false, error: '订单不存在' });
  });

  it('订单已支付：返回 { success: false, error: "订单已支付" }', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNo: 'KB1', status: 'paid' });
    const res = await getPaymentParams('o1', 'alipay');
    expect(res).toEqual({ success: false, error: '订单已支付' });
  });

  it('待支付订单：返回 success=true 及拼装 payUrl（含 payMethod 与 orderNo）', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNo: 'KB-NO-9', status: 'pending' });
    const res = await getPaymentParams('o1', 'wechat');
    expect(res.success).toBe(true);
    expect(res.payUrl).toBe('https://pay.example.com/wechat?orderNo=KB-NO-9');
  });

  it('payMethod=alipay 时 payUrl 路径段为 alipay', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNo: 'KB-NO-10', status: 'pending' });
    const res = await getPaymentParams('o1', 'alipay');
    expect(res.payUrl).toBe('https://pay.example.com/alipay?orderNo=KB-NO-10');
  });
});
