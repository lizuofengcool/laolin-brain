/**
 * 租户上下文
 * 
 * 从请求中获取userId，自动查询tenantId
 * 提供统一的getTenantDb方法
 */
import { NextRequest, NextResponse } from 'next/server';
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
 * 从请求中获取租户ID，失败时直接返回 401 NextResponse（而非抛错）。
 *
 * `getTenantIdFromRequest` 在未授权或用户无租户时 throw，导致调用方形如
 * `const tenantId = await getTenantIdFromRequest(request); if (!tenantId) return 401`
 * 的写法成为死代码——未授权请求实际落入外层 catch 返回 500。本助手将该失败
 * 语义化为 401 响应，调用方用 instanceof 守卫即可，与 authenticateRequest /
 * requirePlatformAdmin 同范式：
 *
 *   const tenantId = await getTenantIdOr401(request);
 *   if (tenantId instanceof NextResponse) return tenantId;
 *
 * 注：本函数为身份/租户解析层，任何失败（含底层 DB 故障）一律按 fail-closed
 * 返回 401——无法确认身份即视为未授权。
 */
export async function getTenantIdOr401(
  request: NextRequest
): Promise<string | NextResponse> {
  try {
    return await getTenantIdFromRequest(request);
  } catch {
    return NextResponse.json(
      { error: '未授权访问' },
      { status: 401 }
    );
  }
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
