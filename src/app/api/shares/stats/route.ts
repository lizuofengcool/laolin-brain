/**
 * 分享统计API
 * GET - 获取分享统计
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';
import { authenticateRequest } from '@/lib/api-auth';

// ==================== GET - 获取分享统计 ====================

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  try {
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
