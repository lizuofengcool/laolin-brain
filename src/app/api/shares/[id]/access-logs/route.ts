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

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝。shareManager.getAccessLogs 虽以
    // `page||1`/`pageSize||20` 兜底 NaN，但路由本地 page/pageSize 仍透传进 hasMore 计算
    // （NaN < total = false）导致分页标志不一致；统一在路由边界拒绝。与 files/storage/tags
    // 及 cloud-sync/queue 的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json(
        { success: false, error: 'page 必须 >= 1' },
        { status: 400 }
      );
    }
    if (isNaN(pageSize) || pageSize < 1) {
      return NextResponse.json(
        { success: false, error: 'pageSize 必须为正整数' },
        { status: 400 }
      );
    }

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
