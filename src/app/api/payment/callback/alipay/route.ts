/**
 * 支付宝支付回调API
 * POST /api/payment/callback/alipay
 */
import { NextRequest, NextResponse } from 'next/server';
import { processPaymentCallback } from '@/lib/payment';

export async function POST(request: NextRequest) {
  try {
    // 获取回调参数
    // 支付宝回调是表单格式，需要解析
    const formData = await request.formData();
    const params: Record<string, any> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });

    // 如果不是表单格式，尝试JSON格式
    if (Object.keys(params).length === 0) {
      try {
        const jsonData = await request.json();
        Object.assign(params, jsonData);
      } catch {
        // 忽略JSON解析错误
      }
    }

    console.log('支付宝回调参数:', params);

    // 处理支付回调
    const result = await processPaymentCallback('alipay', params);

    if (!result.success) {
      console.error('支付宝回调处理失败:', result.error);
      // 支付宝要求返回失败时返回 "fail"
      return new NextResponse('fail', { status: 200 });
    }

    // 支付宝要求返回成功时返回 "success"
    return new NextResponse('success', { status: 200 });
  } catch (error: any) {
    console.error('支付宝回调处理异常:', error);
    return new NextResponse('fail', { status: 200 });
  }
}

// 也支持GET请求（部分场景下支付宝会用GET回调）
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params: Record<string, any> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    console.log('支付宝GET回调参数:', params);

    // 处理支付回调
    const result = await processPaymentCallback('alipay', params);

    if (!result.success) {
      console.error('支付宝GET回调处理失败:', result.error);
      return new NextResponse('fail', { status: 200 });
    }

    return new NextResponse('success', { status: 200 });
  } catch (error: any) {
    console.error('支付宝GET回调处理异常:', error);
    return new NextResponse('fail', { status: 200 });
  }
}
