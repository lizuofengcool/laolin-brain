import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateKeyPairSync,
  sign as cryptoSign,
  constants as cryptoConstants,
} from 'crypto';
import { AlipayProvider } from '@/lib/payment/alipay';

// Mock @/lib/payment/config —— AlipayProvider 构造时调用 getPaymentConfig()，
// 各方法内调用 isPaymentConfigured()。用 vi.hoisted 确保 mock 在 vi.mock 工厂
// 执行时（singleton alipayProvider 在 import 时即构造）已初始化，并提供默认返回值
// 避免 import 时单例构造触发 undefined.alipay。
const { mockGetPaymentConfig, mockIsPaymentConfigured } = vi.hoisted(() => {
  const mockGetPaymentConfig = vi.fn();
  const mockIsPaymentConfigured = vi.fn();
  mockGetPaymentConfig.mockReturnValue({
    alipay: { appId: '', privateKey: '', publicKey: '', notifyUrl: '', gateway: '' },
    wechat: { appId: '', mchId: '', apiKey: '', notifyUrl: '' },
  });
  return { mockGetPaymentConfig, mockIsPaymentConfigured };
});
vi.mock('@/lib/payment/config', () => ({
  getPaymentConfig: (...args: unknown[]) => mockGetPaymentConfig(...args),
  isPaymentConfigured: (...args: unknown[]) => mockIsPaymentConfigured(...args),
  getNotifyUrl: vi.fn(() => 'http://localhost/api/payment/callback/alipay'),
}));

const ALIPAY_CONFIG = {
  appId: 'alipay-app-id',
  privateKey: 'alipay-private-key',
  publicKey: 'alipay-public-key',
  notifyUrl: 'http://localhost/api/payment/callback/alipay',
  gateway: 'https://openapi.alipay.com/gateway.do',
};

const CREATE_PARAMS = {
  orderNo: 'ORD-123',
  amount: 9900, // 分
  subject: '测试商品',
  notifyUrl: 'http://localhost/callback',
  tenantId: 'tenant-1',
  userId: 'user-1',
};

