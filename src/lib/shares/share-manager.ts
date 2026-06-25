/**
 * 分享管理器
 * 负责分享的创建、管理、访问验证、统计等功能
 */

import {
  Share,
  ShareStatus,
  ShareTargetType,
  ShareMethod,
  SharePermission,
  ShareAccessLog,
  ShareStats,
  ShareSettings,
  DEFAULT_SHARE_SETTINGS,
  CreateShareParams,
  UpdateShareParams,
  ShareQueryParams,
  SharePaginationResult,
  ShareAccessResult,
  ShareAccessParams,
  ShareTemplate,
  SHARE_TEMPLATES,
  generateShareToken,
  isShareExpired,
  hasSharePermission,
} from './types';

/**
 * 分享管理器
 */
export class ShareManager {
  private shares: Map<string, Share> = new Map();
  private tokenToShare: Map<string, string> = new Map(); // token -> shareId
  private customUrlToShare: Map<string, string> = new Map(); // customUrl -> shareId
  private accessLogs: Map<string, ShareAccessLog[]> = new Map(); // shareId -> logs
  private settings: Map<string, ShareSettings> = new Map(); // tenantId -> settings
  private userShares: Map<string, string[]> = new Map(); // userId -> shareId列表

  constructor() {
    // 初始化
  }

  // ==================== 分享创建 ====================

  /**
   * 创建分享
   */
  createShare(
    tenantId: string,
    userId: string,
    userName: string,
    params: CreateShareParams
  ): Share | null {
    // 获取分享设置
    const settings = this.getShareSettings(tenantId);

    // 检查分享是否启用
    if (!settings.enabled) return null;

    // 检查是否允许公开分享
    if (params.shareMethod === 'public' && !settings.allowPublicShares) {
      return null;
    }

    // 检查是否允许自定义URL
    if (params.customUrl && !settings.allowCustomUrls) {
      return null;
    }

    // 检查是否强制密码
    if (settings.requirePassword && !params.password) {
      return null;
    }

    // 生成令牌
    const token = generateShareToken();
    const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 计算过期时间
    let expiresAt = params.expiresAt;
    if (!expiresAt && settings.defaultExpiryDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + settings.defaultExpiryDays);
    }

    // 检查最大过期天数
    if (expiresAt && settings.maxExpiryDays) {
      const maxExpiryDate = new Date();
      maxExpiryDate.setDate(maxExpiryDate.getDate() + settings.maxExpiryDays);
      if (expiresAt > maxExpiryDate) {
        expiresAt = maxExpiryDate;
      }
    }

    const share: Share = {
      id: shareId,
      tenantId,
      targetId: params.targetId,
      targetType: params.targetType,
      shareMethod: params.shareMethod,
      token,
      createdBy: userId,
      createdByName: userName,
      permissions: params.permissions || settings.defaultPermissions,
      password: params.password, // 实际应该哈希存储
      expiresAt,
      maxAccessCount: params.maxAccessCount,
      accessCount: 0,
      downloadCount: 0,
      status: 'active',
      allowComment: params.allowComment ?? settings.defaultAllowComment,
      allowDownload: params.allowDownload ?? settings.defaultAllowDownload,
      allowEdit: params.allowEdit ?? settings.defaultAllowEdit,
      notifyOnAccess: params.notifyOnAccess ?? false,
      notifyOnDownload: params.notifyOnDownload ?? false,
      customUrl: params.customUrl,
      title: params.title,
      description: params.description,
      watermark: params.watermark ?? settings.watermarkEnabled,
      previewMode: params.previewMode || 'full',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.shares.set(shareId, share);
    this.tokenToShare.set(token, shareId);

    // 自定义URL映射
    if (params.customUrl) {
      this.customUrlToShare.set(params.customUrl, shareId);
    }

    // 添加到用户分享列表
    const userShareList = this.userShares.get(userId) || [];
    userShareList.unshift(shareId);
    this.userShares.set(userId, userShareList);

    return share;
  }

  /**
   * 从模板创建分享
   */
  createShareFromTemplate(
    tenantId: string,
    userId: string,
    userName: string,
    targetId: string,
    targetType: ShareTargetType,
    templateId: string
  ): Share | null {
    const template = SHARE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return null;

    const params: CreateShareParams = {
      targetId,
      targetType,
      shareMethod: template.password ? 'password' : 'link',
      permissions: template.permissions,
      allowComment: template.allowComment,
      allowDownload: template.allowDownload,
      allowEdit: template.allowEdit,
      watermark: template.watermark,
      previewMode: template.previewMode,
    };

    // 临时链接模板设置24小时过期
    if (templateId === 'expiring_link') {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      params.expiresAt = expiresAt;
    }

    return this.createShare(tenantId, userId, userName, params);
  }

