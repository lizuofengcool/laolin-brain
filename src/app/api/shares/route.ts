import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 分享管理API
 * GET /api/shares - 获取我的分享列表
 * DELETE /api/shares - 批量删除分享
 */

// ─── GET /api/shares — 获取我的分享列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const fileId = searchParams.get('fileId');

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId } = tenantUser;

    // 构建查询条件
    const where: any = {
      file: {
        userId,
        tenantId,
      },
    };

    if (fileId) {
      where.fileId = fileId;
    }

    // 计算总数
    const total = await db.fileShare.count({
      where,
    });

    // 分页查询分享列表
    const shares = await db.fileShare.findMany({
      where,
      include: {
        file: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileSize: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: shares,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch shares:', error);
    return NextResponse.json(
      { error: '获取分享列表失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/shares — 批量删除分享 ─────────────
export async function DELETE(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { shareIds } = body;

    if (!shareIds || !Array.isArray(shareIds) || shareIds.length === 0) {
      return NextResponse.json(
        { error: 'shareIds is required' },
        { status: 400 }
      );
    }

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId } = tenantUser;

    // 使用事务批量删除
    const result = await db.$transaction(async (tx) => {
      // 验证所有分享都属于当前用户和租户
      const shares = await tx.fileShare.findMany({
        where: {
          id: { in: shareIds },
          file: {
            userId,
            tenantId,
          },
        },
        select: { id: true },
      });

      if (shares.length !== shareIds.length) {
        throw new Error('部分分享不存在或无权访问');
      }

      // 删除分享
      const deleteResult = await tx.fileShare.deleteMany({
        where: {
          id: { in: shareIds },
        },
      });

      return deleteResult.count;
    });

    return NextResponse.json({
      success: true,
      deletedCount: result,
    });
  } catch (error: any) {
    console.error('Failed to delete shares:', error);
    return NextResponse.json(
      { error: error.message || '删除分享失败' },
      { status: 500 }
    );
  }
}
