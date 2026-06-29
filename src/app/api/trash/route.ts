import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 回收站API
 * GET /api/trash - 获取回收站列表
 * POST /api/trash/restore - 批量恢复文件
 * DELETE /api/trash - 永久删除文件
 * POST /api/trash/empty - 清空回收站
 */

// ─── GET /api/trash — 获取回收站列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '20', 10);

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // db.file.findMany → Prisma skip/take 的未定义行为（Math.min(100, NaN) 仍为 NaN）。
    // 与 activity-logs/files/storage 等的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: 'page 必须 >= 1' }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: 'pageSize 必须为正整数' }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

    const fileType = searchParams.get('fileType');
    const search = searchParams.get('search') || '';

    // 构建查询条件
    const where: any = {
      userId,
      tenantId,
      isDeleted: true,
    };

    if (fileType) {
      where.fileType = fileType;
    }

    if (search) {
      where.fileName = {
        contains: search,
      };
    }

    // 计算总数
    const total = await db.file.count({ where });

    // 计算总大小
    const sizeResult = await db.file.aggregate({
      where,
      _sum: {
        fileSize: true,
      },
    });

    // 分页查询回收站文件
    const files = await db.file.findMany({
      where,
      orderBy: { deletedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        thumbnailUrl: true,
        folderId: true,
        deletedAt: true,
        createdAt: true,
      },
    });

    // 返回分页结果
    return NextResponse.json({
      data: files,
      total,
      totalSize: sizeResult._sum.fileSize || 0,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch trash:', error);
    return NextResponse.json(
      { error: '获取回收站列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/trash/restore — 批量恢复文件 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const url = new URL(request.url);
    const action = url.pathname.includes('/restore') ? 'restore' : 'empty';

    if (action === 'empty') {
      // 清空回收站
      return await emptyTrash(userId, tenantId);
    }

    // 恢复文件
    const body = await request.json();
    const { fileIds, targetFolderId } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'fileIds is required' },
        { status: 400 }
      );
    }

    // 如果指定了目标文件夹，验证目标文件夹存在
    if (targetFolderId) {
      const targetFolder = await db.folder.findUnique({
        where: { id: targetFolderId },
        select: { id: true, userId: true, tenantId: true },
      });

      if (!targetFolder || targetFolder.userId !== userId || targetFolder.tenantId !== tenantId) {
        return NextResponse.json(
          { error: '目标文件夹不存在或无权访问' },
          { status: 404 }
        );
      }
    }

    // 使用事务批量恢复
    const result = await db.$transaction(async (tx) => {
      // 验证所有文件都在回收站且属于当前用户和租户
      const files = await tx.file.findMany({
        where: {
          id: { in: fileIds },
          userId,
          tenantId,
          isDeleted: true,
        },
        select: { id: true, folderId: true },
      });

      if (files.length !== fileIds.length) {
        throw new Error('部分文件不在回收站或无权访问');
      }

      // 恢复文件
      const updateData: any = {
        isDeleted: false,
        deletedAt: null,
      };

      // 如果指定了目标文件夹，移动到目标文件夹
      if (targetFolderId) {
        updateData.folderId = targetFolderId;
      }

      const restoreResult = await tx.file.updateMany({
        where: {
          id: { in: fileIds },
          userId,
          tenantId,
          isDeleted: true,
        },
        data: updateData,
      });

      return restoreResult.count;
    });

    return NextResponse.json({
      success: true,
      restoredCount: result,
    });
  } catch (error: any) {
    console.error('Failed to restore files:', error);
    return NextResponse.json(
      { error: error.message || '恢复文件失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/trash — 永久删除文件 ─────────────
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { fileIds } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'fileIds is required' },
        { status: 400 }
      );
    }

    // 使用事务永久删除
    const result = await db.$transaction(async (tx) => {
      // 验证所有文件都在回收站且属于当前用户和租户
      const files = await tx.file.findMany({
        where: {
          id: { in: fileIds },
          userId,
          tenantId,
          isDeleted: true,
        },
        select: { id: true },
      });

      if (files.length !== fileIds.length) {
        throw new Error('部分文件不在回收站或无权访问');
      }

      // 永久删除文件（注意：这里是硬删除，实际应用中可能需要先删除物理文件）
      const deleteResult = await tx.file.deleteMany({
        where: {
          id: { in: fileIds },
          userId,
          tenantId,
          isDeleted: true,
        },
      });

      return deleteResult.count;
    });

    return NextResponse.json({
      success: true,
      deletedCount: result,
    });
  } catch (error: any) {
    console.error('Failed to permanently delete files:', error);
    return NextResponse.json(
      { error: error.message || '永久删除失败' },
      { status: 500 }
    );
  }
}

// ─── 清空回收站 ─────────────
async function emptyTrash(userId: string, tenantId: string) {
  try {
    // 统计要删除的文件数量
    const count = await db.file.count({
      where: {
        userId,
        tenantId,
        isDeleted: true,
      },
    });

    // 永久删除所有回收站文件
    await db.file.deleteMany({
      where: {
        userId,
        tenantId,
        isDeleted: true,
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: count,
    });
  } catch (error) {
    console.error('Failed to empty trash:', error);
    return NextResponse.json(
      { error: '清空回收站失败' },
      { status: 500 }
    );
  }
}
