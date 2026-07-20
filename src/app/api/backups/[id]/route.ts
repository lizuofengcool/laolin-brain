import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { unlink } from "fs/promises";
import { createTenantDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 单个备份管理API
 * GET /api/backups/[id] - 获取备份详情
 * DELETE /api/backups/[id] - 删除备份
 * POST /api/backups/[id]/restore - 恢复备份
 *
 * 第二百零一轮：从 raw db.backup.* 收口至 TenantDb 隔离层（与 files/[id] 路由同范式）。
 *   - findFirst / delete 经 tenantDb.backup.* 调用，prisma 调用前自动注入 tenantId
 *     守卫，不再依赖调用方手动 where.tenantId。
 *   - tenantDb.backup.delete 内部走 deleteMany + tenantId 守卫，跨租户 id 删除
 *     影响行数为 0（与原 findFirst + delete 组合等价，但少一道手动 where 越权风险）。
 */

// ─── GET /api/backups/[id] — 获取备份详情 ─────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;
  const { id: backupId } = await params;

  try {
    // 权限检查：只有owner和admin可以管理备份
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理备份' },
        { status: 403 }
      );
    }

    // 走 TenantDb 租户隔离层：tenantDb.backup.findFirst 自动注入 tenantId，
    // 跨租户 id 查询恒返回 null（等价于不存在，与原 raw db + 手动 where 行为一致）。
    const tenantDb = createTenantDb(tenantId);

    // 查询备份详情
    const backup = await tenantDb.backup.findFirst({
      where: {
        id: backupId,
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

  const { tenantId, role } = auth;
  const { id: backupId } = await params;

  try {
    // 权限检查：只有owner和admin可以管理备份
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理备份' },
        { status: 403 }
      );
    }

    // 走 TenantDb 租户隔离层：tenantDb.backup.findFirst / delete 自动注入 tenantId
    const tenantDb = createTenantDb(tenantId);

    // 检查备份是否存在
    const existingBackup = await tenantDb.backup.findFirst({
      where: {
        id: backupId,
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

    // 路径遍历防护：若 filePath 越界（不在 ./backups 目录下）则拒绝整个删除操作，
    // 避免删除 DB 记录后被用于清理任意磁盘文件。与 files/[id] DELETE 的 upload 目录
    // 前缀校验同范式（defense-in-depth，前置阻断优于事后清理）。
    if (existingBackup.filePath) {
      const backupDir = path.resolve('./backups');
      const resolvedPath = path.resolve(existingBackup.filePath);
      if (!resolvedPath.startsWith(backupDir)) {
        return NextResponse.json(
          { error: 'Invalid file path' },
          { status: 400 }
        );
      }
    }

    // 删除备份记录（tenantDb.backup.delete 走 deleteMany + tenantId 守卫，
    // 即使 backupId 被构造为跨租户 id，tenantId 守卫会拦截实际删除）
    await tenantDb.backup.delete({
      where: { id: backupId },
    });

    // 删除物理备份文件（best-effort：DB 记录已删除，文件缺失不应阻断响应）
    if (existingBackup.filePath) {
      try {
        await unlink(existingBackup.filePath);
      } catch {
        // 文件可能已不存在（手动清理 / 未实际生成），忽略
      }
    }

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
