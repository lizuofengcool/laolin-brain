import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { stripHtml } from "@/lib/sanitize";
import { commentManager } from "@/lib/comments";

/**
 * 单个评论API
 * GET /api/comments/[id] - 获取评论详情
 * PATCH /api/comments/[id] - 更新评论
 * DELETE /api/comments/[id] - 删除评论
 * POST /api/comments/[id]/like - 点赞/取消点赞
 * POST /api/comments/[id]/reaction - 添加表情反应
 * DELETE /api/comments/[id]/reaction - 移除表情反应
 * POST /api/comments/[id]/report - 举报评论
 */

// ─── GET /api/comments/[id] — 获取评论详情 ─────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id: commentId } = await params;

  try {
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

    // 获取用户信息
    const user = await db.user.findFirst({
      where: { id: comment.userId },
      select: { id: true, name: true, email: true, avatar: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: comment.id,
        content: comment.content,
        userId: comment.userId,
        userName: user?.name || '未知用户',
        userEmail: user?.email,
        userAvatar: user?.avatar,
        likes: comment.likes || 0,
        isEdited: comment.isEdited || false,
        editedAt: comment.editedAt,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        parentId: comment.parentId,
        replyCount: comment.replyCount || 0,
      },
    });
  } catch (error) {
    console.error('Failed to get comment:', error);
    return NextResponse.json(
      { error: '获取评论详情失败' },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/comments/[id] — 更新评论 ─────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id: commentId } = await params;

  try {
    const body = await request.json();
    const { content, attachments } = body;

    if (!content && !attachments) {
      return NextResponse.json(
        { error: '没有需要更新的内容' },
        { status: 400 }
      );
    }

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

    // 权限检查：只能编辑自己的评论
    if (comment.userId !== userId) {
      return NextResponse.json(
        { error: '没有权限编辑此评论' },
        { status: 403 }
      );
    }

    // 内容长度限制
    if (content && content.length > 5000) {
      return NextResponse.json(
        { error: '评论内容不能超过5000字' },
        { status: 400 }
      );
    }

    // XSS防护
    const safeContent = content ? stripHtml(content) : undefined;

    // 更新评论
    const updatedComment = await db.comment.update({
      where: { id: commentId },
      data: {
        content: safeContent || comment.content,
        attachments: attachments ? JSON.stringify(attachments) : comment.attachments,
        isEdited: true,
        editedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 获取用户信息
    const user = await db.user.findFirst({
      where: { id: updatedComment.userId },
      select: { id: true, name: true, email: true, avatar: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedComment.id,
        content: updatedComment.content,
        userId: updatedComment.userId,
        userName: user?.name || '未知用户',
        userEmail: user?.email,
        userAvatar: user?.avatar,
        likes: updatedComment.likes || 0,
        isEdited: true,
        editedAt: updatedComment.editedAt,
        createdAt: updatedComment.createdAt,
        updatedAt: updatedComment.updatedAt,
        parentId: updatedComment.parentId,
      },
      message: '评论已更新',
    });
  } catch (error) {
    console.error('Failed to update comment:', error);
    return NextResponse.json(
      { error: '更新评论失败' },
      { status: 500 }
    );
  }
}

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

    // 如果是回复，更新父评论的回复数
    if (comment.parentId) {
      await db.comment.update({
        where: { id: comment.parentId },
        data: {
          replyCount: { decrement: 1 },
        },
      });
    }

    // 删除评论（软删除或硬删除，这里用硬删除）
    await db.comment.delete({
      where: { id: commentId },
    });

    // 同时删除子评论
    await db.comment.deleteMany({
      where: {
        tenantId,
        parentId: commentId,
      },
    });

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
