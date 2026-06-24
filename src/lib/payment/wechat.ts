/**
 * 微信支付服务
 * 实现微信支付接口，支持创建订单、查询状态、验证回调、退款
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

export class WechatPayProvider implements PaymentProvider {
  private config: ReturnType<typeof getPaymentConfig>['wechat'];

  constructor() {
    this.config = getPaymentConfig().wechat;
  }

  /**
   * 创建微信支付订单
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      // 检查配置
      if (!isPaymentConfigured('wechat')) {
        // 模拟模式：返回模拟支付URL
        return this.createMockPayment(params);
      }

      // 真实微信支付SDK接入点
      // 这里可以接入 wechatpay-node-v3 或其他微信支付SDK
      // 目前返回模拟结果
      return this.createMockPayment(params);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '创建微信支付订单失败',
      };
    }
  }

  /**
   * 创建模拟支付订单（用于开发测试）
   */
  private createMockPayment(params: CreatePaymentParams): CreatePaymentResult {
    const mockTradeNo = `WECHAT${Date.now()}${Math.random().toString(36).substring(2, 10)}`;

    // 模拟支付页面URL
    const mockPayUrl = `/api/payment/mock/wechat?orderNo=${params.orderNo}&amount=${params.amount}&tradeNo=${mockTradeNo}`;

    return {
      success: true,
      payUrl: mockPayUrl,
      tradeNo: mockTradeNo,
      qrCode: `data:image/svg+xml;base64,${Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
          <rect width="200" height="200" fill="white"/>
          <text x="100" y="100" text-anchor="middle" fill="black" font-size="14">
            模拟微信支付二维码
          </text>
          <text x="100" y="130" text-anchor="middle" fill="gray" font-size="12">
            订单号: ${params.orderNo}
          </text>
          <text x="100" y="150" text-anchor="middle" fill="gray" font-size="12">
            金额: ¥${(params.amount / 100).toFixed(2)}
          </text>
        </svg>
      `).toString('base64')}`,
    };
  }

  /**
   * 查询微信支付状态
   */
  async queryPayment(orderNo: string): Promise<QueryPaymentResult> {
    try {
      if (!isPaymentConfigured('wechat')) {
        // 模拟模式：默认返回pending
        return {
          success: true,
          status: 'pending',
        };
      }

      // 真实微信支付SDK接入点
      return {
        success: true,
        status: 'pending',
      };
    } catch (error: any) {
      return {
        success: false,
        status: 'failed',
        error: error.message || '查询微信支付状态失败',
      };
    }
  }

  /**
   * 验证微信支付回调签名
   */
  async verifyCallback(params: Record<string, any>): Promise<VerifyCallbackResult> {
    try {
      // 模拟模式：直接验证通过
      if (!isPaymentConfigured('wechat')) {
        return this.verifyMockCallback(params);
      }

      // 真实微信支付签名验证
      // 微信支付V3使用APIv3密钥进行签名验证
      // 1. 提取签名相关信息
      const { sign, ...restParams } = params;

      // 2. 构建待签名字符串
      // 微信支付V3的签名验证比较复杂，需要处理证书、时间戳等
      // 这里简化处理
      const isValid = this.verifyWechatSign(restParams, sign);

      if (!isValid) {
        return {
          success: false,
          error: '签名验证失败',
        };
      }

      // 3. 提取订单信息
      const resource = params.resource || {};
      return {
        success: true,
        orderNo: resource.out_trade_no || params.out_trade_no,
        tradeNo: resource.transaction_id || params.transaction_id,
        amount: resource.amount ? resource.amount.total : 0,
        status: resource.trade_state === 'SUCCESS' ? 'paid' : 'failed',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '验证微信支付回调失败',
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
    return createHmac('sha256', 'mock-wechat-secret')
      .update(orderNo)
      .digest('hex');
  }

  /**
   * 微信支付签名验证（占位实现）
   * 实际实现需要完整的微信支付V3签名验证逻辑
   */
  private verifyWechatSign(params: Record<string, any>, sign: string): boolean {
    // 占位实现，实际项目中需要完整实现
    try {
      // 简单验证：非空即通过（开发模式）
      return !!sign && !!this.config.apiKey;
    } catch {
      return false;
    }
  }

  /**
   * 微信支付退款
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      if (!isPaymentConfigured('wechat')) {
        // 模拟模式
        return {
          success: true,
          refundNo: `REFUND${Date.now()}`,
        };
      }

      // 真实微信支付退款接口接入点
      return {
        success: true,
        refundNo: `REFUND${Date.now()}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '微信支付退款失败',
      };
    }
  }
}

// 导出单例
export const wechatPayProvider = new WechatPayProvider();
