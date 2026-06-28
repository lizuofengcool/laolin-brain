import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
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

    // 权限检查：只有owner和admin可以查看系统日志
    if (role !== 'owner' && role !== 'admin') {
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
  // 内部使用：要求 x-internal-key 与 INTERNAL_API_KEY 环境变量常量时间匹配。
  // 此前 POST 完全无鉴权且信任 body.tenantId，任意未认证请求可向任意租户/
  // 全局注入日志（污染审计、DoS 日志查询）。src 内无任何调用方，故未配置
  // INTERNAL_API_KEY 时 fail-closed（返回 403）不会影响现有功能。
  const internalKey = process.env.INTERNAL_API_KEY;
  const providedKey = request.headers.get('x-internal-key');
  if (!internalKey || !providedKey) {
    return NextResponse.json(
      { error: '未授权：内部日志写入需要有效的 x-internal-key' },
      { status: 403 }
    );
  }
  const expectedBuf = Buffer.from(internalKey);
  const providedBuf = Buffer.from(providedKey);
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return NextResponse.json(
      { error: '未授权：内部日志写入需要有效的 x-internal-key' },
      { status: 403 }
    );
  }

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
