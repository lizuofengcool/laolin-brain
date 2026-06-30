import { NextRequest, NextResponse } from "next/server";
import { getTenantList, updateTenantStatus, updateTenantPlan } from "@/lib/admin/admin-service";
import { requirePlatformAdmin } from "@/lib/api-auth";

// ─── GET /api/admin/tenants — 获取租户列表 ────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") || undefined;
    const plan = searchParams.get("plan") || undefined;
    const search = searchParams.get("search") || undefined;

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // getTenantList → db.tenant.findMany → Prisma skip/take 的未定义行为。
    // 与 admin/orders/billing-orders 等的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: "page 必须 >= 1" }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: "pageSize 必须为正整数" }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

    const result = await getTenantList(page, pageSize, { status, plan, search });
    return NextResponse.json(result);
  } catch (error) {
    console.error("获取租户列表失败:", error);
    return NextResponse.json(
      { error: "获取租户列表失败" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/admin/tenants/[id] — 更新租户信息 ────────────────
// 注意：这是一个简化版本，实际应该有单独的 [id]/route.ts
