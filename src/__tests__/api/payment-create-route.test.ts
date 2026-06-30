/**
 * 创建支付订单路由 handler 级集成测试
 *
 * 锁定 src/app/api/payment/create/route.ts 的控制流契约，覆盖 worklog 第七十三轮
 * "下一轮候选"第 1 项：payment create 路由（创建订单 + 调 createPayment）的 handler
 * 级集成测试，含 mock provider + 校验订单创建/金额/plan 落库与 createPayment 失败回退。
 *
 * 路由控制流分支：
 *   1. 未认证（authenticateRequest 返回 NextResponse）→ 透传 401，不创建订单/支付
 *   2. 参数校验（顺序敏感）：
 *      · 缺 planId / interval / payMethod 任一 → 400 "缺少必要参数"
 *      · payMethod ∉ {alipay, wechat} → 400 "不支持的支付方式"
 *      · interval ∉ {month, year} → 400 "不支持的计费周期"
 *      · planId 不在 PLANS → 400 "无效的套餐"
 *      · planId === 'free' → 400 "免费套餐无需支付"
 *   3. createOrder(tenantId, planId, interval, payMethod) → 订单落库（mock）
 *   4. createPayment(payMethod, { orderNo, amount:Number(order.amount), subject, description,
 *      notifyUrl, tenantId, userId }) → 第三方下单
 *   5. createPayment 成功 → 200 { orderId, orderNo, amount, payUrl, qrCode, tradeNo, payMethod }
 *   6. createPayment success:false → 500 payResult.error || '创建支付订单失败'
 *   7. createOrder / createPayment 抛错 → catch 500 error.message || '创建支付订单失败'
 *
 * 关键契约：amount 来自 createOrder 返回的 order.amount（经 Number() 转换），
 * 不在路由内按 plan.price 重算；subject/description 由 PLANS[planId].name + interval 拼装；
 * notifyUrl 由 getNotifyUrl(payMethod) 提供。
 *
 * Mock 策略：next/server / @/lib/api-auth / @/lib/payment / @/lib/billing/subscription
 * / @/lib/db 全部隔离，不触达真实数据库与网络。复用 payment-status-route 的
 * vi.hoisted + MockNextResponse 范式。PLANS 提供与 src/lib/billing/subscription.ts
 * 一致的 free/pro/enterprise 子集，使参数校验分支测试具有真实语义。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  MockNextResponse,
  PLANS,
  mockAuthenticate,
  mockCreateOrder,
  mockCreatePayment,
  mockGetNotifyUrl,
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
  // 与 src/lib/billing/subscription.ts 的 PLANS 保持一致的字段子集
  // （路由仅读取 .name 与存在性，price 由 createOrder 内部使用，此处仅留可读性）
  const PLANS = {
    free: { id: 'free', name: '免费版', price: { monthly: 0, yearly: 0 } },
    pro: { id: 'pro', name: '专业版', price: { monthly: 3900, yearly: 39000 } },
    enterprise: {
      id: 'enterprise',
      name: '企业版',
      price: { monthly: 19900, yearly: 199000 },
    },
  };
  return {
    MockNextResponse,
    PLANS,
    mockAuthenticate: vi.fn(),
    mockCreateOrder: vi.fn(),
    mockCreatePayment: vi.fn(),
    mockGetNotifyUrl: vi.fn(),
  };
});

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock('@/lib/payment', () => ({
  createPayment: (...args: unknown[]) => mockCreatePayment(...args),
  getNotifyUrl: (...args: unknown[]) => mockGetNotifyUrl(...args),
}));
vi.mock('@/lib/billing/subscription', () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  PLANS,
}));
// 路由 import { db } 但未直接使用；mock 掉避免 PrismaClient 实例化副作用
vi.mock('@/lib/db', () => ({ db: {} }));

import { POST } from '@/app/api/payment/create/route';

type MockRes = InstanceType<typeof MockNextResponse>;

// 已认证用户的默认身份（与 api-auth.ts AuthResult 4 字段对齐）
const AUTH_USER = {
  userId: 'user-1',
  email: 'u@x.com',
  tenantId: 'tenant-1',
  role: 'owner',
};

/**
 * 构造 POST /api/payment/create 请求，body 以 JSON 序列化。
 * 路由用 request.json() 解析，标准 Request 在 Node undici 下支持。
 */
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/payment/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/**
 * 构造 createOrder 返回的订单基线。amount 取 number（路由 Number(order.amount) 直通）。
 */
function makeOrder(overrides: Partial<{
  id: string;
  orderNo: string;
  amount: number;
}> = {}) {
  return {
    id: 'ord-1',
    orderNo: 'ORD-123',
    amount: 3900,
    ...overrides,
  };
}

