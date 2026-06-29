/**
 * 分享列表API
 * GET - 获取分享列表
 * POST - 创建分享
 * DELETE - 批量删除分享
 */

import { NextRequest, NextResponse } from 'next/server';
import { shareManager } from '@/lib/shares';
import { authenticateRequest } from '@/lib/api-auth';
import { ShareTargetType, ShareMethod, ShareStatus } from '@/lib/shares/types';

// ==================== GET - 获取分享列表 ====================

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

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

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝。shareManager.queryShares 无
    // `|| 默认值` 兜底（解构默认值 page=1/pageSize=20 仅对 undefined 生效，不挡 NaN），
    // NaN 透传会导致 slice(NaN,NaN) 静默返回空列表 + page/pageSize/totalPages 字段为 NaN。
    // 与 files/storage/tags 及 cloud-sync/queue 的 isNaN||<1 → 400 约定一致
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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { tenantId, userId, email } = auth;

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

    const userName = email;

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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { tenantId, userId } = auth;

  try {
    const body = await request.json();
    const { shareIds } = body;

    if (!shareIds || !Array.isArray(shareIds) || shareIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少分享ID列表' },
        { status: 400 }
      );
    }

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
