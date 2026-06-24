import { NextRequest, NextResponse } from "next/server";
import { getTenantDetail, updateTenantStatus, updateTenantPlan } from "@/lib/admin/admin-service";

// ─── GET /api/admin/tenants/[id] — 获取租户详情 ────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantDetail(id);
    
    if (!tenant) {
      return NextResponse.json(
        { error: "租户不存在" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(tenant);
  } catch (error) {
    console.error("获取租户详情失败:", error);
    return NextResponse.json(
      { error: "获取租户详情失败" },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/admin/tenants/[id] — 更新租户状态 ────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, plan } = body;

    if (status) {
      if (!['active', 'suspended', 'cancelled'].includes(status)) {
        return NextResponse.json(
          { error: "无效的状态值" },
          { status: 400 }
        );
      }
      await updateTenantStatus(id, status as 'active' | 'suspended' | 'cancelled');
    }

    if (plan) {
      await updateTenantPlan(id, plan);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新租户失败:", error);
    return NextResponse.json(
      { error: "更新租户失败" },
      { status: 500 }
    );
  }
}
