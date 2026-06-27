import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export type AuthResult = {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
};

/**
 * API authentication middleware.
 * Extracts token from the Authorization header,
 * verifies it, queries tenant info, and returns user info or a 401 response.
 *
 * Usage:
 *   const auth = await authenticateRequest(request);
 *   if (auth instanceof NextResponse) return auth;
 *   const { userId, email, tenantId, role } = auth;
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthResult | NextResponse> {
  let token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json(
      { error: "未提供身份认证令牌" },
      { status: 401 }
    );
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json(
      { error: "令牌无效或已过期" },
      { status: 401 }
    );
  }

  const tenantUser = await db.tenantUser.findFirst({
    where: { userId: decoded.id },
    orderBy: { joinedAt: 'asc' },
  });

  const tenantId = tenantUser?.tenantId ?? 'default';
  const role = tenantUser?.role ?? 'owner';

  if (!tenantUser) {
    const existingTenant = await db.tenant.findFirst();
    let activeTenantId: string;
    if (!existingTenant) {
      const newTenant = await db.tenant.create({
        data: { name: 'Default Tenant', plan: 'free' },
      });
      activeTenantId = newTenant.id;
    } else {
      activeTenantId = existingTenant.id;
    }
    await db.tenantUser.create({
      data: { userId: decoded.id, tenantId: activeTenantId, role: 'owner' },
    });
    return { userId: decoded.id, email: decoded.email, tenantId: activeTenantId, role: 'owner' };
  }

  return { userId: decoded.id, email: decoded.email, tenantId, role };
}

/**
 * Platform-admin authorization middleware.
 *
 * Authenticates the request via {@link authenticateRequest}, then checks the
 * caller's email against the `ADMIN_EMAILS` environment variable (comma-
 * separated allowlist, case-insensitive). Used to gate cross-tenant /
 * platform-level endpoints (e.g. /api/admin/*, /api/auth/diagnostics) that
 * must never be reachable by ordinary tenants — without it, any authenticated
 * (or in some cases unauthenticated) user could suspend/migrate arbitrary
 * tenants or read platform-wide stats.
 *
 * Secure default: when `ADMIN_EMAILS` is unset or empty, every caller is
 * denied (403). Operators must explicitly configure the allowlist to enable
 * the admin UI. This is intentionally fail-closed.
 *
 * Usage:
 *   const auth = await requirePlatformAdmin(request);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is AuthResult; proceed with platform-level operation
 */
export async function requirePlatformAdmin(
  request: NextRequest
): Promise<AuthResult | NextResponse> {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    return NextResponse.json(
      { error: '未配置平台管理员 (ADMIN_EMAILS)，管理端点已禁用' },
      { status: 403 }
    );
  }

  if (!allowlist.includes(auth.email.toLowerCase())) {
    return NextResponse.json(
      { error: '无平台管理员权限' },
      { status: 403 }
    );
  }

  return auth;
}
