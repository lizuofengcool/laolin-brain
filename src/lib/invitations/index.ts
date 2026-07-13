import { db } from "@/lib/db";
import { emailService } from "@/lib/email";

/**
 * 邀请角色到中文标签的映射（用于邮件展示）。
 * owner 不可经邀请产生，故不在此列。
 */
const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  member: "成员",
  viewer: "访客",
};

/**
 * 发送邀请邮件。
 *
 * fire-and-forget 语义：投递异常 console.error 记录后吞掉，不外抛、不中断调用方
 * 主流程（邀请记录已落库，邮件投递失败不应让 API 返回 500）。emailService.sendEmail
 * 为队列式异步投递，未配置 SMTP 时内部 console.warn 后清空队列跳过，调用方无感。
 *
 * 租户名取自 db.tenant.findUnique，缺失时回退到产品默认名，避免邮件中出现空名。
 * inviteUrl 形如 `${baseUrl}/invite?token=${token}`，baseUrl 取自 NEXT_PUBLIC_BASE_URL
 * / APP_URL 环境变量，均缺失时回退到 localhost。
 *
 * 由 POST /api/invitations（创建邀请）与 POST /api/invitations/[id]/resend（重发邀请）
 * 复用，保证两处邮件投递变量构造逻辑一致。
 */
export async function sendInvitationEmail(
  email: string,
  tenantId: string,
  userId: string,
  role: string,
  token: string,
  expiresAt: Date
): Promise<void> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const tenantName = tenant?.name || "个人私有第二大脑";

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite?token=${token}`;

    const variables: Record<string, string> = {
      email,
      tenantName,
      role: ROLE_LABELS[role] || role,
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
    };

    await emailService.sendEmail(email, "invitation", variables, tenantId, userId);
  } catch (error) {
    console.error("Failed to send invitation email:", error);
  }
}

/**
 * 邀请非 pending 状态的中文标签（用于 410 错误文案）。
 * 由 /api/invitations/[id]（撤销）与 /api/invitations/[id]/resend（重发）复用。
 */
export function statusLabel(status: string): string {
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
