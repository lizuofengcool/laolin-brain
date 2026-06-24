import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { stripHtml } from "@/lib/sanitize";

/**
 * 评论API
 * GET /api/comments?fileId=xxx - 获取文件评论列表
 * POST /api/comments - 发表评论
 * DELETE /api/comments/[id] - 删除评论
 */

// ─── GET /api/comments — 获取评论列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
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

    // 验证文件是否存在且属于该租户
    const file = await db.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
      select: { id: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: '文件不存在' },
        { status: 404 }
      );
    }

    // 构建查询条件
    const where: any = {
      tenantId,
      fileId,
      parentId: null, // 只查顶级评论
    };

    // 计算总数
    const total = await db.comment.count({ where });

    // 分页查询评论列表
    const comments = await db.comment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 获取所有用户ID
    const userIds = [...new Set(comments.map(c => c.userId))];

    // 批量查询用户信息
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });

    // 创建用户映射
    const userMap = new Map(users.map(u => [u.id, u]));

    // 返回分页结果
    return NextResponse.json({
      data: comments.map(comment => {
        const user = userMap.get(comment.userId);
        return {
          id: comment.id,
          content: comment.content,
          userId: comment.userId,
          userName: user?.name || '未知用户',
          userEmail: user?.email,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return NextResponse.json(
      { error: '获取评论列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/comments — 发表评论 ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { fileId, content, parentId } = body;

    if (!fileId || !content) {
      return NextResponse.json(
        { error: 'fileId and content are required' },
        { status: 400 }
      );
    }

    // 内容长度限制
    if (content.length > 2000) {
      return NextResponse.json(
        { error: '评论内容不能超过2000字' },
        { status: 400 }
      );
    }

    // 查询用户的租户
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

    const { tenantId } = tenantUser;

    // 验证文件是否存在且属于该租户
    const file = await db.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
      select: { id: true, fileName: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: '文件不存在' },
        { status: 404 }
      );
    }

    // XSS防护：移除HTML标签
    const safeContent = stripHtml(content);

    // 创建评论
    const comment = await db.comment.create({
      data: {
        tenantId,
        fileId,
        userId,
        content: safeContent,
        parentId: parentId || null,
      },
    });

    // 查询用户信息
    const user = await db.user.findFirst({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    // TODO: 发送通知给文件所有者和其他评论者
    // 预留通知集成接口

    return NextResponse.json({
      success: true,
      data: {
        id: comment.id,
        content: comment.content,
        userId: comment.userId,
        userName: user?.name || '未知用户',
        userEmail: user?.email,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      },
    });
  } catch (error) {
    console.error('Failed to create comment:', error);
    return NextResponse.json(
      { error: '发表评论失败' },
      { status: 500 }
    );
  }
}
