/**
 * payment/config 支付配置环境解析单测
 *
 * 覆盖目标：src/lib/payment/config.ts。该模块为纯 env 解析层（仅 import 类型，
 * 无运行时外部依赖），为支付安全链路（alipay/wechat 的 isPaymentConfigured 闸门、
 * getNotifyUrl 回调地址）提供配置。既有 payment-alipay.test.ts / payment-wechat.test.ts
 * / payment-index.test.ts 均以 vi.mock('@/lib/payment/config') 将其整体替换，故本模块
 * 真实 env 解析逻辑此前零覆盖。本测试通过 process.env 快照/恢复 + 显式设值，覆盖：
 *
 * - getPaymentConfig：逐字段读取 process.env；alipay 缺省 gateway 默认值；
 *   wechat certPath 无 `|| ''` 回退（unset→undefined / ''→''）；每次调用读取最新 env（不缓存）；
 *   每次返回全新对象（两次 !== 同引用，内层对象亦独立）
 * - isPaymentConfigured：alipay 仅看 appId&&privateKey&&publicKey 三件套；
 *   wechat 仅看 appId&&mchId&&apiKey 三件套；缺任一/全缺/显式空串均 false；
 *   notifyUrl/gateway/certPath 不参与判定
 * - getNotifyUrl：alipay/wechat 各自 notifyUrl 优先，未设/空串回退
 *   `${NEXT_PUBLIC_BASE_URL||''}/api/payment/callback/{alipay|wechat}`；env 变更即时反映
 *
 * 状态策略：beforeEach 快照全部相关 env key 并清空，afterEach 恢复，避免用例间污染。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getPaymentConfig,
  isPaymentConfigured,
  getNotifyUrl,
} from '@/lib/payment/config';

const ENV_KEYS = [
  'ALIPAY_APP_ID',
  'ALIPAY_PRIVATE_KEY',
  'ALIPAY_PUBLIC_KEY',
  'ALIPAY_NOTIFY_URL',
  'ALIPAY_GATEWAY',
  'WECHAT_APP_ID',
  'WECHAT_MCH_ID',
  'WECHAT_API_KEY',
  'WECHAT_NOTIFY_URL',
  'WECHAT_CERT_PATH',
  'NEXT_PUBLIC_BASE_URL',
] as const;

const snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

function setEnv(record: Record<string, string>): void {
  for (const [k, v] of Object.entries(record)) process.env[k] = v;
}

describe('payment/config getPaymentConfig', () => {
  it('空环境：alipay 全 "" 且 gateway 默认值，wechat 全 "" 且 certPath 为 undefined', () => {
    const cfg = getPaymentConfig();
    expect(cfg.alipay).toEqual({
      appId: '',
      privateKey: '',
      publicKey: '',
      notifyUrl: '',
      gateway: 'https://openapi.alipay.com/gateway.do',
    });
    expect(cfg.wechat).toEqual({
      appId: '',
      mchId: '',
      apiKey: '',
      notifyUrl: '',
      certPath: undefined,
    });
  });

  it('alipay 全字段设置（含自定义 gateway）反映到 config.alipay', () => {
    setEnv({
      ALIPAY_APP_ID: 'app-1',
      ALIPAY_PRIVATE_KEY: 'pk-1',
      ALIPAY_PUBLIC_KEY: 'pub-1',
      ALIPAY_NOTIFY_URL: 'https://cb/alipay',
      ALIPAY_GATEWAY: 'https://gw.custom/alipay',
    });
    expect(getPaymentConfig().alipay).toEqual({
      appId: 'app-1',
      privateKey: 'pk-1',
      publicKey: 'pub-1',
      notifyUrl: 'https://cb/alipay',
      gateway: 'https://gw.custom/alipay',
    });
  });

  it('ALIPAY_GATEWAY 未设置 → 默认 "https://openapi.alipay.com/gateway.do"', () => {
    setEnv({ ALIPAY_APP_ID: 'app-1' });
    expect(getPaymentConfig().alipay.gateway).toBe('https://openapi.alipay.com/gateway.do');
  });

  it('ALIPAY_GATEWAY 设为空串 → 回退默认（"" || default）', () => {
    setEnv({ ALIPAY_GATEWAY: '' });
    expect(getPaymentConfig().alipay.gateway).toBe('https://openapi.alipay.com/gateway.do');
  });

  it('wechat 全字段设置（含 certPath）反映到 config.wechat', () => {
    setEnv({
      WECHAT_APP_ID: 'wx-app',
      WECHAT_MCH_ID: 'mch-1',
      WECHAT_API_KEY: 'key-1',
      WECHAT_NOTIFY_URL: 'https://cb/wechat',
      WECHAT_CERT_PATH: '/etc/wechat/cert.pem',
    });
    expect(getPaymentConfig().wechat).toEqual({
      appId: 'wx-app',
      mchId: 'mch-1',
      apiKey: 'key-1',
      notifyUrl: 'https://cb/wechat',
      certPath: '/etc/wechat/cert.pem',
    });
  });

  it('WECHAT_CERT_PATH 未设置 → certPath 为 undefined（无 "|| \'\'" 回退）', () => {
    setEnv({ WECHAT_APP_ID: 'wx-app' });
    expect(getPaymentConfig().wechat.certPath).toBeUndefined();
  });

  it('WECHAT_CERT_PATH 设为空串 → certPath 为 ""（空串而非 undefined）', () => {
    setEnv({ WECHAT_CERT_PATH: '' });
    expect(getPaymentConfig().wechat.certPath).toBe('');
  });

  it('不缓存：每次调用读取最新 env（改 env 后结果变化）', () => {
    expect(getPaymentConfig().alipay.appId).toBe('');
    setEnv({ ALIPAY_APP_ID: 'changed' });
    expect(getPaymentConfig().alipay.appId).toBe('changed');
  });

  it('每次调用返回全新对象（两次 !== 同引用，内层对象亦独立，但值相等）', () => {
    const a = getPaymentConfig();
    const b = getPaymentConfig();
    expect(a).not.toBe(b);
    expect(a.alipay).not.toBe(b.alipay);
    expect(a.wechat).not.toBe(b.wechat);
    expect(a).toEqual(b);
  });
});

describe('payment/config isPaymentConfigured', () => {
  describe('alipay', () => {
    it('三件套齐全（appId/privateKey/publicKey）→ true', () => {
      setEnv({
        ALIPAY_APP_ID: 'app',
        ALIPAY_PRIVATE_KEY: 'pk',
        ALIPAY_PUBLIC_KEY: 'pub',
      });
      expect(isPaymentConfigured('alipay')).toBe(true);
    });

    it('缺 appId → false', () => {
      setEnv({ ALIPAY_PRIVATE_KEY: 'pk', ALIPAY_PUBLIC_KEY: 'pub' });
      expect(isPaymentConfigured('alipay')).toBe(false);
    });

    it('缺 privateKey → false', () => {
      setEnv({ ALIPAY_APP_ID: 'app', ALIPAY_PUBLIC_KEY: 'pub' });
      expect(isPaymentConfigured('alipay')).toBe(false);
    });

    it('缺 publicKey → false', () => {
      setEnv({ ALIPAY_APP_ID: 'app', ALIPAY_PRIVATE_KEY: 'pk' });
      expect(isPaymentConfigured('alipay')).toBe(false);
    });

    it('全缺 → false', () => {
      expect(isPaymentConfigured('alipay')).toBe(false);
    });

    it('仅 notifyUrl/gateway 齐全但缺三件套 → false（只看三件套）', () => {
      setEnv({
        ALIPAY_NOTIFY_URL: 'https://cb/alipay',
        ALIPAY_GATEWAY: 'https://gw',
      });
      expect(isPaymentConfigured('alipay')).toBe(false);
    });

    it('三件套显式空串 → false（"" falsy）', () => {
      setEnv({
        ALIPAY_APP_ID: '',
        ALIPAY_PRIVATE_KEY: '',
        ALIPAY_PUBLIC_KEY: '',
      });
      expect(isPaymentConfigured('alipay')).toBe(false);
    });
  });

  describe('wechat', () => {
    it('三件套齐全（appId/mchId/apiKey）→ true', () => {
      setEnv({
        WECHAT_APP_ID: 'wx',
        WECHAT_MCH_ID: 'mch',
        WECHAT_API_KEY: 'key',
      });
      expect(isPaymentConfigured('wechat')).toBe(true);
    });

    it('缺 appId → false', () => {
      setEnv({ WECHAT_MCH_ID: 'mch', WECHAT_API_KEY: 'key' });
      expect(isPaymentConfigured('wechat')).toBe(false);
    });

    it('缺 mchId → false', () => {
      setEnv({ WECHAT_APP_ID: 'wx', WECHAT_API_KEY: 'key' });
      expect(isPaymentConfigured('wechat')).toBe(false);
    });

    it('缺 apiKey → false', () => {
      setEnv({ WECHAT_APP_ID: 'wx', WECHAT_MCH_ID: 'mch' });
      expect(isPaymentConfigured('wechat')).toBe(false);
    });

    it('全缺 → false', () => {
      expect(isPaymentConfigured('wechat')).toBe(false);
    });

    it('仅 notifyUrl/certPath 齐全但缺三件套 → false（只看三件套）', () => {
      setEnv({
        WECHAT_NOTIFY_URL: 'https://cb/wechat',
        WECHAT_CERT_PATH: '/certs/wx.pem',
      });
      expect(isPaymentConfigured('wechat')).toBe(false);
    });
  });
});

describe('payment/config getNotifyUrl', () => {
  describe('alipay', () => {
    it('ALIPAY_NOTIFY_URL 设置 → 直接返回', () => {
      setEnv({ ALIPAY_NOTIFY_URL: 'https://cb/alipay' });
      expect(getNotifyUrl('alipay')).toBe('https://cb/alipay');
    });

    it('notifyUrl 未设置、NEXT_PUBLIC_BASE_URL 设置 → `${base}/api/payment/callback/alipay`', () => {
      setEnv({ NEXT_PUBLIC_BASE_URL: 'https://app.example.com' });
      expect(getNotifyUrl('alipay')).toBe(
        'https://app.example.com/api/payment/callback/alipay'
      );
    });

    it('两者均未设置 → "/api/payment/callback/alipay"', () => {
      expect(getNotifyUrl('alipay')).toBe('/api/payment/callback/alipay');
    });

    it('notifyUrl 设为空串 → 回退 base 路径（"" || fallback）', () => {
      setEnv({
        ALIPAY_NOTIFY_URL: '',
        NEXT_PUBLIC_BASE_URL: 'https://app.example.com',
      });
      expect(getNotifyUrl('alipay')).toBe(
        'https://app.example.com/api/payment/callback/alipay'
      );
    });
  });

  describe('wechat', () => {
    it('WECHAT_NOTIFY_URL 设置 → 直接返回', () => {
      setEnv({ WECHAT_NOTIFY_URL: 'https://cb/wechat' });
      expect(getNotifyUrl('wechat')).toBe('https://cb/wechat');
    });

    it('notifyUrl 未设置、base 设置 → `${base}/api/payment/callback/wechat`', () => {
      setEnv({ NEXT_PUBLIC_BASE_URL: 'https://app.example.com' });
      expect(getNotifyUrl('wechat')).toBe(
        'https://app.example.com/api/payment/callback/wechat'
      );
    });

    it('两者均未设置 → "/api/payment/callback/wechat"', () => {
      expect(getNotifyUrl('wechat')).toBe('/api/payment/callback/wechat');
    });
  });

  it('env 变更即时反映（不缓存）', () => {
    expect(getNotifyUrl('alipay')).toBe('/api/payment/callback/alipay');
    setEnv({ ALIPAY_NOTIFY_URL: 'https://new/alipay' });
    expect(getNotifyUrl('alipay')).toBe('https://new/alipay');
  });
});
