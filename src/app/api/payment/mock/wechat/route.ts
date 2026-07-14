/**
 * 模拟微信支付页面
 * GET /api/payment/mock/wechat
 * 用于开发测试，模拟微信支付流程
 */
import { NextRequest, NextResponse } from 'next/server';
import { wechatPayProvider } from '@/lib/payment/wechat';
import { escapeHtml, escapeJsString } from '@/lib/sanitize';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const orderNo = searchParams.get('orderNo');
  const amount = searchParams.get('amount');
  const tradeNo = searchParams.get('tradeNo');

  if (!orderNo || !amount) {
    return new NextResponse('参数错误', { status: 400 });
  }

  // 生成模拟签名
  const mockSign = wechatPayProvider.generateMockSign(orderNo);

  // orderNo / tradeNo 来自 query 参数，攻击者可控，插入 HTML 文本节点与 <script> 内
  // JS 字符串前必须转义，防止 reflected XSS（HTML 上下文 escapeHtml，JS 上下文 escapeJsString）。
  const tradeNoOrMock = tradeNo || 'MOCK' + Date.now();
  const orderNoHtml = escapeHtml(orderNo);
  const tradeNoHtml = escapeHtml(tradeNo || '-');
  const orderNoJs = escapeJsString(orderNo);
  const tradeNoJs = escapeJsString(tradeNoOrMock);

  // 返回模拟支付页面
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>模拟微信支付</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      width: 60px;
      height: 60px;
      background: #07c160;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      color: white;
      font-size: 24px;
      font-weight: bold;
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }
    .amount {
      text-align: center;
      margin: 30px 0;
    }
    .amount-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 8px;
    }
    .amount-value {
      font-size: 36px;
      font-weight: bold;
      color: #07c160;
    }
    .qr-code {
      width: 200px;
      height: 200px;
      margin: 0 auto 20px;
      background: #f8f9fa;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #999;
      text-align: center;
    }
    .order-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 30px;
    }
    .order-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 14px;
    }
    .order-label {
      color: #666;
    }
    .order-value {
      color: #333;
    }
    .buttons {
      display: flex;
      gap: 12px;
    }
    .btn {
      flex: 1;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #07c160;
      color: white;
    }
    .btn-primary:hover {
      background: #06ad56;
    }
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    .btn-secondary:hover {
      background: #e0e0e0;
    }
    .notice {
      margin-top: 20px;
      padding: 12px;
      background: #fff7e6;
      border: 1px solid #ffe58f;
      border-radius: 6px;
      font-size: 12px;
      color: #d48806;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">微</div>
      <h1 class="title">模拟微信支付</h1>
    </div>

    <div class="amount">
      <div class="amount-label">支付金额</div>
      <div class="amount-value">¥${(parseInt(amount) / 100).toFixed(2)}</div>
    </div>

    <div class="qr-code">
      模拟二维码<br>请使用微信扫码支付
    </div>

    <div class="order-info">
      <div class="order-item">
        <span class="order-label">订单号</span>
        <span class="order-value">${orderNoHtml}</span>
      </div>
      <div class="order-item">
        <span class="order-label">交易号</span>
        <span class="order-value">${tradeNoHtml}</span>
      </div>
      <div class="order-item">
        <span class="order-label">支付方式</span>
        <span class="order-value">微信支付</span>
      </div>
    </div>

    <div class="buttons">
      <button class="btn btn-secondary" onclick="cancelPay()">取消支付</button>
      <button class="btn btn-primary" onclick="confirmPay()">模拟支付成功</button>
    </div>

    <div class="notice">
      ⚠️ 这是模拟支付页面，仅用于开发测试
    </div>
  </div>

  <script>
    function confirmPay() {
      // 模拟支付成功，发送回调
      fetch('/api/payment/callback/wechat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          out_trade_no: '${orderNoJs}',
          transaction_id: '${tradeNoJs}',
          trade_state: 'SUCCESS',
          amount: {
            total: ${parseInt(amount)},
            currency: 'CNY'
          },
          resource: {
            out_trade_no: '${orderNoJs}',
            transaction_id: '${tradeNoJs}',
            trade_state: 'SUCCESS',
            amount: {
              total: ${parseInt(amount)}
            }
          },
          mock_sign: '${mockSign}',
        }),
      }).then(() => {
        // 支付成功后跳回
        alert('支付成功！');
        window.close();
      }).catch(() => {
        alert('支付回调发送失败');
      });
    }

    function cancelPay() {
      alert('已取消支付');
      window.close();
    }
  </script>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
