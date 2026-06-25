import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 单个备份管理API
 * GET /api/backups/[id] - 获取备份详情
 * DELETE /api/backups/[id] - 删除备份
 * POST /api/backups/[id]/restore - 恢复备份
 */

// ─── GET /api/backups/[id] — 获取备份详情 ─────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: backupId } = await params;

  try {
    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true, role: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId, role: userRole } = tenantUser;

    // 权限检查：只有owner和admin可以管理备份
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理备份' },
        { status: 403 }
      );
    }

    // 查询备份详情
    const backup = await db.backup.findFirst({
      where: {
        id: backupId,
        tenantId,
      },
    });

    if (!backup) {
      return NextResponse.json(
        { error: '备份不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: backup.id,
        name: backup.name,
        type: backup.type,
        size: backup.size,
        fileCount: backup.fileCount,
        status: backup.status,
        error: backup.error,
        filePath: backup.filePath,
        createdAt: backup.createdAt,
        completedAt: backup.completedAt,
      },
    });
  } catch (error) {
    console.error('Failed to fetch backup:', error);
    return NextResponse.json(
      { error: '获取备份详情失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/backups/[id] — 删除备份 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: backupId } = await params;

  try {
    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true, role: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId, role: userRole } = tenantUser;

    // 权限检查：只有owner和admin可以管理备份
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理备份' },
        { status: 403 }
      );
    }

    // 检查备份是否存在
    const existingBackup = await db.backup.findFirst({
      where: {
        id: backupId,
        tenantId,
      },
    });

    if (!existingBackup) {
      return NextResponse.json(
        { error: '备份不存在' },
        { status: 404 }
      );
    }

    // 检查备份是否正在运行
    if (existingBackup.status === 'running') {
      return NextResponse.json(
        { error: '备份正在进行中，无法删除' },
        { status: 400 }
      );
    }

    // 删除备份
    await db.backup.delete({
      where: { id: backupId },
    });

    // TODO: 删除物理备份文件

    return NextResponse.json({
      success: true,
      message: '备份已删除',
    });
  } catch (error) {
    console.error('Failed to delete backup:', error);
    return NextResponse.json(
      { error: '删除备份失败' },
      { status: 500 }
    );
  }
}
