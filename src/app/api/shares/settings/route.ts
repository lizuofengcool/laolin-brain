/**
 * 分享设置API
 * GET - 获取分享设置
 * PATCH - 更新分享设置
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';

// ==================== GET - 获取分享设置 ====================

export async function GET(request: NextRequest) {
  try {
    // 模拟租户ID（实际应该从认证中获取）
    const tenantId = 'default_tenant';

    const settings = shareManager.getShareSettings(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        settings,
      },
    });
  } catch (error) {
    console.error('获取分享设置失败:', error);
    return NextResponse.json(
      { success: false, error: '获取分享设置失败' },
      { status: 500 }
    );
  }
}

// ==================== PATCH - 更新分享设置 ====================

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // 模拟租户ID（实际应该从认证中获取）
    const tenantId = 'default_tenant';

    const updatedSettings = shareManager.updateShareSettings(tenantId, body);

    return NextResponse.json({
      success: true,
      data: {
        settings: updatedSettings,
      },
    });
  } catch (error) {
    console.error('更新分享设置失败:', error);
    return NextResponse.json(
      { success: false, error: '更新分享设置失败' },
      { status: 500 }
    );
  }
}
