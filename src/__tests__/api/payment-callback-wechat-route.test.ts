/**
 * 微信支付回调路由 handler 级集成测试
 *
 * 锁定 src/app/api/payment/callback/wechat/route.ts POST handler 的控制流契约：
 *   - 读取原始 body 文本（微信支付 V3 验签需原始 body 参与 HMAC-SHA256 计算），
 *     JSON 解析优先，失败兜底 application/x-www-form-urlencoded
 *   - 透传 Wechatpay-Timestamp / Wechatpay-Nonce / Wechatpay-Signature 头到 params，
 *     缺头则对应字段不写入；params.body 恒为原始 body 文本（供 verifyWechatSign 使用）
 *   - processPaymentCallback('wechat', params) 成功 → {code:'SUCCESS', message:'成功'} (200)
 *   - 处理失败 → {code:'FAIL', message: error} (200)（微信要求 HTTP 200 + FAIL 业务码触发重试）
 *   - 抛错 → {code:'FAIL', message:'系统异常'} (200)
 *
 * Mock 策略：next/server 与 @/lib/payment 全部隔离，不触达真实数据库与网络。
 * 复用 saas-orders-route 的 vi.hoisted + MockNextResponse 范式。
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

import { POST } from '@/app/api/payment/callback/wechat/route';

type MockRes = InstanceType<typeof MockNextResponse>;

function makeJsonRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request('http://localhost/api/payment/callback/wechat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as unknown as NextRequest;
}

describe('wechat 回调路由 POST /api/payment/callback/wechat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess.mockResolvedValue({ success: true });
  });

  it('JSON body + Wechatpay 头 → params 含 body/timestamp/nonce/signature + 解析字段，返回 SUCCESS', async () => {
    const rawBody = JSON.stringify({
      out_trade_no: 'ORD-1',
      trade_state: 'SUCCESS',
      amount: { total: 9900 },
    });
    const res = (await POST(
      makeJsonRequest(rawBody, {
        'Wechatpay-Timestamp': '1234567890',
        'Wechatpay-Nonce': 'nonce-abc',
        'Wechatpay-Signature': 'sig-xyz',
      })
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 'SUCCESS', message: '成功' });
    expect(mockProcess).toHaveBeenCalledWith(
      'wechat',
      expect.objectContaining({
        out_trade_no: 'ORD-1',
        trade_state: 'SUCCESS',
        amount: { total: 9900 },
        body: rawBody,
        timestamp: '1234567890',
        nonce: 'nonce-abc',
        signature: 'sig-xyz',
      })
    );
  });

  it('处理失败 → {code:FAIL, message:error} (200)', async () => {
    mockProcess.mockResolvedValue({ success: false, error: '签名验证失败' });

    const res = (await POST(
      makeJsonRequest(JSON.stringify({ out_trade_no: 'ORD-1' }))
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 'FAIL', message: '签名验证失败' });
  });

  it('processPaymentCallback 抛错 → {code:FAIL, message:系统异常} (200)', async () => {
    mockProcess.mockRejectedValue(new Error('db down'));

    const res = (await POST(
      makeJsonRequest(JSON.stringify({ out_trade_no: 'ORD-1' }))
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 'FAIL', message: '系统异常' });
  });

  it('缺 Wechatpay 头 → params 不含 timestamp/nonce/signature（仅 body + 解析字段）', async () => {
    const rawBody = JSON.stringify({ out_trade_no: 'ORD-1' });
    const res = (await POST(makeJsonRequest(rawBody))) as MockRes;

    expect(res.body).toEqual({ code: 'SUCCESS', message: '成功' });
    const calledArgs = mockProcess.mock.calls[0][1] as Record<string, unknown>;
    expect(calledArgs.body).toBe(rawBody);
    expect(calledArgs.out_trade_no).toBe('ORD-1');
    expect(calledArgs.timestamp).toBeUndefined();
    expect(calledArgs.nonce).toBeUndefined();
    expect(calledArgs.signature).toBeUndefined();
  });

  it('非 JSON body → urlencoded 兜底解析，body 仍透传原文', async () => {
    const rawBody = 'out_trade_no=ORD-1&trade_state=SUCCESS';
    const req = new Request('http://localhost/api/payment/callback/wechat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody,
    }) as unknown as NextRequest;

    const res = (await POST(req)) as MockRes;

    expect(res.body).toEqual({ code: 'SUCCESS', message: '成功' });
    const calledArgs = mockProcess.mock.calls[0][1] as Record<string, unknown>;
    expect(calledArgs.out_trade_no).toBe('ORD-1');
    expect(calledArgs.trade_state).toBe('SUCCESS');
    expect(calledArgs.body).toBe(rawBody);
  });

  it('空 body → params 仅含空 body 字符串，仍以 wechat 方法调用', async () => {
    const req = new Request('http://localhost/api/payment/callback/wechat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    }) as unknown as NextRequest;

    const res = (await POST(req)) as MockRes;

    expect(res.body).toEqual({ code: 'SUCCESS', message: '成功' });
    expect(mockProcess).toHaveBeenLastCalledWith('wechat', expect.any(Object));
    const calledArgs = mockProcess.mock.calls[0][1] as Record<string, unknown>;
    // rawBody 为空字符串 → if(rawBody) 跳过解析，params 保持 {}，随后 params.body = ''
    expect(calledArgs.body).toBe('');
  });
});
