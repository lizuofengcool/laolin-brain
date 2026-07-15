/**
 * 评论管理器
 * 负责评论的创建、编辑、删除、点赞、回复、审核等功能
 */

import {
  Comment,
  CommentStatus,
  CommentTargetType,
  CommentAttachment,
  CommentReaction,
  CommentQuote,
  CommentStats,
  CommentSettings,
  DEFAULT_COMMENT_SETTINGS,
  CommentSortBy,
  CommentFilter,
  CommentNotification,
  CommentNotificationType,
  CommentModeration,
  ModerationStatus,
  CommentReport,
  ReportReason,
  ExportFormat,
  ExportOptions,
  CreateCommentParams,
  UpdateCommentParams,
  CommentQueryParams,
  CommentPaginationResult,
  REACTION_EMOJIS,
} from './types';
import { escapeCsvCell } from '../csv-utils';

/**
 * 评论管理器
 */
export class CommentManager {
  private comments: Map<string, Comment> = new Map();
  private targetComments: Map<string, string[]> = new Map(); // targetId -> commentId列表
  private commentReplies: Map<string, string[]> = new Map(); // parentId -> replyId列表
  private notifications: Map<string, CommentNotification[]> = new Map();
  private moderations: Map<string, CommentModeration[]> = new Map();
  private reports: Map<string, CommentReport[]> = new Map();
  private settings: Map<string, CommentSettings> = new Map(); // targetId -> settings

  constructor() {
    // 初始化
  }

  // ==================== 评论创建 ====================