describe('AlipayProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPaymentConfig.mockReturnValue({ alipay: ALIPAY_CONFIG, wechat: {} });
  });

  describe('模拟模式（未配置密钥）', () => {
    beforeEach(() => {
      mockIsPaymentConfigured.mockReturnValue(false);
    });

    it('createPayment 返回模拟支付页 URL 与 tradeNo', async () => {
      const provider = new AlipayProvider();
      const result = await provider.createPayment(CREATE_PARAMS);
      expect(result.success).toBe(true);
      expect(result.payUrl).toContain('/api/payment/mock/alipay');
      expect(result.payUrl).toContain('orderNo=ORD-123');
      expect(result.tradeNo).toMatch(/^ALIPAY/);
    });

    it('queryPayment 返回 pending', async () => {
      const provider = new AlipayProvider();
      const result = await provider.queryPayment('ORD-123');
      expect(result.success).toBe(true);
      expect(result.status).toBe('pending');
    });

    it('refund 返回模拟退款号', async () => {
      const provider = new AlipayProvider();
      const result = await provider.refund({ orderNo: 'ORD-123', tradeNo: 'T1', amount: 100 });
      expect(result.success).toBe(true);
      expect(result.refundNo).toMatch(/^REFUND/);
    });

    it('verifyCallback 校验 mock_sign 通过', async () => {
      const provider = new AlipayProvider();
      const orderNo = 'ORD-MOCK-1';
      const mockSign = provider.generateMockSign(orderNo);
      const result = await provider.verifyCallback({
        out_trade_no: orderNo,
        trade_no: 'T-MOCK',
        amount: '99.00',
        status: 'success',
        mock_sign: mockSign,
      });
      expect(result.success).toBe(true);
      expect(result.orderNo).toBe(orderNo);
      expect(result.tradeNo).toBe('T-MOCK');
      expect(result.status).toBe('paid');
    });

    it('verifyCallback 错误的 mock_sign 拒绝', async () => {
      const provider = new AlipayProvider();
      const result = await provider.verifyCallback({
        out_trade_no: 'ORD-MOCK-2',
        mock_sign: 'wrong-sign',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('模拟签名验证失败');
    });

    it('generateMockSign 确定性（同输入同输出）', () => {
      const provider = new AlipayProvider();
      expect(provider.generateMockSign('X')).toBe(provider.generateMockSign('X'));
      expect(provider.generateMockSign('X')).not.toBe(provider.generateMockSign('Y'));
    });

    it('mock 模式下 status 非 success 时返回 failed', async () => {
      const provider = new AlipayProvider();
      const orderNo = 'ORD-MOCK-FAIL';
      const result = await provider.verifyCallback({
        out_trade_no: orderNo,
        status: 'pending',
        mock_sign: provider.generateMockSign(orderNo),
      });
      expect(result.success).toBe(true);
      expect(result.status).toBe('failed');
    });
  });

  describe('已配置但未接入 SDK（真实模式占位）', () => {
    beforeEach(() => {
      mockIsPaymentConfigured.mockReturnValue(true);
    });

    it('createPayment 显式失败而非静默返回 mock 链接', async () => {
      const provider = new AlipayProvider();
      const result = await provider.createPayment(CREATE_PARAMS);
      expect(result.success).toBe(false);
      expect(result.error).toContain('尚未接入 SDK');
      expect(result.payUrl).toBeUndefined();
    });

    it('queryPayment 返回失败而非伪造 pending', async () => {
      const provider = new AlipayProvider();
      const result = await provider.queryPayment('ORD-123');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('refund 返回失败而非伪造退款号', async () => {
      const provider = new AlipayProvider();
      const result = await provider.refund({ orderNo: 'ORD-123', tradeNo: 'T1', amount: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('尚未接入 SDK');
    });
  });

  describe('RSA2 回调验签（真实模式）', () => {
    // 生成 RSA 密钥对用于端到端验签测试
    const { publicKey: pemPublicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const publicKeyPem = pemPublicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    // 单行 base64 公钥（模拟支付宝后台复制格式，不带 PEM 头尾）
    const singleLinePublicKey = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '');

    /**
     * 复刻 alipay.ts verifyCallback 的待签名字符串构造逻辑：
     * 去掉 sign/sign_type，按 key ASCII 排序，k=v 用 & 拼接。
     */
    function buildSignContent(params: Record<string, any>): string {
      const { sign, sign_type, ...rest } = params;
      return Object.keys(rest)
        .sort()
        .map((k) => `${k}=${rest[k]}`)
        .join('&');
    }

    function rsaSha256Sign(content: string): string {
      const s = cryptoSign('RSA-SHA256', Buffer.from(content, 'utf8'), {
        key: privateKeyPem,
        padding: cryptoConstants.RSA_PKCS1_PADDING,
      });
      return s.toString('base64');
    }

    beforeEach(() => {
      mockIsPaymentConfigured.mockReturnValue(true);
    });

    it('PEM 格式公钥：合法 RSA2 签名验签通过并提取订单信息', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: { ...ALIPAY_CONFIG, publicKey: publicKeyPem },
        wechat: {},
      });
      const provider = new AlipayProvider();

      const params: Record<string, any> = {
        out_trade_no: 'ORD-REAL-1',
        trade_no: '2024010100001',
        total_amount: '99.00',
        trade_status: 'TRADE_SUCCESS',
      };
      const sign = rsaSha256Sign(buildSignContent({ ...params }));
      const result = await provider.verifyCallback({ ...params, sign, sign_type: 'RSA2' });

      expect(result.success).toBe(true);
      expect(result.orderNo).toBe('ORD-REAL-1');
      expect(result.tradeNo).toBe('2024010100001');
      // 99.00 元 → 9900 分
      expect(result.amount).toBe(9900);
      expect(result.status).toBe('paid');
    });

    it('单行 base64 公钥（无 PEM 头尾）同样可验签（normalizePublicKey 生效）', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: { ...ALIPAY_CONFIG, publicKey: singleLinePublicKey },
        wechat: {},
      });
      const provider = new AlipayProvider();

      const params: Record<string, any> = {
        out_trade_no: 'ORD-REAL-2',
        trade_no: 'T2',
        total_amount: '0.01',
        trade_status: 'TRADE_FINISHED',
      };
      const sign = rsaSha256Sign(buildSignContent({ ...params }));
      const result = await provider.verifyCallback({ ...params, sign });
      expect(result.success).toBe(true);
      expect(result.status).toBe('paid');
    });

    it('签名被篡改时拒绝', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: { ...ALIPAY_CONFIG, publicKey: publicKeyPem },
        wechat: {},
      });
      const provider = new AlipayProvider();

      const params: Record<string, any> = {
        out_trade_no: 'ORD-TAMPER',
        trade_no: 'T3',
        total_amount: '1.00',
        trade_status: 'TRADE_SUCCESS',
      };
      // 对另一份内容签名 → 与实际待签名内容不匹配
      const wrongSign = rsaSha256Sign('out_trade_no=OTHER&total_amount=1.00');
      const result = await provider.verifyCallback({ ...params, sign: wrongSign });
      expect(result.success).toBe(false);
      expect(result.error).toContain('签名验证失败');
    });

    it('缺 sign 直接拒绝（非空即通过已废弃）', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: { ...ALIPAY_CONFIG, publicKey: publicKeyPem },
        wechat: {},
      });
      const provider = new AlipayProvider();
      const result = await provider.verifyCallback({
        out_trade_no: 'ORD-NOSIGN',
        trade_no: 'T4',
        total_amount: '1.00',
        trade_status: 'TRADE_SUCCESS',
      });
      expect(result.success).toBe(false);
    });

    it('缺 publicKey 配置时拒绝', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: { ...ALIPAY_CONFIG, publicKey: '' },
        wechat: {},
      });
      const provider = new AlipayProvider();
      const params: Record<string, any> = {
        out_trade_no: 'ORD-NOKEY',
        trade_no: 'T5',
        total_amount: '1.00',
        trade_status: 'TRADE_SUCCESS',
      };
      const sign = rsaSha256Sign(buildSignContent({ ...params }));
      const result = await provider.verifyCallback({ ...params, sign });
      expect(result.success).toBe(false);
    });

    it('trade_status 非 TRADE_SUCCESS/FINISHED 时 status=failed', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: { ...ALIPAY_CONFIG, publicKey: publicKeyPem },
        wechat: {},
      });
      const provider = new AlipayProvider();
      const params: Record<string, any> = {
        out_trade_no: 'ORD-WAIT',
        trade_no: 'T6',
        total_amount: '1.00',
        trade_status: 'WAIT_BUYER_PAY',
      };
      const sign = rsaSha256Sign(buildSignContent({ ...params }));
      const result = await provider.verifyCallback({ ...params, sign });
      expect(result.success).toBe(true);
      expect(result.status).toBe('failed');
    });

    it('无效的 publicKey 格式（非 PEM 非 base64）验签安全失败', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: { ...ALIPAY_CONFIG, publicKey: 'not-a-valid-key!!!' },
        wechat: {},
      });
      const provider = new AlipayProvider();
      const params: Record<string, any> = {
        out_trade_no: 'ORD-BADKEY',
        total_amount: '1.00',
      };
      const result = await provider.verifyCallback({ ...params, sign: 'some-sign' });
      expect(result.success).toBe(false);
    });
  });
});
