/**
 * 模拟支付宝支付页面
 * GET /api/payment/mock/alipay
 * 用于开发测试，模拟支付宝支付流程
 */
import { NextRequest, NextResponse } from 'next/server';
import { alipayProvider } from '@/lib/payment/alipay';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const orderNo = searchParams.get('orderNo');
  const amount = searchParams.get('amount');
  const tradeNo = searchParams.get('tradeNo');

  if (!orderNo || !amount) {
    return new NextResponse('参数错误', { status: 400 });
  }

  // 生成模拟签名
  const mockSign = alipayProvider.generateMockSign(orderNo);

  // 返回模拟支付页面
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>模拟支付宝支付</title>
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
      background: #1677ff;
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
      color: #1677ff;
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
      background: #1677ff;
      color: white;
    }
    .btn-primary:hover {
      background: #0958d9;
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
      <div class="logo">支</div>
      <h1 class="title">模拟支付宝支付</h1>
    </div>

    <div class="amount">
      <div class="amount-label">支付金额</div>
      <div class="amount-value">¥${(parseInt(amount) / 100).toFixed(2)}</div>
    </div>

    <div class="order-info">
      <div class="order-item">
        <span class="order-label">订单号</span>
        <span class="order-value">${orderNo}</span>
      </div>
      <div class="order-item">
        <span class="order-label">交易号</span>
        <span class="order-value">${tradeNo || '-'}</span>
      </div>
      <div class="order-item">
        <span class="order-label">支付方式</span>
        <span class="order-value">支付宝</span>
      </div>
    </div>

    <div class="buttons">
      <button class="btn btn-secondary" onclick="cancelPay()">取消支付</button>
      <button class="btn btn-primary" onclick="confirmPay()">确认支付</button>
    </div>

    <div class="notice">
      ⚠️ 这是模拟支付页面，仅用于开发测试
    </div>
  </div>

  <script>
    function confirmPay() {
      // 模拟支付成功，跳转到回调
      const callbackUrl = '/api/payment/callback/alipay';
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = callbackUrl;

      // 添加回调参数
      const params = {
        out_trade_no: '${orderNo}',
        trade_no: '${tradeNo || 'MOCK' + Date.now()}',
        total_amount: '${(parseInt(amount) / 100).toFixed(2)}',
        trade_status: 'TRADE_SUCCESS',
        mock_sign: '${mockSign}',
      };

      Object.keys(params).forEach(key => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = params[key];
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    }

    function cancelPay() {
      // 模拟支付失败
      const callbackUrl = '/api/payment/callback/alipay';
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = callbackUrl;

      const params = {
        out_trade_no: '${orderNo}',
        trade_no: '${tradeNo || 'MOCK' + Date.now()}',
        total_amount: '${(parseInt(amount) / 100).toFixed(2)}',
        trade_status: 'TRADE_CLOSED',
        mock_sign: '${mockSign}',
      };

      Object.keys(params).forEach(key => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = params[key];
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
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
