/**
 * 分享列表API
 * GET - 获取分享列表
 * POST - 创建分享
 * DELETE - 批量删除分享
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';
import { ShareTargetType, ShareMethod, ShareStatus } from '@/lib/shares/types';

// ==================== GET - 获取分享列表 ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 解析查询参数
    const targetId = searchParams.get('targetId') || undefined;
    const targetType = searchParams.get('targetType') as ShareTargetType | undefined;
    const statusParam = searchParams.get('status');
    const shareMethodParam = searchParams.get('shareMethod');
    const createdBy = searchParams.get('createdBy') || undefined;
    const search = searchParams.get('search') || undefined;
    const sortBy = searchParams.get('sortBy') as 'createdAt' | 'accessCount' | 'downloadCount' | 'expiresAt' || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' || 'desc';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const dateFrom = searchParams.get('dateFrom') ? new Date(searchParams.get('dateFrom')!) : undefined;
    const dateTo = searchParams.get('dateTo') ? new Date(searchParams.get('dateTo')!) : undefined;

    // 解析状态
    let status: ShareStatus | ShareStatus[] | undefined;
    if (statusParam) {
      status = statusParam.split(',') as ShareStatus[];
      if (status.length === 1) {
        status = status[0];
      }
    }

    // 解析分享方式
    let shareMethod: ShareMethod | ShareMethod[] | undefined;
    if (shareMethodParam) {
      shareMethod = shareMethodParam.split(',') as ShareMethod[];
      if (shareMethod.length === 1) {
        shareMethod = shareMethod[0];
      }
    }

    // 模拟租户ID（实际应该从认证中获取）
    const tenantId = 'default_tenant';
    const userId = 'default_user';

    // 查询分享
    const result = shareManager.queryShares({
      tenantId,
      targetId,
      targetType,
      status,
      shareMethod,
      createdBy,
      search,
      sortBy,
      sortOrder,
      page,
      pageSize,
      dateFrom,
      dateTo,
    });

    return NextResponse.json({
      success: true,
      data: {
        shares: result.shares,
        pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
          hasMore: result.hasMore,
        },
      },
    });
  } catch (error) {
    console.error('获取分享列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取分享列表失败' },
      { status: 500 }
    );
  }
}

// ==================== POST - 创建分享 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      targetId,
      targetType,
      shareMethod,
      permissions,
      password,
      expiresAt,
      maxAccessCount,
      title,
      description,
      allowComment,
      allowDownload,
      allowEdit,
      notifyOnAccess,
      notifyOnDownload,
      customUrl,
      watermark,
      previewMode,
      templateId,
    } = body;

    if (!targetId || !targetType || !shareMethod) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 模拟租户ID和用户信息（实际应该从认证中获取）
    const tenantId = 'default_tenant';
    const userId = 'default_user';
    const userName = '默认用户';

    let share;

    // 如果指定了模板，从模板创建
    if (templateId) {
      share = shareManager.createShareFromTemplate(
        tenantId,
        userId,
        userName,
        targetId,
        targetType as ShareTargetType,
        templateId
      );
    } else {
      // 解析过期时间
      const expiresAtDate = expiresAt ? new Date(expiresAt) : undefined;

      share = shareManager.createShare(tenantId, userId, userName, {
        targetId,
        targetType: targetType as ShareTargetType,
        shareMethod: shareMethod as ShareMethod,
        permissions,
        password,
        expiresAt: expiresAtDate,
        maxAccessCount,
        title,
        description,
        allowComment,
        allowDownload,
        allowEdit,
        notifyOnAccess,
        notifyOnDownload,
        customUrl,
        watermark,
        previewMode,
      });
    }

    if (!share) {
      return NextResponse.json(
        { success: false, error: '创建分享失败' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        share,
        shareUrl: `/s/${share.token}`,
      },
    });
  } catch (error) {
    console.error('创建分享失败:', error);
    return NextResponse.json(
      { success: false, error: '创建分享失败' },
      { status: 500 }
    );
  }
}

// ==================== DELETE - 批量删除分享 ====================

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { shareIds } = body;

    if (!shareIds || !Array.isArray(shareIds) || shareIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少分享ID列表' },
        { status: 400 }
      );
    }

    // 模拟租户ID和用户信息（实际应该从认证中获取）
    const tenantId = 'default_tenant';
    const userId = 'default_user';

    const result = shareManager.batchDeleteShares(shareIds, tenantId, userId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('批量删除分享失败:', error);
    return NextResponse.json(
      { success: false, error: '批量删除分享失败' },
      { status: 500 }
    );
  }
}
