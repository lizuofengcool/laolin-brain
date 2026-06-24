import { db } from "@/lib/db";

/**
 * 活动日志记录工具
 * 统一记录用户操作日志
 */

export interface ActivityLogData {
  userId: string;
  tenantId: string;
  action: string; // create, update, delete, download, share, login, etc.
  resourceType: string; // file, folder, user, tenant, setting, etc.
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 记录活动日志
 * @param data 日志数据
 */
export async function logActivity(data: ActivityLogData): Promise<void> {
  try {
    // 异步记录，不阻塞主流程
    setImmediate(async () => {
      try {
        await db.activityLog.create({
          data: {
            userId: data.userId,
            tenantId: data.tenantId,
            action: data.action,
            resourceType: data.resourceType,
            resourceId: data.resourceId,
            details: data.details ? JSON.stringify(data.details) : null,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
          },
        });
      } catch (error) {
        console.error('Failed to log activity:', error);
      }
    });
  } catch (error) {
    console.error('Failed to queue activity log:', error);
  }
}

/**
 * 从请求中提取IP地址
 * @param request Next.js请求对象
 * @returns IP地址
 */
export function getIpAddress(request: Request): string {
  // 尝试从各种header中获取IP
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }

  return 'unknown';
}

/**
 * 从请求中提取User-Agent
 * @param request Next.js请求对象
 * @returns User-Agent
 */
export function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'unknown';
}

/**
 * 常用操作类型
 */
export const ActionType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  SHARE: 'share',
  LOGIN: 'login',
  LOGOUT: 'logout',
  VIEW: 'view',
  SEARCH: 'search',
  EXPORT: 'export',
  IMPORT: 'import',
} as const;

/**
 * 常用资源类型
 */
export const ResourceType = {
  FILE: 'file',
  FOLDER: 'folder',
  USER: 'user',
  TENANT: 'tenant',
  SETTING: 'setting',
  SHARE: 'share',
  TAG: 'tag',
} as const;
