/**
 * 分享系统类型定义
 * 支持多种分享方式、权限控制、访问统计等
 */

// ==================== 分享相关类型 ====================

/**
 * 分享状态
 */
export type ShareStatus = 'active' | 'expired' | 'revoked' | 'disabled';

/**
 * 分享权限
 */
export type SharePermission = 'view' | 'download' | 'edit' | 'comment' | 'full';

/**
 * 分享目标类型
 */
export type ShareTargetType = 'file' | 'folder' | 'album' | 'document' | 'collection' | 'space';

/**
 * 分享方式
 */
export type ShareMethod = 'link' | 'email' | 'password' | 'invite' | 'public';

/**
 * 分享
 */
export interface Share {
  id: string;
  tenantId: string;
  targetId: string;
  targetType: ShareTargetType;
  shareMethod: ShareMethod;
  token: string;
  createdBy: string;
  createdByName: string;
  permissions: SharePermission[];
  password?: string; // 密码哈希
  expiresAt?: Date;
  maxAccessCount?: number; // 最大访问次数
  accessCount: number; // 当前访问次数
  downloadCount: number; // 下载次数
  status: ShareStatus;
  allowComment: boolean;
  allowDownload: boolean;
  allowEdit: boolean;
  notifyOnAccess: boolean;
  notifyOnDownload: boolean;
  customUrl?: string; // 自定义短链接
  title?: string; // 分享标题
  description?: string; // 分享描述
  thumbnailUrl?: string; // 分享缩略图
  watermark?: boolean; // 是否加水印
  previewMode?: 'full' | 'limited' | 'watermark'; // 预览模式
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
}

/**
 * 分享访问记录
 */
export interface ShareAccessLog {
  id: string;
  shareId: string;
  tenantId: string;
  accessedBy?: string; // 登录用户ID
  visitorId?: string; // 访客ID（匿名用户）
  ipAddress?: string;
  userAgent?: string;
  action: 'view' | 'download' | 'comment' | 'edit';
  accessedAt: Date;
}

/**
 * 分享统计
 */
export interface ShareStats {
  totalShares: number;
  activeShares: number;
  expiredShares: number;
  revokedShares: number;
  totalAccesses: number;
  totalDownloads: number;
  byType: Record<ShareTargetType, number>;
  byMethod: Record<ShareMethod, number>;
  topShares: Share[];
  recentAccesses: ShareAccessLog[];
}

// ==================== 分享设置 ====================

/**
 * 分享设置
 */
export interface ShareSettings {
  enabled: boolean;
  defaultPermissions: SharePermission[];
  defaultExpiryDays?: number; // 默认过期天数，null表示永不过期
  requirePassword: boolean; // 是否强制密码
  maxExpiryDays?: number; // 最大过期天数
  allowPublicShares: boolean; // 是否允许公开分享
  allowCustomUrls: boolean; // 是否允许自定义URL
  allowEmailShares: boolean; // 是否允许邮件分享
  defaultAllowDownload: boolean;
  defaultAllowComment: boolean;
  defaultAllowEdit: boolean;
  watermarkEnabled: boolean; // 默认是否加水印
  trackAccess: boolean; // 是否跟踪访问
  notifyOnShare: boolean; // 分享时通知所有者
}

/**
 * 默认分享设置
 */
export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  enabled: true,
  defaultPermissions: ['view', 'download'],
  defaultExpiryDays: 30,
  requirePassword: false,
  maxExpiryDays: 365,
  allowPublicShares: true,
  allowCustomUrls: false,
  allowEmailShares: true,
  defaultAllowDownload: true,
  defaultAllowComment: false,
  defaultAllowEdit: false,
  watermarkEnabled: false,
  trackAccess: true,
  notifyOnShare: false,
};

// ==================== 分享创建参数 ====================

/**
 * 创建分享参数
 */
export interface CreateShareParams {
  targetId: string;
  targetType: ShareTargetType;
  shareMethod: ShareMethod;
  permissions?: SharePermission[];
  password?: string;
  expiresAt?: Date;
  maxAccessCount?: number;
  title?: string;
  description?: string;
  allowComment?: boolean;
  allowDownload?: boolean;
  allowEdit?: boolean;
  notifyOnAccess?: boolean;
  notifyOnDownload?: boolean;
  customUrl?: string;
  watermark?: boolean;
  previewMode?: 'full' | 'limited' | 'watermark';
}

/**
 * 更新分享参数
 */
export interface UpdateShareParams {
  permissions?: SharePermission[];
  password?: string;
  expiresAt?: Date;
  maxAccessCount?: number;
  title?: string;
  description?: string;
  allowComment?: boolean;
  allowDownload?: boolean;
  allowEdit?: boolean;
  notifyOnAccess?: boolean;
  notifyOnDownload?: boolean;
  status?: ShareStatus;
  watermark?: boolean;
  previewMode?: 'full' | 'limited' | 'watermark';
}

// ==================== 分享查询参数 ====================

/**
 * 分享查询参数
 */
