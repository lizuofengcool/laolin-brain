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
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") || undefined;
    const payMethod = searchParams.get("payMethod") || undefined;
    const search = searchParams.get("search") || undefined;

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // getOrderList → db.order.findMany → Prisma skip/take 的未定义行为。
    // 与 admin/tenants/billing-orders 等的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: "page 必须 >= 1" }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: "pageSize 必须为正整数" }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

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
