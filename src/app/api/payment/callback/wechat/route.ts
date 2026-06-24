/**
 * 微信支付回调API
 * POST /api/payment/callback/wechat
 */
import { NextRequest, NextResponse } from 'next/server';
import { processPaymentCallback } from '@/lib/payment';

export async function POST(request: NextRequest) {
  try {
    // 获取回调参数
    // 微信支付V3回调是JSON格式
    let params: Record<string, any> = {};

    try {
      params = await request.json();
    } catch {
      // 如果JSON解析失败，尝试表单格式
      try {
        const formData = await request.formData();
        formData.forEach((value, key) => {
          params[key] = value;
        });
      } catch {
        // 忽略解析错误
      }
    }

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
