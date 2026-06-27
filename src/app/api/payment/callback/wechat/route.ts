/**
 * 微信支付回调API
 * POST /api/payment/callback/wechat
 */
import { NextRequest, NextResponse } from 'next/server';
import { processPaymentCallback } from '@/lib/payment';

export async function POST(request: NextRequest) {
  try {
    // 读取原始请求体文本：
    // 1. 微信支付 V3 验签需用原始 body 参与 HMAC-SHA256 计算（不能是 JSON.parse 后的对象）；
    // 2. 避免 request.json() 失败后再 request.formData() 的“请求体只能读一次”二次读取问题。
    const rawBody = await request.text();
    let params: Record<string, any> = {};

    if (rawBody) {
      try {
        params = JSON.parse(rawBody);
      } catch {
        // 非 JSON，尝试 application/x-www-form-urlencoded 兜底
        try {
          new URLSearchParams(rawBody).forEach((value, key) => {
            params[key] = value;
          });
        } catch {
          // 忽略解析错误
        }
      }
    }

    // 透传微信支付 V3 签名相关字段，供 WechatPayProvider.verifyWechatSign 使用：
    //   timestamp  <- Wechatpay-Timestamp
    //   nonce      <- Wechatpay-Nonce
    //   signature  <- Wechatpay-Signature
    //   body       <- 原始请求体文本
    // 真实模式下缺任一字段验签即拒绝；模拟模式不读取这些字段，透传无害。
    const timestamp = request.headers.get('Wechatpay-Timestamp');
    const nonce = request.headers.get('Wechatpay-Nonce');
    const signature = request.headers.get('Wechatpay-Signature');
    if (timestamp) params.timestamp = timestamp;
    if (nonce) params.nonce = nonce;
    if (signature) params.signature = signature;
    params.body = rawBody;

    console.log('微信支付回调参数:', params);

    // 处理支付回调
    const result = await processPaymentCallback('wechat', params);

    if (!result.success) {
      console.error('微信支付回调处理失败:', result.error);
      // 微信支付要求返回失败时返回错误码
      return NextResponse.json({
        code: 'FAIL',
        message: result.error || '处理失败',
      });
    }

    // 微信支付要求返回成功时返回 SUCCESS
    return NextResponse.json({
      code: 'SUCCESS',
      message: '成功',
    });
  } catch (error: any) {
    console.error('微信支付回调处理异常:', error);
    return NextResponse.json({
      code: 'FAIL',
      message: '系统异常',
    });
  }
}