  /**
   * 创建评论
   */
  createComment(
    tenantId: string,
    userId: string,
    userName: string,
    params: CreateCommentParams,
    options?: { userAvatar?: string }
  ): Comment | null {
    // 检查评论设置
    const settings = this.getCommentSettings(params.targetId);
    if (!settings.enabled) return null;

    // 检查内容长度
    if (settings.maxLength && params.content.length > settings.maxLength) {
      return null;
    }

    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const comment: Comment = {
      id: commentId,
      tenantId,
      targetId: params.targetId,
      targetType: params.targetType,
      parentId: params.parentId,
      userId,
      userName,
      userAvatar: options?.userAvatar,
      content: params.content,
      status: settings.requireApproval ? 'pending' : 'published',
      likes: 0,
      likedBy: [],
      mentions: params.mentions,
      attachments: params.attachments,
      reactions: [],
      isEdited: false,
      replyCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.comments.set(commentId, comment);

    // 添加到目标评论列表
    const targetKey = `${params.targetType}_${params.targetId}`;
    const targetComments = this.targetComments.get(targetKey) || [];
    targetComments.unshift(commentId);
    this.targetComments.set(targetKey, targetComments);

    // 如果是回复，添加到父评论的回复列表
    if (params.parentId) {
      const replies = this.commentReplies.get(params.parentId) || [];
      replies.push(commentId);
      this.commentReplies.set(params.parentId, replies);

      // 更新父评论的回复数（租户隔离：跨租户父评论不计入回复数）
      const parentComment = this.comments.get(params.parentId);
      if (parentComment && parentComment.tenantId === tenantId) {
        parentComment.replyCount = replies.length;
        parentComment.updatedAt = new Date();
      }

      // 通知父评论作者（租户隔离：仅同租户父评论作者收到回复通知）
      if (parentComment && parentComment.tenantId === tenantId && parentComment.userId !== userId) {
        this.sendNotification(parentComment.userId, tenantId, {
          type: 'new_reply',
          commentId,
          targetId: params.targetId,
          targetType: params.targetType,
          fromUserId: userId,
          fromUserName: userName,
          content: params.content.substring(0, 100),
        });
      }
    } else {
      // 新评论通知（可以通知目标所有者等）
    }

    // 通知被@的用户
    if (params.mentions && params.mentions.length > 0) {
      for (const mentionedUserId of params.mentions) {
        if (mentionedUserId !== userId) {
          this.sendNotification(mentionedUserId, tenantId, {
            type: 'mentioned',
            commentId,
            targetId: params.targetId,
            targetType: params.targetType,
            fromUserId: userId,
            fromUserName: userName,
            content: params.content.substring(0, 100),
          });
        }
      }
    }

    return comment;
  }

  /**
   * 获取评论
   */
  getComment(commentId: string, tenantId: string): Comment | null {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return null;
    return comment;
  }

  /**
   * 查询评论列表
   */
  queryComments(params: CommentQueryParams & { tenantId: string }): CommentPaginationResult {
    const {
      tenantId,
      targetId,
      targetType,
      parentId,
      sortBy = 'newest',
      filter,
      page = 1,
      pageSize = 20,
      includeReplies = false,
      maxDepth = 1,
    } = params;

    let commentIds: string[] = [];

    if (parentId) {
      // 获取回复
      commentIds = this.commentReplies.get(parentId) || [];
    } else {
      // 获取目标的顶级评论
      const targetKey = `${targetType}_${targetId}`;
      commentIds = this.targetComments.get(targetKey) || [];

      // 只返回顶级评论（没有parentId的）
      commentIds = commentIds.filter(id => {
        const comment = this.comments.get(id);
        return comment && !comment.parentId;
      });
    }

    // 获取评论对象
    let comments = commentIds
      .map(id => this.comments.get(id))
      .filter((c): c is Comment => c !== undefined && c.tenantId === tenantId);

    // 应用筛选
    if (filter) {
      comments = this.applyFilter(comments, filter);
    }

    // 排序
    comments = this.sortComments(comments, sortBy);

    const total = comments.length;
    const start = (page - 1) * pageSize;
    const paginatedComments = comments.slice(start, start + pageSize);

    // 如果需要包含回复
    if (includeReplies && !parentId) {
      const commentsWithReplies = paginatedComments.map(comment => {
        const replies = this.getReplies(comment.id, tenantId, maxDepth);
        return { ...comment, replies };
      });

      return {
        comments: commentsWithReplies,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: start + pageSize < total,
      };
    }

    return {
      comments: paginatedComments,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: start + pageSize < total,
    };
  }

  /**
   * 获取回复列表（递归）
   * depth 表示下探层数：1=仅直接回复（叶子 replies 为 []），2=直接回复+孙回复，依此类推；
   * depth<=0 返回空数组。每个回复递归填充自身 replies 字段，maxDepth>1 时返回多层嵌套树
   * （此前实现仅返回扁平直接回复，maxDepth>1 与 maxDepth=1 行为相同——本轮修复为真递归）。
   */
  private getReplies(commentId: string, tenantId: string, depth: number): Comment[] {
    if (depth <= 0) return [];

    const replyIds = this.commentReplies.get(commentId) || [];
    const replies = replyIds
      .map(id => this.comments.get(id))
      .filter((c): c is Comment => c !== undefined && c.tenantId === tenantId);

    // 递归填充子回复（depth-1），使 maxDepth>1 时返回多层嵌套树而非扁平直接回复
    return replies.map(reply => ({
      ...reply,
      replies: this.getReplies(reply.id, tenantId, depth - 1),
    }));
  }

  /**
   * 应用筛选条件
   */
  private applyFilter(comments: Comment[], filter: CommentFilter): Comment[] {
    let filtered = [...comments];

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filtered = filtered.filter(c => statuses.includes(c.status));
    }

    if (filter.userId) {
      filtered = filtered.filter(c => c.userId === filter.userId);
    }

    if (filter.dateFrom) {
      filtered = filtered.filter(c => c.createdAt >= filter.dateFrom!);
    }

    if (filter.dateTo) {
      filtered = filtered.filter(c => c.createdAt <= filter.dateTo!);
    }

    if (filter.hasAttachments !== undefined) {
      filtered = filtered.filter(c =>
        filter.hasAttachments! ? (c.attachments?.length || 0) > 0 : (c.attachments?.length || 0) === 0
      );
    }

    if (filter.hasMentions !== undefined) {
      filtered = filtered.filter(c =>
        filter.hasMentions! ? (c.mentions?.length || 0) > 0 : (c.mentions?.length || 0) === 0
      );
    }

    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(c => c.content.toLowerCase().includes(searchLower));
    }

