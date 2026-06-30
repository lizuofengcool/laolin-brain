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
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status");

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // db.order.findMany → Prisma skip/take 的未定义行为（Math.min(100, NaN) 仍为 NaN）。
    // 与 admin/tenants/admin/orders 等的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: "page 必须 >= 1" }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: "pageSize 必须为正整数" }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

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
