import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { getCurrentSubscription, PLANS, checkTrialStatus } from "@/lib/billing/subscription";

// ─── GET /api/billing/subscription — 获取当前用户订阅信息 ────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, tenantId } = auth;

    // 获取订阅信息
    const subscription = await getCurrentSubscription(tenantId);

    // 获取租户配额使用情况
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        storageUsed: true,
        storageQuota: true,
        aiUsed: true,
        aiQuota: true,
        plan: true,
      },
    });

    // 获取试用状态
    const trialStatus = await checkTrialStatus(tenantId);

    // 获取当前套餐信息
    const plan = PLANS[subscription.plan] || PLANS.free;

    return NextResponse.json({
      subscription: {
        ...subscription,
        planName: plan.name,
        planDescription: plan.description,
      },
      usage: {
        storage: {
          used: tenant?.storageUsed?.toString() || "0",
          quota: tenant?.storageQuota?.toString() || plan.features.storageQuota.toString(),
          percentage: tenant && tenant.storageQuota > 0
            ? Number((tenant.storageUsed * BigInt(100) / tenant.storageQuota).toString())
            : 0,
        },
        ai: {
          used: tenant?.aiUsed || 0,
          quota: tenant?.aiQuota || plan.features.aiQuota,
          percentage: tenant && tenant.aiQuota > 0
            ? Math.round((tenant.aiUsed / tenant.aiQuota) * 100)
            : 0,
        },
      },
      trial: trialStatus,
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        features: plan.features,
      },
    });
  } catch (error) {
    console.error("获取订阅信息失败:", error);
    return NextResponse.json(
      { error: "获取订阅信息失败" },
      { status: 500 }
    );
  }
}
