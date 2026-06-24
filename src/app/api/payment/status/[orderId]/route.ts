/**
 * 查询支付状态API
 * GET /api/payment/status/[orderId]
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { queryPayment } from '@/lib/payment';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    // 认证用户
    const authResult = await authenticateRequest(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId } = authResult;

    const orderId = params.orderId;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: '缺少订单ID' },
        { status: 400 }
      );
    }

    // 查询订单
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        tenant: {
          include: {
            users: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: '订单不存在' },
        { status: 404 }
      );
    }

    // 验证用户是否有权限查看该订单
    const tenantUser = order.tenant.users.find(
      (u) => u.userId === userId
    );

    if (!tenantUser) {
      return NextResponse.json(
        { success: false, error: '无权查看该订单' },
        { status: 403 }
      );
    }

    // 如果订单已经是终态，直接返回
    if (order.status === 'paid' || order.status === 'failed' || order.status === 'refunded') {
      return NextResponse.json({
        success: true,
        data: {
          orderId: order.id,
          orderNo: order.orderNo,
          status: order.status,
          amount: Number(order.amount),
          payMethod: order.payMethod,
          payTime: order.payTime,
          transactionId: order.transactionId,
        },
      });
    }

    // 如果订单还是pending状态，查询第三方支付状态
    if (order.payMethod && (order.payMethod === 'alipay' || order.payMethod === 'wechat')) {
      const payResult = await queryPayment(order.payMethod as 'alipay' | 'wechat', order.orderNo);

      if (payResult.success && payResult.status !== 'pending') {
        // 如果支付状态有变化，更新订单
        // 注意：这里不直接更新，由回调处理，避免重复处理
        // 但可以返回最新状态
        return NextResponse.json({
          success: true,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            status: payResult.status,
            amount: Number(order.amount),
            payMethod: order.payMethod,
            payTime: payResult.payTime,
            transactionId: payResult.tradeNo,
          },
        });
      }
    }

    // 返回当前订单状态
    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        amount: Number(order.amount),
        payMethod: order.payMethod,
        payTime: order.payTime,
        transactionId: order.transactionId,
      },
    });
  } catch (error: any) {
    console.error('查询支付状态失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || '查询支付状态失败' },
      { status: 500 }
    );
  }
}
