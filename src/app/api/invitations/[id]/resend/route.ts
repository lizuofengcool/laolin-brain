import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { sendInvitationEmail, statusLabel } from "@/lib/invitations";

/**
 * 邀请重发 API
 * POST /api/invitations/[id]/resend - 重发邀请邮件并刷新有效期
 *
 * 安全契约：
 *   - 需鉴权且仅 owner/admin 可重发（与 GET/POST /api/invitations 门控一致）。
 *   - 跨租户守卫：findFirst where 含 {id, tenantId}，他租户 id → 404。
 *   - 仅 status='pending' 可重发；accepted/revoked/expired → 410。
 *     注：DB 状态仍为 pending 但 expiresAt 已过（逻辑过期）的邀请允许重发——
 *     重发会刷新 expiresAt 至 now + expiresInHours，使其重新可用。
 *   - 重发复用原 token（不轮换）：避免已投递邮件中的旧链接失效；token 为
 *     randomUUID 不可枚举，复用无安全降级。
 *   - 邮件投递 fire-and-forget，不中断主流程。
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, userId, role } = auth;
  const { id } = await params;

  // 权限检查：仅 owner/admin 可重发邀请
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "没有权限重发邀请" },
      { status: 403 }
    );
  }

  try {
    // 可选 body：expiresInHours（与 POST /api/invitations 一致校验，默认 72）
    let expiresInHours = 72;
    try {
      const body = await request.json();
      if (body !== null && typeof body === "object" && "expiresInHours" in body) {
        const raw = (body as { expiresInHours?: unknown }).expiresInHours;
        if (
          typeof raw !== "number" ||
          !Number.isInteger(raw) ||
          raw < 1 ||
          raw > 8760
        ) {
          return NextResponse.json(
            { error: "expiresInHours 必须为 1-8760 之间的正整数" },
            { status: 400 }
          );
        }
        expiresInHours = raw;
      }
    } catch {
      // 无 body 或非 JSON → 使用默认 72h，不报错
    }

    // 跨租户守卫 + 存在性校验
    const invitation = await db.invitation.findFirst({
      where: { id, tenantId },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "邀请不存在" },
        { status: 404 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `邀请已${statusLabel(invitation.status)}，无法重发` },
        { status: 410 }
      );
    }

    // 刷新有效期至 now + expiresInHours（使逻辑过期的 pending 邀请重新可用）
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const updated = await db.invitation.update({
      where: { id },
      data: { expiresAt },
    });

    // 重发邮件（fire-and-forget，复用原 token）
    await sendInvitationEmail(
      invitation.email,
      tenantId,
      userId,
      invitation.role,
      invitation.token,
      expiresAt
    );

    return NextResponse.json({
      success: true,
      data: updated,
      message: "邀请已重发",
    });
  } catch (error) {
    console.error("Failed to resend invitation:", error);
    return NextResponse.json(
      { error: "重发邀请失败" },
      { status: 500 }
    );
  }
}
