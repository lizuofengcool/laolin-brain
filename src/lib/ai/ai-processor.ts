import { db } from "@/lib/db";
import { checkAiUsage } from "../ai-usage";

/**
 * AI处理工具函数
 * 统一处理AI相关的操作，包括多租户支持、配额检查、状态跟踪等
 */

/**
 * 检查AI配额并获取租户信息
 * @param userId 用户ID
 * @param tenantId 用户所属租户ID（由 authenticateRequest 已查证返回，避免本函数重复查 tenantUser）
 * @returns 租户信息和配额状态
 */
export async function checkAiQuotaAndTenant(userId: string, tenantId: string) {
  // 检查用户配额
  const usage = checkAiUsage(userId);
  if (!usage.allowed) {
    return {
      allowed: false,
      error: `AI调用已达每日限额，请明天再试`,
      resetTime: usage.resetTime,
      remaining: usage.remaining,
    };
  }

  // 检查租户的AI配额（tenantId 由调用方传入，避免重复 db.tenantUser.findFirst）
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      aiQuota: true,
      aiUsed: true,
      aiResetDate: true,
      status: true,
    },
  });

  if (!tenant || tenant.status !== 'active') {
    return {
      allowed: false,
      error: "租户不存在或已停用",
      remaining: usage.remaining,
    };
  }

  // 检查租户配额是否已用完
  const today = new Date();
  const resetDate = tenant.aiResetDate;

  // 如果重置日期不存在或已过期，重置配额
  if (!resetDate || resetDate < today) {
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        aiUsed: 0,
        aiResetDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    tenant.aiUsed = 0;
  }

  if (tenant.aiUsed >= tenant.aiQuota) {
    return {
      allowed: false,
      error: "租户AI配额已用完，请升级套餐",
      remaining: usage.remaining,
    };
  }

  return {
    allowed: true,
    tenantId,
    tenant,
    remaining: usage.remaining,
  };
}

/**
 * 记录租户AI使用量
 * @param tenantId 租户ID
 * @param operation AI 操作类型（summary/ocr/describe/tags/qna），用于按类型拆分统计
 * @param userId 触发调用的用户ID，落 AiUsageLog 以备审计
 *
 * 在单个事务内同时自增 Tenant.aiUsed 与写入 AiUsageLog 明细，保证配额计数与
 * 明细日志一致（任一失败则整体回滚，避免 aiUsed 计了而明细缺失、或反之）。
 */
export async function incrementTenantAiUsage(
  tenantId: string,
  operation: 'summary' | 'ocr' | 'describe' | 'tags' | 'qna',
  userId: string,
) {
  try {
    await db.$transaction([
      db.tenant.update({
        where: { id: tenantId },
        data: {
          aiUsed: {
            increment: 1,
          },
        },
      }),
      db.aiUsageLog.create({
        data: { tenantId, userId, operation },
      }),
    ]);
  } catch (error) {
    console.error('Failed to increment tenant AI usage:', error);
  }
}

/**
 * 更新文件的AI处理状态
 * @param fileId 文件ID
 * @param status 处理状态
 * @param type 处理类型
 */
export async function updateFileAiStatus(
  fileId: string,
  type: 'summary' | 'ocr' | 'describe' | 'tags',
  status: 'pending' | 'processing' | 'completed' | 'failed',
  error?: string
) {
  try {
    // 这里可以添加一个AI处理状态表，或者在File表中添加状态字段
    // 目前我们先记录日志
    console.log(`File ${fileId} AI ${type} status: ${status}${error ? ` - ${error}` : ''}`);
  } catch (err) {
    console.error('Failed to update file AI status:', err);
  }
}

/**
 * 安全解析JSON响应
 * @param text AI返回的文本
 * @returns 解析后的对象
 */
export function safeParseAiJsonResponse(text: string): any {
  try {
    // 尝试提取JSON（可能被markdown代码块包裹）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // 忽略解析错误
  }
  return null;
}
