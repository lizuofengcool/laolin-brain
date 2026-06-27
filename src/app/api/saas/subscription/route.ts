/**
 * 订阅管理 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSubscription, checkTenantStatus } from '@/lib/saas/tenant.service';
import { cancelSubscription, reactivateSubscription, isSubscriptionExpiringSoon } from '@/lib/saas/billing.service';
import { authenticateRequest } from '@/lib/api-auth';

// 获取当前订阅信息
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId } = auth;

    // 获取当前订阅
    const subscription = await getCurrentSubscription(tenantId);

    // 检查订阅状态
    const tenantStatus = await checkTenantStatus(tenantId);

    // 检查是否即将到期
    const expiringSoon = await isSubscriptionExpiringSoon(tenantId);

    return NextResponse.json({
      subscription,
      tenantStatus,
      expiringSoon,
    });
  } catch (error) {
    console.error('获取订阅信息失败:', error);
    return NextResponse.json(
      { error: '获取订阅信息失败' },
      { status: 500 }
    );
  }
}

// 取消订阅
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId } = auth;

    const result = await cancelSubscription(tenantId);

    return NextResponse.json({
      success: true,
      message: '订阅已取消，将在当前周期结束后失效',
      subscription: result,
    });
  } catch (error) {
    console.error('取消订阅失败:', error);
    return NextResponse.json(
      { error: '取消订阅失败' },
      { status: 500 }
    );
  }
}

// 恢复订阅
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId } = auth;

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'resume') {
      const result = await reactivateSubscription(tenantId);
      return NextResponse.json({
        success: true,
        message: '订阅已恢复',
        subscription: result,
      });
    }

    return NextResponse.json(
      { error: '未知操作' },
      { status: 400 }
    );
  } catch (error) {
    console.error('操作订阅失败:', error);
    return NextResponse.json(
      { error: '操作订阅失败' },
      { status: 500 }
    );
  }
}
