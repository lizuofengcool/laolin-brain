/**
 * 订阅与计费服务
 * 支持多租户订阅管理、配额控制、订单管理
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logging";
import { logActivity } from "@/lib/activity-log";

// ==================== 套餐定义 ====================

export interface PlanConfig {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number; // 分
    yearly: number; // 分
  };
  features: {
    storageQuota: bigint; // 字节
    aiQuota: number; // 次/天
    maxUsers: number;
    versionHistory: boolean;
    advancedSearch: boolean;
    prioritySupport: boolean;
    customBranding: boolean;
    apiAccess: boolean;
  };
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: 'free',
    name: '免费版',
    description: '适合个人用户，基础功能完全免费',
    price: {
      monthly: 0,
      yearly: 0,
    },
    features: {
      storageQuota: BigInt(1 * 1024 * 1024 * 1024), // 1GB
      aiQuota: 50, // 50次/天
      maxUsers: 1,
      versionHistory: false,
      advancedSearch: false,
      prioritySupport: false,
      customBranding: false,
      apiAccess: false,
    },
  },
  pro: {
    id: 'pro',
    name: '专业版',
    description: '适合专业用户和小团队，解锁全部高级功能',
    price: {
      monthly: 3900, // 39元/月
      yearly: 39000, // 390元/年（约32.5元/月）
    },
    features: {
      storageQuota: BigInt(50 * 1024 * 1024 * 1024), // 50GB
      aiQuota: 500, // 500次/天
      maxUsers: 5,
      versionHistory: true,
      advancedSearch: true,
      prioritySupport: true,
      customBranding: false,
      apiAccess: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: '企业版',
    description: '适合企业和团队，定制化服务与支持',
    price: {
      monthly: 19900, // 199元/月
      yearly: 199000, // 1990元/年
    },
    features: {
      storageQuota: BigInt(500 * 1024 * 1024 * 1024), // 500GB
      aiQuota: 5000, // 5000次/天
      maxUsers: 50,
      versionHistory: true,
      advancedSearch: true,
      prioritySupport: true,
      customBranding: true,
      apiAccess: true,
    },
  },
};

// ==================== 订阅管理 ====================

/**
 * 获取租户当前订阅
 */
export async function getCurrentSubscription(tenantId: string) {
  const subscription = await db.subscription.findFirst({
    where: {
      tenantId,
      status: 'active',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!subscription) {
    // 返回免费版默认订阅
    return {
      plan: 'free',
      status: 'active',
      currentPeriodEnd: null,
      features: PLANS.free.features,
    };
  }

  const plan = PLANS[subscription.plan] || PLANS.free;

  return {
    ...subscription,
    features: plan.features,
  };
}

/**
 * 创建订阅
 */
export async function createSubscription(
  tenantId: string,
  planId: string,
  interval: 'month' | 'year' = 'month'
) {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  const price = interval === 'month' ? plan.price.monthly : plan.price.yearly;
  const now = new Date();
  const periodEnd = new Date(now);
  if (interval === 'month') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  // 取消当前活跃订阅
  await db.subscription.updateMany({
    where: {
      tenantId,
      status: 'active',
    },
    data: {
      status: 'cancelled',
      canceledAt: now,
    },
  });

  // 创建新订阅
  const subscription = await db.subscription.create({
    data: {
      tenantId,
      plan: planId,
      status: 'active',
      price,
      interval,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      startedAt: now,
    },
  });

  // 更新租户配额
  await updateTenantQuota(tenantId, planId);

  return subscription;
}

/**
 * 取消订阅（到期失效）
 */
export async function cancelSubscription(tenantId: string) {
  const subscription = await db.subscription.findFirst({
    where: {
      tenantId,
      status: 'active',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!subscription) {
    throw new Error('No active subscription found');
  }

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      cancelAtPeriodEnd: true,
    },
  });

  return true;
}

/**
 * 更新租户配额
 */
export async function updateTenantQuota(tenantId: string, planId: string) {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      plan: planId,
      storageQuota: plan.features.storageQuota,
      aiQuota: plan.features.aiQuota,
    },
  });
}

// ==================== 订单管理 ====================

/**
 * 生成订单号
 */
function generateOrderNo(): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `KB${timestamp}${random}`;
}

/**
 * 创建订单
 */
export async function createOrder(
  tenantId: string,
  planId: string,
  interval: 'month' | 'year',
  payMethod: 'alipay' | 'wechat'
) {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  const amount = interval === 'month' ? plan.price.monthly : plan.price.yearly;
  const orderNo = generateOrderNo();

  const order = await db.order.create({
    data: {
      tenantId,
      orderNo,
      amount,
      currency: 'cny',
      status: 'pending',
      payMethod,
      plan: planId,
      interval,
      quantity: 1,
    },
  });

  return order;
}

/**
 * 处理支付回调
 */
export async function handlePaymentCallback(
  orderNo: string,
  transactionId: string,
  success: boolean
) {
  const order = await db.order.findUnique({
    where: { orderNo },
  });

  if (!order) {
    throw new Error(`Order not found: ${orderNo}`);
  }

  if (order.status !== 'pending') {
    return order; // 已经处理过了
  }

  if (success) {
    // 更新订单状态
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        payTime: new Date(),
        transactionId,
      },
    });

    // 创建/更新订阅
    await createSubscription(order.tenantId, order.plan, order.interval as 'month' | 'year');
  } else {
    // 支付失败
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'failed',
      },
    });
  }

  return order;
}

