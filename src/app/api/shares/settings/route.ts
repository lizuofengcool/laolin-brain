/**
 * 分享设置API
 * GET - 获取分享设置
 * PATCH - 更新分享设置
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';
import { authenticateRequest } from '@/lib/api-auth';

// ==================== GET - 获取分享设置 ====================

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  try {
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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  try {
    const body = await request.json();

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
