import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 租户单个用户管理API
 * PATCH /api/tenant/users/[id] - 修改用户角色
 * DELETE /api/tenant/users/[id] - 移除用户
 */

// ─── PATCH /api/tenant/users/[id] — 修改用户角色 ─────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: targetUserId } = await params;

  try {
    const body = await request.json();
    const { role } = body;

    if (!role || !['owner', 'admin', 'member', 'viewer'].includes(role)) {
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

    // 权限检查：只有owner可以修改角色
    if (currentRole !== 'owner') {
      return NextResponse.json(
        { error: '没有权限修改用户角色' },
        { status: 403 }
      );
    }

    // 不能修改自己的角色
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: '不能修改自己的角色' },
        { status: 400 }
      );
    }

    // 查询目标用户
    const targetTenantUser = await db.tenantUser.findFirst({
      where: {
        userId: targetUserId,
        tenantId,
      },
    });

    if (!targetTenantUser) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 修改用户角色
    const updated = await db.tenantUser.update({
      where: {
        tenantId_userId: {
          tenantId,
          userId: targetUserId,
        },
      },
      data: { role },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Failed to update user role:', error);
    return NextResponse.json(
      { error: '修改用户角色失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/tenant/users/[id] — 移除用户 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: targetUserId } = await params;

  try {
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

    // 权限检查：只有owner和admin可以移除用户
    if (currentRole !== 'owner' && currentRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限移除用户' },
        { status: 403 }
      );
    }

    // 不能移除自己
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: '不能移除自己' },
        { status: 400 }
      );
    }

    // 查询目标用户
    const targetTenantUser = await db.tenantUser.findFirst({
      where: {
        userId: targetUserId,
        tenantId,
      },
    });

    if (!targetTenantUser) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 不能移除owner
    if (targetTenantUser.role === 'owner') {
      return NextResponse.json(
        { error: '不能移除所有者' },
        { status: 400 }
      );
    }

    // 移除用户（删除租户用户关系）
    await db.tenantUser.delete({
      where: {
        tenantId_userId: {
          tenantId,
          userId: targetUserId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: '用户已移除',
    });
  } catch (error) {
    console.error('Failed to remove user:', error);
    return NextResponse.json(
      { error: '移除用户失败' },
      { status: 500 }
    );
  }
}
