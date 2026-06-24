/**
 * 租户服务
 * 管理租户、订阅、配额等
 */

import { PrismaClient, Tenant, Subscription } from '@prisma/client';
import { hashPassword, verifyPassword } from '../auth';

const prisma = new PrismaClient();

// 套餐配置
export const PLAN_CONFIGS = {
  free: {
    name: '免费版',
    price: 0,
    storageQuota: 1 * 1024 * 1024 * 1024, // 1GB
    aiQuota: 50, // 50次/天
    maxFiles: 1000,
    features: ['基础文件管理', 'AI 摘要（限量）', '本地存储'],
  },
  pro: {
    name: '专业版',
    price: 39, // 39元/月
    storageQuota: 50 * 1024 * 1024 * 1024, // 50GB
    aiQuota: 500, // 500次/天
    maxFiles: 50000,
    features: ['全部免费版功能', '云端同步', 'AI 全功能', '版本历史', '优先支持'],
  },
  enterprise: {
    name: '企业版',
    price: 199, // 199元/月
    storageQuota: 500 * 1024 * 1024 * 1024, // 500GB
    aiQuota: 5000, // 5000次/天
    maxFiles: -1, // 无限
    features: ['全部专业版功能', '团队协作', 'SSO 单点登录', '专属客服', '定制开发'],
  },
};

export type PlanType = keyof typeof PLAN_CONFIGS;

/**
 * 创建租户（注册时自动创建）
 */
export async function createTenant(
  name: string,
  plan: PlanType = 'free',
  trialDays: number = 14
): Promise<Tenant> {
  const planConfig = PLAN_CONFIGS[plan];

  const tenant = await prisma.tenant.create({
    data: {
      name,
      plan,
      storageQuota: planConfig.storageQuota,
      aiQuota: planConfig.aiQuota,
      trialEndsAt: trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // 创建默认订阅
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      plan,
      price: planConfig.price,
      interval: 'month',
      currentPeriodStart: new Date(),
      currentPeriodEnd: tenant.currentPeriodEnd!,
      startedAt: new Date(),
    },
  });

  return tenant;
}

/**
 * 获取租户信息
 */
export async function getTenant(tenantId: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
  });
}

/**
 * 检查租户是否有访问权限
 */
export async function checkTenantAccess(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const membership = await prisma.tenantUser.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId,
      },
    },
  });

  return !!membership;
}

/**
 * 获取用户的租户列表
 */
export async function getUserTenants(userId: string) {
  const memberships = await prisma.tenantUser.findMany({
    where: { userId },
    include: {
      tenant: true,
    },
    orderBy: { joinedAt: 'desc' },
  });

  return memberships.map((m) => ({
    ...m.tenant,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}

/**
 * 添加用户到租户
 */
export async function addUserToTenant(
  tenantId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' = 'member'
): Promise<void> {
  await prisma.tenantUser.upsert({
    where: {
      tenantId_userId: {
        tenantId,
        userId,
      },
    },
    update: { role },
    create: {
      tenantId,
      userId,
      role,
    },
  });
}

/**
 * 检查存储配额
 */
export async function checkStorageQuota(
  tenantId: string,
  fileSize: number
): Promise<{ allowed: boolean; used: bigint; quota: bigint }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { storageQuota: true, storageUsed: true },
  });

  if (!tenant) {
    return { allowed: false, used: BigInt(0), quota: BigInt(0) };
  }

  const allowed = tenant.storageUsed + BigInt(fileSize) <= tenant.storageQuota;

  return {
    allowed,
    used: tenant.storageUsed,
    quota: tenant.storageQuota,
  };
}

/**
 * 更新已用存储
 */
export async function updateStorageUsed(
  tenantId: string,
  delta: bigint
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      storageUsed: {
        increment: delta,
      },
    },
  });
}

/**
 * 检查 AI 配额
 */
export async function checkAiQuota(tenantId: string): Promise<{
  allowed: boolean;
  used: number;
  quota: number;
  remaining: number;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiQuota: true, aiUsed: true, aiResetDate: true },
  });

  if (!tenant) {
    return { allowed: false, used: 0, quota: 0, remaining: 0 };
  }

  const today = new Date().toDateString();
  const resetDate = tenant.aiResetDate?.toDateString();

  // 如果是新的一天，重置配额
  if (resetDate !== today) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        aiUsed: 0,
        aiResetDate: new Date(),
      },
    });

    return {
      allowed: true,
      used: 0,
      quota: tenant.aiQuota,
      remaining: tenant.aiQuota,
    };
  }

  const remaining = Math.max(0, tenant.aiQuota - tenant.aiUsed);

  return {
    allowed: tenant.aiUsed < tenant.aiQuota,
    used: tenant.aiUsed,
    quota: tenant.aiQuota,
    remaining,
  };
}

/**
 * 消耗 AI 配额
 */
export async function consumeAiQuota(tenantId: string, amount: number = 1): Promise<boolean> {
  const { allowed } = await checkAiQuota(tenantId);

  if (!allowed) {
    return false;
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      aiUsed: {
        increment: amount,
      },
    },
  });

  return true;
}

/**
 * 升级/降级套餐
 */
export async function changePlan(
  tenantId: string,
  newPlan: PlanType
): Promise<Tenant> {
  const planConfig = PLAN_CONFIGS[newPlan];

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: newPlan,
      storageQuota: planConfig.storageQuota,
      aiQuota: planConfig.aiQuota,
    },
  });

  return tenant;
}

/**
 * 获取当前订阅
 */
export async function getCurrentSubscription(
  tenantId: string
): Promise<Subscription | null> {
  return prisma.subscription.findFirst({
    where: {
      tenantId,
      status: 'active',
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * 检查租户状态（是否过期、是否被暂停）
 */
export async function checkTenantStatus(tenantId: string): Promise<{
  active: boolean;
  reason?: string;
  plan: string;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
}> {
  const tenant = await getTenant(tenantId);

  if (!tenant) {
    return { active: false, reason: '租户不存在', plan: 'free' };
  }

  if (tenant.status === 'suspended') {
    return { active: false, reason: '账户已暂停', plan: tenant.plan };
  }

  if (tenant.status === 'cancelled') {
    return { active: false, reason: '账户已取消', plan: tenant.plan };
  }

  // 检查试用期是否结束（免费版不检查）
  if (tenant.plan === 'free' && tenant.trialEndsAt && new Date() > tenant.trialEndsAt) {
    // 试用期结束，降级为免费版功能限制
    // 这里可以根据业务逻辑处理
  }

  return {
    active: true,
    plan: tenant.plan,
    trialEndsAt: tenant.trialEndsAt,
    currentPeriodEnd: tenant.currentPeriodEnd,
  };
}
