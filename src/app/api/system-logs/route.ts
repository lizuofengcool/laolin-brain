import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 系统日志API
 * GET /api/system-logs - 获取系统日志
 * POST /api/system-logs - 记录系统日志（内部使用）
 */

// ─── GET /api/system-logs — 获取系统日志 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const level = searchParams.get('level');
    const module = searchParams.get('module');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // 查询用户的租户和角色
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

    // 权限检查：只有owner和admin可以查看系统日志
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限查看系统日志' },
        { status: 403 }
      );
    }

    // 构建查询条件
    const where: any = {
      tenantId,
    };

    if (level) {
      where.level = level;
    }

    if (module) {
      where.module = module;
    }

    if (dateFrom) {
      where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
    }

    if (dateTo) {
      where.createdAt = { ...where.createdAt, lte: new Date(dateTo) };
    }

    // 计算总数
    const total = await db.systemLog.count({ where });

    // 分页查询日志列表
    const logs = await db.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: logs.map(log => ({
        id: log.id,
        level: log.level,
        module: log.module,
        message: log.message,
        details: log.details,
        createdAt: log.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch system logs:', error);
    return NextResponse.json(
      { error: '获取系统日志失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/system-logs — 记录系统日志 ─────────────
export async function POST(request: NextRequest) {
  // 内部使用，需要验证内部调用
  // 实际生产中应该有内部API密钥验证
  try {
    const body = await request.json();
    const { level = 'info', module = 'system', message, details, tenantId } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    // 记录日志
    await db.systemLog.create({
      data: {
        tenantId: tenantId || null,
        level,
        module,
        message,
        details: details ? JSON.stringify(details) : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: '日志已记录',
    });
  } catch (error) {
    console.error('Failed to log system log:', error);
    return NextResponse.json(
      { error: '记录日志失败' },
      { status: 500 }
    );
  }
}
