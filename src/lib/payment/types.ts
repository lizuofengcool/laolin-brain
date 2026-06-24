/**
 * 支付服务类型定义
 */

// 支付方式
export type PayMethod = 'alipay' | 'wechat';

// 支付状态
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

// 创建支付订单参数
export interface CreatePaymentParams {
  orderNo: string;
  amount: number; // 分
  subject: string;
  description?: string;
  notifyUrl: string;
  returnUrl?: string;
  tenantId: string;
  userId: string;
}

// 创建支付订单结果
export interface CreatePaymentResult {
  success: boolean;
  payUrl?: string; // 支付跳转URL
  qrCode?: string; // 二维码URL或base64
  tradeNo?: string; // 第三方交易号
  error?: string;
}

// 查询支付状态结果
export interface QueryPaymentResult {
  success: boolean;
  status: PaymentStatus;
  tradeNo?: string;
  payTime?: Date;
  amount?: number;
  error?: string;
}

// 回调验证结果
export interface VerifyCallbackResult {
  success: boolean;
  orderNo?: string;
  tradeNo?: string;
  amount?: number;
  status?: PaymentStatus;
  error?: string;
}

// 退款参数
export interface RefundParams {
  orderNo: string;
  tradeNo: string;
  amount: number;
  reason?: string;
}

// 退款结果
export interface RefundResult {
  success: boolean;
  refundNo?: string;
  error?: string;
}

// 支付配置
export interface PaymentConfig {
  alipay: {
    appId: string;
    privateKey: string;
    publicKey: string;
    notifyUrl: string;
    gateway: string;
  };
  wechat: {
    appId: string;
    mchId: string;
    apiKey: string;
    notifyUrl: string;
    certPath?: string;
  };
}

// 支付服务接口
export interface PaymentProvider {
  // 创建支付订单
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  // 查询支付状态
  queryPayment(orderNo: string): Promise<QueryPaymentResult>;

  // 验证回调
  verifyCallback(params: Record<string, any>): Promise<VerifyCallbackResult>;

  // 退款
  refund(params: RefundParams): Promise<RefundResult>;
}
