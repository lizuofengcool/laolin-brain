import { NextRequest, NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/admin/admin-service";

// ─── GET /api/admin/dashboard — 获取仪表盘统计 ────────────────
export async function GET(request: NextRequest) {
  try {
    // TODO: 添加管理员权限验证
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("获取仪表盘统计失败:", error);
    return NextResponse.json(
      { error: "获取仪表盘统计失败" },
      { status: 500 }
    );
  }
}
