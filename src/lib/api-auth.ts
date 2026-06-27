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
 * Extracts token from Authorization header or query param,
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
