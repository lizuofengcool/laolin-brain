/**
 * 协作功能类型定义
 * 支持实时协作、协作编辑、任务协作、协作通知
 */

// ==================== 实时协作相关类型 ====================

/**
 * 用户在线状态
 */
export type UserOnlineStatus = 'online' | 'offline' | 'away' | 'busy';

/**
 * 在线用户信息
 */
export interface OnlineUser {
  userId: string;
  userName: string;
  userAvatar?: string;
  status: UserOnlineStatus;
  lastActiveAt: Date;
  currentFileId?: string;
  currentSpaceId?: string;
  device?: string;
  ipAddress?: string;
}

/**
 * 编辑状态
 */
export type EditStatus = 'idle' | 'editing' | 'viewing' | 'locked';

/**
 * 文件编辑者信息
 */
export interface FileEditor {
  userId: string;
  userName: string;
  userAvatar?: string;
  fileId: string;
  status: EditStatus;
  cursorPosition?: CursorPosition;
  selectionRange?: SelectionRange;
  joinedAt: Date;
  lastActiveAt: Date;
}

/**
 * 光标位置
 */
export interface CursorPosition {
  line: number;
  column: number;
  offset?: number;
}

/**
 * 选区范围
 */
export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

/**
 * 实时协作会话
 */
export interface CollaborationSession {
  id: string;
  fileId: string;
  spaceId?: string;
  tenantId: string;
  hostUserId: string;
  participants: CollaborationParticipant[];
  status: 'active' | 'ended';
  startedAt: Date;
  endedAt?: Date;
  lastActivityAt: Date;
}

/**
 * 协作者
 */
export interface CollaborationParticipant {
  userId: string;
  userName: string;
  userAvatar?: string;
  role: 'host' | 'editor' | 'viewer';
  joinedAt: Date;
  lastActiveAt: Date;
  cursorColor?: string;
}

/**
 * 协作操作类型
 */
export type CollaborationOperationType =
  | 'insert'
  | 'delete'
  | 'replace'
  | 'move'
  | 'format'
  | 'cursor'
  | 'selection';

/**
 * 协作操作
 */
export interface CollaborationOperation {
  id: string;
  sessionId: string;
  userId: string;
  type: CollaborationOperationType;
  position?: number;
  length?: number;
  content?: string;
  timestamp: number;
  version: number;
}

/**
 * 冲突类型
 */
export type ConflictType = 'edit_conflict' | 'version_conflict' | 'permission_conflict';

/**
 * 协作冲突
 */
export interface CollaborationConflict {
  id: string;
  sessionId: string;
  fileId: string;
  type: ConflictType;
  user1Id: string;
  user2Id: string;
  operation1: CollaborationOperation;
  operation2: CollaborationOperation;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: 'user1' | 'user2' | 'merge' | 'manual';
  createdAt: Date;
}

// ==================== 协作编辑相关类型 ====================

/**
 * 编辑历史记录
 */
export interface EditHistory {
  id: string;
  fileId: string;
  tenantId: string;
  userId: string;
  userName: string;
  operation: string;
  description: string;
  changes?: EditChange[];
  versionBefore?: string;
  versionAfter?: string;
  createdAt: Date;
}

/**
 * 编辑变更
 */
export interface EditChange {
  type: 'insert' | 'delete' | 'replace' | 'format';
  position: number;
  oldContent?: string;
  newContent?: string;
  length?: number;
}

/**
 * 版本对比结果
 */
export interface VersionDiff {
  fileId: string;
  version1: string;
  version2: string;
  changes: DiffChange[];
  stats: {
    additions: number;
    deletions: number;
    modifications: number;
  };
}

/**
 * 差异变更
 */
export interface DiffChange {
  type: 'addition' | 'deletion' | 'modification';
  lineNumber: number;
  content: string;
  oldContent?: string;
  newContent?: string;
}

/**
 * 变更追踪
 */
