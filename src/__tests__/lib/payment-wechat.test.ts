import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac, createCipheriv } from 'crypto';
import { WechatPayProvider } from '@/lib/payment/wechat';

// Mock @/lib/payment/config —— WechatPayProvider 构造时调用 getPaymentConfig()，
// 各方法内调用 isPaymentConfigured()。用 vi.hoisted 确保 mock 在 vi.mock 工厂
// 执行时（singleton wechatPayProvider 在 import 时即构造）已初始化，并提供默认返回值
// 避免 import 时单例构造触发 undefined.wechat。
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
  getNotifyUrl: vi.fn(() => 'http://localhost/api/payment/callback/wechat'),
}));

const WECHAT_CONFIG = {
  appId: 'wx-app-id',
  mchId: 'wx-mch-id',
  apiKey: '01234567890123456789012345678901', // 32 字节（APIv3 密钥）
  notifyUrl: 'http://localhost/api/payment/callback/wechat',
};

const CREATE_PARAMS = {
  orderNo: 'ORD-123',
  amount: 9900,
  subject: '测试商品',
  notifyUrl: 'http://localhost/callback',
  tenantId: 'tenant-1',
  userId: 'user-1',
};

describe('WechatPayProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPaymentConfig.mockReturnValue({ alipay: {}, wechat: WECHAT_CONFIG });
  });

  describe('模拟模式（未配置密钥）', () => {
    beforeEach(() => {
      mockIsPaymentConfigured.mockReturnValue(false);
    });

    it('createPayment 返回模拟支付页 URL、tradeNo 与 qrCode', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.createPayment(CREATE_PARAMS);
      expect(result.success).toBe(true);
      expect(result.payUrl).toContain('/api/payment/mock/wechat');
      expect(result.tradeNo).toMatch(/^WECHAT/);
      expect(result.qrCode).toContain('data:image/svg+xml;base64');
    });

    it('queryPayment 返回 pending', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.queryPayment('ORD-123');
      expect(result.success).toBe(true);
      expect(result.status).toBe('pending');
    });

    it('refund 返回模拟退款号', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.refund({ orderNo: 'ORD-123', tradeNo: 'T1', amount: 100 });
      expect(result.success).toBe(true);
      expect(result.refundNo).toMatch(/^REFUND/);
    });

    it('verifyCallback 校验 mock_sign 通过', async () => {
      const provider = new WechatPayProvider();
      const orderNo = 'ORD-MOCK-1';
      const mockSign = provider.generateMockSign(orderNo);
      const result = await provider.verifyCallback({
        out_trade_no: orderNo,
        trade_no: 'T-MOCK',
        amount: '9900',
        status: 'success',
        mock_sign: mockSign,
      });
      expect(result.success).toBe(true);
      expect(result.orderNo).toBe(orderNo);
      expect(result.tradeNo).toBe('T-MOCK');
      expect(result.status).toBe('paid');
    });

    it('verifyCallback 错误的 mock_sign 拒绝', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.verifyCallback({
        out_trade_no: 'ORD-MOCK-2',
        mock_sign: 'wrong-sign',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('模拟签名验证失败');
    });

    it('generateMockSign 确定性', () => {
      const provider = new WechatPayProvider();
      expect(provider.generateMockSign('X')).toBe(provider.generateMockSign('X'));
      expect(provider.generateMockSign('X')).not.toBe(provider.generateMockSign('Y'));
    });
  });

  describe('已配置但未接入 SDK（真实模式占位）', () => {
    beforeEach(() => {
      mockIsPaymentConfigured.mockReturnValue(true);
    });

    it('createPayment 显式失败而非静默返回 mock 链接', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.createPayment(CREATE_PARAMS);
      expect(result.success).toBe(false);
      expect(result.error).toContain('尚未接入 SDK');
      expect(result.payUrl).toBeUndefined();
    });

    it('queryPayment 返回失败而非伪造 pending', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.queryPayment('ORD-123');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('refund 返回失败而非伪造退款号', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.refund({ orderNo: 'ORD-123', tradeNo: 'T1', amount: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('尚未接入 SDK');
    });
  });

  describe('V3 回调验签（真实模式）', () => {
    function hmacSha256Hex(key: string, content: string): string {
      return createHmac('sha256', key).update(content, 'utf8').digest('hex');
    }

    /**
     * AES-256-GCM 加密，复刻 wechat.ts decryptResource 的逆操作：
     * 输出 base64(ciphertext + authTag)，供 resource.ciphertext 使用。
     */
    function aesGcmEncrypt(
      key: string,
      nonce: string,
      associatedData: string,
      plaintext: string,
    ): string {
      const keyBuf = Buffer.from(key, 'utf-8');
      const iv = Buffer.from(nonce, 'utf-8');
      const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
      if (associatedData) cipher.setAAD(Buffer.from(associatedData, 'utf-8'));
      const enc = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([enc, tag]).toString('base64');
    }

    beforeEach(() => {
      mockIsPaymentConfigured.mockReturnValue(true);
    });

    it('合法 V3 HMAC 签名 + 明文 resource 兼容路径：验签通过并提取订单', async () => {
      const provider = new WechatPayProvider();
      const timestamp = '1700000000';
      const nonce = 'nonce-abc';
      const body = '{"foo":"bar"}';
      const sign = hmacSha256Hex(WECHAT_CONFIG.apiKey, `${timestamp}\n${nonce}\n${body}\n`);

      const result = await provider.verifyCallback({
        sign,
        timestamp,
        nonce,
        body,
        // 兼容路径：resource 为明文对象（无 ciphertext）
        resource: {
          out_trade_no: 'ORD-WX-1',
          transaction_id: '4200000000-2024',
          amount: { total: 9900 },
          trade_state: 'SUCCESS',
        },
      });

      expect(result.success).toBe(true);
      expect(result.orderNo).toBe('ORD-WX-1');
      expect(result.tradeNo).toBe('4200000000-2024');
      expect(result.amount).toBe(9900);
      expect(result.status).toBe('paid');
    });

    it('trade_state 非 SUCCESS 时 status=failed', async () => {
      const provider = new WechatPayProvider();
      const timestamp = '1700000001';
      const nonce = 'nonce-def';
      const body = '{}';
      const sign = hmacSha256Hex(WECHAT_CONFIG.apiKey, `${timestamp}\n${nonce}\n${body}\n`);

      const result = await provider.verifyCallback({
        sign,
        timestamp,
        nonce,
        body,
        resource: {
          out_trade_no: 'ORD-WX-2',
          amount: { total: 100 },
          trade_state: 'NOTPAY',
        },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('failed');
    });

    it('签名被篡改时拒绝', async () => {
      const provider = new WechatPayProvider();
      const result = await provider.verifyCallback({
        sign: 'deadbeef'.repeat(8),
        timestamp: '1700000002',
        nonce: 'nonce-x',
        body: '{"a":1}',
        resource: { out_trade_no: 'ORD-TAMPER', trade_state: 'SUCCESS' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('签名验证失败');
    });

    it('缺 timestamp/nonce/body/signature 任一字段直接拒绝（非空即通过已废弃）', async () => {
      const provider = new WechatPayProvider();
      // 缺 sign 与 signature
      const r1 = await provider.verifyCallback({
        timestamp: '1700000003',
        nonce: 'n',
        body: '{}',
        resource: { out_trade_no: 'O1', trade_state: 'SUCCESS' },
      });
      expect(r1.success).toBe(false);

      // 缺 body
      const r2 = await provider.verifyCallback({
        sign: 'aabb',
        timestamp: '1700000004',
        nonce: 'n',
        resource: { out_trade_no: 'O2', trade_state: 'SUCCESS' },
      });
      expect(r2.success).toBe(false);

      // 缺 timestamp
      const r3 = await provider.verifyCallback({
        sign: 'aabb',
        nonce: 'n',
        body: '{}',
        resource: { out_trade_no: 'O3', trade_state: 'SUCCESS' },
      });
      expect(r3.success).toBe(false);
    });

    it('缺 apiKey 配置时拒绝', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: {},
        wechat: { ...WECHAT_CONFIG, apiKey: '' },
      });
      const provider = new WechatPayProvider();
      const result = await provider.verifyCallback({
        sign: 'aabb',
        timestamp: '1700000005',
        nonce: 'n',
        body: '{}',
        resource: { out_trade_no: 'O', trade_state: 'SUCCESS' },
      });
      expect(result.success).toBe(false);
    });

    it('签名长度不一致时安全拒绝（恒定时间比较前置 length 检查）', async () => {
      const provider = new WechatPayProvider();
      // 真实签名为 64 位 hex；传一个短签名 → length 不一致应直接 false
      const result = await provider.verifyCallback({
        sign: 'short',
        timestamp: '1700000006',
        nonce: 'n',
        body: '{}',
        resource: { out_trade_no: 'O', trade_state: 'SUCCESS' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('签名验证失败');
    });

    it('V3 加密 resource：合法 AES-256-GCM 解密成功并提取订单', async () => {
      const provider = new WechatPayProvider();
      const timestamp = '1700000010';
      const nonce = 'nonce-enc';
      const body = '{"resource":{}}';
      const sign = hmacSha256Hex(WECHAT_CONFIG.apiKey, `${timestamp}\n${nonce}\n${body}\n`);

      const plaintext = JSON.stringify({
        out_trade_no: 'ORD-ENC-1',
        transaction_id: '4200-ENC-1',
        amount: { total: 199 },
        trade_state: 'SUCCESS',
      });
      const ciphertext = aesGcmEncrypt(WECHAT_CONFIG.apiKey, nonce, 'transaction', plaintext);

      const result = await provider.verifyCallback({
        sign,
        timestamp,
        nonce,
        body,
        resource: {
          ciphertext,
          nonce,
          associated_data: 'transaction',
        },
      });

      expect(result.success).toBe(true);
      expect(result.orderNo).toBe('ORD-ENC-1');
      expect(result.tradeNo).toBe('4200-ENC-1');
      expect(result.amount).toBe(199);
      expect(result.status).toBe('paid');
    });

    it('V3 加密 resource：错误的 apiKey（解密失败）拒绝', async () => {
      // provider 用 WECHAT_CONFIG.apiKey 解密，但 resource 用另一个密钥加密 → GCM auth 必然失败
      const provider = new WechatPayProvider();

      const timestamp = '1700000011';
      const nonce = 'nonce-bad';
      const body = '{}';
      const sign = hmacSha256Hex(WECHAT_CONFIG.apiKey, `${timestamp}\n${nonce}\n${body}\n`);

      // 用另一个密钥加密 resource
      const otherKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const ciphertext = aesGcmEncrypt(otherKey, nonce, '', JSON.stringify({ out_trade_no: 'X' }));

      const result = await provider.verifyCallback({
        sign,
        timestamp,
        nonce,
        body,
        resource: { ciphertext, nonce, associated_data: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('resource 解密失败');
    });

    it('V3 加密 resource：ciphertext 被篡改（GCM auth tag 校验失败）拒绝', async () => {
      const provider = new WechatPayProvider();
      const timestamp = '1700000012';
      const nonce = 'nonce-tamper';
      const body = '{}';
      const sign = hmacSha256Hex(WECHAT_CONFIG.apiKey, `${timestamp}\n${nonce}\n${body}\n`);

      const ciphertext = aesGcmEncrypt(
        WECHAT_CONFIG.apiKey,
        nonce,
        '',
        JSON.stringify({ out_trade_no: 'ORD', trade_state: 'SUCCESS' }),
      );
      // 翻转首字节 → GCM 必然校验失败
      const buf = Buffer.from(ciphertext, 'base64');
      buf[0] = buf[0] ^ 0xff;
      const tampered = buf.toString('base64');

      const result = await provider.verifyCallback({
        sign,
        timestamp,
        nonce,
        body,
        resource: { ciphertext: tampered, nonce, associated_data: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('resource 解密失败');
    });

    it('V3 加密 resource：apiKey 非 32 字节时拒绝', async () => {
      mockGetPaymentConfig.mockReturnValue({
        alipay: {},
        wechat: { ...WECHAT_CONFIG, apiKey: 'too-short' },
      });
      const provider = new WechatPayProvider();
      const timestamp = '1700000013';
      const nonce = 'n';
      const body = '{}';
      const sign = 'aabb'; // 签名也会因 apiKey 变化失败，但 resource 解密更早暴露长度问题
      const result = await provider.verifyCallback({
        sign,
        timestamp,
        nonce,
        body,
        resource: { ciphertext: 'AAAA', nonce, associated_data: '' },
      });
      expect(result.success).toBe(false);
    });
  });
});
