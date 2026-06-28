import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getSyncQueue, cleanupCompletedQueue } from "@/lib/cloud-sync/sync-engine";

/**
 * GET /api/cloud-sync/queue
 * 获取同步队列
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // 获取队列
    const queue = await getSyncQueue(tenantId, status, limit);

    return NextResponse.json({
      success: true,
      data: queue,
    });
  } catch (error) {
    console.error("获取同步队列失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取同步队列失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cloud-sync/queue
 * 清理已完成的队列项
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // 清理已完成的队列项
    const cleaned = await cleanupCompletedQueue(tenantId, 7);

    return NextResponse.json({
      success: true,
      data: { cleaned },
    });
  } catch (error) {
    console.error("清理队列失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "清理队列失败" },
      { status: 500 }
    );
  }
}
