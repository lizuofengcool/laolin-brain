/**
 * 租户信息 API
 */

import { NextResponse } from 'next/server';
import { getTenant, checkTenantStatus, getUserTenants } from '@/lib/saas/tenant.service';
import { getCurrentSubscription } from '@/lib/saas/tenant.service';

// 获取当前租户信息
export async function GET(request: Request) {
  try {
    // TODO: 从 token 中解析 tenantId 和 userId
    // 简化版本：从 query 参数获取
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId');
    const userId = url.searchParams.get('userId');

    if (!tenantId) {
      return NextResponse.json(
        { error: '缺少租户 ID' },
        { status: 400 }
      );
    }

    // 获取租户信息
    const tenant = await getTenant(tenantId);
    if (!tenant) {
      return NextResponse.json(
        { error: '租户不存在' },
        { status: 404 }
      );
    }

    // 获取租户状态
    const status = await checkTenantStatus(tenantId);

    // 获取当前订阅
    const subscription = await getCurrentSubscription(tenantId);

    return NextResponse.json({
      tenant,
      status,
      subscription,
    });
  } catch (error) {
    console.error('获取租户信息失败:', error);
    return NextResponse.json(
      { error: '获取租户信息失败' },
      { status: 500 }
    );
  }
}
