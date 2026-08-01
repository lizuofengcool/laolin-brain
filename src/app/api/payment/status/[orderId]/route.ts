/**
 * 查询支付状态API
 * GET /api/payment/status/[orderId]
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { queryPayment } from '@/lib/payment';
import { getOrderForTenant } from '@/lib/saas/billing.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const authResult = await authenticateRequest(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { tenantId } = authResult;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: '缺少订单ID' },
        { status: 400 }
      );
    }

    // 查询订单（DB 层租户作用域化）
    // query 的 orderId 不可信，原 findUnique where.id + order.tenant.users.find
    // 的 post-check 范式会先以裸 id 命中他租户订单并 eager-load 整个 tenant.users
    // 成员表再 JS 比对，存在跨租户越权读取与成员信息泄露风险。此处改为
    // getOrderForTenant(orderId, tenantId) 在 DB 层以 { id, tenantId } findFirst
    // 收紧：不存在 / 跨租户统一收敛为 null → 404，与 saas/orders（第二百一十一轮）
    // 保持一致的租户隔离契约，同时消除 tenant.users 的无谓 eager-load。
    const order = await getOrderForTenant(orderId, tenantId);

    if (!order) {
      return NextResponse.json(
        { success: false, error: '订单不存在' },
        { status: 404 }
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
