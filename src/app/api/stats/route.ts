import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  getOverviewStats,
  getStatsByType,
  getTrendStats,
  getActivityStats,
  getAiStats,
} from "@/lib/stats/stats-service";

/**
 * 统计报表API
 * GET /api/stats - 获取统计数据
 * type: overview / by-type / trend / activity / ai
 */

// ─── GET /api/stats — 获取统计数据 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // tenantId / role 直接取自 authenticateRequest 的权威值（已按 joinedAt asc
    // 确定性选取租户），不再重复 tenantUser.findFirst 影子覆盖——后者无 orderBy，
    // 对多租户用户可能取到与 auth 不一致的租户，导致越权读写。
    // 检查权限：只有owner和admin可以查看统计
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限查看统计数据' },
        { status: 403 }
      );
    }

    let result: any = {};

    switch (type) {
      case 'overview':
        result = await getOverviewStats(tenantId);
        break;
      case 'by-type':
        result = await getStatsByType(tenantId);
        break;
      case 'trend':
        result = await getTrendStats(tenantId, dateFrom, dateTo);
        break;
      case 'activity':
        result = await getActivityStats(tenantId, dateFrom, dateTo);
        break;
      case 'ai':
        result = await getAiStats(tenantId);
        break;
      default:
        result = await getOverviewStats(tenantId);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}
