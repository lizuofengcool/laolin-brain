import { db } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * 租户权限检查工具
 * 统一的租户和权限检查逻辑
 */

export type UserRole = "owner" | "admin" | "member" | "viewer";

export interface TenantUserInfo {
  tenantId: string;
  role: UserRole;
  userId: string;
}

// 检查用户是否属于某个租户，并返回租户信息
export async function getTenantUserInfo(
  userId: string
): Promise<TenantUserInfo | null> {
  const tenantUser = await db.tenantUser.findFirst({
    where: { userId },
    select: { tenantId: true, role: true, userId: true },
  });

  if (!tenantUser) return null;

  return {
    tenantId: tenantUser.tenantId,
    role: tenantUser.role as UserRole,
    userId: tenantUser.userId,
  };
}

// 检查用户是否有指定角色权限
export function hasRole(
  userRole: UserRole,
  requiredRole: UserRole
): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    owner: 4,
    admin: 3,
    member: 2,
    viewer: 1,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

// 检查是否是管理员或所有者
export function isAdminOrOwner(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

// 检查是否是所有者
export function isOwner(role: UserRole): boolean {
  return role === "owner";
}

// 要求管理员权限的中间件
export async function requireAdmin(
  userId: string
): Promise<{ tenantId: string; role: UserRole } | NextResponse> {
  const tenantInfo = await getTenantUserInfo(userId);

  if (!tenantInfo) {
    return NextResponse.json({ error: "租户不存在" }, { status: 404 });
  }

  if (!isAdminOrOwner(tenantInfo.role)) {
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  }

  return { tenantId: tenantInfo.tenantId, role: tenantInfo.role };
}

// 要求所有者权限的中间件
export async function requireOwner(
  userId: string
): Promise<{ tenantId: string; role: UserRole } | NextResponse> {
  const tenantInfo = await getTenantUserInfo(userId);

  if (!tenantInfo) {
    return NextResponse.json({ error: "租户不存在" }, { status: 404 });
  }

  if (!isOwner(tenantInfo.role)) {
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  }

  return { tenantId: tenantInfo.tenantId, role: tenantInfo.role };
}

// 检查结果是否是NextResponse（即检查失败）
export function isNextResponse(result: any): result is NextResponse {
  return result instanceof NextResponse;
}
