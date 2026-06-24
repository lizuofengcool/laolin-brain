import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 备份管理API
 * GET /api/backups - 获取备份列表
 * POST /api/backups - 创建备份
 */

// ─── GET /api/backups — 获取备份列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const status = searchParams.get('status');

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

    // 构建查询条件
    const where: any = {
      tenantId,
    };

    if (status) {
      where.status = status;
    }

    // 计算总数
    const total = await db.backup.count({ where });

    // 分页查询备份列表
    const backups = await db.backup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: backups.map(backup => ({
        id: backup.id,
        name: backup.name,
        type: backup.type,
        size: backup.size,
        fileCount: backup.fileCount,
        status: backup.status,
        error: backup.error,
        createdAt: backup.createdAt,
        completedAt: backup.completedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch backups:', error);
    return NextResponse.json(
      { error: '获取备份列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/backups — 创建备份 ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { name, type = 'full' } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

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

    // 检查是否有正在运行的备份
    const runningBackup = await db.backup.findFirst({
      where: {
        tenantId,
        status: 'running',
      },
    });

    if (runningBackup) {
      return NextResponse.json(
        { error: '已有备份正在进行中，请稍后再试' },
        { status: 400 }
      );
    }

    // 创建备份记录
    const backup = await db.backup.create({
      data: {
        tenantId,
        userId,
        name,
        type,
        status: 'pending',
      },
    });

    // 异步执行备份（这里先标记为pending，实际执行需要后台任务）
    // TODO: 实现实际的备份执行逻辑

    // 更新状态为running（模拟）
    await db.backup.update({
      where: { id: backup.id },
      data: { status: 'running' },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: backup.id,
        name: backup.name,
        type: backup.type,
        status: 'running',
        createdAt: backup.createdAt,
      },
      message: '备份已开始执行，请稍后查看进度',
    });
  } catch (error) {
    console.error('Failed to create backup:', error);
    return NextResponse.json(
      { error: '创建备份失败' },
      { status: 500 }
    );
  }
}
