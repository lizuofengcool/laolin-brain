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

  const { tenantId, role: authRole } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '20', 10);
    const search = searchParams.get('search');
    const role = searchParams.get('role');

    // 权限检查：只有owner和admin可以查看用户列表
    if (authRole !== 'owner' && authRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限查看用户列表' },
        { status: 403 }
      );
    }

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // db.tenantUser.findMany → Prisma skip/take 的未定义行为（Math.min(100, NaN) 仍为 NaN）。
    // 门控置于权限检查之后：member/viewer 的 403 优先于分页 400（不泄漏校验细节）。
    // 与 activity-logs/files/storage 等的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: 'page 必须 >= 1' }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: 'pageSize 必须为正整数' }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

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
