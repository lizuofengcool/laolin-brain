import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 评论点赞API
 * POST /api/comments/[id]/like - 点赞/取消点赞
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;
  const { id: commentId } = await params;

  try {
    // 查询评论（tenantId 已由 authenticateRequest 解析）
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

    // 检查用户是否已经点赞
    const likedBy = comment.likedBy ? JSON.parse(comment.likedBy) : [];
    const userLikedIndex = likedBy.indexOf(userId);

    let liked: boolean;
    let newLikes: number;

    if (userLikedIndex === -1) {
      // 点赞
      likedBy.push(userId);
      liked = true;
    } else {
      // 取消点赞
      likedBy.splice(userLikedIndex, 1);
      liked = false;
    }

    newLikes = likedBy.length;

    // 更新评论（按租户隔离写入，前置 findFirst 已校验归属）
    await db.comment.updateMany({
      where: { id: commentId, tenantId },
      data: {
        likes: newLikes,
        likedBy: JSON.stringify(likedBy),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        liked,
        likes: newLikes,
      },
      message: liked ? '点赞成功' : '取消点赞成功',
    });
  } catch (error) {
    console.error('Failed to toggle like:', error);
    return NextResponse.json(
      { error: '点赞操作失败' },
      { status: 500 }
    );
  }
}
