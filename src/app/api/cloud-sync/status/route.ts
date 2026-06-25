import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getSyncStatus, getRecentSyncLogs } from "@/lib/cloud-sync/sync-engine";

/**
 * GET /api/cloud-sync/status
 * 获取同步状态
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // 获取用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
    });

    if (!tenantUser) {
      return NextResponse.json({ error: "租户不存在" }, { status: 404 });
    }

    // 获取同步状态
    const status = await getSyncStatus(tenantUser.tenantId);

    // 获取最近的同步日志
    const recentLogs = await getRecentSyncLogs(tenantUser.tenantId, 5);

    return NextResponse.json({
      success: true,
      data: {
        status,
        recentLogs,
      },
    });
  } catch (error) {
    console.error("获取同步状态失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取同步状态失败" },
      { status: 500 }
    );
  }
}