export interface ShareQueryParams {
  targetId?: string;
  targetType?: ShareTargetType;
  status?: ShareStatus | ShareStatus[];
  shareMethod?: ShareMethod | ShareMethod[];
  createdBy?: string;
  search?: string;
  sortBy?: 'createdAt' | 'accessCount' | 'downloadCount' | 'expiresAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * 分享分页结果
 */
export interface SharePaginationResult {
  shares: Share[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// ==================== 分享访问 ====================

/**
 * 分享访问验证结果
 */
export interface ShareAccessResult {
  valid: boolean;
  share?: Share;
  error?: string;
  requiresPassword?: boolean;
  requiresLogin?: boolean;
}

/**
 * 分享访问参数
 */
export interface ShareAccessParams {
  token: string;
  password?: string;
  visitorId?: string;
}

// ==================== 分享模板 ====================

/**
 * 分享模板
 */
export interface ShareTemplate {
  id: string;
  name: string;
  description: string;
  permissions: SharePermission[];
  expiresAt?: Date;
  password?: boolean;
  allowComment: boolean;
  allowDownload: boolean;
  allowEdit: boolean;
  watermark: boolean;
  previewMode: 'full' | 'limited' | 'watermark';
  icon?: string;
  color?: string;
}

/**
 * 内置分享模板
 */
export const SHARE_TEMPLATES: ShareTemplate[] = [
  {
    id: 'public_view',
    name: '公开查看',
    description: '任何人都可以查看和下载',
    permissions: ['view', 'download'],
    allowComment: false,
    allowDownload: true,
    allowEdit: false,
    watermark: false,
    previewMode: 'full',
    icon: 'globe',
    color: 'blue',
  },
  {
    id: 'password_protected',
    name: '密码保护',
    description: '需要密码才能访问',
    permissions: ['view', 'download'],
    password: true,
    allowComment: false,
    allowDownload: true,
    allowEdit: false,
    watermark: false,
    previewMode: 'full',
    icon: 'lock',
    color: 'yellow',
  },
  {
    id: 'view_only',
    name: '仅查看',
    description: '只能在线查看，不能下载',
    permissions: ['view'],
    allowComment: false,
    allowDownload: false,
    allowEdit: false,
    watermark: true,
    previewMode: 'watermark',
    icon: 'eye',
    color: 'green',
  },
  {
    id: 'collaboration',
    name: '协作编辑',
    description: '可以查看、评论和编辑',
    permissions: ['view', 'download', 'edit', 'comment'],
    allowComment: true,
    allowDownload: true,
    allowEdit: true,
    watermark: false,
    previewMode: 'full',
    icon: 'users',
    color: 'purple',
  },
  {
    id: 'expiring_link',
    name: '临时链接',
    description: '24小时后自动过期',
    permissions: ['view', 'download'],
    allowComment: false,
    allowDownload: true,
    allowEdit: false,
    watermark: false,
    previewMode: 'full',
    icon: 'clock',
    color: 'orange',
  },
];

// ==================== 权限说明 ====================

/**
 * 权限说明
 */
export const PERMISSION_DESCRIPTIONS: Record<SharePermission, string> = {
  view: '查看',
  download: '下载',
  edit: '编辑',
  comment: '评论',
  full: '完全控制',
};

/**
 * 分享方式说明
 */
export const SHARE_METHOD_DESCRIPTIONS: Record<ShareMethod, string> = {
  link: '链接分享',
  email: '邮件分享',
  password: '密码分享',
  invite: '邀请分享',
  public: '公开分享',
};

/**
 * 分享状态说明
 */
export const SHARE_STATUS_DESCRIPTIONS: Record<ShareStatus, string> = {
  active: '有效',
  expired: '已过期',
  revoked: '已撤销',
  disabled: '已禁用',
};

// ==================== 工具函数类型 ====================

/**
 * 生成分享令牌
 */
export function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * 检查分享是否过期
 */
export function isShareExpired(share: Share): boolean {
  if (share.status !== 'active') return true;
  if (share.expiresAt && new Date() > share.expiresAt) return true;
  if (share.maxAccessCount && share.accessCount >= share.maxAccessCount) return true;
  return false;
}

/**
 * 检查分享是否有权限
 */
export function hasSharePermission(share: Share, permission: SharePermission): boolean {
  if (share.permissions.includes('full')) return true;
  return share.permissions.includes(permission);
}

/**
 * 格式化分享链接
 */
export function formatShareUrl(baseUrl: string, token: string, customUrl?: string): string {
  if (customUrl) {
    return `${baseUrl}/s/${customUrl}`;
  }
  return `${baseUrl}/s/${token}`;
}

/**
 * 计算剩余天数
 */
export function getRemainingDays(share: Share): number | null {
  if (!share.expiresAt) return null;
  const now = new Date();
  const diff = share.expiresAt.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * 计算剩余访问次数
 */
export function getRemainingAccessCount(share: Share): number | null {
  if (!share.maxAccessCount) return null;
  return Math.max(0, share.maxAccessCount - share.accessCount);
}
