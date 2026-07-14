import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import {
  getCurrentSubscription,
  PLANS,
  checkTrialStatus,
  createSubscription,
} from "@/lib/billing/subscription";

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

// ─── POST /api/billing/subscription — 直接变更订阅（仅限免费套餐降级） ────
// 付费套餐（pro/enterprise）必须经 /api/payment/create 走支付链路，支付回调
// handlePaymentCallback 内调 createSubscription 完成订阅；本端点仅承接无需支付
// 的「降级到 free」场景（BillingCenter.handleSelectPlan 在 free 套餐按钮触发）。
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId } = auth;

    const body = await request.json().catch(() => ({}));
    const { planId, interval } = body ?? {};

    // 参数校验：planId 必填且必须是 free；interval 可选，缺省 month
    if (!planId) {
      return NextResponse.json(
        { error: "缺少 planId 参数" },
        { status: 400 }
      );
    }
    if (!PLANS[planId]) {
      return NextResponse.json(
        { error: "无效的套餐" },
        { status: 400 }
      );
    }
    // 仅允许直接订阅免费套餐；付费套餐必须走支付流程
    if (planId !== "free") {
      return NextResponse.json(
        {
          error: "付费套餐请通过支付流程升级",
          code: "PAYMENT_REQUIRED",
        },
        { status: 400 }
      );
    }
    const resolvedInterval =
      interval === "year" ? "year" : "month";

    // createSubscription 会取消当前活跃订阅并创建新订阅 + 更新租户配额
    const subscription = await createSubscription(
      tenantId,
      planId,
      resolvedInterval
    );

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        interval: subscription.interval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });
  } catch (error) {
    console.error("变更订阅失败:", error);
    return NextResponse.json(
      { error: "变更订阅失败" },
      { status: 500 }
    );
  }
}
