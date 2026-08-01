/**
 * 支付状态查询路由 handler 级集成测试
 *
 * 锁定 src/app/api/payment/status/[orderId]/route.ts 的控制流契约，重点覆盖
 * worklog 第七十二轮"下一轮候选"第 1 项：queryPayment 状态回查与本地 order
 * 状态同步的回退路径。
 *
 * 路由控制流分支：
 *   1. 未认证（authenticateRequest 返回 NextResponse）→ 透传 401
 *   2. 订单不存在 / 跨租户（getOrderForTenant 返回 null）→ 404 "订单不存在"
 *   3. 订单已处终态（paid / failed / refunded）→ 直接返回本地订单状态，**不调用 queryPayment**
 *   4. 订单 pending + payMethod ∈ {alipay, wechat} + queryPayment success 且非 pending
 *      → 返回第三方查询结果（status / payTime / tradeNo 来自 payResult，金额仍取本地订单）
 *   5. 订单 pending + queryPayment 返回 pending / 失败（success:false）/ payMethod 缺失
 *      → **回退本地订单状态**（真实模式下 queryPayment 因未接入 SDK 返回 success:false，
 *        触发此回退分支，避免伪造状态掩盖真实查询未实现）
 *
 * 租户作用域化（第二百一十二轮）：原 findUnique where.id + order.tenant.users.find
 * 的 post-check 范式改为 getOrderForTenant(orderId, tenantId) 在 DB 层以 { id, tenantId }
 * findFirst 收紧。原「订单不存在」+「订单存在但属他租户（tenant.users 不含 userId）」
 * 两例合并为单例「findFirst 返回 null → 404」，与 saas/orders（第二百一十一轮）同范式。
 *
 * Mock 策略：next/server / @/lib/api-auth / @/lib/payment / @/lib/saas/billing.service
 * 全部隔离，不触达真实数据库与网络。复用 payment-callback-*-route 的 vi.hoisted +
 * MockNextResponse 范式；params 以 Promise.resolve 提供，对齐 Next.js 16 动态路由签名
 * （参考 files-id-route / cloud-sync-backups-id 范式）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { MockNextResponse, mockAuthenticate, mockQueryPayment, mockGetOrderForTenant } =
  vi.hoisted(() => {
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
      mockQueryPayment: vi.fn(),
      mockGetOrderForTenant: vi.fn(),
    };
  });

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('@/lib/api-auth', () => ({ authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args) }));
vi.mock('@/lib/payment', () => ({ queryPayment: (...args: unknown[]) => mockQueryPayment(...args) }));
vi.mock('@/lib/saas/billing.service', () => ({
  getOrderForTenant: (...args: unknown[]) => mockGetOrderForTenant(...args),
}));

import { GET } from '@/app/api/payment/status/[orderId]/route';

type MockRes = InstanceType<typeof MockNextResponse>;

// 已认证用户的默认身份
const AUTH_USER = { userId: 'user-1', email: 'u@x.com', tenantId: 'tenant-1', role: 'owner' };

/**
 * 构造已认证请求。authenticateRequest 默认返回 AUTH_USER；
 * 测试可覆写返回值以模拟未认证（返回 MockNextResponse）。
 */
function makeRequest(): NextRequest {
  return new Request('http://localhost/api/payment/status/ord-1', {
    method: 'GET',
  }) as unknown as NextRequest;
}

function ctx(orderId: string) {
  return { params: Promise.resolve({ orderId }) };
}

/**
 * 构造订单基线。amount 取 number（路由用 Number(order.amount) 转换，number 直通）。
 * 租户作用域化后路由不再读取 order.tenant / tenant.users（DB 层 tenantId 过滤已保证归属），
 * 故基线仅保留路由实际读取的扁平字段。
 */
