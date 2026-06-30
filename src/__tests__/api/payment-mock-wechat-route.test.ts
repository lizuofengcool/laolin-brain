/**
 * 微信 mock 支付页路由 handler 级集成测试
 *
 * 锁定 src/app/api/payment/mock/wechat/route.ts 的 GET 控制流契约：
 *   - 仅开发测试用：返回模拟微信支付 HTML 页，页内 confirmPay 以 fetch POST
 *     /api/payment/callback/wechat 触发真实回调 handler（携带 mock_sign + 微信 V3 结构）
 *   - query 校验：orderNo 与 amount 均不可缺，否则 400 '参数错误'
 *   - tradeNo 可选：缺失时展示 '-'，JSON body 内 transaction_id 回退 'MOCK' + Date.now()
 *   - mockSign 由 wechatPayProvider.generateMockSign(orderNo) 生成（与回调验签密钥同源）
 *   - 金额展示：parseInt(amount) / 100，toFixed(2)（分 → 元）
 *   - JSON body：amount.total = parseInt(amount)（原始分，未除100）；resource 嵌套同结构
 *   - 响应 Content-Type: text/html; charset=utf-8
 *
 * Mock 策略：next/server 与 @/lib/payment/wechat 全隔离，不触达真实网络/DB。
 * 复用 callback-alipay-route 的 vi.hoisted + MockNextResponse 范式。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { MockNextResponse, mockGenerateMockSign } = vi.hoisted(() => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(
      body?: unknown,
      init?: { status?: number; headers?: Record<string, string> } | undefined
    ) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number } | undefined) {
      return new MockNextResponse(body, init);
    }
  }
  return {
    MockNextResponse,
    mockGenerateMockSign: vi.fn(),
  };
});

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('@/lib/payment/wechat', () => ({
  wechatPayProvider: { generateMockSign: (...args: unknown[]) => mockGenerateMockSign(...args) },
}));

import { GET } from '@/app/api/payment/mock/wechat/route';

type MockRes = InstanceType<typeof MockNextResponse>;

function makeGetRequest(query: string): NextRequest {
  const url = `http://localhost/api/payment/mock/wechat?${query}`;
  const req = new Request(url, { method: 'GET' }) as unknown as NextRequest & { nextUrl: URL };
  // 路由用 request.nextUrl.searchParams，标准 Request 无 nextUrl，注入之
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(url);
  return req;
}

describe('微信 mock 支付页路由', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMockSign.mockReturnValue('WX-MOCK-SIGN');
  });

  describe('参数校验', () => {
    it('orderNo 缺失 → 400 "参数错误"，不生成 mockSign', async () => {
      const res = (await GET(makeGetRequest('amount=9900'))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toBe('参数错误');
      expect(mockGenerateMockSign).not.toHaveBeenCalled();
    });

    it('amount 缺失 → 400 "参数错误"，不生成 mockSign', async () => {
      const res = (await GET(makeGetRequest('orderNo=ORD-1'))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toBe('参数错误');
      expect(mockGenerateMockSign).not.toHaveBeenCalled();
    });

    it('orderNo 与 amount 均缺失 → 400 "参数错误"', async () => {
      const res = (await GET(makeGetRequest(''))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toBe('参数错误');
      expect(mockGenerateMockSign).not.toHaveBeenCalled();
    });
  });

  describe('成功路径（含 tradeNo）', () => {
    let res: MockRes;
    let html: string;

    beforeEach(async () => {
      res = (await GET(
        makeGetRequest('orderNo=ORD-20260630-W&amount=9900&tradeNo=WECHAT456')
      )) as MockRes;
      html = String(res.body);
    });

    it('状态 200，Content-Type text/html; charset=utf-8', () => {
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });

    it('generateMockSign 以 orderNo 调用一次', () => {
      expect(mockGenerateMockSign).toHaveBeenCalledTimes(1);
      expect(mockGenerateMockSign).toHaveBeenCalledWith('ORD-20260630-W');
    });

    it('金额展示 parseInt(amount)/100.toFixed(2)（9900 → ¥99.00）', () => {
      expect(html).toContain('¥99.00');
    });

    it('orderNo 与 tradeNo 嵌入订单信息区', () => {
      expect(html).toContain('ORD-20260630-W');
      expect(html).toContain('WECHAT456');
    });

    it('mockSign 嵌入 JSON body 的 mock_sign 字段', () => {
      expect(html).toContain('WX-MOCK-SIGN');
      expect(html).toMatch(/mock_sign:\s*'WX-MOCK-SIGN'/);
    });

    it('confirmPay 以 fetch POST /api/payment/callback/wechat（JSON），位于函数定义之后', () => {
      const confirmIdx = html.indexOf('function confirmPay()');
      const fetchIdx = html.indexOf("'/api/payment/callback/wechat'");
      expect(confirmIdx).toBeGreaterThan(-1);
      expect(fetchIdx).toBeGreaterThan(confirmIdx);
    });

    it('trade_state: "SUCCESS"（微信成功状态，非支付宝 TRADE_SUCCESS）', () => {
      expect(html).toContain("trade_state: 'SUCCESS'");
    });

    it('amount.total = parseInt(amount) 原始分（9900，未除100）', () => {
      // 微信金额以分为单位整数，与展示金额不同
      expect(html).toMatch(/total:\s*9900/);
    });

    it('amount.currency = "CNY"', () => {
      expect(html).toContain("currency: 'CNY'");
    });

    it('transaction_id 嵌入实际 tradeNo（外层与 resource 内层两处）', () => {
      // 外层 transaction_id + resource.transaction_id 均嵌入 WECHAT456
      const matches = html.match(/transaction_id:\s*'WECHAT456'/g) ?? [];
      expect(matches.length).toBe(2);
    });

    it('resource 嵌套结构存在（含 out_trade_no/transaction_id/trade_state/amount）', () => {
      expect(html).toContain('resource: {');
      expect(html).toContain('resource: {');
      // resource 内层 out_trade_no
      const resourceIdx = html.indexOf('resource: {');
      const innerOut = html.indexOf("out_trade_no: 'ORD-20260630-W'", resourceIdx);
      expect(innerOut).toBeGreaterThan(resourceIdx);
    });

    it('cancelPay 仅 alert + window.close，不发送回调（区别于 confirmPay）', () => {
      const cancelIdx = html.indexOf('function cancelPay()');
      expect(cancelIdx).toBeGreaterThan(-1);
      // cancelPay 函数体范围：从定义到 </script> 之前的下一个 function 或闭合
      const cancelBody = html.slice(cancelIdx, html.indexOf('</script>', cancelIdx));
      expect(cancelBody).toContain("alert('已取消支付')");
      expect(cancelBody).not.toMatch(/\/api\/payment\/callback\/wechat/);
    });
  });

  describe('tradeNo 缺失分支', () => {
    let html: string;

    beforeEach(async () => {
      const res = (await GET(
        makeGetRequest('orderNo=ORD-NO-TRADE-W&amount=100')
      )) as MockRes;
      html = String(res.body);
    });

    it('订单信息区 tradeNo 回退 "-"', () => {
      expect(html).toMatch(/<span class="order-value">-<\/span>/);
    });

    it('JSON body transaction_id 回退 "MOCK" + 数字时间戳（外层 + resource 两处）', () => {
      // 模板 ${tradeNo || 'MOCK' + Date.now()} 在路由运行时已求值为 'MOCK177xxxxxxx'
      const matches = html.match(/transaction_id:\s*'MOCK\d+'/g) ?? [];
      expect(matches.length).toBe(2);
    });

    it('generateMockSign 仍以 orderNo 调用（tradeNo 缺失不影响签名）', () => {
      expect(mockGenerateMockSign).toHaveBeenCalledWith('ORD-NO-TRADE-W');
    });
  });

  describe('金额换算边界', () => {
    it('amount=1 → ¥0.01（最小分单位）', async () => {
      const res = (await GET(makeGetRequest('orderNo=ORD&amount=1'))) as MockRes;
      expect(String(res.body)).toContain('¥0.01');
    });

    it('amount=非数字字符串 "abc" → parseInt 得 NaN，toFixed(NaN) → "NaN"', async () => {
      // 锁定真实控制流：parseInt("abc") = NaN，NaN/100 = NaN，(NaN).toFixed(2) = "NaN"
      // mock 路由无 zod 校验，测试锁定而非掩盖
      const res = (await GET(makeGetRequest('orderNo=ORD&amount=abc'))) as MockRes;
      expect(String(res.body)).toContain('¥NaN');
    });

    it('amount=0 → ¥0.00（parseInt("0")=0）', async () => {
      const res = (await GET(makeGetRequest('orderNo=ORD&amount=0'))) as MockRes;
      expect(String(res.body)).toContain('¥0.00');
    });
  });
});
