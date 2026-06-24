import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { triggerSync } from "@/lib/cloud-sync/sync-engine";

/**
 * POST /api/cloud-sync/sync
 * 触发增量同步
 */
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "请提供加密密码" }, { status: 400 });
    }

    // 获取用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
    });

    if (!tenantUser) {
      return NextResponse.json({ error: "租户不存在" }, { status: 404 });
    }

    // 触发同步
    const result = await triggerSync(tenantUser.tenantId, userId, password);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("触发同步失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 500 }
    );
  }
}