export interface ChangeTracking {
  id: string;
  fileId: string;
  tenantId: string;
  userId: string;
  type: 'insert' | 'delete' | 'format';
  content: string;
  position: number;
  accepted: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

// ==================== 任务协作相关类型 ====================

/**
 * 任务状态
 */
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed' | 'cancelled';

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * 任务
 */
export interface CollaborationTask {
  id: string;
  title: string;
  description?: string;
  spaceId?: string;
  fileId?: string;
  folderId?: string;
  tenantId: string;
  createdBy: string;
  assignee?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  tags: string[];
  comments: TaskComment[];
  subtasks: Subtask[];
  attachments: TaskAttachment[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * 子任务
 */
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: Date;
  createdAt: Date;
}

/**
 * 任务评论
 */
export interface TaskComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  mentions?: string[];
  createdAt: Date;
}

/**
 * 任务附件
 */
export interface TaskAttachment {
  id: string;
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  addedBy: string;
  addedAt: Date;
}

/**
 * 任务列表
 */
export interface TaskList {
  id: string;
  name: string;
  description?: string;
  spaceId?: string;
  tenantId: string;
  tasks: string[]; // 任务ID列表，用于排序
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== 协作通知相关类型 ====================

/**
 * 协作通知类型
 */
export type CollaborationNotificationType =
  | 'task_assigned'
  | 'task_completed'
  | 'task_commented'
  | 'task_mentioned'
  | 'file_shared'
  | 'file_edited'
  | 'file_commented'
  | 'invitation'
  | 'mention'
  | 'review_requested';

/**
 * 协作通知
 */
export interface CollaborationNotification {
  id: string;
  userId: string;
  tenantId: string;
  type: CollaborationNotificationType;
  title: string;
  content: string;
  data?: {
    taskId?: string;
    fileId?: string;
    spaceId?: string;
    fromUserId?: string;
    fromUserName?: string;
    action?: string;
  };
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

/**
 * 通知设置
 */
export interface NotificationSettings {
  taskAssigned: boolean;
  taskCompleted: boolean;
  taskCommented: boolean;
  taskMentioned: boolean;
  fileShared: boolean;
  fileEdited: boolean;
  fileCommented: boolean;
  invitation: boolean;
  mention: boolean;
  reviewRequested: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  doNotDisturb: {
    enabled: boolean;
    startTime?: string;
    endTime?: string;
  };
}

// ==================== 评论批注相关类型 ====================

/**
 * 批注类型
 */
export type AnnotationType = 'text' | 'highlight' | 'comment' | 'suggestion';

/**
 * 批注
 */
export interface Annotation {
  id: string;
  fileId: string;
  tenantId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: AnnotationType;
  content: string;
  position?: AnnotationPosition;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  replies: AnnotationReply[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 批注位置
 */
export interface AnnotationPosition {
  startOffset: number;
  endOffset: number;
  startLine?: number;
  endLine?: number;
  selectedText?: string;
}

/**
 * 批注回复
 */
export interface AnnotationReply {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: Date;
}

// ==================== 权限和角色 ====================

/**
 * 协作角色
 */
export type CollaborationRole = 'owner' | 'editor' | 'commenter' | 'viewer';

/**
 * 协作权限
 */
export interface CollaborationPermissions {
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  canShare: boolean;
  canDelete: boolean;
  canManage: boolean;
}

/**
 * 角色权限映射
 */
export const COLLABORATION_ROLE_PERMISSIONS: Record<CollaborationRole, CollaborationPermissions> = {
  owner: {
    canView: true,
    canEdit: true,
    canComment: true,
    canShare: true,
    canDelete: true,
    canManage: true,
  },
  editor: {
    canView: true,
    canEdit: true,
    canComment: true,
    canShare: false,
    canDelete: false,
    canManage: false,
  },
  commenter: {
    canView: true,
    canEdit: false,
    canComment: true,
    canShare: false,
    canDelete: false,
    canManage: false,
  },
  viewer: {
    canView: true,
    canEdit: false,
    canComment: false,
    canShare: false,
    canDelete: false,
    canManage: false,
  },
};

// ==================== 默认值 ====================

/**
 * 默认通知设置
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  taskAssigned: true,
  taskCompleted: true,
  taskCommented: true,
  taskMentioned: true,
  fileShared: true,
  fileEdited: false,
  fileCommented: true,
  invitation: true,
  mention: true,
  reviewRequested: true,
  emailNotifications: true,
  pushNotifications: true,
  doNotDisturb: {
    enabled: false,
  },
};

/**
 * 光标颜色列表（用于区分不同用户）
 */
export const CURSOR_COLORS = [
  '#3b82f6', // 蓝色
  '#ef4444', // 红色
  '#22c55e', // 绿色
  '#f59e0b', // 橙色
  '#8b5cf6', // 紫色
  '#ec4899', // 粉色
  '#06b6d4', // 青色
  '#84cc16', // 黄绿色
];

// ==================== 工具函数类型 ====================

/**
 * 创建任务参数
 */
export interface CreateTaskParams {
  title: string;
  description?: string;
  spaceId?: string;
  fileId?: string;
  assignee?: string;
  priority?: TaskPriority;
  dueDate?: Date;
  tags?: string[];
}

/**
 * 更新任务参数
 */
export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  dueDate?: Date;
  tags?: string[];
}

/**
 * 任务查询参数
 */
export interface TaskQueryParams {
  spaceId?: string;
  assignee?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  dueDateFrom?: Date;
  dueDateTo?: Date;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'dueDate' | 'priority' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 创建批注参数
 */
export interface CreateAnnotationParams {
  fileId: string;
  type: AnnotationType;
  content: string;
  position?: AnnotationPosition;
}

/**
 * 协作会话配置
 */
export interface CollaborationSessionConfig {
  maxParticipants: number;
  autoSaveInterval: number; // 秒
  conflictResolution: 'auto' | 'manual' | 'last_write_wins';
  cursorTracking: boolean;
  selectionTracking: boolean;
  chatEnabled: boolean;
}

/**
 * 默认协作会话配置
 */
export const DEFAULT_COLLABORATION_CONFIG: CollaborationSessionConfig = {
  maxParticipants: 10,
  autoSaveInterval: 30,
  conflictResolution: 'last_write_wins',
  cursorTracking: true,
  selectionTracking: true,
  chatEnabled: true,
};
