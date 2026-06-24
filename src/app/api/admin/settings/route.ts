import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/billing/subscription";

// ─── GET /api/admin/settings — 获取系统设置 ────────────────
export async function GET(request: NextRequest) {
  try {
    // 获取系统概览信息
    const [totalUsers, totalTenants, totalFiles, totalFolders] = await Promise.all([
      db.user.count(),
      db.tenant.count(),
      db.file.count({ where: { isDeleted: false } }),
      db.folder.count(),
    ]);

    // 获取套餐配置
    const plans = Object.entries(PLANS).map(([id, plan]) => ({
      id,
      name: plan.name,
      price: plan.price.monthly, // 月价格（分）
      interval: 'month',
      features: plan.features,
    }));

    // 获取存储统计
    const tenants = await db.tenant.findMany({
      select: { storageUsed: true },
    });
    const totalStorage = tenants.reduce((sum, t) => sum + t.storageUsed, BigInt(0));

    return NextResponse.json({
      system: {
        totalUsers,
        totalTenants,
        totalFiles,
        totalFolders,
        totalStorage: totalStorage.toString(),
      },
      plans,
      storage: {
        defaultQuota: PLANS.free.features.storageQuota.toString(),
        defaultAiQuota: PLANS.free.features.aiQuota,
      },
    });
  } catch (error) {
    console.error("获取系统设置失败:", error);
    return NextResponse.json(
      { error: "获取系统设置失败" },
      { status: 500 }
    );
  }
}
