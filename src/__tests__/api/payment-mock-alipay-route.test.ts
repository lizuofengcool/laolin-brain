/**
 * 支付宝 mock 支付页路由 handler 级集成测试
 *
 * 锁定 src/app/api/payment/mock/alipay/route.ts 的 GET 控制流契约：
 *   - 仅开发测试用：返回模拟支付宝支付 HTML 页，页内 confirmPay/cancelPay 以表单 POST
 *     跳转 /api/payment/callback/alipay 触发真实回调 handler（携带 mock_sign）
 *   - query 校验：orderNo 与 amount 均不可缺，否则 400 '参数错误'
 *   - tradeNo 可选：缺失时展示 '-'，表单内回退 'MOCK' + Date.now()
 *   - mockSign 由 alipayProvider.generateMockSign(orderNo) 生成（与回调验签密钥同源）
 *   - 金额展示：parseInt(amount) / 100，toFixed(2)（分 → 元）
 *   - 响应 Content-Type: text/html; charset=utf-8
 *
 * Mock 策略：next/server 与 @/lib/payment/alipay 全隔离，不触达真实网络/DB。
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
vi.mock('@/lib/payment/alipay', () => ({
  alipayProvider: { generateMockSign: (...args: unknown[]) => mockGenerateMockSign(...args) },
}));

import { GET } from '@/app/api/payment/mock/alipay/route';

type MockRes = InstanceType<typeof MockNextResponse>;

function makeGetRequest(query: string): NextRequest {
  const url = `http://localhost/api/payment/mock/alipay?${query}`;
  const req = new Request(url, { method: 'GET' }) as unknown as NextRequest & { nextUrl: URL };
  // 路由用 request.nextUrl.searchParams，标准 Request 无 nextUrl，注入之
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(url);
  return req;
}

describe('支付宝 mock 支付页路由', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMockSign.mockReturnValue('MOCK-SIGN-XYZ');
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
        makeGetRequest('orderNo=ORD-20260630-1&amount=9900&tradeNo=ALIPAY123')
      )) as MockRes;
      html = String(res.body);
    });

    it('状态 200，Content-Type text/html; charset=utf-8', () => {
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });

    it('generateMockSign 以 orderNo 调用一次', () => {
      expect(mockGenerateMockSign).toHaveBeenCalledTimes(1);
      expect(mockGenerateMockSign).toHaveBeenCalledWith('ORD-20260630-1');
    });

    it('金额展示 parseInt(amount)/100.toFixed(2)（9900 → ¥99.00）', () => {
      expect(html).toContain('¥99.00');
    });

    it('orderNo 与 tradeNo 嵌入订单信息区', () => {
      expect(html).toContain('ORD-20260630-1');
      expect(html).toContain('ALIPAY123');
    });

    it('mockSign 嵌入 confirmPay 与 cancelPay 表单的 mock_sign 字段（两处）', () => {
      // 模板字面量内 mock_sign 出现两次（confirmPay + cancelPay）
      const matches = html.match(/mock_sign/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(html).toContain('MOCK-SIGN-XYZ');
    });

    it('confirmPay 表单 POST 到 /api/payment/callback/alipay，trade_status=TRADE_SUCCESS', () => {
      expect(html).toContain("/api/payment/callback/alipay");
      // confirmPay 在 trade_status: 'TRADE_SUCCESS' 之前定义
      const confirmIdx = html.indexOf('function confirmPay()');
      const successIdx = html.indexOf("trade_status: 'TRADE_SUCCESS'");
      expect(confirmIdx).toBeGreaterThan(-1);
      expect(successIdx).toBeGreaterThan(confirmIdx);
    });

    it('cancelPay 表单 trade_status=TRADE_CLOSED，位于 confirmPay 之后', () => {
      const cancelIdx = html.indexOf('function cancelPay()');
      const closedIdx = html.indexOf("trade_status: 'TRADE_CLOSED'");
      expect(cancelIdx).toBeGreaterThan(-1);
      expect(closedIdx).toBeGreaterThan(cancelIdx);
    });

    it('total_amount 字段 = (parseInt(amount)/100).toFixed(2)（9900 → "99.00"）', () => {
      expect(html).toContain("total_amount: '99.00'");
    });

    it('trade_no 字段嵌入实际 tradeNo', () => {
      expect(html).toContain("trade_no: 'ALIPAY123'");
    });
  });

  describe('tradeNo 缺失分支', () => {
    let html: string;

    beforeEach(async () => {
      const res = (await GET(
        makeGetRequest('orderNo=ORD-NO-TRADE&amount=100')
      )) as MockRes;
      html = String(res.body);
    });

    it('订单信息区 tradeNo 回退 "-"', () => {
      // 订单信息区 <span class="order-value">${tradeNo || '-'}</span>
      // 由于 '-' 也可能出现在样式/HTML 其他位置，锁定 order-value 单元格内容
      expect(html).toMatch(/<span class="order-value">-<\/span>/);
    });

    it('表单 trade_no 回退 "MOCK" + 数字时间戳', () => {
      // 模板字面量内 ${tradeNo || 'MOCK' + Date.now()} 已在路由运行时求值为 'MOCK177xxxxxxx'
      expect(html).toMatch(/trade_no: 'MOCK\d+'/);
    });

    it('generateMockSign 仍以 orderNo 调用（tradeNo 缺失不影响签名）', () => {
      expect(mockGenerateMockSign).toHaveBeenCalledWith('ORD-NO-TRADE');
    });
  });

  describe('金额换算边界', () => {
    it('amount=1 → ¥0.01（最小分单位）', async () => {
      const res = (await GET(makeGetRequest('orderNo=ORD&amount=1'))) as MockRes;
      expect(String(res.body)).toContain('¥0.01');
    });

    it('amount=非数字字符串 "abc" → parseInt 得 NaN，toFixed(NaN) → "NaN"', async () => {
      // 锁定真实控制流：parseInt("abc") = NaN，NaN/100 = NaN，(NaN).toFixed(2) = "NaN"
      // 这是 mock 路由的实际行为（无 zod 校验），测试锁定而非掩盖
      const res = (await GET(makeGetRequest('orderNo=ORD&amount=abc'))) as MockRes;
      expect(String(res.body)).toContain('¥NaN');
    });

    it('amount=0 → ¥0.00（parseInt("0")=0）', async () => {
      const res = (await GET(makeGetRequest('orderNo=ORD&amount=0'))) as MockRes;
      expect(String(res.body)).toContain('¥0.00');
    });
  });

  describe('XSS 防护（reflected XSS 转义）', () => {
    it('orderNo 含 <script> 标签 → HTML 上下文转义为 &lt;script&gt;', async () => {
      const payload = encodeURIComponent('<script>alert(1)</script>');
      const res = (await GET(makeGetRequest(`orderNo=${payload}&amount=100`))) as MockRes;
      const html = String(res.body);
      // 原始未转义的 payload 不得出现在 order-value 单元格
      expect(html).not.toContain(
        '<span class="order-value"><script>alert(1)</script></span>'
      );
      // 转义后的 HTML 实体应出现
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('orderNo 含单引号 → JS 字符串上下文转义防止截断注入', async () => {
      const payload = encodeURIComponent("';alert(1);//");
      const res = (await GET(makeGetRequest(`orderNo=${payload}&amount=100`))) as MockRes;
      const html = String(res.body);
      // 不得出现未转义的字符串截断（会执行 alert(1)）
      expect(html).not.toContain("out_trade_no: '';alert(1);//");
      // 转义后单引号前有反斜杠
      expect(html).toContain("out_trade_no: '\\';alert(1);//");
    });

    it('tradeNo 含 </script> → JS 字符串上下文转义防止 script 标签截断', async () => {
      const payload = encodeURIComponent('</script><script>alert(1)</script>');
      const res = (await GET(
        makeGetRequest(`orderNo=ORD&amount=100&tradeNo=${payload}`)
      )) as MockRes;
      const html = String(res.body);
      // 页面应仅含 1 个 </script> 闭合标签（页面自身），tradeNo 的 < 被转义为 \u003c
      const scriptCloseCount = (html.match(/<\/script>/g) ?? []).length;
      expect(scriptCloseCount).toBe(1);
      expect(html).toContain('\\u003c/script>');
    });

    it('tradeNo HTML 上下文转义（含 < 与 &）', async () => {
      const payload = encodeURIComponent('<img src=x>&evil');
      const res = (await GET(
        makeGetRequest(`orderNo=ORD&amount=100&tradeNo=${payload}`)
      )) as MockRes;
      const html = String(res.body);
      expect(html).toContain('&lt;img src=x&gt;&amp;evil');
    });
  });
});
