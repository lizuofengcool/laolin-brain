import { NextRequest, NextResponse } from "next/server";
import { PLANS } from "@/lib/billing/subscription";

// ─── GET /api/billing/plans — 获取套餐列表 ────────────────
export async function GET(request: NextRequest) {
  try {
    // 将套餐转换为数组格式，并添加一些额外信息
    const plans = Object.entries(PLANS).map(([id, plan]) => ({
      id,
      name: plan.name,
      description: plan.description,
      price: {
        monthly: plan.price.monthly,
        yearly: plan.price.yearly,
        yearlyDiscount: plan.price.monthly > 0
          ? Math.round((1 - plan.price.yearly / (plan.price.monthly * 12)) * 100)
          : 0,
      },
      features: plan.features,
    }));

    return NextResponse.json({
      plans,
    });
  } catch (error) {
    console.error("获取套餐列表失败:", error);
    return NextResponse.json(
      { error: "获取套餐列表失败" },
      { status: 500 }
    );
  }
}
