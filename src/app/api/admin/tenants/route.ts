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
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") || undefined;
    const plan = searchParams.get("plan") || undefined;
    const search = searchParams.get("search") || undefined;

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
