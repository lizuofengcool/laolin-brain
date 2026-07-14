/**
 * Next.js instrumentation hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * 在服务端启动时执行一次，用于接线平台级邮件服务。
 *
 * 背景：initEmailServiceFromEnv 读取 SMTP_* 环境变量并调用 emailService.init()
 * 初始化平台级单例 transporter，供 tenantId 为空的平台投递路径使用（监控告警
 * /api/monitoring、sendTestEmail 等）。但此前该函数无任何 bootstrap 调用，导致
 * 即便 env 已配置 SMTP，平台级邮件也永远投递失败——resolveTransporter("") 回退
 * 单例时 transporter 为 null → doSendEmail 仅打印 "not configured" 跳过。
 *
 * 此处补齐启动接线，使平台级邮件投递路径在 env 配置 SMTP 时可生效。租户级
 * 投递路径（ invitations 邀请邮件）不受影响：其经 resolveTransporter(tenantId)
 * 从 DB 读租户配置，不依赖此单例。
 *
 * 仅在 Node.js runtime 执行（跳过 Edge），并用动态 import 避免 email 模块
 * （含 nodemailer）被打入 Edge bundle。register 在 vitest 下不会执行，不影响单测。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initEmailServiceFromEnv } = await import("@/lib/email");
  initEmailServiceFromEnv();
}
