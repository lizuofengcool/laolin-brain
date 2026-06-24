/**
 * 支付服务工厂
 * 统一的支付接口，根据支付方式调用对应服务
 */
import {
  PaymentProvider,
  PayMethod,
  CreatePaymentParams,
  CreatePaymentResult,
  QueryPaymentResult,
  VerifyCallbackResult,
  RefundParams,
  RefundResult,
} from './types';
import { alipayProvider } from './alipay';
import { wechatPayProvider } from './wechat';
import { db } from '@/lib/db';
import { handlePaymentCallback } from '@/lib/billing/subscription';

// 支付提供者映射
const providers: Record<PayMethod, PaymentProvider> = {
  alipay: alipayProvider,
  wechat: wechatPayProvider,
};

/**
 * 获取支付提供者
 */
export function getPaymentProvider(payMethod: PayMethod): PaymentProvider {
  const provider = providers[payMethod];
  if (!provider) {
    throw new Error(`Unsupported payment method: ${payMethod}`);
  }
  return provider;
}

/**
 * 创建支付订单
 */
export async function createPayment(
  payMethod: PayMethod,
  params: CreatePaymentParams
): Promise<CreatePaymentResult> {
  const provider = getPaymentProvider(payMethod);
  return provider.createPayment(params);
}

/**
 * 查询支付状态
 */
export async function queryPayment(
  payMethod: PayMethod,
  orderNo: string
): Promise<QueryPaymentResult> {
  const provider = getPaymentProvider(payMethod);
  return provider.queryPayment(orderNo);
}

/**
 * 验证并处理支付回调
 * 包含签名验证、订单状态更新、订阅更新
 */
export async function processPaymentCallback(
  payMethod: PayMethod,
  callbackParams: Record<string, any>
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const provider = getPaymentProvider(payMethod);

    // 1. 验证回调签名
    const verifyResult = await provider.verifyCallback(callbackParams);
    if (!verifyResult.success || !verifyResult.orderNo) {
      return {
        success: false,
        error: verifyResult.error || '签名验证失败',
      };
    }

    // 2. 查询订单，确保存在且属于对应租户
    const order = await db.order.findUnique({
      where: { orderNo: verifyResult.orderNo },
      include: {
        tenant: true,
      },
    });

    if (!order) {
      return {
        success: false,
        error: '订单不存在',
      };
    }

    // 3. 幂等性检查：如果订单已经处理过，直接返回成功
    if (order.status !== 'pending') {
      return {
        success: true,
        message: '订单已处理',
      };
    }

    // 4. 使用事务处理订单和订阅更新
    const result = await db.$transaction(async (tx) => {
      // 更新订单状态
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: verifyResult.status === 'paid' ? 'paid' : 'failed',
          payTime: verifyResult.status === 'paid' ? new Date() : null,
          transactionId: verifyResult.tradeNo,
        },
      });

      // 如果支付成功，创建/更新订阅
      if (verifyResult.status === 'paid') {
        // 取消当前活跃订阅
        await tx.subscription.updateMany({
          where: {
            tenantId: order.tenantId,
            status: 'active',
          },
          data: {
            status: 'cancelled',
            canceledAt: new Date(),
          },
        });

        // 创建新订阅
        const now = new Date();
        const periodEnd = new Date(now);
        if (order.interval === 'month') {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        await tx.subscription.create({
          data: {
            tenantId: order.tenantId,
            plan: order.plan,
            status: 'active',
            price: order.amount,
            interval: order.interval,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            startedAt: now,
          },
        });

        // 更新租户配额
        const planConfig = {
          free: { storageQuota: BigInt(1 * 1024 * 1024 * 1024), aiQuota: 50 },
          pro: { storageQuota: BigInt(50 * 1024 * 1024 * 1024), aiQuota: 500 },
          enterprise: { storageQuota: BigInt(500 * 1024 * 1024 * 1024), aiQuota: 5000 },
        };

        const plan = planConfig[order.plan as keyof typeof planConfig] || planConfig.free;

        await tx.tenant.update({
          where: { id: order.tenantId },
          data: {
            plan: order.plan,
            storageQuota: plan.storageQuota,
            aiQuota: plan.aiQuota,
          },
        });
      }

      return updatedOrder;
    });

    return {
      success: true,
      message: '回调处理成功',
    };
  } catch (error: any) {
    console.error('处理支付回调失败:', error);
    return {
      success: false,
      error: error.message || '处理支付回调失败',
    };
  }
}

/**
 * 退款
 */
export async function refundPayment(
  payMethod: PayMethod,
  params: RefundParams
): Promise<RefundResult> {
  const provider = getPaymentProvider(payMethod);
  return provider.refund(params);
}

// 导出所有类型
export * from './types';
export * from './config';
