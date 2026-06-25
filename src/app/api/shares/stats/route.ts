/**
 * 分享统计API
 * GET - 获取分享统计
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';

// ==================== GET - 获取分享统计 ====================

export async function GET(request: NextRequest) {
  try {
    // 模拟租户ID（实际应该从认证中获取）
    const tenantId = 'default_tenant';

    const stats = shareManager.getStats(tenantId);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('获取分享统计失败:', error);
    return NextResponse.json(
      { success: false, error: '获取分享统计失败' },
      { status: 500 }
    );
  }
}
