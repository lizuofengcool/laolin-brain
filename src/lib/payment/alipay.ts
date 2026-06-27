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
import { createHmac, createVerify, constants as cryptoConstants } from 'crypto';

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
      // 已配置真实密钥但尚未接入 alipay-sdk：返回明确错误，而非静默返回 mock 支付链接。
      // mock 链接指向 /api/payment/mock/*（回调最终会被 verifyCallback 的 RSA2 验签拒绝），
      // 但在已配置真实密钥的生产环境不应让用户进入模拟支付页，故显式失败。
      return {
        success: false,
        error: '支付宝真实支付尚未接入 SDK，请在未配置密钥的开发环境使用模拟支付，或接入 alipay-sdk',
      };
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
      // 已配置但未接入 SDK：返回失败，调用方（status 路由）会回退到本地订单状态，
      // 避免返回伪造的 pending 掩盖真实查询未实现。
      return {
        success: false,
        status: 'failed',
        error: '支付宝真实支付查询尚未接入 SDK',
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
   * RSA2 签名验证（RSA-SHA256）
   * 使用支付宝公钥验证回调签名，签名 base64 解码后以 RSA-SHA256 验签。
   * 公钥可为 PEM 文本，或单行 base64（自动补齐 PEM 头尾与换行）。
   */
  private verifyRSA2Sign(content: string, sign: string, publicKey: string): boolean {
    if (!sign || !publicKey) {
      return false;
    }
    try {
      const pem = this.normalizePublicKey(publicKey);
      const verifier = createVerify('RSA-SHA256');
      verifier.update(content, 'utf8');
      const signBuf = Buffer.from(sign, 'base64');
      return verifier.verify(
        { key: pem, padding: cryptoConstants.RSA_PKCS1_PADDING },
        signBuf,
      );
    } catch {
      return false;
    }
  }

  /**
   * 将支付宝公钥规整为 PEM 格式。
   * 支付宝后台复制的公钥通常是无头尾、无换行的 base64 单行串。
   */
  private normalizePublicKey(publicKey: string): string {
    const trimmed = publicKey.trim();
    if (trimmed.includes('-----BEGIN')) {
      return trimmed;
    }
    // 每 64 字符换行，符合 PEM 规范
    const body = trimmed.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n').trim();
    return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
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
      // 已配置但未接入 SDK：返回失败，避免静默返回伪造退款号造成"退款已发起"的假象。
      return {
        success: false,
        error: '支付宝真实退款尚未接入 SDK',
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
