import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { stripHtml } from "@/lib/sanitize";
import { commentManager } from "@/lib/comments";
import { CommentTargetType, CommentSortBy, ExportFormat } from "@/lib/comments/types";

/**
 * 评论API
 * GET /api/comments?fileId=xxx - 获取文件评论列表
 * POST /api/comments - 发表评论
 * DELETE /api/comments/[id] - 删除评论
 */

// ─── GET /api/comments — 获取评论列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const targetType = (searchParams.get('targetType') as CommentTargetType) || 'file';
    const parentId = searchParams.get('parentId') || undefined;
    const sortBy = (searchParams.get('sortBy') as CommentSortBy) || 'newest';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '20', 10);
    const includeReplies = searchParams.get('includeReplies') === 'true';
    const action = searchParams.get('action');

    // 统计接口
    if (action === 'stats') {
      const targetId = searchParams.get('targetId') || fileId;
      if (!targetId) {
        return NextResponse.json(
          { error: 'targetId is required' },
          { status: 400 }
        );
      }

      const stats = commentManager.getStats(targetId, targetType, tenantId);
      return NextResponse.json({ success: true, data: stats });
    }

    // 导出接口
    if (action === 'export') {
      const targetId = searchParams.get('targetId') || fileId;
      const format = (searchParams.get('format') as ExportFormat) || 'json';
      const includeRepliesExport = searchParams.get('includeReplies') === 'true';
      const includeAttachments = searchParams.get('includeAttachments') === 'true';
      const includeLikes = searchParams.get('includeLikes') === 'true';

      if (!targetId) {
        return NextResponse.json(
          { error: 'targetId is required' },
          { status: 400 }
        );
      }

      const exportContent = commentManager.exportComments(
        targetId,
        targetType,
        tenantId,
        {
          format,
          includeReplies: includeRepliesExport,
          includeAttachments,
          includeLikes,
        }
      );

      const contentType = format === 'csv' ? 'text/csv' : format === 'markdown' ? 'text/markdown' : 'application/json';
      const fileName = `comments_${Date.now()}.${format}`;

      return new NextResponse(exportContent, {
        headers: {
          'Content-Type': `${contentType}; charset=utf-8`,
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
        { status: 400 }
      );
    }

    // 验证文件是否存在且属于该租户（tenantId 已由 authenticateRequest 解析）
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

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // db.comment.findMany → Prisma skip/take 的未定义行为（Math.min(100, NaN) 仍为 NaN）。
    // 评论为文件级数据（无 role 门控），门控置于 stats/export 分支与文件存在性校验之后：
    // ?action=stats/export 不使用分页（早返回）；?fileId=缺失/不存在 优先 400/404；
    // ?page=abc 仅在已确认文件后拒绝。与 activity-logs/files/storage 等的 isNaN||<1 → 400 约定一致
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
      fileId,
      parentId: parentId || null, // 只查顶级评论或指定父评论的回复
    };

    // 计算总数
    const total = await db.comment.count({ where });

    // 排序配置
    let orderBy: any = { createdAt: 'desc' };
    switch (sortBy) {
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'most_liked':
        orderBy = { likes: 'desc' };
        break;
      case 'most_replies':
        orderBy = { createdAt: 'desc' };
        break;
    }

    // 分页查询评论列表
    const comments = await db.comment.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 获取所有用户ID
    const userIds = [...new Set(comments.map(c => c.userId))];

    // 批量查询用户信息
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatar: true },
    });

    // 创建用户映射
    const userMap = new Map(users.map(u => [u.id, u]));

    // 如果需要包含回复
    let commentsWithReplies = comments;
    if (includeReplies && !parentId) {
      const topLevelCommentIds = comments.map(c => c.id);
      const replies = await db.comment.findMany({
        where: {
          tenantId,
          fileId,
          parentId: { in: topLevelCommentIds },
        },
        orderBy: { createdAt: 'asc' },
      });

      const replyMap = new Map<string, typeof replies>();
      for (const reply of replies) {
        const parentIdReply = reply.parentId;
        if (parentIdReply) {
          if (!replyMap.has(parentIdReply)) {
            replyMap.set(parentIdReply, []);
          }
          replyMap.get(parentIdReply)!.push(reply);
        }
      }

      commentsWithReplies = comments.map(comment => ({
        ...comment,
        replies: replyMap.get(comment.id) || [],
      })) as any;
    }

    // 返回分页结果
    return NextResponse.json({
      data: commentsWithReplies.map((comment: any) => {
        const user = userMap.get(comment.userId);
        const result: any = {
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
        };

        if (comment.replies) {
          result.replies = comment.replies.map((reply: any) => {
            const replyUser = userMap.get(reply.userId);
            return {
              id: reply.id,
              content: reply.content,
              userId: reply.userId,
              userName: replyUser?.name || '未知用户',
              userEmail: replyUser?.email,
              userAvatar: replyUser?.avatar,
              likes: reply.likes || 0,
              isEdited: reply.isEdited || false,
              editedAt: reply.editedAt,
              createdAt: reply.createdAt,
              updatedAt: reply.updatedAt,
              parentId: reply.parentId,
            };
          });
        }

        return result;
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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { fileId, content, parentId, mentions, attachments, targetType, targetId } = body;

    const actualTargetId = targetId || fileId;
    const actualTargetType = targetType || 'file';

    if (!actualTargetId || !content) {
      return NextResponse.json(
        { error: 'targetId and content are required' },
        { status: 400 }
      );
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { error: '评论内容不能超过5000字' },
        { status: 400 }
      );
    }

    if (actualTargetType === 'file') {
      const file = await db.file.findFirst({
        where: {
          id: actualTargetId,
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
    }

    const user = await db.user.findFirst({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatar: true },
    });

    // 校验父评论归属：parentId 来自请求体，必须属于当前租户，
    // 否则攻击者可借此向其它租户的评论注入回复计数或建立跨租户回复链。
    if (parentId) {
      const parent = await db.comment.findFirst({
        where: { id: parentId, tenantId },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json(
          { error: '父评论不存在' },
          { status: 404 }
        );
      }
    }

    const safeContent = stripHtml(content);

    const comment = await db.comment.create({
      data: {
        tenantId,
        fileId: actualTargetType === 'file' ? actualTargetId : null,
        targetType: actualTargetType,
        targetId: actualTargetId,
        userId,
        content: safeContent,
        parentId: parentId || null,
        ...(mentions ? { mentions: JSON.stringify(mentions) } : {}),
        ...(attachments ? { attachments: JSON.stringify(attachments) } : {}),
      },
    });

    if (parentId) {
      // 按租户隔离递增父评论回复数（updateMany 支持非唯一 where）
      await db.comment.updateMany({
        where: { id: parentId, tenantId },
        data: {
          replyCount: { increment: 1 },
        },
      });
    }

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
      },
      message: '评论发表成功',
    });
  } catch (error) {
    console.error('Failed to create comment:', error);
    return NextResponse.json(
      { error: '发表评论失败' },
      { status: 500 }
    );
  }
}
