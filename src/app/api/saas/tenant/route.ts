/**
 * 租户信息 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenant, checkTenantStatus, getCurrentSubscription } from '@/lib/saas/tenant.service';
import { authenticateRequest } from '@/lib/api-auth';

// 获取当前租户信息
export async function GET(request: NextRequest) {
  try {
    // tenantId 来自可信 auth，忽略 query 中的 tenantId/userId
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId } = auth;

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
