/**
 * 支付宝回调路由 handler 级集成测试
 *
 * 锁定 src/app/api/payment/callback/alipay/route.ts 两个 handler 的控制流契约：
 *   - POST：优先按表单解析（支付宝标准回调格式 application/x-www-form-urlencoded），
 *     表单非空则不读 JSON；解析后透传 processPaymentCallback('alipay', params)。
 *     成功 → "success"(200)；失败 → "fail"(200)；processPaymentCallback 抛错 → "fail"(200)
 *     （catch 兜底，符合支付宝"失败即重试"约定，不抛 5xx 避免无效重试）
 *   - GET：按 query 参数解析（部分场景支付宝用 GET 回调），透传同一 handleAlipayCallback
 *
 * Mock 策略：next/server 与 @/lib/payment 全部隔离，不触达真实数据库与网络。
 * 复用 saas-orders-route 的 vi.hoisted + MockNextResponse 范式（路由的 NextRequest
 * 仅作类型注解，运行时不存在，故 mock 仅需导出 NextResponse）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { MockNextResponse, mockProcess } = vi.hoisted(() => {
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
    mockProcess: vi.fn(),
  };
});

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('@/lib/payment', () => ({
  processPaymentCallback: (...args: unknown[]) => mockProcess(...args),
}));

import { GET, POST } from '@/app/api/payment/callback/alipay/route';

type MockRes = InstanceType<typeof MockNextResponse>;

function makeFormRequest(body: string): NextRequest {
  return new Request('http://localhost/api/payment/callback/alipay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }) as unknown as NextRequest;
}

function makeGetRequest(query: string): NextRequest {
  const url = `http://localhost/api/payment/callback/alipay?${query}`;
  const req = new Request(url, { method: 'GET' }) as unknown as NextRequest & { nextUrl: URL };
  // alipay GET 路由用 request.nextUrl.searchParams，标准 Request 无 nextUrl，注入之
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(url);
  return req;
}

describe('alipay 回调路由', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess.mockResolvedValue({ success: true });
  });

  describe('POST /api/payment/callback/alipay', () => {
    it('表单回调 + 处理成功 → "success" (200)，params 透传 processPaymentCallback', async () => {
      const res = (await POST(
        makeFormRequest('out_trade_no=ORD-1&trade_status=TRADE_SUCCESS&total_amount=99.00')
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toBe('success');
      expect(mockProcess).toHaveBeenCalledWith('alipay', {
        out_trade_no: 'ORD-1',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '99.00',
      });
    });

    it('表单回调 + 处理失败 → "fail" (200)', async () => {
      mockProcess.mockResolvedValue({ success: false, error: '签名验证失败' });

      const res = (await POST(
        makeFormRequest('out_trade_no=ORD-1&trade_status=TRADE_SUCCESS')
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toBe('fail');
    });

    it('processPaymentCallback 抛错 → "fail" (200)（catch 兜底，不抛 5xx）', async () => {
      mockProcess.mockRejectedValue(new Error('db down'));

      const res = (await POST(
        makeFormRequest('out_trade_no=ORD-1&trade_status=TRADE_SUCCESS')
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toBe('fail');
    });

    it('首次以 alipay 方法调用，不串成 wechat', async () => {
      await POST(makeFormRequest('out_trade_no=ORD-2'));
      expect(mockProcess).toHaveBeenLastCalledWith('alipay', expect.any(Object));
    });
  });

  describe('GET /api/payment/callback/alipay', () => {
    it('query 回调 + 处理成功 → "success" (200)，query 透传 processPaymentCallback', async () => {
      const res = (await GET(
        makeGetRequest('out_trade_no=ORD-1&trade_status=TRADE_SUCCESS')
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toBe('success');
      expect(mockProcess).toHaveBeenCalledWith('alipay', {
        out_trade_no: 'ORD-1',
        trade_status: 'TRADE_SUCCESS',
      });
    });

    it('query 回调 + 处理失败 → "fail" (200)', async () => {
      mockProcess.mockResolvedValue({ success: false, error: '订单不存在' });

      const res = (await GET(
        makeGetRequest('out_trade_no=ORD-1&trade_status=TRADE_SUCCESS')
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toBe('fail');
    });

    it('processPaymentCallback 抛错 → "fail" (200)（GET 同样 catch 兜底）', async () => {
      mockProcess.mockRejectedValue(new Error('boom'));

      const res = (await GET(makeGetRequest('out_trade_no=ORD-1'))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toBe('fail');
    });
  });
});
