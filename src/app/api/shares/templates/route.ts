/**
 * 分享模板API
 * GET - 获取分享模板列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';

// ==================== GET - 获取分享模板列表 ====================

export async function GET(request: NextRequest) {
  try {
    const templates = shareManager.getTemplates();

    return NextResponse.json({
      success: true,
      data: {
        templates,
      },
    });
  } catch (error) {
    console.error('获取分享模板失败:', error);
    return NextResponse.json(
      { success: false, error: '获取分享模板失败' },
      { status: 500 }
    );
  }
}
