/**
 * 分享详情API
 * GET - 获取分享详情
 * PATCH - 更新分享
 * DELETE - 删除分享
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';

// ==================== GET - 获取分享详情 ====================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 模拟租户ID（实际应该从认证中获取）
    const tenantId = 'default_tenant';

    const share = shareManager.getShare(id, tenantId);

    if (!share) {
      return NextResponse.json(
        { success: false, error: '分享不存在' },
        { status: 404 }
      );
    }

    // 获取访问日志（最近10条）
    const accessLogs = shareManager.getAccessLogs(id, tenantId, {
      page: 1,
      pageSize: 10,
    });

    return NextResponse.json({
      success: true,
      data: {
        share,
        recentAccesses: accessLogs.logs,
        totalAccesses: accessLogs.total,
      },
    });
  } catch (error) {
    console.error('获取分享详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取分享详情失败' },
      { status: 500 }
    );
  }
}

// ==================== PATCH - 更新分享 ====================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 模拟租户ID和用户信息（实际应该从认证中获取）
    const tenantId = 'default_tenant';
    const userId = 'default_user';

    const updatedShare = shareManager.updateShare(id, tenantId, userId, body);

    if (!updatedShare) {
      return NextResponse.json(
        { success: false, error: '更新分享失败或无权操作' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        share: updatedShare,
      },
    });
  } catch (error) {
    console.error('更新分享失败:', error);
    return NextResponse.json(
      { success: false, error: '更新分享失败' },
      { status: 500 }
    );
  }
}

// ==================== DELETE - 删除分享 ====================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 模拟租户ID和用户信息（实际应该从认证中获取）
    const tenantId = 'default_tenant';
    const userId = 'default_user';

    const result = shareManager.batchDeleteShares([id], tenantId, userId);

    if (result.success === 0) {
      return NextResponse.json(
        { success: false, error: '删除分享失败或无权操作' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '分享已删除',
    });
  } catch (error) {
    console.error('删除分享失败:', error);
    return NextResponse.json(
      { success: false, error: '删除分享失败' },
      { status: 500 }
    );
  }
}