describe('POST /api/payment/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(AUTH_USER);
    mockCreateOrder.mockResolvedValue(makeOrder());
    mockCreatePayment.mockResolvedValue({
      success: true,
      payUrl: 'https://pay.example.com/alipay',
      qrCode: 'alipay-qr',
      tradeNo: 'alipay-trade-123',
    });
    mockGetNotifyUrl.mockImplementation((m: string) =>
      m === 'alipay' ? 'http://notify/alipay' : 'http://notify/wechat',
    );
  });

  // ---- 分支 1：未认证 ----
  it('未认证时透传 authenticateRequest 的 401，不创建订单/支付', async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: '未提供身份认证令牌' }, { status: 401 }),
    );

    const res = (await POST(makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' }))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: '未提供身份认证令牌' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockCreatePayment).not.toHaveBeenCalled();
  });

  // ---- 分支 2：参数校验（顺序敏感）----
  it('缺少 planId → 400 "缺少必要参数"', async () => {
    const res = (await POST(makeRequest({ interval: 'month', payMethod: 'alipay' }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '缺少必要参数' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('缺少 interval → 400 "缺少必要参数"', async () => {
    const res = (await POST(makeRequest({ planId: 'pro', payMethod: 'alipay' }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '缺少必要参数' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('缺少 payMethod → 400 "缺少必要参数"', async () => {
    const res = (await POST(makeRequest({ planId: 'pro', interval: 'month' }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '缺少必要参数' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('payMethod 非 alipay/wechat（如 "balance"）→ 400 "不支持的支付方式"', async () => {
    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'month', payMethod: 'balance' }),
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '不支持的支付方式' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('interval 非 month/year（如 "weekly"）→ 400 "不支持的计费周期"', async () => {
    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'weekly', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '不支持的计费周期' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('planId 不在 PLANS（如 "nonexistent"）→ 400 "无效的套餐"', async () => {
    const res = (await POST(
      makeRequest({ planId: 'nonexistent', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '无效的套餐' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('planId=free → 400 "免费套餐无需支付"（free 在 PLANS 中但跳过支付）', async () => {
    const res = (await POST(
      makeRequest({ planId: 'free', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '免费套餐无需支付' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  // ---- 分支 3-5：成功路径 ----
  it('alipay + month + pro 成功 → createOrder/createPayment 调用契约 + 200 data', async () => {
    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    // createOrder 调用契约
    expect(mockCreateOrder).toHaveBeenCalledWith('tenant-1', 'pro', 'month', 'alipay');
    // createPayment 调用契约：amount 取自 order.amount（Number 转换），subject/description 由 plan.name 拼装
    expect(mockCreatePayment).toHaveBeenCalledWith('alipay', {
      orderNo: 'ORD-123',
      amount: 3900,
      subject: '专业版 - 月付',
      description: 'laolin-brain 专业版 订阅',
      notifyUrl: 'http://notify/alipay',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    // 响应 data：amount 透传 order.amount，payUrl/qrCode/tradeNo 来自 payResult
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        orderId: 'ord-1',
        orderNo: 'ORD-123',
        amount: 3900,
        payUrl: 'https://pay.example.com/alipay',
        qrCode: 'alipay-qr',
        tradeNo: 'alipay-trade-123',
        payMethod: 'alipay',
      },
    });
  });

  it('wechat + year + enterprise 成功 → subject "企业版 - 年付"，走 wechat provider', async () => {
    // enterprise/year 真实定价 199000 分，amount 透传自 order.amount
    mockCreateOrder.mockResolvedValue(makeOrder({ orderNo: 'ORD-ENT', amount: 199000 }));
    mockCreatePayment.mockResolvedValue({
      success: true,
      qrCode: 'wechat-qr',
      tradeNo: 'wechat-trade-999',
    });

    const res = (await POST(
      makeRequest({ planId: 'enterprise', interval: 'year', payMethod: 'wechat' }),
    )) as MockRes;

    expect(mockCreateOrder).toHaveBeenCalledWith('tenant-1', 'enterprise', 'year', 'wechat');
    expect(mockCreatePayment).toHaveBeenCalledWith('wechat', {
      orderNo: 'ORD-ENT',
      amount: 199000,
      subject: '企业版 - 年付',
      description: 'laolin-brain 企业版 订阅',
      notifyUrl: 'http://notify/wechat',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    expect(res.status).toBe(200);
    // payUrl 缺省（payResult 未提供）→ data.payUrl 为 undefined（JSON 序列化丢弃）
    expect((res.body as { data: { payMethod: string; tradeNo: string } }).data.payMethod).toBe('wechat');
    expect((res.body as { data: { tradeNo: string } }).data.tradeNo).toBe('wechat-trade-999');
  });

  // ---- 分支 6：createPayment 失败 ----
  it('createPayment 返回 success:false + error → 500 透传 payResult.error', async () => {
    mockCreatePayment.mockResolvedValue({ success: false, error: '支付宝下单网关异常' });

    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: '支付宝下单网关异常' });
  });

  it('createPayment 返回 success:false 无 error → 500 "创建支付订单失败" 兜底', async () => {
    mockCreatePayment.mockResolvedValue({ success: false });

    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: '创建支付订单失败' });
  });

  // ---- 分支 7：异常兜底 ----
  it('createOrder 抛错 → catch 500 error.message，createPayment 不调用', async () => {
    mockCreateOrder.mockRejectedValue(new Error('订单落库失败：租户不存在'));

    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: '订单落库失败：租户不存在' });
    expect(mockCreatePayment).not.toHaveBeenCalled();
  });

  it('createPayment 抛错 → catch 500 error.message', async () => {
    mockCreatePayment.mockRejectedValue(new Error('网络超时'));

    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: '网络超时' });
  });

  it('createPayment 抛非 Error 对象 → catch 500 "创建支付订单失败" 兜底', async () => {
    mockCreatePayment.mockRejectedValue('plain string throw');

    const res = (await POST(
      makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' }),
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: '创建支付订单失败' });
  });

  // ---- 认证调用契约 ----
  it('authenticateRequest 被调用一次并传入原 request', async () => {
    const req = makeRequest({ planId: 'pro', interval: 'month', payMethod: 'alipay' });

    await POST(req);

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockAuthenticate).toHaveBeenCalledWith(req);
  });
});
