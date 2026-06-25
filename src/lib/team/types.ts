/**
 * 团队空间类型定义
 * 支持团队管理、空间管理、文件协作、团队活动
 */

// ==================== 团队相关类型 ====================

/**
 * 团队状态
 */
export type TeamStatus = 'active' | 'archived' | 'suspended';

/**
 * 团队角色
 */
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * 团队成员状态
 */
export type TeamMemberStatus = 'active' | 'invited' | 'inactive' | 'removed';

/**
 * 团队
 */
export interface Team {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  avatar?: string;
  status: TeamStatus;
  memberCount: number;
  spaceCount: number;
  storageLimit?: number; // 团队存储限制（字节）
  storageUsed: number; // 已使用存储（字节）
  settings: TeamSettings;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 团队设置
 */
export interface TeamSettings {
  allowMemberCreateSpace: boolean; // 允许成员创建空间
  allowMemberInvite: boolean; // 允许成员邀请
  defaultSpaceRole: SpaceRole; // 默认空间角色
  visibility: 'private' | 'tenant_visible'; // 团队可见性
  notifications: {
    memberJoin: boolean;
    memberLeave: boolean;
    spaceCreate: boolean;
    fileUpload: boolean;
    comment: boolean;
  };
}

/**
 * 团队成员
 */
export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  tenantId: string;
  role: TeamRole;
  status: TeamMemberStatus;
  joinedAt?: Date;
  invitedBy?: string;
  invitedAt?: Date;
  lastActiveAt?: Date;
}

/**
 * 团队邀请
 */
export interface TeamInvitation {
  id: string;
  teamId: string;
  tenantId: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
  token: string;
}

// ==================== 空间相关类型 ====================

/**
 * 空间类型
 */
export type SpaceType = 'personal' | 'team' | 'shared';

/**
 * 空间状态
 */
export type SpaceStatus = 'active' | 'archived' | 'deleted';

/**
 * 空间角色
 */
export type SpaceRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'commenter';

/**
 * 空间权限
 */
export interface SpacePermissions {
  canView: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canDelete: boolean;
  canShare: boolean;
  canComment: boolean;
  canEdit: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
}

/**
 * 空间
 */
export interface Space {
  id: string;
  tenantId: string;
  teamId?: string; // 团队空间时有值
  name: string;
  description?: string;
  type: SpaceType;
  status: SpaceStatus;
  ownerId: string;
  memberCount: number;
  fileCount: number;
  folderCount: number;
  storageUsed: number; // 字节
  storageLimit?: number; // 字节
  color?: string;
  icon?: string;
  settings: SpaceSettings;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 空间设置
 */
export interface SpaceSettings {
  allowComments: boolean; // 允许评论
  allowSharing: boolean; // 允许分享
  allowDownload: boolean; // 允许下载
  versioning: boolean; // 版本控制
  versionLimit?: number; // 版本数量限制
  autoDeleteDays?: number; // 自动删除天数（回收站）
  notifications: {
    fileUpload: boolean;
    fileDelete: boolean;
    comment: boolean;
    memberJoin: boolean;
  };
}

/**
 * 空间成员
 */
export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  tenantId: string;
  role: SpaceRole;
  permissions: SpacePermissions;
  joinedAt: Date;
  addedBy?: string;
  lastActiveAt?: Date;
}

// ==================== 共享文件夹相关类型 ====================

/**
 * 共享权限
 */
export type SharePermission = 'view' | 'comment' | 'edit' | 'admin';

/**
 * 共享文件夹
 */
