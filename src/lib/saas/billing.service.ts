/**
 * 订单与支付服务
 * 处理订单创建、支付回调、订阅管理等
 */

import { PrismaClient, Order, Subscription } from '@prisma/client';
import { PLAN_CONFIGS, PlanType, changePlan, getCurrentSubscription } from './tenant.service';

const prisma = new PrismaClient();

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
  plan: PlanType,
  interval: 'month' | 'year' = 'month',
  quantity: number = 1
): Promise<Order> {
  const planConfig = PLAN_CONFIGS[plan];

  // 计算金额（单位：分）
  let amount = planConfig.price * 100 * quantity;
  if (interval === 'year') {
    amount = amount * 10; // 年付 10 个月价格（买10送2）
  }

  const orderNo = generateOrderNo();

  const order = await prisma.order.create({
    data: {
      tenantId,
      orderNo,
      amount,
      plan,
      interval,
      quantity,
      status: 'pending',
    },
  });

  return order;
}

/**
 * 获取订单信息
 */
export async function getOrder(orderId: string): Promise<Order | null> {
  return prisma.order.findUnique({
    where: { id: orderId },
  });
}

/**
 * 根据订单号获取订单
 */
export async function getOrderByNo(orderNo: string): Promise<Order | null> {
  return prisma.order.findUnique({
    where: { orderNo },
  });
}

/**
 * 获取租户的订单列表
 */
export async function getTenantOrders(
  tenantId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ orders: Order[]; total: number }> {
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.order.count({ where: { tenantId } }),
  ]);

  return { orders, total };
}

/**
 * 处理支付成功回调
 */
export async function handlePaymentSuccess(
  orderNo: string,
  transactionId: string,
  payMethod: string
): Promise<{ success: boolean; order?: Order; subscription?: Subscription }> {
  const order = await getOrderByNo(orderNo);

  if (!order) {
    return { success: false };
  }

  if (order.status === 'paid') {
    // 已经支付过了，直接返回
    const subscription = await getCurrentSubscription(order.tenantId);
    return { success: true, order, subscription: subscription || undefined };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. 更新订单状态
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          payMethod,
          payTime: new Date(),
          transactionId,
        },
      });

      // 2. 获取当前订阅
      const currentSub = await tx.subscription.findFirst({
        where: {
          tenantId: order.tenantId,
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
      });

      // 3. 计算新的订阅周期
      const now = new Date();
      const baseDate = currentSub?.currentPeriodEnd && currentSub.currentPeriodEnd > now
        ? currentSub.currentPeriodEnd
        : now;

      const months = order.interval === 'year' ? 12 : 1;
      const newPeriodEnd = new Date(baseDate);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + months * order.quantity);

      // 4. 创建或更新订阅
      let subscription: Subscription;

      if (currentSub && currentSub.plan === order.plan) {
        // 续费同套餐
        subscription = await tx.subscription.update({
          where: { id: currentSub.id },
          data: {
            currentPeriodEnd: newPeriodEnd,
            cancelAtPeriodEnd: false,
          },
        });
      } else {
        // 新订阅或换套餐
        if (currentSub) {
          // 取消旧订阅
          await tx.subscription.update({
            where: { id: currentSub.id },
            data: {
              status: 'cancelled',
              endedAt: now,
            },
          });
        }

        // 创建新订阅
        subscription = await tx.subscription.create({
          data: {
            tenantId: order.tenantId,
            plan: order.plan,
            price: PLAN_CONFIGS[order.plan as PlanType].price,
            interval: order.interval,
            currentPeriodStart: now,
            currentPeriodEnd: newPeriodEnd,
            startedAt: now,
            status: 'active',
            orderId: order.id,
          },
        });

        // 更新租户套餐
        await tx.tenant.update({
          where: { id: order.tenantId },
          data: {
            plan: order.plan,
            storageQuota: PLAN_CONFIGS[order.plan as PlanType].storageQuota,
            aiQuota: PLAN_CONFIGS[order.plan as PlanType].aiQuota,
            currentPeriodEnd: newPeriodEnd,
          },
        });
      }

      return { order: updatedOrder, subscription };
    });

    return { success: true, order: result.order, subscription: result.subscription };
  } catch (error) {
    console.error('处理支付成功回调失败:', error);
    return { success: false };
  }
}

/**
 * 取消订阅（到期后失效）
 */
export async function cancelSubscription(tenantId: string): Promise<boolean> {
  const subscription = await getCurrentSubscription(tenantId);

  if (!subscription) {
    return false;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    },
  });

  return true;
}

/**
 * 恢复订阅（取消后重新激活）
 */
export async function reactivateSubscription(tenantId: string): Promise<boolean> {
  const subscription = await getCurrentSubscription(tenantId);

  if (!subscription || !subscription.cancelAtPeriodEnd) {
    return false;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      cancelAtPeriodEnd: false,
      canceledAt: null,
    },
  });

  return true;
}

/**
 * 检查订阅是否即将到期（7天内）
 */
export async function isSubscriptionExpiringSoon(tenantId: string): Promise<{
  expiring: boolean;
  daysLeft?: number;
  currentPeriodEnd?: Date;
}> {
  const subscription = await getCurrentSubscription(tenantId);

  if (!subscription) {
    return { expiring: false };
  }

  const now = new Date();
  const endDate = new Date(subscription.currentPeriodEnd);
  const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    expiring: daysLeft <= 7 && daysLeft > 0,
    daysLeft,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
}

/**
 * 获取支付参数（模拟，实际需要对接支付宝/微信）
 */
export async function getPaymentParams(
  orderId: string,
  payMethod: 'alipay' | 'wechat'
): Promise<{ success: boolean; payUrl?: string; qrCode?: string; error?: string }> {
  const order = await getOrder(orderId);

  if (!order) {
    return { success: false, error: '订单不存在' };
  }

  if (order.status === 'paid') {
    return { success: false, error: '订单已支付' };
  }

  // TODO: 实际对接支付宝/微信支付
  // 这里返回模拟数据
  return {
    success: true,
    payUrl: `https://pay.example.com/${payMethod}?orderNo=${order.orderNo}`,
  };
}
