/**
 * 创建支付订单API
 * POST /api/payment/create
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { createPayment, getNotifyUrl } from '@/lib/payment';
import { createOrder, reusePendingOrder, PLANS } from '@/lib/billing/subscription';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // 认证用户
    const authResult = await authenticateRequest(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId, tenantId } = authResult;

    // 获取请求体
    const body = await request.json();
    const { planId, interval, payMethod, orderId } = body;

    // 参数验证
    if (!planId || !interval || !payMethod) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (!['alipay', 'wechat'].includes(payMethod)) {
      return NextResponse.json(
        { success: false, error: '不支持的支付方式' },
        { status: 400 }
      );
    }

    if (!['month', 'year'].includes(interval)) {
      return NextResponse.json(
        { success: false, error: '不支持的计费周期' },
        { status: 400 }
      );
    }

    if (!PLANS[planId]) {
      return NextResponse.json(
        { success: false, error: '无效的套餐' },
        { status: 400 }
      );
    }

    // 免费套餐不需要支付
    if (planId === 'free') {
      return NextResponse.json(
        { success: false, error: '免费套餐无需支付' },
        { status: 400 }
      );
    }

    // 创建订单或复用待支付订单
    // 当 orderId 提供时（OrderHistory「立即支付」路径），复用既有 pending 订单，
    // 避免每次重新支付都创建新订单导致原订单悬挂。以 order.plan/order.interval
    // 作为 subject/description 的权威来源，与订单实际内容一致。
    let order;
    let effectivePlanId: string;
    let effectiveInterval: 'month' | 'year';
    if (orderId) {
      try {
        order = await reusePendingOrder(
          tenantId,
          orderId,
          payMethod as 'alipay' | 'wechat',
          userId
        );
        effectivePlanId = order.plan;
        effectiveInterval = order.interval as 'month' | 'year';
      } catch (error: any) {
        // 已知业务错误（订单不存在 / 非待支付）→ 400，不暴露 500
        const message = error?.message || '';
        const known = message === '订单不存在' || message === '仅待支付订单可复用';
        return NextResponse.json(
          { success: false, error: known ? message : '创建支付订单失败' },
          { status: known ? 400 : 500 }
        );
      }
    } else {
      order = await createOrder(
        tenantId,
        planId,
        interval as 'month' | 'year',
        payMethod as 'alipay' | 'wechat'
      );
      effectivePlanId = planId;
      effectiveInterval = interval as 'month' | 'year';
    }

    // 获取套餐信息
    const plan = PLANS[effectivePlanId];
    const planName = plan.name;

    // 创建支付订单
    const payResult = await createPayment(payMethod as 'alipay' | 'wechat', {
      orderNo: order.orderNo,
      amount: Number(order.amount),
      subject: `${planName} - ${effectiveInterval === 'month' ? '月付' : '年付'}`,
      description: `laolin-brain ${planName} 订阅`,
      notifyUrl: getNotifyUrl(payMethod as 'alipay' | 'wechat'),
      tenantId,
      userId,
    });

    if (!payResult.success) {
      return NextResponse.json(
        { success: false, error: payResult.error || '创建支付订单失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        amount: Number(order.amount),
        payUrl: payResult.payUrl,
        qrCode: payResult.qrCode,
        tradeNo: payResult.tradeNo,
        payMethod,
      },
    });
  } catch (error: any) {
    console.error('创建支付订单失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || '创建支付订单失败' },
      { status: 500 }
    );
  }
}
