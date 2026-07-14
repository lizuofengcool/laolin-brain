import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { cancelOrder } from "@/lib/billing/subscription";

// ─── POST /api/billing/orders/[id]/cancel — 取消待支付订单 ──────────
// 仅 status==='pending' 的订单可取消；跨租户 orderId 不会命中（cancelOrder
// 按 id+tenantId 定位）。成功返回 { success, order }，失败返回 400/404。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    const { tenantId } = auth;

    const { id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json(
        { error: "缺少订单 ID" },
        { status: 400 }
      );
    }

    const order = await cancelOrder(tenantId, orderId);

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    const message = error?.message || "取消订单失败";

    // 已知业务错误（订单不存在 / 非待支付）→ 400，不暴露 500
    const known = message === "订单不存在" || message === "仅待支付订单可取消";
    return NextResponse.json(
      { error: known ? message : "取消订单失败" },
      { status: known ? 400 : 500 }
    );
  }
}
