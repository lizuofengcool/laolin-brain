import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

/**
 * API authentication middleware.
 * Extracts token from Authorization header or query param,
 * verifies it, and returns user info or a 401 response.
 *
 * Usage:
 *   const auth = authenticateRequest(request);
 *   if (auth instanceof NextResponse) return auth;
 *   const { userId, email } = auth;
 */
export function authenticateRequest(
  request: NextRequest
): { userId: string; email: string } | NextResponse {
  // Try Authorization header first
  let token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  // Fallback to query param
  // SECURITY NOTE: Tokens in URLs can appear in browser history, server logs, and referrer headers.
  // This fallback exists for share download functionality but should be removed once
  // share downloads are migrated to use Authorization headers.
  if (!token) {
    const { searchParams } = new URL(request.url);
    token = searchParams.get("token") || undefined;
  }

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

  return { userId: decoded.id, email: decoded.email };
}
