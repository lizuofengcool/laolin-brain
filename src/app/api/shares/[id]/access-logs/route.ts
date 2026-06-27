/**
 * 分享访问日志API
 * GET - 获取分享访问日志
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';
import { authenticateRequest } from '@/lib/api-auth';

// ==================== GET - 获取分享访问日志 ====================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const action = searchParams.get('action') || undefined;

    const result = shareManager.getAccessLogs(id, tenantId, {
      page,
      pageSize,
      action,
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: result.logs,
        pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: Math.ceil(result.total / result.pageSize),
          hasMore: page * pageSize < result.total,
        },
      },
    });
  } catch (error) {
    console.error('获取分享访问日志失败:', error);
    return NextResponse.json(
      { success: false, error: '获取分享访问日志失败' },
      { status: 500 }
    );
  }
}
