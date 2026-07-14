/**
 * 租户级 SMTP 配置的持久化与读取（加密落库）。
 *
 * 背景：原 api/email/settings/route.ts 仅调进程全局单例 emailService.init()，不落库——
 * 进程重启配置丢失，且租户 A 配置 SMTP 会覆盖租户 B 的单例 transporter（跨租户污染）。
 * 本模块把 SMTP 配置按 tenantId 持久化到 Setting 表，pass 等敏感字段经 AES-256-GCM
 * 加密（复用 config-crypto 的 encryptConfig/decryptConfig，与 storageConfig.config 同范式，
 * 因 SMTP 配置为 JSON 对象，故用 encryptConfig 而非面向裸字符串的 encryptSecret）。
 *
 * Setting 表无 (tenantId, key) 唯一约束，故用 findFirst → update/create 而非 upsert；
 * email 配置写入频率极低（仅管理员 POST），竞争窗口可忽略。
 *
 * 兼容：解密失败（密钥轮换/数据损坏）回退 null，调用方按"未配置"处理，不外抛。
 */
import { db } from "@/lib/db";
import { encryptConfig, decryptConfig } from "@/lib/cloud-sync/config-crypto";
import type { EmailConfig } from "@/lib/email";

/** Setting.key：租户级 SMTP 配置。userId=null 表示租户级（非用户级）。 */
export const EMAIL_SETTING_KEY = "email.smtp";
const EMAIL_SETTING_CATEGORY = "notification";

/**
 * 读取租户 SMTP 配置；未配置或解密失败返回 null。
 * 解密失败不外抛（密钥轮换/数据损坏场景），调用方按"未配置"处理。
 */
export async function getEmailConfig(tenantId: string): Promise<EmailConfig | null> {
  const row = await db.setting.findFirst({
    where: { tenantId, key: EMAIL_SETTING_KEY, userId: null },
    select: { value: true },
  });
  if (!row?.value) return null;
  try {
    return decryptConfig(row.value) as EmailConfig;
  } catch (error) {
    console.error(`Failed to decrypt email settings for tenant ${tenantId}:`, error);
    return null;
  }
}

/**
 * 保存（加密）租户 SMTP 配置。存在则更新，不存在则创建。
 * pass 连同其它字段整体 JSON.stringify 后 AES-256-GCM 加密落库，DB 文件不裸露 SMTP 密码。
 */
export async function saveEmailConfig(tenantId: string, config: EmailConfig): Promise<void> {
  const encrypted = encryptConfig(config);
  const existing = await db.setting.findFirst({
    where: { tenantId, key: EMAIL_SETTING_KEY, userId: null },
    select: { id: true },
  });
  if (existing) {
    await db.setting.update({
      where: { id: existing.id },
      data: { value: encrypted },
    });
  } else {
    await db.setting.create({
      data: {
        tenantId,
        key: EMAIL_SETTING_KEY,
        value: encrypted,
        type: "json",
        category: EMAIL_SETTING_CATEGORY,
        isEncrypted: true,
      },
    });
  }
}

/**
 * 返回脱敏视图（不含 pass），用于 GET / POST 响应。
 * hasPass 表示是否已配置密码（前端据此决定是否要求重填），不泄露密码本身。
 */
export function maskEmailConfig(config: EmailConfig) {
  return {
    configured: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    from: config.from,
    fromName: config.fromName,
    hasPass: !!config.pass,
  };
}
