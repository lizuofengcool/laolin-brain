import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { statusLabel } from "@/lib/invitations";

/**
 * 单个邀请管理 API
 * DELETE /api/invitations/[id] - 撤销邀请（仅 pending 可撤销，标记 status='revoked'）
 *
 * 安全契约：
 *   - 需鉴权且仅 owner/admin 可撤销（与 GET/POST /api/invitations 门控一致）。
 *   - 跨租户守卫：findFirst where 含 {id, tenantId}，他租户 id 等价于"不存在" → 404，
 *     不泄漏邀请存在性。
 *   - 仅 status='pending' 可撤销；accepted/revoked/expired → 410。
 *   - 撤销为软撤销（update status='revoked'），保留记录以备审计，不 delete。
 */

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;
  const { id } = await params;

  // 权限检查：仅 owner/admin 可撤销邀请
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "没有权限撤销邀请" },
      { status: 403 }
    );
  }

  try {
    // 跨租户守卫 + 存在性校验合并为单次查询：where {id, tenantId}
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
        { error: `邀请已${statusLabel(invitation.status)}，无法撤销` },
        { status: 410 }
      );
    }

    const updated = await db.invitation.update({
      where: { id },
      data: { status: "revoked" },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "邀请已撤销",
    });
  } catch (error) {
    console.error("Failed to revoke invitation:", error);
    return NextResponse.json(
      { error: "撤销邀请失败" },
      { status: 500 }
    );
  }
}
