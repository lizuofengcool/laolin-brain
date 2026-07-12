/**
 * 订单管理 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createOrder, getOrder, getTenantOrders, getPaymentParams } from '@/lib/saas/billing.service';
import { authenticateRequest } from '@/lib/api-auth';

// 获取订单列表
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId } = auth;

    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    // 如果指定了订单 ID，获取单个订单
    if (orderId) {
      const order = await getOrder(orderId);
      if (!order) {
        return NextResponse.json(
          { error: '订单不存在' },
          { status: 404 }
        );
      }
      // 纵深防御：仅允许读取本租户订单，防止跨租户越权
      if (order.tenantId !== tenantId) {
        return NextResponse.json(
          { error: '订单不存在' },
          { status: 404 }
        );
      }
      return NextResponse.json({ order });
    }

    // 否则获取订单列表
    const orders = await getTenantOrders(tenantId);
    return NextResponse.json({ orders });
  } catch (error) {
    console.error('获取订单失败:', error);
    return NextResponse.json(
      { error: '获取订单失败' },
      { status: 500 }
    );
  }
}

// 创建订单
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId, userId } = auth;

    const body = await request.json();
    const { plan, interval, quantity = 1 } = body;

    if (!plan || !interval) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 验证套餐
    const validPlans = ['free', 'pro', 'enterprise'];
    if (!validPlans.includes(plan)) {
      return NextResponse.json(
        { error: '无效的套餐类型' },
        { status: 400 }
      );
    }

    // 验证周期
    const validIntervals = ['month', 'year'];
    if (!validIntervals.includes(interval)) {
      return NextResponse.json(
        { error: '无效的订阅周期' },
        { status: 400 }
      );
    }

    // 验证数量：必须为 1-100 的正整数，避免 0/负数/小数/超大值透传到金额计算
    // （billing.service: amount = price*100*quantity）与 setMonth 月份推进
    // （setMonth(getMonth() + months*quantity)）。上限 100 与分页 pageSize 上限约定一致
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return NextResponse.json(
        { error: 'quantity 必须为 1-100 的正整数' },
        { status: 400 }
      );
    }

    // 创建订单（tenantId 来自可信 auth，忽略请求体中的 tenantId）
    const order = await createOrder(tenantId, plan, interval, qty);

    // 获取支付参数（委托真实支付提供者创建支付订单）
    const paymentParams = await getPaymentParams(order.id, 'alipay', userId);

    return NextResponse.json({
      order,
      paymentParams,
      message: '订单创建成功，请完成支付',
    });
  } catch (error) {
    console.error('创建订单失败:', error);
    return NextResponse.json(
      { error: '创建订单失败' },
      { status: 500 }
    );
  }
}
