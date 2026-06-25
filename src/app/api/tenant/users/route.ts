import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 租户用户管理API
 * GET /api/tenant/users - 获取租户用户列表
 * PATCH /api/tenant/users/[id] - 修改用户角色
 * DELETE /api/tenant/users/[id] - 移除用户
 */

// ─── GET /api/tenant/users — 获取租户用户列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const search = searchParams.get('search');
    const role = searchParams.get('role');

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

    // 权限检查：只有owner和admin可以查看用户列表
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限查看用户列表' },
        { status: 403 }
      );
    }

    // 构建查询条件
    const where: any = {
      tenantId,
    };

    if (role) {
      where.role = role;
    }

    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // 计算总数
    const total = await db.tenantUser.count({ where });

    // 分页查询用户列表
    const users = await db.tenantUser.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: users.map(tu => ({
        id: tu.user.id,
        name: tu.user.name,
        email: tu.user.email,
        role: tu.role,
        joinedAt: tu.joinedAt,
        createdAt: tu.user.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch tenant users:', error);
    return NextResponse.json(
      { error: '获取用户列表失败' },
      { status: 500 }
    );
  }
}
