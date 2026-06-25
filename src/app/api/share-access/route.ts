/**
 * 分享访问API
 * POST - 验证分享访问
 * POST - 记录访问
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';

// ==================== POST - 验证分享访问 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password, action = 'view' } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: '缺少分享令牌' },
        { status: 400 }
      );
    }

    // 验证访问
    const result = shareManager.verifyShareAccess({
      token,
      password,
    });

    if (!result.valid || !result.share) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          requiresPassword: result.requiresPassword,
        },
        { status: 403 }
      );
    }

    // 记录访问（异步，不阻塞响应）
    const share = result.share;
    shareManager.recordAccess(share.id, action as 'view' | 'download' | 'comment' | 'edit', {
      visitorId: 'anonymous',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // 返回分享信息（不包含敏感字段）
    const { password: _, ...shareWithoutPassword } = share;

    return NextResponse.json({
      success: true,
      data: {
        share: shareWithoutPassword,
      },
    });
  } catch (error) {
    console.error('验证分享访问失败:', error);
    return NextResponse.json(
      { success: false, error: '验证分享访问失败' },
      { status: 500 }
    );
  }
}
