import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { randomUUID } from "crypto";

/**
 * 邀请API
 * GET /api/invitations - 获取邀请列表
 * POST /api/invitations - 创建邀请
 * DELETE /api/invitations/[id] - 撤销邀请
 * POST /api/invitations/[token]/accept - 接受邀请
 */

// ─── GET /api/invitations — 获取邀请列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const status = searchParams.get('status');

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

    // 权限检查：只有owner和admin可以查看邀请列表
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限查看邀请列表' },
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
    const total = await db.invitation.count({ where });

    // 分页查询邀请列表
    const invitations = await db.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: invitations,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch invitations:', error);
    return NextResponse.json(
      { error: '获取邀请列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/invitations — 创建邀请 ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { email, role = 'member', expiresInHours = 72 } = body;

    if (!email) {
      return NextResponse.json(
        { error: '邮箱不能为空' },
        { status: 400 }
      );
    }

    if (!['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: '无效的角色' },
        { status: 400 }
      );
    }

    // 查询当前用户的租户和角色
    const currentTenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true, role: true },
    });

    if (!currentTenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId, role: currentRole } = currentTenantUser;

    // 权限检查：只有owner和admin可以邀请用户
    if (currentRole !== 'owner' && currentRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限邀请用户' },
        { status: 403 }
      );
    }

    // 检查邮箱是否已经在租户中
    const existingUser = await db.user.findFirst({
      where: { email },
      include: {
        tenantMemberships: {
          where: { tenantId },
        },
      },
    });

    if (existingUser && existingUser.tenantMemberships.length > 0) {
      return NextResponse.json(
        { error: '该用户已经在租户中' },
        { status: 400 }
      );
    }

    // 检查是否已经有未过期的邀请
    const existingInvitation = await db.invitation.findFirst({
      where: {
        tenantId,
        email,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: '该邮箱已有未过期的邀请' },
        { status: 400 }
      );
    }

    // 生成邀请令牌
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    // 创建邀请
    const invitation = await db.invitation.create({
      data: {
        tenantId,
        email,
        role,
        token,
        invitedBy: userId,
        expiresAt,
      },
    });

    // TODO: 发送邀请邮件
    // 预留邮件发送接口

    return NextResponse.json({
      success: true,
      data: invitation,
      message: '邀请已发送',
    });
  } catch (error) {
    console.error('Failed to create invitation:', error);
    return NextResponse.json(
      { error: '创建邀请失败' },
      { status: 500 }
    );
  }
}
