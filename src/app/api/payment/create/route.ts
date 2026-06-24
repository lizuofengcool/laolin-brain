/**
 * 创建支付订单API
 * POST /api/payment/create
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { createPayment, getNotifyUrl } from '@/lib/payment';
import { createOrder, PLANS } from '@/lib/billing/subscription';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // 认证用户
    const authResult = await authenticateRequest(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId } = authResult;

    // 获取请求体
    const body = await request.json();
    const { planId, interval, payMethod } = body;

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

    // 获取用户的租户ID
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { success: false, error: '用户不属于任何租户' },
        { status: 400 }
      );
    }

    const tenantId = tenantUser.tenantId;

    // 免费套餐不需要支付
    if (planId === 'free') {
      return NextResponse.json(
        { success: false, error: '免费套餐无需支付' },
        { status: 400 }
      );
    }

    // 创建订单
    const order = await createOrder(
      tenantId,
      planId,
      interval as 'month' | 'year',
      payMethod as 'alipay' | 'wechat'
    );

    // 获取套餐信息
    const plan = PLANS[planId];
    const planName = plan.name;

    // 创建支付订单
    const payResult = await createPayment(payMethod as 'alipay' | 'wechat', {
      orderNo: order.orderNo,
      amount: Number(order.amount),
      subject: `${planName} - ${interval === 'month' ? '月付' : '年付'}`,
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
