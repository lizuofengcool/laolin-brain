import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 通知API
 * GET /api/notifications - 获取通知列表
 * POST /api/notifications/read - 标记已读
 * DELETE /api/notifications - 删除通知
 * GET /api/notifications/unread-count - 获取未读数量
 */

// ─── GET /api/notifications — 获取通知列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const type = searchParams.get('type');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId } = tenantUser;

    // 构建查询条件
    const where: any = {
      userId,
      tenantId,
    };

    if (type) {
      where.type = type;
    }

    if (unreadOnly) {
      where.isRead = false;
    }

    // 计算总数
    const total = await db.notification.count({ where });

    // 分页查询通知列表
    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: notifications,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return NextResponse.json(
      { error: '获取通知列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/notifications — 创建通知（内部使用） ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { type, title, content, targetUserId, targetTenantId } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: 'type and title are required' },
        { status: 400 }
      );
    }

    // 确定通知的接收者
    const notifyUserId = targetUserId || userId;
    let notifyTenantId = targetTenantId;

    if (!notifyTenantId) {
      const tenantUser = await db.tenantUser.findFirst({
        where: { userId: notifyUserId },
        select: { tenantId: true },
      });
      notifyTenantId = tenantUser?.tenantId;
    }

    if (!notifyTenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // 创建通知
    const notification = await db.notification.create({
      data: {
        tenantId: notifyTenantId,
        userId: notifyUserId,
        type,
        title,
        content,
      },
    });

    return NextResponse.json(notification);
  } catch (error) {
    console.error('Failed to create notification:', error);
    return NextResponse.json(
      { error: '创建通知失败' },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/notifications — 标记已读 ─────────────
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { notificationIds, markAll = false } = body;

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId } = tenantUser;

    let updatedCount = 0;

    if (markAll) {
      // 标记所有为已读
      const result = await db.notification.updateMany({
        where: {
          userId,
          tenantId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      updatedCount = result.count;
    } else if (notificationIds && Array.isArray(notificationIds)) {
      // 标记指定通知为已读
      const result = await db.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId,
          tenantId,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      updatedCount = result.count;
    } else {
      return NextResponse.json(
        { error: 'notificationIds or markAll is required' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount,
    });
  } catch (error) {
    console.error('Failed to mark notifications as read:', error);
    return NextResponse.json(
      { error: '标记已读失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/notifications — 删除通知 ─────────────
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { notificationIds } = body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: 'notificationIds is required' },
        { status: 400 }
      );
    }

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId } = tenantUser;

    // 批量删除通知
    const result = await db.notification.deleteMany({
      where: {
        id: { in: notificationIds },
        userId,
        tenantId,
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Failed to delete notifications:', error);
    return NextResponse.json(
      { error: '删除通知失败' },
      { status: 500 }
    );
  }
}
