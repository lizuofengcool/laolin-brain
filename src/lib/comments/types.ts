/**
 * 评论系统类型定义
 * 支持评论回复、引用、编辑、删除、点赞、@提及等
 */

// ==================== 评论相关类型 ====================

/**
 * 评论状态
 */
export type CommentStatus = 'published' | 'pending' | 'deleted' | 'spam';

/**
 * 评论目标类型
 */
export type CommentTargetType = 'file' | 'folder' | 'task' | 'annotation' | 'space' | 'page';

/**
 * 评论
 */
export interface Comment {
  id: string;
  tenantId: string;
  targetId: string;
  targetType: CommentTargetType;
  parentId?: string; // 父评论ID，用于回复
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  status: CommentStatus;
  likes: number;
  likedBy: string[];
  mentions?: string[]; // @提及的用户ID列表
  attachments?: CommentAttachment[];
  reactions?: CommentReaction[];
  isEdited: boolean;
  editedAt?: Date;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
  replies?: Comment[]; // 嵌套回复（includeReplies=true 时由 queryComments 递归填充）
}

/**
 * 评论附件
 */
export interface CommentAttachment {
  id: string;
  type: 'image' | 'file' | 'code';
  url?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  code?: string;
  language?: string;
}

/**
 * 评论表情反应
 */
export interface CommentReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

/**
 * 评论引用
 */
export interface CommentQuote {
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
}

// ==================== 评论统计 ====================

/**
 * 评论统计
 */
export interface CommentStats {
  totalComments: number;
  totalReplies: number;
  totalLikes: number;
  totalUsers: number;
  byDate: Record<string, number>;
  byUser: Record<string, number>;
  topComments: Comment[];
}

// ==================== 评论设置 ====================

/**
 * 评论设置
 */
export interface CommentSettings {
  enabled: boolean;
  allowAnonymous: boolean;
  requireApproval: boolean;
  allowAttachments: boolean;
  allowEmojis: boolean;
  allowMentions: boolean;
  allowEditing: boolean;
  editTimeLimit?: number; // 分钟，0表示无限制
  allowDeletion: boolean;
  deleteTimeLimit?: number; // 分钟，0表示无限制
  maxLength?: number; // 最大字符数
  spamFilter: boolean;
  moderationEnabled: boolean;
}

/**
 * 默认评论设置
 */
export const DEFAULT_COMMENT_SETTINGS: CommentSettings = {
  enabled: true,
  allowAnonymous: false,
  requireApproval: false,
  allowAttachments: true,
  allowEmojis: true,
  allowMentions: true,
  allowEditing: true,
  editTimeLimit: 30, // 30分钟内可编辑
  allowDeletion: true,
  deleteTimeLimit: 60, // 60分钟内可删除
  maxLength: 5000,
  spamFilter: true,
  moderationEnabled: false,
};

// ==================== 评论排序 ====================

/**
 * 评论排序方式
 */
export type CommentSortBy = 'newest' | 'oldest' | 'most_liked' | 'most_replies';

/**
 * 评论筛选条件
 */
export interface CommentFilter {
  status?: CommentStatus | CommentStatus[];
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  hasAttachments?: boolean;
  hasMentions?: boolean;
  search?: string;
}

// ==================== 评论通知 ====================

/**
 * 评论通知类型
 */
export type CommentNotificationType =
  | 'new_comment'
  | 'new_reply'
  | 'mentioned'
  | 'liked'
  | 'comment_approved'
  | 'comment_deleted';

/**
 * 评论通知
 */
export interface CommentNotification {
  id: string;
  userId: string;
  tenantId: string;
  type: CommentNotificationType;
  commentId: string;
  targetId: string;
  targetType: CommentTargetType;
  fromUserId: string;
  fromUserName: string;
  content?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

// ==================== 评论审核 ====================

/**
 * 审核状态
 */
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

/**
 * 评论审核记录
 */
export interface CommentModeration {
  id: string;
  commentId: string;
  tenantId: string;
  status: ModerationStatus;
  moderatorId?: string;
  moderatorName?: string;
  reason?: string;
  flaggedBy?: string;
  flaggedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 举报原因
 */
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'inappropriate'
  | 'misinformation'
  | 'other';

/**
 * 评论举报
 */
export interface CommentReport {
  id: string;
  commentId: string;
  tenantId: string;
  reporterId: string;
  reason: ReportReason;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// ==================== 评论导出 ====================

/**
 * 导出格式
 */
export type ExportFormat = 'json' | 'csv' | 'markdown';

/**
 * 导出选项
 */
export interface ExportOptions {
  format: ExportFormat;
  includeReplies: boolean;
  includeAttachments: boolean;
  includeLikes: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

// ==================== 工具函数类型 ====================

/**
 * 创建评论参数
 */
export interface CreateCommentParams {
  targetId: string;
  targetType: CommentTargetType;
  content: string;
  parentId?: string;
  mentions?: string[];
  attachments?: CommentAttachment[];
  quoteCommentId?: string; // 引用的评论ID
}

/**
 * 更新评论参数
 */
export interface UpdateCommentParams {
  content?: string;
  attachments?: CommentAttachment[];
}

/**
 * 评论查询参数
 */
export interface CommentQueryParams {
  targetId: string;
  targetType: CommentTargetType;
  parentId?: string;
  sortBy?: CommentSortBy;
  filter?: CommentFilter;
  page?: number;
  pageSize?: number;
  includeReplies?: boolean;
  maxDepth?: number; // 最大回复深度
}

/**
 * 评论分页结果
 */
export interface CommentPaginationResult {
  comments: Comment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * 表情反应类型
 */
export const REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '😡',
  '🎉',
  '🔥',
  '💯',
  '🤔',
];

/**
 * 常用表情列表
 */
export const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛',
  '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
  '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔',
  '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
  '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
  '🔥', '💯', '🎉', '🎊', '✨', '⭐', '🌟', '💫', '⚡', '💡',
];
