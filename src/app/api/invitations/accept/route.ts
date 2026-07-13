import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 邀请接受 API
 *
 * GET  /api/invitations/accept?token=xxx — 预览邀请信息（只读，不写入）
 * POST /api/invitations/accept body:{token} — 接受邀请，建立租户成员关系
 *
 * 安全契约：
 *   - 需鉴权（authenticateRequest）：被邀请邮箱对应的登录账号才可接受。
 *     邀请 token 为 randomUUID（不可枚举），但邮箱匹配校验可防止 token
 *     泄露后被任意账号"冒领"加入他租户。
 *   - 邀请须 status='pending' 且 expiresAt > now；accepted/revoked/expired
 *     一律拒绝（410）。
 *   - 接受走 $transaction：TenantUser.create + Invitation.update 原子提交，
 *     避免出现"成员已加入但邀请状态未更新"或反之的不一致。
 *   - TenantUser @@unique([tenantId,userId]) 兜底：重复接受由 P2002 捕获 → 409。
 *
 * 跨租户说明：auth.tenantId 是用户当前租户，邀请可能指向其它租户。本路由一律
 * 以 invitation.tenantId 为准（按 token 反查），不使用 auth.tenantId 做成员落库。
 */

// ─── GET /api/invitations/accept — 预览邀请（只读）─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "缺少邀请令牌" }, { status: 400 });
  }

  try {
    const invitation = await db.invitation.findUnique({ where: { token } });

    if (!invitation) {
      return NextResponse.json({ error: "邀请不存在或令牌无效" }, { status: 404 });
    }

    // DB 中可能仍为 pending 但实际已过期，统一计算对外状态
    const now = new Date();
    const effectiveStatus =
      invitation.status === "pending" && invitation.expiresAt <= now
        ? "expired"
        : invitation.status;

    const tenant = await db.tenant.findUnique({
      where: { id: invitation.tenantId },
      select: { name: true },
    });

    return NextResponse.json({
      tenantName: tenant?.name ?? "未知团队",
      tenantId: invitation.tenantId,
      role: invitation.role,
      invitedEmail: invitation.email,
      status: effectiveStatus,
      expiresAt: invitation.expiresAt.toISOString(),
      // 当前登录账号是否与被邀请邮箱匹配（前端据此决定能否点"接受"）
      emailMatches: auth.email === invitation.email,
    });
  } catch (error) {
    console.error("Failed to fetch invitation:", error);
    return NextResponse.json({ error: "获取邀请信息失败" }, { status: 500 });
  }
}

// ─── POST /api/invitations/accept — 接受邀请 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : undefined;
  if (!token) {
    return NextResponse.json({ error: "缺少邀请令牌" }, { status: 400 });
  }

  try {
    const invitation = await db.invitation.findUnique({ where: { token } });

    if (!invitation) {
      return NextResponse.json({ error: "邀请不存在或令牌无效" }, { status: 404 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `邀请已${statusLabel(invitation.status)}，无法再次接受` },
        { status: 410 }
      );
    }

    if (invitation.expiresAt <= new Date()) {
      return NextResponse.json({ error: "邀请已过期" }, { status: 410 });
    }

    // 邮箱匹配校验：仅被邀请邮箱对应的登录账号可接受，防止 token 泄露后被冒领
    if (auth.email !== invitation.email) {
      return NextResponse.json(
        { error: "此邀请不属于当前账号，请使用被邀请的邮箱登录" },
        { status: 403 }
      );
    }

    // 事务：建立租户成员关系 + 标记邀请已接受（原子提交）
    await db.$transaction(async (tx) => {
      await tx.tenantUser.create({
        data: {
          tenantId: invitation.tenantId,
          userId: auth.userId,
          role: invitation.role,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });
    });

    const tenant = await db.tenant.findUnique({
      where: { id: invitation.tenantId },
      select: { name: true },
    });

    return NextResponse.json({
      success: true,
      message: "已成功加入团队",
      tenantName: tenant?.name ?? "未知团队",
      tenantId: invitation.tenantId,
      role: invitation.role,
    });
  } catch (error) {
    // P2002：唯一约束冲突（tenantId+userId 已存在）→ 用户已是该租户成员
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "您已是该团队的成员" },
        { status: 409 }
      );
    }
    console.error("Failed to accept invitation:", error);
    return NextResponse.json({ error: "接受邀请失败" }, { status: 500 });
  }
}

/** 邀请非 pending 状态的中文标签（用于 410 错误文案） */
function statusLabel(status: string): string {
  switch (status) {
    case "accepted":
      return "被接受";
    case "revoked":
      return "被撤销";
    case "expired":
      return "过期";
    default:
      return "失效";
  }
}

/** 判定是否为 Prisma 唯一约束冲突（P2002） */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
