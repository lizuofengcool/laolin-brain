import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 活动日志API
 * GET /api/activity-logs - 获取活动日志列表
 */

// ─── GET /api/activity-logs — 获取活动日志列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const action = searchParams.get('action');
    const resourceType = searchParams.get('resourceType');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

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

    const { tenantId, role } = tenantUser;

    // 构建查询条件
    const where: any = {
      tenantId,
    };

    // 普通用户只能看自己的日志，管理员可以看所有
    if (role !== 'admin' && role !== 'owner') {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (resourceType) {
      where.resourceType = resourceType;
    }

    if (dateFrom) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(dateFrom),
      };
    }

    if (dateTo) {
      where.createdAt = {
        ...where.createdAt,
        lte: new Date(dateTo),
      };
    }

    // 计算总数
    const total = await db.activityLog.count({ where });

    // 分页查询活动日志
    const logs = await db.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch activity logs:', error);
    return NextResponse.json(
      { error: '获取活动日志失败' },
      { status: 500 }
    );
  }
}
