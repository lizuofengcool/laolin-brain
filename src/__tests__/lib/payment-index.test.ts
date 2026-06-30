/**
 * 支付服务工厂 + 回调编排单测
 *
 * 覆盖 src/lib/payment/index.ts：
 *   - getPaymentProvider / createPayment / queryPayment / refundPayment 工厂委托
 *   - processPaymentCallback 编排：签名校验、订单查询、幂等、金额一致性校验、
 *     事务内订单/订阅/租户配额更新
 *
 * 重点回归：paid 路径发放权益前必须校验回调金额 === 订单金额，不一致时不发放权益、
 * 不更新订单状态（保持 pending 供人工对账）；failed 路径不发放权益，跳过金额校验。
 *
 * Mock 策略：alipay/wechat provider 单例与 @/lib/db 全部隔离，不触达真实数据库与网络。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPaymentProvider,
  createPayment,
  queryPayment,
  refundPayment,
  processPaymentCallback,
} from '@/lib/payment';

// vi.hoisted 确保 mock 引用在 vi.mock 工厂执行（模块导入）时已就绪
const { mockAlipay, mockWechat, mockDb, mockTx } = vi.hoisted(() => {
  const mockAlipay = {
    verifyCallback: vi.fn(),
    createPayment: vi.fn(),
    queryPayment: vi.fn(),
    refund: vi.fn(),
  };
  const mockWechat = {
    verifyCallback: vi.fn(),
    createPayment: vi.fn(),
    queryPayment: vi.fn(),
    refund: vi.fn(),
  };
  const mockTx = {
    order: { update: vi.fn() },
    subscription: { updateMany: vi.fn(), create: vi.fn() },
    tenant: { update: vi.fn() },
  };
  const mockDb = {
    order: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { mockAlipay, mockWechat, mockDb, mockTx };
});

vi.mock('@/lib/payment/alipay', () => ({ alipayProvider: mockAlipay }));
vi.mock('@/lib/payment/wechat', () => ({ wechatPayProvider: mockWechat }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

// 订单基线：amount=9900 分（与 PLAN_CONFIGS.pro 月付一致），status=pending
const ORDER = {
  id: 'order-1',
  orderNo: 'ORD-1',
  amount: 9900,
  status: 'pending',
  tenantId: 'tenant-1',
  plan: 'pro',
  interval: 'month',
  tenant: { id: 'tenant-1', plan: 'free' },
};

describe('getPaymentProvider / 工厂委托', () => {
  it("getPaymentProvider('alipay') 返回 alipayProvider 单例", () => {
    expect(getPaymentProvider('alipay')).toBe(mockAlipay);
  });

  it("getPaymentProvider('wechat') 返回 wechatPayProvider 单例", () => {
    expect(getPaymentProvider('wechat')).toBe(mockWechat);
  });

  it('getPaymentProvider 未知方法抛错', () => {
    expect(() => getPaymentProvider('xxx' as never)).toThrow(/Unsupported payment method/);
  });

  it('createPayment 委托给对应 provider 并透传参数', async () => {
    mockAlipay.createPayment.mockResolvedValue({ success: true, payUrl: '/pay' });
    const params = {
      orderNo: 'O1',
      amount: 100,
      subject: 's',
      notifyUrl: 'u',
      tenantId: 't',
      userId: 'u',
    };
    const r = await createPayment('alipay', params);
    expect(mockAlipay.createPayment).toHaveBeenCalledWith(params);
    expect(r.success).toBe(true);
  });

  it('queryPayment 委托给对应 provider', async () => {
    mockWechat.queryPayment.mockResolvedValue({ success: true, status: 'pending' });
    const r = await queryPayment('wechat', 'O1');
    expect(mockWechat.queryPayment).toHaveBeenCalledWith('O1');
    expect(r.status).toBe('pending');
  });

  it('refundPayment 委托给对应 provider', async () => {
    mockAlipay.refund.mockResolvedValue({ success: true, refundNo: 'R1' });
    const params = { orderNo: 'O1', tradeNo: 'T1', amount: 100 };
    const r = await refundPayment('alipay', params);
    expect(mockAlipay.refund).toHaveBeenCalledWith(params);
    expect(r.refundNo).toBe('R1');
  });
});

describe('processPaymentCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 事务回调：执行 fn(mockTx)，模拟 Prisma $transaction(fn) 语义
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx)
    );
    mockDb.order.findUnique.mockResolvedValue(ORDER);
    mockTx.order.update.mockResolvedValue({});
    mockTx.subscription.updateMany.mockResolvedValue({ count: 0 });
    mockTx.subscription.create.mockResolvedValue({});
    mockTx.tenant.update.mockResolvedValue({});
  });

  it('签名验证失败 → success:false，不触达 db.order', async () => {
    mockAlipay.verifyCallback.mockResolvedValue({ success: false, error: '签名验证失败' });
    const r = await processPaymentCallback('alipay', {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('签名验证失败');
    expect(mockDb.order.findUnique).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('verifyResult 缺 orderNo → success:false，不触达 db.order', async () => {
    mockAlipay.verifyCallback.mockResolvedValue({ success: true }); // 无 orderNo
    const r = await processPaymentCallback('alipay', {});
    expect(r.success).toBe(false);
    expect(mockDb.order.findUnique).not.toHaveBeenCalled();
  });

  it('订单不存在 → success:false 订单不存在，不触达事务', async () => {
    mockAlipay.verifyCallback.mockResolvedValue({
      success: true,
      orderNo: 'ORD-X',
      amount: 9900,
      status: 'paid',
    });
    mockDb.order.findUnique.mockResolvedValue(null);
    const r = await processPaymentCallback('alipay', {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('订单不存在');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('订单已处理（status=paid）→ 幂等 success:true 订单已处理，不触达事务', async () => {
    mockAlipay.verifyCallback.mockResolvedValue({
      success: true,
      orderNo: 'ORD-1',
      amount: 9900,
      status: 'paid',
    });
    mockDb.order.findUnique.mockResolvedValue({ ...ORDER, status: 'paid' });
    const r = await processPaymentCallback('alipay', {});
    expect(r.success).toBe(true);
    expect(r.message).toBe('订单已处理');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('金额一致 + paid → 事务触达：订单更新 paid、取消旧订阅、创建新订阅、更新租户配额', async () => {
    mockAlipay.verifyCallback.mockResolvedValue({
      success: true,
      orderNo: 'ORD-1',
      tradeNo: 'T1',
      amount: 9900,
      status: 'paid',
    });
    const r = await processPaymentCallback('alipay', {});
    expect(r.success).toBe(true);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({ status: 'paid', transactionId: 'T1' }),
      })
    );
    expect(mockTx.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', status: 'active' },
        data: expect.objectContaining({ status: 'cancelled' }),
      })
    );
    expect(mockTx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          plan: 'pro',
          status: 'active',
          interval: 'month',
        }),
      })
    );
    expect(mockTx.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({ plan: 'pro' }),
      })
    );
  });

  it('金额不一致（paid，回调 100 分 vs 订单 9900 分）→ success:false 回调金额与订单金额不一致，不触达事务（不发放权益）', async () => {
    mockAlipay.verifyCallback.mockResolvedValue({
      success: true,
      orderNo: 'ORD-1',
      amount: 100, // 与订单 9900 不一致
      status: 'paid',
    });
    const r = await processPaymentCallback('alipay', {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('回调金额与订单金额不一致');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockTx.subscription.create).not.toHaveBeenCalled();
    expect(mockTx.tenant.update).not.toHaveBeenCalled();
  });

  it('金额为 undefined（paid）→ success:false，不触达事务（NaN 视为不一致）', async () => {
    mockWechat.verifyCallback.mockResolvedValue({
      success: true,
      orderNo: 'ORD-1',
      status: 'paid', // 无 amount 字段
    });
    const r = await processPaymentCallback('wechat', {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('回调金额与订单金额不一致');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('failed 状态跳过金额校验 → 事务触达，订单更新 failed，不创建订阅/不更新配额', async () => {
    // 金额故意为 1（与订单 9900 不一致），但 failed 路径不发放权益，无需校验
    mockWechat.verifyCallback.mockResolvedValue({
      success: true,
      orderNo: 'ORD-1',
      tradeNo: 'T2',
      amount: 1,
      status: 'failed',
    });
    const r = await processPaymentCallback('wechat', {});
    expect(r.success).toBe(true);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', payTime: null }),
      })
    );
    expect(mockTx.subscription.create).not.toHaveBeenCalled();
    expect(mockTx.tenant.update).not.toHaveBeenCalled();
  });

  it('verifyCallback 抛错 → catch 返回 success:false 且带 error.message', async () => {
    mockAlipay.verifyCallback.mockRejectedValue(new Error('boom'));
    const r = await processPaymentCallback('alipay', {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom');
  });

  it('按 orderNo 查询订单（include tenant）', async () => {
    mockAlipay.verifyCallback.mockResolvedValue({
      success: true,
      orderNo: 'ORD-1',
      amount: 9900,
      status: 'paid',
    });
    await processPaymentCallback('alipay', {});
    expect(mockDb.order.findUnique).toHaveBeenCalledWith({
      where: { orderNo: 'ORD-1' },
      include: { tenant: true },
    });
  });
});
