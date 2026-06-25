import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { getOrders } from "@/lib/billing/subscription";

// ─── GET /api/billing/orders — 获取当前用户订单列表 ────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, tenantId } = auth;

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status");

    // 构建查询条件
    const where: any = { tenantId };
    if (status && status !== "all") {
      where.status = status;
    }

    // 获取订单列表
    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.order.count({ where }),
    ]);

    return NextResponse.json({
      orders,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("获取订单列表失败:", error);
    return NextResponse.json(
      { error: "获取订单列表失败" },
      { status: 500 }
    );
  }
}