/**
 * 获取订单列表
 */
export async function getOrders(tenantId: string, limit: number = 20) {
  return db.order.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * 复用待支付订单
 *
 * 用于 OrderHistory「立即支付」场景：避免 createOrder 创建新 pending 订单导致
 * 原订单悬挂（dangling）。按 id + tenantId 定位（跨租户 orderId 不会命中 →
 * 抛"订单不存在"），仅 status==='pending' 可复用（已支付需走退款，已取消/失败
 * 需重新下单）。复用时若 payMethod 与订单记录不同则刷新支付方式（未支付前可改），
 * 其余字段（plan/interval/amount/orderNo）保持不变。
 */
export async function reusePendingOrder(
  tenantId: string,
  orderId: string,
  payMethod: 'alipay' | 'wechat',
  userId: string
) {
  const order = await db.order.findFirst({
    where: { id: orderId, tenantId },
  });

  if (!order) {
    throw new Error('订单不存在');
  }

  if (order.status !== 'pending') {
    throw new Error('仅待支付订单可复用');
  }

  // 切换支付方式时更新订单记录（未支付前可在 alipay/wechat 间切换）
  if (order.payMethod !== payMethod) {
    const previousPayMethod = order.payMethod;
    const updated = await db.order.update({
      where: { id: order.id },
      data: { payMethod },
    });
    // 记录支付方式变更审计日志：用户在待支付订单上切换 alipay↔wechat 时，
    // 旧支付页/tradeNo 仍可能在第三方侧 pending（回调验签会拒绝未匹配的 tradeNo，
    // 非阻塞），留审计痕迹便于事后排查重复支付疑议。仅记成功切换，更新失败由
    // 调用方 catch 兜底，不在此记审计。
    // 双层审计：logger.audit 走 console + 内存（运维即时观测）；
    // logActivity 持久化到 ActivityLog 表（管理后台可查询的审计 trail），经
    // setImmediate 异步落库，不阻塞支付主流程，失败仅 console.error 不抛错。
    logger.audit("支付方式切换", {
      tenantId,
      orderId: order.id,
      orderNo: order.orderNo,
      previousPayMethod,
      newPayMethod: payMethod,
      amount: order.amount,
    });
    logActivity({
      userId,
      tenantId,
      action: "pay_method_switch",
      resourceType: "order",
      resourceId: order.id,
      details: {
        orderNo: order.orderNo,
        previousPayMethod,
        newPayMethod: payMethod,
        amount: order.amount,
      },
    });
    return updated;
  }

  return order;
}

/**
 * 取消待支付订单
 *
 * 仅 status==='pending' 的订单可取消（已支付订单需走退款流程）。
 * 按 id + tenantId 定位，跨租户 orderId 不会命中 → 抛"订单不存在"。
 * 取消后置 status='cancelled'，不删除记录以便审计。
 */
export async function cancelOrder(tenantId: string, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, tenantId },
  });

  if (!order) {
    throw new Error('订单不存在');
  }

  if (order.status !== 'pending') {
    throw new Error('仅待支付订单可取消');
  }

  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: 'cancelled' },
  });

  return updated;
}

// ==================== 配额检查 ====================

/**
 * 检查存储配额
 */
export async function checkStorageQuota(tenantId: string, fileSize: number): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    return false;
  }

  return tenant.storageUsed + BigInt(fileSize) <= tenant.storageQuota;
}

/**
 * 检查 AI 配额
 */
export async function checkAiQuota(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    return false;
  }

  // 检查是否需要重置配额
  const today = new Date();
  if (!tenant.aiResetDate || tenant.aiResetDate < today) {
    // 重置配额
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        aiUsed: 0,
        aiResetDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
      },
    });
    return true;
  }

  return tenant.aiUsed < tenant.aiQuota;
}

/**
 * 增加 AI 使用量
 */
export async function incrementAiUsage(tenantId: string): Promise<void> {
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      aiUsed: {
        increment: 1,
      },
    },
  });
}

// ==================== 试用管理 ====================

/**
 * 开始试用
 */
export async function startTrial(tenantId: string, trialDays: number = 14) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

  // 设置专业版试用
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      plan: 'pro',
      trialEndsAt,
      storageQuota: PLANS.pro.features.storageQuota,
      aiQuota: PLANS.pro.features.aiQuota,
    },
  });

  return trialEndsAt;
}

/**
 * 检查试用是否过期
 */
export async function checkTrialStatus(tenantId: string): Promise<{
  isTrial: boolean;
  trialEndsAt: Date | null;
  daysLeft: number;
}> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant || !tenant.trialEndsAt) {
    return {
      isTrial: false,
      trialEndsAt: null,
      daysLeft: 0,
    };
  }

  const now = new Date();
  const daysLeft = Math.ceil(
    (tenant.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    isTrial: daysLeft > 0,
    trialEndsAt: tenant.trialEndsAt,
    daysLeft: Math.max(0, daysLeft),
  };
}
