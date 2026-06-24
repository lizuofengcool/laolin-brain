import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 单个评论API
 * DELETE /api/comments/[id] - 删除评论
 */

// ─── DELETE /api/comments/[id] — 删除评论 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id: commentId } = await params;

  try {
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

    // 查询评论
    const comment = await db.comment.findFirst({
      where: {
        id: commentId,
        tenantId,
      },
    });

    if (!comment) {
      return NextResponse.json(
        { error: '评论不存在' },
        { status: 404 }
      );
    }

    // 权限检查：只能删除自己的评论，管理员可以删除所有
    if (comment.userId !== userId && userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限删除此评论' },
        { status: 403 }
      );
    }

    // 删除评论
    await db.comment.delete({
      where: { id: commentId },
    });

    // TODO: 删除子评论（级联删除）

    return NextResponse.json({
      success: true,
      message: '评论已删除',
    });
  } catch (error) {
    console.error('Failed to delete comment:', error);
    return NextResponse.json(
      { error: '删除评论失败' },
      { status: 500 }
    );
  }
}
