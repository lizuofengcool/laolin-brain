import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/admin/admin-service";
import { requirePlatformAdmin } from "@/lib/api-auth";

// ─── GET /api/admin/orders/[id] — 获取订单详情 ────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const order = await getOrderDetail(id);
    
    if (!order) {
      return NextResponse.json(
        { error: "订单不存在" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(order);
  } catch (error) {
    console.error("获取订单详情失败:", error);
    return NextResponse.json(
      { error: "获取订单详情失败" },
      { status: 500 }
    );
  }
}
