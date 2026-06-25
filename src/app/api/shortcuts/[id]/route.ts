import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 单个快捷方式API
 * PATCH /api/shortcuts/[id] - 更新快捷方式
 * DELETE /api/shortcuts/[id] - 删除快捷方式
 * POST /api/shortcuts/[id]/pin - 固定/取消固定
 */

// ─── PATCH /api/shortcuts/[id] — 更新快捷方式 ─────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: shortcutId } = await params;

  try {
    const body = await request.json();
    const { name, icon, sortOrder, isPinned } = body;

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

    // 检查快捷方式是否存在
    const existingShortcut = await db.shortcut.findFirst({
      where: {
        id: shortcutId,
        tenantId,
        userId,
      },
    });

    if (!existingShortcut) {
      return NextResponse.json(
        { error: '快捷方式不存在' },
        { status: 404 }
      );
    }

    // 构建更新数据
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (icon !== undefined) updateData.icon = icon;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    // 更新快捷方式
    const shortcut = await db.shortcut.update({
      where: { id: shortcutId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: shortcut.id,
        name: shortcut.name,
        fileId: shortcut.fileId,
        folderId: shortcut.folderId,
        icon: shortcut.icon,
        sortOrder: shortcut.sortOrder,
        isPinned: shortcut.isPinned,
        createdAt: shortcut.createdAt,
      },
    });
  } catch (error) {
    console.error('Failed to update shortcut:', error);
    return NextResponse.json(
      { error: '更新快捷方式失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/shortcuts/[id] — 删除快捷方式 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: shortcutId } = await params;

  try {
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

    // 检查快捷方式是否存在
    const existingShortcut = await db.shortcut.findFirst({
      where: {
        id: shortcutId,
        tenantId,
        userId,
      },
    });

    if (!existingShortcut) {
      return NextResponse.json(
        { error: '快捷方式不存在' },
        { status: 404 }
      );
    }

    // 删除快捷方式
    await db.shortcut.delete({
      where: { id: shortcutId },
    });

    return NextResponse.json({
      success: true,
      message: '快捷方式已删除',
    });
  } catch (error) {
    console.error('Failed to delete shortcut:', error);
    return NextResponse.json(
      { error: '删除快捷方式失败' },
      { status: 500 }
    );
  }
}
