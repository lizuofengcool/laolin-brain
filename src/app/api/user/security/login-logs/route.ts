import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 安全设置API - 登录日志
 * GET /api/user/security/login-logs - 获取登录日志
 */

// ─── GET /api/user/security/login-logs — 获取登录日志 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10);

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // db.activityLog.findMany → Prisma skip/take 的未定义行为（Math.min(100, NaN) 仍为 NaN）。
    // 与 activity-logs/comments/files 等的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: "page 必须 >= 1" }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: "pageSize 必须为正整数" }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

    // 查询登录日志
    const where: any = {
      userId,
      action: "login",
    };

    // 计算总数
    const total = await db.activityLog.count({ where });

    // 分页查询日志
    const logs = await db.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        details: log.details ? JSON.parse(log.details) : null,
        createdAt: log.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error("Failed to fetch login logs:", error);
    return NextResponse.json(
      { error: "获取登录日志失败" },
      { status: 500 }
    );
  }
}
