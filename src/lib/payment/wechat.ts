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
import { createHmac, timingSafeEqual, createDecipheriv } from 'crypto';

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

      // 3. 解密 resource 并提取订单信息
      // 微信支付 V3 回调的 resource 字段为 AES-256-GCM 加密密文（APIv3 密钥为 key），
      // 不能直接当明文读取。解密失败时拒绝回调，避免基于伪造/空 resource 误判支付成功。
      const resourceRaw = params.resource;
      let resource: Record<string, any> = {};
      if (resourceRaw && typeof resourceRaw === 'object') {
        if (typeof resourceRaw.ciphertext === 'string') {
          // V3 标准加密 resource：含 ciphertext/nonce/associated_data
          const decrypted = this.decryptResource(resourceRaw);
          if (!decrypted) {
            return {
              success: false,
              error: 'resource 解密失败，可能 APIv3 密钥不匹配或数据被篡改',
            };
          }
          resource = decrypted;
        } else {
          // 兼容：resource 为明文对象（非 V3 标准回调，如部分沙箱/历史数据）
          resource = resourceRaw;
        }
      }
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
   * 微信支付 V3 回调签名验证
   *
   * 使用 APIv3 密钥对签名串做 HMAC-SHA256，与回调签名做恒定时间比较。
   * 签名串规范（微信支付 V3）：`${timestamp}\n${nonce}\n${body}\n`
   *
   * 调用方需从 HTTP 头透传以下字段到 params：
   *   - timestamp  (Wechatpay-Timestamp)
   *   - nonce      (Wechatpay-Nonce)
   *   - body       (原始请求体文本)
   *   - signature  (Wechatpay-Signature)
   *
   * 缺少任一字段或密钥未配置时直接拒绝，不再"非空即通过"。
   */
  private verifyWechatSign(params: Record<string, any>, sign: string): boolean {
    const apiKey = this.config.apiKey;
    const timestamp = params?.timestamp;
    const nonce = params?.nonce;
    const body = params?.body;
    const signature = sign || params?.signature;

    if (!apiKey || !timestamp || !nonce || body === undefined || !signature) {
      return false;
    }

    try {
      const signContent = `${timestamp}\n${nonce}\n${body}\n`;
      const expected = createHmac('sha256', apiKey).update(signContent, 'utf8').digest('hex');
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * 解密微信支付 V3 回调 resource 字段
   *
   * 微信支付 V3 回调中 resource 为 AES-256-GCM 加密密文：
   *   - key          = APIv3 密钥（apiKey，32 字节字符串）
   *   - iv           = resource.nonce（12 字节字符串）
   *   - aad          = resource.associated_data（字符串）
   *   - ciphertext   = base64 解码后的字节，末尾 16 字节为 GCM auth tag
   *
   * 解密成功返回解析后的明文对象，密钥不匹配或数据被篡改返回 null。
   */
  private decryptResource(resource: {
    ciphertext: string;
    nonce: string;
    associated_data?: string;
  }): Record<string, any> | null {
    const apiKey = this.config.apiKey;
    if (!apiKey || !resource.ciphertext || !resource.nonce) {
      return null;
    }

    try {
      const key = Buffer.from(apiKey, 'utf-8');
      if (key.length !== 32) {
        // APIv3 密钥必须为 32 字节（256-bit）
        return null;
      }
      const data = Buffer.from(resource.ciphertext, 'base64');
      if (data.length < 16) {
        return null;
      }
      const ciphertext = data.subarray(0, data.length - 16);
      const authTag = data.subarray(data.length - 16);
      const iv = Buffer.from(resource.nonce, 'utf-8');
      const aad = resource.associated_data ? Buffer.from(resource.associated_data, 'utf-8') : undefined;

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      if (aad) {
        decipher.setAAD(aad);
      }
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Wechat resource decryption failed:', error);
      return null;
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
