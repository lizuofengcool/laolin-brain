import { NextRequest, NextResponse } from "next/server";
import { getOrderList } from "@/lib/admin/admin-service";
import { requirePlatformAdmin } from "@/lib/api-auth";

// ─── GET /api/admin/orders — 获取订单列表 ────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") || undefined;
    const payMethod = searchParams.get("payMethod") || undefined;
    const search = searchParams.get("search") || undefined;

    const result = await getOrderList(page, pageSize, { status, payMethod, search });
    return NextResponse.json(result);
  } catch (error) {
    console.error("获取订单列表失败:", error);
    return NextResponse.json(
      { error: "获取订单列表失败" },
      { status: 500 }
    );
  }
}