    return filtered;
  }

  /**
   * 排序评论
   */
  private sortComments(comments: Comment[], sortBy: CommentSortBy): Comment[] {
    const sorted = [...comments];

    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        break;
      case 'most_liked':
        sorted.sort((a, b) => b.likes - a.likes);
        break;
      case 'most_replies':
        sorted.sort((a, b) => b.replyCount - a.replyCount);
        break;
    }

    return sorted;
  }

  // ==================== 评论编辑 ====================

  /**
   * 更新评论
   */
  updateComment(
    commentId: string,
    tenantId: string,
    userId: string,
    updates: UpdateCommentParams
  ): Comment | null {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return null;

    // 检查权限（只能编辑自己的评论）
    if (comment.userId !== userId) return null;

    // 检查是否可以编辑
    const settings = this.getCommentSettings(comment.targetId);
    if (!settings.allowEditing) return null;

    // 检查编辑时间限制
    if (settings.editTimeLimit && settings.editTimeLimit > 0) {
      const timeElapsed = (Date.now() - comment.createdAt.getTime()) / (1000 * 60);
      if (timeElapsed > settings.editTimeLimit) return null;
    }

    // 检查内容长度
    if (settings.maxLength && updates.content && updates.content.length > settings.maxLength) {
      return null;
    }

    comment.content = updates.content || comment.content;
    comment.attachments = updates.attachments || comment.attachments;
    comment.isEdited = true;
    comment.editedAt = new Date();
    comment.updatedAt = new Date();

    return comment;
  }

  /**
   * 删除评论
   */
  deleteComment(commentId: string, tenantId: string, userId: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return false;

    // 检查权限（只能删除自己的评论，或者管理员）
    // 这里简化处理，只允许删除自己的
    if (comment.userId !== userId) return false;

    // 检查是否可以删除
    const settings = this.getCommentSettings(comment.targetId);
    if (!settings.allowDeletion) return false;

    // 检查删除时间限制
    if (settings.deleteTimeLimit && settings.deleteTimeLimit > 0) {
      const timeElapsed = (Date.now() - comment.createdAt.getTime()) / (1000 * 60);
      if (timeElapsed > settings.deleteTimeLimit) return false;
    }

    // 软删除
    comment.status = 'deleted';
    comment.updatedAt = new Date();

    // 从目标评论列表移除
    const targetKey = `${comment.targetType}_${comment.targetId}`;
    const targetComments = this.targetComments.get(targetKey) || [];
    const index = targetComments.indexOf(commentId);
    if (index !== -1) {
      targetComments.splice(index, 1);
      this.targetComments.set(targetKey, targetComments);
    }

    // 如果是回复，从父评论的回复列表移除
    if (comment.parentId) {
      const replies = this.commentReplies.get(comment.parentId) || [];
      const replyIndex = replies.indexOf(commentId);
      if (replyIndex !== -1) {
        replies.splice(replyIndex, 1);
        this.commentReplies.set(comment.parentId, replies);

        // 更新父评论的回复数
        const parentComment = this.comments.get(comment.parentId);
        if (parentComment) {
          parentComment.replyCount = replies.length;
          parentComment.updatedAt = new Date();
        }
      }
    }

    return true;
  }

  // ==================== 点赞和反应 ====================

  /**
   * 点赞/取消点赞
   */
  toggleLike(commentId: string, tenantId: string, userId: string): { liked: boolean; likes: number } {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) {
      return { liked: false, likes: 0 };
    }

    const likeIndex = comment.likedBy.indexOf(userId);
    let liked: boolean;

    if (likeIndex === -1) {
      // 点赞
      comment.likedBy.push(userId);
      comment.likes = comment.likedBy.length;
      liked = true;

      // 通知评论作者
      if (comment.userId !== userId) {
        this.sendNotification(comment.userId, tenantId, {
          type: 'liked',
          commentId,
          targetId: comment.targetId,
          targetType: comment.targetType,
          fromUserId: userId,
          fromUserName: '某人',
        });
      }
    } else {
      // 取消点赞
      comment.likedBy.splice(likeIndex, 1);
      comment.likes = comment.likedBy.length;
      liked = false;
    }

    comment.updatedAt = new Date();

    return { liked, likes: comment.likes };
  }

  /**
   * 添加表情反应
   */
  addReaction(
    commentId: string,
    tenantId: string,
    userId: string,
    emoji: string
  ): CommentReaction | null {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return null;

    // 检查是否是有效的表情
    if (!REACTION_EMOJIS.includes(emoji)) return null;

    if (!comment.reactions) {
      comment.reactions = [];
    }

    let reaction = comment.reactions.find(r => r.emoji === emoji);

    if (!reaction) {
      reaction = {
        emoji,
        count: 0,
        userIds: [],
      };
      comment.reactions.push(reaction);
    }

    // 检查用户是否已经反应过
    if (!reaction.userIds.includes(userId)) {
      reaction.userIds.push(userId);
      reaction.count = reaction.userIds.length;
      comment.updatedAt = new Date();
    }

    return reaction;
  }

  /**
   * 移除表情反应
   */
  removeReaction(commentId: string, tenantId: string, userId: string, emoji: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId || !comment.reactions) return false;

    const reaction = comment.reactions.find(r => r.emoji === emoji);
    if (!reaction) return false;

    const userIndex = reaction.userIds.indexOf(userId);
    if (userIndex === -1) return false;

    reaction.userIds.splice(userIndex, 1);
    reaction.count = reaction.userIds.length;
    comment.updatedAt = new Date();

    return true;
  }

  // ==================== 评论引用 ====================

  /**
   * 获取引用评论信息
   */
  getQuote(commentId: string, tenantId: string): CommentQuote | null {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return null;

    return {
      commentId: comment.id,
      userId: comment.userId,
      userName: comment.userName,
      content: comment.content,
      createdAt: comment.createdAt,
    };
  }

  // ==================== 评论统计 ====================

  /**
   * 获取评论统计
   */
  getStats(targetId: string, targetType: CommentTargetType, tenantId: string): CommentStats {
    const targetKey = `${targetType}_${targetId}`;
    const commentIds = this.targetComments.get(targetKey) || [];

    const comments = commentIds
      .map(id => this.comments.get(id))
      .filter((c): c is Comment => c !== undefined && c.tenantId === tenantId && c.status === 'published' && !c.parentId);

    let totalReplies = 0;
    let totalLikes = 0;
    const userSet = new Set<string>();
    const byDate: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const comment of comments) {
      totalReplies += comment.replyCount;
      totalLikes += comment.likes;
      userSet.add(comment.userId);

      const date = comment.createdAt.toISOString().split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
      byUser[comment.userId] = (byUser[comment.userId] || 0) + 1;
    }

    // 热门评论（按点赞数排序，取前5）
    const topComments = [...comments]
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 5);

    return {
      totalComments: comments.length,
      totalReplies,
      totalLikes,
      totalUsers: userSet.size,
      byDate,
      byUser,
      topComments,
    };
  }

  // ==================== 评论设置 ====================

  /**
   * 获取评论设置
   */
  getCommentSettings(targetId: string): CommentSettings {
    return this.settings.get(targetId) || { ...DEFAULT_COMMENT_SETTINGS };
  }

  /**
   * 更新评论设置
   */
  updateCommentSettings(targetId: string, updates: Partial<CommentSettings>): CommentSettings {
    const current = this.getCommentSettings(targetId);
    const updated = { ...current, ...updates };
    this.settings.set(targetId, updated);
    return updated;
  }

  // ==================== 评论审核 ====================

  /**
   * 审核评论
   */
  moderateComment(
    commentId: string,
    tenantId: string,
    moderatorId: string,
    moderatorName: string,
    status: 'approved' | 'rejected',
    reason?: string
  ): boolean {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return false;

    const moderation: CommentModeration = {
      id: `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      commentId,
      tenantId,
      status,
      moderatorId,
      moderatorName,
      reason,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const moderations = this.moderations.get(commentId) || [];
    moderations.push(moderation);
    this.moderations.set(commentId, moderations);

    // 更新评论状态
    if (status === 'approved') {
      comment.status = 'published';

      // 通知评论作者
      this.sendNotification(comment.userId, tenantId, {
        type: 'comment_approved',
        commentId,
        targetId: comment.targetId,
        targetType: comment.targetType,
        fromUserId: moderatorId,
        fromUserName: moderatorName,
      });
    } else if (status === 'rejected') {
      comment.status = 'deleted';
    }

    comment.updatedAt = new Date();

    return true;
  }

  /**
   * 举报评论
   */
  reportComment(
    commentId: string,
    tenantId: string,
    reporterId: string,
    reason: ReportReason,
    description?: string
  ): CommentReport | null {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return null;

    const report: CommentReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      commentId,
      tenantId,
      reporterId,
      reason,
      description,
      status: 'pending',
      createdAt: new Date(),
    };

    const reports = this.reports.get(commentId) || [];
    reports.push(report);
    this.reports.set(commentId, reports);

    return report;
  }

  // ==================== 通知管理 ====================

  /**
   * 发送通知
   */
  private sendNotification(
    userId: string,
    tenantId: string,
    notification: Omit<CommentNotification, 'id' | 'userId' | 'tenantId' | 'isRead' | 'createdAt'>
  ): void {
    const notificationRecord: CommentNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      tenantId,
      ...notification,
      isRead: false,
      createdAt: new Date(),
    };

    const userNotifications = this.notifications.get(userId) || [];
    userNotifications.unshift(notificationRecord);
    this.notifications.set(userId, userNotifications);
  }

  /**
   * 获取用户评论通知
   */
  getUserNotifications(
    userId: string,
    tenantId: string,
    options?: { unreadOnly?: boolean; limit?: number }
  ): CommentNotification[] {
    const notifications = this.notifications.get(userId) || [];
    let filtered = notifications.filter(n => n.tenantId === tenantId);

    if (options?.unreadOnly) {
      filtered = filtered.filter(n => !n.isRead);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * 标记通知为已读
   */
  markNotificationAsRead(notificationId: string, userId: string, tenantId: string): boolean {
    const notifications = this.notifications.get(userId);
    if (!notifications) return false;

    const notification = notifications.find(
      n => n.id === notificationId && n.tenantId === tenantId
    );

    if (!notification) return false;

    notification.isRead = true;
    notification.readAt = new Date();

    return true;
  }

  // ==================== 评论导出 ====================

  /**
   * 导出评论
   */
  exportComments(
    targetId: string,
    targetType: CommentTargetType,
    tenantId: string,
    options: ExportOptions
  ): string {
    const targetKey = `${targetType}_${targetId}`;
    const commentIds = this.targetComments.get(targetKey) || [];

    let comments = commentIds
      .map(id => this.comments.get(id))
      .filter((c): c is Comment => c !== undefined && c.tenantId === tenantId && c.status === 'published');

    // includeReplies=false 时仅导出顶级评论
    if (!options.includeReplies) {
      comments = comments.filter(c => !c.parentId);
    }

    // 日期过滤
    if (options.dateFrom) {
      comments = comments.filter(c => c.createdAt >= options.dateFrom!);
    }
    if (options.dateTo) {
      comments = comments.filter(c => c.createdAt <= options.dateTo!);
    }

    switch (options.format) {
      case 'json':
        return this.exportToJson(comments, options);
      case 'csv':
        return this.exportToCsv(comments, options);
      case 'markdown':
        return this.exportToMarkdown(comments, options);
      default:
        return this.exportToJson(comments, options);
    }
  }

  private exportToJson(comments: Comment[], options: ExportOptions): string {
    const exportData = comments.map(c => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      content: c.content,
      createdAt: c.createdAt,
      likes: options.includeLikes ? c.likes : undefined,
      attachments: options.includeAttachments ? c.attachments : undefined,
      replyCount: c.replyCount,
    }));

    return JSON.stringify(exportData, null, 2);
  }

  private exportToCsv(comments: Comment[], options: ExportOptions): string {
    const headers = ['ID', '用户ID', '用户名', '内容', '创建时间', '点赞数', '回复数'];
    const rows = comments.map(c => [
      escapeCsvCell(c.id),
      escapeCsvCell(c.userId),
      escapeCsvCell(c.userName),
      escapeCsvCell(c.content),
      escapeCsvCell(c.createdAt.toISOString()),
      escapeCsvCell(options.includeLikes ? c.likes : 0),
      escapeCsvCell(c.replyCount),
    ]);

    return [headers.map(escapeCsvCell).join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  private exportToMarkdown(comments: Comment[], options: ExportOptions): string {
    let md = '# 评论导出\n\n';

    for (const comment of comments) {
      md += `## ${comment.userName}\n\n`;
      md += `${comment.content}\n\n`;
      md += `*${comment.createdAt.toLocaleString()}*`;
      if (options.includeLikes) {
        md += ` | 👍 ${comment.likes}`;
      }
      md += ` | 💬 ${comment.replyCount}\n\n`;
      md += '---\n\n';
    }

    return md;
  }

  // ==================== 工具方法 ====================

  /**
   * 检查用户是否可以编辑评论
   */
  canEditComment(commentId: string, userId: string, tenantId: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return false;
    if (comment.userId !== userId) return false;

    const settings = this.getCommentSettings(comment.targetId);
    if (!settings.allowEditing) return false;

    if (settings.editTimeLimit && settings.editTimeLimit > 0) {
      const timeElapsed = (Date.now() - comment.createdAt.getTime()) / (1000 * 60);
      if (timeElapsed > settings.editTimeLimit) return false;
    }

    return true;
  }

  /**
   * 检查用户是否可以删除评论
   */
  canDeleteComment(commentId: string, userId: string, tenantId: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment || comment.tenantId !== tenantId) return false;
    if (comment.userId !== userId) return false;

    const settings = this.getCommentSettings(comment.targetId);
    if (!settings.allowDeletion) return false;

    if (settings.deleteTimeLimit && settings.deleteTimeLimit > 0) {
      const timeElapsed = (Date.now() - comment.createdAt.getTime()) / (1000 * 60);
      if (timeElapsed > settings.deleteTimeLimit) return false;
    }

    return true;
  }

  /**
   * 获取评论状态显示名称
   */
  getStatusDisplayName(status: CommentStatus): string {
    const statusNames: Record<CommentStatus, string> = {
      published: '已发布',
      pending: '待审核',
      deleted: '已删除',
      spam: '垃圾内容',
    };
    return statusNames[status] || status;
  }

  /**
   * 获取举报原因显示名称
   */
  getReportReasonDisplayName(reason: ReportReason): string {
    const reasonNames: Record<ReportReason, string> = {
      spam: '垃圾广告',
      harassment: '骚扰/欺凌',
      hate_speech: '仇恨言论',
      inappropriate: '不当内容',
      misinformation: '虚假信息',
      other: '其他',
    };
    return reasonNames[reason] || reason;
  }
}

// 导出单例
export const commentManager = new CommentManager();