export interface SharedFolder {
  id: string;
  folderId: string;
  spaceId: string;
  tenantId: string;
  name: string;
  description?: string;
  permission: SharePermission;
  memberCount: number;
  fileCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 共享成员
 */
export interface SharedMember {
  id: string;
  sharedFolderId: string;
  userId: string;
  tenantId: string;
  permission: SharePermission;
  canShare: boolean;
  addedBy: string;
  addedAt: Date;
  lastAccessAt?: Date;
}

// ==================== 团队活动相关类型 ====================

/**
 * 活动类型
 */
export type ActivityType =
  | 'team_create'
  | 'team_update'
  | 'team_member_join'
  | 'team_member_leave'
  | 'team_member_role_change'
  | 'space_create'
  | 'space_update'
  | 'space_delete'
  | 'space_member_join'
  | 'space_member_leave'
  | 'file_upload'
  | 'file_update'
  | 'file_delete'
  | 'file_move'
  | 'file_share'
  | 'folder_create'
  | 'folder_update'
  | 'folder_delete'
  | 'comment_create'
  | 'comment_reply'
  | 'mention';

/**
 * 团队活动
 */
export interface TeamActivity {
  id: string;
  teamId: string;
  spaceId?: string;
  tenantId: string;
  type: ActivityType;
  actorId: string;
  actorName: string;
  actorAvatar?: string;
  targetType: 'team' | 'space' | 'file' | 'folder' | 'comment' | 'member';
  targetId: string;
  targetName?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

/**
 * 活动统计
 */
export interface ActivityStats {
  totalActivities: number;
  fileUploads: number;
  fileUpdates: number;
  comments: number;
  memberActivities: number;
  byDate: Record<string, number>;
  byUser: Record<string, number>;
  byType: Record<string, number>;
}

// ==================== 通知相关类型 ====================

/**
 * 通知类型
 */
export type NotificationType =
  | 'team_invitation'
  | 'space_invitation'
  | 'file_shared'
  | 'file_updated'
  | 'file_commented'
  | 'comment_replied'
  | 'mentioned'
  | 'task_assigned'
  | 'task_completed'
  | 'system';

/**
 * 团队通知
 */
export interface TeamNotification {
  id: string;
  userId: string;
  tenantId: string;
  teamId?: string;
  spaceId?: string;
  type: NotificationType;
  title: string;
  content: string;
  data?: Record<string, any>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

// ==================== 角色权限映射 ====================

/**
 * 团队角色权限映射
 */
export const TEAM_ROLE_PERMISSIONS: Record<TeamRole, {
  canManageTeam: boolean;
  canManageMembers: boolean;
  canCreateSpace: boolean;
  canDeleteSpace: boolean;
  canInviteMembers: boolean;
  canViewTeam: boolean;
}> = {
  owner: {
    canManageTeam: true,
    canManageMembers: true,
    canCreateSpace: true,
    canDeleteSpace: true,
    canInviteMembers: true,
    canViewTeam: true,
  },
  admin: {
    canManageTeam: true,
    canManageMembers: true,
    canCreateSpace: true,
    canDeleteSpace: false,
    canInviteMembers: true,
    canViewTeam: true,
  },
  member: {
    canManageTeam: false,
    canManageMembers: false,
    canCreateSpace: true,
    canDeleteSpace: false,
    canInviteMembers: false,
    canViewTeam: true,
  },
  viewer: {
    canManageTeam: false,
    canManageMembers: false,
    canCreateSpace: false,
    canDeleteSpace: false,
    canInviteMembers: false,
    canViewTeam: true,
  },
};

/**
 * 空间角色权限映射
 */
export const SPACE_ROLE_PERMISSIONS: Record<SpaceRole, SpacePermissions> = {
  owner: {
    canView: true,
    canUpload: true,
    canDownload: true,
    canDelete: true,
    canShare: true,
    canComment: true,
    canEdit: true,
    canManageMembers: true,
    canManageSettings: true,
  },
  admin: {
    canView: true,
    canUpload: true,
    canDownload: true,
    canDelete: true,
    canShare: true,
    canComment: true,
    canEdit: true,
    canManageMembers: true,
    canManageSettings: false,
  },
  editor: {
    canView: true,
    canUpload: true,
    canDownload: true,
    canDelete: true,
    canShare: false,
    canComment: true,
    canEdit: true,
    canManageMembers: false,
    canManageSettings: false,
  },
  commenter: {
    canView: true,
    canUpload: false,
    canDownload: true,
    canDelete: false,
    canShare: false,
    canComment: true,
    canEdit: false,
    canManageMembers: false,
    canManageSettings: false,
  },
  viewer: {
    canView: true,
    canUpload: false,
    canDownload: true,
    canDelete: false,
    canShare: false,
    canComment: false,
    canEdit: false,
    canManageMembers: false,
    canManageSettings: false,
  },
};

// ==================== 默认值 ====================

/**
 * 默认团队设置
 */
export const DEFAULT_TEAM_SETTINGS: TeamSettings = {
  allowMemberCreateSpace: true,
  allowMemberInvite: false,
  defaultSpaceRole: 'viewer',
  visibility: 'private',
  notifications: {
    memberJoin: true,
    memberLeave: true,
    spaceCreate: true,
    fileUpload: true,
    comment: true,
  },
};

/**
 * 默认空间设置
 */
export const DEFAULT_SPACE_SETTINGS: SpaceSettings = {
  allowComments: true,
  allowSharing: true,
  allowDownload: true,
  versioning: true,
  versionLimit: 10,
  autoDeleteDays: 30,
  notifications: {
    fileUpload: true,
    fileDelete: false,
    comment: true,
    memberJoin: true,
  },
};

// ==================== 工具函数类型 ====================

/**
 * 创建团队参数
 */
export interface CreateTeamParams {
  name: string;
  description?: string;
  avatar?: string;
  settings?: Partial<TeamSettings>;
}

/**
 * 创建空间参数
 */
export interface CreateSpaceParams {
  name: string;
  description?: string;
  teamId?: string;
  type?: SpaceType;
  color?: string;
  icon?: string;
  settings?: Partial<SpaceSettings>;
}

/**
 * 邀请成员参数
 */
export interface InviteMemberParams {
  email: string;
  role: TeamRole | SpaceRole;
  expiresInDays?: number;
}

/**
 * 活动查询参数
 */
export interface ActivityQueryParams {
  teamId?: string;
  spaceId?: string;
  type?: ActivityType | ActivityType[];
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}
