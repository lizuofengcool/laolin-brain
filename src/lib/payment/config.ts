/**
 * 支付配置管理
 * 从环境变量读取支付配置
 */
import { PaymentConfig } from './types';

// 获取支付配置
export function getPaymentConfig(): PaymentConfig {
  return {
    alipay: {
      appId: process.env.ALIPAY_APP_ID || '',
      privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
      publicKey: process.env.ALIPAY_PUBLIC_KEY || '',
      notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
      gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
    },
    wechat: {
      appId: process.env.WECHAT_APP_ID || '',
      mchId: process.env.WECHAT_MCH_ID || '',
      apiKey: process.env.WECHAT_API_KEY || '',
      notifyUrl: process.env.WECHAT_NOTIFY_URL || '',
      certPath: process.env.WECHAT_CERT_PATH,
    },
  };
}

// 检查支付配置是否完整
export function isPaymentConfigured(payMethod: 'alipay' | 'wechat'): boolean {
  const config = getPaymentConfig();
  if (payMethod === 'alipay') {
    return !!(config.alipay.appId && config.alipay.privateKey && config.alipay.publicKey);
  } else {
    return !!(config.wechat.appId && config.wechat.mchId && config.wechat.apiKey);
  }
}

// 获取回调URL
export function getNotifyUrl(payMethod: 'alipay' | 'wechat'): string {
  const config = getPaymentConfig();
  if (payMethod === 'alipay') {
    return config.alipay.notifyUrl || `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/payment/callback/alipay`;
  } else {
    return config.wechat.notifyUrl || `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/payment/callback/wechat`;
  }
}
