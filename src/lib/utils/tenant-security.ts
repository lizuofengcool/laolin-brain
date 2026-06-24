/**
 * 多租户数据隔离安全工具
 * 
 * 功能：
 * 1. 验证数据归属
 * 2. 横向越权检测
 * 3. 数据访问审计
 */

import { db } from '@/lib/db';

/**
 * 验证文件是否属于指定租户
 */
export async function verifyFileTenant(
  fileId: string,
  tenantId: string
): Promise<boolean> {
  try {
    const file = await db.file.findFirst({
      where: {
        id: fileId,
        tenantId: tenantId,
      },
      select: { id: true },
    });

    return file !== null;
  } catch (error) {
    console.error('验证文件租户归属失败:', error);
    return false;
  }
}

/**
 * 验证文件夹是否属于指定租户
 */
export async function verifyFolderTenant(
  folderId: string,
  tenantId: string
): Promise<boolean> {
  try {
    const folder = await db.folder.findFirst({
      where: {
        id: folderId,
        tenantId: tenantId,
      },
      select: { id: true },
    });

    return folder !== null;
  } catch (error) {
    console.error('验证文件夹租户归属失败:', error);
    return false;
  }
}

/**
 * 批量验证文件租户归属
 */
export async function verifyFilesTenant(
  fileIds: string[],
  tenantId: string
): Promise<{
  allValid: boolean;
  invalidIds: string[];
}> {
  try {
    const files = await db.file.findMany({
      where: {
        id: { in: fileIds },
        tenantId: tenantId,
      },
      select: { id: true },
    });

    const validIds = new Set(files.map(f => f.id));
    const invalidIds = fileIds.filter(id => !validIds.has(id));

    return {
      allValid: invalidIds.length === 0,
      invalidIds,
    };
  } catch (error) {
    console.error('批量验证文件租户归属失败:', error);
    return {
      allValid: false,
      invalidIds: fileIds,
    };
  }
}

/**
 * 检测横向越权尝试
 * 
 * 当用户尝试访问不属于自己租户的数据时记录
 */
export function detectHorizontalPrivilegeEscalation(
  userId: string,
  tenantId: string,
  resourceType: string,
  resourceId: string
): void {
  console.warn(
    `[安全警告] 横向越权尝试: 用户=${userId}, 租户=${tenantId}, ` +
    `资源类型=${resourceType}, 资源ID=${resourceId}`
  );
  // 这里可以添加告警逻辑，如发送邮件、写入安全日志等
}

/**
 * 安全访问检查
 * 
 * 统一的资源访问安全检查，确保数据隔离
 */
export async function safeAccessCheck<T>(
  tenantId: string,
  resourceType: 'file' | 'folder' | 'faceGroup' | 'subscription' | 'order',
  resourceId: string,
  action: string = 'access'
): Promise<boolean> {
  let isValid = false;

  switch (resourceType) {
    case 'file':
      isValid = await verifyFileTenant(resourceId, tenantId);
      break;
    case 'folder':
      isValid = await verifyFolderTenant(resourceId, tenantId);
      break;
    // 其他类型可以继续扩展
    default:
      isValid = false;
  }

  if (!isValid) {
    console.warn(
      `[安全] 拒绝访问: 租户=${tenantId}, 资源类型=${resourceType}, ` +
      `资源ID=${resourceId}, 操作=${action}`
    );
  }

  return isValid;
}

/**
 * 数据隔离审计日志
 */
export interface AuditLogEntry {
  timestamp: Date;
  tenantId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ip?: string;
  userAgent?: string;
  success: boolean;
}

/**
 * 记录审计日志
 */
export function logAuditEvent(entry: AuditLogEntry): void {
  const logMessage = JSON.stringify({
    timestamp: entry.timestamp.toISOString(),
    tenantId: entry.tenantId,
    userId: entry.userId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    ip: entry.ip,
    success: entry.success,
  });

  // 写入审计日志
  console.log(`[审计] ${logMessage}`);
}

/**
 * 检查租户状态
 */
export async function checkTenantStatus(tenantId: string): Promise<{
  active: boolean;
  status: string;
  plan: string;
  suspended: boolean;
}> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        status: true,
        plan: true,
      },
    });

    if (!tenant) {
      return {
        active: false,
        status: 'not_found',
        plan: 'unknown',
        suspended: true,
      };
    }

    return {
      active: tenant.status === 'active',
      status: tenant.status,
      plan: tenant.plan,
      suspended: tenant.status !== 'active',
    };
  } catch (error) {
    console.error('检查租户状态失败:', error);
    return {
      active: false,
      status: 'error',
      plan: 'unknown',
      suspended: true,
    };
  }
}

/**
 * 检查租户配额
 */
export async function checkTenantQuota(tenantId: string): Promise<{
  storage: {
    used: bigint;
    quota: bigint;
    remaining: bigint;
    percentage: number;
    exceeded: boolean;
  };
  ai: {
    used: number;
    quota: number;
    remaining: number;
    percentage: number;
    exceeded: boolean;
  };
}> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        storageUsed: true,
        storageQuota: true,
        aiUsed: true,
        aiQuota: true,
      },
    });

    if (!tenant) {
      throw new Error('租户不存在');
    }

    const storageRemaining = tenant.storageQuota - tenant.storageUsed;
    const storagePercentage = Number(
      (tenant.storageUsed * BigInt(100)) / tenant.storageQuota
    );

    const aiRemaining = tenant.aiQuota - tenant.aiUsed;
    const aiPercentage = (tenant.aiUsed / tenant.aiQuota) * 100;

    return {
      storage: {
        used: tenant.storageUsed,
        quota: tenant.storageQuota,
        remaining: storageRemaining,
        percentage: storagePercentage,
        exceeded: storageRemaining <= 0,
      },
      ai: {
        used: tenant.aiUsed,
        quota: tenant.aiQuota,
        remaining: aiRemaining,
        percentage: aiPercentage,
        exceeded: aiRemaining <= 0,
      },
    };
  } catch (error) {
    console.error('检查租户配额失败:', error);
    throw error;
  }
}

export default {
  verifyFileTenant,
  verifyFolderTenant,
  verifyFilesTenant,
  detectHorizontalPrivilegeEscalation,
  safeAccessCheck,
  logAuditEvent,
  checkTenantStatus,
  checkTenantQuota,
};