  // ==================== 分享查询 ====================

  /**
   * 获取分享
   */
  getShare(shareId: string, tenantId: string): Share | null {
    const share = this.shares.get(shareId);
    if (!share || share.tenantId !== tenantId) return null;
    return share;
  }

  /**
   * 通过令牌获取分享
   */
  getShareByToken(token: string): Share | null {
    const shareId = this.tokenToShare.get(token);
    if (!shareId) return null;
    return this.shares.get(shareId) || null;
  }

  /**
   * 通过自定义URL获取分享
   */
  getShareByCustomUrl(customUrl: string): Share | null {
    const shareId = this.customUrlToShare.get(customUrl);
    if (!shareId) return null;
    return this.shares.get(shareId) || null;
  }

  /**
   * 查询分享列表
   */
  queryShares(params: ShareQueryParams & { tenantId: string }): SharePaginationResult {
    const {
      tenantId,
      targetId,
      targetType,
      status,
      shareMethod,
      createdBy,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
      dateFrom,
      dateTo,
    } = params;

    let shares = Array.from(this.shares.values()).filter(s => s.tenantId === tenantId);

    // 应用筛选
    if (targetId) {
      shares = shares.filter(s => s.targetId === targetId);
    }

    if (targetType) {
      shares = shares.filter(s => s.targetType === targetType);
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      shares = shares.filter(s => statuses.includes(s.status));
    }

    if (shareMethod) {
      const methods = Array.isArray(shareMethod) ? shareMethod : [shareMethod];
      shares = shares.filter(s => methods.includes(s.shareMethod));
    }

    if (createdBy) {
      shares = shares.filter(s => s.createdBy === createdBy);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      shares = shares.filter(s =>
        s.title?.toLowerCase().includes(searchLower) ||
        s.description?.toLowerCase().includes(searchLower) ||
        s.targetId.toLowerCase().includes(searchLower)
      );
    }

    if (dateFrom) {
      shares = shares.filter(s => s.createdAt >= dateFrom);
    }

    if (dateTo) {
      shares = shares.filter(s => s.createdAt <= dateTo);
    }

    // 排序
    shares.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'createdAt':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'accessCount':
          comparison = a.accessCount - b.accessCount;
          break;
        case 'downloadCount':
          comparison = a.downloadCount - b.downloadCount;
          break;
        case 'expiresAt':
          comparison = (a.expiresAt?.getTime() || 0) - (b.expiresAt?.getTime() || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = shares.length;
    const start = (page - 1) * pageSize;
    const paginatedShares = shares.slice(start, start + pageSize);

    return {
      shares: paginatedShares,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: start + pageSize < total,
    };
  }

  // ==================== 分享更新 ====================

  /**
   * 更新分享
   */
  updateShare(
    shareId: string,
    tenantId: string,
    userId: string,
    updates: UpdateShareParams
  ): Share | null {
    const share = this.shares.get(shareId);
    if (!share || share.tenantId !== tenantId) return null;

    // 检查权限（只能更新自己的分享，或者管理员）
    if (share.createdBy !== userId) {
      // 这里可以添加管理员检查
      return null;
    }

    // 更新字段
    if (updates.permissions !== undefined) {
      share.permissions = updates.permissions;
    }
    if (updates.password !== undefined) {
      share.password = updates.password;
    }
    if (updates.expiresAt !== undefined) {
      share.expiresAt = updates.expiresAt;
    }
    if (updates.maxAccessCount !== undefined) {
      share.maxAccessCount = updates.maxAccessCount;
    }
    if (updates.title !== undefined) {
      share.title = updates.title;
    }
    if (updates.description !== undefined) {
      share.description = updates.description;
    }
    if (updates.allowComment !== undefined) {
      share.allowComment = updates.allowComment;
    }
    if (updates.allowDownload !== undefined) {
      share.allowDownload = updates.allowDownload;
    }
    if (updates.allowEdit !== undefined) {
      share.allowEdit = updates.allowEdit;
    }
    if (updates.notifyOnAccess !== undefined) {
      share.notifyOnAccess = updates.notifyOnAccess;
    }
    if (updates.notifyOnDownload !== undefined) {
      share.notifyOnDownload = updates.notifyOnDownload;
    }
    if (updates.status !== undefined) {
      share.status = updates.status;
    }
    if (updates.watermark !== undefined) {
      share.watermark = updates.watermark;
    }
    if (updates.previewMode !== undefined) {
      share.previewMode = updates.previewMode;
    }

    share.updatedAt = new Date();

    return share;
  }

  /**
   * 撤销分享
   */
  revokeShare(shareId: string, tenantId: string, userId: string): boolean {
    const result = this.updateShare(shareId, tenantId, userId, { status: 'revoked' });
    return result !== null;
  }

  /**
   * 恢复分享
   */
  restoreShare(shareId: string, tenantId: string, userId: string): boolean {
    const result = this.updateShare(shareId, tenantId, userId, { status: 'active' });
    return result !== null;
  }

  // ==================== 分享访问 ====================

  /**
   * 验证分享访问
   */
  verifyShareAccess(params: ShareAccessParams): ShareAccessResult {
    const { token, password } = params;

    const share = this.getShareByToken(token);
    if (!share) {
      return { valid: false, error: '分享不存在' };
    }

    // 检查状态
    if (share.status !== 'active') {
      return { valid: false, error: '分享已失效' };
    }

    // 检查是否过期
    if (isShareExpired(share)) {
      // 自动更新状态为过期
      share.status = 'expired';
      return { valid: false, error: '分享已过期' };
    }

    // 检查是否需要密码
    if (share.password) {
      if (!password) {
        return { valid: false, requiresPassword: true, error: '需要密码' };
      }
      // 实际应该比较哈希
      if (password !== share.password) {
        return { valid: false, error: '密码错误' };
      }
    }

    return { valid: true, share };
  }

  /**
   * 记录访问
   */
  recordAccess(
    shareId: string,
    action: 'view' | 'download' | 'comment' | 'edit',
    options?: {
      userId?: string;
      visitorId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): void {
    const share = this.shares.get(shareId);
    if (!share) return;

    // 更新访问计数
    share.accessCount++;
    share.lastAccessedAt = new Date();

    if (action === 'download') {
      share.downloadCount++;
    }

    // 检查是否达到最大访问次数
    if (share.maxAccessCount && share.accessCount >= share.maxAccessCount) {
      share.status = 'expired';
    }

    // 记录访问日志
    const log: ShareAccessLog = {
      id: `access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      shareId,
      tenantId: share.tenantId,
      accessedBy: options?.userId,
      visitorId: options?.visitorId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      action,
      accessedAt: new Date(),
    };

    const logs = this.accessLogs.get(shareId) || [];
    logs.unshift(log);
    // 只保留最近1000条
    if (logs.length > 1000) {
      logs.length = 1000;
    }
    this.accessLogs.set(shareId, logs);

    share.updatedAt = new Date();
  }

  // ==================== 分享统计 ====================

  /**
   * 获取分享统计
   */
  getStats(tenantId: string): ShareStats {
    const shares = Array.from(this.shares.values()).filter(s => s.tenantId === tenantId);

    let totalAccesses = 0;
    let totalDownloads = 0;
    const byType: Record<string, number> = {};
    const byMethod: Record<string, number> = {};

    for (const share of shares) {
      totalAccesses += share.accessCount;
      totalDownloads += share.downloadCount;
      byType[share.targetType] = (byType[share.targetType] || 0) + 1;
      byMethod[share.shareMethod] = (byMethod[share.shareMethod] || 0) + 1;
    }

    // 热门分享（按访问数排序，取前5）
    const topShares = [...shares]
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5);

    // 最近访问（取最近10条）
    const recentAccesses: ShareAccessLog[] = [];
    for (const share of shares) {
      const logs = this.accessLogs.get(share.id) || [];
      recentAccesses.push(...logs.slice(0, 2));
    }
    recentAccesses.sort((a, b) => b.accessedAt.getTime() - a.accessedAt.getTime());
    recentAccesses.length = Math.min(recentAccesses.length, 10);

    return {
      totalShares: shares.length,
      activeShares: shares.filter(s => s.status === 'active').length,
      expiredShares: shares.filter(s => s.status === 'expired').length,
      revokedShares: shares.filter(s => s.status === 'revoked').length,
      totalAccesses,
      totalDownloads,
      byType: byType as Record<ShareTargetType, number>,
      byMethod: byMethod as Record<ShareMethod, number>,
      topShares,
      recentAccesses,
    };
  }

  /**
   * 获取单个分享的访问日志
   */
  getAccessLogs(
    shareId: string,
    tenantId: string,
    options?: { page?: number; pageSize?: number; action?: string }
  ): { logs: ShareAccessLog[]; total: number; page: number; pageSize: number } {
    const share = this.shares.get(shareId);
    if (!share || share.tenantId !== tenantId) {
      return { logs: [], total: 0, page: 1, pageSize: 20 };
    }

    let logs = this.accessLogs.get(shareId) || [];

    if (options?.action) {
      logs = logs.filter(l => l.action === options.action);
    }

    const total = logs.length;
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paginatedLogs = logs.slice(start, start + pageSize);

    return {
      logs: paginatedLogs,
      total,
      page,
      pageSize,
    };
  }

  // ==================== 分享设置 ====================

  /**
   * 获取分享设置
   */
  getShareSettings(tenantId: string): ShareSettings {
    return this.settings.get(tenantId) || { ...DEFAULT_SHARE_SETTINGS };
  }

  /**
   * 更新分享设置
   */
  updateShareSettings(tenantId: string, updates: Partial<ShareSettings>): ShareSettings {
    const current = this.getShareSettings(tenantId);
    const updated = { ...current, ...updates };
    this.settings.set(tenantId, updated);
    return updated;
  }

  // ==================== 分享模板 ====================

  /**
   * 获取所有模板
   */
  getTemplates(): ShareTemplate[] {
    return SHARE_TEMPLATES;
  }

  /**
   * 获取模板
   */
  getTemplate(templateId: string): ShareTemplate | null {
    return SHARE_TEMPLATES.find(t => t.id === templateId) || null;
  }

  // ==================== 批量操作 ====================

  /**
   * 批量撤销分享
   */
  batchRevokeShares(shareIds: string[], tenantId: string, userId: string): {
    success: number;
    failed: number;
    failedIds: string[];
  } {
    let success = 0;
    const failedIds: string[] = [];

    for (const shareId of shareIds) {
      if (this.revokeShare(shareId, tenantId, userId)) {
        success++;
      } else {
        failedIds.push(shareId);
      }
    }

    return {
      success,
      failed: shareIds.length - success,
      failedIds,
    };
  }

  /**
   * 批量删除分享
   */
  batchDeleteShares(shareIds: string[], tenantId: string, userId: string): {
    success: number;
    failed: number;
    failedIds: string[];
  } {
    let success = 0;
    const failedIds: string[] = [];

    for (const shareId of shareIds) {
      const share = this.shares.get(shareId);
      if (!share || share.tenantId !== tenantId || share.createdBy !== userId) {
        failedIds.push(shareId);
        continue;
      }

      // 移除令牌映射
      this.tokenToShare.delete(share.token);

      // 移除自定义URL映射
      if (share.customUrl) {
        this.customUrlToShare.delete(share.customUrl);
      }

      // 移除访问日志
      this.accessLogs.delete(shareId);

      // 从用户分享列表移除
      const userShareList = this.userShares.get(userId) || [];
      const index = userShareList.indexOf(shareId);
      if (index !== -1) {
        userShareList.splice(index, 1);
        this.userShares.set(userId, userShareList);
      }

      // 删除分享
      this.shares.delete(shareId);
      success++;
    }

    return {
      success,
      failed: shareIds.length - success,
      failedIds,
    };
  }

  // ==================== 工具方法 ====================

  /**
   * 检查用户是否可以编辑分享
   */
  canEditShare(shareId: string, userId: string, tenantId: string): boolean {
    const share = this.shares.get(shareId);
    if (!share || share.tenantId !== tenantId) return false;
    return share.createdBy === userId;
    // 这里可以添加管理员检查
  }

  /**
   * 检查自定义URL是否可用
   */
  isCustomUrlAvailable(customUrl: string): boolean {
    return !this.customUrlToShare.has(customUrl);
  }

  /**
   * 获取用户的分享列表
   */
  getUserShares(userId: string, tenantId: string): Share[] {
    const shareIds = this.userShares.get(userId) || [];
    return shareIds
      .map(id => this.shares.get(id))
      .filter((s): s is Share => s !== undefined && s.tenantId === tenantId);
  }

  /**
   * 清理过期分享
   */
  cleanExpiredShares(tenantId: string): number {
    let cleaned = 0;
    for (const share of this.shares.values()) {
      if (share.tenantId === tenantId && share.status === 'active' && isShareExpired(share)) {
        share.status = 'expired';
        share.updatedAt = new Date();
        cleaned++;
      }
    }
    return cleaned;
  }
}

// 导出单例
export const shareManager = new ShareManager();
