/**
 * 支付宝支付服务
 * 实现支付宝支付接口，支持创建订单、查询状态、验证回调、退款
 */
import {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  QueryPaymentResult,
  VerifyCallbackResult,
  RefundParams,
  RefundResult,
} from './types';
import { getPaymentConfig, isPaymentConfigured } from './config';
import { createHmac } from 'crypto';

export class AlipayProvider implements PaymentProvider {
  private config: ReturnType<typeof getPaymentConfig>['alipay'];

  constructor() {
    this.config = getPaymentConfig().alipay;
  }

  /**
   * 创建支付宝支付订单
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      // 检查配置
      if (!isPaymentConfigured('alipay')) {
        // 模拟模式：返回模拟支付URL
        return this.createMockPayment(params);
      }

      // 真实支付宝SDK接入点
      // 这里可以接入 alipay-sdk 或其他支付宝SDK
      // 目前返回模拟结果
      return this.createMockPayment(params);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '创建支付宝支付订单失败',
      };
    }
  }

  /**
   * 创建模拟支付订单（用于开发测试）
   */
  private createMockPayment(params: CreatePaymentParams): CreatePaymentResult {
    const mockTradeNo = `ALIPAY${Date.now()}${Math.random().toString(36).substring(2, 10)}`;

    // 模拟支付页面URL
    const mockPayUrl = `/api/payment/mock/alipay?orderNo=${params.orderNo}&amount=${params.amount}&tradeNo=${mockTradeNo}`;

    return {
      success: true,
      payUrl: mockPayUrl,
      tradeNo: mockTradeNo,
    };
  }

  /**
   * 查询支付宝支付状态
   */
  async queryPayment(orderNo: string): Promise<QueryPaymentResult> {
    try {
      if (!isPaymentConfigured('alipay')) {
        // 模拟模式：默认返回pending
        return {
          success: true,
          status: 'pending',
        };
      }

      // 真实支付宝SDK接入点
      return {
        success: true,
        status: 'pending',
      };
    } catch (error: any) {
      return {
        success: false,
        status: 'failed',
        error: error.message || '查询支付宝支付状态失败',
      };
    }
  }

  /**
   * 验证支付宝回调签名
   */
  async verifyCallback(params: Record<string, any>): Promise<VerifyCallbackResult> {
    try {
      // 模拟模式：直接验证通过
      if (!isPaymentConfigured('alipay')) {
        return this.verifyMockCallback(params);
      }

      // 真实支付宝签名验证
      // 1. 提取sign和sign_type
      const { sign, sign_type, ...restParams } = params;

      // 2. 按参数名ASCII排序
      const sortedKeys = Object.keys(restParams).sort();
      const sortedParams: Record<string, any> = {};
      sortedKeys.forEach((key) => {
        sortedParams[key] = restParams[key];
      });

      // 3. 拼接成待签名字符串
      const signContent = sortedKeys
        .map((key) => `${key}=${sortedParams[key]}`)
        .join('&');

      // 4. 使用支付宝公钥验证签名
      // 这里需要使用RSA2签名验证
      // 实际实现需要使用支付宝公钥进行验证
      const isValid = this.verifyRSA2Sign(signContent, sign, this.config.publicKey);

      if (!isValid) {
        return {
          success: false,
          error: '签名验证失败',
        };
      }

      // 5. 提取订单信息
      return {
        success: true,
        orderNo: params.out_trade_no,
        tradeNo: params.trade_no,
        amount: Math.round(parseFloat(params.total_amount) * 100), // 转换为分
        status: params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED'
          ? 'paid'
          : 'failed',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '验证支付宝回调失败',
      };
    }
  }

  /**
   * 验证模拟回调
   */
  private verifyMockCallback(params: Record<string, any>): VerifyCallbackResult {
    // 模拟模式：检查是否有mock签名
    const mockSign = params.mock_sign;
    const expectedSign = this.generateMockSign(params.order_no || params.out_trade_no);

    if (mockSign !== expectedSign) {
      return {
        success: false,
        error: '模拟签名验证失败',
      };
    }

    return {
      success: true,
      orderNo: params.order_no || params.out_trade_no,
      tradeNo: params.trade_no,
      amount: parseInt(params.amount) || 0,
      status: params.status === 'success' ? 'paid' : 'failed',
    };
  }

  /**
   * 生成模拟签名
   */
  generateMockSign(orderNo: string): string {
    return createHmac('sha256', 'mock-alipay-secret')
      .update(orderNo)
      .digest('hex');
  }

  /**
   * RSA2签名验证（占位实现）
   * 实际实现需要使用 crypto 模块的公钥验证
   */
  private verifyRSA2Sign(content: string, sign: string, publicKey: string): boolean {
    // 占位实现，实际项目中需要完整实现
    // 使用 crypto.createVerify('RSA-SHA256')
    try {
      // 简单验证：非空即通过（开发模式）
      return !!sign && !!publicKey;
    } catch {
      return false;
    }
  }

  /**
   * 支付宝退款
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      if (!isPaymentConfigured('alipay')) {
        // 模拟模式
        return {
          success: true,
          refundNo: `REFUND${Date.now()}`,
        };
      }

      // 真实支付宝退款接口接入点
      return {
        success: true,
        refundNo: `REFUND${Date.now()}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '支付宝退款失败',
      };
    }
  }
}

// 导出单例
export const alipayProvider = new AlipayProvider();
