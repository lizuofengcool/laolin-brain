/**
 * 租户上下文
 * 
 * 从请求中获取userId，自动查询tenantId
 * 提供统一的getTenantDb方法
 */
import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db } from './index';
import { createTenantDb, TenantDb } from './tenant-db';

/**
 * 从请求中获取租户ID
 * @param request Next.js请求对象
 * @returns 租户ID
 */
export async function getTenantIdFromRequest(request: NextRequest): Promise<string> {
  const authResult = await authenticateRequest(request);
  
  if (authResult instanceof Response) {
    throw new Error('未授权');
  }
  
  const { userId } = authResult;
  
  // 查询用户的租户
  const tenantUser = await db.tenantUser.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
  });
  
  if (!tenantUser) {
    throw new Error('用户不属于任何租户');
  }
  
  return tenantUser.tenantId;
}

/**
 * 从请求中获取租户数据库访问实例
 * @param request Next.js请求对象
 * @returns TenantDb实例
 */
export async function getTenantDbFromRequest(request: NextRequest): Promise<TenantDb> {
  const tenantId = await getTenantIdFromRequest(request);
  return createTenantDb(tenantId);
}

/**
 * 从userId获取租户ID
 * @param userId 用户ID
 * @returns 租户ID
 */
export async function getTenantIdFromUserId(userId: string): Promise<string> {
  const tenantUser = await db.tenantUser.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
  });
  
  if (!tenantUser) {
    throw new Error('用户不属于任何租户');
  }
  
  return tenantUser.tenantId;
}

/**
 * 从userId获取租户数据库访问实例
 * @param userId 用户ID
 * @returns TenantDb实例
 */
export async function getTenantDbFromUserId(userId: string): Promise<TenantDb> {
  const tenantId = await getTenantIdFromUserId(userId);
  return createTenantDb(tenantId);
}