function makeOrder(overrides: Partial<{
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  payMethod: string | null;
  payTime: Date | null;
  transactionId: string | null;
  tenantId: string;
}> = {}) {
  return {
    id: 'ord-1',
    orderNo: 'ORD-1',
    amount: 9900,
    status: 'pending',
    payMethod: 'alipay',
    payTime: null,
    transactionId: null,
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('GET /api/payment/status/[orderId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(AUTH_USER);
  });

  // ---- 分支 1：未认证 ----
  it('未认证时透传 authenticateRequest 的 401，不查订单', async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: '未提供身份认证令牌' }, { status: 401 }),
    );

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: '未提供身份认证令牌' });
    expect(mockGetOrderForTenant).not.toHaveBeenCalled();
    expect(mockQueryPayment).not.toHaveBeenCalled();
  });

  // ---- 分支 2：订单不存在 / 跨租户（DB 层 findFirst 返回 null）→ 404 ----
  it('订单不存在 / 跨租户（getOrderForTenant 返回 null）时返回 404', async () => {
    mockGetOrderForTenant.mockResolvedValue(null);

    const res = (await GET(makeRequest(), ctx('ord-missing'))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: '订单不存在' });
    // DB 层以 { id, tenantId } 收紧：跨租户 / 不存在统一收敛为 null，不再有 403 分支
    expect(mockGetOrderForTenant).toHaveBeenCalledWith('ord-missing', 'tenant-1');
    expect(mockQueryPayment).not.toHaveBeenCalled();
  });

  // ---- 分支 3：终态直接返回，不调用 queryPayment ----
  it('订单已 paid（终态）直接返回本地状态，不调用 queryPayment', async () => {
    const paidAt = new Date('2026-06-30T10:00:00Z');
    mockGetOrderForTenant.mockResolvedValue(
      makeOrder({
        status: 'paid',
        payMethod: 'alipay',
        payTime: paidAt,
        transactionId: 'trade-paid',
      }),
    );

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        orderId: 'ord-1',
        orderNo: 'ORD-1',
        status: 'paid',
        amount: 9900,
        payMethod: 'alipay',
        payTime: paidAt,
        transactionId: 'trade-paid',
      },
    });
    expect(mockQueryPayment).not.toHaveBeenCalled();
  });

  it('订单已 failed（终态）直接返回本地状态，不调用 queryPayment', async () => {
    mockGetOrderForTenant.mockResolvedValue(
      makeOrder({ status: 'failed', payMethod: 'wechat', payTime: null, transactionId: null }),
    );

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('failed');
    expect(mockQueryPayment).not.toHaveBeenCalled();
  });

  it('订单已 refunded（终态）直接返回本地状态，不调用 queryPayment', async () => {
    mockGetOrderForTenant.mockResolvedValue(
      makeOrder({ status: 'refunded', payMethod: 'alipay' }),
    );

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('refunded');
    expect(mockQueryPayment).not.toHaveBeenCalled();
  });

  // ---- 分支 4：pending + 第三方查询成功且非 pending → 返回第三方结果 ----
  it('pending + alipay + queryPayment 成功返回 paid → 返回第三方结果（payTime/tradeNo 来自 payResult）', async () => {
    mockGetOrderForTenant.mockResolvedValue(makeOrder({ status: 'pending', payMethod: 'alipay' }));
    const queryPayTime = new Date('2026-06-30T11:30:00Z');
    mockQueryPayment.mockResolvedValue({
      success: true,
      status: 'paid',
      tradeNo: 'alipay-trade-xyz',
      payTime: queryPayTime,
    });

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(mockQueryPayment).toHaveBeenCalledWith('alipay', 'ORD-1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        orderId: 'ord-1',
        orderNo: 'ORD-1',
        status: 'paid',
        amount: 9900, // 金额仍取本地订单
        payMethod: 'alipay',
        payTime: queryPayTime, // 来自 payResult
        transactionId: 'alipay-trade-xyz', // tradeNo 透传为 transactionId
      },
    });
  });

  it('pending + wechat + queryPayment 成功返回 failed → 返回第三方 failed 状态', async () => {
    mockGetOrderForTenant.mockResolvedValue(makeOrder({ status: 'pending', payMethod: 'wechat' }));
    mockQueryPayment.mockResolvedValue({
      success: true,
      status: 'failed',
      tradeNo: 'wechat-trade',
    });

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(mockQueryPayment).toHaveBeenCalledWith('wechat', 'ORD-1');
    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('failed');
    expect((res.body as { data: { transactionId: string } }).data.transactionId).toBe('wechat-trade');
  });

  // ---- 分支 5：回退本地订单状态 ----
  it('pending + queryPayment 返回 pending → 回退本地订单状态（仍 pending）', async () => {
    mockGetOrderForTenant.mockResolvedValue(makeOrder({ status: 'pending', payMethod: 'alipay' }));
    mockQueryPayment.mockResolvedValue({ success: true, status: 'pending' });

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(mockQueryPayment).toHaveBeenCalled();
    expect(res.status).toBe(200);
    // 回退分支返回本地 order.status（pending）、本地 payTime(null)/transactionId(null)
    expect((res.body as { data: { status: string; payTime: null; transactionId: null } }).data).toEqual(
      expect.objectContaining({ status: 'pending', payTime: null, transactionId: null }),
    );
  });

  it('pending + queryPayment 失败（success:false，真实模式未接入 SDK）→ 回退本地订单状态', async () => {
    // 真实模式下 queryPayment 返回 { success:false, status:'failed', error:'...尚未接入 SDK' }
    // 路由条件 `payResult.success && payResult.status !== 'pending'` 因 success:false 不成立，
    // 回退本地 order 状态，避免伪造状态掩盖查询未实现。
    mockGetOrderForTenant.mockResolvedValue(makeOrder({ status: 'pending', payMethod: 'alipay' }));
    mockQueryPayment.mockResolvedValue({
      success: false,
      status: 'failed',
      error: '支付宝真实支付查询尚未接入 SDK',
    });

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(mockQueryPayment).toHaveBeenCalled();
    expect(res.status).toBe(200);
    // 回退分支取本地 order.status（pending），不取 payResult 的 failed
    expect((res.body as { data: { status: string } }).data.status).toBe('pending');
  });

  it('pending + payMethod 为 null → 回退本地订单状态，不调用 queryPayment', async () => {
    mockGetOrderForTenant.mockResolvedValue(makeOrder({ status: 'pending', payMethod: null }));

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(mockQueryPayment).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('pending');
  });

  it('pending + payMethod 非 alipay/wechat（如 "balance"）→ 回退本地状态，不调用 queryPayment', async () => {
    mockGetOrderForTenant.mockResolvedValue(makeOrder({ status: 'pending', payMethod: 'balance' }));

    const res = (await GET(makeRequest(), ctx('ord-1'))) as MockRes;

    expect(mockQueryPayment).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('pending');
  });

  // ---- getOrderForTenant 查询契约 ----
  it('按订单 id + 认证 tenantId 调用 getOrderForTenant（DB 层租户作用域）', async () => {
    mockGetOrderForTenant.mockResolvedValue(makeOrder({ status: 'paid' }));

    await GET(makeRequest(), ctx('ord-xyz'));

    expect(mockGetOrderForTenant).toHaveBeenCalledWith('ord-xyz', 'tenant-1');
  });
});
