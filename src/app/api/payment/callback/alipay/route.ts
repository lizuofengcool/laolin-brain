/**
 * 支付宝支付回调API
 * POST /api/payment/callback/alipay
 * GET  /api/payment/callback/alipay  （部分场景下支付宝会用 GET 回调）
 */
import { NextRequest, NextResponse } from 'next/server';
import { processPaymentCallback } from '@/lib/payment';

/**
 * 处理支付宝回调的公共逻辑（POST 与 GET 共用）
 *
 * 支付宝约定：成功返回 "success"，失败返回 "fail"（HTTP 200）。
 * 由调用方负责将请求体解析为 params 后传入。
 */
async function handleAlipayCallback(params: Record<string, any>, source: 'POST' | 'GET'): Promise<NextResponse> {
  try {
    console.log(`支付宝${source}回调参数:`, params);

    const result = await processPaymentCallback('alipay', params);

    if (!result.success) {
      console.error(`支付宝${source}回调处理失败:`, result.error);
      // 支付宝要求返回失败时返回 "fail"
      return new NextResponse('fail', { status: 200 });
    }

    // 支付宝要求返回成功时返回 "success"
    return new NextResponse('success', { status: 200 });
  } catch (error: any) {
    console.error(`支付宝${source}回调处理异常:`, error);
    return new NextResponse('fail', { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  // 获取回调参数：支付宝回调是表单格式，需要解析
  const params: Record<string, any> = {};

  // 优先按表单解析（支付宝标准回调格式）
  try {
    const formData = await request.formData();
    formData.forEach((value, key) => {
      params[key] = value;
    });
  } catch {
    // 非 multipart 表单，忽略并尝试 JSON 兜底
  }

  // 如果不是表单格式，尝试 JSON 格式
  if (Object.keys(params).length === 0) {
    try {
      const jsonData = await request.json();
      Object.assign(params, jsonData);
    } catch {
      // 忽略 JSON 解析错误
    }
  }

  return handleAlipayCallback(params, 'POST');
}

export async function GET(request: NextRequest) {
  const params: Record<string, any> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return handleAlipayCallback(params, 'GET');
}
